// gardens 文档（集合名没改）的完整形状：缺的字段补默认值；宅院 / 小岛 / 大地图时代的旧档迁成营地

const { WELCOME_BEANS } = require('./shared/garden')
const { OLD_TO_PET } = require('./shared/pets')

const LEGACY_FIELDS = ['estate', 'opened', 'inventory', 'placed', 'residents', 'collected', 'plots', 'unseen', 'currentSpecies', 'unlocked']

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
    camp: 1,
    welcomed,
    beans: { earned: beans.earned || {}, bonus: welcomed ? WELCOME_BEANS : 0, spent: 0 },
    gacha: doc.gacha,
    pets,
    grants: doc.grants,
    days: doc.days,
  }
}

function normalizeCamp(doc) {
  const src = doc && doc.camp ? { ...doc } : adoptCamp(doc || {})
  LEGACY_FIELDS.forEach((k) => delete src[k])
  const beans = src.beans || {}
  const gacha = src.gacha || {}
  const decor = src.decor || {}
  const two = (arr) => [arr && arr[0] ? arr[0] : null, arr && arr[1] ? arr[1] : null]
  return {
    ...src,
    camp: 1,
    welcomed: !!src.welcomed,
    beans: { earned: beans.earned || {}, bonus: beans.bonus || 0, spent: beans.spent || 0 },
    gacha: { pulls: gacha.pulls || 0, sincePity: gacha.sincePity || 0 },
    foods: src.foods || {},
    bowls: two(src.bowls),
    peeking: two(src.peeking),
    pets: (src.pets || []).map((p) => ({ id: p.id, since: p.since || '', fed: p.fed || 0, fedToday: p.fedToday || { date: '', n: 0 } })),
    arrivals: src.arrivals || [],
    decor: { owned: decor.owned || {}, placed: decor.placed || [] },
    seq: src.seq || 0,
    gift: src.gift || '',
    tasted: src.tasted || [],
    grants: src.grants || [],
    days: src.days || {},
  }
}

// 第一次进来、或旧档刚迁完，要存一次
function migrated(doc, camp) {
  return !doc || doc.camp !== camp.camp
}

module.exports = { normalizeCamp, migrated }
