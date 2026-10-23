// 小动物的逐帧动画：每只一张 6 列 × 4 行的拼图（见 docs/art/codex-art-pack.md §6），按动作选行、起始列和帧数。纯函数，有单测
// 第 1 行朝观众走、第 2 行背对观众走（各 6 帧）；第 3 行：发呆 2、睡觉 2、专属动作 2；第 4 行：被点到 2、招牌小动作 4

const COLS = 6
const ROWS = 4
// 走一个完整步幅多久（毫秒），按步态
const CYCLE_MS = { pad: 720, waddle: 560, hop: 600, crawl: 1400, stride: 900, fly: 480, flutter: 360 }

const WALK = ['walk', 'fly']
const SLEEPY = ['sleep', 'bask']

// action：garden-life 里的动作；face：front / back；gait：步态；fly：会飞的；special：这只的专属动作（第 17～18 格画的）；tapping：刚被点
function frameFor(action, { face = 'front', gait = 'pad', fly = false, special = '', tapping = false } = {}) {
  if (tapping) return { row: 3, col: 0, frames: 2, ms: 500 }
  if (WALK.indexOf(action) !== -1) return { row: face === 'back' ? 1 : 0, col: 0, frames: 6, ms: CYCLE_MS[gait] || 720 }
  if (action === 'trick') return { row: 3, col: 2, frames: 4, ms: 1400 }
  if (special && action === special) return { row: 2, col: 4, frames: 2, ms: 800 }
  if (SLEEPY.indexOf(action) !== -1) return { row: 2, col: 2, frames: 2, ms: 2400 }
  // 猫趴在家具上打盹（perch）也用睡觉帧；会飞的停在枝头（perch）是站着
  if (action === 'perch' && !fly) return { row: 2, col: 2, frames: 2, ms: 2400 }
  return { row: 2, col: 0, frames: 2, ms: 1200 }
}

// 走到 to 时朝哪边：往屏幕下方走是正面（front），往上是背面（back）；往右走 right 为真
function facingFor(from, to, current) {
  const dc = to.c - from.c
  const dr = to.r - from.r
  if (!dc && !dr) return current
  const down = dc + dr > 0
  const right = dc - dr > 0
  return { face: down ? 'front' : 'back', right: dc === dr ? current.right : right }
}

// 会飞的按像素位移算
function facingForPixels(dx, dy, current) {
  if (!dx && !dy) return current
  return { face: dy > 0 ? 'front' : dy < 0 ? 'back' : current.face, right: dx > 0 ? true : dx < 0 ? false : current.right }
}

module.exports = { COLS, ROWS, CYCLE_MS, frameFor, facingFor, facingForPixels }
