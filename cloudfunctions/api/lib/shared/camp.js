// 暖暖营地：一张 4096×4096 的正方形大草坪（手机上默认看中间一半宽，拖着看两边），宠物和装饰都用画的像素坐标；草地是一整块多边形，禁区是大帐篷、篝火、木盖和提灯
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

// 下面的数字全部照 Codex 画的 art/raw/camp/camp.png 量的（scripts/camp/overlay.py 打格子），画换了就重新量
const FIRE = [2130, 2820]
// 大帐篷占的地：帐篷本身、两头的木桩，连同它身后一直到树林边的那片（走到帐篷后面就整个被挡住，干脆不让去）
const TENT = [[40, 860], [1480, 860], [1590, 1140], [1590, 1270], [1450, 1300], [780, 1500], [640, 1500], [150, 1230], [40, 1220]]

const SCENE = {
  width: W,
  height: H,
  // 能走能放的草地：树林边缘（约 y 860）以下整片草坪
  grass: [[40, 860], [4056, 860], [4056, 4060], [40, 4060]],
  // 不能走也不能放的：帐篷（连身后）、篝火石圈（连三脚架的脚）、靠在火边的木盖、放提灯的树桩
  nogo: {
    tent: TENT,
    fire: ellipse(FIRE[0], FIRE[1], 460, 250),
    lid: ellipse(1680, 2840, 220, 250),
    lantern: ellipse(2665, 2770, 115, 70),
  },
  // 篝火（石圈中心），火上吊着暖暖锅：营地的中心
  fire: FIRE,
  // 从底图里抠出来单独一层的东西（scripts/camp/cutouts.py 按 poly 圈的范围、去掉草地和花，抠出物件本身的精确轮廓）：
  //   box 是裁的范围（4 的倍数，抠图和底图切块的像素格对齐，盖上去不错位）；zy 是它落地的 y：宠物、装饰按脚下的 y 排前后，比 zy 靠上的就被它挡住
  //   front（有的话）是它地面前沿的折线：帐篷是斜着的，前沿从左往右先往下再往上，一个 zy 说不清，页面把它竖着切成 strip 宽的一条条，每条按自己那段前沿排前后
  // 锅的轮廓沿锅底走，不把底下的火苗抠进去（火苗在锅下面一层逐帧动）。锅按今天打了几顿换图 pot-0～3；rim 是锅口里面那圈（深色的口）的椭圆 [cx, cy, rx, ry]：锅里的内容画在这里头，热气从这儿冒
  cutouts: {
    tent: {
      box: [20, 420, 1600, 1520], zy: 1480, strip: 128,
      front: [[40, 1205], [190, 1200], [700, 1490], [780, 1478], [1450, 1275], [1600, 1262]],
      poly: [[40, 1150], [250, 1030], [520, 470], [570, 440], [1090, 660], [1130, 680], [1440, 930], [1500, 1050], [1565, 1140], [1570, 1255], [1500, 1265], [1450, 1272], [780, 1475], [640, 1480], [560, 1450], [160, 1210], [60, 1200]],
    },
    pot: {
      box: [1416, 1756, 2668, 2872], zy: 2820, rim: [2048, 2384, 180, 67],
      poly: [[1960, 1760], [2180, 1760], [2660, 2790], [2650, 2850], [2560, 2860], [2480, 2700], [2420, 2560], [2400, 2480], [2390, 2560], [2360, 2610], [2325, 2642], [2270, 2663], [2220, 2685], [2170, 2700], [2120, 2706], [2070, 2709], [2020, 2708], [1970, 2701], [1920, 2684], [1870, 2663], [1840, 2640], [1815, 2600], [1800, 2480], [1760, 2560], [1700, 2600], [1560, 2830], [1440, 2840], [1420, 2790]],
    },
    lid: {
      box: [1488, 2588, 1860, 3020], zy: 3000,
      poly: [[1700, 2605], [1760, 2625], [1805, 2670], [1830, 2730], [1834, 2800], [1820, 2870], [1786, 2930], [1740, 2980], [1680, 3000], [1620, 2995], [1570, 2965], [1530, 2910], [1512, 2840], [1518, 2770], [1545, 2700], [1590, 2645], [1645, 2612]],
    },
    lantern: {
      box: [2540, 2440, 2788, 2852], zy: 2810,
      poly: [[2625, 2470], [2650, 2452], [2690, 2452], [2715, 2470], [2722, 2500], [2745, 2520], [2742, 2580], [2730, 2600], [2735, 2640], [2765, 2660], [2770, 2700], [2765, 2800], [2745, 2830], [2680, 2840], [2600, 2835], [2572, 2810], [2565, 2690], [2585, 2650], [2605, 2635], [2600, 2600], [2592, 2560], [2595, 2520], [2615, 2505]],
    },
  },
  // 篝火的火苗：box 是逐帧动画盖的那块（帧从画上取，只有火苗那几处的明暗在变，scripts/camp/fx_art.py）；zone 是火苗所在的那片（锅底下、木柴之间）
  flame: {
    box: [1880, 2648, 2292, 2896], // 4 的倍数：按 0.75 / 0.5 切出来正好落在底图切块的像素格上，盖上去不错位
    pad: 16, // 每帧四周多带这么宽的原画：拼成一条以后相邻两帧的边不会互相渗（不然框边上有一道细线）
    zone: [[1945, 2700], [2190, 2700], [2185, 2745], [2130, 2800], [2110, 2860], [2040, 2865], [1975, 2850], [1960, 2780]],
  },
  // 傍晚围着锅坐的 12 个点：开口朝后的马蹄形，绕开木盖、提灯和食盆
  seats: arc(FIRE[0], FIRE[1], 820, 520, -20, 200, 12),
  // 两个食盆（画上的碗口中心）；bowl 是碗口里面那圈的半径（吃的画在这圈里，碗沿从画上抠下来盖在外圈，scripts/camp/bowl_food.py）
  bowls: [[2708, 3082], [3005, 3182]],
  // boxes：两个碗各自的碗沿抠图范围（4 的倍数，包住碗沿和碗身）
  bowl: { rx: 113, ry: 64, boxes: [[2556, 2984, 2860, 3248], [2852, 3080, 3160, 3344]] },
  // 大帐篷门口的 3 个点：没窝的在这儿睡
  tent: { spots: [[1000, 1530], [1210, 1460], [1420, 1400]] },
  // 站在这儿会被锅身、提灯整个挡住的地方：路过可以，停下来歇着、坐着、睡觉不选这里
  hide: [
    [[1820, 2330], [2420, 2330], [2440, 2560], [1800, 2560]],
    [[2560, 2400], [2770, 2400], [2780, 2700], [2550, 2700]],
  ],
  // 篝火右边一片向阳的草地：橘团、龟龟晒太阳的点
  sun: [[3300, 2500], [3550, 2700], [3250, 2900]],
  // 树林边缘的入口：新住户从这里走进来，鹤鹤从这里飞走
  entries: [[1900, 880], [2600, 880], [3300, 880]],
  // 树林边上的树荫：没窝、帐篷门口也满了就睡这儿
  shade: [[1800, 960], [2400, 940], [3000, 940], [3600, 960]],
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
  // 正好穿过顶点时叉积是 0，上面判不出来（比如竖直穿过椭圆的上下两个顶点）：再看线段上几个点在不在里面
  for (let k = 1; k < 8; k++) {
    if (pointInPoly(a[0] + ((b[0] - a[0]) * k) / 8, a[1] + ((b[1] - a[1]) * k) / 8, poly)) return true
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

// 站在这儿会不会被锅、提灯挡住大半（停下来的地方要避开）
function hiddenAt(x, y) {
  return SCENE.hide.some((poly) => pointInPoly(x, y, poly))
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
  circle, ellipse, scaleAt, pointInPoly, segmentHitsPoly, polyHitsRect, rectInPoly, expand, hitsNogo, inGrass, hiddenAt, nogoPolys,
  levelOf, nextLevelAt, giftDue,
}
