// 食物：扭蛋抽的是它。23 样按宠物爱吃的定（每只两样），稀有度跟宠物走；10 样节气点心只在当季进池、谁都爱吃
// tip 写在图册里，一句养生小知识

const { petById, PETS } = require('./pets')

const FOODS = [
  { id: 'xiaomi', name: '小米', rarity: 'common', tip: '小米粥养胃，早上来一碗最合适' },
  { id: 'yumili', name: '玉米粒', rarity: 'common', tip: '玉米是粗粮，饱腹又不腻' },
  { id: 'huluobo', name: '胡萝卜', rarity: 'common', tip: '胡萝卜用油炒一下，营养更好吸收' },
  { id: 'niangao', name: '年糕', rarity: 'common', tip: '年糕好吃但不好消化，一次别吃多' },
  { id: 'lianzi', name: '莲子', rarity: 'common', tip: '莲子煮粥安神，晚上睡得香' },
  { id: 'xiaoyu', name: '小鱼', rarity: 'common', tip: '小鱼连骨头吃，补钙' },
  { id: 'shizi', name: '柿子', rarity: 'common', tip: '柿子别空腹吃，一天一个刚好' },
  { id: 'pingguo', name: '苹果', rarity: 'common', tip: '一天一苹果，饭后半小时吃最好' },
  { id: 'xiaoyugan', name: '小鱼干', rarity: 'rare', tip: '小鱼干咸，当零食要少量' },
  { id: 'juhuacha', name: '菊花茶', rarity: 'rare', tip: '菊花茶清热，秋天干燥时泡一杯' },
  { id: 'xigua', name: '西瓜', rarity: 'rare', tip: '西瓜解暑，但冰的伤胃，放一会儿再吃' },
  { id: 'caomei', name: '草莓', rarity: 'rare', tip: '草莓维生素多，洗干净再吃' },
  { id: 'kaohongshu', name: '烤红薯', rarity: 'rare', tip: '红薯当主食，代替一部分米饭' },
  { id: 'putao', name: '葡萄', rarity: 'rare', tip: '葡萄甜，一次一小串就好' },
  { id: 'hetao', name: '核桃', rarity: 'rare', tip: '核桃补脑，一天三五个足够' },
  { id: 'hongshu', name: '红薯', rarity: 'rare', tip: '蒸红薯比烤的更清淡' },
  { id: 'juzi', name: '橘子', rarity: 'epic', tip: '橘子皮晒干就是陈皮，泡水理气' },
  { id: 'niunai', name: '牛奶', rarity: 'epic', tip: '睡前一杯温牛奶，助眠' },
  { id: 'zhusun', name: '竹笋', rarity: 'epic', tip: '竹笋纤维多，焯水去涩再炒' },
  { id: 'zhuye', name: '竹叶', rarity: 'epic', tip: '竹叶泡茶清心，夏天喝' },
  { id: 'chaye', name: '茶叶', rarity: 'epic', tip: '饭后一小时再喝茶，别影响消化' },
  { id: 'guihuagao', name: '桂花糕', rarity: 'epic', tip: '桂花糕香甜，小小一块解馋就好' },
  { id: 'shanzha', name: '山楂', rarity: 'legendary', tip: '山楂消食，吃多了胃酸，几颗就好' },
]

const TREATS = [
  { id: 'shibing', name: '柿饼', rarity: 'rare', term: 'shuangjiang', tip: '霜降吃柿饼，润肺' },
  { id: 'kaolizi', name: '烤栗子', rarity: 'rare', term: 'lidong', tip: '立冬的栗子，补肾又暖身' },
  { id: 'tanghulu', name: '糖葫芦', rarity: 'rare', term: 'xiaoxue', tip: '小雪吃糖葫芦，开胃' },
  { id: 'jiaozi', name: '饺子', rarity: 'rare', term: 'dongzhi', tip: '冬至饺子，不冻耳朵' },
  { id: 'labazhou', name: '腊八粥', rarity: 'rare', term: 'dahan', tip: '腊八粥八样米豆，暖一冬' },
  { id: 'chunjuan', name: '春卷', rarity: 'rare', term: 'lichun', tip: '立春咬春，吃春卷' },
  { id: 'qingtuan', name: '青团', rarity: 'rare', term: 'qingming', tip: '清明青团，艾草清香' },
  { id: 'qingmei', name: '青梅', rarity: 'rare', term: 'lixia', tip: '立夏青梅，生津止渴' },
  { id: 'zongzi', name: '粽子', rarity: 'rare', term: 'mangzhong', tip: '芒种粽子，糯米要趁热吃' },
  { id: 'yuebing', name: '月饼', rarity: 'rare', term: 'qiufen', tip: '秋分月饼，一块分着吃' },
]

// 当季点心在池子里的权重（普通食物每样 1）
const SEASONAL_WEIGHT = 4

function foodById(id) {
  return FOODS.find((f) => f.id === id) || TREATS.find((t) => t.id === id) || null
}

function pickWeighted(entries, rand) {
  const total = entries.reduce((sum, e) => sum + e.weight, 0)
  let x = rand * total
  for (const e of entries) {
    if (x < e.weight) return e.value
    x -= e.weight
  }
  return entries[entries.length - 1].value
}

// 这一档里抽哪样：普通食物各 1，当季点心 SEASONAL_WEIGHT
function pickFood(rarity, termKey, rand) {
  const entries = FOODS.filter((f) => f.rarity === rarity).map((f) => ({ value: f.id, weight: 1 }))
    .concat(TREATS.filter((t) => t.rarity === rarity && t.term === termKey).map((t) => ({ value: t.id, weight: SEASONAL_WEIGHT })))
  return pickWeighted(entries, rand)
}

// 直接喂一口：爱吃 +3，不爱吃 +1，节气点心 +5；宠物或食物不存在 0
function feedGain(petId, foodId) {
  const pet = petById(petId)
  const food = foodById(foodId)
  if (!pet || !food) return 0
  if (food.term) return 5
  return pet.foods.indexOf(foodId) !== -1 ? 3 : 1
}

// 这份食物引谁来：爱吃它、食物的档和它一样、还没住进来的里随机一只；没有返回 null
function arrivalFor(foodId, residentIds, rand) {
  const food = foodById(foodId)
  if (!food || food.term) return null
  const candidates = PETS.filter((p) => p.foods.indexOf(foodId) !== -1 && p.rarity === food.rarity && residentIds.indexOf(p.id) === -1)
  if (!candidates.length) return null
  return candidates[Math.min(candidates.length - 1, Math.floor(rand * candidates.length))].id
}

module.exports = { FOODS, TREATS, SEASONAL_WEIGHT, foodById, pickFood, feedGain, arrivalFor }
