const { AppError, CODES } = require('../lib/errors')
const { normalizeCamp, migrated } = require('../lib/camp-state')
const { dateKey } = require('../lib/shared/date')
const { RARITIES, SPIN_COST, WELCOME_BEANS, PITY, beanBalance, rollRarity, currentTerm } = require('../lib/shared/garden')
const { NO_PERKS } = require('../lib/test-perks')
const { PETS, petById } = require('../lib/shared/pets')
const { FOODS, TREATS, foodById, pickFood, feedGain } = require('../lib/shared/foods')
const { dailyMenu } = require('../lib/menu')
const { DECOR, GOLD_SWING, decorById, placeProblem } = require('../lib/shared/decor')
const { levelOf, nextLevelAt, giftDue } = require('../lib/shared/camp')
const { sumMeals } = require('../lib/shared/nutrition')

const HIGH_RARITIES = ['epic', 'legendary']
const STARTER_PET = 'doudou'
const FEEDS_PER_DAY = 3
const POT_MAX = 3 // 锅里一天最多煮几样
const GIFT_BEANS = 5
const GIFT_BEANS_CHANCE = 0.7
const GIFT_LEVEL = 4
// 没来的宠物在图册里的提示：按它爱吃的第一样食物的口味
const TASTE_HINT = {
  xiaomi: '它好像爱吃香香的小粒粮', huluobo: '它好像爱吃脆脆的', lianzi: '它好像爱吃清甜的', shizi: '它好像爱吃软软甜甜的',
  xiaoyugan: '它闻到鱼味就来', xigua: '它好像爱吃多汁的', kaohongshu: '它好像爱吃热乎乎的', hetao: '它好像爱嗑坚果',
  juzi: '它好像爱吃酸酸甜甜的', zhusun: '它好像爱吃竹子', chaye: '它好像爱喝茶', shanzha: '它只在清晨出现，爱吃红红的小果子',
}

// hourOf：本地钟点（礼物 5 点后才有；云函数默认按北京时间算）
// perks：测试期间的福利（lib/test-perks.js），不给就没有
function createCampService({ repo, now, random = Math.random, perks = NO_PERKS, forest = null, hourOf = null }) {
  const today = () => dateKey(now())
  const hour = () => (hourOf ? hourOf() : (now().getUTCHours() + 8) % 24)

  async function load(openid) {
    const camp = normalizeCamp(await repo.getGarden(openid))
    perks.topUp(camp)
    return camp
  }

  // 存之前也补满（测试无限资源：花了、下锅了，回给页面的就已经是满的）
  async function save(openid, camp) {
    perks.topUp(camp)
    await repo.saveGarden(openid, camp)
  }

  function termInfo() {
    const term = currentTerm(today())
    if (!term) return null
    return { name: term.name, treats: TREATS.filter((t) => t.term === term.key).map((t) => t.id) }
  }

  const residentIds = (camp) => camp.pets.map((p) => p.id)
  // 今天锅里煮着的：锅是哪天的不是今天就当空锅（半夜清空，不用定时任务）
  const potFoods = (camp) => (camp.pot.date === today() ? camp.pot.foods : [])
  // 住户爱不爱吃：它爱吃的两样，或者节气点心（谁都爱吃）
  const likes = (petId, foodId) => {
    const food = foodById(foodId)
    const pet = petById(petId)
    return !!food && !!pet && (!!food.term || pet.foods.indexOf(foodId) !== -1)
  }
  const isFull = (camp) => PETS.every((p) => residentIds(camp).indexOf(p.id) !== -1)
  const giftReady = (camp) => giftDue(camp.gift, today(), hour()) && camp.pets.some((p) => levelOf(p.fed) >= GIFT_LEVEL)

  function unplaced(camp) {
    const placedCount = {}
    camp.decor.placed.forEach((p) => {
      placedCount[p.id] = (placedCount[p.id] || 0) + 1
    })
    return DECOR.filter((d) => (camp.decor.owned[d.id] || 0) - (placedCount[d.id] || 0) > 0)
      .map((d) => ({ id: d.id, count: (camp.decor.owned[d.id] || 0) - (placedCount[d.id] || 0) }))
  }

  function view(camp, extra = {}) {
    return {
      beans: Math.max(0, beanBalance(camp)),
      spinCost: SPIN_COST,
      pityLeft: PITY - camp.gacha.sincePity,
      rates: RARITIES.map(({ id, label, weight }) => ({ id, label, weight })),
      term: termInfo(),
      foods: FOODS.concat(TREATS).filter((f) => camp.foods[f.id] > 0).map((f) => ({ id: f.id, count: camp.foods[f.id] })),
      pot: { foods: potFoods(camp) },
      menu: dailyMenu(today()),
      visitors: camp.visitors.map(({ id, foodId }) => ({ id, foodId })),
      pets: camp.pets.map((p) => ({ id: p.id, since: p.since, fed: p.fed, level: levelOf(p.fed), next: nextLevelAt(p.fed) })),
      arrivals: camp.arrivals,
      decor: { owned: camp.decor.owned, placed: camp.decor.placed, unplaced: unplaced(camp) },
      giftReady: giftReady(camp),
      full: isFull(camp),
      ...extra,
    }
  }

  function takeFromBag(camp, foodId) {
    if (!foodById(foodId) || !(camp.foods[foodId] > 0)) throw new AppError(CODES.BAD_REQUEST, '背包里没有这个了')
    const foods = { ...camp.foods, [foodId]: camp.foods[foodId] - 1 }
    if (!foods[foodId]) delete foods[foodId]
    camp.foods = foods
  }

  function addToBag(camp, foodId) {
    camp.foods = { ...camp.foods, [foodId]: (camp.foods[foodId] || 0) + 1 }
  }

  function findPlaced(camp, uid) {
    const placed = camp.decor.placed.find((p) => p.uid === uid)
    if (!placed) throw new AppError(CODES.NOT_FOUND, '找不到这件东西了')
    return placed
  }

  function checkSpot(camp, decorId, x, y, ignoreUid) {
    const problem = placeProblem(camp.decor.placed, decorId, x, y, ignoreUid)
    if (problem) throw new AppError(CODES.BAD_REQUEST, problem)
  }

  // 全员吃一顿（一天最多 FEEDS_PER_DAY 次）
  function feedAll(camp) {
    const date = today()
    camp.pets = camp.pets.map((p) => {
      const t = p.fedToday.date === date ? p.fedToday : { date, n: 0 }
      if (t.n >= FEEDS_PER_DAY) return { ...p, fedToday: t }
      return { ...p, fed: p.fed + 1, fedToday: { date, n: t.n + 1 } }
    })
  }

  return {
    async get(openid, input) {
      const doc = await repo.getGarden(openid)
      const camp = normalizeCamp(doc)
      let dirty = migrated(doc, camp)
      let welcome = null
      if (!camp.welcomed) {
        camp.welcomed = true
        camp.beans = { ...camp.beans, bonus: camp.beans.bonus + WELCOME_BEANS }
        if (residentIds(camp).indexOf(STARTER_PET) === -1) camp.pets = camp.pets.concat({ id: STARTER_PET, since: today(), fed: 0, fedToday: { date: '', n: 0 } })
        welcome = { beans: WELCOME_BEANS, petId: STARTER_PET }
        dirty = true
      }
      const test = perks.atGet(camp)
      if (test.changed) dirty = true
      const result = view(camp, { welcome, testGift: test.testGift })
      if (input && input.markSeen && camp.arrivals.length) {
        camp.arrivals = []
        dirty = true
      }
      if (dirty) await save(openid, camp)
      const profile = await repo.getProfile(openid)
      const meals = await repo.listMeals(openid, today())
      result.hasProfile = !!profile
      result.daily = null
      if (forest) result.daily = await forest.today(openid, today(), meals)
      // 今天吃了多少、一天的预算：小动物会聊起来（「你今天吃了 900 千卡，还能吃 340」）
      result.intake = { kcal: sumMeals(meals).kcal, budget: profile && profile.dailyKcal ? profile.dailyKcal : null }
      return result
    },

    async spin(openid) {
      const camp = await load(openid)
      if (beanBalance(camp) < SPIN_COST) throw new AppError(CODES.NO_BEANS, '暖豆不够啦，再打卡一顿就有了')
      const term = currentTerm(today())
      const rarity = rollRarity(random(), camp.gacha.sincePity)
      const foodId = pickFood(rarity, term && term.key, random())
      const isNew = camp.tasted.indexOf(foodId) === -1
      camp.beans = { ...camp.beans, spent: camp.beans.spent + SPIN_COST }
      addToBag(camp, foodId)
      if (isNew) camp.tasted = camp.tasted.concat(foodId)
      camp.gacha = { pulls: camp.gacha.pulls + 1, sincePity: HIGH_RARITIES.indexOf(rarity) !== -1 ? 0 : camp.gacha.sincePity + 1 }
      await save(openid, camp)
      return { foodId, rarity, isNew, beans: Math.max(0, beanBalance(camp)), pityLeft: PITY - camp.gacha.sincePity }
    },

    // 下锅：今天第一样下锅就点火、煮一整天。爱吃它的住户这就过来吃（亲密 + feedGain）；
    // 今日菜单里这样食物的名单（lib/menu.js）中，挑一只还没住下、也不是客人的闻着香味来当客人（下次拍正餐住下）
    async putFood(openid, input) {
      const foodId = (input || {}).foodId
      const camp = await load(openid)
      const cooking = potFoods(camp)
      const food = foodById(foodId)
      if (food && cooking.indexOf(foodId) !== -1) throw new AppError(CODES.BAD_REQUEST, `锅里已经有${food.name}了，换一样吧`)
      if (food && cooking.length >= POT_MAX) throw new AppError(CODES.BAD_REQUEST, '锅里已经煮了三样啦，明天再放')
      takeFromBag(camp, foodId)
      camp.pot = { date: today(), foods: cooking.concat(foodId) }
      const eaters = camp.pets.filter((p) => likes(p.id, foodId)).map((p) => p.id)
      camp.pets = camp.pets.map((p) => (eaters.indexOf(p.id) !== -1 ? { ...p, fed: p.fed + feedGain(p.id, foodId) } : p))
      const here = residentIds(camp).concat(camp.visitors.map((v) => v.id))
      const smells = (dailyMenu(today())[foodId] || []).filter((id) => here.indexOf(id) === -1)
      const visitor = smells.length ? smells[Math.min(smells.length - 1, Math.floor(random() * smells.length))] : null
      if (visitor) camp.visitors = camp.visitors.concat({ id: visitor, foodId, since: today() })
      await save(openid, camp)
      return view(camp, { cooked: { foodId, eaters, visitor: visitor || null } })
    },

    // 直接喂一只：爱吃 +3、不爱吃 +1、点心 +5，不限次
    async feed(openid, input) {
      const { petId, foodId } = input || {}
      const camp = await load(openid)
      const pet = camp.pets.find((p) => p.id === petId)
      if (!pet) throw new AppError(CODES.NOT_FOUND, '它还没住进来')
      takeFromBag(camp, foodId)
      const gain = feedGain(petId, foodId)
      camp.pets = camp.pets.map((p) => (p.id === petId ? { ...p, fed: p.fed + gain } : p))
      await save(openid, camp)
      return view(camp, { gain, liked: gain >= 3, petId, foodId })
    },

    async buy(openid, input) {
      const decorId = (input || {}).decorId
      const d = decorById(decorId)
      if (!d || !d.price) throw new AppError(CODES.BAD_REQUEST, '这件商店里没有')
      const camp = await load(openid)
      const have = camp.decor.owned[decorId] || 0
      if (have >= d.max) throw new AppError(CODES.BAD_REQUEST, d.max === 1 ? '这件已经买过了' : '这件已经买够了')
      if (beanBalance(camp) < d.price) throw new AppError(CODES.NO_BEANS, `暖豆不够啦，${d.name}要 ${d.price} 暖豆，再攒攒`)
      camp.beans = { ...camp.beans, spent: camp.beans.spent + d.price }
      camp.decor = { ...camp.decor, owned: { ...camp.decor.owned, [decorId]: have + 1 } }
      await save(openid, camp)
      return view(camp)
    },

    async place(openid, input) {
      const { decorId, x, y } = input || {}
      const camp = await load(openid)
      if (!unplaced(camp).some((u) => u.id === decorId)) throw new AppError(CODES.BAD_REQUEST, '背包里没有这个了')
      checkSpot(camp, decorId, x, y)
      camp.seq += 1
      camp.decor = { ...camp.decor, placed: camp.decor.placed.concat({ uid: `d${camp.seq}`, id: decorId, x, y }) }
      await save(openid, camp)
      return view(camp)
    },

    async move(openid, input) {
      const { uid, x, y } = input || {}
      const camp = await load(openid)
      const placed = findPlaced(camp, uid)
      checkSpot(camp, placed.id, x, y, uid)
      camp.decor = { ...camp.decor, placed: camp.decor.placed.map((p) => (p.uid === uid ? { ...p, x, y } : p)) }
      await save(openid, camp)
      return view(camp)
    },

    async stash(openid, input) {
      const { uid } = input || {}
      const camp = await load(openid)
      findPlaced(camp, uid)
      camp.decor = { ...camp.decor, placed: camp.decor.placed.filter((p) => p.uid !== uid) }
      await save(openid, camp)
      return view(camp)
    },

    // 早上的礼物：页面里叼着礼物走过来的那只（petId）；没传或不够格，就在 4 级以上的住户里随机一只
    async gift(openid, data = {}) {
      const camp = await load(openid)
      if (!giftReady(camp)) throw new AppError(CODES.BAD_REQUEST, '今天没有礼物啦')
      const givers = camp.pets.filter((p) => levelOf(p.fed) >= GIFT_LEVEL)
      const giver = givers.find((p) => p.id === data.petId) || givers[Math.min(givers.length - 1, Math.floor(random() * givers.length))]
      const gift = { petId: giver.id, beans: 0, foodId: null }
      if (random() < GIFT_BEANS_CHANCE) {
        gift.beans = GIFT_BEANS
        camp.beans = { ...camp.beans, bonus: camp.beans.bonus + GIFT_BEANS }
      } else {
        const commons = FOODS.filter((f) => f.rarity === 'common')
        gift.foodId = commons[Math.min(commons.length - 1, Math.floor(random() * commons.length))].id
        addToBag(camp, gift.foodId)
      }
      camp.gift = today()
      await save(openid, camp)
      return view(camp, { gift })
    },

    async album(openid) {
      const camp = await load(openid)
      const pets = PETS.map((p) => {
        const mine = camp.pets.find((r) => r.id === p.id)
        if (!mine) return { id: p.id, name: p.name, home: false, hint: TASTE_HINT[p.foods[0]] || '' }
        const level = levelOf(mine.fed)
        return {
          id: p.id, name: p.name, home: true, hook: p.hook, mood: p.mood, foods: p.foods.map((id) => foodById(id).name),
          since: mine.since, fed: mine.fed, level, next: nextLevelAt(mine.fed),
          story: p.story.map((text, i) => ({ text, open: i < level })),
        }
      })
      return {
        pets,
        progress: { pets: camp.pets.length, total: PETS.length },
        full: isFull(camp),
        foods: FOODS.concat(TREATS).map((f) => ({ id: f.id, name: f.name, rarity: f.rarity, term: f.term || '', tip: f.tip, tasted: camp.tasted.indexOf(f.id) !== -1 })),
        decor: DECOR.filter((d) => d.price > 0).map((d) => ({ id: d.id, name: d.name, category: d.category, owned: (camp.decor.owned[d.id] || 0) > 0 })),
      }
    },

    // 正餐打卡后由 meal 服务调用：全员 +1；闻着香味来的客人全部住下（锅照样煮着）
    async arrive(openid) {
      const camp = await load(openid)
      feedAll(camp)
      const comers = camp.visitors.filter((v, i) => petById(v.id) && residentIds(camp).indexOf(v.id) === -1 && camp.visitors.findIndex((w) => w.id === v.id) === i)
      camp.pets = camp.pets.concat(comers.map((v) => ({ id: v.id, since: today(), fed: 0, fedToday: { date: '', n: 0 } })))
      camp.arrivals = camp.arrivals.concat(comers.map((v) => v.id))
      camp.visitors = []
      if (isFull(camp) && !camp.decor.owned[GOLD_SWING]) camp.decor = { ...camp.decor, owned: { ...camp.decor.owned, [GOLD_SWING]: 1 } }
      await save(openid, camp)
      if (!comers.length) return null
      return {
        pets: comers.map((v) => {
          const food = foodById(v.foodId)
          return { id: v.id, name: petById(v.id).name, foodId: v.foodId, foodName: food ? food.name : '' }
        }),
      }
    },
  }
}

module.exports = { createCampService }
