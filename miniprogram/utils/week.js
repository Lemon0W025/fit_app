// 补签卡和每周小结在页面上的样子（纯函数，有单测）。规则在云函数：能不能补 shared/streak.js 的 patchOffer，一周怎么算 lib/week.js
//   patchCard(patch, hiddenDate)        首页「昨天漏了一天」那张卡；点过「算了」的那天不再出
//   weekCard(today, seenStart, hasMeal) 首页周一到周三「上周的小结出来了」；看过这一周的就不再出
//   weekView(week)                      小结页：四个数、七根柱子、小暖的话

const { addDays } = require('./shared/date')
const { stampsView } = require('./view')

// 柱子最高画到预算的多少倍（吃得更多的那天会把它撑高）
const CHART_TOP = 1.3
const BAR_MIN = 4 // 吃了一点点也要看得见（百分比）
// 周一到周三提上周的小结
const CARD_DAYS = 3

function patchCard(patch, hiddenDate) {
  if (!patch || patch.date === hiddenDate) return null
  return {
    date: patch.date,
    can: !!patch.can,
    title: `昨天漏了一天，连续 ${patch.streak} 天要断了`,
    sub: patch.can
      ? `用 ${patch.cost} 暖豆补上昨天，接着连（这个月还能补 ${patch.left} 次）`
      : `补上昨天要 ${patch.cost} 暖豆，现在还不够。今天好好拍，从今天重新连起`,
    button: `用 ${patch.cost} 暖豆补上`,
    confirm: `花 ${patch.cost} 暖豆补上昨天，连续打卡接着算。补的那天没有暖豆。`,
  }
}

function weekdayIndex(date) {
  const [y, m, d] = date.split('-').map(Number)
  return (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7 // 周一 = 0
}

function weekCard(today, seenStart, hasMeal) {
  const i = weekdayIndex(today)
  if (!hasMeal || i >= CARD_DAYS) return null
  const start = addDays(today, -i - 7)
  if (seenStart === start) return null
  return { start, title: '上周的小结出来了', sub: '打卡几天、准时几顿、吃得怎么样' }
}

function weekView(week) {
  const s = week.stats
  const top = Math.max(s.dailyKcal * CHART_TOP, 1, ...week.days.map((d) => d.kcal))
  return {
    offset: week.offset,
    start: week.start,
    title: week.current ? '这一周' : week.offset === 1 ? '上一周' : '往前的一周',
    label: week.label,
    empty: !!week.empty,
    emptyText: week.current ? '这一周还没有打卡，拍一顿就有了' : '这一周没有打卡记录',
    tiles: [
      { key: 'days', num: String(s.daysLogged), unit: `/ ${s.days} 天`, label: '打卡' },
      { key: 'onTime', num: String(s.onTime), unit: '顿', label: '准时' },
      { key: 'kcal', num: s.avgKcal ? String(s.avgKcal) : '—', unit: s.avgKcal ? '千卡' : '', label: '日均热量' },
      { key: 'beans', num: String(s.beans), unit: '暖豆', label: '得了' },
    ],
    budgetAt: s.dailyKcal ? Math.round((s.dailyKcal / top) * 100) : 0,
    budgetText: s.dailyKcal ? `预算 ${s.dailyKcal}` : '',
    bars: week.days.map((d) => ({
      key: d.date,
      weekday: d.weekday,
      h: d.kcal ? Math.max(BAR_MIN, Math.round((d.kcal / top) * 100)) : 0,
      kcalText: d.future ? '' : d.kcal ? String(d.kcal) : d.patched ? '补' : '—',
      cls: d.over ? 'wk-bar-over' : '',
      colCls: `${d.future ? 'wk-col-future' : ''}${d.today ? ' wk-col-today' : ''}`,
      stamps: d.future ? [] : stampsView(d.stamps),
    })),
    lines: week.lines || [],
    goal: week.goal || '',
    older: week.older === undefined ? null : week.older,
    newer: week.newer === undefined ? null : week.newer,
  }
}

module.exports = { patchCard, weekCard, weekView }
