// gardens 文档（集合名没改）的完整形状：缺的字段补默认值；宅院 / 小岛 / 大地图时代的旧档迁成营地

const { WELCOME_BEANS } = require('./shared/garden')
const { OLD_TO_PET } = require('./shared/pets')
const { placeProblem, RETIRED, GOLD_SWING } = require('./shared/decor')
const { levelOf, HOME_LEVEL, POT_STAY_MS } = require('./shared/camp')
const { dateKey } = require('./shared/date')

const STARTER_PET = 'doudou'

const LEGACY_FIELDS = ['estate', 'opened', 'inventory', 'placed', 'residents', 'collected', 'plots', 'unseen', 'currentSpecies', 'unlocked', 'visitors', 'arrivals']
// 2：食物下锅（pot）、闻香来的客人（visitors），去掉两个食盆；3：装饰放大 2.5 倍，摆着放不下的收回背包；
// 4：小帐篷、小树下架（按原价退暖豆），金色小帐篷换成金色秋千；
// 5：常客模式（specs/2026-11-07-camp-regulars-design.md）：pets 多了 home（住下了：豆豆、5 级）和 until（常客能待到几点），
//    锅按下锅时间算 8 小时（pot.items），客人（visitors）变成常客，arrivals 不要了
const CAMP_VERSION = 6

function pet(id, since) {
  return { id, since: since || '', fed: 0, fedToday: { date: '', n: 0 }, home: false, until: 0 }
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

// camp 3 之前摆的装饰：按摆的先后一件件重新放，放大以后挤着了、出了草地的收回背包（owned 不变，就回到「没摆的」里）
function refitDecor(src) {
  if (!src.decor || (src.camp || 0) >= 3) return src
  const kept = []
  ;(src.decor.placed || []).forEach((p) => {
    if (!placeProblem(kept, p.id, p.x, p.y)) kept.push(p)
  })
  return { ...src, decor: { ...src.decor, placed: kept } }
}

// 下架的（RETIRED：camp 4 小帐篷、小树；camp 6 吊床、野餐垫、花坛这些会穿模的和几件杂物）按原价退暖豆、从草地上收走；
// 金色小帐篷换成金色秋千（原地换，放不下就收回背包）。每次版本号落后都跑一遍（已经退过的 owned 里没有了，不会退两次）
function retireDecor(src) {
  if (!src.decor || (src.camp || 0) >= CAMP_VERSION) return src
  const owned = { ...(src.decor.owned || {}) }
  let refund = 0
  Object.keys(RETIRED).forEach((id) => {
    refund += (owned[id] || 0) * RETIRED[id].price
    delete owned[id]
  })
  const gold = owned.gold_tent
  delete owned.gold_tent
  if (gold) owned[GOLD_SWING] = 1
  const kept = []
  ;(src.decor.placed || []).forEach((p) => {
    if (RETIRED[p.id]) return
    const q = p.id === 'gold_tent' ? { ...p, id: GOLD_SWING } : p
    if (q.id !== GOLD_SWING || !placeProblem(kept, q.id, q.x, q.y)) kept.push(q)
  })
  const beans = src.beans || {}
  return { ...src, beans: { ...beans, spent: Math.max(0, (beans.spent || 0) - refund) }, decor: { ...src.decor, owned, placed: kept } }
}

// camp 5 之前：锅是「今天的」就当刚下锅（从现在起管 8 小时）；老住户豆豆和 5 级的住下，其余是常客（锅空着的话迁移完就不在场）；
// 客人变成常客；arrivals 不要了
function adoptRegulars(src, nowMs) {
  if ((src.camp || 0) >= 5) return src
  const today = dateKey(new Date(nowMs))
  const pot = src.pot || {}
  const items = pot.date === today ? (pot.foods || []).map((foodId) => ({ foodId, at: nowMs, date: today })) : []
  const until = items.length ? nowMs + POT_STAY_MS : 0
  const pets = (src.pets || []).map((p) => {
    const home = p.id === STARTER_PET || levelOf(p.fed || 0) >= HOME_LEVEL
    return { ...p, home, until: home ? 0 : until }
  })
  ;(src.visitors || []).forEach((v) => {
    if (v && v.id && !pets.some((p) => p.id === v.id)) pets.push({ ...pet(v.id, v.since || today), until })
  })
  const out = { ...src, pets, pot: { items } }
  delete out.visitors
  delete out.arrivals
  return out
}

function normalizeCamp(doc, nowMs = Date.now()) {
  const src = adoptRegulars(retireDecor(refitDecor(dropBowls(doc && doc.camp ? { ...doc } : adoptCamp(doc || {})))), nowMs)
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
    // 锅里的每样吃的：什么时候下的（管 POT_STAY_MS）、哪天下的（一天最多三样）
    pot: { items: (pot.items || []).filter((it) => it && it.foodId).map((it) => ({ foodId: it.foodId, at: it.at || 0, date: it.date || '' })) },
    // home：住下了（豆豆、5 级）；until：常客能待到几点（毫秒），在场 = home || until > now；
    // stars：满级后的星星里已经发过暖豆的几颗（services/camp.js 的 settleGoals）
    pets: (src.pets || []).map((p) => ({ id: p.id, since: p.since || '', fed: p.fed || 0, fedToday: p.fedToday || { date: '', n: 0 }, home: !!p.home || p.id === STARTER_PET, until: p.until || 0, stars: p.stars || 0 })),
    decor: { owned: decor.owned || {}, placed: decor.placed || [] },
    seq: src.seq || 0,
    gift: src.gift || '',
    tasted: src.tasted || [],
    grants: src.grants || [],
    days: src.days || {},
    streakBadges: src.streakBadges || {},
    // 后期目标：发过暖豆的住户里程碑（几只）；发了、营地页还没庆祝过的（[{ kind: 'residents', pets, beans } | { kind: 'star', petId, stars, beans }]）
    goals: src.goals || [],
    cheers: src.cheers || [],
  }
}

// 第一次进来、或旧档刚迁完，要存一次
function migrated(doc, camp) {
  return !doc || doc.camp !== camp.camp
}

module.exports = { normalizeCamp, migrated }
