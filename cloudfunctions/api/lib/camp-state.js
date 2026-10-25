// gardens 文档（集合名没改）的完整形状：缺的字段补默认值；宅院 / 小岛 / 大地图时代的旧档迁成营地

const { WELCOME_BEANS } = require('./shared/garden')
const { OLD_TO_PET } = require('./shared/pets')

const LEGACY_FIELDS = ['estate', 'opened', 'inventory', 'placed', 'residents', 'collected', 'plots', 'unseen', 'currentSpecies', 'unlocked']
// 2：食物下锅（pot）、闻香来的客人（visitors），去掉两个食盆
const CAMP_VERSION = 2

function pet(id, since) {
  return { id, since: since || '', fed: 0, fedToday: { date: '', n: 0 } }
}

// 旧档：暖豆按「打卡赚到的全部 + 新手礼」重算（花掉的全退），住户按原型搬进营地，其他全删
function adoptCamp(doc) {
  const beans = doc.beans || {}
  const welcomed = !!doc.welcomed
  const pets = []
  ;(doc.residents || []).forEach((r) => {
    const id = OLD_TO_PET[r.id]
    if (id && !pets.some((p) => p.id === id)) pets.push(pet(id, r.since))
  })
  if (welcomed && !pets.some((p) => p.id === 'doudou')) pets.push(pet('doudou', ''))
  return {
    camp: CAMP_VERSION,
    welcomed,
    beans: { earned: beans.earned || {}, bonus: welcomed ? WELCOME_BEANS : 0, spent: 0 },
    gacha: doc.gacha,
    pets,
    grants: doc.grants,
    days: doc.days,
  }
}

// camp 1 → 2：食盆里的食物退回背包；正在张望的（还没住下的）变成客人，下次拍正餐住下
function dropBowls(src) {
  if (!('bowls' in src) && !('peeking' in src)) return src
  const foods = { ...(src.foods || {}) }
  const bowls = src.bowls || []
  bowls.forEach((f) => {
    if (f) foods[f] = (foods[f] || 0) + 1
  })
  const have = (src.pets || []).map((p) => p.id)
  const visitors = (src.visitors || []).slice()
  ;(src.peeking || []).forEach((id, i) => {
    if (id && have.indexOf(id) === -1 && !visitors.some((v) => v.id === id)) visitors.push({ id, foodId: bowls[i] || '', since: '' })
  })
  const out = { ...src, foods, visitors }
  delete out.bowls
  delete out.peeking
  return out
}

function normalizeCamp(doc) {
  const src = dropBowls(doc && doc.camp ? { ...doc } : adoptCamp(doc || {}))
  LEGACY_FIELDS.forEach((k) => delete src[k])
  const beans = src.beans || {}
  const gacha = src.gacha || {}
  const decor = src.decor || {}
  const pot = src.pot || {}
  return {
    ...src,
    camp: CAMP_VERSION,
    welcomed: !!src.welcomed,
    beans: { earned: beans.earned || {}, bonus: beans.bonus || 0, spent: beans.spent || 0 },
    gacha: { pulls: gacha.pulls || 0, sincePity: gacha.sincePity || 0 },
    foods: src.foods || {},
    // 今天锅里煮着的（date 不是今天就当空锅，半夜自己清空）
    pot: { date: pot.date || '', foods: pot.foods || [] },
    visitors: (src.visitors || []).map((v) => ({ id: v.id, foodId: v.foodId || '', since: v.since || '' })),
    pets: (src.pets || []).map((p) => ({ id: p.id, since: p.since || '', fed: p.fed || 0, fedToday: p.fedToday || { date: '', n: 0 } })),
    arrivals: src.arrivals || [],
    decor: { owned: decor.owned || {}, placed: decor.placed || [] },
    seq: src.seq || 0,
    gift: src.gift || '',
    tasted: src.tasted || [],
    grants: src.grants || [],
    days: src.days || {},
    streakBadges: src.streakBadges || {},
  }
}

// 第一次进来、或旧档刚迁完，要存一次
function migrated(doc, camp) {
  return !doc || doc.camp !== camp.camp
}

module.exports = { normalizeCamp, migrated }
