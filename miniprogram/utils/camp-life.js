// 宠物的日常：每只一个定时器，轮到它时按时段决定去哪、干什么，走到了做一会儿再换。坐标全是画的像素，页面按缩放画
// 定时器（clock）、随机数、钟点（hour）都能注入，测试里手动推进

const { SCENE, scaleAt, inGrass, segmentHitsPoly, pointInPoly } = require('./shared/camp')
const { petById } = require('./shared/pets')
const { decorById, patchRect } = require('./shared/decor')
const { periodOf, lineFor, describe, CSS_ACTIONS } = require('./pets')
const { COLS, ROWS, frameFor, facingFor } = require('./anim')
const { petImage, petFace, zOf } = require('./camp-view')

const REST_MS = [3000, 7000]
const DO_MS = [6000, 12000]
const NAP_MS = [15000, 30000]
const NIGHT_MS = [40000, 80000]
const START_MS = [300, 1500]
const BUBBLE_MS = 3000
const TAP_MS = 600
const ROLL_MS = 1200
const PET_MS = 1500
const EAT_MS = 2000
const JUMP_MS = 3000
const HELLO_MS = 4000
const PAIR_MS = 5000
const DETOUR = 360
const CORNER = 140 // 绕障碍物四角时离外框多远
const BODY_GAP = 1.1 // 目标点离别的宠物至少几个身位
const SUN_LOVERS = ['jutuan', 'guigui']
const PAIR_CHANCE = 0.08
const PLAY_CHANCE = 0.35
const SHADOW_RATIO = 0.6
const BUBBLE_W = 1100 // 气泡宽（画的像素）

// 它们之间的小事：a 走到 b 旁边
const PAIRS = [
  { a: 'qiqi', b: 'shushu', aLine: '嘿嘿，往碗里塞了一颗', bLine: '咦？我碗里怎么多了颗枸杞', aEmoji: '😏', bEmoji: '❓' },
  { a: 'doudou', b: 'shishi', aLine: '柿柿，带我一程！', bLine: '坐稳了，别掉下去', aEmoji: '🎵', bEmoji: '💪' },
  { a: 'huahua', b: 'nuonuo', aLine: '蝴蝶…又飞走了', bLine: '（吓了一跳）', aEmoji: '🦋', bEmoji: '❗' },
  { a: 'lianlian', b: 'guigui', aLine: '嘎，一起晒会儿', bLine: '慢…慢…来', aEmoji: '☀️', bEmoji: '☀️' },
  { a: 'sunbao', b: 'nuonuo', aLine: '挤一挤，暖和', bLine: '好、好暖和', aEmoji: '💤', bEmoji: '💤' },
]

const realClock = { set: (fn, ms) => setTimeout(fn, ms), clear: (h) => clearTimeout(h), now: () => Date.now() }
const realHour = () => new Date().getHours()

const dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by)

function createLife({
  L, pets, decor, arrivals = [], hour = realHour, random = Math.random, clock = realClock, onChange = () => {},
  sheets = {}, animBase = '', bad = new Set(),
}) {
  let placed = decor
  let running = false
  const between = ([min, max]) => min + Math.round((max - min) * random())
  const pick = (list) => list[Math.min(list.length - 1, Math.floor(random() * list.length))]
  const animals = pets
    .map((p, index) => ({ pet: petById(p.id), level: p.level || 1, index }))
    .filter((a) => a.pet)
    .map((a) => ({
      ...a, id: a.pet.id, x: SCENE.fire[0], y: SCENE.fire[1] + 700, right: true, action: 'idle', goal: null, duration: 0, hidden: false,
      bubble: '', emoji: '', tapping: false, sleepStyle: 'A', timer: null, bubbleTimer: null, tapTimer: null, holdGift: false,
    }))

  // ---------------------------------------------------------------- 地方

  function nogoPolys() {
    const n = SCENE.nogo
    return [n.tent, n.fire]
  }

  // 装饰上的点：{ x, y, action, uid, name }
  function decorSpots(action) {
    const out = []
    placed.forEach((p) => {
      const d = decorById(p.id)
      if (!d) return
      const rect = patchRect(p.id, p.x, p.y)
      const s = scaleAt(p.y)
      d.spots.forEach((sp) => {
        if (sp.action !== action) return
        out.push({ x: rect.left + sp.x * s, y: rect.top + sp.y * s, action, uid: p.uid, name: d.name })
      })
    })
    return out
  }

  function taken(spot, self) {
    return animals.some((a) => a !== self && a.goal && a.goal.spot && dist(a.goal.spot.x, a.goal.spot.y, spot.x, spot.y) < 1)
  }

  function free(spots, self) {
    return spots.filter((s) => !taken(s, self))
  }

  // 睡觉的地方，按先后：窝 → 树荫 → 帐篷门口（都只算空着的）；走不到第一个就试下一个
  function sleepSpots(self) {
    const spots = (list) => free(list.map(([x, y]) => ({ x, y, action: 'sleep' })), self)
    return free(decorSpots('sleep'), self).concat(spots(SCENE.shade), spots(SCENE.tent.spots))
  }

  function awayFromOthers(x, y, self) {
    return animals.every((a) => a === self || a.hidden || dist(a.x, a.y, x, y) > self.pet.size * BODY_GAP)
  }

  // 草地上随机一点（离别人远、离中心近一些的优先）
  function randomGrass(self, tries = 30) {
    for (let i = 0; i < tries; i++) {
      const x = 200 + random() * (SCENE.width - 400)
      const y = 800 + random() * (SCENE.height - 1000)
      if (inGrass(x, y) && awayFromOthers(x, y, self)) return { x, y, action: 'idle' }
    }
    return null
  }

  function nearFire(self) {
    for (let i = 0; i < 30; i++) {
      const a = random() * Math.PI * 2
      const r = 380 + random() * 300
      const x = SCENE.fire[0] + r * Math.cos(a)
      const y = SCENE.fire[1] + r * Math.sin(a) * 0.6
      if (inGrass(x, y) && awayFromOthers(x, y, self)) return { x, y, action: 'idle' }
    }
    return null
  }

  // ---------------------------------------------------------------- 画面

  function sheetOf(a) {
    const s = sheets[a.id]
    if (!s || !animBase || bad.has(a.id)) return null
    const anim = frameFor(a.action, { sleepStyle: a.sleepStyle })
    return { sheet: `${animBase}${a.id}-${anim.sheet}.png`, anim: { ...anim, cols: COLS, rows: ROWS }, top: s.top }
  }

  function sprite(a) {
    const s = scaleAt(a.y)
    const width = a.pet.size * s * L.k
    const sh = sheetOf(a)
    const x = a.x * L.k
    const y = a.y * L.k
    const bubbleWidth = Math.min(BUBBLE_W * L.k, L.width)
    const bubbleX = Math.min(Math.max(x - bubbleWidth / 2, 0), L.width - bubbleWidth)
    const shadowW = width * SHADOW_RATIO
    return {
      id: a.id, name: a.pet.name, image: petImage(a.id), face: petFace(a.id), width, left: x - width / 2, bottom: L.height - y, z: zOf(a.y) + 1,
      flip: !a.right, action: a.action, cssAction: CSS_ACTIONS[a.action] || 'act-idle', duration: a.duration, hidden: a.hidden,
      sheet: sh ? sh.sheet : '', anim: sh ? sh.anim : null,
      bubble: a.bubble, bubbleWidth, bubbleLeft: bubbleX - (x - width / 2), bubbleBottom: width * (1 - (sh ? sh.top : 0.05)) + 4,
      emoji: a.action === 'sleep' ? '💤' : a.emoji, tapping: a.tapping,
      shadow: { left: x - shadowW / 2, bottom: L.height - y - shadowW / 6, width: shadowW, height: shadowW / 3 },
    }
  }

  function emit(a) {
    onChange(a.index, sprite(a))
  }

  function schedule(a, ms) {
    clock.clear(a.timer)
    a.timer = running ? clock.set(() => turn(a), ms) : null
  }

  function say(a, text, ms = BUBBLE_MS) {
    a.bubble = text
    clock.clear(a.bubbleTimer)
    a.bubbleTimer = clock.set(() => {
      a.bubble = ''
      emit(a)
    }, ms)
  }

  function heart(a) {
    a.tapping = true
    clock.clear(a.tapTimer)
    a.tapTimer = clock.set(() => {
      a.tapping = false
      emit(a)
    }, TAP_MS)
  }

  // ---------------------------------------------------------------- 走

  function detour(from, to) {
    const polys = nogoPolys()
    const blocked = (p, q) => polys.some((poly) => segmentHitsPoly([p.x, p.y], [q.x, q.y], poly))
    if (!blocked(from, to)) return [to]
    const dx = to.x - from.x
    const dy = to.y - from.y
    const len = Math.hypot(dx, dy) || 1
    const mid = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 }
    const vias = []
    for (const side of [1, -1, 2, -2]) vias.push({ x: mid.x + ((-dy / len) * DETOUR) * side, y: mid.y + ((dx / len) * DETOUR) * side })
    // 大东西（帐篷、篝火圈）光往旁边挪一下绕不过去：再试每个障碍外框四个角外面一点
    polys.forEach((poly) => {
      const xs = poly.map((p) => p[0])
      const ys = poly.map((p) => p[1])
      const l = Math.min(...xs) - CORNER
      const r = Math.max(...xs) + CORNER
      const t = Math.min(...ys) - CORNER
      const b = Math.max(...ys) + CORNER
      vias.push({ x: l, y: t }, { x: r, y: t }, { x: l, y: b }, { x: r, y: b })
    })
    const ok = vias.filter((v) => inGrass(v.x, v.y))
    let best = null
    const consider = (path, d) => {
      if (!best || d < best.d) best = { path, d }
    }
    ok.forEach((v) => {
      if (blocked(from, v) || blocked(v, to)) return
      consider([v, to], dist(from.x, from.y, v.x, v.y) + dist(v.x, v.y, to.x, to.y))
    })
    if (!best) {
      // 一个拐点不够就两个：先绕过一个障碍再绕另一个
      ok.forEach((v1) => {
        if (blocked(from, v1)) return
        ok.forEach((v2) => {
          if (v1 === v2 || blocked(v1, v2) || blocked(v2, to)) return
          consider([v1, v2, to], dist(from.x, from.y, v1.x, v1.y) + dist(v1.x, v1.y, v2.x, v2.y) + dist(v2.x, v2.y, to.x, to.y))
        })
      })
    }
    return best ? best.path : null
  }

  function walkTo(a, spot, then) {
    const path = detour({ x: a.x, y: a.y }, spot)
    if (!path) return false
    a.goal = { spot, then, path }
    stepAlong(a)
    return true
  }

  function stepAlong(a) {
    const next = a.goal.path.shift()
    a.right = facingFor(next.x - a.x, a.right)
    a.duration = Math.max(300, Math.round((dist(a.x, a.y, next.x, next.y) / a.pet.speed) * 1000))
    a.x = next.x
    a.y = next.y
    a.action = a.pet.gait === 'fly' ? 'fly' : 'walk'
    emit(a)
    schedule(a, a.duration)
  }

  function arrived(a) {
    const g = a.goal
    a.duration = 0
    if (g.path.length) return stepAlong(a)
    const then = g.then
    a.goal = { spot: g.spot }
    then(a)
  }

  function doFor(a, action, ms, emoji = '') {
    a.action = action
    a.emoji = emoji
    emit(a)
    schedule(a, ms)
  }

  function rest(a, ms = between(REST_MS)) {
    a.goal = null
    a.emoji = ''
    doFor(a, 'idle', ms)
  }

  // ---------------------------------------------------------------- 一回合

  function away(a) {
    const h = hour()
    return !!a.pet.hours && (h < a.pet.hours[0] || h >= a.pet.hours[1])
  }

  function turn(a) {
    a.timer = null
    if (a.holdGift) return
    if (a.goal && a.goal.path) return arrived(a)
    if (away(a)) {
      a.hidden = true
      a.action = 'away'
      a.goal = null
      emit(a)
      return schedule(a, between(NIGHT_MS))
    }
    if (a.hidden) {
      const [ex, ey] = pick(SCENE.entries)
      a.hidden = false
      a.x = ex
      a.y = ey
    }
    const period = periodOf(hour())
    if (period === 'night') {
      if (a.action === 'sleep') return doFor(a, 'sleep', between(NIGHT_MS))
      const tuckIn = (b) => { b.sleepStyle = b.level >= 2 && random() < 0.5 ? 'B' : 'A'; doFor(b, 'sleep', between(NIGHT_MS)) }
      for (const bed of sleepSpots(a)) {
        if (walkTo(a, bed, tuckIn)) return
      }
      return doFor(a, 'sleep', between(NIGHT_MS))
    }
    if (period === 'dusk') {
      const [sx, sy] = SCENE.seats[a.index % SCENE.seats.length]
      if (a.action === 'sit' && dist(a.x, a.y, sx, sy) < 1) return doFor(a, 'sit', between(DO_MS))
      if (walkTo(a, { x: sx, y: sy, action: 'sit' }, (b) => doFor(b, 'sit', between(DO_MS)))) return
      return rest(a)
    }
    if (a.action !== 'idle') return rest(a)
    if (period === 'morning') {
      const spot = nearFire(a)
      if (spot && walkTo(a, spot, (b) => rest(b, between(DO_MS)))) return
      return rest(a)
    }
    // 白天
    if (random() < PAIR_CHANCE && pair(a)) return
    const plays = free(decorSpots('play').concat(decorSpots('climb')), a)
    if (plays.length && random() < PLAY_CHANCE) {
      const spot = pick(plays)
      if (walkTo(a, spot, (b) => doFor(b, spot.action, between(DO_MS), '🎵'))) return
    }
    if (SUN_LOVERS.indexOf(a.id) !== -1 && random() < 0.5) {
      const sun = free(SCENE.sun.map(([x, y]) => ({ x, y, action: 'sun' })), a)
      if (sun.length && walkTo(a, pick(sun), (b) => doFor(b, 'sun', between(NAP_MS), '☀️'))) return
    }
    if (random() < 0.15) return doFor(a, 'fidget', 1500)
    const spot = randomGrass(a)
    if (spot && walkTo(a, spot, (b) => rest(b))) return
    rest(a)
  }

  // 它们之间：a 走到 b 旁边，各说一句
  function pair(a) {
    const rule = PAIRS.find((r) => r.a === a.id)
    if (!rule) return false
    const b = animals.find((o) => o.id === rule.b && !o.hidden && o.action === 'idle' && !o.holdGift)
    if (!b) return false
    const spot = { x: b.x + (a.pet.size + b.pet.size) * 0.4 * (a.x < b.x ? -1 : 1), y: b.y + 20, action: 'idle' }
    if (!inGrass(spot.x, spot.y)) return false
    return walkTo(a, spot, (me) => {
      me.right = b.x > me.x
      say(me, rule.aLine, PAIR_MS)
      say(b, rule.bLine, PAIR_MS)
      b.emoji = rule.bEmoji
      b.right = me.x > b.x
      emit(b)
      clock.clear(b.timer)
      b.timer = running ? clock.set(() => { b.emoji = ''; rest(b) }, PAIR_MS) : null
      doFor(me, 'happy', PAIR_MS, rule.aEmoji)
    })
  }

  // ---------------------------------------------------------------- 开局

  function settle(a) {
    if (away(a)) {
      a.hidden = true
      a.action = 'away'
      return
    }
    const spot = nearFire(a) || randomGrass(a)
    if (spot) {
      a.x = spot.x
      a.y = spot.y
    }
  }

  function walkIn(a) {
    const [ex, ey] = pick(SCENE.entries)
    a.x = ex
    a.y = ey
    say(a, a.pet.lines.hello, HELLO_MS)
    const [bx, by] = SCENE.bowls[0]
    const spot = { x: bx, y: by + 120, action: 'eat' }
    a.goal = { spot, then: (b) => doFor(b, 'eat', EAT_MS, ''), path: detour({ x: a.x, y: a.y }, spot) || [spot] }
  }

  const arriving = new Set(arrivals)
  animals.forEach((a) => (arriving.has(a.id) ? walkIn(a) : settle(a)))

  function stateOf(a) {
    const spot = a.goal && a.goal.spot
    return { action: a.action, decorName: spot && spot.name ? spot.name : '' }
  }

  return {
    sprites: () => animals.map(sprite),

    start() {
      running = true
      animals.forEach((a) => {
        // 叼着礼物的：接着走，或者已经到了就举着
        if (a.holdGift) {
          if (a.goal && a.goal.path && a.goal.path.length) return stepAlongGift(a)
          if (a.goal && a.goal.then && a.action !== 'gift') return a.goal.then(a)
          return
        }
        // 暂停时正在走：路没走完接着走；走完了（path 空）下一回合由 turn 收尾
        if (a.goal && a.goal.path && a.goal.path.length) return stepAlong(a)
        schedule(a, between(START_MS))
      })
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
        ;[a.timer, a.bubbleTimer, a.tapTimer].forEach((h) => clock.clear(h))
        a.timer = a.bubbleTimer = a.tapTimer = null
      })
    },

    updateDecor(next) {
      placed = next
      animals.forEach((a) => {
        const uid = a.goal && a.goal.spot && a.goal.spot.uid
        if (uid && !placed.some((p) => p.uid === uid)) {
          a.goal = null
          rest(a)
        }
      })
    },

    tap(i) {
      const a = animals[i]
      if (!a || a.hidden) return
      say(a, lineFor(a.id, { period: periodOf(hour()), action: a.action }, random()))
      heart(a)
      emit(a)
    },

    doubleTap(i) {
      const a = animals[i]
      if (!a || a.hidden || a.holdGift) return
      a.goal = a.goal && !a.goal.path ? a.goal : null
      doFor(a, 'roll', ROLL_MS, '😆')
    },

    longPress(i) {
      const a = animals[i]
      if (!a || a.hidden || a.holdGift) return
      a.goal = a.goal && !a.goal.path ? a.goal : null
      doFor(a, 'pet', PET_MS, '❤️')
    },

    feed(i, foodId, liked) {
      const a = animals[i]
      if (!a || a.hidden) return
      a.goal = a.goal && !a.goal.path ? a.goal : null
      say(a, liked ? a.pet.lines.fed : a.pet.lines.dislike)
      doFor(a, liked ? 'eat' : 'dislike', EAT_MS, liked ? '😋' : '💦')
    },

    // 打卡成功：全员跑到篝火边蹦一蹦
    celebrate() {
      animals.forEach((a) => {
        if (a.hidden || a.holdGift) return
        const [sx, sy] = SCENE.seats[a.index % SCENE.seats.length]
        a.goal = null
        if (!walkTo(a, { x: sx, y: sy, action: 'jump' }, (b) => doFor(b, 'jump', JUMP_MS, '🎉'))) doFor(a, 'jump', JUMP_MS, '🎉')
      })
    },

    // 早上的礼物：这只叼着礼物走到画面中间（篝火上方），等你点
    gift(i) {
      const a = animals[i]
      if (!a || a.hidden) return false
      a.holdGift = true
      a.goal = null
      const spot = { x: SCENE.fire[0], y: SCENE.fire[1] + 420, action: 'gift' }
      a.goal = { spot, then: (b) => { b.action = 'gift'; b.emoji = '🎁'; b.duration = 0; emit(b) }, path: detour({ x: a.x, y: a.y }, spot) || [spot] }
      stepAlongGift(a)
      return true
    },

    giftTaken() {
      animals.forEach((a) => {
        if (!a.holdGift) return
        a.holdGift = false
        say(a, '给你的！')
        rest(a)
      })
    },

    whereIs() {
      return animals.map((a) => ({ index: a.index, id: a.id, name: a.pet.name, face: petFace(a.id), x: a.x, y: a.y, action: a.action, text: describe(stateOf(a)) }))
    },

    focus(i) {
      const a = animals[i]
      if (!a) return null
      heart(a)
      emit(a)
      return { x: a.x, y: a.y }
    },

    noSheet(id) {
      bad.add(id)
      animals.forEach((a) => {
        if (a.id === id) emit(a)
      })
    },
  }

  // 叼礼物走路：和普通走路一样，但 holdGift 期间 turn 不接管，所以自己串
  function stepAlongGift(a) {
    const next = a.goal.path.shift()
    a.right = facingFor(next.x - a.x, a.right)
    a.duration = Math.max(300, Math.round((dist(a.x, a.y, next.x, next.y) / a.pet.speed) * 1000))
    a.x = next.x
    a.y = next.y
    a.action = 'gift'
    a.emoji = '🎁'
    emit(a)
    clock.clear(a.timer)
    a.timer = clock.set(() => (a.goal.path.length ? stepAlongGift(a) : a.goal.then(a)), a.duration)
  }
}

module.exports = { createLife }
