// 宠物的日常：每只一个定时器，轮到它时按时段决定去哪、干什么，走到了做一会儿再换。坐标全是画的像素，页面按缩放画
// 定时器（clock）、随机数、钟点（hour）都能注入，测试里手动推进
// 住下的（home：豆豆、喂到 5 级的）一直在；常客锅里有吃的就在，锅空了就从最近的一边走出屏幕（specs/2026-11-07-camp-regulars-design.md）。
// 下锅以后谁来由云函数说（cooked.comers → addGuest）：排着队一只一只从屏幕左右两边的画面外走进来（第一只几秒后，之后每只隔十几秒），
// 先在边上现身一帧再迈腿；进来先去锅边吃一口，然后和大家一样该干嘛干嘛（散步、和家具玩、睡觉、说话，能喂能点）
// 困了随机小睡（白天少、夜里多，同时睡的有上限），点睡着的会醒；离开营地时 snapshot() 记下各自在哪，回来从原地接着来
// 说话：说什么在 pet-talk.js，什么时候能说在 camp-bubbles.js（屏幕上同一时间最多一个气泡）；点它说一段（两三句，一句一句换着显示，
// 再点一下跳到下一句）；自己开口很少（几分钟一句）
// 怎么走（绕路、一小段一小段走、走到一半停下）在 camp-walk.js；这里只管去哪、干什么
// 和家具玩：荡秋千（坐在座位上跟着座位一起摆）、凑到花前闻一闻、坐在水壶炉边喝茶；点家具能叫一只过来。困了多半进大帐篷趴着睡、只露个小脑袋

const { SCENE, scaleAt, inGrass, hiddenAt } = require('./shared/camp')
const { petById } = require('./shared/pets')
const { foodById } = require('./shared/foods')
const { decorById, footRect } = require('./shared/decor')
const { periodOf, describe, CSS_ACTIONS } = require('./pets')
const { talkLine, speech, sniffLine, leaveLine, backLine } = require('./pet-talk')
const { COLS, FOOT, frameFor, stackRow } = require('./anim')
const { petImage, petFace, zOf, isNight, SWAY_CLASS, cutoutStrips } = require('./camp-view')
const { nightLook, lampsOf } = require('./camp-light')
const { createWalk } = require('./camp-walk')
const { createBubbles } = require('./camp-bubbles')

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
const CHAT_MS = [240000, 480000] // 隔多久有一只自己开口（10/28 15～28 秒 → 45～90 秒，10/29 用户还嫌勤、一说大家一起说 → 4～8 分钟）
const CHAT_BUBBLE_MS = 4500 // 自己开口的那句留多久；说话时站着不动，看得出是谁说的
// 锅里空着（今天还没下锅）：这一级以下的出去找吃的（从营地边上走掉、藏起来），这一级以上的留下来在锅边喊饿；
// 至少留一只最亲的，营地不会一只都没有；一下锅，走掉的闻着香味回来
// 下锅以后来的排着队回来（11/07 用户：一下子全从上面冒出来不自然）：
// 第一只过 BACK_FIRST_MS 才到，之后每只隔 BACK_GAP_MS；都从屏幕左右两边（看得到的那段外面 EDGE_OUT）进来
const BACK_FIRST_MS = [4000, 10000]
const BACK_GAP_MS = [8000, 18000]
// 少待在锅边（11/07 用户：老在锅边、动作单一）：开局和早上只有三成去火边，其余时候只有吃的时候才去
const START_FIRE_CHANCE = 0.3
const MORNING_FIRE_CHANCE = 0.3
const BACK_LATE_MS = 2000 // 排到的时间错过这么久（切过 tab 回来）就重新排队
const EDGE_OUT = 140 // 从屏幕边上往外多少（画的像素）出现
const EDGE_IN = 120 // 离画的左右边至少这么多（草地里）
const SHOW_MS = 80 // 从外面进来：先在边上现身一帧再迈腿（藏着的元素是重新画的，直接给第一段的终点就从那儿冒出来了）
const HUNGRY_POT_CHANCE = 0.2 // 住下的饿着时，去锅边坐着等的机会
// 家具上的点（shared/decor.js 的 spots）：去玩的时候从这些里挑
const PLAY_ACTIONS = ['play', 'swing', 'sniff', 'sit', 'tea']
const SWAY_MS = 1600 // 秋千一个来回（camp.wxss 的 sway 也是 1.6 秒）；荡几个整来回，停的时候正好摆回中间
const SWAY_TIMES = [5, 9]
const FLOWER_MS = 3000 // 低头闻多久
const BLOOM_MS = 1800 // 闻完抬头开心多久
const GATHER = 2 // 那件家具上已经有别的小家伙了：挑它的机会多几倍（两只凑一起喝茶、一排花前站两只）
// 困了去大帐篷里睡（11/07 用户：困了可以去露营的帐篷里睡，露个小脑袋趴着）：有空床位就多半走过去（再远也去），白天也睡得久一点
const TENT_CHANCE = 0.7
const TENT_NAP_MS = [45000, 120000] // 白天在帐篷里睡多久（夜里按 NIGHT_NAP）
const TENT_IN_MS = 600 // 到了门口背对着我们站一下（进去）再趴下
const SIP_MS = 1800 // 水壶炉边：低头喝一口多久
const CALL_LINES = { swing: '荡秋千去～', sniff: '我去闻闻花', sit: '来啦，坐会儿', sleep: '那我去歇会儿', tea: '喝口热茶去', play: '玩去喽' }
// 在帐篷里睡的排在门洞那几条帐篷（camp-view.cutoutStrips，128 宽一条、按自己那段前沿排前后）前面：门洞里画的是帐篷里面，
// 不排在前面就被整个盖住；露出来的范围由门洞的形状管（tentClip），布帘、帐篷布、横木挡住的地方本来就裁掉了。
// 门口外面站着的排在它前面（它们脚下的 y 比门洞那几条的前沿都大）；靠前的床位再往前一点，两只都在时前面那只盖住后面那只
const HOLE_XS = SCENE.tent.hole.map((p) => p[0])
const TENT_DEPTH = Math.max(...cutoutStrips().filter((c) => c.cut === 'tent' && c.r > Math.min(...HOLE_XS) && c.l < Math.max(...HOLE_XS)).map((c) => c.zy)) + 4
const BACK_BED_Y = Math.min(...SCENE.tent.beds.map((b) => b.at[1]))
const bedDepth = (bed) => TENT_DEPTH + (bed.at[1] - BACK_BED_Y) / 6
const PET_ZOOM = 1.3 // 小动物整体放大（shared/pets.js 的 size 是原来的大小）
// 朝向（有 C 张的才看得出来）：这几个动作保持走过来时的方向（背影 / 正面），别的动作回到侧面
const DIR_ACTIONS = ['idle', 'eat', 'sit'] // 做这些时保持朝向（别的动作回侧面）
const START_MS = [300, 1500]
const TAP_MS = 600
const ROLL_MS = 1200
const PET_MS = 1500
const EAT_MS = 2000
const JUMP_MS = 3000
const HELLO_MS = 4000
const PAIR_MS = 5000
const BODY_GAP = 1.1 // 目标点离别的宠物至少几个身位
const SUN_LOVERS = ['jutuan', 'guigui']
const PAIR_CHANCE = 0.08
const PLAY_CHANCE = 0.35
const SHADOW_RATIO = 0.6
// 气泡宽按字数定（字号 32rpx，手机上一个字约 16px），左边是说话的那只的头像（BUBBLE_FACE），最宽 BUBBLE_MAX、最多两行；
// 下面一个小尖角指着它（tailLeft）
const BUBBLE_CHAR = 16
const BUBBLE_PAD = 28
const BUBBLE_FACE = 28
const BUBBLE_MIN = 80
const BUBBLE_MAX = 240
const TAIL_EDGE = 16

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

// lit：篝火点着没有（锅是空的火不烧，夜里火边也只有月光）；pot：今天锅里煮着的食物 id
// pets：[{ id, level, home }]（home：住下了，锅空了也不走）；saved：上次离开时的 snapshot()（{ id: { x, y, right, action, until, sleepStyle } }）
function createLife({
  L, pets, decor, saved = null, hour = realHour, lit = () => true, pot = () => [], random = Math.random, clock = realClock, onChange = () => {},
  // 家具会摆的那层（秋千座位）：{ pivot: 块里的比例 [x, y], kind: 'swing' }（utils/decor-parts.js）；
  // 没拆（云端高清块没用上）就返回 null，小动物在上面不摆
  sways = () => null,
  // 今天打卡的情况（拍了几顿、吃了多少……，pet-talk.js 的 todayLines），小动物会聊起来；没有就不聊
  today = () => null,
  // 屏幕上看得到的那段（世界里的像素 { left, right }，让开两边的按钮）：说话的气泡夹在这里面；不给就只夹在画里
  visible = () => null,
  sheets = {}, animBase = '', bad = new Set(),
  // 拼图从哪儿来（一只一张，页面给的是下到本地的文件，还没下好给 ''，就先用单张图）；不给就按 animBase 拼云存储的路径
  sheetSrc = (id) => (animBase ? `${animBase}${id}.png` : ''),
}) {
  let chatTimer = null
  let placed = decor
  let lamps = lampsOf(placed)
  let running = false
  const now = () => (clock.now ? clock.now() : Date.now())
  const between = ([min, max]) => min + Math.round((max - min) * random())
  const pick = (list) => list[Math.min(list.length - 1, Math.floor(random() * list.length))]
  const makeAnimal = (pet, level, index, home) => ({
    pet, level, index, home: !!home, id: pet.id, x: SCENE.fire[0], y: SCENE.fire[1] + 700, right: true, action: 'idle', goal: null, duration: 0, hidden: false,
    bubble: '', emoji: '', tapping: false, sleepStyle: 'A', dir: 'side', until: 0, timer: null, bubbleTimer: null, tapTimer: null, holdGift: false, sway: null, next: null,
  })
  const animals = []
  pets.forEach((p) => {
    const pet = petById(p.id)
    if (pet && !animals.some((a) => a.id === pet.id)) animals.push(makeAnimal(pet, p.level || 1, animals.length, p.home))
  })
  const sizeOf = (a) => a.pet.size * PET_ZOOM
  const walk = createWalk({ decor, now, sizeOf })
  const bubbles = createBubbles({ animals, clock, emit: (a) => emit(a) })

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

  // 家具会摆的那层的轴（画的像素）：那层是从家具图上拆出来的，和块一样大，轴是块里的比例；cls 是摆的动画类（和那层一样）
  function pivotOf(spot) {
    const part = spot && spot.uid ? sways(spot.id) : null
    const p = part && placed.find((q) => q.uid === spot.uid)
    const d = p && decorById(p.id)
    if (!d) return null
    const s = scaleAt(p.y)
    return { uid: p.uid, x: p.x + (part.pivot[0] * d.patch.w - d.anchor.x) * s, y: p.y + (part.pivot[1] * d.patch.h - d.anchor.y) * s, cls: SWAY_CLASS[part.kind] }
  }

  function taken(spot, self) {
    return animals.some((a) => a !== self && a.goal && a.goal.spot && dist(a.goal.spot.x, a.goal.spot.y, spot.x, spot.y) < 1)
  }

  function free(spots, self) {
    return spots.filter((s) => !taken(s, self))
  }

  // 帐篷以外睡觉的地方，按先后：窝 → 树荫 → 帐篷门口（都只算空着的）；走不到第一个就试下一个
  function sleepSpots(self) {
    const spots = (list) => free(list.map(([x, y]) => ({ x, y, action: 'sleep' })), self)
    return free(decorSpots('sleep'), self).concat(spots(SCENE.shade), spots(SCENE.tent.spots))
  }

  function awayFromOthers(x, y, self) {
    return animals.every((a) => a === self || a.hidden || dist(a.x, a.y, x, y) > sizeOf(self) * BODY_GAP)
  }

  // 停下来的地方：草地上、不在锅身 / 提灯正后面（会被整个挡住）、离别人远
  const restable = (x, y, self) => inGrass(x, y) && !hiddenAt(x, y) && awayFromOthers(x, y, self)

  // 画面左右两边、火那一排附近的一点：看得到屏幕就在看得到的那段外面一点（像从画面外走进来），看不到就是画的两边；
  // side -1 左 / 1 右；yHint 尽量用这个高度（出去找吃的从自己这一行走出去）。草地外、锅后面不算
  function edgePoint(side, yHint) {
    const view = visible()
    const edge = side < 0 ? (view ? view.left / L.k - EDGE_OUT : 0) : view ? view.right / L.k + EDGE_OUT : SCENE.width
    const x = Math.min(SCENE.width - EDGE_IN, Math.max(EDGE_IN, edge))
    const lo = SCENE.fire[1] - 400
    const hi = SCENE.fire[1] + 800
    const ys = yHint == null ? [] : [Math.min(hi, Math.max(lo, yHint))]
    for (let i = 0; i < 12; i++) ys.push(lo + random() * (hi - lo))
    const y = ys.find((v) => inGrass(x, v) && !hiddenAt(x, v))
    return y == null ? null : { x, y, action: 'idle' }
  }

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
    const bubbleWidth = Math.min(L.width, Math.max(BUBBLE_MIN, Math.min(BUBBLE_MAX, BUBBLE_PAD + BUBBLE_FACE + BUBBLE_CHAR * a.bubble.length)))
    // 气泡相对这只的位置在开口那一下定好（夹在屏幕看得到的那段里），之后跟着它走：边走边说时不能每一小段重新夹，
    // 不然气泡的偏移一下就变了、这只还在慢慢挪过去，气泡会先往旁边甩一下
    if (a.bubble && a.bubbleDx == null) {
      const view = visible()
      const lo = Math.max(0, view ? view.left : 0)
      const hi = Math.min(L.width, view ? view.right : L.width) - bubbleWidth
      const bubbleX = hi >= lo ? Math.min(Math.max(x - bubbleWidth / 2, lo), hi) : Math.min(Math.max(x - bubbleWidth / 2, 0), L.width - bubbleWidth)
      a.bubbleDx = bubbleX - (x - width / 2)
    }
    const shadowW = a.sway || a.action === 'tent' ? 0 : width * SHADOW_RATIO // 在秋千上脚下是座位、影子在家具图里；帐篷里的身子在帐篷里
    // 影子的中心对着脚：拼图里脚在格底往上 FOOT，单张图脚就在底边
    const feet = L.height - y + (sh ? width * FOOT : 0)
    // 荡秋千：整只绕秋千的轴摆（和座位那层同一套 keyframes、同一次 setData 开始，一起摆）；轴相对这只的框（宽 = 高 = width，底边在脚下）
    const sway = a.sway ? { uid: a.sway.uid, cls: a.sway.cls, ox: Math.round((a.sway.x * L.k - (x - width / 2)) * 10) / 10, oy: Math.round((a.sway.y * L.k - (y - width)) * 10) / 10 } : null
    return {
      id: a.id, name: a.pet.name, home: !!a.home, image: petImage(a.id), face: petFace(a.id), width, left: x - width / 2, bottom: L.height - y, z: zOf(sortY(a)) + 1,
      flip: !a.right, action: a.action, cssAction: CSS_ACTIONS[a.action] || 'act-idle', duration: a.duration, hidden: a.hidden,
      sheet: sh ? sh.sheet : '', anim: sh ? sh.anim : null,
      bubble: a.bubble, bubbleWidth, bubbleLeft: a.bubble ? a.bubbleDx : 0, tailLeft: a.bubble ? Math.min(Math.max(width / 2 - a.bubbleDx, TAIL_EDGE), bubbleWidth - TAIL_EDGE) : 0, bubbleBottom: width * (1 - (sh ? sh.top : 0.05)) + 4,
      emoji: a.action === 'sleep' || a.action === 'tent' ? '💤' : a.emoji, tapping: a.tapping, sway,
      // 在帐篷里：整只裁成门洞的形状（tentClip，按这只的框算的门洞多边形）；拼图里脚在格底往上 FOOT，往下挪这么多让脚踩在床位上
      tentClip: a.action === 'tent' ? tentClip(x - width / 2, y - width) : '',
      tentShift: a.action === 'tent' && sh ? `transform: translateY(${Math.round(FOOT * 100)}%)` : '',
      // 夜里照着画上的光上色（本体调亮度和暖色 + 一层月光版，越冷越浓）；走路时和位置一起慢慢过渡（同一个 duration）
      ...nightLayers(a.x, a.y),
      shadow: { left: x - shadowW / 2, bottom: feet - shadowW / 6, width: shadowW, height: shadowW / 3 },
    }
  }

  // 排前后用的 y：走路时按这一小段的中点；在装饰上玩、睡（窝、秋千）就排在那件装饰前面（盖在它上面）；在帐篷里的排在帐篷前面（depthY）；其余按脚下
  function sortY(a) {
    if (a.depthY != null) return a.depthY
    const spot = a.goal && !a.goal.path && a.goal.spot
    if (spot && spot.baseY != null && Math.hypot(a.x - spot.x, a.y - spot.y) < 1) return Math.max(a.y, spot.baseY + 4)
    return a.y
  }

  // 门洞的形状，换成这只的框（左上角在屏幕上的 left / top）里的坐标：在帐篷里睡的只在这块里露出来
  function tentClip(left, top) {
    const pts = SCENE.tent.hole.map(([hx, hy]) => `${Math.round((hx * L.k - left) * 10) / 10}px ${Math.round((hy * L.k - top) * 10) / 10}px`).join(', ')
    return `clip-path: polygon(${pts}); -webkit-clip-path: polygon(${pts})`
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

  function heart(a) {
    a.tapping = true
    clock.clear(a.tapTimer)
    a.tapTimer = clock.set(() => {
      a.tapping = false
      emit(a)
    }, TAP_MS)
  }

  // ---------------------------------------------------------------- 走

  function walkTo(a, spot, then) {
    if (leaveTentThen(a, (b) => { if (!walkTo(b, spot, then)) rest(b) })) return true
    const path = walk.route({ x: a.x, y: a.y }, spot)
    if (!path) return false
    a.goal = { spot, then, path }
    stepAlong(a)
    return true
  }

  function stepAlong(a) {
    a.sway = null
    a.next = null
    const ms = walk.step(a, a.goal.path)
    a.action = a.pet.gait === 'fly' ? 'fly' : 'walk'
    emit(a)
    schedule(a, ms)
  }

  function arrived(a) {
    const g = a.goal
    walk.land(a)
    if (g.path.length) return stepAlong(a)
    const then = g.then
    a.goal = { spot: g.spot }
    then(a)
  }

  // more.sway：坐在秋千上跟着摆（pivotOf）；more.next：做完接着做什么（不然下一回合重新挑）；more.depthY：排前后用的 y（在帐篷里）
  function doFor(a, action, ms, emoji = '', more = {}) {
    if (action !== 'tent' && leaveTentThen(a, (b) => doFor(b, action, ms, emoji, more))) return
    a.action = action
    a.emoji = emoji
    a.sway = more.sway || null
    a.next = more.next || null
    if (action !== 'sleep' && action !== 'tent') a.until = 0
    if (DIR_ACTIONS.indexOf(action) === -1) a.dir = 'side'
    if (more.depthY != null) a.depthY = more.depthY
    else if (!a.goal || !a.goal.path || !a.goal.path.length) a.depthY = null
    emit(a)
    schedule(a, ms)
  }

  function rest(a, ms = between(REST_MS)) {
    a.goal = null
    a.emoji = ''
    doFor(a, 'idle', ms)
  }

  // ---------------------------------------------------------------- 睡

  const SLEEPS = ['sleep', 'tent']
  const asleep = (a) => SLEEPS.indexOf(a.action) !== -1 || !!(a.goal && a.goal.path && a.goal.spot && SLEEPS.indexOf(a.goal.spot.action) !== -1)
  const napRule = () => (isNight(hour()) ? NIGHT_NAP : DAY_NAP)

  // 同时最多几只睡着：在场住户的几分之几，至少 1 只
  function napCap() {
    const here = animals.filter((a) => !a.hidden).length
    return Math.max(1, Math.floor(here * napRule().share))
  }

  function drowsy(a) {
    if (a.holdGift || hiddenAt(a.x, a.y)) return false
    if (random() >= napRule().chance) return false
    return animals.filter((b) => b !== a && asleep(b)).length < napCap()
  }

  function sleepFor(a, ms) {
    a.until = now() + ms
    doFor(a, 'sleep', ms)
  }

  // ---------------------------------------------------------------- 帐篷里睡

  // 帐篷里空着的床位（每个床位一只；走的目标是门口那点，bed 记着床位），按离这只的远近
  function freeBeds(self) {
    return SCENE.tent.beds
      .map((bed) => ({ x: bed.door[0], y: bed.door[1], action: 'tent', bed }))
      .filter((sp) => !taken(sp, self))
      .sort((p, q) => dist(self.x, self.y, p.x, p.y) - dist(self.x, self.y, q.x, q.y))
  }

  // 到门口了：背对着我们站一下（进去），然后趴在床位上睡 ms 毫秒（身子在布帘后面，头露在门洞里）
  function goIn(a, bed, ms) {
    a.dir = 'back'
    doFor(a, 'idle', TENT_IN_MS, '', {
      next: (b) => {
        walk.put(b, bed.at[0], bed.at[1])
        b.right = bed.right
        b.sleepStyle = 'A'
        b.until = now() + ms
        doFor(b, 'tent', ms, '', { depthY: bedDepth(bed) })
      },
    })
  }

  // 从帐篷里出来：床位在禁区里走不了路，站回门口、面朝我们
  function outOfTent(a) {
    const spot = a.goal && a.goal.spot
    const bed = (spot && spot.bed) || SCENE.tent.beds.slice().sort((p, q) => dist(a.x, a.y, p.at[0], p.at[1]) - dist(a.x, a.y, q.at[0], q.at[1]))[0]
    walk.put(a, bed.door[0], bed.door[1])
    a.dir = 'front'
    a.depthY = null
    a.action = 'idle'
  }

  // 在帐篷里睡着的要去干别的（醒了、被点、被叫、要走）：先出来站在门口（这一帧不带过渡），下一拍再做 then——
  // 不然从床位直接过渡到第一个拐点，会从帐篷里滑出来穿过帐篷布。不在帐篷里返回 false
  function leaveTentThen(a, then) {
    if (a.action !== 'tent') return false
    outOfTent(a)
    emit(a)
    a.next = then
    schedule(a, SHOW_MS)
    return true
  }

  function bedAt(x, y) {
    return SCENE.tent.beds.find((b) => dist(b.at[0], b.at[1], x, y) < 2) || null
  }

  // 困了：先想着大帐篷（有空床位就多半走过去，再远也去）；不然走到附近空着的睡觉点（窝、树荫、帐篷门口），都太远就原地趴下
  function nap(a) {
    const ms = between(napRule().ms)
    const lieDown = (b) => {
      b.sleepStyle = b.level >= 2 && random() < 0.5 ? 'B' : 'A'
      sleepFor(b, ms)
    }
    if (random() < TENT_CHANCE) {
      const stay = between(isNight(hour()) ? NIGHT_NAP.ms : TENT_NAP_MS)
      for (const spot of freeBeds(a)) {
        if (walkTo(a, spot, (b) => goIn(b, spot.bed, stay))) return
      }
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
    bubbles.take(a, '嗯…？醒啦')
    a.goal = null
    doFor(a, 'happy', WAKE_MS)
  }

  // ---------------------------------------------------------------- 一回合

  // 不在营地的钟点（鹤鹤只在早上来）
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
      if (line) bubbles.event(b, line)
      doFor(b, 'eat', ms, '😋')
    }
    const spot = nearFire(a)
    if (spot && walkTo(a, { ...spot, action: 'eat' }, eat)) return
    eat(a)
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
    if (leaving(a)) return findFood(a)
    if (a.hidden) {
      // 锅空了回去的：等云函数叫（再煮它爱吃的 → addGuest），自己不回来
      if (a.why === 'hungry') return schedule(a, between(NIGHT_MS))
      // 闻着香味来的：排着队一只一只进，从屏幕左右两边进来
      if (a.why === 'smell') {
        const wait = queueBack(a)
        if (wait > 0) return schedule(a, wait)
        const from = edgePoint(random() < 0.5 ? -1 : 1)
        const [ex, ey] = from ? [from.x, from.y] : pick(SCENE.entries)
        const foodId = a.foodId || ''
        a.why = ''
        a.foodId = ''
        a.hidden = false
        a.action = 'idle'
        walk.put(a, ex, ey)
        // 先在边上现身，下一拍再往锅边走吃一口（回来的说一句「闻到香味啦」）
        a.next = (b) => {
          if (b.been) bubbles.event(b, backLine(b.id))
          walkIn(b, { x: ex, y: ey }, b.been ? '' : foodId)
          b.been = true
          stepAlong(b)
        }
        emit(a)
        return schedule(a, SHOW_MS)
      }
      // 不在营地的时段过了（鹤鹤早上回来）：从树林边的入口现身，下一拍再走
      const [ex, ey] = pick(SCENE.entries)
      a.hidden = false
      a.action = 'idle'
      walk.put(a, ex, ey)
      emit(a)
      return schedule(a, SHOW_MS)
    }
    if (SLEEPS.indexOf(a.action) !== -1) {
      if (a.until > now() + 50) return schedule(a, a.until - now())
      return wake(a, false)
    }
    if (a.next) {
      const next = a.next
      a.next = null
      return next(a)
    }
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
    // 早上：有时去火边待会儿（不是每回合都去）
    if (period === 'morning' && random() < MORNING_FIRE_CHANCE) {
      const spot = nearFire(a)
      if (spot && walkTo(a, spot, (b) => rest(b, between(DO_MS)))) return
      return rest(a)
    }
    // 白天、夜里、火没着的傍晚：各玩各的
    if (period === 'day' && likesPot(a) && random() < POT_CHANCE) return eatAtPot(a, POT_EAT_MS)
    // 锅里空着、留下来的：去锅边坐着等，喊饿
    if (hungry() && period !== 'night' && random() < HUNGRY_POT_CHANCE) {
      const spot = nearFire(a)
      const wait = (b) => {
        facePot(b)
        bubbles.auto(b, lineOf(b), CHAT_BUBBLE_MS)
        doFor(b, 'sit', between(DO_MS), '💭')
      }
      if (spot && walkTo(a, spot, wait)) return
    }
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

  // 能去的点：空着的
  function playSpots(a, uid) {
    return free(decorSpots(PLAY_ACTIONS), a).filter((sp) => !uid || sp.uid === uid)
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
    // 坐着歇会儿
    sit(b) {
      b.right = random() < 0.5
      b.dir = 'side'
      doFor(b, 'sit', between(DO_MS))
    },
    play(b, spot) {
      doFor(b, spot.action, between(DO_MS), '🎵')
    },
    // 水壶炉边：面朝水壶坐着，喝一口、歇一会儿、再喝一口（两只就是对坐喝茶）
    tea(b, spot) {
      const p = placed.find((q) => q.uid === spot.uid)
      b.right = !!p && p.x > b.x
      b.dir = 'side'
      const sip = (c, then) => doFor(c, 'eat', SIP_MS, '🍵', { next: then })
      doFor(b, 'sit', between(REST_MS), '', { next: (c) => sip(c, (d) => doFor(d, 'sit', between(DO_MS), '', { next: (e) => sip(e, (f) => rest(f)) })) })
    },
    sleep(b) {
      b.sleepStyle = b.level >= 2 && random() < 0.5 ? 'B' : 'A'
      sleepFor(b, between(DAY_NAP.ms))
    },
  }

  // ---------------------------------------------------------------- 锅里空着

  const hungry = () => !pot().length

  // 排队进场：下一只最早什么时候能进来。这只还没排上就给它排一个（现在或者队尾），返回还要等多久；
  // 排到的时间早就过了（切过 tab 回来）重新排
  let nextBack = 0
  function queueBack(a) {
    const t = now()
    if (!a.backAt || t - a.backAt > BACK_LATE_MS) {
      a.backAt = Math.max(t, nextBack)
      nextBack = a.backAt + between(BACK_GAP_MS)
    }
    const wait = a.backAt - t
    if (wait > 50) return wait
    a.backAt = 0
    return 0
  }

  // 这只现在该走了：锅空着、没住下（常客）；叼着礼物的不走
  function leaving(a) {
    return hungry() && !a.home && !a.holdGift
  }

  // 锅空了，常客回去：说一句，走到最近的一边，藏起来；再煮它爱吃的由云函数叫回来（addGuest）
  function findFood(a) {
    if (a.hidden) return schedule(a, between(NIGHT_MS))
    a.until = 0
    a.sway = null
    const out = edgePoint(a.x < SCENE.width / 2 ? -1 : 1, a.y)
    const [ex, ey] = out ? [out.x, out.y] : SCENE.entries.slice().sort((p, q) => dist(a.x, a.y, p[0], p[1]) - dist(a.x, a.y, q[0], q[1]))[0]
    const gone = (b) => {
      b.hidden = true
      b.action = 'away'
      b.why = 'hungry'
      b.goal = null
      bubbles.drop(b)
      emit(b)
      schedule(b, between(NIGHT_MS))
    }
    bubbles.event(a, leaveLine(a.id))
    if (!walkTo(a, { x: ex, y: ey, action: 'idle' }, gone)) gone(a)
  }

  // ---------------------------------------------------------------- 说话

  // 这只现在说什么（pet-talk.js）：在家具上的、吃着东西的、早上的各有说法；最近说过的不重复
  function talkCtx(a) {
    const spot = a.goal && !a.goal.path && a.goal.spot ? a.goal.spot.action : ''
    return { period: periodOf(hour()), action: a.action, level: a.level, home: !!a.home, today: today(), pot: pot(), spot, hungry: hungry() }
  }
  const lineOf = (a) => talkLine(a.id, talkCtx(a), random, a.recent || [])
  const speechOf = (a) => speech(a.id, talkCtx(a), random, a.recent || [])

  // 隔一会儿挑一只醒着、闲着、头上没气泡的住户自己开口
  function scheduleChat() {
    clock.clear(chatTimer)
    chatTimer = running ? clock.set(chat, between(CHAT_MS)) : null
  }

  // 站着不动、闲着的才开口（边走边说看不出是谁）；说的时候先别走开
  const still = (a) => !a.hidden && !a.holdGift && !a.bubble && !asleep(a) && !(a.goal && a.goal.path) && !a.sway && !a.next && a.depthY == null
  function chat() {
    chatTimer = null
    const quiet = animals.filter(still)
    if (quiet.length) {
      const a = pick(quiet)
      if (bubbles.auto(a, lineOf(a), CHAT_BUBBLE_MS)) {
        emit(a)
        if (a.action === 'idle') schedule(a, CHAT_BUBBLE_MS + 400)
      }
    }
    scheduleChat()
  }

  // 它们之间：a 走到 b 旁边，各说一句
  function pair(a) {
    const rule = PAIRS.find((r) => r.a === a.id)
    if (!rule) return false
    const b = animals.find((o) => o.id === rule.b && !o.hidden && o.action === 'idle' && !o.holdGift)
    if (!b) return false
    const spot = { x: b.x + (sizeOf(a) + sizeOf(b)) * 0.4 * (a.x < b.x ? -1 : 1), y: b.y + 20, action: 'idle' }
    if (!inGrass(spot.x, spot.y) || hiddenAt(spot.x, spot.y)) return false
    // 只有先开口的那只冒气泡（能说的时候），另一只回个表情：不会两个气泡叠在一起
    return walkTo(a, spot, (me) => {
      me.right = b.x > me.x
      bubbles.auto(me, rule.aLine, PAIR_MS)
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
    const spot = random() < START_FIRE_CHANCE ? nearFire(a) || randomGrass(a) : randomGrass(a) || nearFire(a)
    if (spot) walk.put(a, spot.x, spot.y)
  }

  // 从营地边上走进来（from 没给就是树林边的入口），走到锅边吃一口：闻着 foodId 来的说闻着什么，别的打个招呼
  function walkIn(a, from, foodId) {
    const [ex, ey] = from ? [from.x, from.y] : pick(SCENE.entries)
    walk.put(a, ex, ey)
    if (!foodId) bubbles.event(a, a.pet.lines.hello, HELLO_MS)
    const spot = nearFire(a) || { x: SCENE.fire[0], y: SCENE.fire[1] + 420, action: 'idle' }
    const then = (b) => {
      facePot(b)
      if (foodId) bubbles.event(b, sniffLine(b.id, foodId, random), SNIFF_MS)
      doFor(b, 'eat', EAT_MS, '')
    }
    a.goal = { spot, then, path: walk.route({ x: a.x, y: a.y }, spot) || [spot] }
  }

  // 站在装饰上的点（窝、秋千）的那件装饰：回来时接着在上面，排前后按那件装饰
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
  // 正好走到锅后面（路过可以、停不行的地方）也站回去，下一回合先走出来（turn 里），不然回来就瞬移到火边。
  // 在帐篷里睡的：没睡完接着睡在里面，睡完了站在门口
  function restore(a, s) {
    if (!s || !Number.isFinite(s.x) || !Number.isFinite(s.y)) return false
    // 床位在帐篷的禁区里（不算草地），先认它
    if (s.action === 'tent') {
      const bed = bedAt(s.x, s.y)
      if (!bed) return false
      a.right = bed.right
      if (s.until > now() && animals.filter((b) => asleep(b)).length < napCap()) {
        walk.put(a, bed.at[0], bed.at[1])
        a.goal = { spot: { x: bed.door[0], y: bed.door[1], action: 'tent', bed } }
        a.action = 'tent'
        a.until = s.until
        a.depthY = bedDepth(bed)
      } else {
        walk.put(a, bed.door[0], bed.door[1])
        a.dir = 'front'
      }
      return true
    }
    if (!inGrass(s.x, s.y)) return false
    const spot = decorSpotAt(s.x, s.y)
    if (!spot && inDecorFoot(s.x, s.y)) return false
    walk.put(a, s.x, s.y)
    a.right = s.right !== false
    a.sleepStyle = s.sleepStyle === 'B' ? 'B' : 'A'
    if (spot) a.goal = { spot }
    if (s.action === 'sleep' && s.until > now() && animals.filter((b) => asleep(b)).length < napCap()) {
      a.action = 'sleep'
      a.until = s.until
    }
    return true
  }

  const memory = saved || {}
  animals.forEach((a) => {
    if (away(a)) return settle(a)
    // 锅空着、没住下的常客：已经回去了，进来时就不在
    if (leaving(a)) {
      a.hidden = true
      a.action = 'away'
      a.why = 'hungry'
      return
    }
    // 上次离开时还在外面排队（闻着香味还没到）：接着排，到点从边上进来
    const s = memory[a.id]
    if (s && s.hidden && s.why === 'smell') {
      a.hidden = true
      a.action = 'away'
      a.why = 'smell'
      a.foodId = s.foodId || ''
      a.backAt = s.backAt || 0
      return
    }
    if (restore(a, memory[a.id])) return
    settle(a)
  })

  function stateOf(a) {
    const spot = a.goal && a.goal.spot
    return { action: a.hidden && a.why === 'hungry' ? 'hungry' : a.action, decorName: spot && spot.name ? spot.name : '', spot: spot && spot.name && !a.goal.path ? spot.action : '' }
  }

  const api = {
    sprites: () => animals.map(sprite),

    start() {
      running = true
      animals.forEach((a) => {
        // 叼着礼物的：接着走，或者已经到了就举着
        if (a.holdGift) {
          if (a.goal && a.goal.path && a.goal.path.length) return stepAlongGift(a)
          if (a.goal && a.goal.then && a.action !== 'gift') {
            walk.land(a)
            return a.goal.then(a)
          }
          return
        }
        // 暂停时正在走：路没走完接着走；走完了（path 空）下一回合由 turn 收尾
        if (a.goal && a.goal.path && a.goal.path.length) return stepAlong(a)
        schedule(a, between(START_MS))
      })
      scheduleChat()
    },

    pause() {
      running = false
      clock.clear(chatTimer)
      chatTimer = null
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
      clock.clear(chatTimer)
      chatTimer = null
      bubbles.stop()
      animals.forEach((a) => {
        ;[a.timer, a.tapTimer].forEach((h) => clock.clear(h))
        a.timer = a.tapTimer = null
      })
    },

    updateDecor(next) {
      placed = next
      lamps = lampsOf(placed)
      walk.update(placed)
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

    // 点一下：睡着的醒过来（帐篷里的出来）；住户说一段（两三句，一句一句换）。
    // 正说着再点：直接跳到下一句；说完了再点：换一段。别的气泡收起来。都冒个爱心
    tap(i) {
      const a = animals[i]
      if (!a || a.hidden) return
      heart(a)
      if (SLEEPS.indexOf(a.action) !== -1 && !a.holdGift) return wake(a, true)
      if (bubbles.next(a)) return
      const ms = bubbles.take(a, speechOf(a))
      // 站着的听你说话：说完前先别走开
      if (a.action === 'idle' && !(a.goal && a.goal.path) && !a.next && running) schedule(a, ms + 400)
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
      bubbles.take(a, liked ? a.pet.lines.fed : a.pet.lines.dislike)
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
      const awake = animals.filter((a) => !a.hidden && !a.holdGift && !asleep(a))
      if (!awake.length) return { ok: false, reason: 'asleep' }
      const ref = all[0]
      const using = (a) => a.goal && a.goal.spot && a.goal.spot.uid === uid
      // 先叫闲着的（没在往别的家具那儿去、没在玩别的家具），再按远近
      const busyElse = (a) => (a.goal && a.goal.spot && a.goal.spot.uid ? 1 : 0)
      const near = awake.filter((a) => !using(a)).sort((p, q) => busyElse(p) - busyElse(q) || dist(p.x, p.y, ref.x, ref.y) - dist(q.x, q.y, ref.x, ref.y))
      let busy = true
      for (const a of near) {
        const spots = free(all, a)
        if (!spots.length) continue
        busy = false
        const spot = spots[0]
        a.until = 0
        a.goal = null
        a.next = null
        if (!useSpot(a, spot)) continue
        bubbles.take(a, CALL_LINES[spot.action] || '来啦')
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
      if (leaveTentThen(a, () => api.gift(i))) return true
      a.holdGift = true
      a.goal = null
      const spot = { x: SCENE.fire[0], y: SCENE.fire[1] + 420, action: 'gift' }
      a.goal = { spot, then: (b) => { b.action = 'gift'; b.emoji = '🎁'; emit(b) }, path: walk.route({ x: a.x, y: a.y }, spot) || [spot] }
      stepAlongGift(a)
      return true
    },

    giftTaken() {
      animals.forEach((a) => {
        if (!a.holdGift) return
        a.holdGift = false
        bubbles.take(a, '给你的！')
        rest(a)
      })
    },

    // 锅空着、回去了（或者正要走）的常客名字：页面上提示「放点它们爱吃的就回来」
    hungryAway() {
      if (!hungry()) return []
      return animals.filter((a) => (a.hidden && a.why === 'hungry') || leaving(a)).map((a) => a.pet.name)
    },

    // 谁在哪、在干什么（「找它」、礼物用）
    whereIs() {
      return animals.map((a) => ({ index: a.index, id: a.id, name: a.pet.name, home: !!a.home, face: petFace(a.id), x: a.x, y: a.y, action: a.action, text: describe(stateOf(a)) }))
    },

    focus(i) {
      const a = animals[i]
      if (!a) return null
      heart(a)
      emit(a)
      return { x: a.x, y: a.y }
    },

    // 下锅了：在场、爱吃的（ids）走到锅边吃一会儿；睡着的也醒过来去吃。谁从外面来由云函数说（addGuest）
    cook(ids) {
      // 只有第一只说「好吃」（不会一下子冒一排气泡）
      let first = true
      animals.forEach((a) => {
        if (a.hidden || a.holdGift || (ids || []).indexOf(a.id) === -1) return
        a.until = 0
        a.goal = null
        eatAtPot(a, POT_EAT_MS, first ? a.pet.lines.fed : '')
        first = false
      })
    },

    // 闻着香味来了一只（第一次来的、或者回去了又回来的常客）：排队从屏幕边上进来；已经在场的不动；返回它的序号
    addGuest(v) {
      const pet = v && petById(v.id)
      if (!pet) return -1
      let a = animals.find((o) => o.id === pet.id)
      if (a && !a.hidden) return a.index
      if (!a) {
        a = makeAnimal(pet, 1, animals.length, false)
        animals.push(a)
      }
      if (away(a)) settle(a)
      else {
        // 香味飘出去要一会儿：排在队尾，到点从屏幕边上进来
        a.hidden = true
        a.action = 'away'
        a.why = 'smell'
        a.foodId = v.foodId || ''
        a.goal = null
        a.backAt = Math.max(now() + between(BACK_FIRST_MS), nextBack)
        nextBack = a.backAt + between(BACK_GAP_MS)
      }
      emit(a)
      if (running) schedule(a, between(START_MS))
      return a.index
    },

    // 离开营地（切 tab）前：走到一半的就地停下（按出发时间算出这会儿走到哪儿、不带过渡挪过去、站着），
    // 不然屏幕上那段走路的过渡还没走完、记下的又是终点，回来时它们会不迈腿地一路滑过去（10/29 用户：切回营地全都在漂移）
    freeze() {
      animals.forEach((a) => {
        if (a.hidden || !walk.halt(a)) return
        a.next = null
        if (a.goal && a.goal.path) a.goal = null
        if (['walk', 'fly', 'gift'].indexOf(a.action) !== -1) a.action = 'idle'
        if (a.holdGift && a.action === 'idle') a.action = 'gift'
        emit(a)
      })
    },

    // 离开营地时记下各自在哪（先 freeze，走到一半的就是停下的地方）、朝哪边、睡没睡（睡到几点）
    snapshot() {
      const out = {}
      animals.forEach((a) => {
        if (a.hidden) {
          if (a.why === 'smell') out[a.id] = { hidden: true, why: 'smell', foodId: a.foodId || '', backAt: a.backAt || 0 }
          return
        }
        const sleeping = SLEEPS.indexOf(a.action) !== -1 && !a.holdGift
        out[a.id] = { x: a.x, y: a.y, right: a.right, action: sleeping ? a.action : 'idle', until: sleeping ? a.until : 0, sleepStyle: a.sleepStyle }
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
  return api

  // 叼礼物走路：和普通走路一样，但 holdGift 期间 turn 不接管，所以自己串
  function stepAlongGift(a) {
    const ms = walk.step(a, a.goal.path)
    a.action = 'gift'
    a.emoji = '🎁'
    emit(a)
    clock.clear(a.timer)
    a.timer = clock.set(() => (a.goal.path.length ? stepAlongGift(a) : (walk.land(a), a.goal.then(a))), ms)
  }
}

module.exports = { createLife, PET_ZOOM }
