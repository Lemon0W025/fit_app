// 宠物的逐帧动画：每只两张 6×6 的拼图（见 docs/art/camp-art-pack.md）。A 张：走、坐着待机、睡姿 A、睡姿 B、吃、小动作；
// B 张：开心蹭你、被戳打滚、被摸眯眼、叼礼物走、庆祝蹦、专属动作。每行 6 帧循环。拼图里都朝右，往左走镜像。纯函数，有单测

const COLS = 6
const ROWS = 6
const SHEET_ROWS = {
  a: ['walk', 'idle', 'sleepA', 'sleepB', 'eat', 'fidget'],
  b: ['happy', 'roll', 'pet', 'gift', 'jump', 'special'],
}
const MS = { walk: 720, idle: 1800, sleepA: 3000, sleepB: 3000, eat: 900, fidget: 1500, happy: 900, roll: 1200, pet: 1500, gift: 720, jump: 600, special: 1500 }
// camp-life 的动作 → 拼图里的行名
const ALIAS = { fly: 'walk', sleep: 'sleepA', sit: 'idle', soak: 'idle', sun: 'idle', play: 'idle', climb: 'idle', perch: 'idle', dislike: 'idle', away: 'idle', look: 'idle' }

function frameFor(action, { sleepStyle = 'A' } = {}) {
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

module.exports = { COLS, ROWS, SHEET_ROWS, frameFor, facingFor }
