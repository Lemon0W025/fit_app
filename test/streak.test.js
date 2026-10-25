const test = require('node:test')
const assert = require('node:assert/strict')
const { MILESTONES, isMilestone, nextMilestone, milestonesUpTo, badgeLook } = require('../cloudfunctions/api/lib/shared/streak')

test('isMilestone：列表里的、365 以后每满 100 天', () => {
  for (const d of MILESTONES) assert.equal(isMilestone(d), true, String(d))
  for (const d of [0, 1, 2, 4, 6, 8, 29, 31, 364, 366, 400, 464]) assert.equal(isMilestone(d), false, String(d))
  for (const d of [465, 565, 1065]) assert.equal(isMilestone(d), true, String(d))
})

test('nextMilestone：下一个里程碑和还差几天', () => {
  assert.deepEqual(nextMilestone(0), { days: 3, left: 3 })
  assert.deepEqual(nextMilestone(2), { days: 3, left: 1 })
  assert.deepEqual(nextMilestone(3), { days: 7, left: 4 })
  assert.deepEqual(nextMilestone(300), { days: 365, left: 65 })
  assert.deepEqual(nextMilestone(365), { days: 465, left: 100 })
  assert.deepEqual(nextMilestone(366), { days: 465, left: 99 })
  assert.deepEqual(nextMilestone(465), { days: 565, left: 100 })
  assert.deepEqual(nextMilestone(undefined), { days: 3, left: 3 })
})

test('milestonesUpTo：不超过这个天数的里程碑', () => {
  assert.deepEqual(milestonesUpTo(2), [])
  assert.deepEqual(milestonesUpTo(7), [3, 7])
  assert.deepEqual(milestonesUpTo(20), [3, 7, 14])
  assert.deepEqual(milestonesUpTo(565).slice(-3), [365, 465, 565])
})

test('badgeLook：铜、银、金，365 起带光', () => {
  assert.deepEqual(badgeLook(3), { tier: 'bronze', glow: false })
  assert.deepEqual(badgeLook(7), { tier: 'bronze', glow: false })
  assert.deepEqual(badgeLook(14), { tier: 'silver', glow: false })
  assert.deepEqual(badgeLook(30), { tier: 'silver', glow: false })
  assert.deepEqual(badgeLook(60), { tier: 'gold', glow: false })
  assert.deepEqual(badgeLook(365), { tier: 'gold', glow: true })
  assert.deepEqual(badgeLook(465), { tier: 'gold', glow: true })
})
