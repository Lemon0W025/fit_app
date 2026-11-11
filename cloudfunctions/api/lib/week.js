// 每周小结（纯函数）：一周七天（周一到周日）拍了几天、准时几顿、每天吃了多少、体重变了多少，再挑两三句最该说的。
// 不调模型：数是算出来的，话是按规则挑的，打开就有
//   weekRange(today, offset)   offset 0 = 这一周（周一到今天所在的周日），1 = 上一周…… → { start, end }
//   buildWeek({ start, today, meals, dailyKcal, minKcal, earned, days, weights }) → 页面用的数据

const { addDays } = require('./shared/date')
const { sumMeals } = require('./shared/nutrition')
const { MAIN_MEALS, dayBeans, mealStamps } = require('./shared/forest')
const { MEAL_WORDS } = require('./shared/timing')
const { PATCHED } = require('./shared/streak')

const WEEKDAYS = ['一', '二', '三', '四', '五', '六', '日']
// 平均热量和预算差多少以内算「差不多」
const NEAR = 0.1

function weekdayIndex(date) {
  const [y, m, d] = date.split('-').map(Number)
  return (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7 // 周一 = 0
}

function weekRange(today, offset = 0) {
  const start = addDays(today, -weekdayIndex(today) - 7 * offset)
  return { start, end: addDays(start, 6) }
}

const md = (date) => `${Number(date.slice(5, 7))}月${Number(date.slice(8))}日`
const round1 = (n) => Math.round(n * 10) / 10

// 这一周前后的体重：周里最后一次，和它之前最近的一次（周里更早的，或这周以前的）
function weightChange(weights, start, end) {
  const upTo = (weights || []).filter((w) => w.date <= end)
  const last = upTo[upTo.length - 1]
  if (!last || last.date < start) return null
  const before = upTo.length > 1 ? upTo.filter((w) => w.date < start).pop() || upTo[0] : null
  if (!before || before.date === last.date) return { to: last.weightKg, from: null, diff: null }
  return { from: before.weightKg, to: last.weightKg, diff: round1(last.weightKg - before.weightKg) }
}

function buildWeek({ start, today, meals, dailyKcal, minKcal, earned = {}, days: marks = {}, weights = [] }) {
  const end = addDays(start, 6)
  const byDate = {}
  ;(meals || []).forEach((m) => {
    ;(byDate[m.date] = byDate[m.date] || []).push(m)
  })

  const days = WEEKDAYS.map((weekday, i) => {
    const date = addDays(start, i)
    const list = byDate[date] || []
    const future = date > today
    const beans = dayBeans(list)
    const kcal = sumMeals(list).kcal
    return {
      date,
      weekday,
      future,
      today: date === today,
      kcal,
      over: !!dailyKcal && kcal > dailyKcal,
      stamps: future ? [] : mealStamps(list),
      logged: beans.logged.length,
      onTime: beans.onTime.length,
      beans: future ? 0 : date in earned ? earned[date] : beans.beans,
      patched: marks[date] === PATCHED,
    }
  })

  const past = days.filter((d) => !d.future)
  const eaten = past.filter((d) => d.kcal > 0)
  // 平均热量只看三顿都拍了的日子：只拍了一顿的日子算进去，平均数会低得离谱
  const full = past.filter((d) => d.logged === MAIN_MEALS.length)
  const ratings = { green: 0, yellow: 0, red: 0 }
  past.forEach((d) => d.stamps.forEach((s) => {
    if (s.state in ratings) ratings[s.state] += 1
  }))
  // 每顿正餐漏了几次（今天还没到点的也算在里面没关系：只用来挑「漏得最多的」）
  const missed = MAIN_MEALS.map((t) => ({
    mealType: t,
    word: MEAL_WORDS[t],
    count: past.filter((d) => !d.today && !d.stamps.some((s) => s.mealType === t && s.state !== 'none')).length,
  })).sort((a, b) => b.count - a.count)

  const stats = {
    days: past.length,
    daysLogged: past.filter((d) => d.logged > 0).length,
    mainMeals: past.reduce((sum, d) => sum + d.logged, 0),
    onTime: past.reduce((sum, d) => sum + d.onTime, 0),
    beans: past.reduce((sum, d) => sum + d.beans, 0),
    fullDays: full.length,
    avgKcal: full.length ? Math.round(full.reduce((sum, d) => sum + d.kcal, 0) / full.length) : 0,
    overDays: eaten.filter((d) => d.over).length,
    dailyKcal: dailyKcal || 0,
    ratings,
  }
  const weight = weightChange(weights, start, end)
  const current = today <= end

  return {
    start,
    end,
    label: `${md(start)}～${md(end)}`,
    current,
    days,
    stats,
    weight,
    lines: lines({ stats, weight, missed, minKcal, current }),
    goal: goal({ stats, missed }),
    empty: stats.mainMeals === 0 && eaten.length === 0,
  }
}

// 两三句最该说的：打卡、准时、热量、体重
function lines({ stats, weight, missed, minKcal, current }) {
  const out = []
  const when = current ? '这周到今天' : '这一周'
  if (stats.daysLogged === 7) out.push({ tone: 'good', text: '七天都打卡了，一天没落，真不容易！' })
  else if (stats.daysLogged >= 5) out.push({ tone: 'good', text: `${when}打了 ${stats.daysLogged} 天卡，保持住。` })
  else if (stats.daysLogged > 0) out.push({ tone: 'warn', text: `${when}打了 ${stats.daysLogged} 天卡，有几天没拍。吃之前先拍一张，慢慢就顺手了。` })

  if (stats.mainMeals > 0) {
    const share = stats.onTime / stats.mainMeals
    const worst = missed[0]
    let text = `拍了 ${stats.mainMeals} 顿正餐，其中 ${stats.onTime} 顿是准时拍的`
    if (share >= 0.8) text += '，按点吃饭做得很好。'
    else if (worst && worst.count >= 2) text += `；${worst.word}漏得最多（${worst.count} 次）。`
    else text += '。'
    out.push({ tone: share >= 0.8 ? 'good' : 'plain', text })
  }

  if (stats.avgKcal > 0 && stats.dailyKcal > 0) {
    const diff = stats.avgKcal - stats.dailyKcal
    const head = stats.fullDays === stats.days ? '平均每天' : `三顿都拍了的 ${stats.fullDays} 天，平均每天`
    if (minKcal && stats.avgKcal < minKcal) {
      out.push({ tone: 'warn', text: `${head}只吃了 ${stats.avgKcal} 千卡，太少了。吃够了才瘦得稳，别饿着。` })
    } else if (Math.abs(diff) <= stats.dailyKcal * NEAR) {
      out.push({ tone: 'good', text: `${head} ${stats.avgKcal} 千卡，和预算（${stats.dailyKcal}）差不多，很稳。` })
    } else if (diff > 0) {
      out.push({ tone: 'warn', text: `${head} ${stats.avgKcal} 千卡，比预算多 ${diff}；这一周有 ${stats.overDays} 天超了。` })
    } else {
      out.push({ tone: 'plain', text: `${head} ${stats.avgKcal} 千卡，比预算少 ${-diff}，不用饿着自己。` })
    }
  } else if (stats.mainMeals > 0) {
    out.push({ tone: 'plain', text: '没有哪天三顿都拍全，平均热量算不出来。三顿都拍，小暖才知道一天吃了多少。' })
  }

  if (weight && weight.diff !== null) {
    if (weight.diff < 0) out.push({ tone: 'good', text: `体重 ${weight.from} → ${weight.to} 公斤，轻了 ${-weight.diff} 公斤。` })
    else if (weight.diff > 0) out.push({ tone: 'plain', text: `体重 ${weight.from} → ${weight.to} 公斤，重了 ${weight.diff} 公斤。一两周的起伏很正常，看长一点的趋势。` })
    else out.push({ tone: 'plain', text: `体重 ${weight.to} 公斤，和上次一样。` })
  } else if (!weight) {
    out.push({ tone: 'plain', text: '这一周没记体重。每周固定一天早上称一次，变化看得更清楚。' })
  }
  return out
}

// 下一周一个小目标：挑最弱的那一项
function goal({ stats, missed }) {
  if (stats.mainMeals === 0) return '下一周的小目标：每天至少拍一顿。'
  if (stats.daysLogged < 5) return `下一周的小目标：打卡 ${Math.min(7, stats.daysLogged + 2)} 天。`
  const worst = missed[0]
  if (worst && worst.count >= 3) return `下一周的小目标：${worst.word}少漏两次。`
  if (stats.onTime < stats.mainMeals * 0.6) return '下一周的小目标：多几顿按饭点拍。'
  if (stats.overDays >= 3) return '下一周的小目标：超预算的日子少一两天。'
  return '下一周的小目标：照这样保持。'
}

module.exports = { weekRange, buildWeek, weightChange }
