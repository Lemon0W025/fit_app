// 营地的气泡（camp-life.js 用）：谁什么时候能冒气泡、一段话一句一句换、什么时候收。屏幕上同一时间最多一个气泡：
//   take(a, 一句 | [几句], ms)  你点的、喂的、叫的：别的气泡收起来，它说（一句留 ms 毫秒；一段按字数一句一句换）；返回一共说多久
//   next(a)        正说着一段：跳到下一句；没有下一句了返回 false
//   auto(a, 一句, ms)   不是你点出来的话（自己开口、客人闻香、喊饿、两只之间）：没别的气泡、上一个收起两分钟后才说；说不了返回 false
//   event(a, 一句, ms)  跟着事情来的一句（新住户打招呼、走开找吃的、回来、先吃的那只）：没别的气泡就说
//   drop(a)        这只走开藏起来了：气泡收起
//   stop()         停下：定时器全清掉（气泡上的字留着，页面停着也看不见）
// 开口时不发 onChange（调用的一般接着就换动作，一起发）；一句换下一句、收起时自己发。
// 每只身上这几样归这里管，别处只读：bubble（正显示的那句，'' = 没有）、bubbleDx（气泡位置，换句时清掉让页面重新夹在屏幕里）、
// speech（这段还没说的几句）、recent（最近说过的几句，挑新话时避开）、bubbleTimer

const BUBBLE_MS = 3000
const AUTO_GAP_MS = 120000 // 不是你点出来的话：上一个气泡收起两分钟后才能再有
const RECENT_LINES = 12 // 每只记住最近说过的几句，不重复
// 一段话里每句留多久：按字数，2.4～4.2 秒
const lineMs = (text) => Math.min(4200, Math.max(2400, 1400 + 140 * text.length))

// animals：营地里所有的（会往里加，客人来了）；emit(a)：这只的样子变了
function createBubbles({ animals, clock, emit }) {
  let quietUntil = 0 // 这之前不自己开口
  const now = () => (clock.now ? clock.now() : Date.now())

  function show(a, text, ms) {
    a.bubble = text
    a.bubbleDx = null
    a.recent = (a.recent || []).concat(text).slice(-RECENT_LINES)
    clock.clear(a.bubbleTimer)
    a.bubbleTimer = clock.set(() => {
      a.bubbleTimer = null
      if (a.speech && a.speech.length) return next(a)
      a.bubble = ''
      a.speech = null
      quietUntil = now() + AUTO_GAP_MS
      emit(a)
    }, ms)
  }

  function say(a, text, ms = BUBBLE_MS) {
    a.speech = null
    show(a, text, ms)
  }

  // 有别的气泡在屏幕上
  const talking = (except) => animals.some((b) => b !== except && b.bubble && !b.hidden)

  function hush(except) {
    animals.forEach((b) => {
      if (b === except || !b.bubble) return
      clock.clear(b.bubbleTimer)
      b.bubbleTimer = null
      b.bubble = ''
      b.speech = null
      emit(b)
    })
  }

  function take(a, what, ms) {
    hush(a)
    if (!Array.isArray(what)) {
      say(a, what, ms)
      return ms || BUBBLE_MS
    }
    const list = what.filter(Boolean)
    if (!list.length) return 0
    a.speech = list.slice(1)
    show(a, list[0], lineMs(list[0]))
    return list.reduce((sum, l) => sum + lineMs(l), 0)
  }

  function next(a) {
    if (!a.bubble || !a.speech || !a.speech.length) return false
    const text = a.speech.shift()
    show(a, text, lineMs(text))
    emit(a)
    return true
  }

  function auto(a, text, ms) {
    if (!text || talking(a) || a.bubble || now() < quietUntil) return false
    say(a, text, ms)
    return true
  }

  function event(a, text, ms) {
    if (!text || talking(a)) return false
    say(a, text, ms)
    return true
  }

  function drop(a) {
    if (!a.bubble) return
    clock.clear(a.bubbleTimer)
    a.bubbleTimer = null
    a.bubble = ''
    a.speech = null
    quietUntil = now() + AUTO_GAP_MS
  }

  function stop() {
    animals.forEach((a) => {
      clock.clear(a.bubbleTimer)
      a.bubbleTimer = null
      a.speech = null
    })
  }

  return { take, next, auto, event, drop, stop }
}

module.exports = { createBubbles, lineMs, AUTO_GAP_MS }
