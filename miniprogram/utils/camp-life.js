// 宠物的日常：每只一个定时器，轮到它时按时段决定去哪、干什么，走到了做一会儿再换。坐标全是画的像素，页面按缩放画
// 定时器（clock）、随机数、钟点（hour）都能注入，测试里手动推进
// 住户之外还有「客人」（闻着锅里的香味来的，下次拍正餐住下）：从营地边上进来、在锅边转悠，不睡、不在「找它」里
// 困了随机小睡（白天少、夜里多，同时睡的有上限），点睡着的会醒；离开营地时 snapshot() 记下各自在哪，回来从原地接着来
// 和家具玩：荡秋千（坐在座位上跟着座位一起摆）、凑到花前闻一闻、坐在野餐垫 / 桌椅 / 南瓜上歇着（野餐垫上的会吃点心）；点家具能叫一只过来

const { SCENE, scaleAt, inGrass, hiddenAt, segmentHitsPoly, nogoPolys, pointInPoly } = require('./shared/camp')
const { petById } = require('./shared/pets')
const { foodById } = require('./shared/foods')
const { decorById, patchRect, footRect } = require('./shared/decor')
const { periodOf, lineFor, describe, CSS_ACTIONS } = require('./pets')
const { COLS, FOOT, frameFor, facingFor, dirOf, stackRow } = require('./anim')
const { petImage, petFace, zOf, cutoutStrips, isNight } = require('./camp-view')
const { nightLook, lampsOf } = require('./camp-light')

const REST_MS = [3000, 7000]
const DO_MS = [6000, 12000]
const NAP_MS = [15000, 30000] // 晒太阳多久
const NIGHT_MS = [40000, 80000] // 不在营地的（鹤鹤）隔多久再看一次
// 随机小睡：每回合先掷一次「困了」；同时睡着的不超过在场住户的几分之几（至少 1 只）；睡觉点离它多远以内才走过去，不然原地趴下
const DAY_NAP = { chance: 0.06, share: 1 / 4, ms: [10000, 40000] }
const NIGHT_NAP = { chance: 0.35, share: 1 / 2, ms: [60000, 300000] }
const NAP_REACH = 600
const WAKE_MS = 1500
const POT_CHANCE = 0.15 // 白天锅里有它爱吃的：走到锅边吃一会儿
const POT_EAT_MS = 4000
const NIGHT_FIRE_CHANCE = 0.3 // 夜里火着着：去火边待会儿
const SNIFF_MS = 2500
// 家具上的点（shared/decor.js 的 spots）：去玩的时候从这些里挑；perch（稻草人头上）只有会飞的去
const PLAY_ACTIONS = ['play', 'climb', 'swing', 'sniff', 'sit', 'perch']
const SWAY_MS = 1600 // 秋千一个来回（camp.wxss 的 sway 也是 1.6 秒）；荡几个整来回，停的时候正好摆回中间
const SWAY_TIMES = [5, 9]
const FLOWER_MS = 3000 // 低头闻多久
const BLOOM_MS = 1800 // 闻完抬头开心多久
const GATHER = 2 // 那件家具上已经有别的小家伙了：挑它的机会多几倍（两三只一起就是野餐）
const CALL_LINES = { swing: '荡秋千去～', sniff: '我去闻闻花', sit: '来啦，坐会儿', sleep: '那我去歇会儿', play: '玩去喽', climb: '玩去喽', perch: '我飞上去看看' }
const PET_ZOOM = 1.3 // 小动物整体放大（shared/pets.js 的 size 是原来的大小）
// 朝向（有 C 张的才看得出来）：这几个动作保持走过来时的方向（背影 / 正面），别的动作回到侧面
const DIR_ACTIONS = ['idle', 'eat', 'sit']
const START_MS = [300, 1500]
const BUBBLE_MS = 3000
const TAP_MS = 600
const ROLL_MS = 1200
const PET_MS = 1500
const EAT_MS = 2000
const JUMP_MS = 3000
const HELLO_MS = 4000
const PAIR_MS = 5000
const PATH_MARGIN = 60 // 绕障碍时离它多远
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

// 一段路 from → to 跨过哪些东西的那条线（lines：[{ l, r, y }]），返回跨过去的那些点（按先后）。
// 只要这一段路上身子哪儿横着挨着它就算（不只是跨线那一下）：斜着走，跨线时在旁边、走着走着挨上了，也得在跨线处切开，
// 不然后半段按前半段的前后排，走到提灯后面还盖在提灯上面
function depthCuts(from, to, half, lines) {
  const ts = []
  const len = Math.hypot(to.x - from.x, to.y - from.y)
  lines.forEach((o) => {
    if ((from.y - o.y) * (to.y - o.y) >= 0) return
    if (Math.max(from.x, to.x) + half < o.l || Math.min(from.x, to.x) - half > o.r) return
    const t = (o.y - from.y) / (to.y - from.y)
    if (t * len > 1 && (1 - t) * len > 1) ts.push(t)
  })
  ts.sort((p, q) => p - q)
  return ts.map((t) => ({ x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t, piece: true }))
}

// lit：篝火点着没有（锅是空的火不烧，夜里火边也只有月光）；pot：今天锅里煮着的食物 id
// visitors：[{ id, foodId }] 客人；saved：上次离开时的 snapshot()（{ id: { x, y, right, action, until, sleepStyle } }）
function createLife({
  L, pets, decor, arrivals = [], visitors = [], saved = null, hour = realHour, lit = () => true, pot = () => [], random = Math.random, clock = realClock, onChange = () => {},
  // 秋千的座位那层绕哪儿摆（块里的比例 [x, y]，utils/decor-parts.js）；没有座位那层（云端高清块没用上）就返回 null，小动物坐着不摆
  sways = () => null,
  sheets = {}, animBase = '', bad = new Set(),
  // 拼图从哪儿来（一只一张，页面给的是下到本地的文件，还没下好给 ''，就先用单张图）；不给就按 animBase 拼云存储的路径
  sheetSrc = (id) => (animBase ? `${animBase}${id}.png` : ''),
}) {
  let placed = decor
  let lamps = lampsOf(placed)
  let running = false
  const now = () => (clock.now ? clock.now() : Date.now())
  const between = ([min, max]) => min + Math.round((max - min) * random())
  const pick = (list) => list[Math.min(list.length - 1, Math.floor(random() * list.length))]
  const makeAnimal = (pet, level, index, visitor) => ({
    pet, level, index, visitor, id: pet.id, x: SCENE.fire[0], y: SCENE.fire[1] + 700, right: true, action: 'idle', goal: null, duration: 0, hidden: false,
    bubble: '', emoji: '', tapping: false, sleepStyle: 'A', dir: 'side', until: 0, timer: null, bubbleTimer: null, tapTimer: null, holdGift: false, sway: null, next: null,
  })
  const animals = []
  pets.forEach((p) => {
    const pet = petById(p.id)
    if (pet && !animals.some((a) => a.id === pet.id)) animals.push(makeAnimal(pet, p.level || 1, animals.length, null))
  })
  visitors.forEach((v) => {
    const pet = petById(v.id)
    if (pet && !animals.some((a) => a.id === pet.id)) animals.push(makeAnimal(pet, 1, animals.length, { foodId: v.foodId || '' }))
  })
  const sizeOf = (a) => a.pet.size * PET_ZOOM

  // ---------------------------------------------------------------- 地方

  // 装饰上的点：{ x, y, action, uid, id, name }（actions 一个或几个）。块按远近缩放、anchor 对准落脚点，点也跟着缩
  function decorSpots(actions) {
    const want = [].concat(actions)
    const out = []
    placed.forEach((p) => {
      const d = decorById(p.id)
      if (!d) return
      const s = scaleAt(p.y)
      d.spots.forEach((sp) => {
        if (want.indexOf(sp.action) === -1) return
        out.push({ x: p.x + (sp.x - d.anchor.x) * s, y: p.y + (sp.y - d.anchor.y) * s, action: sp.action, uid: p.uid, id: p.id, name: d.name, baseX: p.x, baseY: p.y })
      })
    })
    return out
  }

  // 秋千座位那层摆的轴（画的像素）：座位那层是从秋千图上拆出来的，和块一样大，轴是块里的比例
  function pivotOf(spot) {
    const ratio = sways(spot.id)
    const p = placed.find((q) => q.uid === spot.uid)
    const d = p && decorById(p.id)
    if (!ratio || !d) return null
    const s = scaleAt(p.y)
    return { uid: p.uid, x: p.x + (ratio[0] * d.patch.w - d.anchor.x) * s, y: p.y + (ratio[1] * d.patch.h - d.anchor.y) * s }
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
    return animals.every((a) => a === self || a.hidden || dist(a.x, a.y, x, y) > sizeOf(self) * BODY_GAP)
  }

  // 停下来的地方：草地上、不在锅身 / 提灯正后面（会被整个挡住）、离别人远
  const restable = (x, y, self) => inGrass(x, y) && !hiddenAt(x, y) && awayFromOthers(x, y, self)

  // 草地上随机一点
  function randomGrass(self, tries = 30) {
    for (let i = 0; i < tries; i++) {
      const x = 200 + random() * (SCENE.width - 400)
      const y = 800 + random() * (SCENE.height - 1000)
      if (restable(x, y, self)) return { x, y, action: 'idle' }
    }
    return null
  }

  // 篝火边：锅的前面和两边（锅后面会被锅挡住）
  function nearFire(self) {
    for (let i = 0; i < 30; i++) {
      const a = (-0.08 + random() * 1.16) * Math.PI
      const r = 420 + random() * 320
      const x = SCENE.fire[0] + r * Math.cos(a) * 1.15
      const y = SCENE.fire[1] + r * Math.sin(a) * 0.6
      if (restable(x, y, self)) return { x, y, action: 'idle' }
    }
    return null
  }

  // ---------------------------------------------------------------- 画面

  function sheetOf(a) {
    const s = sheets[a.id]
    if (!s || bad.has(a.id)) return null
    const src = sheetSrc(a.id)
    if (!src) return null
    // 一只一张拼好的图：换动作、转身只换行（anim.sheet 留着是哪一段，看着方便）
    const anim = frameFor(a.action, { sleepStyle: a.sleepStyle, dir: a.dir, c: !!s.c })
    return { sheet: src, anim: { ...anim, cols: COLS, ...stackRow(anim, !!s.c) }, top: s.top }
  }

  function sprite(a) {
    const s = scaleAt(a.y)
    const width = sizeOf(a) * s * L.k
    const sh = sheetOf(a)
    const x = a.x * L.k
    const y = a.y * L.k
    const bubbleWidth = Math.min(BUBBLE_W * L.k, L.width)
    const bubbleX = Math.min(Math.max(x - bubbleWidth / 2, 0), L.width - bubbleWidth)
    const shadowW = a.sway ? 0 : width * SHADOW_RATIO // 坐在秋千上：脚下是座位，影子在秋千图里
    // 影子的中心对着脚：拼图里脚在格底往上 FOOT，单张图脚就在底边
    const feet = L.height - y + (sh ? width * FOOT : 0)
    // 荡秋千：整只绕秋千的轴摆（和座位那层同一套 keyframes、同一次 setData 开始，一起摆）；轴相对这只的框（宽 = 高 = width，底边在脚下）
    const sway = a.sway ? { uid: a.sway.uid, ox: Math.round((a.sway.x * L.k - (x - width / 2)) * 10) / 10, oy: Math.round((a.sway.y * L.k - (y - width)) * 10) / 10 } : null
    return {
      id: a.id, name: a.pet.name, visitor: !!a.visitor, image: petImage(a.id), face: petFace(a.id), width, left: x - width / 2, bottom: L.height - y, z: zOf(sortY(a)) + 1,
      flip: !a.right, action: a.action, cssAction: CSS_ACTIONS[a.action] || 'act-idle', duration: a.duration, hidden: a.hidden,
      sheet: sh ? sh.sheet : '', anim: sh ? sh.anim : null,
      bubble: a.bubble, bubbleWidth, bubbleLeft: bubbleX - (x - width / 2), bubbleBottom: width * (1 - (sh ? sh.top : 0.05)) + 4,
      emoji: a.action === 'sleep' ? '💤' : a.emoji, tapping: a.tapping, sway,
      // 夜里照着画上的光上色（本体调亮度和暖色 + 一层月光版，越冷越浓）；走路时和位置一起慢慢过渡（同一个 duration）
      ...nightLayers(a.x, a.y),
      shadow: { left: x - shadowW / 2, bottom: feet - shadowW / 6, width: shadowW, height: shadowW / 3 },
    }
  }

  // 排前后用的 y：走路时按这一小段的中点；在装饰上玩、睡（吊床、窝、梯子）就排在那件装饰前面（盖在它上面）；其余按脚下
  function sortY(a) {
    if (a.depthY != null) return a.depthY
    const spot = a.goal && !a.goal.path && a.goal.spot
    if (spot && spot.baseY != null && Math.hypot(a.x - spot.x, a.y - spot.y) < 1) return Math.max(a.y, spot.baseY + 4)
    return a.y
  }

  function nightLayers(x, y) {
    if (!isNight(hour())) return { night: false, light: '', moon: 0, moonLight: '' }
    return { night: true, ...nightLook(x, y, lit(), lamps) }
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

  // 绕路：禁区（帐篷、篝火、木盖、提灯）和摆着的装饰的落脚框都是障碍。在每个障碍外面一圈取点，两点之间直线不碰障碍就连上，
  // 走最短的那条（Dijkstra）；图只在装饰变了的时候重算。起点 / 终点在某件装饰的落脚框里（躺在吊床上、去窝里睡）的，那件这回不算障碍
  let graph = null

  function obstacles() {
    const out = nogoPolys().map((poly) => ({ poly }))
    placed.forEach((p) => {
      if (!decorById(p.id)) return
      const r = footRect(p.id, p.x, p.y)
      out.push({ poly: [[r.left, r.top], [r.right, r.top], [r.right, r.bottom], [r.left, r.bottom]], decor: p.uid })
    })
    out.forEach((o) => {
      const xs = o.poly.map((q) => q[0])
      const ys = o.poly.map((q) => q[1])
      o.box = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]
    })
    return out
  }

  function clear(p, q, obs) {
    const l = Math.min(p.x, q.x)
    const r = Math.max(p.x, q.x)
    const t = Math.min(p.y, q.y)
    const b = Math.max(p.y, q.y)
    return !obs.some((o) => !(r < o.box[0] || l > o.box[2] || b < o.box[1] || t > o.box[3]) && segmentHitsPoly([p.x, p.y], [q.x, q.y], o.poly))
  }

  function buildGraph() {
    const obs = obstacles()
    const nodes = []
    obs.forEach((o) => {
      const cx = o.poly.reduce((acc, q) => acc + q[0], 0) / o.poly.length
      const cy = o.poly.reduce((acc, q) => acc + q[1], 0) / o.poly.length
      o.poly.forEach(([x, y]) => {
        const len = Math.hypot(x - cx, y - cy) || 1
        const n = { x: x + ((x - cx) / len) * PATH_MARGIN, y: y + ((y - cy) / len) * PATH_MARGIN }
        if (inGrass(n.x, n.y) && !obs.some((q) => pointInPoly(n.x, n.y, q.poly))) nodes.push(n)
      })
    })
    const edges = nodes.map(() => [])
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        if (!clear(nodes[i], nodes[j], obs)) continue
        const d = dist(nodes[i].x, nodes[i].y, nodes[j].x, nodes[j].y)
        edges[i].push([j, d])
        edges[j].push([i, d])
      }
    }
    return { obs, nodes, edges }
  }

  function detour(from, to) {
    if (!graph) graph = buildGraph()
    const obs = graph.obs.filter((o) => !o.decor || (!pointInPoly(from.x, from.y, o.poly) && !pointInPoly(to.x, to.y, o.poly)))
    if (clear(from, to, obs)) return [to]
    const { nodes, edges } = graph
    const n = nodes.length
    const best = new Array(n).fill(Infinity)
    const prev = new Array(n).fill(-1)
    const done = new Array(n).fill(false)
    const toGoal = new Array(n).fill(Infinity)
    nodes.forEach((nd, i) => {
      if (clear(from, nd, obs)) best[i] = dist(from.x, from.y, nd.x, nd.y)
      if (clear(nd, to, obs)) toGoal[i] = dist(nd.x, nd.y, to.x, to.y)
    })
    let goal = { d: Infinity, via: -1 }
    for (;;) {
      let u = -1
      for (let i = 0; i < n; i++) if (!done[i] && best[i] < Infinity && (u < 0 || best[i] < best[u])) u = i
      if (u < 0 || best[u] >= goal.d) break
      done[u] = true
      if (best[u] + toGoal[u] < goal.d) goal = { d: best[u] + toGoal[u], via: u }
      edges[u].forEach(([v, d]) => {
        if (!done[v] && best[u] + d < best[v]) {
          best[v] = best[u] + d
          prev[v] = u
        }
      })
    }
    if (goal.via < 0) return null
    const path = [to]
    for (let u = goal.via; u >= 0; u = prev[u]) path.unshift({ x: nodes[u].x, y: nodes[u].y })
    return path
  }

  function walkTo(a, spot, then) {
    const path = detour({ x: a.x, y: a.y }, spot)
    if (!path) return false
    a.goal = { spot, then, path }
    stepAlong(a)
    return true
  }

  // 会挡住宠物 / 被宠物挡住的东西，各自按一条横线排前后：抠图层（帐篷一条条）、装饰
  const cutLines = cutoutStrips().map((c) => ({ l: c.l, r: c.r, y: c.zy }))
  function occluders() {
    const out = cutLines.slice()
    placed.forEach((p) => {
      if (!decorById(p.id)) return
      const rect = patchRect(p.id, p.x, p.y)
      out.push({ l: rect.left, r: rect.right, y: p.y })
    })
    return out
  }

  // 一段路要是跨过了某样东西的那条线、跨的时候身子又横着挨着它，就在跨过去的那一点切开：
  // 每一小段里和谁前谁后都不变，按这段中点的 y 排（不然一出发就按终点排，走到锅后面之前就先钻到锅后面去了）
  function splitForDepth(from, to, half) {
    return depthCuts(from, to, half, occluders())
  }

  // 走下一小段：返回这段终点，宠物的前后按这段中点排
  function nextStep(a, path) {
    let next = path.shift()
    const half = (sizeOf(a) * scaleAt(Math.max(a.y, next.y))) / 2
    const cuts = splitForDepth({ x: a.x, y: a.y }, next, half)
    if (cuts.length) {
      path.unshift(...cuts.slice(1), { ...next, piece: true })
      next = cuts[0]
    }
    a.right = facingFor(next.x - a.x, a.right)
    a.dir = dirOf(next.x - a.x, next.y - a.y, a.dir)
    // 切开的小段照原来的速度走（不设最短时长，不然走到切点会顿一下）
    const ms = Math.round((dist(a.x, a.y, next.x, next.y) / a.pet.speed) * 1000)
    a.duration = next.piece ? Math.max(16, ms) : Math.max(300, ms)
    a.depthY = (a.y + next.y) / 2
    a.x = next.x
    a.y = next.y
    return next
  }

  function stepAlong(a) {
    a.sway = null
    a.next = null
    nextStep(a, a.goal.path)
    a.action = a.pet.gait === 'fly' ? 'fly' : 'walk'
    emit(a)
    schedule(a, a.duration)
  }

  function arrived(a) {
    const g = a.goal
    a.duration = 0
    a.depthY = null
    if (g.path.length) return stepAlong(a)
    const then = g.then
    a.goal = { spot: g.spot }
    then(a)
  }

  // more.sway：坐在秋千上跟着摆（pivotOf）；more.next：做完接着做什么（不然下一回合重新挑）
  function doFor(a, action, ms, emoji = '', more = {}) {
    a.action = action
    a.emoji = emoji
    a.sway = more.sway || null
    a.next = more.next || null
    if (action !== 'sleep') a.until = 0
    if (DIR_ACTIONS.indexOf(action) === -1) a.dir = 'side'
    if (!a.goal || !a.goal.path || !a.goal.path.length) a.depthY = null
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

  // ---------------------------------------------------------------- 睡

  const asleep = (a) => a.action === 'sleep' || !!(a.goal && a.goal.path && a.goal.spot && a.goal.spot.action === 'sleep')
  const napRule = () => (isNight(hour()) ? NIGHT_NAP : DAY_NAP)

  // 同时最多几只睡着：在场住户的几分之几，至少 1 只
  function napCap() {
    const here = animals.filter((a) => !a.visitor && !a.hidden).length
    return Math.max(1, Math.floor(here * napRule().share))
  }

  function drowsy(a) {
    if (a.visitor || a.holdGift || hiddenAt(a.x, a.y)) return false
    if (random() >= napRule().chance) return false
    return animals.filter((b) => b !== a && asleep(b)).length < napCap()
  }

  function sleepFor(a, ms) {
    a.until = now() + ms
    doFor(a, 'sleep', ms)
  }

  // 困了：走到附近空着的睡觉点（窝、吊床、树荫、帐篷门口），都太远就原地趴下
  function nap(a) {
    const ms = between(napRule().ms)
    const lieDown = (b) => {
      b.sleepStyle = b.level >= 2 && random() < 0.5 ? 'B' : 'A'
      sleepFor(b, ms)
    }
    const near = sleepSpots(a)
      .map((spot) => ({ spot, d: dist(a.x, a.y, spot.x, spot.y) }))
      .filter((x) => x.d <= NAP_REACH)
      .sort((p, q) => p.d - q.d)
    for (const { spot } of near) {
      if (walkTo(a, spot, lieDown)) return
    }
    lieDown(a)
  }

  // 醒了：点醒的说一句、开心一下；睡够了自己醒的歇一会儿
  function wake(a, byTap) {
    a.until = 0
    a.goal = a.goal && !a.goal.path ? a.goal : null
    if (!byTap) return rest(a)
    say(a, '嗯…？醒啦')
    a.goal = null
    doFor(a, 'happy', WAKE_MS)
  }

  // ---------------------------------------------------------------- 一回合

  function away(a) {
    const h = hour()
    return !!a.pet.hours && (h < a.pet.hours[0] || h >= a.pet.hours[1])
  }

  // 锅里有它爱吃的（它爱吃的两样，或者节气点心）
  function likesPot(a) {
    return pot().some((id) => {
      const food = foodById(id)
      return !!food && (!!food.term || a.pet.foods.indexOf(id) !== -1)
    })
  }

  // 面朝锅：站在锅前面（比篝火靠下）的是背对着我们（背影），两边的侧着
  function facePot(b) {
    b.right = SCENE.fire[0] > b.x
    b.dir = b.y > SCENE.fire[1] + 60 ? 'back' : 'side'
  }

  // 走到锅边（锅的前面和两边）对着锅吃；走不过去就原地吃
  function eatAtPot(a, ms, line) {
    const eat = (b) => {
      facePot(b)
      if (line) say(b, line)
      doFor(b, 'eat', ms, '😋')
    }
    const spot = nearFire(a)
    if (spot && walkTo(a, { ...spot, action: 'eat' }, eat)) return
    eat(a)
  }

  // 客人：在锅边转悠、闻一闻；不睡
  function visitorTurn(a) {
    if (a.action !== 'idle') return rest(a)
    const spot = nearFire(a)
    const sniff = (b) => {
      b.right = SCENE.fire[0] > b.x
      say(b, '好香啊……', SNIFF_MS)
      doFor(b, 'fidget', SNIFF_MS)
    }
    if (spot && walkTo(a, spot, sniff)) return
    rest(a)
  }

  function turn(a) {
    a.timer = null
    if (a.holdGift) return
    if (a.goal && a.goal.path) return arrived(a)
    if (away(a)) {
      a.hidden = true
      a.action = 'away'
      a.goal = null
      a.until = 0
      emit(a)
      return schedule(a, between(NIGHT_MS))
    }
    if (a.hidden) {
      const [ex, ey] = pick(SCENE.entries)
      a.hidden = false
      a.x = ex
      a.y = ey
    }
    if (a.action === 'sleep') {
      if (a.until > now() + 50) return schedule(a, a.until - now())
      return wake(a, false)
    }
    if (a.next) {
      const next = a.next
      a.next = null
      return next(a)
    }
    if (a.visitor) return visitorTurn(a)
    const period = periodOf(hour())
    const fire = lit()
    // 傍晚火着着：围着锅坐
    if (period === 'dusk' && fire) {
      const [sx, sy] = SCENE.seats[a.index % SCENE.seats.length]
      if (a.action === 'sit' && dist(a.x, a.y, sx, sy) < 1) return doFor(a, 'sit', between(DO_MS))
      if (walkTo(a, { x: sx, y: sy, action: 'sit' }, (b) => { facePot(b); doFor(b, 'sit', between(DO_MS)) })) return
      return rest(a)
    }
    if (a.action !== 'idle') return rest(a)
    // 站在锅身 / 提灯正后面（回来时接着上次走到一半的地方）：先走出来再说
    if (hiddenAt(a.x, a.y)) {
      const out = nearFire(a) || randomGrass(a)
      if (out && walkTo(a, out, (b) => rest(b))) return
    }
    if (drowsy(a)) return nap(a)
    if (period === 'morning') {
      const spot = nearFire(a)
      if (spot && walkTo(a, spot, (b) => rest(b, between(DO_MS)))) return
      return rest(a)
    }
    // 白天、夜里、火没着的傍晚：各玩各的
    if (period === 'day' && likesPot(a) && random() < POT_CHANCE) return eatAtPot(a, POT_EAT_MS)
    if (random() < PAIR_CHANCE && pair(a)) return
    // 和家具玩：火没着的夜里不去（大家在睡觉）
    if (!(period === 'night' && !fire) && random() < PLAY_CHANCE) {
      const spot = pickSpot(playSpots(a))
      if (spot && useSpot(a, spot)) return
    }
    if (period === 'day' && SUN_LOVERS.indexOf(a.id) !== -1 && random() < 0.5) {
      const sun = free(SCENE.sun.map(([x, y]) => ({ x, y, action: 'sun' })), a)
      if (sun.length && walkTo(a, pick(sun), (b) => doFor(b, 'sun', between(NAP_MS), '☀️'))) return
    }
    if (period === 'night' && fire && random() < NIGHT_FIRE_CHANCE) {
      const spot = nearFire(a)
      if (spot && walkTo(a, spot, (b) => rest(b, between(DO_MS)))) return
    }
    if (random() < 0.15) return doFor(a, 'fidget', 1500)
    const spot = randomGrass(a)
    if (spot && walkTo(a, spot, (b) => rest(b))) return
    rest(a)
  }

  // ---------------------------------------------------------------- 和家具玩

  // 能去的点：空着的；稻草人头上只有会飞的去
  function playSpots(a, uid) {
    return free(decorSpots(PLAY_ACTIONS), a).filter((sp) => (!uid || sp.uid === uid) && (sp.action !== 'perch' || a.pet.gait === 'fly'))
  }

  // 挑一个：那件家具上已经有别的小家伙了，机会多几倍
  function pickSpot(spots) {
    if (!spots.length) return null
    const busy = (sp) => animals.some((o) => o.goal && o.goal.spot && o.goal.spot.uid === sp.uid)
    const weights = spots.map((sp) => (busy(sp) ? 1 + GATHER : 1))
    let r = random() * weights.reduce((t, w) => t + w, 0)
    for (let i = 0; i < spots.length; i++) {
      r -= weights[i]
      if (r < 0) return spots[i]
    }
    return spots[spots.length - 1]
  }

  // 走过去用：到了按点的种类做
  function useSpot(a, spot) {
    return walkTo(a, spot, (b) => USE[spot.action](b, spot))
  }

  const USE = {
    // 坐上秋千跟着座位摆，荡几个整来回（停的时候正好在中间）
    swing(b, spot) {
      b.right = random() < 0.5
      b.dir = 'side'
      doFor(b, 'sit', between(SWAY_TIMES) * SWAY_MS, '🎵', { sway: pivotOf(spot) })
    },
    // 站在花前，背对着我们低头闻（吃的那行）；抬头开心一下，冒朵花，偶尔飞出只蝴蝶
    sniff(b) {
      b.dir = 'back'
      doFor(b, 'eat', FLOWER_MS, '', { next: (c) => doFor(c, 'happy', BLOOM_MS, random() < 0.3 ? '🦋' : '🌸') })
    },
    // 坐着歇会儿；野餐垫上的多半在吃篮子里的点心
    sit(b, spot) {
      b.right = random() < 0.5
      b.dir = 'side'
      const munch = spot.id === 'picnic' && random() < 0.6
      doFor(b, munch ? 'eat' : 'sit', between(DO_MS), munch ? '😋' : '')
    },
    play(b, spot) {
      doFor(b, spot.action, between(DO_MS), '🎵')
    },
    climb(b, spot) {
      doFor(b, spot.action, between(DO_MS), '🎵')
    },
    perch(b) {
      doFor(b, 'perch', between(DO_MS))
    },
    sleep(b) {
      b.sleepStyle = b.level >= 2 && random() < 0.5 ? 'B' : 'A'
      sleepFor(b, between(DAY_NAP.ms))
    },
  }

  // 它们之间：a 走到 b 旁边，各说一句
  function pair(a) {
    const rule = PAIRS.find((r) => r.a === a.id)
    if (!rule) return false
    const b = animals.find((o) => o.id === rule.b && !o.hidden && !o.visitor && o.action === 'idle' && !o.holdGift)
    if (!b) return false
    const spot = { x: b.x + (sizeOf(a) + sizeOf(b)) * 0.4 * (a.x < b.x ? -1 : 1), y: b.y + 20, action: 'idle' }
    if (!inGrass(spot.x, spot.y) || hiddenAt(spot.x, spot.y)) return false
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

  // 从营地边上走进来，走到锅边：新住户先打招呼、吃一口；客人闻一闻
  function walkIn(a) {
    const [ex, ey] = pick(SCENE.entries)
    a.x = ex
    a.y = ey
    if (!a.visitor) say(a, a.pet.lines.hello, HELLO_MS)
    const spot = nearFire(a) || { x: SCENE.fire[0], y: SCENE.fire[1] + 420, action: 'idle' }
    const then = a.visitor
      ? (b) => {
          b.right = SCENE.fire[0] > b.x
          say(b, '好香啊……', SNIFF_MS)
          doFor(b, 'fidget', SNIFF_MS)
        }
      : (b) => {
          facePot(b)
          doFor(b, 'eat', EAT_MS, '')
        }
    a.goal = { spot, then, path: detour({ x: a.x, y: a.y }, spot) || [spot] }
  }

  // 站在装饰上的点（吊床、窝、梯子）的那件装饰：回来时接着在上面，排前后按那件装饰
  function decorSpotAt(x, y) {
    return decorSpots(['sleep'].concat(PLAY_ACTIONS)).find((sp) => dist(sp.x, sp.y, x, y) < 2) || null
  }

  function inDecorFoot(x, y) {
    return placed.some((p) => {
      if (!decorById(p.id)) return false
      const r = footRect(p.id, p.x, p.y)
      return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom
    })
  }

  // 上次离开时它在哪：站得住（草地上、不在装饰脚下——除非就在那件装饰上的点）就站回去；没睡完的接着睡（不超过上限）。
  // 正好走到锅后面（路过可以、停不行的地方）也站回去，下一回合先走出来（turn 里），不然回来就瞬移到火边
  function restore(a, s) {
    if (!s || !Number.isFinite(s.x) || !Number.isFinite(s.y) || !inGrass(s.x, s.y)) return false
    const spot = decorSpotAt(s.x, s.y)
    if (!spot && inDecorFoot(s.x, s.y)) return false
    a.x = s.x
    a.y = s.y
    a.right = s.right !== false
    a.sleepStyle = s.sleepStyle === 'B' ? 'B' : 'A'
    if (spot) a.goal = { spot }
    if (s.action === 'sleep' && s.until > now() && !a.visitor && animals.filter((b) => b.action === 'sleep').length < napCap()) {
      a.action = 'sleep'
      a.until = s.until
    }
    return true
  }

  const arriving = new Set(arrivals)
  const memory = saved || {}
  animals.forEach((a) => {
    if (away(a)) return settle(a)
    if (restore(a, memory[a.id])) {
      if (arriving.has(a.id)) say(a, a.pet.lines.hello, HELLO_MS)
      return
    }
    if (arriving.has(a.id) || a.visitor) return walkIn(a)
    settle(a)
  })

  function stateOf(a) {
    const spot = a.goal && a.goal.spot
    return { action: a.action, decorName: spot && spot.name ? spot.name : '', spot: spot && spot.name && !a.goal.path ? spot.action : '' }
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

    // 暂停过才重新开始（没暂停时再 start 会让正在走的跳过这一步剩下的路）
    resume() {
      if (!running) this.start()
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
      lamps = lampsOf(placed)
      graph = null
      // 正在玩的东西收走了、挪走了：不玩了（坐在秋千上的也不摆了）
      animals.forEach((a) => {
        const spot = a.goal && a.goal.spot
        if (!spot || !spot.uid) return
        const p = placed.find((q) => q.uid === spot.uid)
        if (!p || p.x !== spot.baseX || p.y !== spot.baseY) {
          a.goal = null
          rest(a)
        }
      })
    },

    // 点一下：睡着的醒过来；客人说它闻着什么来的；住户说句话。都冒个爱心
    tap(i) {
      const a = animals[i]
      if (!a || a.hidden) return
      heart(a)
      if (a.action === 'sleep' && !a.holdGift) return wake(a, true)
      if (a.visitor) {
        const food = foodById(a.visitor.foodId)
        say(a, `它闻着${food ? food.name : ''}的香味来的。妈妈下次拍正餐，它就住下来`, HELLO_MS)
      } else {
        say(a, lineFor(a.id, { period: periodOf(hour()), action: a.action }, random()))
      }
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

    // 叫第 i 只走到 (x, y)（画的像素）歇一会儿（stay 毫秒，不给就 6～12 秒）；那儿站不了或者走不到就返回 false
    goTo(i, x, y, stay) {
      const a = animals[i]
      if (!a || a.hidden || a.holdGift || !inGrass(x, y)) return false
      a.goal = null
      return walkTo(a, { x, y, action: 'idle' }, (b) => rest(b, stay || between(DO_MS)))
    },

    // 点家具「叫一只来玩」：最近的、醒着的住户跑过去用。返回 { ok, name, action }，不行的话 reason：
    // none 这件没什么好玩的、busy 上面的位置都有人了、asleep 都睡着了（或都不在）、far 走不过去
    callTo(uid) {
      const all = decorSpots(['sleep'].concat(PLAY_ACTIONS)).filter((sp) => sp.uid === uid)
      if (!all.length) return { ok: false, reason: 'none' }
      const awake = animals.filter((a) => !a.visitor && !a.hidden && !a.holdGift && !asleep(a))
      if (!awake.length) return { ok: false, reason: 'asleep' }
      const ref = all[0]
      const using = (a) => a.goal && a.goal.spot && a.goal.spot.uid === uid
      // 先叫闲着的（没在往别的家具那儿去、没在玩别的家具），再按远近
      const busyElse = (a) => (a.goal && a.goal.spot && a.goal.spot.uid ? 1 : 0)
      const near = awake.filter((a) => !using(a)).sort((p, q) => busyElse(p) - busyElse(q) || dist(p.x, p.y, ref.x, ref.y) - dist(q.x, q.y, ref.x, ref.y))
      let busy = true
      for (const a of near) {
        const spots = free(all, a).filter((sp) => sp.action !== 'perch' || a.pet.gait === 'fly')
        if (!spots.length) continue
        busy = false
        const spot = spots[0]
        a.until = 0
        a.goal = null
        a.next = null
        if (!useSpot(a, spot)) continue
        say(a, CALL_LINES[spot.action] || '来啦')
        heart(a)
        emit(a)
        return { ok: true, name: a.pet.name, index: a.index, action: spot.action }
      }
      return { ok: false, reason: busy ? 'busy' : 'far' }
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

    // 住户在哪、在干什么（「找它」、礼物用；客人不算）
    whereIs() {
      return animals.filter((a) => !a.visitor).map((a) => ({ index: a.index, id: a.id, name: a.pet.name, face: petFace(a.id), x: a.x, y: a.y, action: a.action, text: describe(stateOf(a)) }))
    },

    focus(i) {
      const a = animals[i]
      if (!a) return null
      heart(a)
      emit(a)
      return { x: a.x, y: a.y }
    },

    // 下锅了：爱吃的住户（ids）走到锅边吃一会儿；睡着的也醒过来去吃
    cook(ids) {
      animals.forEach((a) => {
        if (a.visitor || a.hidden || a.holdGift || (ids || []).indexOf(a.id) === -1) return
        a.until = 0
        a.goal = null
        eatAtPot(a, POT_EAT_MS, a.pet.lines.fed)
      })
    },

    // 闻着香味来了个客人：加在最后，从营地边上走进来（已经在了就不加）；返回它的序号
    addVisitor(v) {
      const pet = v && petById(v.id)
      if (!pet) return -1
      const have = animals.find((a) => a.id === pet.id)
      if (have) return have.index
      const a = makeAnimal(pet, 1, animals.length, { foodId: v.foodId || '' })
      animals.push(a)
      if (away(a)) settle(a)
      else walkIn(a)
      emit(a)
      if (running && a.goal && a.goal.path && a.goal.path.length) stepAlong(a)
      else if (running) schedule(a, between(START_MS))
      return a.index
    },

    // 离开营地时记下各自在哪（走到一半的记这一小段的终点）、朝哪边、睡没睡（睡到几点）
    snapshot() {
      const out = {}
      animals.forEach((a) => {
        if (a.hidden) return
        const sleeping = a.action === 'sleep' && !a.holdGift
        out[a.id] = { x: a.x, y: a.y, right: a.right, action: sleeping ? 'sleep' : 'idle', until: sleeping ? a.until : 0, sleepStyle: a.sleepStyle }
      })
      return out
    },

    // 这只的拼图有变化（下好了 / 坏了）：重新出一次
    refresh(id) {
      animals.forEach((a) => {
        if (a.id === id) emit(a)
      })
    },

    noSheet(id) {
      bad.add(id)
      this.refresh(id)
    },
  }

  // 叼礼物走路：和普通走路一样，但 holdGift 期间 turn 不接管，所以自己串
  function stepAlongGift(a) {
    nextStep(a, a.goal.path)
    a.action = 'gift'
    a.emoji = '🎁'
    emit(a)
    clock.clear(a.timer)
    a.timer = clock.set(() => (a.goal.path.length ? stepAlongGift(a) : (a.depthY = null, a.goal.then(a))), a.duration)
  }
}

module.exports = { createLife, depthCuts, PET_ZOOM }
