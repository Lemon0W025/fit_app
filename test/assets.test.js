// test/assets.test.js
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { PETS } = require('../cloudfunctions/api/lib/shared/pets')
const { FOODS, TREATS } = require('../cloudfunctions/api/lib/shared/foods')
const { DECOR } = require('../cloudfunctions/api/lib/shared/decor')

const IMG = path.join(__dirname, '../miniprogram/images')
const exists = (...p) => fs.existsSync(path.join(IMG, ...p))

test('每只宠物、每样食物、每件装饰都有图；底图 16 块都在', () => {
  PETS.forEach((p) => {
    assert.ok(exists('camp', 'pets', `${p.id}.png`), p.id)
    assert.ok(exists('camp', 'pets', `${p.id}-face.png`), p.id)
  })
  FOODS.concat(TREATS).forEach((f) => assert.ok(exists('camp', 'foods', `${f.id}.png`), f.id))
  DECOR.forEach((d) => assert.ok(exists('camp', 'decor', `${d.id}.png`), d.id))
  for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) assert.ok(exists('camp', 'base', `t${r}${c}.jpg`), `t${r}${c}`)
})

test('主包不超过 2MB', () => {
  let total = 0
  const walk = (dir) => fs.readdirSync(dir).forEach((f) => {
    const p = path.join(dir, f)
    const st = fs.statSync(p)
    if (st.isDirectory()) walk(p)
    else total += st.size
  })
  walk(path.join(__dirname, '../miniprogram'))
  assert.ok(total < 2 * 1024 * 1024, `miniprogram ${total} 字节`)
})
