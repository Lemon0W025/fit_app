// test/pets.test.js
const test = require('node:test')
const assert = require('node:assert/strict')
const { PETS, petById, OLD_TO_PET } = require('../cloudfunctions/api/lib/shared/pets')
const { foodById } = require('../cloudfunctions/api/lib/shared/foods')

test('12 只宠物：id 唯一、四档数量、每只两样爱吃的、8 句以上台词、5 句小故事', () => {
  assert.equal(PETS.length, 12)
  assert.equal(new Set(PETS.map((p) => p.id)).size, 12)
  const count = (r) => PETS.filter((p) => p.rarity === r).length
  assert.deepEqual([count('common'), count('rare'), count('epic'), count('legendary')], [4, 4, 3, 1])
  PETS.forEach((p) => {
    assert.equal(p.foods.length, 2, p.id)
    p.foods.forEach((f) => assert.ok(foodById(f), `${p.id} 爱吃的 ${f} 不在食物表里`))
    assert.ok(p.lines.tap.length >= 8, p.id)
    ;['morning', 'night', 'fed', 'dislike', 'hello'].forEach((k) => assert.equal(typeof p.lines[k], 'string', `${p.id}.${k}`))
    assert.equal(p.story.length, 5, p.id)
    assert.ok(p.hook && p.mood && p.special.name && p.special.line, p.id)
    assert.ok(p.size >= 200 && p.size <= 420, p.id)
    assert.ok(['pad', 'waddle', 'hop', 'crawl', 'stride', 'fly'].indexOf(p.gait) !== -1, p.id)
    assert.ok(typeof p.speed === 'number' && p.speed > 0, p.id)
  })
  assert.deepEqual(petById('hehe').hours, [5, 9])
  assert.equal(petById('doudou').hours, undefined)
  assert.equal(petById('nope'), null)
})

test('旧动物都有去处', () => {
  assert.deepEqual(OLD_TO_PET, {
    panda: 'sunbao', panda_family: 'sunbao', ginger_cat: 'jutuan', chick: 'doudou', rabbit: 'nuonuo',
    duck: 'lianlian', turtle: 'guigui', tabby_cat: 'huahua', crane: 'hehe',
  })
  Object.values(OLD_TO_PET).forEach((id) => assert.ok(petById(id), id))
})
