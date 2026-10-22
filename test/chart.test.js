const test = require('node:test')
const assert = require('node:assert/strict')
const { computeChart } = require('../miniprogram/utils/chart')

const box = { width: 300, height: 200, padding: 20 }

test('空数据', () => {
  assert.deepEqual(computeChart([], box), { points: [], min: 0, max: 0, targetY: null })
})

test('首尾点贴着左右边距，最大值在最上面', () => {
  const { points } = computeChart([70, 68, 69], box)
  assert.equal(points[0].x, 20)
  assert.equal(points[2].x, 280)
  assert.equal(points[1].x, 150)
  assert.ok(points[0].y < points[2].y)
  assert.ok(points[2].y < points[1].y)
  points.forEach((p) => {
    assert.ok(p.y >= 20 && p.y <= 180)
  })
  assert.equal(points[0].value, 70)
})

test('数值全部相同时不会除以零', () => {
  const { points, min, max } = computeChart([60, 60, 60], box)
  assert.ok(max > min)
  points.forEach((p) => assert.ok(Number.isFinite(p.y)))
  assert.equal(points[0].y, points[1].y)
})

test('只有一个点时水平居中', () => {
  const { points } = computeChart([65], box)
  assert.equal(points.length, 1)
  assert.equal(points[0].x, 150)
  assert.ok(Number.isFinite(points[0].y))
})

test('目标体重纳入纵轴范围', () => {
  const { points, targetY, min } = computeChart([70, 69], { ...box, target: 60 })
  assert.ok(min <= 60)
  assert.ok(targetY > points[1].y)
  assert.ok(targetY <= 180)
})
