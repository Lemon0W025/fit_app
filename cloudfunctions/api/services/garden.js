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
  gardenSize,
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
      size: gardenSize(garden.collected.length),
      placed: garden.placed,
      inventory: ITEMS.filter((i) => garden.inventory[i.id] > 0).map((i) => ({ itemId: i.id, count: garden.inventory[i.id] })),
      collected: garden.collected,
      collectedCount: garden.collected.length,
      totalCount: collectibleCount(),
      spinCost: SPIN_COST,
      pityLeft: PITY - garden.gacha.sincePity,
      rates: RARITIES.map(({ id, label, weight }) => ({ id, label, weight })),
      term: termInfo(),
      welcome,
    }
  }

  function checkTile(garden, c, r, ignoreUid) {
    const size = gardenSize(garden.collected.length)
    if (!Number.isInteger(c) || !Number.isInteger(r) || c < 0 || r < 0 || c >= size || r >= size) {
      throw new AppError(CODES.BAD_REQUEST, '放不到庭院外面哦')
    }
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
    // 第一次进庭院：送暖豆，并在中间种一棵大树
    async get(openid) {
      const garden = await load(openid)
      if (garden.welcomed) return view(garden)

      const center = Math.floor((gardenSize(garden.collected.length) - 1) / 2)
      garden.welcomed = true
      garden.beans = { ...garden.beans, bonus: garden.beans.bonus + WELCOME_BEANS }
      garden.placed = garden.placed.concat({ uid: newUid(garden), itemId: STARTER_ITEM, c: center, r: center })
      await repo.saveGarden(openid, garden)
      return view(garden, { beans: WELCOME_BEANS, itemId: STARTER_ITEM })
    },

    async spin(openid) {
      const garden = await load(openid)
      if (beanBalance(garden) < SPIN_COST) {
        throw new AppError(CODES.NO_BEANS, '暖豆不够啦，再打卡一顿就有了')
      }

      const sizeBefore = gardenSize(garden.collected.length)
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

      const size = gardenSize(garden.collected.length)
      return {
        itemId,
        rarity,
        isNew,
        beans: Math.max(0, beanBalance(garden)),
        pityLeft: PITY - garden.gacha.sincePity,
        collectedCount: garden.collected.length,
        size,
        sizeGrew: size > sizeBefore,
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
  }
}

module.exports = { createGardenService }
