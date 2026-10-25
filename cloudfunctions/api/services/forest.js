const { AppError, CODES } = require('../lib/errors')
const { normalizeCamp } = require('../lib/camp-state')
const { sumMeals } = require('../lib/shared/nutrition')
const { dateKey, addDays } = require('../lib/shared/date')
const { dayBeans, mealStamps, beansHint, onTimeCount, streakFrom } = require('../lib/shared/forest')
const { mealTimesOf } = require('../lib/shared/timing')
const { beanBalance } = require('../lib/shared/garden')
const { isMilestone, nextMilestone, milestonesUpTo, badgeLook } = require('../lib/shared/streak')

function daysInMonth(month) {
  const [y, m] = month.split('-').map(Number)
  return new Date(Date.UTC(y, m, 0)).getUTCDate()
}

function shiftMonth(month, n) {
  const [y, m] = month.split('-').map(Number)
  const d = new Date(Date.UTC(y, m - 1 + n, 1))
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

// 营地里和妈妈最亲的那只：喂得最多的，一样多取先来的；没有宠物为空
function closestPet(pets) {
  let best = null
  ;(pets || []).forEach((p) => {
    if (!best || (p.fed || 0) > (best.fed || 0)) best = p
  })
  return best ? best.id : ''
}

// 打卡日历顶上的纪念章：列到下一个里程碑为止（以前拿过更大的也列上），已拿的带第一次的日期和次数
function badgesOf(streakBadges, streak) {
  const next = nextMilestone(streak)
  const upTo = Math.max(next.days, ...Object.keys(streakBadges).map(Number))
  return milestonesUpTo(upTo).map((days) => {
    const got = streakBadges[days]
    const base = { days, ...badgeLook(days) }
    if (got) return { ...base, got: true, first: got.first, times: got.times }
    return days === next.days ? { ...base, got: false, left: next.left } : { ...base, got: false }
  })
}

function createForestService({ repo, now }) {
  async function load(openid) {
    return normalizeCamp(await repo.getGarden(openid))
  }

  // 月初到这一天的打卡（算「本月准时几顿」）
  function monthSoFar(openid, date) {
    return repo.listMealsBetween(openid, `${date.slice(0, 7)}-01`, date)
  }

  // 今天的印章、暖豆、一句提示、连续天数、余额、本月准时几顿、饭点
  function todayView(date, meals, garden, profile, monthMeals) {
    const times = mealTimesOf(profile)
    const streak = streakFrom(garden.days, dateKey(now()))
    return {
      date,
      stamps: mealStamps(meals),
      beansToday: dayBeans(meals).beans,
      hint: beansHint(meals, times, now()),
      streak,
      nextMilestone: nextMilestone(streak),
      beans: Math.max(0, beanBalance(garden)),
      monthOnTime: onTimeCount(monthMeals),
      mealTimes: times,
    }
  }

  return {
    // 打卡新增、重新分析、删除之后调用：按这一天的正餐重算当天的暖豆，重复调用结果不变。
    // 这一天刚从「没算」变成「算了」、连续天数又正好是里程碑时，记一枚纪念章并返回 milestone（同一天只记一次）
    async syncDay(openid, date) {
      const { beans, logged } = dayBeans(await repo.listMeals(openid, date))
      const garden = await load(openid)
      const days = { ...garden.days }
      const earned = { ...garden.beans.earned }
      let streakBadges = garden.streakBadges
      let milestone = null
      if (!logged.length) {
        delete days[date]
        delete earned[date]
      } else {
        const counted = !!days[date]
        days[date] = true
        earned[date] = beans
        const streak = streakFrom(days, date)
        const had = streakBadges[streak]
        if (!counted && isMilestone(streak) && !(had && had.last === date)) {
          const badge = had ? { ...had, last: date, times: had.times + 1 } : { first: date, last: date, times: 1 }
          streakBadges = { ...streakBadges, [streak]: badge }
          milestone = { days: streak, times: badge.times, ...badgeLook(streak), petId: closestPet(garden.pets) }
        }
      }
      await repo.saveGarden(openid, { ...garden, days, beans: { ...garden.beans, earned }, streakBadges })
      return { beans, milestone }
    },

    // profile 不传就自己读（营地页调用时手上没有档案）
    async today(openid, date, meals, profile) {
      const [garden, prof, monthMeals] = await Promise.all([
        load(openid),
        profile === undefined ? repo.getProfile(openid) : profile,
        monthSoFar(openid, date),
      ])
      return todayView(date, meals, garden, prof, monthMeals)
    },

    // 打卡日历：按月显示每天的印章、暖豆、准时几顿
    async get(openid, input) {
      const today = dateKey(now())
      const currentMonth = today.slice(0, 7)
      const month = (input || {}).month || currentMonth
      if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month) || month > currentMonth) {
        throw new AppError(CODES.BAD_REQUEST, '月份不对')
      }

      const start = `${month}-01`
      const end = `${month}-${String(daysInMonth(month)).padStart(2, '0')}`
      const [garden, monthMeals, profile] = await Promise.all([
        load(openid),
        repo.listMealsBetween(openid, start, end),
        repo.getProfile(openid),
      ])
      const earned = garden.beans.earned || {}
      const byDate = {}
      monthMeals.forEach((m) => {
        ;(byDate[m.date] = byDate[m.date] || []).push(m)
      })

      const days = []
      for (let date = start; date <= end; date = addDays(date, 1)) {
        const meals = byDate[date] || []
        const future = date > today
        const day = dayBeans(meals)
        days.push({
          date,
          day: Number(date.slice(8)),
          future,
          stamps: future ? [] : mealStamps(meals),
          // 记过的日子按当时得的（规则改过以前的日子不变），没记过的按现在的规则算
          beans: future ? 0 : date in earned ? earned[date] : day.beans,
          onTime: future ? 0 : day.onTime.length,
          mealsCount: meals.length,
          kcal: sumMeals(meals).kcal,
        })
      }

      const current = month === currentMonth
      const todayMeals = current ? byDate[today] || [] : await repo.listMeals(openid, today)
      const todayMonth = current ? monthMeals.filter((m) => m.date <= today) : await monthSoFar(openid, today)
      const [y, m] = month.split('-').map(Number)
      return {
        month,
        monthLabel: `${y}年${m}月`,
        prevMonth: shiftMonth(month, -1),
        nextMonth: month < currentMonth ? shiftMonth(month, 1) : null,
        firstWeekday: new Date(Date.UTC(y, m - 1, 1)).getUTCDay(),
        days,
        stats: {
          days: days.filter((d) => d.beans > 0).length,
          beans: days.reduce((sum, d) => sum + d.beans, 0),
          onTime: days.reduce((sum, d) => sum + d.onTime, 0),
        },
        today: todayView(today, todayMeals, garden, profile, todayMonth),
        totalDays: Object.keys(garden.days).length,
        badges: badgesOf(garden.streakBadges, streakFrom(garden.days, today)),
      }
    },
  }
}

module.exports = { createForestService }
