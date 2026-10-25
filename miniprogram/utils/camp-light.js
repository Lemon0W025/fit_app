// 夜里宠物、装饰按站的位置怎么上色：
//   篝火点着（锅里煮着东西）：全营地本来的颜色，只略暗略暖，不盖月光
//   篝火没点：按光照图（camp-light-map.js，scripts/camp/light_map.py 照熄了火的夜景算的）是月光色，
//   再按灯（画上的提灯、帐篷门口、摆的小灯笼 / 石灯笼 / 灯串）的远近往暖亮拉，走过去连续变化
// 火点着时画上的那套光（BRIGHT / WARM）现在只给 lightAt 用（测试、录屏对照）

const { decorById } = require('./shared/decor')

const { N, CELL, B64, BRIGHT, WARM, BRIGHT_OFF, WARM_OFF } = require('./camp-light-map')

function cell(s, i, j) {
  return B64.indexOf(s[Math.max(0, Math.min(N - 1, j)) * N + Math.max(0, Math.min(N - 1, i))]) / 63
}

// 双线性插值：(x, y) 是画的像素
function sample(s, x, y) {
  const fx = x / CELL - 0.5
  const fy = y / CELL - 0.5
  const i = Math.floor(fx)
  const j = Math.floor(fy)
  const u = fx - i
  const v = fy - j
  return (cell(s, i, j) * (1 - u) + cell(s, i + 1, j) * u) * (1 - v) + (cell(s, i, j + 1) * (1 - u) + cell(s, i + 1, j + 1) * u) * v
}

// 亮度比（夜 / 日，0.3～1.1）和暖色（-1 偏蓝 … 1 偏红）；lit：篝火点着没有
function lightAt(x, y, lit = true) {
  return { bright: 0.3 + 0.8 * sample(lit ? BRIGHT : BRIGHT_OFF, x, y), warm: sample(lit ? WARM : WARM_OFF, x, y) * 2 - 1 }
}

const r2 = (n) => Math.round(n * 100) / 100

// 画上一直亮着的灯：树桩上的提灯（落地那圈）、大帐篷门口；摆着的发光装饰（fx: 'glow'）也算灯，灯串照得远一点
const PAINTED_LAMPS = [{ x: 2665, y: 2770, r: 480 }, { x: 1210, y: 1460, r: 520 }]
const LAMP_R = { lights: 560 }
const DECOR_LAMP_R = 420

function lampsOf(placed) {
  const decor = (placed || []).filter((p) => {
    const d = decorById(p.id)
    return d && d.fx === 'glow'
  })
  return PAINTED_LAMPS.concat(decor.map((p) => ({ x: p.x, y: p.y, r: LAMP_R[p.id] || DECOR_LAMP_R })))
}

// 离灯多近（0 远处 … 1 灯底下）：每盏灯 1 - (d / r)²，取最亮的那盏
function lampAt(x, y, lamps) {
  return (lamps || []).reduce((best, l) => {
    const d = Math.hypot(x - l.x, y - l.y) / l.r
    return Math.max(best, d < 1 ? 1 - d * d : 0)
  }, 0)
}

const LIT = { light: 'brightness(0.92) saturate(1) sepia(0.12)', moon: 0, moonLight: 'none' }

// 夜里站在 (x, y) 的东西怎么上色（两层）：
//   light：本体的 CSS filter（亮度、颜色多足、偏暖多少）
//   moon：盖在本体上的「月光版」（同一张图去色、染成画上夜色那种蓝白）的不透明度：越冷越不透明
//   moonLight：月光版的 filter
// lit：篝火点着没有；lamps：lampsOf(摆着的装饰)。两层都随位置连续变化，走路时跟着位置一起过渡（不会走到灯边一下子变色）
function nightLook(x, y, lit = true, lamps = PAINTED_LAMPS) {
  if (lit) return { ...LIT }
  const { bright, warm } = lightAt(x, y, false)
  const hot = Math.max(0, warm)
  const cool = Math.max(0, -warm)
  const f = lampAt(x, y, lamps)
  const b = Math.max(0.5, Math.min(1.05, 0.2 + bright))
  const bb = b + (0.9 - b) * f
  const sat = 0.75 + 0.35 * hot
  const sep = 0.3 * hot
  return {
    light: `brightness(${r2(bb)}) saturate(${r2(sat + (0.95 - sat) * f)}) sepia(${r2(sep + (0.25 - sep) * f)})`,
    moon: r2(Math.min(0.85, cool) * (1 - f)),
    moonLight: `grayscale(1) sepia(1) hue-rotate(178deg) saturate(1.7) brightness(${r2(Math.min(0.9, bb * 1.12))})`,
  }
}

module.exports = { lightAt, lampsOf, lampAt, nightLook }
