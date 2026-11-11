// 亲友看板：把自己的打卡给亲友看（邀请码 → 关注关系）、亲友点赞、过了饭点没拍告诉亲友。
// 谁能看谁只认 follows 里的关系：每个读别人打卡、改关系的入口都先核对（requireFollow）。
// 两边的账号（openid）互相看不到：每段关系有一个随机的代号（follow.key），发给页面的 owner / viewer、
// 存在打卡上的赞（likes[].key）都是这个代号，页面再拿它回来指「哪位亲友」
const { AppError, CODES } = require('../lib/errors')
const { normalizeCamp } = require('../lib/camp-state')
const { dateKey, addDays } = require('../lib/shared/date')
const { mealStamps, onTimeCount, streakFrom } = require('../lib/shared/forest')
const { mealTimesOf } = require('../lib/shared/timing')
const { recordSent } = require('../lib/remind')
const F = require('../lib/family')

const PAGE = 'pages/family/family'
// 没有次数 / 用户拒收：次数清零，这顿记为告诉过（不再重试）
const REFUSED = [43101]
const EXPIRED = '邀请过期了，让 TA 再发一次'
const WEEK_DAYS = 7

// template：现在用的微信提醒模板（remind.template，没有开通是 null）；send：发订阅消息；
// photoUrls：打卡照片换成临时链接（{ fileID: 链接 }）
function createFamilyService({ repo, now, template = async () => null, send = null, photoUrls = async () => ({}), log = () => {} }) {
  // 没过期的邀请码才认
  async function liveInvite(code) {
    if (!F.isCode(code)) return null
    const doc = await repo.getInvite(code)
    return doc && doc.expiresAt > now().getTime() ? doc : null
  }

  // 我的邀请码：还有两天以上才过期的接着用，不然换一个新的（过期的顺手删掉）
  async function ensureCode(openid) {
    const at = now().getTime()
    const invites = await repo.listInvites(openid)
    for (const i of invites) {
      if (i.expiresAt <= at) await repo.removeInvite(i._id)
    }
    const live = invites.filter((i) => i.expiresAt - at >= F.INVITE_REUSE_DAYS * F.DAY_MS).sort((a, b) => b.expiresAt - a.expiresAt)[0]
    if (live) return live._id
    let code = F.newCode()
    // 撞上别人的码（几乎不会）就再抽
    for (let n = 0; n < 3 && (await repo.getInvite(code)); n++) code = F.newCode()
    await repo.saveInvite(code, { owner: openid, createdAt: at, expiresAt: at + F.INVITE_DAYS * F.DAY_MS })
    return code
  }

  // 关系上的代号：老的关系没有就补一个
  async function keyed(follow) {
    if (follow.key) return follow
    const next = { ...follow, key: F.newCode() }
    await repo.saveFollow(follow.viewer, follow.owner, next)
    return next
  }

  const following = async (openid) => Promise.all((await repo.listFollowing(openid)).map(keyed))
  const followers = async (openid) => Promise.all((await repo.listFollowers(openid)).map(keyed))

  // 我关注的哪一位（key：页面拿回来的代号）
  async function requireFollow(viewer, key) {
    const follow = typeof key === 'string' && key ? (await following(viewer)).find((f) => f.key === key) : null
    if (!follow) throw new AppError(CODES.FORBIDDEN, '你还没有关注这位亲友，让 TA 再邀请你一次')
    return follow
  }

  // 给亲友看的一顿：不带备注、云存储地址；谁点的赞只给称呼。key：看的人这段关系的代号（认「我赞过没有」）
  function mealOf(meal, key, urls) {
    const likes = Array.isArray(meal.likes) ? meal.likes : []
    return {
      _id: meal._id,
      mealType: meal.mealType,
      date: meal.date,
      createdAt: meal.createdAt,
      timing: meal.timing || null,
      status: meal.status,
      mode: meal.mode,
      people: meal.people || 1,
      analysis: meal.analysis || null,
      photoUrl: (meal.fileID && urls[meal.fileID]) || '',
      liked: likes.some((l) => l.key === key),
      likeNames: likes.map((l) => l.name),
    }
  }

  // 看板上的一位亲友：今天的印章、连续几天、最近 7 天准时几顿、今天每一顿
  async function personOf(viewer, follow, today) {
    const owner = follow.owner
    const [profile, garden, week] = await Promise.all([
      repo.getProfile(owner),
      repo.getGarden(owner),
      repo.listMealsBetween(owner, addDays(today, -(WEEK_DAYS - 1)), today),
    ])
    const meals = week.filter((m) => m.date === today)
    let urls = {}
    try {
      urls = await photoUrls(meals.map((m) => m.fileID).filter(Boolean))
    } catch (e) {
      // 照片换不到链接：先不显示照片，别的照样看
      log('family photo urls failed', e)
    }
    return {
      // 这位亲友的代号（不是账号）
      owner: follow.key,
      name: F.cleanName(profile && profile.nickname),
      stamps: mealStamps(meals),
      streak: streakFrom(normalizeCamp(garden).days, today),
      weekOnTime: onTimeCount(week),
      notify: !!follow.notify,
      meals: meals.map((m) => mealOf(m, follow.key, urls)),
    }
  }

  // 带着邀请码打开亲友页：这张邀请是谁的、还能不能用（不建立关系，点了「看看」才 accept）
  async function inviteInfo(openid, code, follows) {
    const invite = await liveInvite(code)
    if (!invite) return { ok: false, mine: false, message: EXPIRED }
    if (invite.owner === openid) return { ok: false, mine: true, message: '这是你自己发出去的邀请，亲友点开才能看到你的打卡' }
    const profile = await repo.getProfile(invite.owner)
    return { ok: true, mine: false, name: F.cleanName(profile && profile.nickname), already: follows.some((f) => f.owner === invite.owner) }
  }

  // 告诉一位亲友「XX 的午饭还没拍」：用掉这位亲友自己攒的一次「允许」，在关注关系上记一笔
  async function alertOne(follow, owner, mealType, t, at) {
    const doc = await repo.getReminders(follow.viewer)
    // 没有次数：不记，这一小时里亲友攒上了还能发
    if (!(doc && doc.credits > 0)) return 0
    let ok = false
    try {
      await send({
        touser: follow.viewer,
        templateId: t.id,
        page: `${PAGE}?from=alert`,
        data: F.alertMessage(t, owner.name, mealType, owner.times, at),
        miniprogramState: doc.version || t.state || 'trial',
      })
      ok = true
    } catch (e) {
      const code = e && (e.errCode || e.code)
      log('family alert send failed', code, e && e.message)
      // 别的错（比如网络）：下个 10 分钟再试
      if (REFUSED.indexOf(code) === -1) return 0
    }
    const { _id, _openid, ...rest } = doc
    await repo.saveReminders(follow.viewer, { ...rest, credits: ok ? Math.max(0, doc.credits - 1) : 0 })
    await repo.saveFollow(follow.viewer, follow.owner, { ...follow, sent: recordSent(follow.sent, at, mealType) })
    return ok ? 1 : 0
  }

  return {
    // 我的邀请码（「我的」页的「邀请亲友看我的打卡」按钮分享出去的路径里带着它）
    async invite(openid) {
      if (!(await repo.getProfile(openid))) throw new AppError(CODES.NO_PROFILE, '先建好档案，再邀请亲友')
      const code = await ensureCode(openid)
      return { code, path: `/${PAGE}?code=${code}` }
    },

    // 亲友点开邀请：建立关注关系（已经关注过的只改称呼）。看的人不用建档
    async accept(openid, input) {
      const src = input || {}
      const invite = await liveInvite(src.code)
      if (!invite) throw new AppError(CODES.NOT_FOUND, EXPIRED)
      const owner = invite.owner
      if (owner === openid) throw new AppError(CODES.BAD_REQUEST, '这是你自己发出去的邀请，发给亲友才有用')
      const [existing, mine, theirs] = await Promise.all([repo.getFollow(openid, owner), repo.getProfile(openid), repo.getProfile(owner)])
      if (!existing) {
        const [theirFollowers, myFollowing] = await Promise.all([repo.listFollowers(owner), repo.listFollowing(openid)])
        if (theirFollowers.length >= F.FOLLOWS_MAX) throw new AppError(CODES.BAD_REQUEST, `TA 的亲友已经满了（最多 ${F.FOLLOWS_MAX} 位）`)
        if (myFollowing.length >= F.FOLLOWS_MAX) throw new AppError(CODES.BAD_REQUEST, `你关注的亲友已经满了（最多 ${F.FOLLOWS_MAX} 位）`)
      }
      // 称呼：这次填的 > 以前填的 > 自己档案里的 > 「亲友」
      const typed = typeof src.name === 'string' ? src.name.trim() : ''
      const name = F.cleanName(typed || (existing && existing.name) || (mine && mine.nickname))
      const base = existing || { notify: false, sent: {}, createdAt: now().getTime() }
      const key = base.key || F.newCode()
      await repo.saveFollow(openid, owner, { ...base, key, name })
      return { owner: key, name: F.cleanName(theirs && theirs.nickname), already: !!existing }
    },

    // 亲友页：我关注的每一位今天的打卡。带 code 时多一段 invite（这张邀请是谁的）
    async get(openid, input) {
      const code = (input || {}).code
      const [follows, t, reminders] = await Promise.all([following(openid), template(), repo.getReminders(openid)])
      const today = dateKey(now())
      const people = []
      for (const f of follows.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0))) {
        people.push(await personOf(openid, f, today))
      }
      return {
        date: today,
        // 没开通微信提醒时不显示「TA 过了饭点没拍，提醒我」
        templateId: t ? t.id : '',
        credits: (reminders && reminders.credits) || 0,
        people,
        invite: code ? await inviteInfo(openid, code, follows) : null,
      }
    },

    // 给亲友的一顿点赞（一个人一顿只能赞一次，再点没有变化）
    async like(openid, input) {
      const src = input || {}
      const follow = await requireFollow(openid, src.owner)
      const meal = typeof src.mealId === 'string' && src.mealId ? await repo.getMeal(follow.owner, src.mealId) : null
      if (!meal) throw new AppError(CODES.NOT_FOUND, '这条打卡已经不在了')
      const likes = F.addLike(meal.likes, follow.key, follow.name, now().getTime())
      if (likes) await repo.setMealLikes(meal._id, likes)
      return { mealId: meal._id, liked: true, likeNames: (likes || meal.likes).map((l) => l.name) }
    },

    // 「TA 过了饭点没拍，提醒我」开关（页面先申请一次「允许」、remind.subscribed 攒上，再来开）
    async setNotify(openid, input) {
      const src = input || {}
      const follow = await requireFollow(openid, src.owner)
      const on = src.on === true
      if (on && !(await template())) throw new AppError(CODES.BAD_REQUEST, '微信提醒还没开通')
      await repo.saveFollow(openid, follow.owner, { ...follow, notify: on })
      return { owner: follow.key, notify: on }
    },

    // 不看了：我不再关注这位亲友
    async leave(openid, input) {
      const key = (input || {}).owner
      if (typeof key !== 'string' || !key) throw new AppError(CODES.BAD_REQUEST, '没说是哪位亲友')
      const follow = (await following(openid)).find((f) => f.key === key)
      if (follow) await repo.removeFollow(openid, follow.owner)
      return { left: true }
    },

    // 移除：不让这位亲友再看我的打卡。以前发出去的邀请一起作废（不然 TA 点旧卡片又能进来）
    async remove(openid, input) {
      const key = (input || {}).viewer
      if (typeof key !== 'string' || !key) throw new AppError(CODES.BAD_REQUEST, '没说是哪位亲友')
      const follow = (await followers(openid)).find((f) => f.key === key)
      if (follow) await repo.removeFollow(follow.viewer, openid)
      await repo.removeInvites(openid)
      return this.mine(openid)
    },

    // 「我的」页：我的邀请码（建了档才有）、谁在看我的打卡、我关注了几位
    async mine(openid) {
      const [profile, watching, mine] = await Promise.all([repo.getProfile(openid), followers(openid), repo.listFollowing(openid)])
      return {
        code: profile ? await ensureCode(openid) : '',
        // viewer：这位亲友的代号（不是账号），移除时拿回来
        viewers: watching
          .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0))
          .map((f) => ({ viewer: f.key, name: F.cleanName(f.name), since: f.createdAt || 0 })),
        following: mine.length,
      }
    },

    // 定时触发器（remind.tick 顺带叫）：谁过了饭点还没拍，告诉开了提醒的亲友。返回发出去几条
    async alertFollowers() {
      const t = await template()
      if (!t || !send) return 0
      const follows = await repo.listFollowsToNotify()
      if (!follows.length) return 0
      const at = now()
      const today = dateKey(at)
      // 同一个人有几位亲友时，档案和今天的打卡只读一次
      const owners = new Map()
      const ownerOf = async (openid) => {
        if (!owners.has(openid)) {
          const profile = await repo.getProfile(openid)
          owners.set(openid, profile ? { name: profile.nickname, times: mealTimesOf(profile), meals: await repo.listMeals(openid, today) } : null)
        }
        return owners.get(openid)
      }
      let sent = 0
      for (const follow of follows) {
        try {
          const owner = await ownerOf(follow.owner)
          if (!owner) continue
          const due = F.planFamilyAlerts({ times: owner.times, meals: owner.meals, now: at, sent: follow.sent })
          if (due.length) sent += await alertOne(follow, owner, due[0], t, at)
        } catch (e) {
          log('family alert failed', e)
        }
      }
      return sent
    },
  }
}

module.exports = { createFamilyService }
