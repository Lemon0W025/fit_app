// 暖暖营地：一张 3072×4096 的竖画，宠物和装饰都用画的像素坐标；草地是一整块多边形，禁区只有大帐篷和篝火
// 云函数和小程序共用，纯函数，有单测。画换了就按新画重新量这里的数字（scripts/camp/blockout.py 会照这里画白模）

const W = 3072
const H = 4096

function circle(cx, cy, r, n = 12) {
  const pts = []
  for (let i = 0; i < n; i++) {
    const a = (Math.PI * 2 * i) / n
    pts.push([Math.round(cx + r * Math.cos(a)), Math.round(cy + r * Math.sin(a))])
  }
  return pts
}

function ellipse(cx, cy, rx, ry, n = 16) {
  const pts = []
  for (let i = 0; i < n; i++) {
    const a = (Math.PI * 2 * i) / n
    pts.push([Math.round(cx + rx * Math.cos(a)), Math.round(cy + ry * Math.sin(a))])
  }
  return pts
}

const FIRE = [1536, 2680]
// 大帐篷的地面占位（篝火左上，门朝篝火；约占画宽 1/3，和篝火、食盆挨得近，是一组）
const TENT = [[460, 1580], [1400, 1580], [1400, 2240], [460, 2240]]

const SCENE = {
  width: W,
  height: H,
  // 能走能放的草地：一整片空旷的草坪，上面是树林边缘（只当背景），其余三边到画框
  grass: [[60, 720], [3012, 720], [3012, 4040], [60, 4040]],
  // 不能走也不能放的：草坪里只有帐篷和篝火
  nogo: {
    tent: TENT,
    fire: circle(FIRE[0], FIRE[1], 260),
  },
  fire: FIRE,
  // 傍晚围着篝火坐的 12 个点
  seats: ellipse(FIRE[0], FIRE[1], 600, 380, 12),
  // 两个食盆：篝火右下
  bowls: [[2020, 3140], [2240, 3190]],
  // 大帐篷门口的 3 个点：没窝的在这儿睡
  tent: { spots: [[760, 2330], [960, 2350], [1160, 2330]] },
  // 篝火右边一片向阳的草地：橘团、龟龟晒太阳的点
  sun: [[2350, 2450], [2560, 2600], [2250, 2700]],
  // 树林边缘的入口：新住户从这里走进来，鹤鹤从这里飞走
  entries: [[800, 740], [1536, 740], [2300, 740]],
  // 树林边上的树荫：没窝、帐篷门口也满了就睡这儿
  shade: [[500, 840], [1200, 820], [1900, 820], [2600, 840]],
}

// 亲密度：喂了几顿 → 几级（1～5）
const LEVELS = [0, 3, 8, 15, 25]

// 远近：画面最下面 1，最上面 0.82
function scaleAt(y) {
  return 0.82 + (0.18 * y) / H
}

function pointInPoly(x, y, poly) {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i]
    const [xj, yj] = poly[j]
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

function cross(o, a, b) {
  return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
}

function segmentsCross(a, b, c, d) {
  const d1 = cross(c, d, a)
  const d2 = cross(c, d, b)
  const d3 = cross(a, b, c)
  const d4 = cross(a, b, d)
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))
}

function rectCorners(rect) {
  return [[rect.left, rect.top], [rect.right, rect.top], [rect.right, rect.bottom], [rect.left, rect.bottom]]
}

// 线段 a-b 有没有穿过多边形（端点在里面也算）
function segmentHitsPoly(a, b, poly) {
  if (pointInPoly(a[0], a[1], poly) || pointInPoly(b[0], b[1], poly)) return true
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    if (segmentsCross(a, b, poly[j], poly[i])) return true
  }
  return false
}

// 多边形和矩形有没有碰到：角在对方里面、或边相交
function polyHitsRect(poly, rect) {
  const corners = rectCorners(rect)
  if (corners.some(([x, y]) => pointInPoly(x, y, poly))) return true
  if (poly.some(([x, y]) => x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom)) return true
  for (let i = 0; i < 4; i++) {
    if (segmentHitsPoly(corners[i], corners[(i + 1) % 4], poly)) return true
  }
  return false
}

// 矩形完全在多边形里：四个角和中心都在里面，而且边不穿出去
function rectInPoly(rect, poly) {
  const corners = rectCorners(rect)
  const cx = (rect.left + rect.right) / 2
  const cy = (rect.top + rect.bottom) / 2
  if (!corners.every(([x, y]) => pointInPoly(x, y, poly)) || !pointInPoly(cx, cy, poly)) return false
  for (let i = 0; i < 4; i++) {
    const a = corners[i]
    const b = corners[(i + 1) % 4]
    for (let k = 0, j = poly.length - 1; k < poly.length; j = k++) {
      if (segmentsCross(a, b, poly[j], poly[k])) return false
    }
  }
  return true
}

function expand(rect, m) {
  return { left: rect.left - m, top: rect.top - m, right: rect.right + m, bottom: rect.bottom + m }
}

function nogoPolys(names) {
  const out = []
  ;(names || Object.keys(SCENE.nogo)).forEach((name) => {
    const v = SCENE.nogo[name]
    if (!v) return
    if (Array.isArray(v[0]) && Array.isArray(v[0][0])) v.forEach((p) => out.push(p))
    else out.push(v)
  })
  return out
}

// 矩形（外扩 margin）碰没碰到禁区；names 只查这几种
function hitsNogo(rect, margin = 0, names = null) {
  const r = expand(rect, margin)
  return nogoPolys(names).some((poly) => polyHitsRect(poly, r))
}

// 这一点能不能站：在草地里、不在任何禁区里
function inGrass(x, y) {
  if (!pointInPoly(x, y, SCENE.grass)) return false
  return !nogoPolys().some((poly) => pointInPoly(x, y, poly))
}

function levelOf(fed) {
  let level = 1
  LEVELS.forEach((need, i) => {
    if (fed >= need) level = i + 1
  })
  return level
}

// 下一级要喂到几顿；满级返回 null
function nextLevelAt(fed) {
  const next = LEVELS.find((need) => need > fed)
  return next === undefined ? null : next
}

// 早上的礼物：当天 5 点以后、今天还没领过
function giftDue(lastGift, today, hour) {
  return hour >= 5 && lastGift !== today
}

module.exports = {
  W, H, SCENE, LEVELS,
  circle, ellipse, scaleAt, pointInPoly, segmentHitsPoly, polyHitsRect, rectInPoly, expand, hitsNogo, inGrass,
  levelOf, nextLevelAt, giftDue,
}
