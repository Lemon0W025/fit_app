// 亲友看板的纯函数：邀请码、称呼、这一刻该告诉亲友哪顿没拍、通知里写什么、点赞（docs/superpowers/specs/2026-10-25-on-time-checkin-design.md 第四块）

const crypto = require('crypto')
const { MAIN_MEALS, MEAL_WORDS, WINDOW_MINUTES, loggedMeals } = require('./shared/timing')
const { localMinutes, dateKey } = require('./shared/date')

// 邀请码：去掉了看着像的 0 / O、1 / I，随机 10 位（约 50 位熵），和 openid 没有关系
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const CODE_LENGTH = 10
const INVITE_DAYS = 7 // 邀请码几天内有效
const INVITE_REUSE_DAYS = 2 // 还剩不到这么多天的不再往外发，换一个新的
const DAY_MS = 24 * 60 * 60 * 1000

const DEFAULT_NAME = '亲友'
const NAME_MAX = 12
const FOLLOWS_MAX = 20 // 一个人最多让几位亲友看、最多看几位亲友
const ALERT_WINDOW_MINUTES = 60 // 过了准时窗口之后多久以内告诉亲友（过了就不补发）
const THING_MAX = 20 // 订阅消息 thing 类字段最多 20 个字

function toMinutes(hhmm) {
  const [h, m] = String(hhmm).split(':').map(Number)
  return h * 60 + m
}

function clockText(minutes) {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return `${h < 10 ? '0' : ''}${h}:${m < 10 ? '0' : ''}${m}`
}

// bytes 不传就用系统的随机数（测试里传固定的）
function newCode(bytes) {
  const buf = bytes || crypto.randomBytes(CODE_LENGTH)
  let out = ''
  for (let i = 0; i < CODE_LENGTH; i++) out += CODE_ALPHABET[buf[i] % CODE_ALPHABET.length]
  return out
}

function isCode(code) {
  return typeof code === 'string' && code.length === CODE_LENGTH && [...code].every((ch) => CODE_ALPHABET.indexOf(ch) !== -1)
}

// 称呼：去掉首尾空白和换行，最多 12 个字；没填就用 fallback（再没有就是「亲友」）
function cleanName(name, fallback) {
  const text = String(name == null ? '' : name).replace(/\s+/g, ' ').trim().slice(0, NAME_MAX)
  if (text) return text
  const other = String(fallback == null ? '' : fallback).replace(/\s+/g, ' ').trim().slice(0, NAME_MAX)
  return other || DEFAULT_NAME
}

// 这一刻该告诉亲友的餐次：过了准时窗口（饭点 + 1 小时）、之后一小时以内，这顿今天还没拍（什么时候拍的都算），今天这顿还没告诉过这位亲友
function planFamilyAlerts({ times, meals, now, sent }) {
  const m = localMinutes(now)
  const today = (sent || {})[dateKey(now)] || {}
  const logged = loggedMeals(meals)
  return MAIN_MEALS.filter((t) => {
    const end = toMinutes(times[t]) + WINDOW_MINUTES
    return m > end && m <= end + ALERT_WINDOW_MINUTES && !logged[t].logged && !today[t]
  })
}

// 「小明的午饭还没拍」：thing 类字段最多 20 个字，名字太长就截掉
function alertTitle(name, mealType) {
  const tail = `的${MEAL_WORDS[mealType]}还没拍`
  const room = THING_MAX - tail.length
  const who = cleanName(name)
  return `${who.length > room ? `${who.slice(0, room - 1)}…` : who}${tail}`
}

// 给亲友的那条通知：和饭点提醒用同一个模板（lib/remind.js 的 messageFor），按模板有的字段填
function alertMessage(template, name, mealType, times, now) {
  const end = clockText(toMinutes(times[mealType]) + WINDOW_MINUTES)
  const values = {
    meal: alertTitle(name, mealType),
    mealTime: `${dateKey(now)} ${times[mealType]}`,
    tip: '提醒 TA 一下吧',
    status: '还没拍',
    name: '小暖自律打卡',
    endTime: `${dateKey(now)} ${end}`,
  }
  const data = {}
  Object.keys(template.fields || {}).forEach((key) => {
    if (values[key] === undefined) return
    data[template.fields[key]] = { value: String(values[key]).slice(0, THING_MAX) }
  })
  return data
}

// 点赞：一个人对一顿只能赞一次；返回 null 表示已经赞过
function addLike(likes, openid, name, at) {
  const list = Array.isArray(likes) ? likes : []
  if (list.some((l) => l.openid === openid)) return null
  return list.concat([{ openid, name: cleanName(name), at }])
}

module.exports = {
  CODE_LENGTH,
  INVITE_DAYS,
  INVITE_REUSE_DAYS,
  DAY_MS,
  DEFAULT_NAME,
  NAME_MAX,
  FOLLOWS_MAX,
  ALERT_WINDOW_MINUTES,
  newCode,
  isCode,
  cleanName,
  planFamilyAlerts,
  alertTitle,
  alertMessage,
  addLike,
}
