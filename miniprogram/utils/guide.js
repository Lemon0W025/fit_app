// 新手指引（docs/superpowers/specs/2026-10-29-guide-remind-share-design.md 第一节）：欢迎页的四张卡、今日页的「新手三步」（纯函数，有单测）

const WELCOME_CARDS = [
  { title: '每顿饭，拍一张', text: '拍下来交给小暖，她帮你算热量，说说吃得好不好。', image: '/images/garden/ui/camera.png' },
  { title: '饭点前后一小时，算准时', text: '准时拍得 15 暖豆，三顿都准时再加 15。到了饭点，手机会提醒你。', image: '/images/garden/ui/bean.png' },
  { title: '暖豆养小动物', text: '营地里煮一锅好吃的，小动物闻着香味就来住，天天陪着你。', image: '/images/camp/family.jpg', wide: true },
  { title: '先花一分钟设好', text: '三步就能用：', image: '/images/garden/ui/gift.png', steps: ['填一下身高体重', '设好饭点提醒', '拍第一顿饭'] },
]

// day.get 的 guide（{ remind, meal }）→ 今日页「新手三步」卡；三步都做了、或者点过「不用了」就不显示（null）
function guideCard(guide, hidden) {
  if (!guide || hidden) return null
  const steps = [
    { key: 'profile', label: '建好档案', done: true },
    { key: 'remind', label: '设好饭点提醒', done: !!guide.remind, action: 'goRemind' },
    { key: 'meal', label: '拍第一顿饭', done: !!guide.meal, action: 'goCheckin' },
  ]
  const left = steps.filter((s) => !s.done).length
  if (!left) return null
  // 卡片只占一行：做完几步、下一步是什么（点了去做）
  return { steps, title: `新手三步，还差 ${left} 步`, done: steps.length - left, total: steps.length, next: steps.find((s) => !s.done) }
}

// ---- 首页另外几样跟着状态出现的东西 ----
const LOW_CREDITS = 1 // 微信提醒的「允许」只剩这么多次（或用完了）就提醒续上
const FAMILY_HINT_STREAK = 3 // 连续打卡这么多天、还没有亲友在看，提一次亲友看板

// 问好那一行旁边的连续天数（daily 是 day.get 的 daily）；还没连上不显示
function streakPill(daily) {
  const n = (daily && daily.streak) || 0
  return n > 0 ? { days: n, text: `连续 ${n} 天` } : null
}

// 微信提醒快用完了：一次「允许」只能发一条，开着提醒、只剩 0 / 1 次时提醒续上。
// remind 是 day.get 的 remind；hidden 是点过「今天不提了」的那天，today 是今天的日期
function remindLowCard(remind, hidden, today) {
  if (!remind || !remind.notify || !remind.templateId) return null
  const n = remind.credits || 0
  if (n > LOW_CREDITS || (hidden && hidden === today)) return null
  return {
    title: n ? `微信提醒只剩 ${n} 次了` : '微信提醒的次数用完了',
    sub: n ? '用完以后，过了饭点没拍就提醒不到你了。' : '现在过了饭点没拍，提醒不到你。',
    tip: '点「续上」，弹出来时点「允许」；勾上「总是保持以上选择」，以后每次拍照会自动续上。',
    button: '续上',
  }
}

// 邀请亲友：连续打卡几天了、还没有亲友在看、没点过「不用了」才出现
function familyHintCard(streak, viewers, hidden) {
  if (hidden || viewers > 0 || !(streak >= FAMILY_HINT_STREAK)) return null
  return {
    title: '让亲友也看看你的坚持',
    sub: `已经连续打卡 ${streak} 天了。邀请一位亲友：TA 能看到你每顿吃了什么、给你点赞，你过了饭点没拍还能提醒你。`,
    button: '邀请亲友',
  }
}

module.exports = { WELCOME_CARDS, LOW_CREDITS, FAMILY_HINT_STREAK, guideCard, streakPill, remindLowCard, familyHintCard }
