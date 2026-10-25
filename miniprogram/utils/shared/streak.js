// 与 miniprogram/utils/shared/streak.js 保持一致（test/shared-sync.test.js 会检查）
// 连续打卡的里程碑和纪念章：连续第 3、7、14……天庆祝一次、发一枚纪念章（连续天数怎么算见 forest.js 的 streakFrom）

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

module.exports = { MILESTONES, isMilestone, nextMilestone, milestonesUpTo, badgeLook }
