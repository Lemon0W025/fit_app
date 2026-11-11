// test/food-table.test.js：热量对照表（lib/food-table.js）。认得出来的菜把离谱的热量拉回来，认不出的不动
const test = require('node:test')
const assert = require('node:assert/strict')
const { lookup, anchor, promptRefs, ENTRIES } = require('../cloudfunctions/api/lib/food-table')
const { parseMealAnalysis } = require('../cloudfunctions/api/lib/parse')

const nameOf = (n) => {
  const e = lookup(n)
  return e ? e.name : null
}

test('对照表：每样的数都像话，叫法不重复', () => {
  assert.ok(ENTRIES.length >= 120)
  const seen = new Set()
  for (const e of ENTRIES) {
    assert.ok(e.kcal >= 0 && e.kcal <= 700, e.name)
    assert.ok(e.tol > 0 && e.tol < 0.5, e.name)
    // 三大营养素算出来的热量和表里的热量差不太多（酒除外：酒精不算在三样里）
    const byMacro = e.protein * 4 + e.carbs * 4 + e.fat * 9
    if (!/酒/.test(e.name)) assert.ok(Math.abs(byMacro - e.kcal) <= Math.max(12, e.kcal * 0.2), `${e.name} ${byMacro} vs ${e.kcal}`)
    for (const n of e.names) {
      assert.equal(seen.has(n), false, `重复：${n}`)
      seen.add(n)
    }
  }
})

test('lookup：名字一样、前面带「家常」「小份」、带括号的都认；青菜按做法认', () => {
  assert.equal(nameOf('米饭'), '米饭')
  assert.equal(nameOf('米饭（一碗）'), '米饭')
  assert.equal(nameOf('小份米饭'), '米饭')
  assert.equal(nameOf(' 家常 红烧肉 '), '红烧肉')
  assert.equal(lookup('清炒小白菜').kcal, 55)
  assert.equal(lookup('蒜蓉西兰花').kcal, 55)
  assert.equal(lookup('白灼菜心').kcal, 30)
  assert.equal(lookup('凉拌黄瓜').kcal, 45)
  assert.equal(lookup('青菜').kcal, 55)
  assert.equal(lookup('黄瓜').kcal, 16, '生的黄瓜按表里的')
})

test('lookup：「前面加了点什么 + 表里三个字以上的叫法」才认；拿不准的不认', () => {
  assert.equal(nameOf('红烧牛肉面'), '牛肉面')
  assert.equal(nameOf('山药排骨汤'), '排骨汤')
  assert.equal(nameOf('猪肉白菜饺子'), '饺子')
  assert.equal(nameOf('南瓜小米粥'), '小米粥')
  // 名字里有表里的词，但不是一回事
  for (const n of ['啤酒鸭', '青椒牛肉', '冰红茶', '拔丝红薯', '土豆沙拉', '番茄鸡蛋汤面', '松仁玉米', '柠檬水', '未知食物', '', null]) {
    assert.equal(lookup(n), null, String(n))
  }
})

test('anchor：每 100 克的热量偏太多就拉回到边上，营养素按表里的配比；没偏、认不出、没克数的原样', () => {
  const rice = { name: '米饭', portion: '一碗', grams: 150, kcal: 174, protein: 3.9, carbs: 38.9, fat: 0.5 }
  assert.equal(anchor(rice), rice)
  // 估成 180 千卡 / 100 克：拉回 116 × 1.15
  const high = anchor({ ...rice, kcal: 270, protein: 6, carbs: 60, fat: 1 })
  assert.deepEqual([high.kcal, high.protein, high.carbs, high.fat], [200, 4.5, 44.7, 0.5])
  assert.equal(high.grams, 150)
  // 估得太低也拉上来：红烧肉 150 → 400 × 0.7
  assert.equal(anchor({ name: '红烧肉', grams: 100, kcal: 150 }).kcal, 280)
  assert.equal('protein' in anchor({ name: '红烧肉', grams: 100, kcal: 150 }), false, '本来没营养素的不加')
  // 炒菜松一些：番茄炒蛋 95 ± 30%
  const egg = { name: '番茄炒蛋', grams: 200, kcal: 240 }
  assert.equal(anchor(egg), egg)
  // 茶、水最多一点点
  assert.equal(anchor({ name: '茶', grams: 300, kcal: 60 }).kcal, 18)
  const odd = { name: '神秘料理', grams: 100, kcal: 900 }
  assert.equal(anchor(odd), odd)
  const noGrams = { name: '米饭', grams: 0, kcal: 500 }
  assert.equal(anchor(noGrams), noGrams)
})

test('解析时就兜住：离谱的拉回来再加总；模型说看不清的记 unsure', () => {
  const a = parseMealAnalysis(
    JSON.stringify({
      isFood: true,
      foods: [
        { name: '米饭', portion: '一碗', grams: 150, kcal: 300, protein: 6, carbs: 66, fat: 1, shared: false },
        { name: '清炒青菜', portion: '半盘', grams: 100, kcal: 60, protein: 2, carbs: 4, fat: 4, unsure: true },
        { name: '一盘看不清的', portion: '一盘', grams: 200, kcal: 300, protein: 10, carbs: 20, fat: 20, unsure: 'yes' },
      ],
      rating: 'yellow',
      comment: 'c',
      suggestion: 's',
    }),
  )
  assert.equal(a.foods[0].kcal, 200)
  assert.equal(a.totalKcal, 200 + 60 + 300)
  assert.equal(a.carbs, 44.7 + 4 + 20)
  assert.equal(a.foods[1].unsure, true)
  assert.equal('unsure' in a.foods[0], false)
  assert.equal('unsure' in a.foods[2], false, '只认 true')
})

test('提示词里的参考是表里的数', () => {
  assert.match(promptRefs(), /米饭 116、白粥 46、馒头 223/)
  assert.match(promptRefs(), /炒青菜 55$/)
})
