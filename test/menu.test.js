// test/menu.test.js
const test = require('node:test')
const assert = require('node:assert/strict')
const { dailyMenu } = require('../cloudfunctions/api/lib/menu')
const { FOODS, TREATS, foodById } = require('../cloudfunctions/api/lib/shared/foods')
const { PETS, petById } = require('../cloudfunctions/api/lib/shared/pets')

const RANK = { common: 0, rare: 1, epic: 2, legendary: 3 }

test('今日菜单：同一天一样、换一天不一样；只有普通食物，点心没有', () => {
  assert.deepEqual(dailyMenu('2026-10-26'), dailyMenu('2026-10-26'))
  assert.notDeepEqual(dailyMenu('2026-10-26'), dailyMenu('2026-10-27'))
  const m = dailyMenu('2026-10-26')
  assert.deepEqual(Object.keys(m).sort(), FOODS.map((f) => f.id).sort())
  TREATS.forEach((t) => assert.equal(m[t.id], undefined))
})

test('今日菜单：本来爱吃、同稀有度的一直在；加的是同档或低一档的；最多 3 只、不重复', () => {
  let extras = 0
  for (let d = 1; d <= 60; d++) {
    const date = `2026-${String(11 + Math.floor((d - 1) / 30)).padStart(2, '0')}-${String(((d - 1) % 30) + 1).padStart(2, '0')}`
    const m = dailyMenu(date)
    FOODS.forEach((f) => {
      const list = m[f.id]
      const natives = PETS.filter((p) => p.foods.includes(f.id) && p.rarity === f.rarity).map((p) => p.id)
      natives.forEach((id) => assert.ok(list.includes(id), `${date} ${f.id} 少了本来爱吃的 ${id}`))
      assert.ok(list.length <= 3 && list.length >= natives.length, `${date} ${f.id} ${list}`)
      assert.equal(new Set(list).size, list.length)
      list.filter((id) => !natives.includes(id)).forEach((id) => {
        const gap = RANK[foodById(f.id).rarity] - RANK[petById(id).rarity]
        assert.ok(gap === 0 || gap === 1, `${date} ${f.id}（${f.rarity}）加了 ${id}（${petById(id).rarity}）`)
        extras += 1
      })
    })
  }
  assert.ok(extras > 60 * 23 * 0.8, `加的太少：${extras}`)
  // 普通食物只会引普通的
  const m = dailyMenu('2026-10-26')
  FOODS.filter((f) => f.rarity === 'common').forEach((f) => m[f.id].forEach((id) => assert.equal(petById(id).rarity, 'common')))
  assert.ok(m.shanzha.includes('hehe'))
})
