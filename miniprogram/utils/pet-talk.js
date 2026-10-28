// 小动物说什么（纯函数，有单测）：点它、它自己开口、闻香来的客人、锅里空了饿着的都从这里挑一句
// 每只有自己的口气（tone）和碎碎念（chatter）；另外几类按口气套模板：跟你聊今天打卡（拍了几顿、吃了多少、该吃哪顿了、连续几天）、
// 它爱吃的食物的小知识、一般的养生小提示、亲密度高了撒娇、锅里空着喊饿。宠物的基本资料和原来的台词在 shared/pets.js
// 10/28 用户：话太长、看不出是谁说的 → 每句尽量 14 个字以内（气泡一行半），气泡里带它的头像（camp-life / 页面）

const { petById } = require('./shared/pets')
const { foodById } = require('./shared/foods')
const { MEAL_WORDS, DEFAULT_MEAL_TIMES, mealAt } = require('./shared/timing')

const MAX_CHARS = 16 // 一句最多几个字（单测查）

// 口气：cheer 活泼、shy 小声、calm 慢悠悠、proud 傲娇、lazy 懒洋洋
const TONES = {
  doudou: 'cheer', nuonuo: 'shy', lianlian: 'calm', shishi: 'cheer', huahua: 'proud', guigui: 'calm',
  qiqi: 'cheer', shushu: 'cheer', jutuan: 'lazy', sunbao: 'cheer', chacha: 'shy', hehe: 'calm',
}

// 每只自己的碎碎念（和 shared/pets.js 的 lines.tap 合在一起用）
const CHATTER = {
  doudou: ['叽！那朵云像馒头', '叽叽，我数了十只蚂蚁', '我也想学拍照！', '锅里好香呀，叽', '追蝴蝶摔了一跤…', '太阳暖烘烘的', '你笑起来真好看', '我的豆芽又长高啦'],
  nuonuo: ['（小声）你来啦…', '我、我没有躲…', '你的手暖暖的', '风好大，耳朵要飞了', '陪我坐一会儿嘛', '我吃了三片菜叶', '（偷偷看你）', '我会胆子大一点的'],
  lianlian: ['嘎～慢慢来', '晒太阳，啥也不想', '荷叶上的露水好甜', '嘎，吃饭不用急', '慢慢走，看小花', '嘎嘎，风好舒服', '我在等一朵云', '今天也平平安安'],
  shishi: ['嘿咻，搬完这根就歇', '我扫了扫落叶', '柿子放软了才甜', '勤快点，身体好', '你也动一动呀', '我的刺不扎人哦', '又攒了一颗柿子', '摆整齐，心情好'],
  huahua: ['哼，才没等你', '本喵心情还行', '尾巴上的花好看吧', '…你今天来晚了', '摸一下，就一下', '蝴蝶又跑了，喵', '哼，才不想你呢', '你今天挺好看的'],
  guigui: ['慢…慢…晒太阳', '苔藓…又绿了', '着急…会噎着', '走慢点…不累', '太阳…刚刚好', '你也…来晒晒', '细…嚼…慢…咽', '我…活了好久'],
  qiqi: ['嘿嘿，核桃被我藏了', '猜猜我有几颗枸杞', '糯糯怕打雷，嘘', '今天没人发现我', '你追不上我的！', '玩捉迷藏吗？', '枸杞泡水，眼睛亮', '嘘，我在埋伏豆豆'],
  shushu: ['（嚼嚼）你吃了吗', '腮帮能装三个核桃', '吃饭要专心哦', '（嚼嚼）这个好吃', '肚子饱，心情好', '我没偷吃，在尝', '粗粮嚼嚼更香', '分我一口嘛？'],
  jutuan: ['喵…晒太阳要紧', '别吵，我在充电', '你走走，我躺着', '喵…今天不想动', '吃完别马上躺', '暖洋洋…要睡了', '橘子皮…好香…', '你忙，我看着'],
  sunbao: ['嗯？谁叫我？', '我的帽子好香', '竹笋要慢慢嚼', '我忘了要干啥了', '滚一滚，好开心', '你好呀你好呀', '我胖了吗？', '吃饱了有力气'],
  chacha: ['嗯，我在听', '今天累不累？', '慢慢说，不急', '花开了，看到吗', '喝口热的吧', '有心事跟我说', '你辛苦啦', '安安静静真好'],
  hehe: ['……早', '晨光正好', '站直，深呼吸', '早起，有精神', '……吃早饭了吗', '清晨的空气好', '一日之计在于晨', '……慢走'],
}

// 跟你聊今天打卡：{meal} 哪一顿、{n} 拍了几顿、{kcal} 吃了多少、{left} 还能吃多少、{streak} 连续几天、{food} 锅里煮的
const TODAY = {
  cheer: {
    none: ['今天还没拍饭哦', '等你的饭照呢！'],
    open: ['该吃{meal}啦，记得拍', '{meal}时间到啦！'],
    some: ['今天拍了 {n} 顿，真棒', '{n} 顿啦，加油！'],
    allOnTime: ['三顿都准时，厉害！', '我也要按时吃饭！'],
    allDone: ['三顿都拍完啦！'],
    under: ['还能吃 {left} 千卡哦', '吃了 {kcal}，刚刚好', '我也要向你学习！'],
    over: ['吃多啦，散散步吧'],
    streak: ['连续 {streak} 天啦！', '{streak} 天没断，鼓掌！'],
    pot: ['{food}好香，口水…', '锅里是{food}耶！'],
  },
  shy: {
    none: ['今天…拍饭了吗？', '还没看到饭照…'],
    open: ['该吃{meal}了…', '{meal}…别忘了拍'],
    some: ['拍了 {n} 顿…真好', '（小声）{n} 顿了呢'],
    allOnTime: ['三顿都准时…厉害', '我也想像你一样'],
    allDone: ['三顿都拍完了…'],
    under: ['还能吃 {left} 千卡…', '吃得刚刚好…真好'],
    over: ['今天吃得有点多…'],
    streak: ['连续 {streak} 天了…'],
    pot: ['{food}…好香…'],
  },
  calm: {
    none: ['还没拍饭，不急', '吃饭时拍一张'],
    open: ['{meal}时间到了', '慢慢吃{meal}，拍一张'],
    some: ['拍了 {n} 顿，稳稳的'],
    allOnTime: ['三顿都准时，好习惯'],
    allDone: ['三顿都拍好了'],
    under: ['还剩 {left} 千卡，正好', '吃得不多不少'],
    over: ['稍微多了，走一走'],
    streak: ['连续 {streak} 天了'],
    pot: ['{food}煮得正好'],
  },
  proud: {
    none: ['哼，饭照呢？', '本喵要监督你'],
    open: ['{meal}时间，快去拍', '快去吃{meal}，哼'],
    some: ['{n} 顿…还行吧', '哼，勉强及格'],
    allOnTime: ['三顿准时…有点厉害', '本喵认可你了'],
    allDone: ['三顿都拍了，不错'],
    under: ['今天吃得挺好', '还能吃 {left}，哼'],
    over: ['吃多了吧？去走走'],
    streak: ['{streak} 天…我记着呢'],
    pot: ['{food}…勉强闻闻'],
  },
  lazy: {
    none: ['喵…饭拍了吗…', '没拍？我先睡会儿'],
    open: ['喵…该吃{meal}了'],
    some: ['{n} 顿…比我勤快'],
    allOnTime: ['三顿准时…比我强'],
    allDone: ['拍完了…晒太阳吧'],
    under: ['还能吃 {left}…喵', '吃得好…明天学你'],
    over: ['吃多了…别学我躺'],
    streak: ['连续 {streak} 天…厉害'],
    pot: ['{food}…把我香醒了'],
  },
}

// 爱吃的食物的一句小知识（短的，图册里的那句太长）
const SHORT_TIPS = {
  xiaomi: '小米粥养胃', yumili: '玉米是粗粮，耐饿', huluobo: '胡萝卜炒着吃', niangao: '年糕一次别多吃',
  lianzi: '莲子安神，睡得香', xiaoyu: '小鱼连骨吃，补钙', shizi: '柿子别空腹吃', pingguo: '饭后吃个苹果',
  xiaoyugan: '小鱼干咸，少吃点', juhuacha: '菊花茶清热', xigua: '西瓜别吃冰的', caomei: '草莓洗干净再吃',
  kaohongshu: '红薯能当主食', putao: '葡萄一小串就好', hetao: '核桃一天三五个', hongshu: '蒸红薯更清淡',
  juzi: '橘子皮能泡水', niunai: '睡前温牛奶助眠', zhusun: '竹笋焯水再炒', zhuye: '竹叶茶清心',
  chaye: '饭后一小时再喝茶', guihuagao: '桂花糕一小块就好', shanzha: '山楂消食，几颗就好',
}

// 它爱吃的食物：{food} 名字、{tip} 小知识
const FOOD_TIPS = {
  cheer: ['我最爱{food}！', '{tip}哦！'],
  shy: ['我、我喜欢{food}…', '{tip}…'],
  calm: ['{food}好呀', '{tip}'],
  proud: ['{food}嘛，还行', '{tip}，记住了'],
  lazy: ['{food}…好吃…', '{tip}…喵'],
}

// 一般的养生小提示（谁都能说）
const HEALTH = [
  '饭前喝点温水', '吃饭慢一点', '先吃菜，再吃饭', '晚饭七分饱', '饭后散散步', '多吃点蔬菜', '少吃咸的哦', '每天多喝水', '早饭一定要吃',
]

// 亲密度 3 级起会撒娇
const AFFECTION = {
  cheer: ['你来啦！好想你', '最喜欢你了！'],
  shy: ['（小声）最喜欢你…', '你来了…好开心'],
  calm: ['你来了，真好', '有你在，安心'],
  proud: ['哼…才没想你', '来晚了…原谅你'],
  lazy: ['挨着我晒会儿嘛', '你来了…醒一下'],
}

// 锅里空着（今天还没下锅）：留下来的几只喊饿
const HUNGRY = {
  cheer: ['好饿啊，好饿啊！', '锅里空空的…', '什么时候开饭呀？', '肚子咕咕叫了！'],
  shy: ['（小声）好饿…', '肚子…咕咕叫…', '锅里…没吃的…'],
  calm: ['锅空着…等等吧', '有点饿了', '等一锅热乎的'],
  proud: ['哼，本喵饿了', '快放点吃的嘛', '饿了…哼'],
  lazy: ['喵…饿得不想动', '饿…先睡会儿', '有吃的叫我…'],
}

// 饿了走开时说的、闻着香味回来时说的
const LEAVE = { cheer: '我去找吃的啦！', shy: '我、我去找吃的…', calm: '我去找点吃的', proud: '哼，自己找吃的去', lazy: '喵…找吃的去…' }
const BACK = { cheer: '闻到香味啦！', shy: '好、好香…', calm: '嗯，香味来了', proud: '哼，香味还行', lazy: '喵…香醒了' }

// 闻着香味来的客人：{food} 闻着的那样
const SNIFF = {
  cheer: ['咦！{food}的香味！', '{food}在哪儿？', '闻着{food}来啦'],
  shy: ['（小声）{food}的味道…', '我就闻一下{food}…'],
  calm: ['{food}的香味，真好', '顺着{food}香味来了'],
  proud: ['{food}…还挺香', '本喵路过，闻闻'],
  lazy: ['{food}…香醒了…', '喵…{food}在这儿'],
}

const toneOf = (id) => TONES[id] || 'cheer'
const fill = (s, v) => s.replace(/\{(\w+)\}/g, (m, k) => (v[k] === undefined ? m : v[k]))

function pickFrom(list, rnd) {
  return list.length ? list[Math.min(list.length - 1, Math.floor(rnd() * list.length))] : ''
}

// 今天打卡能聊的几句（today 没给就没有）：today = { logged, onTime, allDone, allOnTime, open: '午饭' | '', streak, kcal, budget }
function todayLines(tone, today, pot) {
  const t = TODAY[tone]
  const out = []
  if (today) {
    const v = { n: today.logged, meal: today.open, streak: today.streak, kcal: today.kcal, left: today.budget ? today.budget - today.kcal : 0 }
    const add = (key) => t[key].forEach((s) => out.push(fill(s, v)))
    if (today.open) add('open')
    else if (!today.logged) add('none')
    if (today.allDone) add(today.allOnTime ? 'allOnTime' : 'allDone')
    else if (today.logged) add('some')
    if (today.kcal > 0 && today.budget) add(today.kcal > today.budget ? 'over' : 'under')
    if (today.streak >= 2) add('streak')
  }
  const food = (pot || []).map(foodById).filter(Boolean)[0]
  if (food) t.pot.forEach((s) => out.push(fill(s, { food: food.name })))
  return out
}

function tipLines(tone, pet) {
  const out = []
  pet.foods.map(foodById).filter(Boolean).forEach((f) => {
    FOOD_TIPS[tone].forEach((s) => {
      if (s.indexOf('{tip}') !== -1 && !SHORT_TIPS[f.id]) return
      out.push(fill(s, { food: f.name, tip: SHORT_TIPS[f.id] }))
    })
  })
  return out
}

// 点它 / 它自己开口说的一句。ctx = { period, action, level, today, pot, spot, hungry }；rnd 是随机数函数；last 是它上一句（尽量不重复）
// 各类的分量：碎碎念 3、今天打卡 3、爱吃的食物 2、养生提示 1、撒娇 1（3 级起）；早上有一份早上好；锅里空着（hungry）喊饿占一大半；
// 吃着东西（在锅边，不是野餐垫上）说吃的那句
function talkLine(petId, ctx = {}, rnd = Math.random, last = '') {
  const pet = petById(petId)
  if (!pet) return ''
  if (ctx.action === 'eat' && !ctx.spot) return pet.lines.fed
  const tone = toneOf(petId)
  const groups = [
    { w: 3, lines: (CHATTER[petId] || []).concat(pet.lines.tap) },
    { w: 3, lines: todayLines(tone, ctx.today, ctx.pot) },
    { w: 2, lines: tipLines(tone, pet) },
    { w: 1, lines: HEALTH },
    { w: 1, lines: (ctx.level || 1) >= 3 ? AFFECTION[tone] : [] },
    { w: 1, lines: ctx.period === 'morning' ? [pet.lines.morning] : [] },
    { w: 10, lines: ctx.hungry ? HUNGRY[tone] : [] },
  ].filter((g) => g.lines.length)
  const total = groups.reduce((s, g) => s + g.w, 0)
  for (let tries = 0; tries < 4; tries++) {
    let r = rnd() * total
    const g = groups.find((x) => (r -= x.w) < 0) || groups[groups.length - 1]
    const line = pickFrom(g.lines, rnd)
    if (line && line !== last) return line
  }
  return pickFrom(groups[0].lines, rnd)
}

// 营地拿到的今天的情况（camp.get 的 daily：早午晚印章、连续天数、饭点；intake：吃了多少、预算）→ todayLines 用的样子。
// open：现在正是哪顿的饭点、还没拍（「该吃午饭啦」）；没有 daily 返回 null（小动物就不聊打卡）
function todayOf(daily, intake, now) {
  if (!daily || !daily.stamps) return null
  const done = daily.stamps.filter((s) => s.state !== 'none')
  const current = mealAt(daily.mealTimes || DEFAULT_MEAL_TIMES, now)
  const stamp = current && daily.stamps.find((s) => s.mealType === current)
  return {
    logged: done.length,
    onTime: done.filter((s) => s.onTime).length,
    allDone: done.length === daily.stamps.length,
    allOnTime: done.length === daily.stamps.length && done.every((s) => s.onTime),
    open: stamp && stamp.state === 'none' ? MEAL_WORDS[current] : '',
    streak: daily.streak || 0,
    kcal: (intake && intake.kcal) || 0,
    budget: (intake && intake.budget) || 0,
  }
}

// 闻着香味来的客人说的
function sniffLine(petId, foodId, rnd = Math.random) {
  const food = foodById(foodId)
  return fill(pickFrom(SNIFF[toneOf(petId)], rnd), { food: food ? food.name : '好吃的' })
}

const leaveLine = (petId) => LEAVE[toneOf(petId)]
const backLine = (petId) => BACK[toneOf(petId)]

module.exports = { MAX_CHARS, TONES, CHATTER, TODAY, HUNGRY, SHORT_TIPS, talkLine, sniffLine, leaveLine, backLine, todayLines, tipLines, todayOf }
