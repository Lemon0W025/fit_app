// 小岛后花园：布局尺寸、没修整角落的遮罩和木牌、风景、花坛和岛边的花草、海浪、屏幕点按 → 格子（纯函数，有单测）

const { ISLAND_SIZE, REGIONS, sceneryIn, tileOpen, tilePlaceable } = require('./shared/garden')
const { isoLayout, tileTop, tileAt } = require('./iso')
const { buildScene, itemImage } = require('./garden-view')

// 1 倍时中间花园（6 格宽）占屏幕宽度的比例；小岛外面一圈海占屏幕宽度的比例
const CENTER_SCREEN = 0.92
const MARGIN_SCREEN = 0.5
// 篱笆遮罩图在菱形上方留出的高度（格宽的比例），给篱笆柱子往上冒
const FENCE_UP = 0.6

function islandLayout(windowWidth) {
  const tileW = (windowWidth * CENTER_SCREEN) / 6
  const L = isoLayout(ISLAND_SIZE, tileW * ISLAND_SIZE)
  const margin = Math.round(windowWidth * MARGIN_SCREEN)
  return { ...L, margin, viewWidth: L.width + margin * 2, viewHeight: L.height + margin * 2 }
}

// movable-view 的位置：小岛正中对准屏幕正中
function centerOffset(L, windowWidth, windowHeight) {
  const p = tileTop(ISLAND_SIZE / 2, ISLAND_SIZE / 2, L)
  return { x: windowWidth / 2 - (L.margin + p.x), y: windowHeight / 2 - (L.margin + p.y), scale: 1 }
}

// 小岛底图：整座岛一张图，和 isoLayout 的格子位置对齐
function islandView(L) {
  return { image: '/images/garden/island.png', left: 0, top: L.top, width: L.width, height: L.landHeight }
}

// 一个分区的菱形在 #world 里的外框
function regionBox(id, L) {
  const [c0, r0, c1, r1] = REGIONS.find((g) => g.id === id).rect
  const w = c1 - c0
  const h = r1 - r0
  const top = tileTop(c0, r0, L)
  return { left: top.x - (h * L.tileW) / 2, top: top.y, width: ((w + h) * L.tileW) / 2, height: ((w + h) * L.tileH) / 2 }
}

// 没修整的角落：盖一张「篱笆 + 杂草」遮罩，中间立木牌。横着的（c 方向长）和竖着的各一张图
function regionViews(regions, L) {
  const signWidth = L.tileW * 1.5
  return regions
    .filter((g) => !g.unlocked)
    .map((g) => {
      const [c0, r0, c1, r1] = REGIONS.find((x) => x.id === g.id).rect
      const box = regionBox(g.id, L)
      const up = L.tileW * FENCE_UP
      const middle = tileTop((c0 + c1) / 2, (r0 + r1) / 2, L)
      return {
        key: g.id,
        image: c1 - c0 > r1 - r0 ? '/images/garden/locked-wide.png' : '/images/garden/locked-tall.png',
        left: box.left,
        top: box.top - up,
        width: box.width,
        height: box.height + up,
        sign: { left: middle.x - signWidth / 2, bottom: L.height - middle.y, width: signWidth, name: g.name, cost: g.cost },
      }
    })
}

function sceneryViews(opened, L) {
  return buildScene(sceneryIn(opened), L)
}

// 花草、小石头之类的景色：只是好看，不能点、不挡路；c、r 可以带小数
function decor(key, itemId, c, r, scale, L) {
  const p = tileTop(c, r, L)
  const width = L.tileW * scale
  return { key, image: itemImage(itemId), left: p.x - width / 2, bottom: L.height - p.y, width, z: Math.round((c + r) * 10 + c) }
}

// 四个花坛（3×3 的角）：每个一棵大树配六丛花草，位置是花坛里的相对格子坐标
const BEDS = [
  { c: 0, r: 0, tree: 'osmanthus' },
  { c: 9, r: 0, tree: 'orange_tree' },
  { c: 0, r: 9, tree: 'persimmon_tree' },
  { c: 9, r: 9, tree: 'plum_tree' },
]
const BED_PLANTS = [
  { dc: 1.2, dr: 1.2, itemId: '', scale: 1.25 },
  { dc: 2.3, dr: 0.8, itemId: 'chrysanthemum', scale: 0.7 },
  { dc: 0.8, dr: 2.3, itemId: 'daisy', scale: 0.7 },
  { dc: 2.0, dr: 2.0, itemId: 'sunflower', scale: 0.75 },
  { dc: 2.7, dr: 1.7, itemId: 'grass', scale: 0.55 },
  { dc: 1.7, dr: 2.7, itemId: 'dandelion', scale: 0.6 },
  { dc: 2.7, dr: 2.7, itemId: 'mushroom', scale: 0.5 },
]

function flowerBeds(L) {
  const plants = []
  BEDS.forEach((bed, i) => {
    BED_PLANTS.forEach((p, j) => {
      plants.push(decor(`bed-${i}-${j}`, p.itemId || bed.tree, bed.c + p.dc, bed.r + p.dr, p.scale, L))
    })
  })
  return plants
}

// 岛边一圈（只在花坛那几段，不压到能摆东西的地方）：小花草、小石头
const SHORE_ITEMS = ['pebbles', 'grass', 'daisy', 'mushroom']
function shoreDecor(L) {
  const spots = [0.6, 1.8, 10.2, 11.4]
  const edges = [
    (t) => [t, 0.25], // 右上边
    (t) => [0.25, t], // 左上边
    (t) => [ISLAND_SIZE - 0.25, t], // 右下边
    (t) => [t, ISLAND_SIZE - 0.25], // 左下边
  ]
  const out = []
  edges.forEach((edge, i) => {
    spots.forEach((t, j) => {
      const [c, r] = edge(t)
      out.push(decor(`shore-${i}-${j}`, SHORE_ITEMS[(i + j) % SHORE_ITEMS.length], c, r, 0.45, L))
    })
  })
  return out
}

// 海上的浪花：在 movable-view 里的位置（小岛外框四个角那片海上）
const WAVE_SPOTS = [[0.08, 0.1], [0.3, 0.05], [0.84, 0.08], [0.94, 0.42], [0.06, 0.55], [0.12, 0.9], [0.62, 0.95], [0.88, 0.86]]
function waves(L) {
  const width = L.tileW * 1.2
  return WAVE_SPOTS.map(([x, y], i) => ({ key: `wave-${i}`, left: x * L.viewWidth - width / 2, top: y * L.viewHeight, width }))
}

// 屏幕上的点 → 格子；rect 是 #world 此刻在屏幕上的位置和宽度（已经算上拖动和缩放）
function tileFromTouch(x, y, rect, L) {
  const scale = rect.width / L.width
  return tileAt((x - rect.left) / scale, (y - rect.top) / scale, L)
}

function placeChecker(opened) {
  return (c, r) => tilePlaceable(opened, c, r)
}

function openChecker(opened) {
  return (c, r) => tileOpen(opened, c, r)
}

module.exports = {
  islandLayout,
  centerOffset,
  islandView,
  regionBox,
  regionViews,
  sceneryViews,
  flowerBeds,
  shoreDecor,
  waves,
  tileFromTouch,
  placeChecker,
  openChecker,
}
