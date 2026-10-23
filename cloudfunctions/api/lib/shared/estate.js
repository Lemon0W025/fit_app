// 园林大宅院：院子、墙、月亮门、壳里画好的地面，以及「能不能走、能不能摆、能不能修」的规则（云函数和小程序共用，纯函数）
// 格子 (c, r)：c 往右下增加，r 往左下增加。rect = [c 起, r 起, c 止, r 止)，左闭右开

const { itemById } = require('./garden')

const GRID = { cols: 37, rows: 28 }

// 11 个院子：4 列（c 1～8、10～17、19～26、28～35）× 3 排（r 1～8、10～17、19～26），后花园占后排中间两列；院子之间隔一格墙
const AREAS = [
  { id: 'front', name: '前院', cost: 0, rect: [10, 19, 18, 27] },
  { id: 'main', name: '正院', cost: 0, rect: [10, 10, 18, 18] },
  { id: 'pond', name: '荷塘院', cost: 200, rect: [19, 10, 27, 18] },
  { id: 'flower', name: '花圃院', cost: 200, rect: [19, 19, 27, 27] },
  { id: 'orchard', name: '果园', cost: 300, rect: [1, 19, 9, 27] },
  { id: 'veg', name: '菜园', cost: 300, rect: [28, 19, 36, 27] },
  { id: 'bamboo', name: '竹林院', cost: 400, rect: [1, 10, 9, 18] },
  { id: 'tea', name: '茶院', cost: 400, rect: [28, 10, 36, 18] },
  { id: 'farm', name: '动物小院', cost: 500, rect: [1, 1, 9, 9] },
  { id: 'spring', name: '温泉院', cost: 500, rect: [28, 1, 36, 9] },
  { id: 'back', name: '后花园', cost: 700, rect: [10, 1, 27, 9] },
]
const START_OPENED = ['front', 'main']

// 壳里画好的东西，按顺序盖在草地上。kind：path 小路 / pave 石板铺地 / soil 土 / water 水 / block 建筑和山石；what 给画白模用
const SHELL = [
  // 前院：大门进来的石板路、绕过影壁、通向两边月亮门的横路
  { area: 'front', kind: 'path', rect: [12, 23, 16, 27] },
  { area: 'front', kind: 'path', rect: [13, 19, 15, 23] },
  { area: 'front', kind: 'path', rect: [10, 22, 18, 24] },
  { area: 'front', kind: 'block', what: 'screen', rect: [13, 24, 15, 25] },
  // 正院：正房占后三行，门前甬道和横路
  { area: 'main', kind: 'block', what: 'hall', rect: [10, 10, 18, 13] },
  { area: 'main', kind: 'path', rect: [13, 13, 15, 18] },
  { area: 'main', kind: 'path', rect: [10, 13, 18, 15] },
  // 荷塘院：靠正院一侧的水榭平台，中间一大片水
  { area: 'pond', kind: 'pave', what: 'deck', rect: [19, 12, 20, 16] },
  { area: 'pond', kind: 'water', what: 'pond', rect: [20, 11, 26, 16] },
  // 花圃院：三条花坛，两条小径
  { area: 'flower', kind: 'soil', rect: [19, 20, 21, 26] },
  { area: 'flower', kind: 'path', rect: [21, 19, 22, 27] },
  { area: 'flower', kind: 'soil', rect: [22, 20, 24, 26] },
  { area: 'flower', kind: 'path', rect: [24, 19, 25, 27] },
  { area: 'flower', kind: 'soil', rect: [25, 20, 27, 26] },
  // 菜园：四条菜畦和一口井
  { area: 'veg', kind: 'soil', rect: [29, 20, 30, 26] },
  { area: 'veg', kind: 'soil', rect: [31, 20, 32, 26] },
  { area: 'veg', kind: 'soil', rect: [33, 20, 34, 26] },
  { area: 'veg', kind: 'soil', rect: [35, 20, 36, 26] },
  { area: 'veg', kind: 'block', what: 'well', rect: [28, 25, 29, 26] },
  // 果园：靠墙一座葡萄架
  { area: 'orchard', kind: 'block', what: 'trellis', rect: [1, 19, 4, 21] },
  // 竹林院：假山和一片白沙地
  { area: 'bamboo', kind: 'block', what: 'rockery', rect: [1, 10, 4, 12] },
  { area: 'bamboo', kind: 'pave', what: 'sand', rect: [5, 10, 9, 13] },
  // 茶院：临水的茶亭平台和靠外墙的回廊
  { area: 'tea', kind: 'pave', what: 'deck', rect: [28, 12, 32, 16] },
  { area: 'tea', kind: 'pave', what: 'corridor', rect: [35, 10, 36, 18] },
  // 动物小院：鸡舍
  { area: 'farm', kind: 'block', what: 'coop', rect: [1, 1, 3, 3] },
  // 温泉院：更衣木屋和温泉池
  { area: 'spring', kind: 'block', what: 'cabin', rect: [28, 1, 30, 3] },
  { area: 'spring', kind: 'water', what: 'spring', rect: [30, 2, 35, 6] },
  // 后花园：假山瀑布、水潭、一条小溪（中间一块石板能踩着过）
  { area: 'back', kind: 'block', what: 'rockery', rect: [15, 1, 22, 3] },
  { area: 'back', kind: 'water', what: 'pool', rect: [17, 3, 20, 5] },
  { area: 'back', kind: 'water', what: 'stream', rect: [20, 5, 22, 6] },
  { area: 'back', kind: 'water', what: 'stream', rect: [22, 6, 24, 7] },
  { area: 'back', kind: 'path', what: 'slab', rect: [23, 6, 24, 7] },
  { area: 'back', kind: 'water', what: 'stream', rect: [24, 7, 26, 8] },
  { area: 'back', kind: 'water', what: 'stream', rect: [26, 8, 27, 9] },
]

// 月亮门（两格宽），a、b 是它连着的两个院子
const GATES = [
  { a: 'front', b: 'main', tiles: [[13, 18], [14, 18]] },
  { a: 'front', b: 'orchard', tiles: [[9, 22], [9, 23]] },
  { a: 'front', b: 'flower', tiles: [[18, 22], [18, 23]] },
  { a: 'main', b: 'bamboo', tiles: [[9, 13], [9, 14]] },
  { a: 'main', b: 'pond', tiles: [[18, 13], [18, 14]] },
  { a: 'bamboo', b: 'orchard', tiles: [[4, 18], [5, 18]] },
  { a: 'bamboo', b: 'farm', tiles: [[4, 9], [5, 9]] },
  { a: 'pond', b: 'flower', tiles: [[22, 18], [23, 18]] },
  { a: 'pond', b: 'tea', tiles: [[27, 13], [27, 14]] },
  { a: 'pond', b: 'back', tiles: [[22, 9], [23, 9]] },
  { a: 'flower', b: 'veg', tiles: [[27, 22], [27, 23]] },
  { a: 'tea', b: 'veg', tiles: [[31, 18], [32, 18]] },
  { a: 'tea', b: 'spring', tiles: [[31, 9], [32, 9]] },
  { a: 'back', b: 'farm', tiles: [[9, 4], [9, 5]] },
  { a: 'back', b: 'spring', tiles: [[27, 4], [27, 5]] },
]
// 外墙上的大门：新住户从这里进来
const DOOR = [[13, 27], [14, 27]]

// 小动物在壳里的活动点（站的那一格），作息和小事表按 id 引用
const SPOTS = [
  { id: 'coop', area: 'farm', c: 2, r: 3 },
  { id: 'eaves', area: 'main', c: 11, r: 13 },
  { id: 'steps', area: 'main', c: 14, r: 13 },
  { id: 'well', area: 'veg', c: 28, r: 24 },
  { id: 'veg_bed', area: 'veg', c: 31, r: 22 },
  { id: 'flower_path', area: 'flower', c: 21, r: 22 },
  { id: 'rockery', area: 'bamboo', c: 4, r: 11 },
  { id: 'tea_deck', area: 'tea', c: 29, r: 13 },
  { id: 'pond_water', area: 'pond', c: 22, r: 13 },
  { id: 'falls', area: 'back', c: 18, r: 4 },
  { id: 'hotspring', area: 'spring', c: 32, r: 3 },
  { id: 'bridge', area: 'back', c: 23, r: 6 },
  { id: 'haystack', area: 'farm', c: 6, r: 6 },
]

const STARTER_TILE = { c: 11, r: 16 }

// ---------------------------------------------------------------- 格子表

const TILES = []
for (let i = 0; i < GRID.cols * GRID.rows; i++) TILES.push({ area: '', kind: 'wall' })

function fill(rect, patch) {
  for (let c = rect[0]; c < rect[2]; c++) {
    for (let r = rect[1]; r < rect[3]; r++) Object.assign(TILES[r * GRID.cols + c], patch)
  }
}
AREAS.forEach((a) => fill(a.rect, { area: a.id, kind: 'lawn' }))
SHELL.forEach((s) => fill(s.rect, { kind: s.kind }))
GATES.forEach((g) => g.tiles.forEach(([c, r]) => Object.assign(TILES[r * GRID.cols + c], { area: '', kind: 'gate' })))
DOOR.forEach(([c, r]) => Object.assign(TILES[r * GRID.cols + c], { area: '', kind: 'door' }))

AREAS.forEach((a) => {
  a.neighbors = GATES.filter((g) => g.a === a.id || g.b === a.id).map((g) => (g.a === a.id ? g.b : g.a))
})

const OUT = { area: '', kind: 'out' }

function tileInfo(c, r) {
  if (!Number.isInteger(c) || !Number.isInteger(r) || c < 0 || r < 0 || c >= GRID.cols || r >= GRID.rows) return OUT
  return TILES[r * GRID.cols + c]
}

function areaById(id) {
  return AREAS.find((a) => a.id === id) || null
}

function areaTiles(id) {
  const a = areaById(id)
  if (!a) return []
  const tiles = []
  for (let c = a.rect[0]; c < a.rect[2]; c++) {
    for (let r = a.rect[1]; r < a.rect[3]; r++) tiles.push({ c, r })
  }
  return tiles
}

function areaCenter(id) {
  const [c0, r0, c1, r1] = areaById(id).rect
  return { c: (c0 + c1) / 2, r: (r0 + r1) / 2 }
}

// ---------------------------------------------------------------- 能不能走

const WALK = { lawn: true, soil: true, pave: true, path: true }

function gateAt(c, r) {
  return GATES.find((g) => g.tiles.some(([gc, gr]) => gc === c && gr === r)) || null
}

// 已修院子里的草地、土、铺地、小路；月亮门两边都修好了才通；水鸟（swims）还能下水
function walkable(opened, c, r, swims) {
  const t = tileInfo(c, r)
  if (t.kind === 'gate') {
    const g = gateAt(c, r)
    return !!g && opened.indexOf(g.a) !== -1 && opened.indexOf(g.b) !== -1
  }
  if (!t.area || opened.indexOf(t.area) === -1) return false
  return !!WALK[t.kind] || (!!swims && t.kind === 'water')
}

// ---------------------------------------------------------------- 修整

function canUnlock(opened, id) {
  const a = areaById(id)
  return !!a && opened.indexOf(id) === -1 && a.neighbors.some((n) => opened.indexOf(n) !== -1)
}

function unlockProblem(opened, id) {
  if (!areaById(id)) return '没有这个院子'
  if (opened.indexOf(id) !== -1) return '这个院子已经修整好了'
  if (!canUnlock(opened, id)) return '要先修好旁边的院子'
  return ''
}

// 木牌立在哪：从已修邻院过来的那道门里侧、还没修的这一边的格子
function signTile(opened, areaId) {
  if (opened.indexOf(areaId) !== -1) return null
  for (const g of GATES) {
    const other = g.a === areaId ? g.b : g.b === areaId ? g.a : null
    if (!other || opened.indexOf(other) === -1) continue
    const [gc, gr] = g.tiles[0]
    const inner = [{ c: gc + 1, r: gr }, { c: gc - 1, r: gr }, { c: gc, r: gr + 1 }, { c: gc, r: gr - 1 }]
      .find((t) => tileInfo(t.c, t.r).area === areaId)
    if (inner) return inner
  }
  return null
}

// ---------------------------------------------------------------- 能不能摆

const key = (c, r) => `${c},${r}`

// 物件占的格子，第一个是点下去的那格（左前角），2×2 往后（c−1、r−1）延伸
function footprint(itemId, c, r) {
  const item = itemById(itemId)
  const foot = item && item.foot === 2 ? 2 : 1
  const tiles = []
  for (let dr = 0; dr < foot; dr++) {
    for (let dc = 0; dc < foot; dc++) tiles.push({ c: c - dc, r: r - dr })
  }
  return tiles
}

function occupiedTiles(placed, ignoreUid) {
  const set = new Set()
  placed.forEach((p) => {
    if (p.uid === ignoreUid) return
    footprint(p.itemId, p.c, p.r).forEach((t) => set.add(key(t.c, t.r)))
  })
  return set
}

function groundProblem(item, kind) {
  if (item.ground.indexOf(kind) !== -1) return ''
  if (kind === 'water') return '这是水里，放不了它'
  if (item.ground.length === 1 && item.ground[0] === 'water') return '它得放到水里'
  if (kind === 'soil') return '土里只能种花种菜'
  if (kind === 'pave') return '石板地上种不了，换块草地'
  return '放不到这里哦'
}

function tileProblem(opened, item, c, r) {
  const t = tileInfo(c, r)
  if (t.kind === 'out' || t.kind === 'wall' || t.kind === 'block' || t.kind === 'door') return '放不到这里哦'
  if (t.area && opened.indexOf(t.area) === -1) return '这个院子还没修整呢'
  if (t.kind === 'path' || t.kind === 'gate') return '小路上不能摆东西'
  return groundProblem(item, t.kind)
}

// 这一格为什么不能摆（能摆返回 ''）：云函数校验和页面提示用同一套话
function placeProblem(opened, placed, itemId, c, r, ignoreUid) {
  const item = itemById(itemId)
  if (!item || !item.ground) return '放不到这里哦'
  const tiles = footprint(itemId, c, r)
  const first = tileProblem(opened, item, tiles[0].c, tiles[0].r)
  if (first) return first
  const taken = occupiedTiles(placed, ignoreUid)
  if (taken.has(key(c, r))) return '这块地上已经有东西了'
  for (const t of tiles.slice(1)) {
    if (tileProblem(opened, item, t.c, t.r) || taken.has(key(t.c, t.r))) return '这里放不下它'
  }
  return ''
}

function placeableTiles(opened, placed, itemId, ignoreUid) {
  const tiles = []
  for (let c = 0; c < GRID.cols; c++) {
    for (let r = 0; r < GRID.rows; r++) {
      if (!placeProblem(opened, placed, itemId, c, r, ignoreUid)) tiles.push({ c, r })
    }
  }
  return tiles
}

module.exports = {
  GRID,
  AREAS,
  START_OPENED,
  SHELL,
  GATES,
  DOOR,
  SPOTS,
  STARTER_TILE,
  tileInfo,
  areaById,
  areaTiles,
  areaCenter,
  walkable,
  canUnlock,
  unlockProblem,
  signTile,
  footprint,
  occupiedTiles,
  placeProblem,
  placeableTiles,
}
