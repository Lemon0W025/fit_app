// 宠物的逐帧动画：每只两张 6×6 的拼图（见 docs/art/camp-art-pack.md）。A 张：走、坐着待机、睡姿 A、睡姿 B、吃、小动作；
// B 张：开心蹭你、被戳打滚、被摸眯眼、叼礼物走、庆祝蹦、专属动作。每行 6 帧循环。拼图里都朝右，往左走镜像。纯函数，有单测
// C 张（可选，anim-sheets.js 里 c: true 的才有）：背影走、正面走、背对着站、背对着吃、背对着坐、正面站着。往上走（远离镜头）用背影，
// 往下走用正面，在锅前面吃 / 坐面朝锅也是背影；没有 C 张照旧用 A / B 张的侧面

const COLS = 6
const ROWS = 6
const SHEET_ROWS = {
  a: ['walk', 'idle', 'sleepA', 'sleepB', 'eat', 'fidget'],
  b: ['happy', 'roll', 'pet', 'gift', 'jump', 'special'],
  c: ['walkBack', 'walkFront', 'idleBack', 'eatBack', 'sitBack', 'idleFront'],
}
const MS = {
  walk: 720, idle: 1800, sleepA: 3000, sleepB: 3000, eat: 900, fidget: 1500, happy: 900, roll: 1200, pet: 1500, gift: 720, jump: 600, special: 1500,
  walkBack: 720, walkFront: 720, idleBack: 1800, eatBack: 900, sitBack: 1800, idleFront: 1800,
}
// 有 C 张时按方向换的行（别的动作不分方向）
const DIR_ROWS = {
  back: { walk: 'walkBack', fly: 'walkBack', idle: 'idleBack', eat: 'eatBack', sit: 'sitBack' },
  front: { walk: 'walkFront', fly: 'walkFront', idle: 'idleFront' },
}
const STEEP = 1.2 // 竖着的位移比横着的大这么多倍才算正面 / 背影
// camp-life 的动作 → 拼图里的行名
const ALIAS = { fly: 'walk', sleep: 'sleepA', sit: 'idle', soak: 'idle', sun: 'idle', play: 'idle', climb: 'idle', perch: 'idle', dislike: 'idle', away: 'idle', look: 'idle' }

// dir：side / back / front；c：这只有没有 C 张
function frameFor(action, { sleepStyle = 'A', dir = 'side', c = false } = {}) {
  const turned = c && DIR_ROWS[dir] && DIR_ROWS[dir][action]
  if (turned) return { sheet: 'c', row: SHEET_ROWS.c.indexOf(turned), frames: COLS, ms: MS[turned] }
  let name = ALIAS[action] || action
  if (action === 'sleep' && sleepStyle === 'B') name = 'sleepB'
  if (SHEET_ROWS.a.indexOf(name) === -1 && SHEET_ROWS.b.indexOf(name) === -1) name = 'idle'
  const sheet = SHEET_ROWS.a.indexOf(name) !== -1 ? 'a' : SHEET_ROWS.b.indexOf(name) !== -1 ? 'b' : 'a'
  const rows = SHEET_ROWS[sheet]
  const row = Math.max(0, rows.indexOf(name))
  return { sheet, row, frames: COLS, ms: MS[rows[row]] || 1200 }
}

// 往右走朝右；不动保持原来的朝向
function facingFor(dx, current) {
  if (dx > 0) return true
  if (dx < 0) return false
  return current
}

// 走一小段 (dx, dy) 时朝哪：往上（远离镜头）back、往下 front、横着 side；没动保持原来的
function dirOf(dx, dy, current = 'side') {
  if (!dx && !dy) return current
  if (Math.abs(dy) > STEEP * Math.abs(dx)) return dy < 0 ? 'back' : 'front'
  return 'side'
}

module.exports = { COLS, ROWS, SHEET_ROWS, frameFor, facingFor, dirOf }
