const { AppError, CODES } = require('../lib/errors')
const { normalizeGarden } = require('../lib/garden-state')
const { dateKey } = require('../lib/shared/date')
const {
  RARITIES,
  ITEMS,
  STARTER_ITEM,
  SPIN_COST,
  WELCOME_BEANS,
  PITY,
  itemById,
  collectibleCount,
  beanBalance,
  rollRarity,
  pickItem,
  currentTerm,
  PLOT_SIZE,
  PLOT_GRID,
  CENTER_PLOT,
  parsePlot,
  canExpand,
  expandCost,
  inWorld,
  tileOpen,
  waitingAnimals,
} = require('../lib/shared/garden')

const HIGH_RARITIES = ['epic', 'legendary']

function createGardenService({ repo, now, random = Math.random }) {
  async function load(openid) {
    return normalizeGarden(await repo.getGarden(openid))
  }

  function termInfo() {
    const term = currentTerm(dateKey(now()))
    if (!term) return null
    return { name: term.name, items: ITEMS.filter((i) => i.term === term.key).map((i) => i.id) }
  }

  function view(garden, welcome = null) {
    return {
      beans: Math.max(0, beanBalance(garden)),
      world: { plotSize: PLOT_SIZE, grid: PLOT_GRID },
      plots: garden.plots,
      expandCost: garden.plots.length >= PLOT_GRID * PLOT_GRID ? null : expandCost(garden.plots.length),
      placed: garden.placed,
      inventory: ITEMS.filter((i) => garden.inventory[i.id] > 0).map((i) => ({ itemId: i.id, count: garden.inventory[i.id] })),
      collected: garden.collected,
      collectedCount: garden.collected.length,
      totalCount: collectibleCount(),
      spinCost: SPIN_COST,
      pityLeft: PITY - garden.gacha.sincePity,
      rates: RARITIES.map(({ id, label, weight }) => ({ id, label, weight })),
      term: termInfo(),
      residents: garden.residents.map((r) => r.id),
      arrivals: garden.arrivals,
      waiting: waitingAnimals(garden.placed, garden.residents.map((r) => r.id)),
      welcome,
    }
  }

  function checkTile(garden, c, r, ignoreUid) {
    if (!inWorld(c, r)) throw new AppError(CODES.BAD_REQUEST, '放不到庭院外面哦')
    if (!tileOpen(garden.plots, c, r)) throw new AppError(CODES.BAD_REQUEST, '这块地还没开荒呢')
    if (garden.placed.some((p) => p.c === c && p.r === r && p.uid !== ignoreUid)) {
      throw new AppError(CODES.BAD_REQUEST, '这块地上已经有东西了')
    }
  }


  function findPlaced(garden, uid) {
    const placed = garden.placed.find((p) => p.uid === uid)
    if (!placed) throw new AppError(CODES.NOT_FOUND, '找不到这件东西了')
    return placed
  }

  function newUid(garden) {
    garden.seq += 1
    return `p${garden.seq}`
  }

  return {
    // 第一次进庭院：送暖豆，并在中间种一棵大树。庭院页带 markSeen：新住户看过了
    async get(openid, input) {
      const garden = await load(openid)
      let welcome = null
      if (!garden.welcomed) {
        // 地图正中：中间那块地的中心
        const [pc, pr] = CENTER_PLOT.split(',').map(Number)
        const center = { c: pc * PLOT_SIZE + Math.floor((PLOT_SIZE - 1) / 2), r: pr * PLOT_SIZE + Math.floor((PLOT_SIZE - 1) / 2) }
        garden.welcomed = true
        garden.beans = { ...garden.beans, bonus: garden.beans.bonus + WELCOME_BEANS }
        garden.placed = garden.placed.concat({ uid: newUid(garden), itemId: STARTER_ITEM, c: center.c, r: center.r })
        welcome = { beans: WELCOME_BEANS, itemId: STARTER_ITEM }
      }
      const result = view(garden, welcome)
      const seen = !!(input && input.markSeen) && garden.arrivals.length > 0
      if (seen) garden.arrivals = []
      if (welcome || seen) await repo.saveGarden(openid, garden)
      return result
    },

    async spin(openid) {
      const garden = await load(openid)
      if (beanBalance(garden) < SPIN_COST) {
        throw new AppError(CODES.NO_BEANS, '暖豆不够啦，再打卡一顿就有了')
      }

      const term = currentTerm(dateKey(now()))
      const rarity = rollRarity(random(), garden.gacha.sincePity)
      const itemId = pickItem(rarity, term && term.key, random())
      const isNew = garden.collected.indexOf(itemId) === -1

      garden.beans = { ...garden.beans, spent: garden.beans.spent + SPIN_COST }
      garden.inventory = { ...garden.inventory, [itemId]: (garden.inventory[itemId] || 0) + 1 }
      if (isNew) garden.collected = garden.collected.concat(itemId)
      garden.gacha = {
        pulls: garden.gacha.pulls + 1,
        sincePity: HIGH_RARITIES.indexOf(rarity) !== -1 ? 0 : garden.gacha.sincePity + 1,
      }
      await repo.saveGarden(openid, garden)

      return {
        itemId,
        rarity,
        isNew,
        beans: Math.max(0, beanBalance(garden)),
        pityLeft: PITY - garden.gacha.sincePity,
        collectedCount: garden.collected.length,
      }
    },

    async place(openid, input) {
      const { itemId, c, r } = input || {}
      const garden = await load(openid)
      if (!itemById(itemId) || !(garden.inventory[itemId] > 0)) {
        throw new AppError(CODES.BAD_REQUEST, '背包里没有这个了')
      }
      checkTile(garden, c, r)
      const inventory = { ...garden.inventory, [itemId]: garden.inventory[itemId] - 1 }
      if (!inventory[itemId]) delete inventory[itemId]
      garden.inventory = inventory
      garden.placed = garden.placed.concat({ uid: newUid(garden), itemId, c, r })
      await repo.saveGarden(openid, garden)
      return view(garden)
    },

    async move(openid, input) {
      const { uid, c, r } = input || {}
      const garden = await load(openid)
      findPlaced(garden, uid)
      checkTile(garden, c, r, uid)
      garden.placed = garden.placed.map((p) => (p.uid === uid ? { ...p, c, r } : p))
      await repo.saveGarden(openid, garden)
      return view(garden)
    },

    async stash(openid, input) {
      const { uid } = input || {}
      const garden = await load(openid)
      const placed = findPlaced(garden, uid)
      garden.placed = garden.placed.filter((p) => p.uid !== uid)
      garden.inventory = { ...garden.inventory, [placed.itemId]: (garden.inventory[placed.itemId] || 0) + 1 }
      await repo.saveGarden(openid, garden)
      return view(garden)
    },

    // 正餐打卡后调用：有在等的小动物就搬来一只
    async arrive(openid) {
      const garden = await load(openid)
      const next = waitingAnimals(garden.placed, garden.residents.map((r) => r.id))[0]
      if (!next) return null
      garden.residents = garden.residents.concat({ id: next, since: dateKey(now()) })
      garden.arrivals = garden.arrivals.concat(next)
      if (garden.collected.indexOf(next) === -1) garden.collected = garden.collected.concat(next)
      await repo.saveGarden(openid, garden)
      return { id: next, name: itemById(next).name }
    },

    // 开荒：花暖豆开垦一块挨着已开垦土地的荒地
    async expand(openid, input) {
      const key = (input || {}).plot
      const garden = await load(openid)
      if (!parsePlot(key)) throw new AppError(CODES.BAD_REQUEST, '这块地不在庭院里')
      if (garden.plots.indexOf(key) !== -1) throw new AppError(CODES.BAD_REQUEST, '这块地已经开垦过了')
      if (!canExpand(garden.plots, key)) throw new AppError(CODES.BAD_REQUEST, '要挨着已经开垦的地才能开荒')
      const cost = expandCost(garden.plots.length)
      if (beanBalance(garden) < cost) throw new AppError(CODES.NO_BEANS, `暖豆不够啦，开荒要 ${cost} 暖豆，再攒攒`)
      garden.beans = { ...garden.beans, spent: garden.beans.spent + cost }
      garden.plots = garden.plots.concat(key)
      await repo.saveGarden(openid, garden)
      return view(garden)
    },
  }
}

module.exports = { createGardenService }
