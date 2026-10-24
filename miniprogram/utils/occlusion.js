// 遮挡：墙、月亮门、大门、建筑要挡住站在它们后面的东西。底图是一整张画，所以把这些东西从底图上「抠」一块
// （clip-path 多边形 + 同一张底图切块）盖在上面，只在有东西站在后面、又被挡到的时候才生成，平时一个节点都不多。纯函数，有单测
// 几何和 scripts/estate/blockout.py 一致（高度按格高算）；原画到了如果形状对不上，调这里的常数

const { GRID, SHELL, GATES, DOOR, tileInfo } = require('./shared/estate')
const { tileTop } = require('./iso')

const WALL_H = 2.2
// 月亮门洞：半径（格高），洞底贴地
const GATE_HOLE = { radius: 1.1 }
const DOOR_H = WALL_H * 1.3
// 建筑：h 墙身高、roof 屋顶高、over 屋檐出挑（格）、inset 比格子缩进多少（格）
const BUILDINGS = {
  hall: { h: 3, roof: 1.6, over: 0.3 },
  screen: { h: 1.5 },
  coop: { h: 1.4, roof: 0.8, over: 0.3 },
  cabin: { h: 1.8, roof: 1.0, over: 0.3 },
  well: { h: 0.8, inset: 0.2 },
  trellis: { h: 1.6, inset: 0.1 },
  rockery: { h: 2.2, inset: 0.3 },
}
// 抠图比几何稍微宽一点，免得画里的墙边露出一条缝
const PAD = 0.04

// 块的 z-index（节点用的值）：物件节点是 (c+r)*10 + c + 10、小动物是 +15；后面一格的东西最多到 +15、前面一格的东西最少 +20，取 +17 夹在中间
const depthZ = (c, r) => (c + r) * 10 + c + 17

function hull(points) {
  const pts = points.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1])
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
  const lower = []
  pts.forEach((p) => {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop()
    lower.push(p)
  })
  const upper = []
  pts.slice().reverse().forEach((p) => {
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop()
    upper.push(p)
  })
  return lower.slice(0, -1).concat(upper.slice(0, -1))
}

// 一块地抬起来的轮廓：地面四角 + 抬高 h 格高后的四角（屋檐可以比地面宽 over 格）的凸包
function prism(c0, r0, c1, r1, h, L, over = 0, roof = 0) {
  const pts = []
  ;[[c0, r0], [c1, r0], [c1, r1], [c0, r1]].forEach(([c, r]) => {
    const p = tileTop(c, r, L)
    pts.push([p.x, p.y])
  })
  const o = over
  ;[[c0 - o, r0 - o], [c1 + o, r0 - o], [c1 + o, r1 + o], [c0 - o, r1 + o]].forEach(([c, r]) => {
    const p = tileTop(c, r, L)
    pts.push([p.x, p.y - h * L.tileH])
  })
  if (roof) {
    const ridge = tileTop((c0 + c1) / 2, (r0 + r1) / 2, L)
    const long = c1 - c0 >= r1 - r0
    const k = (Math.abs((c1 - c0) - (r1 - r0)) / 2) || 0
    const a = long ? tileTop((c0 + c1) / 2 - k, (r0 + r1) / 2, L) : tileTop((c0 + c1) / 2, (r0 + r1) / 2 - k, L)
    const b = long ? tileTop((c0 + c1) / 2 + k, (r0 + r1) / 2, L) : tileTop((c0 + c1) / 2, (r0 + r1) / 2 + k, L)
    pts.push([a.x, a.y - (h + roof) * L.tileH], [b.x, b.y - (h + roof) * L.tileH], [ridge.x, ridge.y - (h + roof) * L.tileH])
  }
  return hull(pts)
}

function pad(poly, px) {
  const cx = poly.reduce((s, p) => s + p[0], 0) / poly.length
  const cy = poly.reduce((s, p) => s + p[1], 0) / poly.length
  return poly.map(([x, y]) => {
    const dx = x - cx
    const dy = y - cy
    const d = Math.hypot(dx, dy) || 1
    return [x + (dx / d) * px, y + (dy / d) * px]
  })
}

function bboxOf(poly) {
  let x0 = Infinity
  let y0 = Infinity
  let x1 = -Infinity
  let y1 = -Infinity
  poly.forEach(([x, y]) => {
    x0 = Math.min(x0, x)
    y0 = Math.min(y0, y)
    x1 = Math.max(x1, x)
    y1 = Math.max(y1, y)
  })
  return { left: x0, top: y0, width: x1 - x0, height: y1 - y0 }
}

// 用竖线 x = a、x = b 之间的带子裁一个凸多边形（Sutherland–Hodgman）
function clipX(poly, a, b) {
  const cut = (pts, inside, at) => {
    const out = []
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i]
      const q = pts[(i + 1) % pts.length]
      const pin = inside(p)
      const qin = inside(q)
      if (pin) out.push(p)
      if (pin !== qin) out.push(at(p, q))
    }
    return out
  }
  const atX = (x) => (p, q) => [x, p[1] + ((q[1] - p[1]) * (x - p[0])) / (q[0] - p[0])]
  let out = cut(poly, (p) => p[0] >= a, atX(a))
  if (out.length) out = cut(out, (p) => p[0] <= b, atX(b))
  return out
}

function circle(cx, cy, r, n = 20) {
  const pts = []
  for (let i = 0; i < n; i++) {
    const t = (i / n) * Math.PI * 2
    pts.push([cx + r * Math.cos(t), cy + r * Math.sin(t)])
  }
  return pts
}

// 带洞的多边形：外圈走一遍，跳到内圈走一遍再跳回来；配合 evenodd 就是个洞
function withHole(outer, inner) {
  return outer.concat([outer[0]], inner, [inner[0]])
}

function piece(key, c, r, poly, L, hole) {
  const padded = pad(poly, L.tileW * PAD)
  const box = bboxOf(padded)
  return { key, c, r, z: depthZ(c, r), poly: hole ? withHole(padded, hole) : padded, outer: padded, box, hole: !!hole }
}

// 几格门洞合起来的中心点（和白模一样）
function pairCenter(tiles, L) {
  const cs = tiles.map((t) => t[0])
  const rs = tiles.map((t) => t[1])
  return tileTop((Math.min(...cs) + Math.max(...cs) + 1) / 2, (Math.min(...rs) + Math.max(...rs) + 1) / 2, L)
}

// 所有会挡人的东西，每块一个多边形（世界坐标 px）。按格宽缓存
const cache = {}
function pieces(L) {
  if (cache[L.tileW]) return cache[L.tileW]
  const out = []
  const gateTiles = new Set()
  GATES.forEach((g) => g.tiles.forEach(([c, r]) => gateTiles.add(`${c},${r}`)))
  const doorTiles = new Set(DOOR.map(([c, r]) => `${c},${r}`))
  for (let r = 0; r < GRID.rows; r++) {
    for (let c = 0; c < GRID.cols; c++) {
      if (tileInfo(c, r).kind !== 'wall') continue
      out.push(piece(`w${c}-${r}`, c, r, prism(c, r, c + 1, r + 1, WALL_H, L), L))
    }
  }
  GATES.forEach((g) => {
    const cs = g.tiles.map((t) => t[0])
    const rs = g.tiles.map((t) => t[1])
    const [c0, r0] = g.tiles[0]
    const front = g.tiles.reduce((best, t) => (t[0] + t[1] > best[0] + best[1] ? t : best), g.tiles[0])
    const center = pairCenter(g.tiles, L)
    const r = GATE_HOLE.radius * L.tileH
    const hole = circle(center.x, center.y - r, r)
    out.push(piece(`g${c0}-${r0}`, front[0], front[1], prism(Math.min(...cs), Math.min(...rs), Math.max(...cs) + 1, Math.max(...rs) + 1, WALL_H, L), L, hole))
  })
  {
    const [[c0, r0], [c1, r1]] = DOOR
    const center = pairCenter(DOOR, L)
    const h = DOOR_H * L.tileH
    const hole = [
      [center.x - L.tileW * 0.45, center.y - h * 0.85], [center.x + L.tileW * 0.45, center.y - h * 0.85],
      [center.x + L.tileW * 0.45, center.y - h * 0.05], [center.x - L.tileW * 0.45, center.y - h * 0.05],
    ]
    out.push(piece(`d${c0}-${r0}`, c1, r1, prism(Math.min(c0, c1), Math.min(r0, r1), Math.max(c0, c1) + 1, Math.max(r0, r1) + 1, DOOR_H, L, 0.2, 0.6), L, hole))
  }
  SHELL.forEach((s) => {
    const b = s.kind === 'block' && BUILDINGS[s.what]
    if (!b) return
    const [c0, r0, c1, r1] = s.rect
    const inset = b.inset || 0
    const poly = prism(c0 + inset, r0 + inset, c1 - inset, r1 - inset, b.h, L, b.over || 0, b.roof || 0)
    // 宽的建筑按屏幕上的竖条切开，每条的前后顺序按它脚下最靠前的那格算（不然前面的东西会被屋顶盖住）
    for (let k = c0 - (r1 - 1); k <= c1 - 1 - r0; k++) {
      const r = Math.min(r1 - 1, c1 - 1 - k)
      const c = r + k
      const xa = L.originX + ((k - 0.5) * L.tileW) / 2
      const xb = L.originX + ((k + 0.5) * L.tileW) / 2
      const lo = k === c0 - (r1 - 1) ? -Infinity : xa
      const hi = k === c1 - 1 - r0 ? Infinity : xb
      const band = clipX(poly, lo, hi)
      if (band.length < 3) continue
      out.push(piece(`b${s.what}${c0}-${r0}-${k}`, c, r, band, L))
    }
  })
  cache[L.tileW] = out
  return out
}

const overlaps = (a, b) => a.left < b.left + b.width && b.left < a.left + a.width && a.top < b.top + b.height && b.top < a.top + a.height

// 凸多边形和矩形有没有碰到（分离轴：矩形的两条轴 + 多边形每条边的法线）
function hitsRect(poly, rect) {
  const corners = [[rect.left, rect.top], [rect.left + rect.width, rect.top], [rect.left + rect.width, rect.top + rect.height], [rect.left, rect.top + rect.height]]
  const axes = [[1, 0], [0, 1]]
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]
    const b = poly[(i + 1) % poly.length]
    axes.push([-(b[1] - a[1]), b[0] - a[0]])
  }
  return axes.every(([ax, ay]) => {
    const project = (pts) => pts.reduce((m, [x, y]) => {
      const d = x * ax + y * ay
      return [Math.min(m[0], d), Math.max(m[1], d)]
    }, [Infinity, -Infinity])
    const [a0, a1] = project(poly)
    const [b0, b1] = project(corners)
    return a0 < b1 && b0 < a1
  })
}

// rects：画面上的东西 [{ left, top, width, height, z }]；返回需要盖上去的块（有东西在它后面、又碰到它的轮廓）
function occludersFor(all, rects) {
  if (!rects.length) return []
  return all.filter((p) => rects.some((s) => s.z < p.z && overlaps(p.box, s) && hitsRect(p.outer, s)))
}

const fmt = (n) => Math.round(n * 10) / 10

// 一块 → 页面节点：clip-path 多边形（相对自己的外框）+ 盖在里面的底图切块（和 world.artTiles 同一批图，不多下载）
function view(p, art) {
  const { box } = p
  const clip = `polygon(${p.hole ? 'evenodd, ' : ''}${p.poly.map(([x, y]) => `${fmt(x - box.left)}px ${fmt(y - box.top)}px`).join(', ')})`
  const tiles = art
    .filter((t) => overlaps(t, box))
    .map((t) => ({ key: t.key, image: t.image, left: fmt(t.left - box.left), top: fmt(t.top - box.top), width: fmt(t.width), height: fmt(t.height) }))
  return { key: p.key, left: fmt(box.left), top: fmt(box.top), width: fmt(box.width), height: fmt(box.height), z: p.z, clip, tiles }
}

// 画面上的东西的外框：物件图是正方形画布（高 = 宽），小动物给 bodyHeight；z 是节点真正的 z-index（数据里的 z + 10）
// 图两边一般是空的，外框左右各收 15%，免得隔着一格也算碰到
const INSET = 0.15
function rectOf(s, L) {
  const height = s.bodyHeight != null ? s.bodyHeight : s.width
  return { left: s.left + s.width * INSET, top: L.height - s.bottom - height, width: s.width * (1 - 2 * INSET), height, z: s.z + 10 }
}

module.exports = { WALL_H, BUILDINGS, pieces, occludersFor, view, rectOf, prism, clipX, hull, hitsRect }
