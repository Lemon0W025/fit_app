// 今日菜单：每样普通食物今天闻着它会来的小动物（纯函数）。同一天每次算都一样，第二天换一批
// 名单 = 本来就爱吃它、同稀有度的那只（一直在）+ 今天再加 0～2 只（同稀有度权重 3、低一档权重 1），最多 3 只；节气点心不引客人

const { FOODS } = require('./shared/foods')
const { PETS } = require('./shared/pets')

const RANK = { common: 0, rare: 1, epic: 2, legendary: 3 }
const MAX = 3
const EXTRA_ODDS = [0.2, 0.45, 0.35] // 加 0 / 1 / 2 只
const SAME_TIER = 3
const TIER_BELOW = 1

// 按字符串做种子的伪随机（FNV-1a 散列 + mulberry32）
function seeded(text) {
  let h = 2166136261
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  let s = h >>> 0
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function extrasCount(r) {
  let x = r()
  for (let n = 0; n < EXTRA_ODDS.length; n++) {
    if (x < EXTRA_ODDS[n]) return n
    x -= EXTRA_ODDS[n]
  }
  return EXTRA_ODDS.length - 1
}

function listFor(food, date) {
  const r = seeded(`${date}:${food.id}`)
  const list = PETS.filter((p) => p.foods.indexOf(food.id) !== -1 && p.rarity === food.rarity).map((p) => p.id)
  const pool = PETS.filter((p) => list.indexOf(p.id) === -1)
    .map((p) => ({ id: p.id, weight: RANK[food.rarity] === RANK[p.rarity] ? SAME_TIER : RANK[food.rarity] - RANK[p.rarity] === 1 ? TIER_BELOW : 0 }))
    .filter((p) => p.weight > 0)
  for (let n = extrasCount(r); n > 0 && pool.length && list.length < MAX; n--) {
    const total = pool.reduce((sum, p) => sum + p.weight, 0)
    let x = r() * total
    let i = 0
    while (i < pool.length - 1 && x >= pool[i].weight) x -= pool[i++].weight
    list.push(pool.splice(i, 1)[0].id)
  }
  return list
}

function dailyMenu(date) {
  const menu = {}
  FOODS.forEach((f) => {
    menu[f.id] = listFor(f, date)
  })
  return menu
}

module.exports = { dailyMenu }
