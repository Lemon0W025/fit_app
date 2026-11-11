// 与 miniprogram/utils/shared/streak.js 保持一致（test/shared-sync.test.js 会检查）
// 连续打卡的里程碑和纪念章：连续第 3、7、14……天庆祝一次、发一枚纪念章（连续天数怎么算见 forest.js 的 streakFrom）

const { addDays } = require('./date')

const MILESTONES = [3, 7, 14, 21, 30, 60, 100, 150, 200, 300, 365]
const LAST = MILESTONES[MILESTONES.length - 1]
const EVERY_AFTER = 100 // 365 以后每满 100 天再算一次

function isMilestone(days) {
  if (MILESTONES.indexOf(days) !== -1) return true
  return days > LAST && (days - LAST) % EVERY_AFTER === 0
}

// 比 days 大的下一个里程碑，和还差几天
function nextMilestone(days) {
  const n = Math.max(0, Math.floor(days || 0))
  const next = MILESTONES.find((m) => m > n) || LAST + EVERY_AFTER * (Math.floor((n - LAST) / EVERY_AFTER) + 1)
  return { days: next, left: next - n }
}

// 不超过 days 的里程碑，从小到大
function milestonesUpTo(days) {
  const list = MILESTONES.filter((m) => m <= days)
  for (let m = LAST + EVERY_AFTER; m <= days; m += EVERY_AFTER) list.push(m)
  return list
}

// 纪念章的样子：3、7 天铜，14～30 天银，60 天以上金；365 天起外面一圈光
function badgeLook(days) {
  return { tier: days >= 60 ? 'gold' : days >= 14 ? 'silver' : 'bronze', glow: days >= LAST }
}

// 补签卡：昨天一顿正餐都没拍、前面已经连了 minStreak 天以上，花暖豆把昨天补上、接着连（一个月最多 perMonth 次；
// 只能补昨天，隔了两天就断了）。补的日子在 days 里记 PATCHED（真打卡的是 true），算连续、不算打卡天数、没有暖豆
const PATCH = { cost: 80, perMonth: 2, minStreak: 2 }
const PATCHED = 'patch'

// 现在能不能补：{ date 补哪天, streak 前面连了几天, left 这个月还能补几次, cost } 或 null
function patchOffer(days, today) {
  const has = (d) => !!(days && days[d])
  const date = addDays(today, -1)
  if (has(date)) return null
  let streak = 0
  for (let d = addDays(date, -1); has(d); d = addDays(d, -1)) streak += 1
  if (streak < PATCH.minStreak) return null
  const month = today.slice(0, 7)
  const used = Object.keys(days).filter((d) => days[d] === PATCHED && d.slice(0, 7) === month).length
  const left = PATCH.perMonth - used
  return left > 0 ? { date, streak, left, cost: PATCH.cost } : null
}

module.exports = { MILESTONES, PATCH, PATCHED, isMilestone, nextMilestone, milestonesUpTo, badgeLook, patchOffer }
