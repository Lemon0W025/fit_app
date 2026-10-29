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
  return { steps, title: `新手三步，还差 ${left} 步` }
}

module.exports = { WELCOME_CARDS, guideCard }
