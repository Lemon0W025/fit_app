// 彩带：纯计算（生成、往前走、画），小程序的 canvas 和预览录屏的浏览器共用。颜色用 app.wxss 的暖色
// milestone：从屏幕上方一整排往下撒（约 2 秒落完）；burst：从顶上中间往两边喷一小把（约 1 秒）

const COLORS = ['#4e7d5b', '#f0b429', '#e98a6b', '#9cc5a1', '#f6c86b', '#d97a1e']
const SHAPES = ['strip', 'strip', 'strip', 'bean', 'ring']
const COUNT = { burst: 40, milestone: 80 }
const RUN_MS = { burst: 1400, milestone: 2600 }
const GRAVITY = 520 // 像素 / 秒²
const DRAG = 0.985

function rng(seed) {
  let s = Math.floor(seed) >>> 0 || 1
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0
    return s / 4294967296
  }
}

function makeParticles({ mode = 'milestone', width, height, seed = 1 }) {
  const r = rng(seed)
  const burst = mode === 'burst'
  const list = []
  for (let i = 0; i < (COUNT[mode] || COUNT.milestone); i++) {
    list.push({
      x: burst ? width / 2 + (r() - 0.5) * 40 : r() * width,
      y: burst ? -10 : -10 - r() * height * 0.4,
      vx: burst ? (r() - 0.5) * 520 : (r() - 0.5) * 80,
      vy: burst ? 80 + r() * 260 : 160 + r() * 200,
      rot: r() * Math.PI * 2,
      vr: (r() - 0.5) * 10,
      size: 6 + r() * 6,
      sway: r() * Math.PI * 2,
      shape: SHAPES[Math.floor(r() * SHAPES.length)],
      color: COLORS[Math.floor(r() * COLORS.length)],
    })
  }
  return list
}

// 往前走 dt 秒；返回还在屏幕里（没落出底边）的片数
function step(list, dt, height) {
  let alive = 0
  list.forEach((p) => {
    p.vy += GRAVITY * dt
    p.vx *= DRAG
    p.sway += dt * 3
    p.x += (p.vx + Math.sin(p.sway) * 30) * dt
    p.y += p.vy * dt
    p.rot += p.vr * dt
    if (p.y < height + 20) alive += 1
  })
  return alive
}

// 长条、暖豆（扁圆）、小印章（圆环）
function draw(ctx, list) {
  list.forEach((p) => {
    ctx.save()
    ctx.translate(p.x, p.y)
    ctx.rotate(p.rot)
    ctx.fillStyle = p.color
    ctx.strokeStyle = p.color
    if (p.shape === 'strip') {
      ctx.fillRect(-p.size / 2, -p.size / 5, p.size, p.size / 2.5)
    } else if (p.shape === 'bean') {
      ctx.beginPath()
      ctx.ellipse(0, 0, p.size / 2, p.size / 3, 0, 0, Math.PI * 2)
      ctx.fill()
    } else {
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.arc(0, 0, p.size / 2.2, 0, Math.PI * 2)
      ctx.stroke()
    }
    ctx.restore()
  })
}

module.exports = { COLORS, RUN_MS, makeParticles, step, draw }
