// 与 miniprogram/utils/shared/garden.js 保持一致（test/shared-sync.test.js 会检查）
// 养生庭院：打卡赚暖豆 → 扭蛋抽物品 → 摆进庭院 → 图鉴收集

const RARITIES = [
  { id: 'common', label: '普通', weight: 65, color: '#8A8378' },
  { id: 'rare', label: '稀有', weight: 25, color: '#3D8BD9' },
  { id: 'epic', label: '珍稀', weight: 8, color: '#9B5BD6' },
  { id: 'legendary', label: '传说', weight: 2, color: '#D99A1E' },
]

// 物品 id 会存进数据库，不能改；size 决定在庭院里画多大（s 小件 / m 中件 / l 大件）
// emoji 只用于占位图，正式图片见 docs/art/garden-art-brief.md
// kind: 'animal' 的是小动物：不进扭蛋；庭院里摆着 likes 里的东西（likesCount 件，needs 已住进来）时，下次正餐打卡搬来
const ITEMS = [
  { id: 'starter_tree', name: '大树', rarity: 'common', size: 'l', emoji: '🌳', starter: true },

  { id: 'daisy', name: '雏菊丛', rarity: 'common', size: 's', emoji: '🌼' },
  { id: 'chrysanthemum', name: '小菊花', rarity: 'common', size: 's', emoji: '🏵️' },
  { id: 'orchid', name: '兰花盆', rarity: 'common', size: 's', emoji: '🪻' },
  { id: 'pothos', name: '绿萝盆', rarity: 'common', size: 's', emoji: '🪴' },
  { id: 'sunflower', name: '向日葵', rarity: 'common', size: 'm', emoji: '🌻' },
  { id: 'bamboo', name: '翠竹', rarity: 'common', size: 'm', emoji: '🎋' },
  { id: 'dandelion', name: '蒲公英', rarity: 'common', size: 's', emoji: '🌾' },
  { id: 'grass', name: '青草丛', rarity: 'common', size: 's', emoji: '🌿' },
  { id: 'mushroom', name: '小蘑菇', rarity: 'common', size: 's', emoji: '🍄' },
  { id: 'cabbage', name: '大白菜', rarity: 'common', size: 's', emoji: '🥬' },
  { id: 'radish', name: '白萝卜', rarity: 'common', size: 's', emoji: '🥕' },
  { id: 'pumpkin', name: '南瓜', rarity: 'common', size: 's', emoji: '🎃' },
  { id: 'pebbles', name: '鹅卵石', rarity: 'common', size: 's', emoji: '🪨' },
  { id: 'fence', name: '木篱笆', rarity: 'common', size: 's', emoji: '🪵' },
  { id: 'stool', name: '小板凳', rarity: 'common', size: 's', emoji: '🪑' },

  { id: 'osmanthus', name: '桂花树', rarity: 'rare', size: 'l', emoji: '🌳' },
  { id: 'orange_tree', name: '橘子树', rarity: 'rare', size: 'l', emoji: '🍊' },
  { id: 'persimmon_tree', name: '柿子树', rarity: 'rare', size: 'l', emoji: '🍁' },
  { id: 'gourd_rack', name: '葫芦架', rarity: 'rare', size: 'm', emoji: '🫑' },
  { id: 'goji_tray', name: '晒枸杞红枣', rarity: 'rare', size: 's', emoji: '🍒' },
  { id: 'tea_table', name: '茶桌', rarity: 'rare', size: 'm', emoji: '🫖' },
  { id: 'wood_bridge', name: '小木桥', rarity: 'rare', size: 'm', emoji: '🛶' },
  { id: 'lantern', name: '灯笼柱', rarity: 'rare', size: 'm', emoji: '🏮' },
  { id: 'stone_table', name: '石桌石凳', rarity: 'rare', size: 'm', emoji: '🍵' },
  { id: 'chick', name: '小黄鸡', rarity: 'rare', size: 's', emoji: '🐤', kind: 'animal', likes: ['grass'] },
  { id: 'rabbit', name: '小白兔', rarity: 'rare', size: 's', emoji: '🐇', kind: 'animal', likes: ['radish'] },
  { id: 'duck', name: '小黄鸭', rarity: 'rare', size: 's', emoji: '🦆', kind: 'animal', likes: ['koi_pond'] },
  { id: 'koi_pond', name: '锦鲤池', rarity: 'rare', size: 'm', emoji: '🐟' },
  { id: 'turtle', name: '小乌龟', rarity: 'rare', size: 's', emoji: '🐢', kind: 'animal', likes: ['pebbles'] },
  { id: 'tabby_cat', name: '小花猫', rarity: 'rare', size: 's', emoji: '🐈', kind: 'animal', likes: ['stool'] },

  { id: 'panda', name: '大熊猫', rarity: 'epic', size: 'm', emoji: '🐼', kind: 'animal', likes: ['bamboo'] },
  { id: 'ginger_cat', name: '晒太阳的橘猫', rarity: 'epic', size: 'm', emoji: '😺', kind: 'animal', likes: ['tea_table'] },
  { id: 'plum_tree', name: '梅花树', rarity: 'epic', size: 'l', emoji: '🌸' },
  { id: 'lotus_pond', name: '荷花池', rarity: 'epic', size: 'm', emoji: '🪷' },
  { id: 'pavilion', name: '六角凉亭', rarity: 'epic', size: 'l', emoji: '🛖' },
  { id: 'arch_bridge', name: '石拱桥', rarity: 'epic', size: 'm', emoji: '🌉' },
  { id: 'crane', name: '仙鹤', rarity: 'epic', size: 'm', emoji: '🦢', kind: 'animal', likes: ['lotus_pond'] },
  { id: 'swing_tree', name: '秋千树', rarity: 'epic', size: 'l', emoji: '🌲' },
  { id: 'waterwheel', name: '小水车', rarity: 'epic', size: 'm', emoji: '🎡' },

  { id: 'teahouse', name: '中式小茶楼', rarity: 'legendary', size: 'l', emoji: '🏯' },
  { id: 'zigzag_bridge', name: '九曲桥荷塘', rarity: 'legendary', size: 'l', emoji: '🎑' },
  { id: 'panda_family', name: '熊猫一家', rarity: 'legendary', size: 'l', emoji: '🐾', kind: 'animal', likes: ['bamboo'], likesCount: 3, needs: 'panda' },
  { id: 'golden_ginkgo', name: '金色银杏', rarity: 'legendary', size: 'l', emoji: '🍂' },

  // 节气限定：只有那个节气期间抽得到（每年都会回来）
  { id: 'dried_persimmon', name: '柿饼架', rarity: 'rare', size: 'm', emoji: '🍑', term: 'shuangjiang' },
  { id: 'sweet_potato_stove', name: '烤红薯炉', rarity: 'rare', size: 'm', emoji: '🍠', term: 'lidong' },
  { id: 'snowman', name: '雪人', rarity: 'rare', size: 'm', emoji: '⛄', term: 'xiaoxue' },
  { id: 'wintersweet', name: '腊梅', rarity: 'rare', size: 'l', emoji: '💮', term: 'daxue' },
  { id: 'dumpling_steamer', name: '饺子蒸笼', rarity: 'rare', size: 's', emoji: '🥟', term: 'dongzhi' },
]

const STARTER_ITEM = 'starter_tree'
const ANIMALS = ITEMS.filter((i) => i.kind === 'animal').map((i) => i.id)

// 每天的树长到哪个阶段，当天就给多少暖豆（见 shared/forest.js 的 dayTree）
const STAGE_BEANS = { empty: 0, sprout: 10, small: 20, big: 40, bloom: 50, fruit: 60 }
const STAGE_ORDER = ['empty', 'sprout', 'small', 'big', 'bloom', 'fruit']

const SPIN_COST = 30
const WELCOME_BEANS = 60
// 连续 PITY-1 次没出珍稀及以上，第 PITY 次必出
const PITY = 10
const SEASONAL_WEIGHT = 4

// 庭院地图：PLOT_GRID × PLOT_GRID 块地，每块 PLOT_SIZE × PLOT_SIZE 格；一开始只开垦中间一块，其余花暖豆开荒
const PLOT_SIZE = 6
const PLOT_GRID = 3
const WORLD_SIZE = PLOT_SIZE * PLOT_GRID
const CENTER_PLOT = '1,1'
const EXPAND_BASE = 100
const EXPAND_STEP = 50

// 节气起始日（北京时间），由天文算法算出；key 用于每年循环的节气限定
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

function itemById(id) {
  return ITEMS.find((i) => i.id === id) || null
}

function collectibleCount() {
  return ITEMS.filter((i) => !i.starter).length
}

function beanBalance(garden) {
  const beans = (garden && garden.beans) || {}
  const earned = Object.values(beans.earned || {}).reduce((sum, n) => sum + (n || 0), 0)
  return earned + (beans.bonus || 0) - (beans.spent || 0)
}

function nextStageGain(stage) {
  const i = STAGE_ORDER.indexOf(stage)
  if (i === -1 || i === STAGE_ORDER.length - 1) return 0
  return STAGE_BEANS[STAGE_ORDER[i + 1]] - STAGE_BEANS[stage]
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

// termKey：当前节气的 key；当季限定款进入同稀有度的池子，权重更高。小动物不进扭蛋
function pickItem(rarity, termKey, rand) {
  const inPool = (i) => i.rarity === rarity && !i.starter && i.kind !== 'animal'
  const regular = ITEMS.filter((i) => inPool(i) && !i.term)
  const seasonal = ITEMS.filter((i) => inPool(i) && i.term && i.term === termKey)
  const entries = regular.map((i) => ({ value: i.id, weight: 1 }))
    .concat(seasonal.map((i) => ({ value: i.id, weight: SEASONAL_WEIGHT })))
  return pickWeighted(entries, rand)
}

function currentTerm(dateKey) {
  let found = null
  SOLAR_TERMS.forEach((t) => {
    if (t.start <= dateKey) found = t
  })
  return found
}

function plotOf(c, r) {
  return `${Math.floor(c / PLOT_SIZE)},${Math.floor(r / PLOT_SIZE)}`
}

function parsePlot(key) {
  const m = /^(\d+),(\d+)$/.exec(String(key))
  if (!m) return null
  const pc = Number(m[1])
  const pr = Number(m[2])
  return pc < PLOT_GRID && pr < PLOT_GRID ? { pc, pr } : null
}

// 上下左右相邻的地块
function plotNeighbors(key) {
  const p = parsePlot(key)
  if (!p) return []
  return [[1, 0], [-1, 0], [0, 1], [0, -1]]
    .map(([dc, dr]) => ({ pc: p.pc + dc, pr: p.pr + dr }))
    .filter((n) => n.pc >= 0 && n.pr >= 0 && n.pc < PLOT_GRID && n.pr < PLOT_GRID)
    .map((n) => `${n.pc},${n.pr}`)
}

function canExpand(plots, key) {
  return !!parsePlot(key) && plots.indexOf(key) === -1 && plotNeighbors(key).some((n) => plots.indexOf(n) !== -1)
}

// 已开垦 openedCount 块时再开一块要多少暖豆：100、150、200……
function expandCost(openedCount) {
  return EXPAND_BASE + EXPAND_STEP * (openedCount - 1)
}

function inWorld(c, r) {
  return Number.isInteger(c) && Number.isInteger(r) && c >= 0 && r >= 0 && c < WORLD_SIZE && r < WORLD_SIZE
}

function tileOpen(plots, c, r) {
  return inWorld(c, r) && plots.indexOf(plotOf(c, r)) !== -1
}

// 摆放编号 p12 → 12，越小越早摆
function placedOrder(uid) {
  return Number(String(uid).replace(/\D/g, '')) || 0
}

// 条件满足、还没住进来的动物，按「最后一件需要的物件」摆进庭院的先后排队
function waitingAnimals(placed, residentIds) {
  const waiting = []
  ITEMS.forEach((animal) => {
    if (animal.kind !== 'animal' || residentIds.indexOf(animal.id) !== -1) return
    if (animal.needs && residentIds.indexOf(animal.needs) === -1) return
    const need = animal.likesCount || 1
    const orders = placed
      .filter((p) => animal.likes.indexOf(p.itemId) !== -1)
      .map((p) => placedOrder(p.uid))
      .sort((a, b) => a - b)
    if (orders.length >= need) waiting.push({ id: animal.id, order: orders[need - 1] })
  })
  return waiting.sort((a, b) => a.order - b.order).map((w) => w.id)
}

module.exports = {
  RARITIES,
  ITEMS,
  STARTER_ITEM,
  ANIMALS,
  STAGE_BEANS,
  SPIN_COST,
  WELCOME_BEANS,
  PITY,
  SOLAR_TERMS,
  itemById,
  collectibleCount,
  beanBalance,
  nextStageGain,
  rollRarity,
  pickItem,
  currentTerm,
  PLOT_SIZE,
  PLOT_GRID,
  WORLD_SIZE,
  CENTER_PLOT,
  plotOf,
  parsePlot,
  plotNeighbors,
  canExpand,
  expandCost,
  inWorld,
  tileOpen,
  placedOrder,
  waitingAnimals,
}
