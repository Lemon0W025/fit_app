// 小动物说什么（纯函数，有单测）：点它、它自己开口、闻香来的客人都从这里挑一句
// 每只有自己的口气（tone）和碎碎念（chatter）；另外几类按口气套模板：跟你聊今天打卡（拍了几顿、吃了多少、该吃哪顿了、连续几天）、
// 它爱吃的食物的小知识（shared/foods.js 的 tip）、一般的养生小提示、亲密度高了撒娇。宠物的基本资料和原来的台词在 shared/pets.js

const { petById } = require('./shared/pets')
const { foodById } = require('./shared/foods')
const { MEAL_WORDS, DEFAULT_MEAL_TIMES, mealAt } = require('./shared/timing')

// 口气：cheer 活泼、shy 小声、calm 慢悠悠、proud 傲娇、lazy 懒洋洋
const TONES = {
  doudou: 'cheer', nuonuo: 'shy', lianlian: 'calm', shishi: 'cheer', huahua: 'proud', guigui: 'calm',
  qiqi: 'cheer', shushu: 'cheer', jutuan: 'lazy', sunbao: 'cheer', chacha: 'shy', hehe: 'calm',
}

// 每只自己的碎碎念（和 shared/pets.js 的 lines.tap 合在一起用）
const CHATTER = {
  doudou: ['叽！你看那朵云，像个馒头', '叽叽，我今天数了十只蚂蚁', '我长大了也要会拍照！', '你闻到了吗？锅里好香', '叽！刚才追蝴蝶摔了一跤', '今天的太阳暖烘烘的', '你笑起来真好看，叽', '我头上的豆芽又长高了！'],
  nuonuo: ['（小声）今天…你来啦', '我、我刚才没有躲，真的', '你的手…暖暖的', '风好大…耳朵要飞了', '能、能陪我坐一会儿吗', '我今天吃了三片菜叶', '（偷偷看你）', '我会努力胆子大一点'],
  lianlian: ['嘎～今天也慢慢来', '晒晒太阳，啥都不想', '荷叶上的露水，可甜了', '嘎，吃饭不用急', '散步要慢，才看得到小花', '嘎嘎，风吹得好舒服', '我在等一朵云飘过来', '今天也是平平安安的一天'],
  shishi: ['嘿咻，搬完这根就歇', '我给营地扫了扫落叶', '柿子要放软了才甜', '勤快一点，身体好', '你也起来活动活动呀', '我的刺不扎人，摸摸看？', '今天又攒了一颗小柿子', '东西摆整齐，心情才好'],
  huahua: ['哼，才不是在等你', '本喵今天心情还行', '尾巴上的花，好看吧', '…你今天来晚了', '摸一下可以，就一下', '喵，那只蝴蝶又跑了', '哼，我才不想你呢', '你今天穿得挺好看'],
  guigui: ['慢…慢…晒…太阳', '我的苔藓…又绿了', '着急…会…噎着', '走…慢点…不累', '今天…太阳…刚好', '我…活了…好久好久', '你…也来…晒晒', '细…嚼…慢…咽'],
  qiqi: ['嘿嘿，我把薯薯的核桃藏起来了', '你猜我项链上有几颗枸杞', '偷偷告诉你，糯糯怕打雷', '嘿嘿，今天谁也没发现我', '我跑得可快了，你追不上', '要不要玩捉迷藏？', '枸杞泡水，眼睛亮亮的', '嘘——我在埋伏豆豆'],
  shushu: ['（嚼嚼）你吃了吗？', '我腮帮子能装三个核桃', '吃饭要专心，像我一样', '（嚼嚼）这个也好吃', '肚子饱饱，心情好好', '我没偷吃，是在尝味道', '粗粮也好吃，嚼嚼更香', '你那份…分我一口？'],
  jutuan: ['喵…晒太阳是正经事', '别叫我，我在充电', '你走走，我替你躺着', '喵…今天也不想动', '吃完别马上躺，我是反面教材', '暖洋洋的…要睡着了…', '橘子皮…好香…', '喵…你忙你的，我看着'],
  sunbao: ['嗯？刚才谁叫我？', '我的帽子…今天也很香', '竹笋要慢慢嚼哦', '嗯…我忘了要干啥了', '滚一滚，好开心', '你好呀，你好呀', '我今天胖了吗？', '嗯！吃饱了就有力气'],
  chacha: ['嗯，我在听你说', '今天累不累？', '慢慢说，不着急', '花开了，你看到了吗', '喝口热的，暖暖胃', '有心事可以跟我说', '你今天辛苦啦', '安安静静的，真好'],
  hehe: ['……早', '晨光正好', '站直，深呼吸', '早起的人，有精神', '……吃早饭了吗', '清晨的空气最养人', '一日之计在于晨', '……慢走'],
}

// 跟你聊今天打卡：{meal} 哪一顿、{n} 拍了几顿、{kcal} 吃了多少、{left} 还能吃多少、{streak} 连续几天、{food} 锅里煮的
const TODAY = {
  cheer: {
    none: ['今天还没拍饭呢，拍一张给我看嘛', '我在等你的饭照呢！'],
    open: ['{meal}时间到啦，记得拍一张给我看', '该吃{meal}啦，准时拍有暖豆哦'],
    some: ['今天拍了 {n} 顿啦，真棒！', '已经拍了 {n} 顿，继续加油'],
    allOnTime: ['三顿都准时！我也要学你按时吃饭', '今天三顿都准时，太厉害啦'],
    allDone: ['三顿都拍完啦，明天争取都准时哦'],
    under: ['你今天吃了 {kcal} 千卡，还能吃 {left}，我也要向你学习！', '今天 {kcal} 千卡，刚刚好，我也学你好好吃饭'],
    over: ['今天吃了 {kcal} 千卡，有点多啦，饭后一起散散步吧'],
    streak: ['连续打卡 {streak} 天啦，好厉害！', '{streak} 天没断过，我给你鼓掌！'],
    pot: ['锅里煮着{food}，香得我直流口水', '今天锅里是{food}，我闻到啦！'],
  },
  shy: {
    none: ['（小声）今天…还没看到你的饭照…', '那个…今天吃饭了吗？'],
    open: ['{meal}…到时间了，别忘了拍哦', '（小声）该吃{meal}了…'],
    some: ['今天拍了 {n} 顿…好厉害', '（小声）你今天拍了 {n} 顿呢'],
    allOnTime: ['三顿都准时…我、我也想像你一样'],
    allDone: ['三顿都拍完了…辛苦啦'],
    under: ['今天吃了 {kcal} 千卡…还能吃 {left}，我也要学你', '你吃得刚刚好…真好'],
    over: ['今天…吃得有点多，明天少一点点好吗'],
    streak: ['已经连续 {streak} 天了…你真棒'],
    pot: ['锅里是{food}…好香…'],
  },
  calm: {
    none: ['今天还没拍饭，不急，慢慢来', '吃饭的时候，记得拍一张'],
    open: ['{meal}时间到了，慢慢吃，别忘了拍'],
    some: ['今天拍了 {n} 顿，稳稳的'],
    allOnTime: ['三顿都准时，好习惯'],
    allDone: ['三顿都拍好了，今天圆满'],
    under: ['今天吃了 {kcal} 千卡，还剩 {left}，正好', '吃得不多不少，刚刚好'],
    over: ['今天 {kcal} 千卡，稍微多了，晚上走一走'],
    streak: ['连续 {streak} 天了，日积月累'],
    pot: ['锅里的{food}，煮得正好'],
  },
  proud: {
    none: ['哼，今天的饭照呢？我等着呢', '还没拍饭？本喵要监督你'],
    open: ['{meal}时间到了，快去拍，别让我说第二遍'],
    some: ['拍了 {n} 顿…还行吧', '哼，{n} 顿了，勉强及格'],
    allOnTime: ['三顿都准时…哼，有点厉害', '准时吃饭这点，本喵认可你'],
    allDone: ['三顿都拍完了，嗯，不错'],
    under: ['{kcal} 千卡，还能吃 {left}，本喵也要学…才怪', '今天吃得挺好，我就夸你一句'],
    over: ['{kcal} 千卡？吃多了吧，去走走'],
    streak: ['连续 {streak} 天…哼，我都记着呢'],
    pot: ['锅里有{food}…本喵勉强闻一下'],
  },
  lazy: {
    none: ['喵…饭拍了吗…我替你记着', '还没拍饭？…我先睡会儿等你'],
    open: ['喵…{meal}时间到了…快去拍'],
    some: ['拍了 {n} 顿…比我勤快'],
    allOnTime: ['三顿都准时…你比我强多了'],
    allDone: ['三顿都拍完了…可以晒太阳了'],
    under: ['你今天吃了 {kcal} 千卡…还能吃 {left}…我要向你学习…明天再学', '吃得刚刚好…不像我'],
    over: ['{kcal} 千卡…吃多了别学我躺着，去走走'],
    streak: ['连续 {streak} 天…喵，坚持比晒太阳还难'],
    pot: ['{food}的味道…把我香醒了'],
  },
}

// 它爱吃的食物：{food} 名字、{tip} 小知识
const FOOD_TIPS = {
  cheer: ['我最爱{food}！{tip}', '跟你说，{tip}'],
  shy: ['我、我喜欢{food}…{tip}'],
  calm: ['{food}好呀，{tip}'],
  proud: ['{food}嘛，还行。{tip}，记住了？'],
  lazy: ['{food}…好吃…{tip}'],
}

// 一般的养生小提示（谁都能说）
const HEALTH = [
  '饭前喝点温水，不容易吃多', '吃饭慢一点，二十分钟吃完刚刚好', '先吃菜，再吃肉，最后吃主食', '晚饭七分饱，夜里睡得香',
  '饭后散散步，消化好', '蔬菜一天要吃一大盘哦', '少吃咸的，血压稳稳的', '水果当加餐，别当饭吃', '每天喝够七八杯水', '早饭一定要吃，别饿着',
]

// 亲密度 3 级起会撒娇
const AFFECTION = {
  cheer: ['你来啦！我好想你', '最喜欢你了！', '有你在，营地好热闹'],
  shy: ['（小声）最喜欢…你了', '你来了…我好开心'],
  calm: ['你来了，真好', '有你在，安心'],
  proud: ['哼…才不是想你了', '你来晚了…算了，原谅你'],
  lazy: ['喵…你来了，挨着我晒会儿', '你来了…我就醒一下'],
}

// 闻着香味来的客人：{food} 闻着的那样
const SNIFF = {
  cheer: ['咦！是{food}的香味！', '{food}…在哪儿在哪儿？', '闻着{food}的味儿就跑来啦'],
  shy: ['（小声）好像…有{food}的味道…', '我、我就闻一下{food}…'],
  calm: ['嗯…{food}的香味，真好闻', '顺着{food}的味道，慢慢走来了'],
  proud: ['哼，{food}的味道…还挺香', '本喵只是路过，闻闻{food}'],
  lazy: ['{food}的味道…把我香醒了…', '喵…{food}…在这儿啊'],
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
  pet.foods.map(foodById).filter((f) => f && f.tip).forEach((f) => FOOD_TIPS[tone].forEach((s) => out.push(fill(s, { food: f.name, tip: f.tip }))))
  return out
}

// 点它 / 它自己开口说的一句。ctx = { period, action, level, today, pot }；rnd 是随机数函数；last 是它上一句（尽量不重复）
// 各类的分量：碎碎念 3、今天打卡 3、爱吃的食物 2、养生提示 1、撒娇 1（3 级起）；早上有一份早上好，吃着东西说吃的那句
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

module.exports = { TONES, CHATTER, TODAY, talkLine, sniffLine, todayLines, tipLines, todayOf }
