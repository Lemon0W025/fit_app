// 园林大宅院的画面布局：尺寸、底图切块、没修院子上的云朵、修整木牌、摆放时的亮格、屏幕点按 → 格子（纯函数，有单测）

const { GRID, areaById, signTile, placeableTiles } = require('./shared/estate')
const { gridLayout, tileTop, tileAt } = require('./iso')

// 1 倍时一个院子（8 格 + 两边的墙）占屏幕宽的比例；宅院外面一圈留白占屏幕宽的比例
const COURT_SCREEN = 0.96
const MARGIN_SCREEN = 0.5
// 底图切成 ART_SPLIT × ART_SPLIT 块
const ART_SPLIT = 4
// 云朵有 9 种形状（images/garden/clouds/c1～c9.png）
const CLOUD_KINDS = 9
const cloudImage = (n) => `/images/garden/clouds/c${1 + (n % CLOUD_KINDS)}.png`

function estateLayout(windowWidth) {
  const tileW = (windowWidth * COURT_SCREEN) / 9
  const L = gridLayout(GRID.cols, GRID.rows, tileW)
  const margin = Math.round(windowWidth * MARGIN_SCREEN)
  return { ...L, margin, viewWidth: L.width + margin * 2, viewHeight: L.height + margin * 2 }
}

// movable-view 的位置：让 #world 里的某个点对准屏幕正中
function offsetFor(point, L, win) {
  return { x: win.width / 2 - (L.margin + point.x), y: win.height / 2 - (L.margin + point.y), scale: 1 }
}

// 格子中心（c、r 可以是小数）
function tilePoint(c, r, L) {
  return tileTop(c + 0.5, r + 0.5, L)
}

function areaOffset(areaId, L, win) {
  const [c0, r0, c1, r1] = areaById(areaId).rect
  return offsetFor(tileTop((c0 + c1) / 2, (r0 + r1) / 2, L), L, win)
}

function tileOffset(c, r, L, win) {
  return offsetFor(tilePoint(c, r, L), L, win)
}

// 底图：一整张切成 4×4 块，正好铺满 #world。base 是云存储的 fileID 前缀（以 / 结尾），空就用包里的白模切块
function artTiles(L, base = '') {
  const w = L.width / ART_SPLIT
  const h = L.height / ART_SPLIT
  const tiles = []
  for (let row = 0; row < ART_SPLIT; row++) {
    for (let col = 0; col < ART_SPLIT; col++) {
      const name = `t${row}${col}.jpg`
      tiles.push({ key: `art-${row}-${col}`, image: base ? `${base}${name}` : `/images/garden/estate/${name}`, left: col * w, top: row * h, width: w, height: h })
    }
  }
  return tiles
}

// 一个院子的菱形在 #world 里的外框
function areaBox(id, L) {
  const [c0, r0, c1, r1] = areaById(id).rect
  const w = c1 - c0
  const h = r1 - r0
  const top = tileTop(c0, r0, L)
  return { left: top.x - (h * L.tileW) / 2, top: top.y, width: ((w + h) * L.tileW) / 2, height: ((w + h) * L.tileH) / 2 }
}

// 可重复的伪随机：同一个院子、同一朵云每次位置一样
function noise(n) {
  const x = Math.sin(n * 12.9898 + 78.233) * 43758.5453
  return x - Math.floor(x)
}

// 没修的院子：铺 6～9 朵云（都落在院子里面，别飘到隔壁），慢慢飘
function cloudViews(areas, L) {
  const out = []
  areas.forEach((a, ai) => {
    if (a.unlocked) return
    const [c0, r0, c1, r1] = areaById(a.id).rect
    const n = 6 + Math.floor(noise(ai + 1) * 4)
    for (let i = 0; i < n; i++) {
      const u = 0.18 + 0.64 * noise(ai * 100 + i * 3 + 1)
      const v = 0.18 + 0.64 * noise(ai * 100 + i * 3 + 2)
      const p = tileTop(c0 + u * (c1 - c0), r0 + v * (r1 - r0), L)
      const width = L.tileW * (1.5 + 1.0 * noise(ai * 100 + i * 3 + 3))
      const kind = Math.floor(noise(ai * 100 + i * 3 + 4) * CLOUD_KINDS)
      out.push({ key: `${a.id}-${i}`, area: a.id, image: cloudImage(kind), left: p.x - width / 2, top: p.y - width * 0.3, width, delay: Math.round(i * 7) / 10 })
    }
  })
  return out
}

// 能修的院子：门里侧立木牌。字号跟着木牌大小走（木牌在地图里会缩放）
function signViews(areas, opened, L) {
  const signWidth = L.tileW * 2.2
  const out = []
  areas.forEach((a) => {
    if (!a.unlockable) return
    const t = signTile(opened, a.id)
    if (!t) return
    const p = tilePoint(t.c, t.r, L)
    out.push({ key: a.id, left: p.x - signWidth / 2, bottom: L.height - p.y, width: signWidth, fontSize: Math.round(signWidth * 0.115 * 10) / 10, name: a.name, cost: a.cost })
  })
  return out
}

// 摆放、移动时亮起的格子（2×2 的只亮能当左前角的格，点下去占 4 格）
function hintViews(opened, placed, itemId, ignoreUid, L) {
  return placeableTiles(opened, placed, itemId, ignoreUid).map(({ c, r }) => {
    const t = tileTop(c, r, L)
    return { key: `${c}-${r}`, c, r, left: t.x - L.tileW / 2, top: t.y, width: L.tileW, height: L.tileH }
  })
}

// 屏幕上的点 → 格子；rect 是 #world 此刻在屏幕上的位置和宽度（已经算上拖动和缩放）
function tileFromTouch(x, y, rect, L) {
  const scale = rect.width / L.width
  return tileAt((x - rect.left) / scale, (y - rect.top) / scale, L)
}

module.exports = {
  estateLayout,
  offsetFor,
  tilePoint,
  areaOffset,
  tileOffset,
  artTiles,
  areaBox,
  cloudViews,
  signViews,
  hintViews,
  tileFromTouch,
}
