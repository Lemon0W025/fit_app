// 花园小动物：每只的脾气、台词，能一起玩的物件，一天的作息，会做的小事，以及「下一步做什么」的纯函数（随机数由调用方传入）

const { itemById, placedOrder } = require('./shared/garden')

const PLAY_CHANCE = 0.3
const PLAY_RANGE = 6
const HOME_RANGE = 2
const PLAY_COOLDOWN_MS = 60000
const TRICK_CHANCE = 0.1
const TRICK_RANGE = 14
const TRICK_COOLDOWN_MS = 180000
const WANDER_RANGE = 12
const PATH_CAP = 40
const SLEEP_LINE = '呼噜…再睡五分钟'

// 步态：pad 四条腿踱步 / waddle 摇摇摆摆 / hop 蹦 / crawl 爬 / stride 迈大步 / fly 飞 / flutter 扑棱（后两种给会飞的）
const GAITS = ['pad', 'waddle', 'hop', 'crawl', 'stride', 'fly', 'flutter']

// scale：相对格子宽度；stepMs：走一格多久；pauseMs：停多久再走；sleepy：每次停下时打盹的概率；gait：走路的样子，页面按它挂不同的动画
// faces：图里的动物朝哪边（left / right / front），决定往哪边走时要不要镜像
// top：图里动物头顶上面空着的比例（按 images/garden/items 里的图量的，换图要重量），用来定水面和气泡的高度
const ANIMAL_INFO = {
  chick: {
    scale: 0.5, stepMs: 800, pauseMs: [1500, 3500], sleepy: 0.03, faces: 'right', top: 0.03, gait: 'waddle',
    likesText: '喜欢：青草丛', arrive: '小黄鸡跟着青草香，蹦蹦跳跳搬进花园啦！', hello: '叽叽！我是小黄鸡，以后就住这儿啦！',
    lines: ['叽叽！早饭吃了没？', '多喝温水，叽！', '今天也要好好吃饭哦', '跟我一起蹦一蹦，活动活动！'],
  },
  rabbit: {
    scale: 0.55, stepMs: 800, pauseMs: [1500, 4000], sleepy: 0.08, faces: 'front', top: 0.03, gait: 'hop',
    likesText: '喜欢：白萝卜', arrive: '小白兔闻到萝卜香，搬进花园啦！', hello: '我是小白兔，以后就住这儿啦！',
    lines: ['蔬菜要多吃，眼睛亮亮的～', '慢慢吃，别噎着', '今天的菜绿不绿？', '蹦跶蹦跶，吃完饭走一走'],
  },
  duck: {
    scale: 0.5, stepMs: 1200, pauseMs: [2000, 4500], sleepy: 0.03, faces: 'right', top: 0.03, gait: 'waddle',
    likesText: '喜欢：锦鲤池', arrive: '小黄鸭看见锦鲤池，摇摇摆摆搬进花园啦！', hello: '嘎嘎！我是小黄鸭，以后就住这儿啦！',
    lines: ['嘎嘎！喝水了吗？', '天凉了，多穿件衣服', '晚饭清淡一点，嘎', '摇摇摆摆，散散步'],
  },
  turtle: {
    scale: 0.5, stepMs: 2600, pauseMs: [3000, 6000], sleepy: 0.08, faces: 'right', top: 0.27, gait: 'crawl',
    likesText: '喜欢：鹅卵石', arrive: '小乌龟慢慢爬到鹅卵石边上，搬进花园啦！', hello: '我…是…小乌龟，以后…就住这儿啦！',
    lines: ['慢慢来，吃饭也要细嚼慢咽', '不急不急，坚持最重要', '早点睡，身体好', '我爬得慢，可我从不偷懒'],
  },
  tabby_cat: {
    scale: 0.6, stepMs: 1300, pauseMs: [2500, 5000], sleepy: 0.2, faces: 'front', top: 0.03, gait: 'pad',
    likesText: '喜欢：小板凳', arrive: '小花猫相中了小板凳，搬进花园啦！', hello: '喵～我是小花猫，以后就住这儿啦！',
    lines: ['喵～今天吃得好吗？', '饭后别马上躺下哦', '喵，摸摸头', '水果当加餐，比零食好喵'],
  },
  ginger_cat: {
    scale: 0.7, stepMs: 2000, pauseMs: [6000, 12000], sleepy: 0.5, faces: 'left', top: 0.39, gait: 'pad',
    likesText: '喜欢：茶桌', arrive: '胖橘猫闻着茶香，慢悠悠搬进花园啦！', hello: '喵…我是胖橘猫，以后就在这儿晒太阳啦',
    lines: ['晒太阳好舒服，饭后也出来走走吧', '我胖，你可别学我', '喵…七分饱刚刚好', '少吃点甜的喵'],
  },
  panda: {
    scale: 0.8, stepMs: 1800, pauseMs: [3000, 6000], sleepy: 0.1, faces: 'front', top: 0.03, gait: 'pad',
    likesText: '喜欢：翠竹', arrive: '大熊猫闻着竹子香，搬进花园啦！', hello: '我是大熊猫，以后就住这儿啦！',
    lines: ['竹子要慢慢嚼，吃饭也一样～', '多吃蔬菜，像我一样', '吃饱了，打个滚', '今天也要开开心心的'],
  },
  crane: {
    scale: 0.8, stepMs: 2000, pauseMs: [3000, 6000], sleepy: 0, faces: 'right', top: 0.03, gait: 'stride',
    likesText: '喜欢：荷花池', arrive: '仙鹤看中了荷花池，翩翩飞进花园啦！', hello: '我是仙鹤，以后就住这儿啦',
    lines: ['站直一点，腰背会舒服', '早睡早起，精神好', '心平气和，福寿安康', '饭后百步走'],
  },
  panda_family: {
    scale: 1.1, stepMs: 2200, pauseMs: [4000, 8000], sleepy: 0.1, faces: 'front', top: 0.22, gait: 'pad',
    likesText: '喜欢：大熊猫 + 3 丛翠竹', arrive: '竹林长大了，熊猫一家都搬进花园啦！', hello: '我们是熊猫一家，以后就住这儿啦！',
    lines: ['一家人一起吃饭最香', '宝宝也要好好吃饭哦', '一起散步去～', '团团圆圆，平平安安'],
  },
}

// 能一起玩的物件。at：beside 站到旁边的空格；on 到物件上面，spot 是落脚点在物件图里的位置（x 从左、y 从下，按图宽的比例）
const POND = ['duck', 'turtle', 'crane']
const CATS = ['tabby_cat', 'ginger_cat']
const PLAYS = {
  bamboo: { action: 'eat', animals: ['panda', 'panda_family'], at: 'beside', emoji: '🎋', line: '嚼嚼…别抢我竹子～' },
  radish: { action: 'eat', animals: ['rabbit'], at: 'beside', emoji: '🥕', line: '咔嚓咔嚓，萝卜真甜' },
  cabbage: { action: 'eat', animals: ['rabbit'], at: 'beside', emoji: '🥬', line: '白菜嫩嫩的，你也多吃菜' },
  grass: { action: 'peck', animals: ['chick'], at: 'beside', emoji: '🌾', line: '啄啄，找到一粒小米！' },
  goji_tray: { action: 'peck', animals: ['chick'], at: 'beside', emoji: '🍒', line: '枸杞红枣，补气血！' },
  koi_pond: { action: 'swim', animals: POND, at: 'on', spot: { x: 0.5, y: 0.22 }, emoji: '💧', line: '水里凉快～' },
  lotus_pond: { action: 'swim', animals: POND, at: 'on', spot: { x: 0.5, y: 0.22 }, emoji: '💧', line: '荷花真香' },
  zigzag_bridge: { action: 'swim', animals: POND, at: 'on', spot: { x: 0.35, y: 0.3 }, emoji: '💧', line: '在荷塘里游一圈' },
  stool: { action: 'perch', animals: CATS, at: 'on', spot: { x: 0.5, y: 0.62 }, emoji: '💤', line: SLEEP_LINE },
  tea_table: { action: 'perch', animals: CATS, at: 'on', spot: { x: 0.45, y: 0.55 }, emoji: '💤', line: '桌上暖和，眯一会儿' },
  stone_table: { action: 'perch', animals: CATS, at: 'on', spot: { x: 0.5, y: 0.6 }, emoji: '💤', line: '石桌凉凉的，舒服' },
  swing_tree: { action: 'swing', animals: ['panda'].concat(CATS), at: 'on', spot: { x: 0.66, y: 0.2 }, emoji: '🎵', line: '荡呀荡～真开心' },
  pebbles: { action: 'bask', animals: ['turtle'], at: 'on', spot: { x: 0.5, y: 0.4 }, emoji: '☀️', line: '晒晒背，暖洋洋' },
  sweet_potato_stove: { action: 'warm', animals: 'all', at: 'beside', emoji: '♨️', line: '烤红薯真香，暖暖的' },
}
// 「找它」列表里玩的时候怎么说
const PLAY_DOING = { eat: '吃东西', peck: '啄米', swim: '玩水', perch: '打盹', swing: '荡秋千', bask: '晒太阳', warm: '烤火' }

// 会下水的
const SWIMMERS = POND
// 晚上回哪儿睡：壳里的活动点 id（见 shared/estate.js 的 SPOTS）；院子没修就在正院找块地
const SLEEP_SPOTS = {
  chick: 'coop', rabbit: 'coop',
  duck: 'pond_water', turtle: 'pond_water', crane: 'pond_water',
  tabby_cat: 'eaves', ginger_cat: 'eaves',
  panda: 'rockery', panda_family: 'rockery',
}
// 早上往这些院子凑
const MORNING_AREAS = ['front', 'main']

// 一天的时段：morning 6～9 往前院正院凑、noon 11～14 爱打盹、night 19 点后回窝睡、其他 day
function periodOf(hour) {
  if (hour >= 19 || hour < 6) return 'night'
  if (hour < 9) return 'morning'
  if (hour >= 11 && hour < 14) return 'noon'
  return 'day'
}

// 小事：spot 是壳里的活动点 id（null 就在原地做）；action 默认 trick，soak 是泡在水里；doing 给「找它」列表用
const TRICKS = [
  { id: 'mirror', animals: ['tabby_cat'], spot: 'well', emoji: '✨', doing: '照镜子', line: '井里有只猫在看我，喵' },
  { id: 'chase', animals: ['tabby_cat'], spot: 'flower_path', emoji: '🦋', doing: '追蝴蝶', line: '抓到了…咦，飞走了' },
  { id: 'belly', animals: ['tabby_cat'], spot: 'steps', emoji: '☀️', doing: '晒肚皮', line: '太阳晒肚皮，舒服～' },
  { id: 'soak_cat', animals: ['ginger_cat'], spot: 'hotspring', action: 'soak', emoji: '♨️', doing: '泡温泉', line: '呼…泡得我直打哈欠' },
  { id: 'sniff_tea', animals: ['ginger_cat'], spot: 'tea_deck', emoji: '🍵', doing: '闻茶香', line: '这茶…香的喵' },
  { id: 'tail', animals: ['ginger_cat'], spot: null, emoji: '🌀', doing: '追自己的尾巴', line: '转…转…抓不到' },
  { id: 'roll', animals: ['panda'], spot: 'rockery', emoji: '🎋', doing: '抱着竹子打滚', line: '咕噜咕噜～' },
  { id: 'soak_panda', animals: ['panda'], spot: 'hotspring', action: 'soak', emoji: '♨️', doing: '泡温泉', line: '热乎乎，毛都蓬了' },
  { id: 'hang', animals: ['panda'], spot: 'rockery', emoji: '🙃', doing: '倒挂在假山上', line: '倒过来看世界～' },
  { id: 'queue', animals: ['panda_family'], spot: 'bridge', emoji: '🐾', doing: '排队过桥', line: '一个跟一个，别掉队' },
  { id: 'piggyback', animals: ['panda_family'], spot: null, emoji: '💕', doing: '宝宝爬到背上', line: '宝宝抱紧啦' },
  { id: 'scratch', animals: ['chick'], spot: 'veg_bed', emoji: '🐛', doing: '刨土找虫', line: '刨刨刨，有虫子！' },
  { id: 'hay', animals: ['chick'], spot: 'haystack', emoji: '🌾', doing: '钻草垛', line: '草垛里暖和' },
  { id: 'steal', animals: ['rabbit'], spot: 'veg_bed', emoji: '🥬', doing: '偷吃一口菜', line: '就吃一口…被发现了？' },
  { id: 'nest', animals: ['rabbit'], spot: 'coop', emoji: '💤', doing: '钻草窝', line: '窝里软软的' },
  { id: 'stand', animals: ['rabbit'], spot: null, emoji: '👀', doing: '站起来张望', line: '那边有什么好吃的？' },
  { id: 'stones', animals: ['duck'], spot: 'pond_water', action: 'soak', emoji: '💧', doing: '排队过汀步石', line: '嘎嘎，一步一步来' },
  { id: 'dive', animals: ['duck'], spot: 'pond_water', action: 'soak', emoji: '🐟', doing: '倒栽葱找鱼', line: '屁股朝天找鱼鱼' },
  { id: 'shower', animals: ['duck'], spot: 'falls', action: 'soak', emoji: '🚿', doing: '在瀑布下冲澡', line: '哗啦啦，凉快！' },
  { id: 'flip_over', animals: ['turtle'], spot: null, emoji: '🙃', doing: '翻过来蹬腿', line: '翻…翻过来了' },
  { id: 'hide', animals: ['turtle'], spot: null, emoji: '🐢', doing: '缩进壳里', line: '我不在…' },
  { id: 'one_leg', animals: ['crane'], spot: 'pond_water', action: 'soak', emoji: '🦩', doing: '单脚站着发呆', line: '站着站着就入定了' },
  { id: 'wings', animals: ['crane'], spot: 'falls', action: 'soak', emoji: '🪽', doing: '展翅', line: '舒展一下' },
  { id: 'preen', animals: ['crane'], spot: null, emoji: '✨', doing: '梳羽毛', line: '羽毛要理整齐' },
]

const key = (t) => `${t.c},${t.r}`
const dist = (a, b) => Math.abs(a.c - b.c) + Math.abs(a.r - b.r)
// size 可以是正方形的边长，也可以是 { cols, rows }
const inside = (t, size) => {
  const cols = size.cols || size
  const rows = size.rows || size
  return t.c >= 0 && t.r >= 0 && t.c < cols && t.r < rows
}
const neighbors = (t) => [{ c: t.c + 1, r: t.r }, { c: t.c - 1, r: t.r }, { c: t.c, r: t.r + 1 }, { c: t.c, r: t.r - 1 }]

function pickOne(list, rand) {
  return list[Math.min(list.length - 1, Math.floor(rand() * list.length))]
}

// 相邻的空格（blocked：有物件或别的动物的格子）
function freeNeighbors(t, size, blocked) {
  return neighbors(t).filter((n) => inside(n, size) && !blocked.has(key(n)))
}

// 家：最早摆进花园的那件它喜欢的东西
function homeOf(animalId, placed) {
  const animal = itemById(animalId)
  if (!animal || !animal.likes) return null
  const liked = placed
    .filter((p) => animal.likes.indexOf(p.itemId) !== -1)
    .sort((a, b) => placedOrder(a.uid) - placedOrder(b.uid))
  return liked.length ? { c: liked[0].c, r: liked[0].r } : null
}

// 下一步走哪格：有家就在家附近转（离远了往回走），没家随便逛；allow 限制只走某些格子；被围住返回 null
function chooseStep(pos, { size, blocked, home, allow }, rand) {
  let options = freeNeighbors(pos, size, blocked)
  if (allow) options = options.filter(allow)
  if (!options.length) return null
  if (home) {
    const near = options.filter((n) => dist(n, home) <= HOME_RANGE || dist(n, home) < dist(pos, home))
    if (near.length) return pickOne(near, rand)
  }
  return pickOne(options, rand)
}

// 最短路线（不含起点）；目标格本身可以被占（比如要到物件上面）；走不到返回 null
function pathTo(from, to, size, blocked) {
  if (from.c === to.c && from.r === to.r) return []
  const prev = new Map([[key(from), null]])
  const queue = [from]
  while (queue.length) {
    const cur = queue.shift()
    for (const n of neighbors(cur)) {
      const k = key(n)
      if (!inside(n, size) || prev.has(k)) continue
      const isTarget = n.c === to.c && n.r === to.r
      if (!isTarget && blocked.has(k)) continue
      prev.set(k, cur)
      if (isTarget) {
        const path = []
        for (let p = n; p && key(p) !== key(from); p = prev.get(key(p))) path.unshift({ c: p.c, r: p.r })
        return path
      }
      queue.push(n)
    }
  }
  return null
}

function canPlay(animalId, itemId) {
  const play = PLAYS[itemId]
  return !!play && (play.animals === 'all' || play.animals.indexOf(animalId) !== -1)
}

// 找一件附近能玩的物件，选走过去最近的；ctx：size、blocked、placed、busy（别的动物正玩着的 uid）、cooldown（uid → 时刻）、now、chance（概率，默认 PLAY_CHANCE）
function choosePlay(animalId, pos, ctx, rand) {
  if (rand() >= (ctx.chance == null ? PLAY_CHANCE : ctx.chance)) return null
  const options = []
  ctx.placed.forEach((p) => {
    if (!canPlay(animalId, p.itemId) || ctx.busy.has(p.uid) || (ctx.cooldown[p.uid] || 0) > ctx.now) return
    if (dist(pos, p) > PLAY_RANGE) return
    const play = PLAYS[p.itemId]
    let target = { c: p.c, r: p.r }
    if (play.at === 'beside') {
      const spots = neighbors(p).filter((n) => inside(n, ctx.size) && (!ctx.blocked.has(key(n)) || (n.c === pos.c && n.r === pos.r)))
      if (!spots.length) return
      target = spots.sort((a, b) => dist(a, pos) - dist(b, pos))[0]
    }
    const path = pathTo(pos, target, ctx.size, ctx.blocked)
    if (path) options.push({ uid: p.uid, itemId: p.itemId, play, item: { c: p.c, r: p.r }, target, path })
  })
  if (!options.length) return null
  return options.sort((a, b) => a.path.length - b.path.length)[0]
}

// 挑一件小事：有活动点的要院子修好了（在 ctx.spots 里）、没被别的动物占着、走得到；没活动点的原地做
// ctx：spots、blocked、size、busy（别的动物正用着的活动点 id）、cooldown（'动物:小事' → 时刻）、now
function chooseTrick(animalId, pos, ctx, rand) {
  if (rand() >= TRICK_CHANCE) return null
  const ready = []
  TRICKS.forEach((trick) => {
    if (trick.animals.indexOf(animalId) === -1 || (ctx.cooldown[`${animalId}:${trick.id}`] || 0) > ctx.now) return
    if (!trick.spot) return ready.push({ trick, target: { c: pos.c, r: pos.r }, path: [] })
    const spot = ctx.spots.find((s) => s.id === trick.spot)
    if (!spot || ctx.busy.has(spot.id)) return
    const target = { c: spot.c, r: spot.r }
    const path = pathTo(pos, target, ctx.size, ctx.blocked)
    if (path && path.length <= TRICK_RANGE) ready.push({ trick, target, path })
  })
  if (!ready.length) return null
  return pickOne(ready, rand)
}

function reachable(from, candidates, ctx, cap) {
  for (const t of candidates) {
    const path = pathTo(from, t, ctx.size, ctx.blocked)
    if (path && path.length <= cap) return { target: t, path }
  }
  return null
}

// 晚上回窝：自己的睡觉点（被占了就睡旁边）；没有就去正院最近的空格；都不行返回 null（原地睡）
function sleepTarget(animalId, pos, ctx) {
  const spot = ctx.spots.find((s) => s.id === SLEEP_SPOTS[animalId])
  if (spot) {
    if (pos.c === spot.c && pos.r === spot.r) return { target: { c: spot.c, r: spot.r }, path: [] }
    const candidates = [{ c: spot.c, r: spot.r }].concat(neighbors(spot)).filter((t) => inside(t, ctx.size) && !ctx.blocked.has(key(t)))
    const found = reachable(pos, candidates, ctx, PATH_CAP)
    if (found) return found
  }
  if (ctx.areaOf(pos.c, pos.r) === 'main') return { target: { c: pos.c, r: pos.r }, path: [] }
  const main = ctx.free.filter((t) => ctx.areaOf(t.c, t.r) === 'main').sort((a, b) => dist(a, pos) - dist(b, pos)).slice(0, 6)
  return reachable(pos, main, ctx, PATH_CAP)
}

// 早上往前院、正院凑：最近的能走到的空格；已经在那儿返回 null
function gatherTarget(pos, ctx) {
  if (MORNING_AREAS.indexOf(ctx.areaOf(pos.c, pos.r)) !== -1) return null
  const near = ctx.free.filter((t) => MORNING_AREAS.indexOf(ctx.areaOf(t.c, t.r)) !== -1).sort((a, b) => dist(a, pos) - dist(b, pos)).slice(0, 6)
  return reachable(pos, near, ctx, PATH_CAP)
}

// 出去逛逛：随便挑一个不远不近的空格（会穿过月亮门到别的院子），试几次走不到就算了
function wanderTarget(pos, ctx, rand) {
  const far = ctx.free.filter((t) => dist(t, pos) >= 3 && dist(t, pos) <= WANDER_RANGE)
  for (let i = 0; i < 4 && far.length; i++) {
    const t = pickOne(far, rand)
    const path = pathTo(pos, t, ctx.size, ctx.blocked)
    if (path && path.length <= PATH_CAP) return { target: t, path }
  }
  return null
}

// 平时溜达：一次走 2～4 格的小段路再歇（比一格一停自然）；有家且离得远就往家那边走；allow 限制范围
function strollTarget(pos, { size, blocked, free, home, allow }, rand) {
  let pool = free.filter((t) => dist(t, pos) >= 2 && dist(t, pos) <= 4)
  if (allow) pool = pool.filter(allow)
  if (home && dist(pos, home) > HOME_RANGE) {
    const closer = pool.filter((t) => dist(t, home) < dist(pos, home))
    if (closer.length) pool = closer
  }
  for (let i = 0; i < 4 && pool.length; i++) {
    const t = pickOne(pool, rand)
    const path = pathTo(pos, t, size, blocked)
    if (path && path.length <= 4 && (!allow || path.every(allow))) return { target: t, path }
    pool = pool.filter((x) => x !== t)
  }
  return null
}

// 屏幕上往右走 c−r 变大；图朝右的往左走要镜像，朝左的往右走要镜像，正面的往左走镜像
function flipFor(faces, from, to, current) {
  const dx = (to.c - to.r) - (from.c - from.r)
  if (dx === 0) return current
  return faces === 'left' ? dx > 0 : dx < 0
}

// state：{ action, play, trick }，play 是 choosePlay 的结果，trick 是 TRICKS 里的一项
function lineFor(animalId, state, rand) {
  if (state.play && state.action === state.play.play.action) return state.play.play.line
  if (state.trick && (state.action === 'trick' || state.action === 'soak')) return state.trick.line
  if (state.action === 'sleep') return SLEEP_LINE
  return pickOne(ANIMAL_INFO[animalId].lines, rand)
}

// 「找它」列表里的一句话：在哪、在干嘛
function describe(state, areaName, toAreaName) {
  const at = areaName ? `在${areaName}` : ''
  if (state.action === 'sleep') return `${at}睡觉`
  if (state.trick && (state.action === 'trick' || state.action === 'soak')) return `${at}${state.trick.doing}`
  if (state.play && state.action === state.play.play.action) return `${at}${PLAY_DOING[state.action] || '玩'}`
  if (state.action === 'walk') return `正往${toAreaName || '那边'}走`
  return `${at}溜达`
}

module.exports = {
  ANIMAL_INFO,
  PLAYS,
  TRICKS,
  SWIMMERS,
  SLEEP_SPOTS,
  MORNING_AREAS,
  PLAY_CHANCE,
  PLAY_RANGE,
  HOME_RANGE,
  PLAY_COOLDOWN_MS,
  TRICK_CHANCE,
  TRICK_RANGE,
  TRICK_COOLDOWN_MS,
  SLEEP_LINE,
  GAITS,
  periodOf,
  freeNeighbors,
  homeOf,
  chooseStep,
  pathTo,
  choosePlay,
  chooseTrick,
  sleepTarget,
  gatherTarget,
  wanderTarget,
  strollTarget,
  flipFor,
  lineFor,
  describe,
}
