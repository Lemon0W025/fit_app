// test/pet-talk.test.js：小动物说什么（各自的口气、聊今天打卡、爱吃的食物小知识、锅空着喊饿、客人闻香）
const test = require('node:test')
const assert = require('node:assert/strict')
const T = require('../miniprogram/utils/pet-talk')
const { PETS } = require('../miniprogram/utils/shared/pets')

function seq(seed) {
  let s = seed
  return () => (s = (s * 16807) % 2147483647) / 2147483647
}

const TODAY = { logged: 2, onTime: 1, allDone: false, allOnTime: false, open: '晚饭', streak: 3, kcal: 900, budget: 1240 }

test('12 只都有自己的口气和碎碎念；每句都短（气泡里一两行，10/28 用户嫌太长）', () => {
  PETS.forEach((p) => {
    assert.ok(T.TONES[p.id], p.id)
    assert.ok(T.CHATTER[p.id].length >= 8, p.id)
    p.foods.forEach((f) => assert.ok(T.SHORT_TIPS[f], `${p.id} 爱吃的 ${f} 没有短的小知识`))
  })
  const all = []
  PETS.forEach((p) => {
    const tone = T.TONES[p.id]
    all.push(...T.CHATTER[p.id], ...p.lines.tap, ...T.tipLines(tone, p), ...T.todayLines(tone, TODAY, ['xiaomi']), ...T.HUNGRY[tone], T.leaveLine(p.id), T.backLine(p.id))
    all.push(...T.todayLines(tone, { logged: 3, onTime: 3, allDone: true, allOnTime: true, open: '', streak: 120, kcal: 1500, budget: 1240 }, ['guihuagao']))
  })
  all.forEach((line) => {
    assert.ok(line.length <= T.MAX_CHARS, `太长（${line.length}）：${line}`)
    assert.ok(!/\{\w+\}/.test(line), `没填上：${line}`)
  })
})

test('聊今天：该吃晚饭了、拍了几顿、还能吃多少、连续几天、锅里煮着什么', () => {
  const lines = T.todayLines('cheer', TODAY, ['xiaomi'])
  assert.ok(lines.includes('该吃晚饭啦，记得拍'))
  assert.ok(lines.includes('今天拍了 2 顿，真棒'))
  assert.ok(lines.includes('还能吃 340 千卡哦'))
  assert.ok(lines.includes('我也要向你学习！'))
  assert.ok(lines.includes('连续 3 天啦！'))
  assert.ok(lines.includes('锅里是小米耶！'))
  // 吃多了劝走走；还没拍劝拍；三顿都准时夸
  assert.ok(T.todayLines('lazy', { ...TODAY, kcal: 1500 }, []).includes('吃多了…别学我躺'))
  assert.ok(T.todayLines('shy', { logged: 0, onTime: 0, open: '', streak: 0, kcal: 0, budget: 1240 }, []).some((l) => /饭照|拍饭/.test(l)))
  assert.ok(T.todayLines('proud', { logged: 3, onTime: 3, allDone: true, allOnTime: true, open: '', streak: 1, kcal: 1100, budget: 1240 }, []).some((l) => /准时/.test(l)))
  // 不知道今天的情况就不聊（锅里的照样能说）
  assert.deepEqual(T.todayLines('calm', null, []), [])
})

test('爱吃的食物：说爱吃哪样、那样的一句短小知识', () => {
  const dd = PETS.find((p) => p.id === 'doudou')
  const tips = T.tipLines('cheer', dd)
  assert.ok(tips.includes('我最爱小米！'))
  assert.ok(tips.includes('小米粥养胃哦！'))
  assert.ok(tips.some((l) => l.includes('玉米')))
})

test('talkLine：吃着东西说吃的那句；不重复上一句；1 级不撒娇；锅空着大多在喊饿；什么类都能挑到', () => {
  const dd = PETS.find((p) => p.id === 'doudou')
  assert.equal(T.talkLine('doudou', { action: 'eat' }, seq(1)), dd.lines.fed)
  assert.equal(T.talkLine('nope', {}, seq(1)), '')
  const rnd = seq(7)
  const seen = new Set()
  let last = ''
  for (let i = 0; i < 400; i++) {
    const line = T.talkLine('doudou', { period: 'day', action: 'idle', level: 1, today: TODAY, pot: ['xiaomi'] }, rnd, last)
    assert.ok(line && line !== last)
    seen.add(line)
    last = line
  }
  assert.ok(seen.has('今天拍了 2 顿，真棒'), '没聊打卡')
  assert.ok(seen.has('我最爱小米！'), '没说爱吃的')
  assert.ok([...seen].some((l) => T.CHATTER.doudou.includes(l)), '没碎碎念')
  assert.ok(![...seen].includes('最喜欢你了！'), '1 级不该撒娇')
  const fond = new Set()
  for (let i = 0; i < 300; i++) fond.add(T.talkLine('doudou', { period: 'day', level: 4 }, rnd))
  assert.ok(fond.has('最喜欢你了！') || fond.has('你来啦！好想你'))
  let starving = 0
  for (let i = 0; i < 200; i++) if (T.HUNGRY.cheer.includes(T.talkLine('doudou', { period: 'day', level: 3, hungry: true }, rnd))) starving += 1
  assert.ok(starving > 100, `锅空着只喊了 ${starving} / 200 次饿`)
})

test('客人闻着香味说的带着那样食物；走开 / 回来各有一句；todayOf：从营地拿到的印章和吃的算出聊什么', () => {
  assert.ok(T.sniffLine('sunbao', 'zhusun', seq(3)).includes('竹笋') || T.sniffLine('sunbao', 'zhusun', seq(5)).includes('竹笋'))
  assert.ok(/好吃的/.test(T.sniffLine('nuonuo', 'nope', seq(3))) || /好吃的/.test(T.sniffLine('nuonuo', 'nope', seq(4))))
  assert.equal(T.leaveLine('huahua'), '哼，自己找吃的去')
  assert.equal(T.backLine('doudou'), '闻到香味啦！')
  const daily = {
    stamps: [{ mealType: 'breakfast', state: 'done', onTime: true }, { mealType: 'lunch', state: 'none', onTime: false }, { mealType: 'dinner', state: 'none', onTime: false }],
    streak: 4, mealTimes: { breakfast: '07:30', lunch: '12:00', dinner: '18:00' },
  }
  const noon = new Date(Date.UTC(2026, 9, 27, 4, 10)) // 北京时间 12:10（饭点按北京时间算）
  assert.deepEqual(T.todayOf(daily, { kcal: 420, budget: 1240 }, noon), { logged: 1, onTime: 1, allDone: false, allOnTime: false, open: '午饭', streak: 4, kcal: 420, budget: 1240 })
  assert.equal(T.todayOf(daily, null, new Date(Date.UTC(2026, 9, 27, 7, 0))).open, '') // 15:00 不在饭点
  assert.equal(T.todayOf(null, null, noon), null)
})
