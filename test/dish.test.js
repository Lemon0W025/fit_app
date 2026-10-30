// test/dish.test.js：一道菜的份量（shared/dish.js）。结果页的预览和云函数存的都按这一套算
const test = require('node:test')
const assert = require('node:assert/strict')
const { LIMITS, isShared, peopleOf, resize, share, totalsAfter } = require('../miniprogram/utils/shared/dish')
const { previewText, adjustView, adjustRequest } = require('../miniprogram/utils/portion')

const RICE = { name: '米饭', portion: '一碗', grams: 150, kcal: 174, protein: 3.9, carbs: 38.9, fat: 0.5, shared: false }
const PORK = { name: '青椒肉丝', portion: '一盘', grams: 300, kcal: 420, protein: 28, carbs: 16, fat: 27, shared: true }
const OLD = { name: '炒菜', portion: '一盘', kcal: 300 } // 老打卡：没克数、没营养素、没标 shared

test('resize：按克数 / 倍数缩放热量和营养素，记上改过；不对的说给她听', () => {
  assert.deepEqual(resize(RICE, { grams: 75 }).dish, { ...RICE, grams: 75, kcal: 87, protein: 2, carbs: 19.5, fat: 0.3, adjusted: true })
  assert.equal(resize(PORK, { factor: 0.5 }).dish.grams, 150)
  assert.deepEqual(resize(OLD, { factor: 1.5 }).dish, { ...OLD, kcal: 450, adjusted: true })
  assert.match(resize(OLD, { grams: 100 }).error, /按比例/)
  assert.match(resize(RICE, { grams: 0 }).error, /1～3000/)
  assert.match(resize(RICE, { grams: '100' }).error, /1～3000/)
  assert.match(resize(RICE, { factor: 6 }).error, /离谱/)
  assert.match(resize(RICE, {}).error, /改成多少/)
  // 热量封顶
  assert.equal(resize({ name: '油', grams: 10, kcal: 2000 }, { grams: 3000 }).dish.kcal, LIMITS.dishKcalMax)
  // 按人数分过的，她自己改了就以她改的为准
  assert.equal(resize(share(PORK, 1, 3), { grams: 120 }).dish.base, undefined)
})

test('share：按人数分，改来改去、改回原来的人数不偏', () => {
  const five = share(PORK, 1, 5)
  assert.deepEqual([five.grams, five.kcal, five.protein], [60, 84, 5.6])
  let d = PORK
  let before = 1
  for (const people of [5, 4, 7, 2, 1]) {
    d = share(d, before, people)
    before = people
  }
  assert.deepEqual(d, PORK)
  assert.equal(isShared(PORK), true)
  assert.equal(isShared(OLD), true)
  assert.equal(isShared(RICE), false)
})

test('totalsAfter：按这道菜的变化量加减；老打卡没营养素按总热量的比例缩放', () => {
  const a = { totalKcal: 594, protein: 31.9, carbs: 54.9, fat: 27.5 }
  const next = resize(RICE, { grams: 75 }).dish
  assert.deepEqual(totalsAfter(a, RICE, next), { totalKcal: 507, protein: 30, carbs: 35.5, fat: 27.3 })
  assert.deepEqual(totalsAfter(a, RICE, null), { totalKcal: 420, protein: 28, carbs: 16, fat: 27 })
  const old = { totalKcal: 520, protein: 20, carbs: 60, fat: 20 }
  assert.deepEqual(totalsAfter(old, OLD, resize(OLD, { factor: 0.5 }).dish), { totalKcal: 370, protein: 14.2, carbs: 42.7, fat: 14.2 })
})

test('peopleOf：1～20 的整数，不对当一个人', () => {
  assert.deepEqual([3, '4', 0, 21, 2.5, null, 'x'].map(peopleOf), [3, 4, 1, 1, 1, 1, 1])
})

// 结果页拖滑杆时大字上的热量，就是点「就这么多」后存下来的热量；快捷按钮、「一整份里我吃了」发出去的都是云函数认的
test('结果页的预览 = 存下来的；发出去的份量云函数都认', () => {
  for (const [dish, people] of [[RICE, 1], [PORK, 1], [PORK, 5], [OLD, 1], [OLD, 8]]) {
    const view = adjustView(dish, 0, people)
    const values = [view.min, view.max, view.value].concat(view.chips.map((c) => c.value), view.parts.map((p) => p.value))
    for (const v of values) {
      const req = adjustRequest(view, v) || (view.mode === 'grams' ? { grams: v } : { factor: v })
      const r = resize(dish, req)
      assert.ok(r.dish, `${dish.name} ${people} 人 ${JSON.stringify(req)}：${r.error}`)
      assert.ok(previewText(dish, view.mode, v).endsWith(`· ${r.dish.kcal} 千卡`), `${dish.name} ${v}：${previewText(dish, view.mode, v)} ≠ ${r.dish.kcal}`)
    }
  }
})
