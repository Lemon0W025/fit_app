// gardens 文档的完整形状：老数据或新用户缺的字段补上默认值，去掉已经废弃的树种字段

const LEGACY_FIELDS = ['currentSpecies', 'unlocked', 'unseen']

function normalizeGarden(doc) {
  const g = { ...(doc || {}) }
  LEGACY_FIELDS.forEach((k) => delete g[k])
  const beans = g.beans || {}
  const gacha = g.gacha || {}
  return {
    ...g,
    days: g.days || {},
    beans: { earned: beans.earned || {}, bonus: beans.bonus || 0, spent: beans.spent || 0 },
    inventory: g.inventory || {},
    placed: g.placed || [],
    collected: g.collected || [],
    gacha: { pulls: gacha.pulls || 0, sincePity: gacha.sincePity || 0 },
    welcomed: !!g.welcomed,
  }
}

module.exports = { normalizeGarden }
