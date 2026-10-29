const test = require('node:test')
const assert = require('node:assert/strict')
const { COACH_NAME, buildMealMessages, buildSummaryMessages } = require('../cloudfunctions/api/lib/prompts')

const profile = {
  nickname: '妈妈',
  sex: 'female',
  age: 50,
  heightCm: 160,
  weightKg: 70,
  targetWeightKg: 60,
  activity: 'light',
  avoid: '不吃香菜',
  dailyKcal: 1270,
}

test('养生师名字', () => {
  assert.equal(COACH_NAME, '小暖')
})

test('打卡消息：system 设定角色、JSON 输出与安全底线', () => {
  const [system] = buildMealMessages({ profile, mealType: 'lunch', note: '', imageUrl: 'https://x/y.jpg', consumedKcal: 300 })
  assert.equal(system.role, 'system')
  assert.match(system.content, /小暖/)
  assert.match(system.content, /JSON/)
  assert.match(system.content, /1200/)
  assert.match(system.content, /医/)
})

test('打卡消息：有图片时 content 是图文数组', () => {
  const messages = buildMealMessages({ profile, mealType: 'lunch', note: '米饭吃了一半', imageUrl: 'https://x/y.jpg', consumedKcal: 300 })
  const user = messages[messages.length - 1]
  assert.equal(user.role, 'user')
  assert.ok(Array.isArray(user.content))
  const text = user.content.find((c) => c.type === 'text').text
  const image = user.content.find((c) => c.type === 'image_url')
  assert.equal(image.image_url.url, 'https://x/y.jpg')
  assert.match(text, /午餐/)
  assert.match(text, /米饭吃了一半/)
  assert.match(text, /1270/)
  assert.match(text, /300/)
  assert.match(text, /970/)
  assert.match(text, /不吃香菜/)
  assert.match(text, /160/)
})

test('打卡消息：无图片时 content 是字符串并说明按描述估算', () => {
  const messages = buildMealMessages({ profile, mealType: 'dinner', note: '一碗面条加个蛋', imageUrl: null, consumedKcal: 0 })
  const user = messages[messages.length - 1]
  assert.equal(typeof user.content, 'string')
  assert.match(user.content, /晚餐/)
  assert.match(user.content, /一碗面条加个蛋/)
  assert.match(user.content, /描述/)
})

test('打卡消息：已超预算时提示超出', () => {
  const messages = buildMealMessages({ profile, mealType: 'snack', note: '薯片', imageUrl: null, consumedKcal: 1500 })
  assert.match(messages[messages.length - 1].content, /超出 230/)
})

test('总结消息：包含每餐、总热量与体重变化', () => {
  const meals = [
    { mealType: 'breakfast', status: 'done', analysis: { foods: [{ name: '小米粥' }, { name: '鸡蛋' }], totalKcal: 250, rating: 'green' } },
    { mealType: 'lunch', status: 'done', analysis: { foods: [{ name: '红烧肉' }], totalKcal: 800, rating: 'red' } },
  ]
  const messages = buildSummaryMessages({
    profile,
    date: '2026-10-22',
    meals,
    totals: { kcal: 1050, protein: 40, carbs: 100, fat: 50 },
    latestWeight: { date: '2026-10-22', weightKg: 69.5 },
    previousWeight: { date: '2026-10-21', weightKg: 70 },
  })
  assert.equal(messages[0].role, 'system')
  const user = messages[messages.length - 1].content
  assert.match(user, /小米粥、鸡蛋/)
  assert.match(user, /红烧肉/)
  assert.match(user, /1050/)
  assert.match(user, /1270/)
  assert.match(user, /69\.5/)
  assert.match(user, /-0\.5/)
})

test('总结消息：没有体重记录也能生成', () => {
  const messages = buildSummaryMessages({
    profile,
    date: '2026-10-22',
    meals: [],
    totals: { kcal: 0, protein: 0, carbs: 0, fat: 0 },
    latestWeight: null,
    previousWeight: null,
  })
  assert.match(messages[messages.length - 1].content, /暂无体重记录/)
})

test('打卡消息：带上拍照时间和准不准时', () => {
  const at = new Date('2026-10-22T04:10:00Z')
  const times = { breakfast: '07:30', lunch: '12:00', dinner: '18:00' }
  const build = (mealType, timing) => buildMealMessages({ profile, mealType, note: '', imageUrl: null, consumedKcal: 0, timing, at, times })
  assert.match(build('lunch', 'on')[1].content, /【拍照时间】12:10，准时（午餐饭点 12:00）/)
  assert.match(build('breakfast', 'late')[1].content, /【拍照时间】12:10，不在饭点（早餐饭点 07:30）/)
  assert.match(build('snack', null)[1].content, /【拍照时间】12:10\n/)
  assert.match(build('lunch', 'on')[0].content, /准时/)
  const none = buildMealMessages({ profile, mealType: 'lunch', note: 'x', imageUrl: null, consumedKcal: 0 })
  assert.doesNotMatch(none[1].content, /拍照时间/)
})

test('打卡消息：要每道菜的克数和营养素，按碗盘筷子估克数，她家常用份量优先', () => {
  const [system] = buildMealMessages({ profile, mealType: 'lunch', note: '', imageUrl: 'https://x/y.jpg', consumedKcal: 0 })
  assert.match(system.content, /"grams"/)
  assert.match(system.content, /"foods": \[\{"name": "米饭", "portion": "一碗", "grams": 150, "kcal": 174, "protein": 3\.9, "carbs": 38\.9, "fat": 0\.5, "shared": false\}/)
  assert.match(system.content, /按碗、盘、筷子的大小估克数/)
  assert.match(system.content, /她家常用份量/)
})

test('打卡消息：她改过的份量写进去（最近 8 样，按改的先后），没有就不写', () => {
  const items = {}
  for (let i = 0; i < 10; i++) items[`菜${i}`] = { grams: 100 + i, at: 1000 + i }
  items['米饭'] = { grams: 110, at: 5000 }
  const text = (msgs) => msgs[msgs.length - 1].content
  const withPortions = text(buildMealMessages({ profile, mealType: 'dinner', note: '一碗饭', imageUrl: null, consumedKcal: 0, portions: items }))
  const line = withPortions.split('\n').find((l) => l.startsWith('【她家常用份量】'))
  assert.ok(line, '有【她家常用份量】这一行')
  assert.match(line, /^【她家常用份量】她自己改过的：米饭一般吃约 110 克；菜9一般吃约 109 克；/)
  assert.equal((line.match(/一般吃约/g) || []).length, 8)
  assert.doesNotMatch(line, /菜2一般/)
  const none = text(buildMealMessages({ profile, mealType: 'dinner', note: '一碗饭', imageUrl: null, consumedKcal: 0 }))
  assert.doesNotMatch(none, /她家常用份量/)
  const empty = text(buildMealMessages({ profile, mealType: 'dinner', note: '一碗饭', imageUrl: null, consumedKcal: 0, portions: {} }))
  assert.doesNotMatch(empty, /她家常用份量/)
})

test('打卡消息：几个人一起吃时告诉小暖按人数算她那一份；每道菜标 shared；一个人不写', () => {
  const [system] = buildMealMessages({ profile, mealType: 'dinner', note: '', imageUrl: 'https://x/y.jpg', consumedKcal: 0 })
  assert.match(system.content, /shared/)
  assert.match(system.content, /大家夹的菜先估整盘整锅，再按人数平分/)
  const text = (msgs) => msgs[msgs.length - 1].content
  const five = text(buildMealMessages({ profile, mealType: 'dinner', note: '火锅', imageUrl: null, consumedKcal: 0, people: 5 }))
  assert.match(five, /【几个人一起吃】5 个人一起吃这一顿，大家夹的菜按 5 份算她那一份/)
  assert.doesNotMatch(text(buildMealMessages({ profile, mealType: 'dinner', note: '火锅', imageUrl: null, consumedKcal: 0, people: 1 })), /几个人一起吃/)
})
