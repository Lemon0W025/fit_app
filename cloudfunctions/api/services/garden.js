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
  waitingAnimals,
} = require('../lib/shared/garden')
const { AREAS, STARTER_TILE, canUnlock, unlockProblem, placeProblem } = require('../lib/shared/estate')

const HIGH_RARITIES = ['epic', 'legendary']

// getGrant：返回当前的测试福利（见 config.testGrant），没有就是 null
// forest：用来在 get 里带上今天的暖豆和印章
function createGardenService({ repo, now, random = Math.random, getGrant = () => null, forest = null }) {
  async function load(openid) {
    return normalizeGarden(await repo.getGarden(openid))
  }

  function termInfo() {
    const term = currentTerm(dateKey(now()))
    if (!term) return null
    return { name: term.name, items: ITEMS.filter((i) => i.term === term.key).map((i) => i.id) }
  }

  function view(garden, welcome = null, testGift = 0) {
    return {
      beans: Math.max(0, beanBalance(garden)),
      areas: AREAS.map(({ id, name, cost }) => ({
        id, name, cost, unlocked: garden.opened.indexOf(id) !== -1, unlockable: canUnlock(garden.opened, id),
      })),
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
      testGift,
    }
  }

  function checkTile(garden, itemId, c, r, ignoreUid) {
    const problem = placeProblem(garden.opened, garden.placed, itemId, c, r, ignoreUid)
    if (problem) throw new AppError(CODES.BAD_REQUEST, problem)
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
    // 第一次进花园：送暖豆，并种一棵大树。花园页带 markSeen：新住户看过了
    async get(openid, input) {
      const doc = await repo.getGarden(openid)
      const garden = normalizeGarden(doc)
      const migrated = !(doc && doc.estate)
      let welcome = null
      if (!garden.welcomed) {
        garden.welcomed = true
        garden.beans = { ...garden.beans, bonus: garden.beans.bonus + WELCOME_BEANS }
        garden.placed = garden.placed.concat({ uid: newUid(garden), itemId: STARTER_ITEM, c: STARTER_TILE.c, r: STARTER_TILE.r })
        welcome = { beans: WELCOME_BEANS, itemId: STARTER_ITEM }
      }
      // 测试福利：期限内每个 id 只送一次
      const grant = getGrant()
      let testGift = 0
      if (grant && dateKey(now()) <= grant.until && garden.grants.indexOf(grant.id) === -1) {
        garden.grants = garden.grants.concat(grant.id)
        garden.beans = { ...garden.beans, bonus: garden.beans.bonus + grant.beans }
        testGift = grant.beans
      }
      const result = view(garden, welcome, testGift)
      const seen = !!(input && input.markSeen) && garden.arrivals.length > 0
      if (seen) garden.arrivals = []
      if (welcome || seen || testGift || migrated) await repo.saveGarden(openid, garden)
      // 首页要用：没建档就去建档；左上角显示今天的暖豆和印章
      result.hasProfile = !!(await repo.getProfile(openid))
      result.daily = null
      if (forest) {
        const today = dateKey(now())
        result.daily = await forest.today(openid, today, await repo.listMeals(openid, today))
      }
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
      const { itemId, c, r, flip } = input || {}
      const garden = await load(openid)
      if (!itemById(itemId) || !(garden.inventory[itemId] > 0)) {
        throw new AppError(CODES.BAD_REQUEST, '背包里没有这个了')
      }
      checkTile(garden, itemId, c, r)
      const inventory = { ...garden.inventory, [itemId]: garden.inventory[itemId] - 1 }
      if (!inventory[itemId]) delete inventory[itemId]
      garden.inventory = inventory
      garden.placed = garden.placed.concat({ uid: newUid(garden), itemId, c, r, flip: !!flip })
      await repo.saveGarden(openid, garden)
      return view(garden)
    },

    async move(openid, input) {
      const { uid, c, r } = input || {}
      const garden = await load(openid)
      const placed = findPlaced(garden, uid)
      checkTile(garden, placed.itemId, c, r, uid)
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

    // 换个方向：左右镜像
    async flip(openid, input) {
      const { uid } = input || {}
      const garden = await load(openid)
      const placed = findPlaced(garden, uid)
      garden.placed = garden.placed.map((p) => (p.uid === uid ? { ...p, flip: !placed.flip } : p))
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

    // 修整院子：要挨着已经修好的院子，花暖豆
    async unlock(openid, input) {
      const id = (input || {}).area
      const garden = await load(openid)
      const problem = unlockProblem(garden.opened, id)
      if (problem) throw new AppError(CODES.BAD_REQUEST, problem)
      const area = AREAS.find((a) => a.id === id)
      if (beanBalance(garden) < area.cost) throw new AppError(CODES.NO_BEANS, `暖豆不够啦，修整要 ${area.cost} 暖豆，再攒攒`)
      garden.beans = { ...garden.beans, spent: garden.beans.spent + area.cost }
      garden.opened = garden.opened.concat(id)
      await repo.saveGarden(openid, garden)
      return view(garden)
    },
  }
}

module.exports = { createGardenService }
