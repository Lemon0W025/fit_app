// 亲友看板的展示（纯函数，有单测）：亲友页每位亲友一张卡；被赞的人在今日页 / 结果页看到的「❤ 小明 赞了」和新来的赞
const { decorateMeal, stampsView } = require('./view')

const NAMES_MAX = 3 // 名字最多列几个，再多写「等 N 位亲友」
const COMMENT_MAX = 44 // 小暖的点评在看板上最多显示多少字
const SEEN_LIKES_KEY = 'seenLikesAt' // 本地存储：看到过的最新一个赞是什么时候的
const SHARE_TITLE = '来看看我今天吃得怎么样'
const PAGE = '/pages/family/family'

// 「小明、小红」「小明、小红、小刚 等 5 位亲友」（同一个称呼只写一次）
function namesText(names) {
  const list = []
  ;(names || []).forEach((n) => {
    if (n && list.indexOf(n) === -1) list.push(n)
  })
  if (list.length <= NAMES_MAX) return list.join('、')
  return `${list.slice(0, NAMES_MAX).join('、')} 等 ${list.length} 位亲友`
}

// 被赞的人在每顿下面看到的一行：「❤ 小明、小红 赞了」；没人赞是空的
function likesText(likes) {
  const names = namesText((likes || []).map((l) => l && l.name))
  return names ? `❤ ${names} 赞了` : ''
}

// 今日页：by 是每顿下面那一行（{ 打卡 id: 文字 }）；note 是上次看过（seenAt）之后新来的赞的一句提示；latest 是最新一个赞的时间
function likesView(meals, seenAt) {
  const by = {}
  const fresh = []
  let latest = 0
  ;(meals || []).forEach((m) => {
    const text = likesText(m.likes)
    if (text) by[m._id] = text
    ;(m.likes || []).forEach((l) => {
      if (!l) return
      if (l.at > latest) latest = l.at
      if (l.at > (seenAt || 0)) fresh.push(l.name)
    })
  })
  return { by, latest, note: fresh.length ? `${namesText(fresh)} 给你今天的打卡点了赞 ❤` : '' }
}

function shorten(text, max) {
  const s = String(text || '')
  return s.length > max ? `${s.slice(0, max - 1)}…` : s
}

// 看板上的一顿：小暖没看成的那顿只说「还没算出来」，不显示报错
function mealView(meal) {
  const v = decorateMeal(meal)
  const done = meal.status === 'done' && !!meal.analysis
  const names = namesText(meal.likeNames)
  return {
    _id: meal._id,
    label: v.label,
    timeText: v.timeText,
    onTime: meal.timing === 'on',
    ratingClass: done ? v.ratingClass : 'none',
    ratingText: done ? v.ratingText : '',
    kcalText: done ? v.kcalText : '小暖还没算出来',
    foodsText: done ? v.foodsText : '',
    commentText: done ? shorten(v.commentText, COMMENT_MAX) : '',
    photoUrl: meal.photoUrl || '',
    liked: !!meal.liked,
    likeText: meal.liked ? '❤ 赞过了' : '🤍 赞一个',
    likesText: names ? `${names} 赞了` : '',
  }
}

function personView(p) {
  const meals = (p.meals || []).slice().sort((a, b) => a.createdAt - b.createdAt).map(mealView)
  return {
    owner: p.owner,
    name: p.name,
    stamps: stampsView(p.stamps),
    streakText: p.streak > 0 ? `🔥 已连续 ${p.streak} 天` : '',
    weekText: `最近 7 天准时 ${p.weekOnTime || 0} 顿`,
    notify: !!p.notify,
    meals,
    emptyText: meals.length ? '' : '今天还没打卡',
  }
}

// family.get 的结果 → 亲友页要的。invite：带着邀请码打开时最上面那张卡（join 能接受 / note 一句说明）
function boardView(res) {
  const people = (res.people || []).map(personView)
  const inv = res.invite
  let invite = null
  if (inv && inv.ok && !inv.already) invite = { join: true, title: `${inv.name} 邀请你看 TA 每天的打卡`, note: '' }
  else if (inv && !inv.ok) invite = { join: false, title: '', note: inv.message || '' }
  return {
    people,
    empty: people.length === 0,
    invite,
    // 开通了微信提醒才有「TA 过了饭点没拍，提醒我」
    wechat: !!res.templateId,
    creditsText: res.credits > 0 ? `还能提醒 ${res.credits} 次` : '提醒次数用完了：再点一次开关，弹出来时点「允许」',
  }
}

// 「我的」页的亲友看板那块：family.mine 的结果 → 页面要的
function mineView(res) {
  const src = res || {}
  return {
    code: src.code || '',
    viewers: (src.viewers || []).map((v) => ({ viewer: v.viewer, name: v.name })),
    following: src.following || 0,
    followingText: src.following > 0 ? `我关注的亲友（${src.following} 位）` : '',
  }
}

// 「邀请亲友看我的打卡」分享出去的卡片
function shareCard(code) {
  return { title: SHARE_TITLE, path: `${PAGE}?code=${code}` }
}

module.exports = { NAMES_MAX, SEEN_LIKES_KEY, namesText, likesText, likesView, mealView, personView, boardView, mineView, shareCard }
