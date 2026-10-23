// gardens 文档的完整形状：老数据或新用户缺的字段补上默认值，去掉已经废弃的树种字段

const { ANIMALS, tilePlaceable } = require('./shared/garden')

const LEGACY_FIELDS = ['currentSpecies', 'unlocked', 'unseen']

const isAnimal = (id) => ANIMALS.indexOf(id) !== -1

// 旧数据换算成小岛：
//  - 大地图（有 plots，坐标 0～17）：中间那块（6～11）各减 3 落进中间花园；落到小路上、别的块里的收回背包；开荒花的暖豆退回
//  - 更早的小庭院（坐标 0～5）：各加 3
function adoptIsland(garden, doc) {
  const { plots, ...rest } = garden
  if (doc.opened) return { ...rest, opened: doc.opened }
  const opened = ['center']
  let shift = 3
  let refund = 0
  if (doc.plots) {
    shift = -3
    // 当年开荒的价格：100、150、200……
    for (let k = 1; k < doc.plots.length; k++) refund += 100 + 50 * (k - 1)
  }
  const placed = []
  const inventory = { ...garden.inventory }
  garden.placed.forEach((p) => {
    const c = p.c + shift
    const r = p.r + shift
    if (tilePlaceable(opened, c, r) && !placed.some((q) => q.c === c && q.r === r)) placed.push({ ...p, c, r })
    else inventory[p.itemId] = (inventory[p.itemId] || 0) + 1
  })
  return { ...rest, placed, inventory, opened, beans: { ...garden.beans, bonus: garden.beans.bonus + refund } }
}

// 以前小动物是扭蛋抽的：背包里、庭院里的直接变成住户（不算新住户，免得一次走进来一群）
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
  // 修整了哪些分区（opened）由 adoptIsland 给：旧数据换算坐标，新用户只有中间花园
  return adoptAnimals(adoptIsland({
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
  }, g))
}

module.exports = { normalizeGarden }
