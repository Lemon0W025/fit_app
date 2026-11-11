// 亲友看板（准时打卡设计第四块）：邀请码、关注关系、看板、点赞、过了饭点没拍告诉亲友、谁能看谁
const test = require('node:test')
const assert = require('node:assert/strict')
const F = require('../cloudfunctions/api/lib/family')
const { createFamilyService } = require('../cloudfunctions/api/services/family')
const { createRemindService } = require('../cloudfunctions/api/services/remind')
const { createFakeRepo, PROFILE, analysisJson } = require('./helpers/fake-repo')
const { createFakeCloud, loadCloudFunction } = require('./helpers/fake-cloud')
const { fixDate } = require('./helpers/fixed-date')

const TIMES = { breakfast: '07:30', lunch: '12:00', dinner: '18:00' }
const at = (hhmm, day = '2026-11-10') => new Date(`${day}T${hhmm}:00+08:00`)
const TEMPLATE = { id: 'tmpl-1', state: 'trial', fields: { meal: 'thing1', mealTime: 'time2', tip: 'thing3' } }
const DAY = 24 * 60 * 60 * 1000

test('邀请码：10 位、不带容易看错的字符、每次不一样；称呼去空白、最多 12 个字、没填是「亲友」', () => {
  const codes = new Set()
  for (let i = 0; i < 200; i++) {
    const code = F.newCode()
    assert.match(code, /^[A-HJ-NP-Z2-9]{10}$/)
    assert.ok(F.isCode(code))
    codes.add(code)
  }
  assert.equal(codes.size, 200)
  assert.equal(F.newCode(Buffer.from([0, 1, 2, 3, 4, 5, 6, 7, 8, 9])), 'ABCDEFGHJK')
  for (const bad of ['', 'abc', 'ABCDEFGHJ0', 'ABCDEFGHJKL', null, 123, { $ne: 1 }]) assert.equal(F.isCode(bad), false)

  assert.equal(F.cleanName('  小明 \n'), '小明')
  assert.equal(F.cleanName(''), '亲友')
  assert.equal(F.cleanName(null, ' 老王 '), '老王')
  assert.equal(F.cleanName('一二三四五六七八九十一二三四五'), '一二三四五六七八九十一二')
})

test('planFamilyAlerts：过了准时窗口（饭点 + 1 小时）、之后一小时以内，这顿还没拍、今天没告诉过才告诉', () => {
  const plan = (hhmm, meals = [], sent = {}) => F.planFamilyAlerts({ times: TIMES, meals, now: at(hhmm), sent })
  // 13:00 还算准时，过了才告诉；14:00 之后不补
  assert.deepEqual(plan('12:30'), [])
  assert.deepEqual(plan('13:00'), [])
  assert.deepEqual(plan('13:01'), ['lunch'])
  assert.deepEqual(plan('14:00'), ['lunch'])
  assert.deepEqual(plan('14:01'), [])
  assert.deepEqual(plan('08:40'), ['breakfast'])
  assert.deepEqual(plan('19:10'), ['dinner'])
  // 拍过了（什么时候拍的都算）不告诉；加餐不算拍了午饭
  assert.deepEqual(plan('13:10', [{ mealType: 'lunch', timing: 'late' }]), [])
  assert.deepEqual(plan('13:10', [{ mealType: 'snack', timing: null }]), ['lunch'])
  // 今天这顿告诉过了
  assert.deepEqual(plan('13:20', [], { '2026-11-10': { lunch: 1 } }), [])
  assert.deepEqual(plan('13:20', [], { '2026-11-09': { lunch: 1 } }), ['lunch'])
  // 改过的饭点
  assert.deepEqual(F.planFamilyAlerts({ times: { ...TIMES, lunch: '11:30' }, meals: [], now: at('12:40'), sent: {} }), ['lunch'])
})

test('alertMessage：「小明的午饭还没拍」不超过 20 个字（名字太长截掉），按模板有的字段填；addLike 一个人只能赞一次', () => {
  assert.deepEqual(F.alertMessage(TEMPLATE, '小明', 'lunch', TIMES, at('13:10')), {
    thing1: { value: '小明的午饭还没拍' },
    time2: { value: '2026-11-10 12:00' },
    thing3: { value: '提醒 TA 一下吧' },
  })
  assert.equal(F.alertTitle('', 'dinner'), '亲友的晚饭还没拍')
  const long = F.alertTitle('一二三四五六七八九十一二三四五六七八九十', 'breakfast')
  assert.ok(long.length <= 20, long)
  assert.match(long, /的早饭还没拍$/)
  assert.deepEqual(F.alertMessage({ fields: { status: 'phrase1', endTime: 'time4', name: 'thing5' } }, '小明', 'breakfast', TIMES, at('08:40')), {
    phrase1: { value: '还没拍' },
    time4: { value: '2026-11-10 08:30' },
    thing5: { value: '小暖自律打卡' },
  })

  const one = F.addLike(undefined, 'v1', '小红', 5)
  assert.deepEqual(one, [{ openid: 'v1', name: '小红', at: 5 }])
  assert.equal(F.addLike(one, 'v1', '小红', 6), null)
  assert.equal(F.addLike(one, 'v2', '', 7).length, 2)
  assert.equal(F.addLike(one, 'v2', '', 7)[1].name, '亲友')
})

// 一个被看的人 me（建了档）、亲友 v1 / v2（v2 没建档）
function setup({ now = at('12:40'), template = TEMPLATE, sendError = null } = {}) {
  const repo = createFakeRepo()
  repo.state.profiles.set('me', { ...PROFILE, nickname: '小明' })
  repo.state.profiles.set('v1', { ...PROFILE, nickname: '小红' })
  const messages = []
  const clock = { now }
  const failing = { error: sendError }
  const service = createFamilyService({
    repo,
    now: () => clock.now,
    template: async () => template,
    send: async (msg) => {
      if (failing.error) throw failing.error
      messages.push(msg)
    },
    photoUrls: async (ids) => Object.fromEntries(ids.map((id) => [id, `https://tmp/${id}`])),
  })
  return { repo, service, messages, clock, failing }
}

function addMeal(repo, openid, mealType, hhmm, extra = {}) {
  const createdAt = at(hhmm).getTime()
  return repo.addMeal({
    _openid: openid,
    date: '2026-11-10',
    mealType,
    createdAt,
    status: 'done',
    mode: 'photo',
    fileID: `cloud://env/meals/${mealType}.jpg`,
    note: '只给自己看的备注',
    timing: 'on',
    analysis: JSON.parse(analysisJson({ comment: '搭配得不错' })),
    ...extra,
  })
}

test('family.invite：建了档才有邀请码；没过期的接着用，快过期的换新的；从邀请码看不出是谁', async () => {
  const { repo, service, clock } = setup()
  await assert.rejects(service.invite('v2'), { code: 'NO_PROFILE' })
  const first = await service.invite('me')
  assert.ok(F.isCode(first.code))
  assert.equal(first.path, `/pages/family/family?code=${first.code}`)
  assert.ok(!first.code.includes('me'))
  assert.equal((await service.invite('me')).code, first.code)
  const doc = repo.state.invites.get(first.code)
  assert.equal(doc.owner, 'me')
  assert.equal(doc.expiresAt - doc.createdAt, 7 * DAY)

  // 还剩不到两天：换一个新的，旧的到期前还能用
  clock.now = new Date(at('12:40').getTime() + 5.5 * DAY)
  const second = await service.invite('me')
  assert.notEqual(second.code, first.code)
  assert.equal((await service.accept('v1', { code: first.code })).owner, 'me')
  // 旧的过期了：不认，下次要邀请码时顺手删掉
  clock.now = new Date(at('12:40').getTime() + 8 * DAY)
  await assert.rejects(service.accept('v2', { code: first.code }), { code: 'NOT_FOUND', message: /邀请过期了/ })
  await service.invite('me')
  assert.equal(repo.state.invites.has(first.code), false)
})

test('family.accept：建立关注关系，重复点不重复建；不能关注自己；乱填的码说过期；称呼默认「亲友」', async () => {
  const { repo, service } = setup()
  const { code } = await service.invite('me')
  // 没建档的亲友也能看
  assert.deepEqual(await service.accept('v2', { code }), { owner: 'me', name: '小明', already: false })
  assert.deepEqual(repo.state.follows.get('v2_me'), { viewer: 'v2', owner: 'me', name: '亲友', notify: false, sent: {}, createdAt: at('12:40').getTime() })
  // 建了档的默认用档案里的称呼，填了用填的
  await service.accept('v1', { code })
  assert.equal(repo.state.follows.get('v1_me').name, '小红')
  assert.deepEqual(await service.accept('v1', { code, name: ' 红红 ' }), { owner: 'me', name: '小明', already: true })
  assert.equal(repo.state.follows.get('v1_me').name, '红红')
  // 再点一次、不填称呼：还是原来的，关系只有一条，开关不动
  repo.state.follows.get('v1_me').notify = true
  await service.accept('v1', { code })
  assert.equal(repo.state.follows.get('v1_me').name, '红红')
  assert.equal(repo.state.follows.get('v1_me').notify, true)
  assert.equal(repo.state.follows.size, 2)

  await assert.rejects(service.accept('me', { code }), { code: 'BAD_REQUEST', message: /你自己发出去的邀请/ })
  for (const bad of [undefined, '', 'ABCDEFGHJK', { $ne: '' }]) {
    await assert.rejects(service.accept('v1', { code: bad }), { code: 'NOT_FOUND', message: /邀请过期了/ })
  }
})

test('family.accept：一个人最多 20 位亲友', async () => {
  const { repo, service } = setup()
  const { code } = await service.invite('me')
  for (let i = 0; i < 20; i++) await service.accept(`f${i}`, { code })
  await assert.rejects(service.accept('v1', { code }), { code: 'BAD_REQUEST', message: /满了/ })
  // 已经在里面的再点不受影响
  assert.equal((await service.accept('f3', { code })).already, true)
  assert.equal(repo.state.follows.size, 20)
})

test('family.get：我关注的每一位今天的印章、连续天数、最近 7 天准时几顿、每一顿（照片是临时链接，不带备注和别人的账号）', async () => {
  const { repo, service } = setup({ now: at('19:30') })
  const { code } = await service.invite('me')
  await service.accept('v1', { code })
  // 没人打卡
  let board = await service.get('v1')
  assert.equal(board.date, '2026-11-10')
  assert.equal(board.templateId, 'tmpl-1')
  assert.equal(board.credits, 0)
  assert.equal(board.invite, null)
  assert.equal(board.people.length, 1)
  assert.equal(board.people[0].name, '小明')
  assert.deepEqual(board.people[0].meals, [])
  assert.deepEqual(board.people[0].stamps.map((s) => s.state), ['none', 'none', 'none'])
  assert.equal(board.people[0].streak, 0)

  const lunch = await addMeal(repo, 'me', 'lunch', '12:10')
  await addMeal(repo, 'me', 'dinner', '19:20', { timing: 'late', fileID: '', mode: 'text' })
  // 前几天的：昨天准时一顿，8 天前的不算进最近 7 天
  await repo.addMeal({ _openid: 'me', date: '2026-11-09', mealType: 'breakfast', createdAt: 1, status: 'done', timing: 'on', analysis: JSON.parse(analysisJson()) })
  await repo.addMeal({ _openid: 'me', date: '2026-11-02', mealType: 'breakfast', createdAt: 1, status: 'done', timing: 'on', analysis: JSON.parse(analysisJson()) })
  repo.state.gardens.set('me', { camp: 4, days: { '2026-11-08': true, '2026-11-09': true, '2026-11-10': true } })
  repo.state.reminders.set('v1', { notify: false, credits: 2 })
  // 别人给这顿点过赞
  await repo.setMealLikes(lunch, [{ openid: 'someone', name: '老王', at: 1 }])

  board = await service.get('v1')
  const p = board.people[0]
  assert.equal(board.credits, 2)
  assert.equal(p.owner, 'me')
  assert.equal(p.streak, 3)
  assert.equal(p.weekOnTime, 2)
  assert.equal(p.notify, false)
  assert.deepEqual(p.stamps.map((s) => [s.mealType, s.state !== 'none', s.onTime]), [['breakfast', false, false], ['lunch', true, true], ['dinner', true, false]])
  assert.equal(p.meals.length, 2)
  assert.deepEqual(Object.keys(p.meals[0]).sort(), ['_id', 'analysis', 'createdAt', 'date', 'liked', 'likeNames', 'mealType', 'mode', 'people', 'photoUrl', 'status', 'timing'].sort())
  assert.equal(p.meals[0]._id, lunch)
  assert.equal(p.meals[0].photoUrl, 'https://tmp/cloud://env/meals/lunch.jpg')
  assert.equal(p.meals[0].analysis.comment, '搭配得不错')
  assert.equal(p.meals[0].liked, false)
  assert.deepEqual(p.meals[0].likeNames, ['老王'])
  assert.equal(p.meals[1].photoUrl, '')
  assert.ok(!JSON.stringify(board).includes('只给自己看的备注'))
  assert.ok(!JSON.stringify(board).includes('someone'))

  // 没关注任何人的：空的
  assert.deepEqual((await service.get('v2')).people, [])
  // 照片换不到链接：先不显示照片，别的照样看
  const broken = createFamilyService({ repo, now: () => at('19:30'), photoUrls: async () => { throw new Error('boom') } })
  const again = await broken.get('v1')
  assert.equal(again.people[0].meals[0].photoUrl, '')
  assert.equal(again.templateId, '')
})

test('family.get 带邀请码：说这张邀请是谁的；自己的、过期的、已经关注的各有说法（看一眼不建立关系）', async () => {
  const { repo, service } = setup()
  const { code } = await service.invite('me')
  assert.deepEqual((await service.get('v1', { code })).invite, { ok: true, mine: false, name: '小明', already: false })
  assert.equal(repo.state.follows.size, 0)
  const mine = (await service.get('me', { code })).invite
  assert.equal(mine.ok, false)
  assert.equal(mine.mine, true)
  assert.match(mine.message, /你自己发出去的邀请/)
  assert.deepEqual((await service.get('v1', { code: 'ZZZZZZZZZZ' })).invite, { ok: false, mine: false, message: '邀请过期了，让 TA 再发一次' })
  await service.accept('v1', { code })
  assert.equal((await service.get('v1', { code })).invite.already, true)
})

test('谁能看谁：没有关注关系的看不到、赞不了、开不了提醒；移除 / 不看了之后马上看不到', async () => {
  const { repo, service } = setup()
  const { code } = await service.invite('me')
  const lunch = await addMeal(repo, 'me', 'lunch', '12:10')
  // v1 没接受邀请：看板里没有 me，直接拿 me 的打卡去赞也不行
  assert.deepEqual((await service.get('v1')).people, [])
  await assert.rejects(service.like('v1', { owner: 'me', mealId: lunch }), { code: 'FORBIDDEN' })
  await assert.rejects(service.setNotify('v1', { owner: 'me', on: true }), { code: 'FORBIDDEN' })
  await assert.rejects(service.like('v1', { mealId: lunch }), { code: 'FORBIDDEN' })
  await assert.rejects(service.like('v1', { owner: { $ne: '' }, mealId: lunch }), { code: 'FORBIDDEN' })
  // 自己不算自己的亲友
  await assert.rejects(service.like('me', { owner: 'me', mealId: lunch }), { code: 'FORBIDDEN' })

  await service.accept('v1', { code })
  assert.equal((await service.get('v1')).people[0].meals.length, 1)
  // 关注了 me，也只能赞 me 的打卡：别人（v2）的打卡 id 拿来不认
  repo.state.profiles.set('v2', { ...PROFILE, nickname: '小刚' })
  const other = await addMeal(repo, 'v2', 'lunch', '12:20')
  await assert.rejects(service.like('v1', { owner: 'me', mealId: other }), { code: 'NOT_FOUND' })
  await assert.rejects(service.like('v1', { owner: 'v2', mealId: other }), { code: 'FORBIDDEN' })
  // 关系是单向的：me 看不到 v1 的
  assert.deepEqual((await service.get('me')).people, [])

  // me 把 v1 移除：v1 看不到了，旧邀请也作废，「我的」里换了新的邀请码
  const mine = await service.remove('me', { viewer: 'v1' })
  assert.deepEqual(mine.viewers, [])
  assert.notEqual(mine.code, code)
  assert.deepEqual((await service.get('v1')).people, [])
  await assert.rejects(service.like('v1', { owner: 'me', mealId: lunch }), { code: 'FORBIDDEN' })
  await assert.rejects(service.accept('v1', { code }), { code: 'NOT_FOUND' })

  // 重新邀请，v1 自己点「不看了」
  await service.accept('v1', { code: mine.code })
  assert.deepEqual(await service.leave('v1', { owner: 'me' }), { left: true })
  assert.deepEqual((await service.get('v1')).people, [])
  assert.deepEqual((await service.mine('me')).viewers, [])
  // 再点一次不报错；没说是谁的不行
  assert.deepEqual(await service.leave('v1', { owner: 'me' }), { left: true })
  await assert.rejects(service.leave('v1', {}), { code: 'BAD_REQUEST' })
  await assert.rejects(service.remove('me', {}), { code: 'BAD_REQUEST' })
})

test('family.like：记在打卡上（称呼 + 时间），重复点不重复记；打卡删了说不在了', async () => {
  const { repo, service, clock } = setup()
  const { code } = await service.invite('me')
  await service.accept('v1', { code, name: '红红' })
  await service.accept('v2', { code })
  const lunch = await addMeal(repo, 'me', 'lunch', '12:10')

  assert.deepEqual(await service.like('v1', { owner: 'me', mealId: lunch }), { mealId: lunch, liked: true, likeNames: ['红红'] })
  clock.now = at('12:50')
  assert.deepEqual(await service.like('v1', { owner: 'me', mealId: lunch }), { mealId: lunch, liked: true, likeNames: ['红红'] })
  assert.deepEqual((await service.like('v2', { owner: 'me', mealId: lunch })).likeNames, ['红红', '亲友'])
  assert.deepEqual((await repo.getMeal('me', lunch)).likes, [
    { openid: 'v1', name: '红红', at: at('12:40').getTime() },
    { openid: 'v2', name: '亲友', at: at('12:50').getTime() },
  ])
  const meal = (await service.get('v1')).people[0].meals[0]
  assert.equal(meal.liked, true)
  assert.deepEqual(meal.likeNames, ['红红', '亲友'])

  await assert.rejects(service.like('v1', { owner: 'me', mealId: 'nope' }), { code: 'NOT_FOUND', message: /不在了/ })
  await assert.rejects(service.like('v1', { owner: 'me' }), { code: 'NOT_FOUND' })
})

test('family.mine：邀请码、谁在看我（按先后）、我关注了几位；没建档的没有邀请码', async () => {
  const { service, clock } = setup()
  const empty = await service.mine('me')
  assert.ok(F.isCode(empty.code))
  assert.deepEqual(empty.viewers, [])
  assert.equal(empty.following, 0)
  await service.accept('v2', { code: empty.code })
  clock.now = at('12:50')
  await service.accept('v1', { code: empty.code })
  const mine = await service.mine('me')
  assert.equal(mine.code, empty.code)
  assert.deepEqual(mine.viewers, [
    { viewer: 'v2', name: '亲友', since: at('12:40').getTime() },
    { viewer: 'v1', name: '小红', since: at('12:50').getTime() },
  ])
  assert.deepEqual(await service.mine('v2'), { code: '', viewers: [], following: 1 })
})

test('family.setNotify：有关系、开通了微信提醒才能开；关随时能关', async () => {
  const { repo, service } = setup()
  const { code } = await service.invite('me')
  await service.accept('v1', { code })
  assert.deepEqual(await service.setNotify('v1', { owner: 'me', on: true }), { owner: 'me', notify: true })
  assert.equal(repo.state.follows.get('v1_me').notify, true)
  assert.equal((await service.get('v1')).people[0].notify, true)
  assert.deepEqual(await service.setNotify('v1', { owner: 'me', on: false }), { owner: 'me', notify: false })
  // 乱传的不算开
  assert.equal((await service.setNotify('v1', { owner: 'me', on: 'yes' })).notify, false)

  const none = setup({ template: null })
  const invite = await none.service.invite('me')
  await none.service.accept('v1', { code: invite.code })
  await assert.rejects(none.service.setNotify('v1', { owner: 'me', on: true }), { code: 'BAD_REQUEST', message: /还没开通/ })
  assert.equal((await none.service.setNotify('v1', { owner: 'me', on: false })).notify, false)
})

// me 的午饭 12:00；v1、v2 关注了 me、开了提醒
async function alertSetup(opts) {
  const s = setup({ now: at('13:10'), ...opts })
  const { code } = await s.service.invite('me')
  await s.service.accept('v1', { code })
  await s.service.accept('v2', { code })
  await s.service.setNotify('v1', { owner: 'me', on: true })
  await s.service.setNotify('v2', { owner: 'me', on: true })
  s.repo.state.reminders.set('v1', { notify: false, credits: 2, version: 'formal' })
  return s
}

test('alertFollowers：过了饭点没拍，开了提醒、有次数的亲友各收一条（点开进亲友页），次数减一、这顿记下不再发', async () => {
  const { repo, service, messages, clock } = await alertSetup()
  // 还在准时窗口里：不发
  clock.now = at('12:50')
  assert.equal(await service.alertFollowers(), 0)
  clock.now = at('13:10')
  assert.equal(await service.alertFollowers(), 1)
  assert.deepEqual(messages, [{
    touser: 'v1',
    templateId: 'tmpl-1',
    page: 'pages/family/family?from=alert',
    data: { thing1: { value: '小明的午饭还没拍' }, time2: { value: '2026-11-10 12:00' }, thing3: { value: '提醒 TA 一下吧' } },
    miniprogramState: 'formal',
  }])
  assert.equal(repo.state.reminders.get('v1').credits, 1)
  assert.equal(repo.state.reminders.get('v1').version, 'formal')
  assert.equal(repo.state.follows.get('v1_me').sent['2026-11-10'].lunch, at('13:10').getTime())
  // v2 没有次数：没发、也没记，这一小时里攒上了还能收到
  assert.equal(repo.state.follows.get('v2_me').sent['2026-11-10'], undefined)
  repo.state.reminders.set('v2', { notify: false, credits: 1 })
  clock.now = at('13:20')
  assert.equal(await service.alertFollowers(), 1)
  assert.equal(messages[1].touser, 'v2')
  assert.equal(messages[1].miniprogramState, 'trial')
  assert.equal(repo.state.reminders.get('v2').credits, 0)
  // 下个 10 分钟：都告诉过了
  clock.now = at('13:30')
  assert.equal(await service.alertFollowers(), 0)
  assert.equal(messages.length, 2)
  // 晚饭又没拍：v1 还有一次，再收一条
  clock.now = at('19:10')
  assert.equal(await service.alertFollowers(), 1)
  assert.equal(messages[2].data.thing1.value, '小明的晚饭还没拍')
  assert.equal(repo.state.reminders.get('v1').credits, 0)
})

test('alertFollowers：拍了的不发；关了提醒的不发；过了一小时不补发；对方清空了账号不发', async () => {
  const shot = await alertSetup()
  await addMeal(shot.repo, 'me', 'lunch', '13:05', { timing: 'late' })
  assert.equal(await shot.service.alertFollowers(), 0)

  const off = await alertSetup()
  await off.service.setNotify('v1', { owner: 'me', on: false })
  assert.equal(await off.service.alertFollowers(), 0)

  const late = await alertSetup({ now: at('14:10') })
  assert.equal(await late.service.alertFollowers(), 0)

  const gone = await alertSetup()
  gone.repo.state.profiles.delete('me')
  assert.equal(await gone.service.alertFollowers(), 0)
  assert.deepEqual(gone.messages, [])
})

test('alertFollowers：亲友拒收（43101）次数清零、这顿记下；别的错不记，下个 10 分钟再试；没模板什么都不做', async () => {
  const refused = await alertSetup({ sendError: { errCode: 43101 } })
  assert.equal(await refused.service.alertFollowers(), 0)
  assert.equal(refused.repo.state.reminders.get('v1').credits, 0)
  assert.ok(refused.repo.state.follows.get('v1_me').sent['2026-11-10'].lunch)

  const flaky = await alertSetup({ sendError: new Error('network') })
  assert.equal(await flaky.service.alertFollowers(), 0)
  assert.equal(flaky.repo.state.reminders.get('v1').credits, 2)
  assert.equal(flaky.repo.state.follows.get('v1_me').sent['2026-11-10'], undefined)
  flaky.failing.error = null
  flaky.clock.now = at('13:20')
  assert.equal(await flaky.service.alertFollowers(), 1)

  const none = await alertSetup()
  const bare = createFamilyService({ repo: none.repo, now: () => at('13:10'), template: async () => null, send: async () => assert.fail('不该发') })
  assert.equal(await bare.alertFollowers(), 0)
})

test('remind.tick 顺带告诉亲友：算进发出去的条数；亲友那边出错不影响饭点提醒，也不算定时检查出错', async () => {
  const repo = createFakeRepo()
  repo.state.profiles.set('u1', { ...PROFILE })
  repo.state.reminders.set('u1', { notify: true, credits: 1, sent: {} })
  const sentTo = []
  const make = (alsoTick) => createRemindService({
    repo,
    now: () => at('12:10'),
    config: { remindTemplate: TEMPLATE },
    send: async (msg) => sentTo.push(msg.touser),
    alsoTick,
  })
  assert.deepEqual(await make(async () => 2).tick(), { sent: 3 })
  assert.deepEqual(sentTo, ['u1'])
  assert.equal(repo.state.settings.get('remindTick').stage, 'done')
  assert.equal(repo.state.settings.get('remindTick').sent, 3)

  repo.state.reminders.set('u1', { notify: true, credits: 1, sent: {} })
  assert.deepEqual(await make(async () => { throw new Error('boom') }).tick(), { sent: 1 })
  assert.equal(repo.state.settings.get('remindTick').stage, 'done')
  // 没接的照旧
  assert.deepEqual(await make(null).tick(), { sent: 0 })
})

const SAVE = { nickname: '小明', sex: 'female', age: 50, heightCm: 160, weightKg: 70, targetWeightKg: 60, activity: 'light' }

test('云函数：family.* 走路由；被赞的人在 day.get / meal.get 里看得到赞；定时触发器顺带告诉亲友；从头再来把关系和邀请码清掉', async (t) => {
  const config = require('../cloudfunctions/api/config')
  config.remindTemplate = TEMPLATE
  config.testReset = { until: '2026-11-30' }
  t.after(() => {
    config.remindTemplate = null
    config.testReset = null
  })
  fixDate(t, '2026-11-10T12:10:00+08:00')
  const cloud = createFakeCloud({ openid: 'me', replies: [analysisJson()] })
  const { main } = loadCloudFunction(cloud)
  const as = (openid, action, data) => {
    cloud.setOpenid(openid)
    return main({ action, data })
  }

  // 没建档：没有邀请码
  assert.equal((await as('me', 'family.invite')).code, 'NO_PROFILE')
  assert.deepEqual((await as('me', 'family.mine')).data, { code: '', viewers: [], following: 0 })
  await as('me', 'profile.save', SAVE)
  const { code } = (await as('me', 'family.invite')).data
  assert.ok(F.isCode(code))
  const analyzed = await as('me', 'meal.analyze', { mealType: 'lunch', fileID: 'cloud://env/meals/a.jpg', note: '' })
  const mealId = analyzed.data._id

  // 亲友（没建档）带着邀请码打开 → 接受 → 看板
  assert.deepEqual((await as('v1', 'family.get', { code })).data.invite, { ok: true, mine: false, name: '小明', already: false })
  assert.deepEqual((await as('v1', 'family.accept', { code, name: '红红' })).data, { owner: 'me', name: '小明', already: false })
  const board = (await as('v1', 'family.get')).data
  assert.equal(board.people.length, 1)
  assert.equal(board.people[0].meals[0].photoUrl, 'https://tmp/cloud://env/meals/a.jpg')
  assert.equal(board.people[0].streak, 1)
  assert.equal(board.people[0].weekOnTime, 1)
  // 没关系的人
  assert.equal((await as('v2', 'family.like', { owner: 'me', mealId })).code, 'FORBIDDEN')
  assert.deepEqual((await as('v2', 'family.get')).data.people, [])

  // 点赞：被赞的人在今日页、结果页拿到的打卡上带着
  assert.deepEqual((await as('v1', 'family.like', { owner: 'me', mealId })).data.likeNames, ['红红'])
  const day = (await as('me', 'day.get')).data
  assert.deepEqual(day.meals[0].likes.map((l) => l.name), ['红红'])
  assert.deepEqual((await as('me', 'meal.get', { mealId })).data.likes.map((l) => l.name), ['红红'])
  // 赞不会把分析结果弄丢
  assert.equal(day.meals[0].analysis.totalKcal, 230)
  assert.deepEqual((await as('me', 'family.mine')).data.viewers.map((v) => [v.viewer, v.name]), [['v1', '红红']])
  assert.equal((await as('v1', 'family.mine')).data.following, 1)

  // 开提醒：先攒一次「允许」（没建档的亲友也能攒），再开
  assert.equal((await as('v1', 'remind.subscribed', { accepted: true, version: 'trial' })).data.credits, 1)
  assert.deepEqual((await as('v1', 'family.setNotify', { owner: 'me', on: true })).data, { owner: 'me', notify: true })
  // 晚饭过了饭点没拍：定时触发器告诉 v1
  fixDate(t, '2026-11-10T19:10:00+08:00')
  cloud.setOpenid('')
  const tick = await main({ Type: 'Timer', TriggerName: 'remind' })
  assert.deepEqual(tick, { sent: 1 })
  assert.equal(cloud.messages.length, 1)
  assert.equal(cloud.messages[0].touser, 'v1')
  assert.equal(cloud.messages[0].page, 'pages/family/family?from=alert')
  assert.equal(cloud.messages[0].data.thing1.value, '小明的晚饭还没拍')
  assert.equal(cloud.messages[0].miniprogramState, 'trial')
  assert.equal((await as('v1', 'family.get')).data.credits, 0)
  // 下个 10 分钟不重复发
  fixDate(t, '2026-11-10T19:20:00+08:00')
  cloud.setOpenid('')
  assert.deepEqual(await main({ Type: 'Timer' }), { sent: 0 })

  // 亲友从头再来：关系没了；主人从头再来：邀请码也没了
  await as('me', 'profile.save', SAVE)
  await as('v2', 'family.accept', { code })
  assert.deepEqual((await as('v1', 'account.reset')).data, { reset: true })
  assert.deepEqual((await as('me', 'family.mine')).data.viewers.map((v) => v.viewer), ['v2'])
  assert.deepEqual((await as('me', 'account.reset')).data, { reset: true })
  assert.equal(cloud.db.collections.get('follows').size, 0)
  assert.equal(cloud.db.collections.get('invites').size, 0)
  assert.deepEqual((await as('v2', 'family.get')).data.people, [])
  assert.equal((await as('v2', 'family.accept', { code })).code, 'NOT_FOUND')
})
