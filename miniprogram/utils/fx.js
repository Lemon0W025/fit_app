// 打卡页面的小动效：数字滚动、轻震。定时器走 this.clock（测试里注入手动时钟快进），没有就用真的

const REAL_CLOCK = { set: (fn, ms) => setTimeout(fn, ms), clear: (h) => clearTimeout(h) }
const FRAME_MS = 40

function clockOf(owner) {
  return (owner && owner.clock) || REAL_CLOCK
}

// 数字从 from 滚到 to（缓出）：先给一次 from，每 40ms 一步，最后一步一定是 to
function countUp(from, to, ms, onStep, clock = REAL_CLOCK) {
  const steps = Math.max(1, Math.round(ms / FRAME_MS))
  let i = 0
  let handle = null
  let over = false
  const stop = () => {
    over = true
    if (handle) clock.clear(handle)
    handle = null
  }
  const finish = () => {
    if (over) return
    stop()
    onStep(to)
  }
  const tick = () => {
    handle = null
    i += 1
    if (i >= steps) return finish()
    const t = i / steps
    onStep(Math.round(from + (to - from) * (1 - Math.pow(1 - t, 3))))
    handle = clock.set(tick, FRAME_MS)
  }
  if (from === to || ms <= 0) finish()
  else {
    onStep(from)
    handle = clock.set(tick, FRAME_MS)
  }
  return { finish, cancel: stop, done: () => over }
}

// 轻轻震一下：盖章 light、里程碑 medium；没有这个接口（老版本、开发者工具）就算了
function buzz(type = 'light') {
  if (typeof wx === 'undefined' || !wx || typeof wx.vibrateShort !== 'function') return
  wx.vibrateShort({ type, fail() {} })
}

module.exports = { REAL_CLOCK, clockOf, countUp, buzz }
