// 测试期间的福利，全在这一个文件里（config.js 的 testGrant / testPets / testVisitors / testUnlimited）。
// 上传体验版给妈妈之前把 config 里这四样改成 null 就全关了；以后不要了，删掉这个文件、去掉 index.js 里传给营地的 perks 就行
//   atGet(camp)  读营地时：送一次暖豆、一次放出全部宠物、补满资源、一次挪走几只测客人；返回 { changed, testGift }
//   topUp(camp)  每次读、存营地前：无限资源补满；返回补了没有
// 每样都有 until（过了这天不做），一次性的记在 camp.grants 里（每个账号只做一次）

const { dateKey } = require('./shared/date')
const { beanBalance } = require('./shared/garden')
const { PETS } = require('./shared/pets')
const { FOODS, TREATS, foodById } = require('./shared/foods')

const NO_PERKS = { atGet: () => ({ changed: false, testGift: 0 }), topUp: () => false }

// config 每次用的时候再读（测试里会临时改）
function createTestPerks({ config, now }) {
  const today = () => dateKey(now())
  const live = (key) => {
    const t = config[key]
    return t && today() <= t.until ? t : null
  }
  const once = (camp, t) => {
    if (!t || camp.grants.indexOf(t.id) !== -1) return false
    camp.grants = camp.grants.concat(t.id)
    return true
  }

  // 无限资源：暖豆不到 beans 就补到 beans，每样食物（含节气点心）不到 foods 份就补到
  function topUp(camp) {
    const t = live('testUnlimited')
    if (!t) return false
    let changed = false
    const need = (t.beans || 0) - beanBalance(camp)
    if (need > 0) {
      camp.beans = { ...camp.beans, bonus: camp.beans.bonus + need }
      changed = true
    }
    FOODS.concat(TREATS).forEach((f) => {
      if ((camp.foods[f.id] || 0) < (t.foods || 0)) {
        camp.foods = { ...camp.foods, [f.id]: t.foods }
        changed = true
      }
    })
    return changed
  }

  function atGet(camp) {
    let changed = false
    let testGift = 0
    // 送暖豆
    const grant = live('testGrant')
    if (once(camp, grant)) {
      camp.beans = { ...camp.beans, bonus: camp.beans.bonus + grant.beans }
      testGift = grant.beans
      changed = true
    }
    // 还没来的宠物一次全放出来（1 级、不弹新住户）
    if (once(camp, live('testPets'))) {
      const have = camp.pets.map((p) => p.id)
      camp.pets = camp.pets.concat(PETS.filter((p) => have.indexOf(p.id) === -1).map((p) => ({ id: p.id, since: today(), fed: 0, fedToday: { date: '', n: 0 } })))
      camp.visitors = []
      changed = true
    }
    // 补满了就存一次（首页的暖豆也读得到）
    if (topUp(camp)) changed = true
    // 测客人：remove 里的几只先搬走（再下锅才能引来），送 foods 里的食物；今天锅里煮的退回背包、锅清空
    const visitors = live('testVisitors')
    if (once(camp, visitors)) {
      const gone = visitors.remove || []
      camp.pets = camp.pets.filter((p) => gone.indexOf(p.id) === -1)
      camp.arrivals = camp.arrivals.filter((id) => gone.indexOf(id) === -1)
      camp.visitors = camp.visitors.filter((v) => gone.indexOf(v.id) === -1)
      const cooking = camp.pot.date === today() ? camp.pot.foods : []
      cooking.forEach((id) => {
        camp.foods = { ...camp.foods, [id]: (camp.foods[id] || 0) + 1 }
      })
      camp.pot = { date: '', foods: [] }
      Object.keys(visitors.foods || {}).forEach((id) => {
        if (foodById(id)) camp.foods = { ...camp.foods, [id]: (camp.foods[id] || 0) + visitors.foods[id] }
      })
      changed = true
    }
    return { changed, testGift }
  }

  return { atGet, topUp }
}

module.exports = { createTestPerks, NO_PERKS }
