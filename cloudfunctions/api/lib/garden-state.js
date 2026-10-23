// gardens 文档的完整形状：老数据或新用户缺的字段补上默认值，去掉已经废弃的树种字段

const { ANIMALS } = require('./shared/garden')

const LEGACY_FIELDS = ['currentSpecies', 'unlocked', 'unseen']

const isAnimal = (id) => ANIMALS.indexOf(id) !== -1

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
  return adoptAnimals({
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
    // 住进来的小动物 [{ id, since }]，和还没在庭院里看到的新住户
    residents: g.residents || [],
    arrivals: g.arrivals || [],
  })
}

module.exports = { normalizeGarden }
