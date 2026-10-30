// 饭点提醒页的展示和手机日历的三个事件（纯函数，有单测）
const { MAIN_MEALS, MEAL_WORDS, windowText } = require('./shared/timing')

const APP_NAME = '小暖养生'

const sameTimes = (a, b) => !!a && !!b && MAIN_MEALS.every((t) => a[t] === b[t])

// remind.get 的结果 → 页面要的
function remindView(res) {
  const times = res.mealTimes
  const cal = res.calendar
  const stale = !!cal && !sameTimes(cal.times, times)
  return {
    times: MAIN_MEALS.map((t) => ({ mealType: t, word: MEAL_WORDS[t], time: times[t], window: windowText(t, times) })),
    calendarText: cal && !stale ? `已加好（${MAIN_MEALS.map((t) => times[t]).join(' / ')}）` : '',
    calendarStale: stale,
    calendarButton: !cal ? '在手机日历里加三个饭点闹钟' : stale ? '按新饭点再加一次' : '再加一次',
    wechat: !!res.templateId,
    notify: !!res.notify,
    creditsText: res.credits > 0 ? `还能提醒 ${res.credits} 次` : '次数用完了：拍照打卡时点「允许」就会攒上',
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

// wx.addPhoneRepeatCalendar 的三份参数：饭点那一刻响、每天重复
function calendarEvents(times, now) {
  return MAIN_MEALS.map((t) => ({
    title: `小暖提醒：拍${MEAL_WORDS[t]}（${windowText(t, times)} 准时）`,
    startTime: nextAt(times[t], now),
    description: `打开微信，聊天列表往下一拉就能看到「${APP_NAME}」，点进去拍${MEAL_WORDS[t]}。准时拍能得 15 暖豆`,
    alarm: true,
    alarmOffset: 0,
    repeatInterval: 'day',
  }))
}

module.exports = { remindView, calendarEvents, nextAt }
