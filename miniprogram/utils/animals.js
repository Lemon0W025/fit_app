// 庭院小动物：每只的脾气、台词，能一起玩的物件，以及「下一步做什么」的纯函数（随机数由调用方传入）

const { itemById, placedOrder } = require('./shared/garden')

const PLAY_CHANCE = 0.3
const PLAY_RANGE = 3
const HOME_RANGE = 2
const PLAY_COOLDOWN_MS = 60000
const SLEEP_LINE = '呼噜…再睡五分钟'

// scale：相对格子宽度；stepMs：走一格多久；pauseMs：停多久再走；sleepy：每次停下时打盹的概率
// faces：图里的动物朝哪边（left / right / front），决定往哪边走时要不要镜像
// top：图里动物头顶上面空着的比例（按 images/garden/items 里的图量的，换图要重量），用来定水面和气泡的高度
const ANIMAL_INFO = {
  chick: {
    scale: 0.5, stepMs: 800, pauseMs: [1500, 3500], sleepy: 0.03, faces: 'right', top: 0.03,
    likesText: '喜欢：青草丛', arrive: '小黄鸡跟着青草香，蹦蹦跳跳搬进庭院啦！', hello: '叽叽！我是小黄鸡，以后就住这儿啦！',
    lines: ['叽叽！早饭吃了没？', '多喝温水，叽！', '今天也要好好吃饭哦', '跟我一起蹦一蹦，活动活动！'],
  },
  rabbit: {
    scale: 0.55, stepMs: 800, pauseMs: [1500, 4000], sleepy: 0.08, faces: 'front', top: 0.03,
    likesText: '喜欢：白萝卜', arrive: '小白兔闻到萝卜香，搬进庭院啦！', hello: '我是小白兔，以后就住这儿啦！',
    lines: ['蔬菜要多吃，眼睛亮亮的～', '慢慢吃，别噎着', '今天的菜绿不绿？', '蹦跶蹦跶，吃完饭走一走'],
  },
  duck: {
    scale: 0.5, stepMs: 1200, pauseMs: [2000, 4500], sleepy: 0.03, faces: 'right', top: 0.03,
    likesText: '喜欢：锦鲤池', arrive: '小黄鸭看见锦鲤池，摇摇摆摆搬进庭院啦！', hello: '嘎嘎！我是小黄鸭，以后就住这儿啦！',
    lines: ['嘎嘎！喝水了吗？', '天凉了，多穿件衣服', '晚饭清淡一点，嘎', '摇摇摆摆，散散步'],
  },
  turtle: {
    scale: 0.5, stepMs: 2600, pauseMs: [3000, 6000], sleepy: 0.08, faces: 'right', top: 0.27,
    likesText: '喜欢：鹅卵石', arrive: '小乌龟慢慢爬到鹅卵石边上，搬进庭院啦！', hello: '我…是…小乌龟，以后…就住这儿啦！',
    lines: ['慢慢来，吃饭也要细嚼慢咽', '不急不急，坚持最重要', '早点睡，身体好', '我爬得慢，可我从不偷懒'],
  },
  tabby_cat: {
    scale: 0.6, stepMs: 1300, pauseMs: [2500, 5000], sleepy: 0.2, faces: 'front', top: 0.03,
    likesText: '喜欢：小板凳', arrive: '小花猫相中了小板凳，搬进庭院啦！', hello: '喵～我是小花猫，以后就住这儿啦！',
    lines: ['喵～今天吃得好吗？', '饭后别马上躺下哦', '喵，摸摸头', '水果当加餐，比零食好喵'],
  },
  ginger_cat: {
    scale: 0.7, stepMs: 2000, pauseMs: [6000, 12000], sleepy: 0.5, faces: 'left', top: 0.39,
    likesText: '喜欢：茶桌', arrive: '胖橘猫闻着茶香，慢悠悠搬进庭院啦！', hello: '喵…我是胖橘猫，以后就在这儿晒太阳啦',
    lines: ['晒太阳好舒服，饭后也出来走走吧', '我胖，你可别学我', '喵…七分饱刚刚好', '少吃点甜的喵'],
  },
  panda: {
    scale: 0.8, stepMs: 1800, pauseMs: [3000, 6000], sleepy: 0.1, faces: 'front', top: 0.03,
    likesText: '喜欢：翠竹', arrive: '大熊猫闻着竹子香，搬进庭院啦！', hello: '我是大熊猫，以后就住这儿啦！',
    lines: ['竹子要慢慢嚼，吃饭也一样～', '多吃蔬菜，像我一样', '吃饱了，打个滚', '今天也要开开心心的'],
  },
  crane: {
    scale: 0.8, stepMs: 2000, pauseMs: [3000, 6000], sleepy: 0, faces: 'right', top: 0.03,
    likesText: '喜欢：荷花池', arrive: '仙鹤看中了荷花池，翩翩飞进庭院啦！', hello: '我是仙鹤，以后就住这儿啦',
    lines: ['站直一点，腰背会舒服', '早睡早起，精神好', '心平气和，福寿安康', '饭后百步走'],
  },
  panda_family: {
    scale: 1.1, stepMs: 2200, pauseMs: [4000, 8000], sleepy: 0.1, faces: 'front', top: 0.22,
    likesText: '喜欢：大熊猫 + 3 丛翠竹', arrive: '竹林长大了，熊猫一家都搬进庭院啦！', hello: '我们是熊猫一家，以后就住这儿啦！',
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

const key = (t) => `${t.c},${t.r}`
const dist = (a, b) => Math.abs(a.c - b.c) + Math.abs(a.r - b.r)
const inside = (t, size) => t.c >= 0 && t.r >= 0 && t.c < size && t.r < size
const neighbors = (t) => [{ c: t.c + 1, r: t.r }, { c: t.c - 1, r: t.r }, { c: t.c, r: t.r + 1 }, { c: t.c, r: t.r - 1 }]

function pickOne(list, rand) {
  return list[Math.min(list.length - 1, Math.floor(rand() * list.length))]
}

// 相邻的空格（blocked：有物件或别的动物的格子）
function freeNeighbors(t, size, blocked) {
  return neighbors(t).filter((n) => inside(n, size) && !blocked.has(key(n)))
}

// 家：最早摆进庭院的那件它喜欢的东西
function homeOf(animalId, placed) {
  const animal = itemById(animalId)
  if (!animal || !animal.likes) return null
  const liked = placed
    .filter((p) => animal.likes.indexOf(p.itemId) !== -1)
    .sort((a, b) => placedOrder(a.uid) - placedOrder(b.uid))
  return liked.length ? { c: liked[0].c, r: liked[0].r } : null
}

// 下一步走哪格：有家就在家附近转（离远了往回走），没家随便逛；被围住返回 null
function chooseStep(pos, { size, blocked, home }, rand) {
  const options = freeNeighbors(pos, size, blocked)
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

// 找一件附近能玩的物件，选走过去最近的；ctx：size、blocked、placed、busy（别的动物正玩着的 uid）、cooldown（uid → 时刻）、now
function choosePlay(animalId, pos, ctx, rand) {
  if (rand() >= PLAY_CHANCE) return null
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

// 屏幕上往右走 c−r 变大；图朝右的往左走要镜像，朝左的往右走要镜像，正面的往左走镜像
function flipFor(faces, from, to, current) {
  const dx = (to.c - to.r) - (from.c - from.r)
  if (dx === 0) return current
  return faces === 'left' ? dx > 0 : dx < 0
}

function lineFor(animalId, state, rand) {
  if (state.play && state.action === state.play.play.action) return state.play.play.line
  if (state.action === 'sleep') return SLEEP_LINE
  return pickOne(ANIMAL_INFO[animalId].lines, rand)
}

module.exports = {
  ANIMAL_INFO,
  PLAYS,
  PLAY_CHANCE,
  PLAY_RANGE,
  HOME_RANGE,
  PLAY_COOLDOWN_MS,
  SLEEP_LINE,
  freeNeighbors,
  homeOf,
  chooseStep,
  pathTo,
  choosePlay,
  flipFor,
  lineFor,
}
