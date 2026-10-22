const { AppError, CODES } = require('../lib/errors')
const { sumMeals } = require('../lib/shared/nutrition')
const { dateKey, addDays } = require('../lib/shared/date')
const {
  STAGE_LABELS,
  SPECIES,
  DEFAULT_SPECIES,
  dayTree,
  treeHint,
  streakFrom,
  unlockedFor,
  nextUnlock,
  speciesName,
} = require('../lib/shared/forest')

function emptyGarden() {
  return { currentSpecies: DEFAULT_SPECIES, days: {}, unlocked: [DEFAULT_SPECIES], unseen: [] }
}

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
    const garden = await repo.getGarden(openid)
    return garden ? { ...emptyGarden(), ...garden } : emptyGarden()
  }

  function treeOn(garden, date, meals) {
    const tree = dayTree(meals)
    const species = garden.days[date] || garden.currentSpecies
    return {
      date,
      stage: tree.stage,
      stageLabel: STAGE_LABELS[tree.stage],
      species,
      speciesName: speciesName(species),
      hint: treeHint(tree),
    }
  }

  // 今日树 + 连续天数 + 新解锁的树种（只返回一次，读完即标记为已看）
  async function todayView(openid, garden, date, meals) {
    const view = {
      ...treeOn(garden, date, meals),
      streak: streakFrom(garden.days, dateKey(now())),
      totalTrees: Object.keys(garden.days).length,
      newlyUnlocked: garden.unseen.map((id) => ({ id, name: speciesName(id) })),
    }
    if (garden.unseen.length) await repo.saveGarden(openid, { ...garden, unseen: [] })
    return view
  }

  return {
    // 当天第一次打卡正餐时调用：记下这天种的树种，并检查是否解锁新树种
    async recordDay(openid, date) {
      const garden = await load(openid)
      if (garden.days[date]) return garden
      garden.days = { ...garden.days, [date]: garden.currentSpecies }
      const newly = unlockedFor(Object.keys(garden.days).length).filter((id) => garden.unlocked.indexOf(id) === -1)
      garden.unlocked = garden.unlocked.concat(newly)
      garden.unseen = garden.unseen.concat(newly)
      await repo.saveGarden(openid, garden)
      return garden
    },

    // 删除打卡后调用：这天已经没有正餐了，就不再算种了树（已解锁的树种保留）
    async pruneDay(openid, date) {
      const meals = await repo.listMeals(openid, date)
      if (dayTree(meals).stage !== 'empty') return
      const garden = await repo.getGarden(openid)
      if (!garden || !garden.days || !garden.days[date]) return
      const days = { ...garden.days }
      delete days[date]
      await repo.saveGarden(openid, { ...garden, days })
    },

    async today(openid, date, meals) {
      return todayView(openid, await load(openid), date, meals)
    },

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
        days.push({
          date,
          day: Number(date.slice(8)),
          stage: date > today ? 'future' : dayTree(meals).stage,
          species: garden.days[date] || (date === today ? garden.currentSpecies : DEFAULT_SPECIES),
          mealsCount: meals.length,
          kcal: sumMeals(meals).kcal,
        })
      }

      const todayMeals = month === currentMonth ? byDate[today] || [] : await repo.listMeals(openid, today)
      const totalTrees = Object.keys(garden.days).length
      const [y, m] = month.split('-').map(Number)
      return {
        month,
        monthLabel: `${y}年${m}月`,
        prevMonth: shiftMonth(month, -1),
        nextMonth: month < currentMonth ? shiftMonth(month, 1) : null,
        firstWeekday: new Date(Date.UTC(y, m - 1, 1)).getUTCDay(),
        days,
        stats: {
          trees: days.filter((d) => d.stage !== 'empty' && d.stage !== 'future').length,
          fruits: days.filter((d) => d.stage === 'fruit').length,
        },
        today: await todayView(openid, garden, today, todayMeals),
        totalTrees,
        currentSpecies: garden.currentSpecies,
        species: SPECIES.map((s) => ({ id: s.id, name: s.name, unlockAt: s.unlockAt, unlocked: garden.unlocked.indexOf(s.id) !== -1 })),
        nextUnlock: nextUnlock(totalTrees),
      }
    },

    async setSpecies(openid, input) {
      const id = (input || {}).species
      const species = SPECIES.find((s) => s.id === id)
      if (!species) throw new AppError(CODES.BAD_REQUEST, '没有这种树')
      const garden = await load(openid)
      if (garden.unlocked.indexOf(id) === -1) {
        throw new AppError(CODES.BAD_REQUEST, `${species.name}还没解锁，再种 ${species.unlockAt - Object.keys(garden.days).length} 棵树就能解锁`)
      }
      // 今天已经种下的树一起换成新树种；过去的日子保持不变
      const today = dateKey(now())
      const days = garden.days[today] ? { ...garden.days, [today]: id } : garden.days
      await repo.saveGarden(openid, { ...garden, currentSpecies: id, days })
      return { currentSpecies: id }
    },
  }
}

module.exports = { createForestService }
