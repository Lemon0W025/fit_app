// 让壳自己动起来：水面波光、温泉热气、瀑布流水、花圃院飘花瓣。按已修整的院子算位置（纯函数，有单测）；全是 CSS 动画，不占包

const { SHELL, areaById } = require('./shared/estate')
const { tileTop } = require('./iso')

const STEAM_IMAGE = '/images/garden/fx/steam.png'
const SPARKLE_IMAGE = '/images/garden/fx/sparkle.png'

// 可重复的伪随机：同一处每次一样
function noise(n) {
  const x = Math.sin(n * 12.9898 + 78.233) * 43758.5453
  return x - Math.floor(x)
}

const fmt = (n) => Math.round(n * 10) / 10

// 一块矩形地在画面上的菱形：外框 + 相对外框的 clip-path
function diamond(rect, L) {
  const [c0, r0, c1, r1] = rect
  const pts = [tileTop(c0, r0, L), tileTop(c1, r0, L), tileTop(c1, r1, L), tileTop(c0, r1, L)]
  const left = Math.min(...pts.map((p) => p.x))
  const top = Math.min(...pts.map((p) => p.y))
  const width = Math.max(...pts.map((p) => p.x)) - left
  const height = Math.max(...pts.map((p) => p.y)) - top
  const clip = `polygon(${pts.map((p) => `${fmt(p.x - left)}px ${fmt(p.y - top)}px`).join(', ')})`
  return { left: fmt(left), top: fmt(top), width: fmt(width), height: fmt(height), clip }
}

// areas：[{ id, unlocked }]
function fxViews(areas, L) {
  const opened = new Set(areas.filter((a) => a.unlocked).map((a) => a.id))
  const out = []
  let n = 0
  SHELL.forEach((s, si) => {
    if (!opened.has(s.area)) return
    if (s.kind === 'water') {
      // 波光：顺着水面慢慢滑的高光
      out.push({ key: `shimmer-${si}`, kind: 'shimmer', ...diamond(s.rect, L), delay: fmt(noise(si) * 4), z: 3 })
      // 几点星光，一闪一闪
      const [c0, r0, c1, r1] = s.rect
      const count = Math.max(1, Math.round(((c1 - c0) * (r1 - r0)) / 6))
      for (let i = 0; i < count; i++) {
        const p = tileTop(c0 + 0.3 + noise(si * 31 + i * 7 + 1) * (c1 - c0 - 0.6), r0 + 0.3 + noise(si * 31 + i * 7 + 2) * (r1 - r0 - 0.6), L)
        const size = L.tileW * 0.22
        out.push({ key: `spark-${si}-${i}`, kind: 'sparkle', image: SPARKLE_IMAGE, left: fmt(p.x - size / 2), top: fmt(p.y - size / 2), width: fmt(size), height: fmt(size), delay: fmt(noise(si * 31 + i * 7 + 3) * 3), z: 4 })
      }
      if (s.what === 'spring') {
        // 热气：从池面冒上来，三股错开
        for (let i = 0; i < 3; i++) {
          const p = tileTop(c0 + 0.8 + noise(si * 17 + i * 5 + 1) * (c1 - c0 - 1.6), r0 + 0.8 + noise(si * 17 + i * 5 + 2) * (r1 - r0 - 1.6), L)
          const size = L.tileW * 0.9
          out.push({ key: `steam-${i}`, kind: 'steam', image: STEAM_IMAGE, left: fmt(p.x - size / 2), top: fmt(p.y - size), width: fmt(size), height: fmt(size), delay: fmt(i * 1.3), z: 1500 })
        }
      }
      if (s.what === 'falls') {
        // 瀑布：从假山顶落进潭里的一条白练（假山在水潭后面一格，画里瀑布就在那儿）
        const cx = (c0 + c1) / 2
        const topP = tileTop(cx, r0, L)
        const botP = tileTop(cx, r0 + 0.6, L)
        const width = L.tileW * 0.5
        const height = L.tileH * 2.6
        out.push({ key: 'falls', kind: 'falls', left: fmt(topP.x - width / 2), top: fmt(botP.y - height), width: fmt(width), height: fmt(height), delay: 0, z: 5 })
      }
    }
  })
  if (opened.has('flower')) {
    // 花瓣：在花圃院上空飘过
    const [c0, r0, c1, r1] = areaById('flower').rect
    for (let i = 0; i < 5; i++) {
      const p = tileTop(c0 + noise(i * 3 + 100) * (c1 - c0), r0 + noise(i * 3 + 101) * (r1 - r0), L)
      out.push({ key: `petal-${i}`, kind: 'petal', left: fmt(p.x), top: fmt(p.y - L.tileW * 1.5), width: fmt(L.tileW * 0.16), height: fmt(L.tileW * 0.11), delay: fmt(i * 1.7), z: 1900 })
    }
  }
  n += out.length
  return out
}

module.exports = { fxViews, diamond }
