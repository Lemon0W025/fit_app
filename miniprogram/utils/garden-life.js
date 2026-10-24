// 花园小动物的日常：每只一个定时器，轮到它时决定走一步、去玩、做件小事、打盹、晚上回窝，再把画面交给页面
// 定时器（clock）、随机数、钟点（hour）都能注入，测试里手动推进

const { itemById } = require('./shared/garden')
const { footprint } = require('./shared/estate')
const { tileCenter } = require('./iso')
const { itemImage, itemAnchor, shadowOf } = require('./garden-view')
const A = require('./animals')
const { COLS, ROWS, frameFor, facingFor, facingForPixels } = require('./anim')

const PLAY_MS = [5000, 8000]
const TRICK_MS = [6000, 10000]
const SLEEP_MS = [8000, 15000]
const NIGHT_MS = [40000, 80000]
const START_MS = [300, 2000]
const BUBBLE_MS = 3000
const TAP_MS = 600
const HELLO_MS = 4000
// 下水时露出的上半身比例（按动物本身算，不算图里头顶的空白）；气泡宽度是几格宽
const WATER_LINE = 0.62
// 脚底比格子中心往下多少（格高），和物件一样踩在菱形前半
const ANIMAL_SINK = 0.35
const BUBBLE_TILES = 5
// 白天没事干时出门逛逛的概率
const EXCURSION_CHANCE = 0.12

const realClock = {
  set: (fn, ms) => setTimeout(fn, ms),
  clear: (handle) => clearTimeout(handle),
  now: () => Date.now(),
}
const realHour = () => new Date().getHours()

const key = (t) => `${t.c},${t.r}`
const same = (a, b) => a.c === b.c && a.r === b.r
const dist = (a, b) => Math.abs(a.c - b.c) + Math.abs(a.r - b.r)

// walk(c, r, swims)：这一格能不能走（水鸟传 swims）；areaOf(c, r)：在哪个院子；spots：已修院子里的活动点；door：新住户进来的那格（网格外也行）
// sheets：有逐帧动画拼图的动物（utils/anim-sheets）；animBase：拼图在云存储的前缀，空就都用单张图；bad：加载失败的拼图（页面传进来，共用）
function createLife({
  L, placed, residents, arrivals = [], walk = () => true, areaOf = () => '', spots = [], door = null,
  hour = realHour, random = Math.random, clock = realClock, onChange = () => {},
  sheets = {}, animBase = '', bad = new Set(),
}) {
  const bounds = { cols: L.cols || L.size, rows: L.rows || L.size }
  let items = placed
  let running = false
  const cooldown = {}
  const between = ([min, max]) => min + Math.round((max - min) * random())
  const inside = (t) => t.c >= 0 && t.r >= 0 && t.c < bounds.cols && t.r < bounds.rows
  const swims = (a) => A.SWIMMERS.indexOf(a.id) !== -1
  const animals = residents
    .filter((id) => A.ANIMAL_INFO[id])
    .map((id, index) => ({
      index, id, info: A.ANIMAL_INFO[id],
      c: -1, r: -1, flip: false, face: 'front', right: true, action: 'idle', goal: null, path: [], afloat: false,
      px: 0, py: 0, perchKey: '', hidden: false, arriving: false,
      bubble: '', tapping: false, duration: 0,
      timer: null, bubbleTimer: null, tapTimer: null,
    }))

  // 走不进去的地，按能不能下水分两套
  const closed = { land: new Set(), water: new Set() }
  for (let c = 0; c < bounds.cols; c++) {
    for (let r = 0; r < bounds.rows; r++) {
      if (!walk(c, r, false)) closed.land.add(key({ c, r }))
      if (!walk(c, r, true)) closed.water.add(key({ c, r }))
    }
  }
  const isWater = (t) => closed.land.has(key(t)) && !closed.water.has(key(t))

  // 走不进去的格子：地不能走的、摆了东西的（2×2 的四格都算）、有别的动物的
  function blockedFor(self) {
    const set = new Set(swims(self) ? closed.water : closed.land)
    items.forEach((p) => footprint(p.itemId, p.c, p.r).forEach((t) => set.add(key(t))))
    animals.forEach((a) => {
      if (a !== self && !a.info.fly && inside(a)) set.add(key(a))
    })
    return set
  }

  function freeTiles(blocked) {
    const tiles = []
    for (let c = 0; c < bounds.cols; c++) {
      for (let r = 0; r < bounds.rows; r++) if (!blocked.has(key({ c, r }))) tiles.push({ c, r })
    }
    return tiles
  }

  function nearestFree(from, blocked) {
    return freeTiles(blocked).sort((a, b) => dist(a, from) - dist(b, from))[0] || null
  }

  function itemOf(uid) {
    return items.find((p) => p.uid === uid) || null
  }

  const playing = (a) => !!a.goal && a.goal.type === 'play' && a.action === a.goal.play.play.action
  const tricking = (a) => !!a.goal && a.goal.type === 'trick' && (a.action === 'trick' || a.action === 'soak')
  const inWater = (a) => a.action === 'swim' || a.action === 'soak' || a.afloat
  const stateOf = (a) => ({
    action: a.action,
    play: a.goal && a.goal.type === 'play' ? a.goal.play : null,
    trick: a.goal && a.goal.type === 'trick' ? a.goal.trick : null,
    flyer: a.info.fly ? a.id : '',
  })

  // 这只用逐帧拼图还是单张图：拼图 = { sheet 图片地址, anim 选哪几格, top 头顶空白 }
  function sheetOf(a) {
    const s = sheets[a.id]
    if (!s || !animBase || bad.has(a.id)) return null
    return {
      sheet: `${animBase}${a.id}.png`,
      anim: { ...frameFor(a.action, { face: a.face, gait: a.info.gait, fly: !!a.info.fly, special: s.special, tapping: a.tapping }), cols: COLS, rows: ROWS },
      top: s.top,
    }
  }

  function sprite(a) {
    const width = L.tileW * a.info.scale
    const sh = sheetOf(a)
    // 拼图里的动物都朝右，往左走就镜像；单张图按它本来朝哪边算
    const flip = sh ? !a.right : a.flip
    if (a.info.fly) {
      const bubbleWidth = Math.min(L.tileW * BUBBLE_TILES, L.width)
      const bubbleX = Math.min(Math.max(a.px - bubbleWidth / 2, 0), L.width - bubbleWidth)
      return {
        id: a.id, image: itemImage(a.id), width, bodyHeight: width,
        left: a.px - width / 2, bottom: L.height - a.py,
        z: Math.round(((a.py - L.top) / L.tileH) * 20) + 60,
        flip, gait: a.info.gait, action: a.action, duration: a.duration, hidden: a.hidden,
        sheet: sh ? sh.sheet : '', anim: sh ? sh.anim : null,
        bubble: a.bubble, bubbleWidth, bubbleLeft: bubbleX - (a.px - width / 2), bubbleBottom: width + 4,
        emoji: '', tapping: a.tapping, shadow: null,
      }
    }
    const item = playing(a) && a.goal.play.play.at === 'on' ? itemOf(a.goal.play.uid) : null
    let x
    let y
    let z
    if (item) {
      const anchor = itemAnchor(item, L)
      x = anchor.x - anchor.width / 2 + a.goal.play.play.spot.x * anchor.width
      y = anchor.y - a.goal.play.play.spot.y * anchor.width
      z = (item.c + item.r) * 10 + item.c + 1
    } else {
      const center = tileCenter(a.c, a.r, L)
      x = center.x
      y = center.y + L.tileH * ANIMAL_SINK
      z = (a.c + a.r) * 10 + a.c + 5
    }
    // 下水时水面在身子的 62% 处，没有影子；气泡贴着头顶，别出花园左右边
    const headroom = width * (sh ? sh.top : a.info.top)
    const bodyHeight = inWater(a) ? headroom + (width - headroom) * WATER_LINE : width
    const bubbleWidth = Math.min(L.tileW * BUBBLE_TILES, L.width)
    const bubbleX = Math.min(Math.max(x - bubbleWidth / 2, 0), L.width - bubbleWidth)
    let emoji = ''
    if (playing(a)) emoji = a.goal.play.play.emoji
    else if (tricking(a)) emoji = a.goal.trick.emoji
    else if (a.action === 'sleep') emoji = '💤'
    return {
      id: a.id,
      image: itemImage(a.id),
      width,
      bodyHeight,
      left: x - width / 2,
      bottom: L.height - y,
      z,
      flip,
      hidden: false,
      gait: a.info.gait,
      action: a.action,
      duration: a.duration,
      sheet: sh ? sh.sheet : '',
      anim: sh ? sh.anim : null,
      bubble: a.bubble,
      bubbleWidth,
      bubbleLeft: bubbleX - (x - width / 2),
      bubbleBottom: bodyHeight - headroom + 4,
      emoji,
      tapping: a.tapping,
      shadow: inWater(a) ? null : shadowOf(x, y, width, L),
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

  function doze(a, range) {
    a.action = 'sleep'
    emit(a)
    schedule(a, between(range))
  }

  function moveTo(a, t) {
    a.flip = A.flipFor(a.info.faces, a, t, a.flip)
    Object.assign(a, facingFor(a, t, a))
    a.c = t.c
    a.r = t.r
    a.afloat = isWater(t)
    a.duration = a.info.stepMs
  }

  function step(a, t) {
    moveTo(a, t)
    a.action = 'walk'
    emit(a)
    schedule(a, a.info.stepMs)
  }

  function say(a, text, ms) {
    a.bubble = text
    clock.clear(a.bubbleTimer)
    a.bubbleTimer = clock.set(() => {
      a.bubble = ''
      emit(a)
    }, ms)
  }

  // ---------------------------------------------------------------- 会飞的

  // 能停的地方：摆着的树 / 花 / 喂鸟台 / 花架，和壳里的活动点；都没有就在网格正中上空盘旋
  function perchesFor(a) {
    const f = A.FLYERS[a.id]
    const out = []
    items.forEach((p) => {
      if (f.perches.indexOf(p.itemId) === -1) return
      const anchor = itemAnchor(p, L)
      out.push({ key: `item:${p.uid}`, c: p.c, r: p.r, x: anchor.x, y: anchor.y - anchor.width * f.perchY })
    })
    spots.forEach((s) => {
      if (f.spotPerches.indexOf(s.id) === -1) return
      const center = tileCenter(s.c, s.r, L)
      out.push({ key: `spot:${s.id}`, c: s.c, r: s.r, x: center.x, y: center.y - L.tileW * 1.2 })
    })
    if (!out.length) {
      const c = Math.floor(bounds.cols / 2)
      const r = Math.floor(bounds.rows / 2)
      const center = tileCenter(c, r, L)
      out.push({ key: 'sky', c, r, x: center.x, y: center.y - L.tileW * 1.5 })
    }
    return out
  }

  function land(a, dest) {
    a.px = dest.x
    a.py = dest.y
    a.c = dest.c
    a.r = dest.r
    a.perchKey = dest.key
  }

  function flyTo(a, dest) {
    const f = A.FLYERS[a.id]
    const d = Math.hypot(dest.x - a.px, dest.y - a.py)
    a.flip = A.flipFor(a.info.faces, { c: a.px, r: 0 }, { c: dest.x, r: 0 }, a.flip)
    Object.assign(a, facingForPixels(dest.x - a.px, dest.y - a.py, a))
    a.duration = Math.max(400, Math.round((d / f.speed) * 1000))
    land(a, dest)
    a.action = 'fly'
    a.hidden = false
    emit(a)
    schedule(a, a.duration)
  }

  function flyerTurn(a) {
    const f = A.FLYERS[a.id]
    if (a.arriving) {
      a.arriving = false
      return flyTo(a, perchesFor(a)[0])
    }
    const h = hour()
    const away = f.hours ? h < f.hours[0] || h >= f.hours[1] : A.periodOf(h) === 'night'
    if (away) {
      a.hidden = true
      a.action = f.hours ? 'away' : 'sleep'
      emit(a)
      return schedule(a, between(NIGHT_MS))
    }
    if (a.action === 'fly') {
      a.action = 'perch'
      emit(a)
      return schedule(a, between(f.restMs))
    }
    // 歇够了、刚醒：换个地方停
    const all = perchesFor(a)
    const others = all.filter((p) => p.key !== a.perchKey)
    const dest = others.length ? others[Math.min(others.length - 1, Math.floor(random() * others.length))] : all[0]
    if (!dest || dest.key === a.perchKey) {
      a.action = 'perch'
      a.hidden = false
      emit(a)
      return schedule(a, between(f.restMs))
    }
    flyTo(a, dest)
  }

  // 走到了目的地：开始玩 / 做小事 / 睡觉
  function startGoal(a) {
    const g = a.goal
    if (g.type === 'play') {
      a.action = g.play.play.action
      if (g.play.play.at === 'beside') a.flip = A.flipFor(a.info.faces, a, g.play.item, a.flip)
      emit(a)
      return schedule(a, a.info.stepMs + between(PLAY_MS))
    }
    if (g.type === 'trick') {
      a.action = g.trick.action || 'trick'
      say(a, g.trick.line, between(TRICK_MS))
      emit(a)
      return schedule(a, a.info.stepMs + between(TRICK_MS))
    }
    a.goal = null
    if (g.type === 'sleep') return doze(a, NIGHT_MS)
    rest(a)
  }

  function endGoal(a) {
    const g = a.goal
    a.goal = null
    let off = null
    if (g.type === 'play') {
      cooldown[g.play.uid] = clock.now() + A.PLAY_COOLDOWN_MS
      // 从物件上下来，跳到旁边的空格
      if (g.play.play.at === 'on') off = A.freeNeighbors(a, bounds, blockedFor(a))[0]
    } else if (g.type === 'trick') {
      cooldown[`${a.id}:${g.trick.id}`] = clock.now() + A.TRICK_COOLDOWN_MS
      if (g.trick.action === 'soak' && !swims(a)) off = A.freeNeighbors(a, bounds, blockedFor(a))[0]
    }
    if (off) return step(a, off)
    rest(a)
  }

  // 别的动物站着的格子
  function animalTiles(self) {
    const set = new Set()
    animals.forEach((a) => {
      if (a !== self && inside(a)) set.add(key(a))
    })
    return set
  }

  function followPath(a) {
    const next = a.path[0]
    const g = a.goal
    // 最后一步踩到物件上（on）或下水（soak）是允许的，只要没有别的动物在那儿；其他情况照常不能挤
    const onto = !!g && same(next, g.target) && ((g.type === 'play' && g.play.play.at === 'on') || (g.type === 'trick' && g.trick.action === 'soak'))
    if ((onto ? animalTiles(a) : blockedFor(a)).has(key(next))) {
      // 路被挡住了，这次不去了
      a.path = []
      a.goal = null
      return rest(a)
    }
    a.path.shift()
    if (!a.path.length && a.goal) {
      moveTo(a, next)
      return startGoal(a)
    }
    step(a, next)
  }

  function go(a, type, plan, extra) {
    a.goal = { type, target: plan.target, ...extra }
    a.path = plan.path.slice()
    return a.path.length ? followPath(a) : startGoal(a)
  }

  function turn(a) {
    a.timer = null
    if (a.info.fly) return flyerTurn(a)
    if (playing(a) || tricking(a)) return endGoal(a)
    if (a.path.length) return followPath(a)
    const period = A.periodOf(hour())
    // 晚上睡着了就接着睡；白天睡醒了、走完一步了，先歇一会儿
    if (a.action === 'sleep') return period === 'night' ? doze(a, NIGHT_MS) : rest(a)
    if (a.action !== 'idle') return rest(a)
    const blocked = blockedFor(a)
    if (period === 'night') {
      const plan = A.sleepTarget(a.id, a, { spots, blocked, size: bounds, areaOf, free: freeTiles(blocked) })
      if (plan && plan.path.length) return go(a, 'sleep', plan)
      return doze(a, NIGHT_MS)
    }
    if (period === 'morning') {
      const plan = A.gatherTarget(a, { blocked, size: bounds, areaOf, free: freeTiles(blocked) })
      if (plan) return go(a, 'wander', plan)
    }
    const sleepy = period === 'noon' ? Math.min(0.9, a.info.sleepy * 3 + 0.15) : period === 'morning' ? 0 : a.info.sleepy
    if (random() < sleepy) return doze(a, SLEEP_MS)
    const busy = new Set(animals.filter((o) => o !== a && o.goal && o.goal.type === 'play').map((o) => o.goal.play.uid))
    const play = A.choosePlay(a.id, a, {
      size: bounds, blocked, placed: items, busy, cooldown, now: clock.now(), chance: period === 'noon' ? A.PLAY_CHANCE * 2 : A.PLAY_CHANCE,
    }, random)
    if (play) return go(a, 'play', play, { play })
    if (period !== 'morning') {
      const busySpots = new Set(animals.filter((o) => o !== a && o.goal && o.goal.type === 'trick' && o.goal.trick.spot).map((o) => o.goal.trick.spot))
      const trick = A.chooseTrick(a.id, a, { spots, blocked, size: bounds, busy: busySpots, cooldown, now: clock.now() }, random)
      if (trick) return go(a, 'trick', trick, { trick: trick.trick })
      if (random() < EXCURSION_CHANCE) {
        const plan = A.wanderTarget(a, { blocked, size: bounds, free: freeTiles(blocked) }, random)
        if (plan) return go(a, 'wander', plan)
      }
    }
    const allow = period === 'morning' ? (t) => A.MORNING_AREAS.indexOf(areaOf(t.c, t.r)) !== -1 : null
    const home = A.homeOf(a.id, items)
    const stroll = A.strollTarget(a, { size: bounds, blocked, free: freeTiles(blocked), home, allow }, random)
    if (stroll) return go(a, 'wander', stroll)
    const next = A.chooseStep(a, { size: bounds, blocked, home, allow }, random)
    if (!next) return schedule(a, between(a.info.pauseMs))
    step(a, next)
  }

  // 住户：站在家附近的空格；没有家就在前院、正院随便站
  function settleIn(a) {
    if (a.info.fly) {
      const all = perchesFor(a)
      land(a, all[Math.min(all.length - 1, Math.floor(random() * all.length))])
      a.action = 'perch'
      return
    }
    const free = freeTiles(blockedFor(a))
    if (!free.length) return
    const home = A.homeOf(a.id, items)
    const near = home ? free.filter((t) => dist(t, home) <= A.HOME_RANGE) : free.filter((t) => A.MORNING_AREAS.indexOf(areaOf(t.c, t.r)) !== -1)
    const pool = near.length ? near : free
    const t = pool[Math.min(pool.length - 1, Math.floor(random() * pool.length))]
    a.c = t.c
    a.r = t.r
    a.afloat = isWater(t)
  }

  // 新住户：从大门走进来，一路走到家旁边（没有家就走到最近的空格）
  function walkIn(a) {
    if (!door) return settleIn(a)
    if (a.info.fly) {
      // 先停在大门口，第一次轮到它时再飞到树上（这样第一帧在门口，飞进来的过程看得见）
      const from = tileCenter(door.c, door.r, L)
      a.px = from.x
      a.py = from.y
      a.c = door.c
      a.r = door.r
      a.action = 'fly'
      a.arriving = true
      say(a, a.info.hello, HELLO_MS)
      return
    }
    const blocked = blockedFor(a)
    const home = A.homeOf(a.id, items)
    const free = freeTiles(blocked)
    const targets = (home ? free.filter((t) => dist(t, home) <= A.HOME_RANGE) : free).sort((a1, b1) => dist(a1, door) - dist(b1, door)).slice(0, 6)
    for (const t of targets) {
      const path = A.pathTo(door, t, bounds, blocked)
      if (path) {
        a.c = door.c
        a.r = door.r
        a.goal = { type: 'wander', target: t }
        a.path = path
        say(a, a.info.hello, HELLO_MS)
        return
      }
    }
    settleIn(a)
  }

  const arriving = new Set(arrivals)
  animals.forEach((a) => (arriving.has(a.id) ? walkIn(a) : settleIn(a)))

  function heart(a) {
    a.tapping = true
    clock.clear(a.tapTimer)
    a.tapTimer = clock.set(() => {
      a.tapping = false
      emit(a)
    }, TAP_MS)
    emit(a)
  }

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
        if (a.info.fly) {
          // 停的那件东西没了：换个地方
          if (a.perchKey.indexOf('item:') === 0 && !itemOf(a.perchKey.slice(5))) flyTo(a, perchesFor(a)[0])
          else emit(a)
          return
        }
        if (a.goal && a.goal.type === 'play') {
          const item = itemOf(a.goal.play.uid)
          if (!item || !same(item, a.goal.play.item)) {
            a.goal = null
            a.path = []
            a.action = 'idle'
          }
        }
        const onItem = a.goal && a.goal.type === 'play' && a.goal.play.play.at === 'on' && playing(a)
        if (!onItem && inside(a) && items.some((p) => footprint(p.itemId, p.c, p.r).some((t) => same(t, a)))) {
          const t = nearestFree(a, blockedFor(a))
          if (t) {
            a.path = []
            a.goal = null
            moveTo(a, t)
            a.action = 'walk'
          }
        }
        emit(a)
      })
    },

    // 每只现在在哪、在干嘛（给「找它」列表）
    whereIs() {
      return animals.map((a) => ({
        index: a.index,
        id: a.id,
        name: itemById(a.id).name,
        image: itemImage(a.id),
        c: a.c,
        r: a.r,
        area: areaOf(a.c, a.r),
        toArea: a.goal ? areaOf(a.goal.target.c, a.goal.target.r) : '',
        state: stateOf(a),
      }))
    },

    // 找它：冒一下爱心，返回它在哪一格
    focus(index) {
      const a = animals[index]
      if (!a) return null
      heart(a)
      return { c: a.c, r: a.r }
    },

    tap(index) {
      const a = animals[index]
      if (!a) return
      say(a, A.lineFor(a.id, stateOf(a), random), BUBBLE_MS)
      heart(a)
    },

    // 这只的拼图加载失败：退回单张图
    noSheet(id) {
      bad.add(id)
      animals.forEach((a) => {
        if (a.id === id) emit(a)
      })
    },
  }
}

module.exports = { createLife }
