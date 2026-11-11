const { AppError, CODES } = require('../lib/errors')
const { normalizeCamp, migrated } = require('../lib/camp-state')
const { dateKey } = require('../lib/shared/date')
const { RARITIES, SPIN_COST, SPIN_MANY, WELCOME_BEANS, PITY, beanBalance, rollRarity, currentTerm } = require('../lib/shared/garden')
const { NO_PERKS } = require('../lib/test-perks')
const { PETS, petById } = require('../lib/shared/pets')
const { FOODS, TREATS, foodById, pickFood, feedGain } = require('../lib/shared/foods')
const { dailyMenu } = require('../lib/menu')
const { DECOR, GOLD_SWING, decorById, placeProblem } = require('../lib/shared/decor')
const { levelOf, nextLevelAt, giftDue, HOME_LEVEL, POT_STAY_MS, RESIDENT_GOALS, STAR_BEANS, starsOf, nextStarAt, nextGoal } = require('../lib/shared/camp')
const { sumMeals } = require('../lib/shared/nutrition')

const HIGH_RARITIES = ['epic', 'legendary']
const STARTER_PET = 'doudou'
const FEEDS_PER_DAY = 3
const POT_MAX = 3 // 一天最多煮几样（按下锅那天算）
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
  const nowMs = () => now().getTime()
  const hour = () => (hourOf ? hourOf() : (now().getUTCHours() + 8) % 24)

  async function load(openid) {
    const camp = normalizeCamp(await repo.getGarden(openid), nowMs())
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

  // 来过的（住下的 + 常客，不管这会儿在不在场）
  const metIds = (camp) => camp.pets.map((p) => p.id)
  // 锅里还在煮的：下锅不到 POT_STAY_MS（8 小时）的那几样；到期时间 = 最后一样下锅 + 8 小时
  const potItems = (camp) => camp.pot.items.filter((it) => it.at <= nowMs() && nowMs() - it.at < POT_STAY_MS)
  const potFoods = (camp) => potItems(camp).map((it) => it.foodId)
  const potUntil = (camp) => potItems(camp).reduce((t, it) => Math.max(t, it.at + POT_STAY_MS), 0)
  // 在场：住下了的，或者常客还没到走的时候
  const present = (p) => !!p.home || p.until > nowMs()
  const presentPets = (camp) => camp.pets.filter(present)
  const newPet = (id, fed, until) => ({ id, since: today(), fed, fedToday: { date: '', n: 0 }, home: false, until })
  // 住户爱不爱吃：它爱吃的两样，或者节气点心（谁都爱吃）
  const likes = (petId, foodId) => {
    const food = foodById(foodId)
    const pet = petById(petId)
    return !!food && !!pet && (!!food.term || pet.foods.indexOf(foodId) !== -1)
  }
  const isFull = (camp) => PETS.every((p) => metIds(camp).indexOf(p.id) !== -1)
  const giftReady = (camp) => giftDue(camp.gift, today(), hour()) && presentPets(camp).some((p) => levelOf(p.fed) >= GIFT_LEVEL)

  // 亲密到了 HOME_LEVEL 的住下（锅空了也不走）；返回这次住下的 id
  function moveIn(camp) {
    const ids = []
    camp.pets = camp.pets.map((p) => {
      if (p.home || levelOf(p.fed) < HOME_LEVEL) return p
      ids.push(p.id)
      return { ...p, home: true, until: 0 }
    })
    return ids
  }

  // 12 只都来过：送金色秋千（只送一次）
  function grantGold(camp) {
    if (isFull(camp) && !camp.decor.owned[GOLD_SWING]) camp.decor = { ...camp.decor, owned: { ...camp.decor.owned, [GOLD_SWING]: 1 } }
  }

  const unique = (ids) => ids.filter((id, i) => ids.indexOf(id) === i)
  const homeCount = (camp) => camp.pets.filter((p) => p.home).length

  // 后期目标：住下的（亲密到了 HOME_LEVEL、不走了的）到了 4 / 8 / 12 只、满级后又攒够一颗星，各奖一次暖豆（记在 bonus 里，goals / 每只的 stars 记着发过的）；
  // 发了的排进 cheers，等营地页拿去庆祝。有新发的返回 true
  function settleGoals(camp) {
    const cheers = []
    RESIDENT_GOALS.forEach((g) => {
      if (homeCount(camp) < g.pets || camp.goals.indexOf(g.pets) !== -1) return
      camp.goals = camp.goals.concat(g.pets)
      cheers.push({ kind: 'residents', pets: g.pets, beans: g.beans })
    })
    camp.pets = camp.pets.map((p) => {
      const stars = starsOf(p.fed)
      const paid = p.stars || 0
      if (stars <= paid) return p
      cheers.push({ kind: 'star', petId: p.id, stars, beans: (stars - paid) * STAR_BEANS })
      return { ...p, stars }
    })
    if (!cheers.length) return false
    camp.beans = { ...camp.beans, bonus: camp.beans.bonus + cheers.reduce((sum, c) => sum + c.beans, 0) }
    camp.cheers = camp.cheers.concat(cheers)
    return true
  }

  // 营地页拿走还没庆祝过的（拿了就清掉，不会弹第二次）
  function takeCheers(camp) {
    const cheers = camp.cheers
    camp.cheers = []
    return cheers
  }

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
      spinMany: SPIN_MANY,
      spinManyCost: SPIN_COST * SPIN_MANY,
      pityLeft: PITY - camp.gacha.sincePity,
      rates: RARITIES.map(({ id, label, weight }) => ({ id, label, weight })),
      term: termInfo(),
      foods: FOODS.concat(TREATS).filter((f) => camp.foods[f.id] > 0).map((f) => ({ id: f.id, count: camp.foods[f.id] })),
      pot: { foods: potFoods(camp), until: potUntil(camp) },
      menu: dailyMenu(today()),
      // 在场的（住下的 + 还没到走的时候的常客）；met 是来过的（背包里的头像亮不亮）
      pets: presentPets(camp).map((p) => ({ id: p.id, since: p.since, fed: p.fed, level: levelOf(p.fed), next: nextLevelAt(p.fed), home: !!p.home, stars: starsOf(p.fed), nextStar: nextStarAt(p.fed) })),
      met: metIds(camp),
      // 下一个住户里程碑（{ pets, beans }，按住下的只数算，都到了是 null）；cheers 只有营地页自己的请求才带（get + markSeen、下锅、喂）
      goal: nextGoal(homeCount(camp)),
      cheers: [],
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

  // 扭一次：扣 SPIN_COST、按保底抽稀有度、抽食物进背包、记没吃过的
  function pullOnce(camp, term) {
    const rarity = rollRarity(random(), camp.gacha.sincePity)
    const foodId = pickFood(rarity, term && term.key, random())
    const isNew = camp.tasted.indexOf(foodId) === -1
    camp.beans = { ...camp.beans, spent: camp.beans.spent + SPIN_COST }
    addToBag(camp, foodId)
    if (isNew) camp.tasted = camp.tasted.concat(foodId)
    camp.gacha = { pulls: camp.gacha.pulls + 1, sincePity: HIGH_RARITIES.indexOf(rarity) !== -1 ? 0 : camp.gacha.sincePity + 1 }
    return { foodId, rarity, isNew }
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

  // 在场的全员吃一顿（一天最多 FEEDS_PER_DAY 次）
  function feedAll(camp) {
    const date = today()
    camp.pets = camp.pets.map((p) => {
      if (!present(p)) return p
      const t = p.fedToday.date === date ? p.fedToday : { date, n: 0 }
      if (t.n >= FEEDS_PER_DAY) return { ...p, fedToday: t }
      return { ...p, fed: p.fed + 1, fedToday: { date, n: t.n + 1 } }
    })
  }

  return {
    async get(openid, input) {
      const doc = await repo.getGarden(openid)
      const camp = normalizeCamp(doc, nowMs())
      let dirty = migrated(doc, camp)
      let welcome = null
      if (!camp.welcomed) {
        camp.welcomed = true
        camp.beans = { ...camp.beans, bonus: camp.beans.bonus + WELCOME_BEANS }
        if (metIds(camp).indexOf(STARTER_PET) === -1) camp.pets = camp.pets.concat({ ...newPet(STARTER_PET, 0, 0), home: true })
        welcome = { beans: WELCOME_BEANS, petId: STARTER_PET }
        dirty = true
      }
      const test = perks.atGet(camp)
      if (test.changed) dirty = true
      // 谁来读都先把到了的里程碑、星星的暖豆发了；庆祝留给营地页（markSeen）
      if (settleGoals(camp)) dirty = true
      const seen = !!(input && input.markSeen)
      const result = view(camp, { welcome, testGift: test.testGift, cheers: seen ? camp.cheers : [] })
      if (seen && camp.cheers.length) {
        takeCheers(camp)
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
      const r = pullOnce(camp, currentTerm(today()))
      await save(openid, camp)
      return { ...r, beans: Math.max(0, beanBalance(camp)), pityLeft: PITY - camp.gacha.sincePity }
    },

    // 十连：一口气扭 SPIN_MANY 个（保底照常往下数，十次里至少一个珍稀以上），一次存
    async spinMany(openid) {
      const camp = await load(openid)
      const cost = SPIN_COST * SPIN_MANY
      if (beanBalance(camp) < cost) throw new AppError(CODES.NO_BEANS, `十连要 ${cost} 暖豆，再打几顿卡就有了`)
      const term = currentTerm(today())
      const results = []
      for (let i = 0; i < SPIN_MANY; i++) results.push(pullOnce(camp, term))
      await save(openid, camp)
      return { results, beans: Math.max(0, beanBalance(camp)), pityLeft: PITY - camp.gacha.sincePity }
    },

    // 下锅：第一样下锅就点火，一样管 8 小时（specs/2026-11-07-camp-regulars-design.md）。
    // 在场、爱吃它的这就过来吃（eaters，亲密 + feedGain）；闻着香味来的（comers）= 今日菜单里这样的（lib/menu.js）∪ 来过、爱吃它的，
    // 去掉在场的：第一次来的加进 pets（常客）；在场的常客和来的都能待到锅到期。亲密到 5 级的住下（movedIn）
    async putFood(openid, input) {
      const foodId = (input || {}).foodId
      const camp = await load(openid)
      const active = potItems(camp)
      const food = foodById(foodId)
      if (food && active.some((it) => it.foodId === foodId)) throw new AppError(CODES.BAD_REQUEST, `锅里已经有${food.name}了，换一样吧`)
      if (food && camp.pot.items.filter((it) => it.date === today()).length >= POT_MAX) throw new AppError(CODES.BAD_REQUEST, '今天已经煮过三样啦，明天再放')
      takeFromBag(camp, foodId)
      const at = nowMs()
      // 今天下的都留着（到期的也算今天的三样之一），昨天的扔掉
      camp.pot = { items: camp.pot.items.filter((it) => it.date === today()).concat({ foodId, at, date: today() }) }
      const until = at + POT_STAY_MS
      const here = presentPets(camp).map((p) => p.id)
      const eaters = here.filter((id) => likes(id, foodId))
      const fans = camp.pets.filter((p) => likes(p.id, foodId)).map((p) => p.id)
      const comers = unique((dailyMenu(today())[foodId] || []).concat(fans)).filter((id) => petById(id) && here.indexOf(id) === -1)
      camp.pets = camp.pets.map((p) => {
        const stays = !p.home && (here.indexOf(p.id) !== -1 || comers.indexOf(p.id) !== -1)
        const eats = eaters.indexOf(p.id) !== -1 || comers.indexOf(p.id) !== -1
        return { ...p, until: stays ? until : p.until, fed: eats ? p.fed + feedGain(p.id, foodId) : p.fed }
      })
      comers.filter((id) => metIds(camp).indexOf(id) === -1).forEach((id) => camp.pets.push(newPet(id, feedGain(id, foodId), until)))
      const movedIn = moveIn(camp)
      grantGold(camp)
      // 这一口正好喂出一颗星、住下的到了里程碑：当场带回去庆祝
      settleGoals(camp)
      const cheers = takeCheers(camp)
      await save(openid, camp)
      return view(camp, { cooked: { foodId, eaters, comers, movedIn }, cheers })
    },

    // 直接喂一只在场的：爱吃 +3、不爱吃 +1、点心 +5，不限次；喂到 5 级就住下
    async feed(openid, input) {
      const { petId, foodId } = input || {}
      const camp = await load(openid)
      const pet = camp.pets.find((p) => p.id === petId && present(p))
      if (!pet) throw new AppError(CODES.NOT_FOUND, '它这会儿不在营地')
      takeFromBag(camp, foodId)
      const gain = feedGain(petId, foodId)
      camp.pets = camp.pets.map((p) => (p.id === petId ? { ...p, fed: p.fed + gain } : p))
      const movedIn = moveIn(camp)
      settleGoals(camp)
      const cheers = takeCheers(camp)
      await save(openid, camp)
      return view(camp, { gain, liked: gain >= 3, petId, foodId, movedIn, cheers })
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
      const givers = presentPets(camp).filter((p) => levelOf(p.fed) >= GIFT_LEVEL)
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
        if (!mine) return { id: p.id, name: p.name, met: false, home: false, hint: TASTE_HINT[p.foods[0]] || '' }
        const level = levelOf(mine.fed)
        return {
          id: p.id, name: p.name, met: true, home: !!mine.home, here: present(mine), hook: p.hook, mood: p.mood, foods: p.foods.map((id) => foodById(id).name),
          since: mine.since, fed: mine.fed, level, next: nextLevelAt(mine.fed), stars: starsOf(mine.fed), nextStar: nextStarAt(mine.fed),
          story: p.story.map((text, i) => ({ text, open: i < level })),
        }
      })
      return {
        pets,
        // pets：来过的；home：住下的（里程碑按它算）
        progress: { pets: camp.pets.length, home: homeCount(camp), total: PETS.length },
        // 下一个里程碑：封面上写「再住下 N 只领 M 暖豆」
        goal: nextGoal(homeCount(camp)),
        full: isFull(camp),
        foods: FOODS.concat(TREATS).map((f) => ({ id: f.id, name: f.name, rarity: f.rarity, term: f.term || '', tip: f.tip, tasted: camp.tasted.indexOf(f.id) !== -1 })),
        decor: DECOR.filter((d) => d.price > 0).map((d) => ({ id: d.id, name: d.name, category: d.category, owned: (camp.decor.owned[d.id] || 0) > 0 })),
      }
    },

    // 正餐打卡后由 meal 服务调用：在场的全员 +1；这一顿喂到 5 级的住下（结果页横幅）
    async arrive(openid) {
      const camp = await load(openid)
      feedAll(camp)
      const movedIn = moveIn(camp)
      await save(openid, camp)
      if (!movedIn.length) return null
      return { pets: movedIn.map((id) => ({ id, name: petById(id).name })) }
    },
  }
}

module.exports = { createCampService }
