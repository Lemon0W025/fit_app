// 小动物说什么（纯函数，有单测）：点它、它自己开口、闻香来的客人、锅里空了饿着的都从这里挑
// 每只有自己的口气（tone）和碎碎念（chatter）；另外几类按口气套模板：跟你聊今天打卡（拍了几顿、吃了多少、该吃哪顿了、连续几天）、
// 它爱吃的食物的小知识、养生小提示（带一句为什么）、早中晚的闲话、亲密度高了撒娇、锅里空着喊饿。宠物的基本资料和原来的台词在 shared/pets.js
// 10/28 用户：话太长、看不出是谁说的 → 每句 16 个字以内（气泡一行半），气泡里带它的头像（camp-life / 页面）
// 10/29 用户：话术太固定、自己开口太勤 → 点它说「一段」（speech：同一个话题两三句，一句一句换着显示），
// 话题、句子、收尾都随机挑，最近说过的十来句不再挑（recent）；自己开口很少（camp-life 管多久一次）

const { petById } = require('./shared/pets')
const { foodById } = require('./shared/foods')
const { MEAL_WORDS, DEFAULT_MEAL_TIMES, mealAt } = require('./shared/timing')

const MAX_CHARS = 16 // 一句最多几个字（单测查）

// 口气：cheer 活泼、shy 小声、calm 慢悠悠、proud 傲娇、lazy 懒洋洋
// 茶茶（小鹿）以前是小声的，台词又多是「我在听」，用户觉得它不会说话 → 改成慢悠悠、会主动说
const TONES = {
  doudou: 'cheer', nuonuo: 'shy', lianlian: 'calm', shishi: 'cheer', huahua: 'proud', guigui: 'calm',
  qiqi: 'cheer', shushu: 'cheer', jutuan: 'lazy', sunbao: 'cheer', chacha: 'calm', hehe: 'calm',
}

// 每只自己的碎碎念（和 shared/pets.js 的 lines.tap 合在一起用）
const CHATTER = {
  doudou: ['叽！那朵云像馒头', '叽叽，我数了十只蚂蚁', '我也想学拍照！', '锅里好香呀，叽', '追蝴蝶摔了一跤…', '太阳暖烘烘的', '你笑起来真好看', '我的豆芽又长高啦',
    '叽，我学会单脚站了', '你今天去哪儿玩了？', '我把小米排成一排', '蚯蚓跟我打招呼了', '下雨天踩水最好玩', '豆芽说它想晒太阳', '叽！你猜我几岁了', '我跑了三圈，不累'],
  nuonuo: ['（小声）你来啦…', '我、我没有躲…', '你的手暖暖的', '风好大，耳朵要飞了', '陪我坐一会儿嘛', '我吃了三片菜叶', '（偷偷看你）', '我会胆子大一点的',
    '今天…没打雷吧', '胡萝卜要切成丝吗', '我、我想跟你玩', '耳朵晒得暖暖的', '我今天没躲，厉害吧', '有你在，我不怕', '我给你留了根胡萝卜', '你…今天开心吗'],
  lianlian: ['嘎～慢慢来', '晒太阳，啥也不想', '荷叶上的露水好甜', '嘎，吃饭不用急', '慢慢走，看小花', '嘎嘎，风好舒服', '我在等一朵云', '今天也平平安安',
    '嘎，荷叶又大了一圈', '吃饭要一口一口来', '下午眯一会儿，嘎', '走路慢，看得多', '莲子心苦，能败火', '嘎，你也歇会儿吧', '慢慢吃，饭才香', '我摇摇摆摆来了'],
  shishi: ['嘿咻，搬完这根就歇', '我扫了扫落叶', '柿子放软了才甜', '勤快点，身体好', '你也动一动呀', '我的刺不扎人哦', '又攒了一颗柿子', '摆整齐，心情好',
    '今天搬了五趟，嘿咻', '树枝堆好了，你看', '柿子给你留了一个', '干活前先吃饱饭', '收拾干净住着舒服', '苹果洗洗再吃哦', '落叶扫成一堆了', '动一动，不容易胖'],
  huahua: ['哼，才没等你', '本喵心情还行', '尾巴上的花好看吧', '…你今天来晚了', '摸一下，就一下', '蝴蝶又跑了，喵', '哼，才不想你呢', '你今天挺好看的',
    '本喵今天也很好看', '才不是想吃鱼干', '…你过来一点', '菊花茶要喝温的', '别盯着我看，喵', '本喵允许你摸头', '哼，饭要按时吃', '你不在，有点无聊'],
  guigui: ['慢…慢…晒太阳', '苔藓…又绿了', '着急…会噎着', '走慢点…不累', '太阳…刚刚好', '你也…来晒晒', '细…嚼…慢…咽', '我…活了好久',
    '壳…晒得暖暖的', '西瓜…要常温的', '一步…一步…走', '急什么…慢慢来', '草莓…红红的', '我…又长大了一点', '晒半个钟头…就好', '你…也歇一歇'],
  qiqi: ['嘿嘿，核桃被我藏了', '猜猜我有几颗枸杞', '糯糯怕打雷，嘘', '今天没人发现我', '你追不上我的！', '玩捉迷藏吗？', '枸杞泡水，眼睛亮', '嘘，我在埋伏豆豆',
    '我把核桃换了，嘿嘿', '猜猜我藏哪儿了？', '葡萄我先尝一颗', '我跑得比风还快！', '烤红薯要趁热吃', '嘘，薯薯在找核桃', '我才没偷吃呢', '这秘密只告诉你'],
  shushu: ['（嚼嚼）你吃了吗', '腮帮能装三个核桃', '吃饭要专心哦', '（嚼嚼）这个好吃', '肚子饱，心情好', '我没偷吃，在尝', '粗粮嚼嚼更香', '分我一口嘛？',
    '你也来点？嚼嚼', '我数数有几个核桃', '红薯蒸着吃最香', '我就吃一小口', '腮帮子满了，嘿嘿', '七分饱…好难啊', '吃完要漱漱口', '有好吃的叫我哦'],
  jutuan: ['喵…晒太阳要紧', '别吵，我在充电', '你走走，我躺着', '喵…今天不想动', '吃完别马上躺', '暖洋洋…要睡了', '橘子皮…好香…', '你忙，我看着',
    '喵…再躺五分钟', '太阳挪了…我也挪', '橘子剥好放这儿', '热牛奶…睡得香', '你动，我替你看着', '喵…尾巴不想摇', '晒完正面晒背面', '睡饱了才有精神'],
  sunbao: ['嗯？谁叫我？', '我的帽子好香', '竹笋要慢慢嚼', '我忘了要干啥了', '滚一滚，好开心', '你好呀你好呀', '我胖了吗？', '吃饱了有力气',
    '嗯…我刚在想啥', '帽子又长高了吗？', '竹叶泡水，清清的', '打了个滚，嘿嘿', '又见面啦，你好', '吃完竹笋想睡觉', '嗯？天怎么亮了', '我数到三就起来'],
  chacha: ['今天累不累？', '花开了，看到吗', '喝口热的吧', '有心事跟我说', '你辛苦啦', '安安静静真好', '鹿角上又开了一朵', '给你泡杯热茶吧',
    '风里有桂花香', '桂花糕要慢慢吃', '晚上早点睡哦', '有我在，别着急', '我把花瓣留给你', '今天天气真好', '吃完饭，走一走', '你笑一笑，花就开'],
  hehe: ['……早', '晨光正好', '站直，深呼吸', '早起，有精神', '……吃早饭了吗', '清晨的空气好', '一日之计在于晨', '……慢走',
    '……山楂，酸', '晨练，先站直', '……慢慢呼吸', '早饭要吃热的', '露水…很凉', '……你起得早', '九点，我就走了', '……明早见'],
}

// 跟你聊今天打卡：{meal} 哪一顿、{n} 拍了几顿、{kcal} 吃了多少、{left} 还能吃多少、{streak} 连续几天、{food} 锅里煮的
const TODAY = {
  cheer: {
    none: ['今天还没拍饭哦', '等你的饭照呢！', '饭照饭照，我要看！'],
    open: ['该吃{meal}啦，记得拍', '{meal}时间到啦！', '{meal}吃啥呀？拍给我看'],
    some: ['今天拍了 {n} 顿，真棒', '{n} 顿啦，加油！', '已经 {n} 顿了，好厉害'],
    allOnTime: ['三顿都准时，厉害！', '我也要按时吃饭！'],
    allDone: ['三顿都拍完啦！'],
    under: ['还能吃 {left} 千卡哦', '吃了 {kcal}，刚刚好', '我也要向你学习！'],
    over: ['吃多啦，散散步吧', '超了一点，没关系！'],
    streak: ['连续 {streak} 天啦！', '{streak} 天没断，鼓掌！'],
    pot: ['{food}好香，口水…', '锅里是{food}耶！'],
  },
  shy: {
    none: ['今天…拍饭了吗？', '还没看到饭照…', '我、我在等饭照'],
    open: ['该吃{meal}了…', '{meal}…别忘了拍', '{meal}…吃了吗？'],
    some: ['拍了 {n} 顿…真好', '（小声）{n} 顿了呢', '{n} 顿了…我都记着'],
    allOnTime: ['三顿都准时…厉害', '我也想像你一样'],
    allDone: ['三顿都拍完了…'],
    under: ['还能吃 {left} 千卡…', '吃得刚刚好…真好'],
    over: ['今天吃得有点多…'],
    streak: ['连续 {streak} 天了…'],
    pot: ['{food}…好香…'],
  },
  calm: {
    none: ['还没拍饭，不急', '吃饭时拍一张', '饭前记得拍一张'],
    open: ['{meal}时间到了', '慢慢吃{meal}，拍一张', '{meal}吃热乎的'],
    some: ['拍了 {n} 顿，稳稳的', '今天 {n} 顿了，真好', '{n} 顿都拍了，不错'],
    allOnTime: ['三顿都准时，好习惯'],
    allDone: ['三顿都拍好了'],
    under: ['还剩 {left} 千卡，正好', '吃得不多不少', '今天吃得刚刚好'],
    over: ['稍微多了，走一走', '多了一点，不要紧'],
    streak: ['连续 {streak} 天了'],
    pot: ['{food}煮得正好'],
  },
  proud: {
    none: ['哼，饭照呢？', '本喵要监督你', '还没拍？哼'],
    open: ['{meal}时间，快去拍', '快去吃{meal}，哼', '{meal}别忘了，哼'],
    some: ['{n} 顿…还行吧', '哼，勉强及格', '{n} 顿，本喵看到了'],
    allOnTime: ['三顿准时…有点厉害', '本喵认可你了'],
    allDone: ['三顿都拍了，不错'],
    under: ['今天吃得挺好', '还能吃 {left}，哼'],
    over: ['吃多了吧？去走走'],
    streak: ['{streak} 天…我记着呢'],
    pot: ['{food}…勉强闻闻'],
  },
  lazy: {
    none: ['喵…饭拍了吗…', '没拍？我先睡会儿', '饭照…等你…喵'],
    open: ['喵…该吃{meal}了', '{meal}…去吃吧…'],
    some: ['{n} 顿…比我勤快', '{n} 顿了…喵…厉害'],
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

// 一般的养生小提示（谁都能说）：一句提示 + 一句为什么
const HEALTH_TALKS = [
  ['饭前喝点温水', '胃会舒服一点'],
  ['吃饭慢一点', '一口嚼二十下'],
  ['先吃菜，再吃饭', '血糖稳稳的'],
  ['晚饭七分饱', '睡觉更踏实'],
  ['饭后散散步', '走十分钟就好'],
  ['多吃点蔬菜', '颜色越多越好'],
  ['少吃咸的哦', '酱油也算盐'],
  ['每天多喝水', '小口小口地喝'],
  ['早饭一定要吃', '一天才有力气'],
  ['晚上早点睡', '十点半就上床'],
  ['天凉加件衣服', '别着凉了'],
  ['水果饭后一会儿吃', '一次一个就够'],
  ['油炸的少吃点', '蒸煮更清淡'],
  ['坐久了起来走走', '伸个懒腰也好'],
  ['吃饭别看手机', '吃得多了都不知道'],
  ['汤先喝几口', '饭就不会吃太多'],
]
const HEALTH = HEALTH_TALKS.map((t) => t[0])

// 早中晚的闲话（谁都能说）：两句一组
const PERIOD_TALKS = {
  morning: [['早呀', '早饭吃了吗？'], ['太阳出来了', '今天也慢慢来'], ['早上空气好', '出门走一走吧'], ['睡得好吗？', '起来喝杯温水']],
  day: [['中午啦', '午饭要吃热乎的'], ['吃完饭歇一歇', '眯一会儿也好'], ['太阳好暖', '晒晒背舒服'], ['下午犯困了吧', '起来走两步']],
  dusk: [['天快黑了', '晚饭清淡点'], ['火边好暖和', '一起坐坐吧'], ['晚霞好漂亮', '你看到了吗？'], ['忙了一天了', '歇歇脚吧']],
  night: [['星星出来了', '该睡觉啦'], ['夜里凉', '盖好被子哦'], ['今天辛苦啦', '早点休息'], ['睡前别吃东西', '喝口温水就好']],
}

// 一段话的收尾（有时加一句）
const CLOSERS = {
  cheer: ['加油加油！', '我陪着你！', '嘿嘿～', '说好了哦！', '就这样！'],
  shy: ['…就这些啦', '你、你记得哦', '我说完了…', '嘻嘻…'],
  calm: ['慢慢来', '不着急', '好好的', '就这样'],
  proud: ['…哼，就这样', '记住没？', '本喵说的', '才不是关心你'],
  lazy: ['喵…困了', '我先躺会儿', '…就这样吧', '呼…困了'],
}

// 客人被点：闻着什么来的 + 拍正餐就住下
const VISIT = {
  cheer: '你拍正餐，我就住下！', shy: '你拍正餐…我就留下', calm: '你拍了正餐，我就住下', proud: '拍正餐…本喵就住下', lazy: '你拍正餐…我就不走了',
}

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

// 没真说话的台词（「（呆住了）」「…」「嗯？」）：点它要说一段时不挑
function isMute(line) {
  return line.replace(/（[^）]*）/g, '').replace(/[…。，、！？～\s嗯？.!?]/g, '').length < 2
}

// recent：最近说过的（数组，也认一句字符串）
const seenIn = (recent) => (Array.isArray(recent) ? recent : recent ? [recent] : [])

// 从 list 里挑一句没说过的（都说过了就随便挑）
function fresh(list, rnd, seen) {
  const left = list.filter((s) => seen.indexOf(s) === -1)
  return pickFrom(left.length ? left : list, rnd)
}

// 挑两句不一样的
function two(list, rnd, seen) {
  const a = fresh(list, rnd, seen)
  const b = fresh(list.filter((s) => s !== a), rnd, seen.concat(a))
  return b ? [a, b] : [a]
}

// 今天打卡：先说状态（该吃哪顿了 / 拍了几顿 / 三顿都拍了），再说吃了多少或连续几天
function todaySpeech(tone, today, rnd, seen) {
  const t = TODAY[tone]
  const v = { n: today.logged, meal: today.open, streak: today.streak, kcal: today.kcal, left: today.budget ? today.budget - today.kcal : 0 }
  const lines = (key) => t[key].map((s) => fill(s, v))
  const status = today.open ? 'open' : !today.logged ? 'none' : today.allDone ? (today.allOnTime ? 'allOnTime' : 'allDone') : 'some'
  const out = [fresh(lines(status), rnd, seen)]
  const more = []
  if (today.kcal > 0 && today.budget) more.push(...lines(today.kcal > today.budget ? 'over' : 'under'))
  if (today.streak >= 2) more.push(...lines('streak'))
  if (more.length) out.push(fresh(more, rnd, seen))
  return out
}

// 爱吃的食物：说爱吃哪样 + 那样的小知识
function foodSpeech(tone, pet, rnd) {
  const foods = pet.foods.map(foodById).filter(Boolean)
  const f = pickFrom(foods, rnd)
  if (!f) return []
  const [like, tip] = FOOD_TIPS[tone]
  return SHORT_TIPS[f.id] ? [fill(like, { food: f.name }), fill(tip, { tip: SHORT_TIPS[f.id] })] : [fill(like, { food: f.name })]
}

// 锅里煮着的：闻着香 + 那样的小知识（有的话）
function potSpeech(tone, pot) {
  const f = (pot || []).map(foodById).filter(Boolean)[0]
  if (!f) return []
  const out = [fill(TODAY[tone].pot[0], { food: f.name })]
  if (SHORT_TIPS[f.id]) out.push(SHORT_TIPS[f.id])
  return out
}

// 点它说的一段（两三句，同一个话题）。ctx = { period, action, level, today, pot, spot, hungry }；rnd 随机数；recent 最近说过的。
// 话题的分量：碎碎念 3、今天打卡 3、爱吃的 2、养生 2、早中晚 1、锅里煮着的 1、撒娇 1（3 级起）、早上好 1（早上）；
// 锅里空着（hungry）喊饿占一大半；在锅边吃着东西（不是野餐垫上）说吃的那句。说过的整段都重复了就换个话题，有时加一句收尾
function speech(petId, ctx = {}, rnd = Math.random, recent = []) {
  const pet = petById(petId)
  if (!pet) return []
  const seen = seenIn(recent)
  if (ctx.action === 'eat' && !ctx.spot) return [pet.lines.fed]
  const tone = toneOf(petId)
  const own = (CHATTER[petId] || []).concat(pet.lines.tap).filter((l) => !isMute(l))
  const periods = PERIOD_TALKS[ctx.period] || []
  const topics = [
    { w: 3, make: () => two(own, rnd, seen) },
    { w: ctx.today ? 3 : 0, make: () => todaySpeech(tone, ctx.today, rnd, seen) },
    { w: 2, make: () => foodSpeech(tone, pet, rnd) },
    { w: 2, make: () => pickFrom(HEALTH_TALKS, rnd).slice() },
    { w: periods.length ? 1 : 0, make: () => pickFrom(periods, rnd).slice() },
    { w: (ctx.pot || []).length ? 1 : 0, make: () => potSpeech(tone, ctx.pot) },
    { w: (ctx.level || 1) >= 3 ? 1 : 0, make: () => [fresh(AFFECTION[tone], rnd, seen), fresh(own, rnd, seen)] },
    { w: ctx.period === 'morning' ? 1 : 0, make: () => [pet.lines.morning, fresh(own, rnd, seen)] },
    { w: ctx.hungry ? 14 : 0, make: () => two(HUNGRY[tone], rnd, seen) },
  ].filter((t) => t.w > 0)
  const total = topics.reduce((sum, t) => sum + t.w, 0)
  // 第一句最近没说过才用这个话题（不然换一个）；后面几句说过的去掉
  let out = []
  for (let tries = 0; tries < 8; tries++) {
    let r = rnd() * total
    const topic = topics.find((t) => (r -= t.w) < 0) || topics[topics.length - 1]
    out = topic.make().filter(Boolean)
    if (out.length && seen.indexOf(out[0]) === -1) break
  }
  if (!out.length) out = two(own, rnd, seen)
  out = out.filter((l, i) => i === 0 || (seen.indexOf(l) === -1 && out.indexOf(l) === i))
  if (out.length < 3 && rnd() < 0.35) out.push(fresh(CLOSERS[tone], rnd, seen.concat(out)))
  return out
}

// 自己开口说的一句：挑一段的第一句（和点它说的一样随机，最近说过的不挑）
function talkLine(petId, ctx = {}, rnd = Math.random, recent = []) {
  const seen = seenIn(recent)
  for (let tries = 0; tries < 4; tries++) {
    const line = speech(petId, ctx, rnd, seen)[0] || ''
    if (line && seen.indexOf(line) === -1) return line
  }
  return speech(petId, ctx, rnd, seen)[0] || ''
}

// 点了客人：它闻着什么来的 + 你拍正餐它就住下
function visitorSpeech(petId, foodId, rnd = Math.random) {
  return [sniffLine(petId, foodId, rnd), VISIT[toneOf(petId)]]
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

module.exports = {
  MAX_CHARS, TONES, CHATTER, TODAY, HUNGRY, SHORT_TIPS, HEALTH_TALKS, PERIOD_TALKS, CLOSERS, VISIT,
  speech, talkLine, visitorSpeech, sniffLine, leaveLine, backLine, todayLines, tipLines, todayOf, isMute,
}
