// 园林大宅院：院子、墙、月亮门、壳里画好的地面，以及「能不能走、能不能摆、能不能修」的规则（云函数和小程序共用，纯函数）
// 格子 (c, r)：c 往右下增加，r 往左下增加。rect = [c 起, r 起, c 止, r 止)，左闭右开
// 这里的每个矩形都是照着 Codex 画的第二版原画（art/raw/estate/estate-hd.png，透视校正后）量出来的：画是什么样，格子就怎么定；
// 换原画时用 scripts/estate/cut_art.py --save 存出对齐后的整张画，叠上格子重新量

const { itemById } = require('./garden')

const GRID = { cols: 37, rows: 28 }

// 11 个院子（矩形只管「这格归哪个院子」，后面的盖前面的：竹林院盖掉正院月亮门墙西边那一列；院子之间的隔断照画单独列在 FENCE_TILES 里）
const AREAS = [
  { id: 'front', name: '前院', cost: 0, rect: [11, 20, 21, 27] },
  { id: 'main', name: '正院', cost: 0, rect: [11, 8, 21, 20] },
  { id: 'pond', name: '荷塘院', cost: 200, rect: [21, 8, 30, 21] },
  { id: 'flower', name: '花圃院', cost: 200, rect: [21, 21, 30, 27] },
  { id: 'orchard', name: '果园', cost: 300, rect: [1, 20, 11, 27] },
  { id: 'veg', name: '菜园', cost: 300, rect: [30, 20, 36, 27] },
  { id: 'bamboo', name: '竹林院', cost: 400, rect: [1, 10, 12, 20] },
  { id: 'tea', name: '茶院', cost: 400, rect: [30, 10, 36, 20] },
  { id: 'farm', name: '动物小院', cost: 500, rect: [1, 1, 11, 10] },
  { id: 'spring', name: '温泉院', cost: 500, rect: [30, 1, 36, 10] },
  { id: 'back', name: '后花园', cost: 700, rect: [11, 1, 30, 8] },
]
const START_OPENED = ['front', 'main']

// 壳里画好的东西，按顺序盖在草地上。kind：path 小路、台阶 / pave 石板铺地 / soil 土 / water 水 / block 建筑和山石；
// what 给画白模、场景动效和遮挡用。tiles 是不成矩形的（照着画里斜着排的石头）
const SHELL = [
  // 前院：大门进来的石板场、通向正院的小路
  { area: 'front', kind: 'pave', rect: [13, 23, 19, 27] },
  { area: 'front', kind: 'path', rect: [16, 20, 18, 23] },
  // 正院：正房、台阶、房前石板场（留两块草地）、房东侧的铺地和下荷塘院的台阶
  { area: 'main', kind: 'pave', rect: [12, 15, 21, 20] },
  { area: 'main', kind: 'lawn', rect: [14, 18, 17, 20] },
  { area: 'main', kind: 'lawn', rect: [18, 17, 20, 19] },
  { area: 'main', kind: 'block', what: 'hall', rect: [12, 11, 20, 15] },
  { area: 'main', kind: 'path', what: 'steps', rect: [14, 15, 17, 17] },
  { area: 'main', kind: 'pave', rect: [20, 9, 23, 13] },
  { area: 'pond', kind: 'path', what: 'steps', rect: [23, 10, 25, 12] },
  // 荷塘院：正房东边流下来的小溪（木板桥在 GATES 里）、方荷塘、院子南边的小溪、从后花园接过来的水道
  { area: 'pond', kind: 'water', what: 'stream', rect: [21, 12, 22, 20] },
  { area: 'pond', kind: 'water', what: 'pond', rect: [23, 12, 29, 18] },
  { area: 'pond', kind: 'water', what: 'stream', rect: [21, 20, 29, 21] },
  { area: 'pond', kind: 'water', what: 'stream', rect: [28, 10, 30, 12] },
  // 花圃院、菜园：两组菜畦
  { area: 'flower', kind: 'soil', rect: [20, 21, 29, 26] },
  { area: 'veg', kind: 'soil', rect: [31, 21, 36, 26] },
  // 果园：葡萄架
  { area: 'orchard', kind: 'block', what: 'trellis', rect: [1, 21, 5, 25] },
  // 竹林院：从动物小院下来的台阶和石板小路、枯山水（白沙 + 山石）
  { area: 'bamboo', kind: 'path', what: 'steps', rect: [5, 10, 8, 12] },
  { area: 'bamboo', kind: 'path', rect: [6, 12, 10, 14] },
  { area: 'bamboo', kind: 'path', rect: [8, 14, 10, 21] },
  { area: 'bamboo', kind: 'path', rect: [6, 20, 8, 22] },
  { area: 'bamboo', kind: 'pave', what: 'sand', rect: [3, 15, 8, 21] },
  { area: 'bamboo', kind: 'block', what: 'rockery', rect: [2, 13, 6, 17] },
  // 茶院：茶亭、石板茶台、水井
  { area: 'tea', kind: 'block', what: 'pavilion', rect: [32, 10, 36, 13] },
  { area: 'tea', kind: 'pave', what: 'deck', rect: [30, 14, 34, 19] },
  { area: 'tea', kind: 'block', what: 'well', rect: [34, 16, 35, 17] },
  // 动物小院：鸡舍
  { area: 'farm', kind: 'block', what: 'coop', rect: [2, 1, 6, 5] },
  // 温泉院：木屋、温泉池
  { area: 'spring', kind: 'block', what: 'cabin', rect: [30, 1, 33, 4] },
  { area: 'spring', kind: 'block', what: 'shrubs', rect: [33, 1, 36, 4] }, // 木屋后面一丛灌木，走不进去
  { area: 'spring', kind: 'water', what: 'spring', rect: [32, 4, 36, 9] },
  { area: 'spring', kind: 'lawn', rect: [32, 4, 34, 5] }, // 木屋门口那两格是岸
  // 后花园：假山瀑布、沿墙一排立石、一路流到荷塘院的小溪
  { area: 'back', kind: 'block', what: 'rockery', rect: [11, 1, 14, 4] },
  { area: 'back', kind: 'block', what: 'rockery', tiles: [[15, 1], [16, 1], [17, 1], [18, 1], [15, 2], [16, 2], [17, 2], [18, 2], [19, 2], [20, 2], [21, 2], [22, 2], [19, 3], [20, 3], [21, 3], [22, 3], [23, 3], [24, 3], [25, 3], [26, 3]] },
  { area: 'back', kind: 'water', what: 'falls', rect: [13, 1, 15, 3] },
  { area: 'back', kind: 'water', what: 'stream', rect: [14, 3, 19, 4] },
  { area: 'back', kind: 'water', what: 'stream', rect: [16, 4, 24, 5] },
  { area: 'back', kind: 'water', what: 'stream', rect: [20, 5, 24, 6] },
  { area: 'back', kind: 'water', what: 'stream', rect: [21, 6, 26, 7] },
  { area: 'back', kind: 'water', what: 'stream', rect: [24, 7, 27, 8] },
  { area: 'pond', kind: 'water', what: 'stream', rect: [27, 8, 30, 9] },
  { area: 'pond', kind: 'water', what: 'stream', rect: [28, 9, 30, 10] },
]

// 院子之间的门：两格并排；fence 是这道门开在哪种隔断上（wall 白墙上的是带洞的月亮门，stream 是木板桥、石板桥，cliff 是台阶，没写的是缺口）
const GATES = [
  { a: 'front', b: 'main', tiles: [[16, 20], [17, 20]], fence: 'fence' },
  { a: 'front', b: 'orchard', tiles: [[11, 25], [11, 26]] },
  { a: 'main', b: 'bamboo', tiles: [[11, 9], [11, 10]] },
  { a: 'main', b: 'bamboo', tiles: [[12, 16], [12, 17]], fence: 'wall' },
  { a: 'main', b: 'pond', tiles: [[20, 9], [20, 10]] },
  { a: 'main', b: 'pond', tiles: [[21, 15], [21, 16]], fence: 'stream' },
  { a: 'bamboo', b: 'orchard', tiles: [[5, 20], [6, 20]] },
  { a: 'bamboo', b: 'farm', tiles: [[8, 9], [9, 9]], fence: 'cliff' },
  { a: 'farm', b: 'main', tiles: [[10, 8], [10, 9]] },
  { a: 'pond', b: 'flower', tiles: [[25, 20], [26, 20]], fence: 'stream' },
  { a: 'pond', b: 'tea', tiles: [[29, 18], [29, 19]] },
  { a: 'pond', b: 'back', tiles: [[26, 8], [27, 8]], fence: 'stream' },
  { a: 'main', b: 'back', tiles: [[18, 8], [19, 8]], fence: 'fence' }, // 藏在正房屋顶后面
  { a: 'flower', b: 'veg', tiles: [[29, 23], [29, 24]] },
  { a: 'tea', b: 'veg', tiles: [[30, 19], [31, 19]] },
  { a: 'tea', b: 'spring', tiles: [[31, 9], [32, 9]] },
  { a: 'back', b: 'spring', tiles: [[29, 7], [30, 7]], fence: 'fence' },
]
// 外墙上的大门：新住户从这里进来
const DOOR = [[14, 27], [15, 27]]

// 院子之间的隔断，一格一格照画列（都不能走、不能摆，只影响画法和遮挡高度）。外圈白墙黛瓦是 outer（自动），
// wall 院里的白墙（正院西侧带月亮门的那道）/ fence 矮木栏 / hedge 绿篱 / post 石柱；小溪是水、台地的台阶是小路，都不在这里
const run = (c0, r0, c1, r1) => {
  const out = []
  for (let c = c0; c <= c1; c++) for (let r = r0; r <= r1; r++) out.push([c, r])
  return out
}
const FENCE_TILES = {
  wall: run(12, 15, 12, 20),
  fence: [].concat(
    run(6, 1, 10, 1), run(10, 2, 10, 7), run(2, 9, 7, 9), // 动物小院：沿后墙、东侧、南侧的木栏
    run(11, 7, 17, 7), // 后花园和正院之间（正房后面）
    [[29, 4], [30, 4], [30, 5], [30, 6]], run(29, 8, 31, 8), // 温泉院西侧（斜着的）和南侧
    run(11, 21, 11, 23), run(12, 20, 15, 20), run(18, 20, 20, 20), // 前院：西侧、北侧两段
    run(20, 19, 20, 19), run(20, 24, 20, 26), // 前院东侧（中间是绿篱）
    run(28, 21, 31, 21), // 菜畦北边
  ),
  hedge: [].concat(
    run(9, 20, 10, 21), run(20, 21, 21, 22), [[20, 23]], run(13, 24, 14, 25), run(17, 25, 18, 25),
    run(29, 12, 30, 14),
  ),
  post: [[11, 20], [11, 24]],
}
const FENCE_TYPES = ['outer', 'wall', 'fence', 'hedge', 'stream', 'cliff', 'post']

// 小动物在壳里的活动点（站的那一格），作息和小事表按 id 引用
const SPOTS = [
  { id: 'coop', area: 'farm', c: 4, r: 5 },
  { id: 'eaves', area: 'main', c: 13, r: 16 },
  { id: 'steps', area: 'main', c: 15, r: 17 },
  { id: 'well', area: 'tea', c: 33, r: 17 },
  { id: 'veg_bed', area: 'veg', c: 32, r: 22 },
  { id: 'flower_path', area: 'flower', c: 24, r: 23 },
  { id: 'rockery', area: 'bamboo', c: 5, r: 18 },
  { id: 'tea_deck', area: 'tea', c: 31, r: 16 },
  { id: 'pond_water', area: 'pond', c: 25, r: 14 },
  { id: 'falls', area: 'back', c: 17, r: 4 },
  { id: 'hotspring', area: 'spring', c: 34, r: 6 },
  { id: 'bridge', area: 'back', c: 26, r: 6 },
  { id: 'haystack', area: 'farm', c: 7, r: 6 },
]

const STARTER_TILE = { c: 15, r: 18 }

// ---------------------------------------------------------------- 格子表

const TILES = []
for (let i = 0; i < GRID.cols * GRID.rows; i++) TILES.push({ area: '', kind: 'wall' })

const at = (c, r) => TILES[r * GRID.cols + c]
function fill(rect, patch) {
  for (let c = rect[0]; c < rect[2]; c++) {
    for (let r = rect[1]; r < rect[3]; r++) Object.assign(at(c, r), patch)
  }
}
AREAS.forEach((a) => fill(a.rect, { area: a.id, kind: 'lawn' }))
SHELL.forEach((s) => (s.tiles ? s.tiles.forEach(([c, r]) => Object.assign(at(c, r), { kind: s.kind })) : fill(s.rect, { kind: s.kind })))
Object.keys(FENCE_TILES).forEach((type) => FENCE_TILES[type].forEach(([c, r]) => Object.assign(at(c, r), { area: '', kind: 'wall', fence: type })))
GATES.forEach((g) => g.tiles.forEach(([c, r]) => Object.assign(at(c, r), { area: '', kind: 'gate', fence: g.fence || 'post' })))
DOOR.forEach(([c, r]) => Object.assign(at(c, r), { area: '', kind: 'door', fence: 'outer' }))
// 外圈一律是白墙黛瓦
TILES.forEach((t, i) => {
  const c = i % GRID.cols
  const r = Math.floor(i / GRID.cols)
  if (t.kind === 'wall' && (c === 0 || r === 0 || c === GRID.cols - 1 || r === GRID.rows - 1)) t.fence = 'outer'
  else if (t.kind === 'wall' && !t.fence) t.fence = 'post'
})

AREAS.forEach((a) => {
  const ids = GATES.filter((g) => g.a === a.id || g.b === a.id).map((g) => (g.a === a.id ? g.b : g.a))
  a.neighbors = ids.filter((id, i) => ids.indexOf(id) === i)
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
    for (let r = a.rect[1]; r < a.rect[3]; r++) if (tileInfo(c, r).area === id) tiles.push({ c, r })
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
  FENCE_TILES,
  FENCE_TYPES,
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
