const test = require('node:test')
const assert = require('node:assert/strict')
const {
  dateKey,
  localHour,
  timeText,
  isDateKey,
  addDays,
  dateLabel,
} = require('../cloudfunctions/api/lib/shared/date')

test('dateKey 使用东八区，UTC 16:30 已是北京时间次日', () => {
  assert.equal(dateKey(new Date('2026-10-22T16:30:00Z')), '2026-10-23')
  assert.equal(dateKey(new Date('2026-10-22T15:59:00Z')), '2026-10-22')
})

test('dateKey 支持自定义时区偏移', () => {
  assert.equal(dateKey(new Date('2026-10-22T16:30:00Z'), 0), '2026-10-22')
})

test('localHour 返回东八区小时', () => {
  assert.equal(localHour(new Date('2026-10-22T16:30:00Z')), 0)
  assert.equal(localHour(new Date('2026-10-22T04:00:00Z')), 12)
})

test('timeText 格式化毫秒时间戳为 HH:mm', () => {
  assert.equal(timeText(Date.UTC(2026, 9, 22, 4, 5)), '12:05')
  assert.equal(timeText(Date.UTC(2026, 9, 22, 15, 59)), '23:59')
})

test('isDateKey 校验格式和真实日期', () => {
  assert.equal(isDateKey('2026-02-28'), true)
  assert.equal(isDateKey('2026-02-30'), false)
  assert.equal(isDateKey('2026-2-28'), false)
  assert.equal(isDateKey(''), false)
  assert.equal(isDateKey(undefined), false)
})

test('addDays 跨月跨年', () => {
  assert.equal(addDays('2026-12-31', 1), '2027-01-01')
  assert.equal(addDays('2026-03-01', -1), '2026-02-28')
})

test('dateLabel 输出中文月日与星期', () => {
  assert.equal(dateLabel('2026-10-22'), '10月22日 周四')
  assert.equal(dateLabel('2026-10-25'), '10月25日 周日')
})
