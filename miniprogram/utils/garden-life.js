// 庭院小动物的日常：每只一个定时器，轮到它时决定走一步、去玩、打盹还是发呆，再把画面交给页面
// 定时器（clock）和随机数都能注入，测试里手动推进时间

const { itemById } = require('./shared/garden')
const { tileCenter } = require('./iso')
const { SIZE_SCALE, itemImage } = require('./garden-view')
const A = require('./animals')

const PLAY_MS = [5000, 8000]
const SLEEP_MS = [8000, 15000]
const START_MS = [300, 2000]
const BUBBLE_MS = 3000
const TAP_MS = 600
const HELLO_MS = 4000
// 下水时露出的上半身比例（按动物本身算，不算图里头顶的空白）；气泡宽度占庭院宽度的比例
const WATER_LINE = 0.62
const BUBBLE_RATIO = 0.44

const realClock = {
  set: (fn, ms) => setTimeout(fn, ms),
  clear: (handle) => clearTimeout(handle),
  now: () => Date.now(),
}

const key = (t) => `${t.c},${t.r}`
const same = (a, b) => a.c === b.c && a.r === b.r
const inside = (t, size) => t.c >= 0 && t.r >= 0 && t.c < size && t.r < size

function createLife({ L, placed, residents, arrivals = [], open = () => true, random = Math.random, clock = realClock, onChange = () => {} }) {
  let items = placed
  let running = false
  const cooldown = {}
  const between = ([min, max]) => min + Math.round((max - min) * random())
  const animals = residents
    .filter((id) => A.ANIMAL_INFO[id])
    .map((id, index) => ({
      index, id, info: A.ANIMAL_INFO[id],
      c: -1, r: -1, flip: false, action: 'idle', play: null, path: [],
      bubble: '', tapping: false, duration: 0,
      timer: null, bubbleTimer: null, tapTimer: null,
    }))

  // 没开垦的格子：和摆了东西的格子一样走不进去
  const closed = new Set()
  for (let c = 0; c < L.size; c++) {
    for (let r = 0; r < L.size; r++) if (!open(c, r)) closed.add(key({ c, r }))
  }

  // 走不进去的格子：没开垦的、摆了东西的、有别的动物的
  function blockedFor(self) {
    const set = new Set(closed)
    items.forEach((p) => set.add(key(p)))
    animals.forEach((a) => {
      if (a !== self && inside(a, L.size)) set.add(key(a))
    })
    return set
  }

  function freeTiles(blocked) {
    const tiles = []
    for (let c = 0; c < L.size; c++) {
      for (let r = 0; r < L.size; r++) if (!blocked.has(key({ c, r }))) tiles.push({ c, r })
    }
    return tiles
  }

  function nearestFree(from, blocked) {
    const d = (t) => Math.abs(t.c - from.c) + Math.abs(t.r - from.r)
    return freeTiles(blocked).sort((a, b) => d(a) - d(b))[0] || null
  }

  function itemOf(uid) {
    return items.find((p) => p.uid === uid) || null
  }

  function playing(a) {
    return !!a.play && a.action === a.play.play.action
  }

  function sprite(a) {
    const width = L.tileW * a.info.scale
    const item = playing(a) && a.play.play.at === 'on' ? itemOf(a.play.uid) : null
    let x
    let bottom
    let z
    if (item) {
      const iw = L.tileW * SIZE_SCALE[itemById(item.itemId).size]
      const center = tileCenter(item.c, item.r, L)
      x = center.x - iw / 2 + a.play.play.spot.x * iw
      bottom = L.height - (center.y + L.tileH * 0.18) + a.play.play.spot.y * iw
      z = (item.c + item.r) * 10 + item.c + 1
    } else {
      const center = tileCenter(a.c, a.r, L)
      x = center.x
      bottom = L.height - (center.y + L.tileH * 0.18)
      z = (a.c + a.r) * 10 + a.c + 5
    }
    // 下水时水面在身子的 62% 处；气泡贴着头顶，别出庭院左右边
    const headroom = width * a.info.top
    const bodyHeight = a.action === 'swim' ? headroom + (width - headroom) * WATER_LINE : width
    const bubbleWidth = L.width * BUBBLE_RATIO
    const bubbleX = Math.min(Math.max(x - bubbleWidth / 2, 0), L.width - bubbleWidth)
    let emoji = ''
    if (playing(a)) emoji = a.play.play.emoji
    else if (a.action === 'sleep') emoji = '💤'
    return {
      id: a.id,
      image: itemImage(a.id),
      width,
      bodyHeight,
      left: x - width / 2,
      bottom,
      z,
      flip: a.flip,
      action: a.action,
      duration: a.duration,
      bubble: a.bubble,
      bubbleWidth,
      bubbleLeft: bubbleX - (x - width / 2),
      bubbleBottom: bodyHeight - headroom + 4,
      emoji,
      tapping: a.tapping,
    }
  }

  function emit(a) {
    onChange(a.index, sprite(a))
  }

  function schedule(a, ms) {
    clock.clear(a.timer)
    a.timer = running ? clock.set(() => turn(a), ms) : null
  }

  function rest(a) {
    a.action = 'idle'
    emit(a)
    schedule(a, between(a.info.pauseMs))
  }

  function moveTo(a, t) {
    a.flip = A.flipFor(a.info.faces, a, t, a.flip)
    a.c = t.c
    a.r = t.r
    a.duration = a.info.stepMs
  }

  function walk(a, t) {
    moveTo(a, t)
    a.action = 'walk'
    emit(a)
    schedule(a, a.info.stepMs)
  }

  function startPlay(a) {
    a.action = a.play.play.action
    if (a.play.play.at === 'beside') a.flip = A.flipFor(a.info.faces, a, a.play.item, a.flip)
    emit(a)
    schedule(a, a.info.stepMs + between(PLAY_MS))
  }

  function endPlay(a) {
    cooldown[a.play.uid] = clock.now() + A.PLAY_COOLDOWN_MS
    const wasOn = a.play.play.at === 'on'
    a.play = null
    // 从物件上下来，跳到旁边的空格
    const off = wasOn ? A.freeNeighbors(a, L.size, blockedFor(a))[0] : null
    if (off) return walk(a, off)
    rest(a)
  }

  function followPath(a) {
    const next = a.path[0]
    const isTarget = !!a.play && same(next, a.play.target)
    if (!isTarget && blockedFor(a).has(key(next))) {
      // 路被挡住了，这次不去了
      a.path = []
      a.play = null
      return rest(a)
    }
    a.path.shift()
    if (!a.path.length && a.play) {
      moveTo(a, next)
      return startPlay(a)
    }
    walk(a, next)
  }

  function turn(a) {
    a.timer = null
    if (playing(a)) return endPlay(a)
    if (a.path.length) return followPath(a)
    // 走完一步、睡醒了：先歇一会儿
    if (a.action !== 'idle') return rest(a)
    if (random() < a.info.sleepy) {
      a.action = 'sleep'
      emit(a)
      return schedule(a, between(SLEEP_MS))
    }
    const blocked = blockedFor(a)
    const busy = new Set(animals.filter((o) => o !== a && o.play).map((o) => o.play.uid))
    const play = A.choosePlay(a.id, a, { size: L.size, blocked, placed: items, busy, cooldown, now: clock.now() }, random)
    if (play) {
      a.play = play
      a.path = play.path.slice()
      return a.path.length ? followPath(a) : startPlay(a)
    }
    const step = A.chooseStep(a, { size: L.size, blocked, home: A.homeOf(a.id, items) }, random)
    if (!step) return schedule(a, between(a.info.pauseMs))
    walk(a, step)
  }

  function say(a, text, ms) {
    a.bubble = text
    clock.clear(a.bubbleTimer)
    a.bubbleTimer = clock.set(() => {
      a.bubble = ''
      emit(a)
    }, ms)
  }

  // 住户：随便站在家附近的空格
  function settleIn(a) {
    const free = freeTiles(blockedFor(a))
    if (!free.length) return
    const home = A.homeOf(a.id, items)
    const near = home ? free.filter((t) => Math.abs(t.c - home.c) + Math.abs(t.r - home.r) <= A.HOME_RANGE) : []
    const pool = near.length ? near : free
    const t = pool[Math.min(pool.length - 1, Math.floor(random() * pool.length))]
    a.c = t.c
    a.r = t.r
  }

  // 新住户：从开垦土地的边上走进来——起点是边上那格外面的荒地或地图外
  function walkIn(a) {
    const blocked = blockedFor(a)
    const doors = []
    freeTiles(blocked).forEach((t) => {
      const outside = [{ c: t.c + 1, r: t.r }, { c: t.c, r: t.r + 1 }, { c: t.c - 1, r: t.r }, { c: t.c, r: t.r - 1 }]
        .find((n) => !inside(n, L.size) || closed.has(key(n)))
      if (outside) doors.push({ from: outside, to: t })
    })
    if (!doors.length) return settleIn(a)
    const door = doors[Math.min(doors.length - 1, Math.floor(random() * doors.length))]
    a.c = door.from.c
    a.r = door.from.r
    a.path = [door.to]
    say(a, a.info.hello, HELLO_MS)
  }


  const arriving = new Set(arrivals)
  animals.forEach((a) => (arriving.has(a.id) ? walkIn(a) : settleIn(a)))

  return {
    sprites: () => animals.map(sprite),

    start() {
      running = true
      animals.forEach((a) => schedule(a, between(START_MS)))
    },

    pause() {
      running = false
      animals.forEach((a) => {
        clock.clear(a.timer)
        a.timer = null
      })
    },

    resume() {
      this.start()
    },

    stop() {
      running = false
      animals.forEach((a) => {
        ;[a.timer, a.bubbleTimer, a.tapTimer].forEach((handle) => clock.clear(handle))
        a.timer = a.bubbleTimer = a.tapTimer = null
      })
    },

    // 物件摆放、移动、收回之后：玩的东西没了就不玩了，脚下被放了东西就跳开
    updatePlaced(next) {
      items = next
      animals.forEach((a) => {
        if (a.play) {
          const item = itemOf(a.play.uid)
          if (!item || !same(item, a.play.item)) {
            a.play = null
            a.path = []
            a.action = 'idle'
          }
        }
        const onItem = a.play && a.play.play.at === 'on' && playing(a)
        if (!onItem && inside(a, L.size) && items.some((p) => same(p, a))) {
          const t = nearestFree(a, blockedFor(a))
          if (t) {
            a.path = []
            moveTo(a, t)
            a.action = 'walk'
          }
        }
        emit(a)
      })
    },

    tap(index) {
      const a = animals[index]
      if (!a) return
      say(a, A.lineFor(a.id, a, random), BUBBLE_MS)
      a.tapping = true
      clock.clear(a.tapTimer)
      a.tapTimer = clock.set(() => {
        a.tapping = false
        emit(a)
      }, TAP_MS)
      emit(a)
    },
  }
}

module.exports = { createLife }
