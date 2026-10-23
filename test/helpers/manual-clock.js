// 手动推进的假时钟：给需要定时器的代码在测试里用
function manualClock() {
  let now = 0
  let seq = 0
  const timers = new Map()
  return {
    set(fn, ms) {
      seq += 1
      timers.set(seq, { fn, at: now + ms })
      return seq
    },
    clear(handle) {
      timers.delete(handle)
    },
    now: () => now,
    advance(ms) {
      const end = now + ms
      for (;;) {
        let next = null
        for (const [handle, t] of timers) if (!next || t.at < next[1].at) next = [handle, t]
        if (!next || next[1].at > end) break
        timers.delete(next[0])
        now = next[1].at
        next[1].fn()
      }
      now = end
    },
    count: () => timers.size,
  }
}

module.exports = { manualClock }
