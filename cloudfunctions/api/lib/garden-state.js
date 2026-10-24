// gardens 文档的完整形状：老数据或新用户缺的字段补上默认值，去掉已经废弃的字段

const { ANIMALS, STARTER_ITEM } = require('./shared/garden')
const { START_OPENED, STARTER_TILE, placeProblem } = require('./shared/estate')

const LEGACY_FIELDS = ['currentSpecies', 'unlocked', 'unseen']
// 小岛时代修整角落的价格，迁移时按这个退
const ISLAND_COSTS = { pond: 200, bamboo: 300, veg: 400, tea: 500 }

const isAnimal = (id) => ANIMALS.indexOf(id) !== -1

// 旧数据（小岛、3×3 大地图、更早的小庭院）换成宅院：摆的东西全收回背包，大树重新种在正院，
// 修整 / 开荒花的暖豆退回。写上 estate: 1，以后不再迁移
function adoptEstate(garden, doc) {
  const { plots, ...rest } = garden
  if (doc.estate) return { ...rest, estate: doc.estate, opened: doc.opened || START_OPENED.slice() }
  let refund = 0
  // 大地图开荒的价格：100、150、200……
  if (doc.plots) for (let k = 1; k < doc.plots.length; k++) refund += 100 + 50 * (k - 1)
  if (doc.opened) doc.opened.forEach((id) => { refund += ISLAND_COSTS[id] || 0 })
  const inventory = { ...garden.inventory }
  garden.placed.forEach((p) => {
    if (p.itemId === STARTER_ITEM) return
    inventory[p.itemId] = (inventory[p.itemId] || 0) + 1
  })
  const replant = garden.welcomed
  return {
    ...rest,
    estate: 1,
    opened: START_OPENED.slice(),
    inventory,
    placed: replant ? [{ uid: `p${garden.seq + 1}`, itemId: STARTER_ITEM, c: STARTER_TILE.c, r: STARTER_TILE.r }] : [],
    seq: replant ? garden.seq + 1 : garden.seq,
    beans: { ...garden.beans, bonus: garden.beans.bonus + refund },
  }
}

// 第二版原画（2026-10-24）把院子、水、建筑的格子都照画重定了：原来摆的东西现在摆不下的收回背包，大树挪到新的起始格。写上 estate: 2
function adoptEstate2(garden) {
  if (garden.estate >= 2) return garden
  const inventory = { ...garden.inventory }
  const placed = []
  const order = garden.placed.slice().sort((a, b) => (b.itemId === STARTER_ITEM) - (a.itemId === STARTER_ITEM))
  order.forEach((p) => {
    if (!placeProblem(garden.opened, placed, p.itemId, p.c, p.r)) return placed.push(p)
    if (p.itemId === STARTER_ITEM && !placeProblem(garden.opened, placed, p.itemId, STARTER_TILE.c, STARTER_TILE.r)) {
      return placed.push({ ...p, c: STARTER_TILE.c, r: STARTER_TILE.r })
    }
    inventory[p.itemId] = (inventory[p.itemId] || 0) + 1
  })
  return { ...garden, estate: 2, inventory, placed }
}

// 以前小动物是扭蛋抽的：背包里、花园里的直接变成住户（不算新住户，免得一次走进来一群）
function adoptAnimals(garden) {
  const found = garden.placed.filter((p) => isAnimal(p.itemId)).map((p) => p.itemId)
    .concat(Object.keys(garden.inventory).filter(isAnimal))
  if (!found.length) return garden
  const residents = garden.residents.slice()
  const collected = garden.collected.slice()
  found.forEach((id) => {
    if (!residents.some((r) => r.id === id)) residents.push({ id, since: null })
    if (collected.indexOf(id) === -1) collected.push(id)
  })
  const inventory = { ...garden.inventory }
  found.forEach((id) => delete inventory[id])
  return { ...garden, residents, collected, inventory, placed: garden.placed.filter((p) => !isAnimal(p.itemId)) }
}

function normalizeGarden(doc) {
  const g = { ...(doc || {}) }
  LEGACY_FIELDS.forEach((k) => delete g[k])
  const beans = g.beans || {}
  const gacha = g.gacha || {}
  // 修好了哪些院子（opened）和 estate 标记由 adoptEstate 给
  return adoptAnimals(adoptEstate2(adoptEstate({
    ...g,
    days: g.days || {},
    beans: { earned: beans.earned || {}, bonus: beans.bonus || 0, spent: beans.spent || 0 },
    inventory: g.inventory || {},
    placed: g.placed || [],
    collected: g.collected || [],
    gacha: { pulls: gacha.pulls || 0, sincePity: gacha.sincePity || 0 },
    welcomed: !!g.welcomed,
    // 摆放物品的编号计数器
    seq: g.seq || 0,
    // 住进来的小动物 [{ id, since }]，和还没在花园里看到的新住户
    residents: g.residents || [],
    arrivals: g.arrivals || [],
    // 已经领过的测试福利 id
    grants: g.grants || [],
  }, g)))
}

module.exports = { normalizeGarden }
