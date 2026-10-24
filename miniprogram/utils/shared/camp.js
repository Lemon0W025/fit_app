// 暖暖营地：一张 4096×4096 的正方形大草坪（手机上默认看中间一半宽，拖着看两边），宠物和装饰都用画的像素坐标；草地是一整块多边形，禁区只有大帐篷和篝火
// 云函数和小程序共用，纯函数，有单测。画换了就按新画重新量这里的数字（scripts/camp/blockout.py 会照这里画白模）

const W = 4096
const H = 4096

function circle(cx, cy, r, n = 12) {
  const pts = []
  for (let i = 0; i < n; i++) {
    const a = (Math.PI * 2 * i) / n
    pts.push([Math.round(cx + r * Math.cos(a)), Math.round(cy + r * Math.sin(a))])
  }
  return pts
}

// 椭圆上从 fromDeg 到 toDeg 的一段弧，均匀取 n 个点
function arc(cx, cy, rx, ry, fromDeg, toDeg, n) {
  const pts = []
  for (let i = 0; i < n; i++) {
    const a = ((fromDeg + ((toDeg - fromDeg) * i) / (n - 1)) * Math.PI) / 180
    pts.push([Math.round(cx + rx * Math.cos(a)), Math.round(cy + ry * Math.sin(a))])
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

const FIRE = [2048, 2250]
// 大帐篷的地面占位：整块草坪的最左上角（默认视角看不到，拖过去才看到），门朝篝火（右下）
const TENT = [[300, 1000], [1300, 1000], [1300, 1680], [300, 1680]]

const SCENE = {
  width: W,
  height: H,
  // 能走能放的草地：一整片空旷的草坪，上面是树林边缘（只当背景），其余三边到画框
  grass: [[60, 760], [4036, 760], [4036, 4036], [60, 4036]],
  // 不能走也不能放的：草坪里只有帐篷和篝火
  nogo: {
    tent: TENT,
    fire: circle(FIRE[0], FIRE[1], 260),
  },
  // 篝火在正中偏前一点，火上吊着暖暖锅（营地的中心，像 Pokémon Sleep 的卡比兽）
  fire: FIRE,
  // 从底图里抠出来单独一层的东西（画的像素 box；zy 是它落地的 y，宠物按 y 排前后就能被它挡住）。锅按今天打了几顿换图 pot-0～3
  cutouts: {
    tent: { box: [200, 620, 1400, 1700], zy: 1680 },
    pot: { box: [1548, 1600, 2548, 2540], zy: 2250 },
  },
  // 傍晚围着锅坐的 12 个点：开口朝后的马蹄形，没人坐到锅正后面被挡住
  seats: arc(FIRE[0], FIRE[1], 640, 400, -30, 210, 12),
  // 两个食盆：篝火右下
  bowls: [[2560, 2820], [2780, 2870]],
  // 大帐篷门口的 3 个点：没窝的在这儿睡
  tent: { spots: [[700, 1780], [920, 1800], [1140, 1780]] },
  // 篝火右边一片向阳的草地：橘团、龟龟晒太阳的点
  sun: [[2950, 2150], [3150, 2300], [2850, 2450]],
  // 树林边缘的入口：新住户从这里走进来，鹤鹤从这里飞走
  entries: [[1800, 780], [2400, 780], [3000, 780]],
  // 树林边上的树荫：没窝、帐篷门口也满了就睡这儿
  shade: [[1700, 880], [2300, 860], [2900, 860], [3500, 880]],
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
  arc,
  W, H, SCENE, LEVELS,
  circle, ellipse, scaleAt, pointInPoly, segmentHitsPoly, polyHitsRect, rectInPoly, expand, hitsNogo, inGrass,
  levelOf, nextLevelAt, giftDue,
}
