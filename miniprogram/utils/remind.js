// 饭点提醒页的展示和手机日历的三个事件（纯函数，有单测）
const { MAIN_MEALS, MEAL_WORDS, windowText } = require('./shared/timing')

const APP_NAME = '小暖自律打卡'

// remind.get 的结果 → 页面要的
function remindView(res) {
  const times = res.mealTimes
  const cal = res.calendar
  // 加了哪几顿：老记录（没有 meals）只算早饭（以前连着加三个，微信只认第一个）
  const meals = cal ? cal.meals || (cal.times && cal.times.breakfast ? { breakfast: cal.times.breakfast } : {}) : {}
  const calendarRows = MAIN_MEALS.map((t) => {
    const at = meals[t]
    const stale = !!at && at !== times[t]
    return { mealType: t, word: MEAL_WORDS[t], time: times[t], added: !!at && !stale, stale, button: stale ? '按新饭点加' : '加上' }
  })
  return {
    times: MAIN_MEALS.map((t) => ({ mealType: t, word: MEAL_WORDS[t], time: times[t], window: windowText(t, times) })),
    calendarRows,
    calendarStale: calendarRows.some((r) => r.stale),
    calendarAll: calendarRows.every((r) => r.added),
    wechat: !!res.templateId,
    notify: !!res.notify,
    creditsText: res.credits > 0 ? `还能提醒 ${res.credits} 次` : '次数用完了：拍照打卡时点「允许」就会攒上',
    // 什么时候会提醒：到饭点这顿还没拍就发，提前拍了就不打扰
    whenText: res.nudgeAt ? `到饭点就提醒：${MAIN_MEALS.map((t) => `${MEAL_WORDS[t]} ${res.nudgeAt[t]}`).join('、')}。提前拍了就不打扰。` : '',
    lastText: res.lastText || '',
    tickText: res.tickText || '',
  }
}

// 下一次到这个钟点（今天还没过就是今天，过了就是明天）的秒数，手机本地时间
function nextAt(hhmm, now) {
  const [h, m] = hhmm.split(':').map(Number)
  const d = new Date(now.getTime())
  d.setHours(h, m, 0, 0)
  if (d.getTime() <= now.getTime()) d.setDate(d.getDate() + 1)
  return Math.floor(d.getTime() / 1000)
}

// wx.addPhoneRepeatCalendar 的参数：饭点那一刻响、每天重复。微信规定一次点击只能加一个（连着加第二个会报
// 「can only be invoked by user TAP gesture」），所以页面上三顿各一个按钮
function calendarEvent(times, now, t) {
  return {
    title: `小暖提醒：拍${MEAL_WORDS[t]}（${windowText(t, times)} 准时）`,
    startTime: nextAt(times[t], now),
    description: `打开微信，聊天列表往下一拉就能看到「${APP_NAME}」，点进去拍${MEAL_WORDS[t]}。准时拍能得 15 暖豆`,
    alarm: true,
    alarmOffset: 0,
    repeatInterval: 'day',
  }
}

function calendarEvents(times, now) {
  return MAIN_MEALS.map((t) => calendarEvent(times, now, t))
}

// 现在用的是哪个版本（开发版预览 develop / 体验版 trial / 正式版 release）：攒「允许」时带上，点通知打开同一个版本
function appVersion() {
  try {
    return wx.getAccountInfoSync().miniProgram.envVersion || ''
  } catch (e) {
    return ''
  }
}

module.exports = { remindView, calendarEvent, calendarEvents, nextAt, appVersion }
