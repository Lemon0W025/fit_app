// 与 miniprogram/utils/shared/date.js 保持一致（test/shared-sync.test.js 会检查）
// 所有日期按东八区计算，避免云函数（UTC）和手机时区不一致导致"今天"错位

const CN_OFFSET_MINUTES = 480
const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']

function pad2(n) {
  return n < 10 ? '0' + n : String(n)
}

function shifted(date, offsetMinutes) {
  return new Date(date.getTime() + offsetMinutes * 60000)
}

function dateKey(date = new Date(), offsetMinutes = CN_OFFSET_MINUTES) {
  const d = shifted(date, offsetMinutes)
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`
}

function localHour(date = new Date(), offsetMinutes = CN_OFFSET_MINUTES) {
  return shifted(date, offsetMinutes).getUTCHours()
}

function timeText(ms, offsetMinutes = CN_OFFSET_MINUTES) {
  const d = shifted(new Date(ms), offsetMinutes)
  return `${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}`
}

function parseKey(key) {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d))
}

function isDateKey(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false
  return dateKey(parseKey(s), 0) === s
}

function addDays(key, n) {
  const d = parseKey(key)
  d.setUTCDate(d.getUTCDate() + n)
  return dateKey(d, 0)
}

function dateLabel(key) {
  const d = parseKey(key)
  return `${d.getUTCMonth() + 1}月${d.getUTCDate()}日 ${WEEKDAYS[d.getUTCDay()]}`
}

module.exports = {
  CN_OFFSET_MINUTES,
  dateKey,
  localHour,
  timeText,
  isDateKey,
  addDays,
  dateLabel,
}
