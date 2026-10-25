// 暖豆、扭蛋稀有度、保底、节气：云函数和小程序共用（纯函数，有单测）。食物表在 foods.js、宠物在 pets.js、装饰在 decor.js

// 扭蛋稀有度和概率（权重）
const RARITIES = [
  { id: 'common', label: '普通', weight: 65, color: '#8A8378' },
  { id: 'rare', label: '稀有', weight: 25, color: '#3D8BD9' },
  { id: 'epic', label: '珍稀', weight: 8, color: '#9B5BD6' },
  { id: 'legendary', label: '传说', weight: 2, color: '#D99A1E' },
]

// 扭蛋 30 暖豆一抽；第一次进来送 60
const SPIN_COST = 30
const WELCOME_BEANS = 60
// 连续 PITY-1 次没出珍稀及以上，第 PITY 次必出
const PITY = 10

// 二十四节气（按年份列，start 是那个节气开始的日子）
const SOLAR_TERMS = [
  { key: 'bailu', name: '白露', start: '2026-09-07' },
  { key: 'qiufen', name: '秋分', start: '2026-09-23' },
  { key: 'hanlu', name: '寒露', start: '2026-10-08' },
  { key: 'shuangjiang', name: '霜降', start: '2026-10-23' },
  { key: 'lidong', name: '立冬', start: '2026-11-07' },
  { key: 'xiaoxue', name: '小雪', start: '2026-11-22' },
  { key: 'daxue', name: '大雪', start: '2026-12-07' },
  { key: 'dongzhi', name: '冬至', start: '2026-12-22' },
  { key: 'xiaohan', name: '小寒', start: '2027-01-05' },
  { key: 'dahan', name: '大寒', start: '2027-01-20' },
  { key: 'lichun', name: '立春', start: '2027-02-04' },
  { key: 'yushui', name: '雨水', start: '2027-02-19' },
  { key: 'jingzhe', name: '惊蛰', start: '2027-03-06' },
  { key: 'chunfen', name: '春分', start: '2027-03-21' },
  { key: 'qingming', name: '清明', start: '2027-04-05' },
  { key: 'guyu', name: '谷雨', start: '2027-04-20' },
  { key: 'lixia', name: '立夏', start: '2027-05-06' },
  { key: 'xiaoman', name: '小满', start: '2027-05-21' },
  { key: 'mangzhong', name: '芒种', start: '2027-06-06' },
  { key: 'xiazhi', name: '夏至', start: '2027-06-21' },
  { key: 'xiaoshu', name: '小暑', start: '2027-07-07' },
  { key: 'dashu', name: '大暑', start: '2027-07-23' },
  { key: 'liqiu', name: '立秋', start: '2027-08-08' },
  { key: 'chushu', name: '处暑', start: '2027-08-23' },
  { key: 'bailu', name: '白露', start: '2027-09-08' },
  { key: 'qiufen', name: '秋分', start: '2027-09-23' },
  { key: 'hanlu', name: '寒露', start: '2027-10-08' },
  { key: 'shuangjiang', name: '霜降', start: '2027-10-23' },
  { key: 'lidong', name: '立冬', start: '2027-11-07' },
  { key: 'xiaoxue', name: '小雪', start: '2027-11-22' },
  { key: 'daxue', name: '大雪', start: '2027-12-07' },
  { key: 'dongzhi', name: '冬至', start: '2027-12-22' },
]

function beanBalance(garden) {
  const beans = (garden && garden.beans) || {}
  const earned = Object.values(beans.earned || {}).reduce((sum, n) => sum + (n || 0), 0)
  return earned + (beans.bonus || 0) - (beans.spent || 0)
}

function pickWeighted(entries, rand) {
  const total = entries.reduce((sum, e) => sum + e.weight, 0)
  let x = rand * total
  for (const e of entries) {
    if (x < e.weight) return e.value
    x -= e.weight
  }
  return entries[entries.length - 1].value
}

function rollRarity(rand, sincePity) {
  const pool = sincePity >= PITY - 1 ? RARITIES.filter((r) => r.id === 'epic' || r.id === 'legendary') : RARITIES
  return pickWeighted(pool.map((r) => ({ value: r.id, weight: r.weight })), rand)
}

function currentTerm(dateKey) {
  let found = null
  SOLAR_TERMS.forEach((t) => {
    if (t.start <= dateKey) found = t
  })
  return found
}

module.exports = {
  RARITIES, SPIN_COST, WELCOME_BEANS, PITY, SOLAR_TERMS,
  beanBalance, pickWeighted, rollRarity, currentTerm,
}
