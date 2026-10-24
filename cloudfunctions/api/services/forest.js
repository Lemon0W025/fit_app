const { AppError, CODES } = require('../lib/errors')
const { normalizeCamp } = require('../lib/camp-state')
const { sumMeals } = require('../lib/shared/nutrition')
const { dateKey, addDays } = require('../lib/shared/date')
const { dayTree, mealStamps, beansHint, streakFrom } = require('../lib/shared/forest')
const { STAGE_BEANS, beanBalance, nextStageGain } = require('../lib/shared/garden')

function daysInMonth(month) {
  const [y, m] = month.split('-').map(Number)
  return new Date(Date.UTC(y, m, 0)).getUTCDate()
}

function shiftMonth(month, n) {
  const [y, m] = month.split('-').map(Number)
  const d = new Date(Date.UTC(y, m - 1 + n, 1))
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

function createForestService({ repo, now }) {
  async function load(openid) {
    return normalizeCamp(await repo.getGarden(openid))
  }

  async function todayView(openid, date, meals, garden) {
    const tree = dayTree(meals)
    return {
      date,
      stamps: mealStamps(meals),
      beansToday: STAGE_BEANS[tree.stage],
      nextGain: nextStageGain(tree.stage),
      hint: beansHint(tree),
      streak: streakFrom(garden.days, dateKey(now())),
      beans: Math.max(0, beanBalance(garden)),
    }
  }

  return {
    // 打卡新增、重新分析、删除之后调用：按这一天的正餐重算当天的暖豆，重复调用结果不变
    async syncDay(openid, date) {
      const stage = dayTree(await repo.listMeals(openid, date)).stage
      const beans = STAGE_BEANS[stage]
      const garden = await load(openid)
      const days = { ...garden.days }
      const earned = { ...garden.beans.earned }
      if (stage === 'empty') {
        delete days[date]
        delete earned[date]
      } else {
        days[date] = true
        earned[date] = beans
      }
      await repo.saveGarden(openid, { ...garden, days, beans: { ...garden.beans, earned } })
      return { stage, beans }
    },

    async today(openid, date, meals) {
      return todayView(openid, date, meals, await load(openid))
    },

    // 打卡日历：按月显示每天的印章和暖豆
    async get(openid, input) {
      const today = dateKey(now())
      const currentMonth = today.slice(0, 7)
      const month = (input || {}).month || currentMonth
      if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month) || month > currentMonth) {
        throw new AppError(CODES.BAD_REQUEST, '月份不对')
      }

      const start = `${month}-01`
      const end = `${month}-${String(daysInMonth(month)).padStart(2, '0')}`
      const [garden, monthMeals] = await Promise.all([load(openid), repo.listMealsBetween(openid, start, end)])
      const byDate = {}
      monthMeals.forEach((m) => {
        ;(byDate[m.date] = byDate[m.date] || []).push(m)
      })

      const days = []
      for (let date = start; date <= end; date = addDays(date, 1)) {
        const meals = byDate[date] || []
        const future = date > today
        days.push({
          date,
          day: Number(date.slice(8)),
          future,
          stamps: future ? [] : mealStamps(meals),
          beans: future ? 0 : STAGE_BEANS[dayTree(meals).stage],
          mealsCount: meals.length,
          kcal: sumMeals(meals).kcal,
        })
      }

      const todayMeals = month === currentMonth ? byDate[today] || [] : await repo.listMeals(openid, today)
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
        },
        today: await todayView(openid, today, todayMeals, garden),
        totalDays: Object.keys(garden.days).length,
      }
    },
  }
}

module.exports = { createForestService }
