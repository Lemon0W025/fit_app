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

test('每只宠物、每样食物、每件装饰都有图；日 / 夜垫图和抠图兜底都在', () => {
  PETS.forEach((p) => {
    assert.ok(exists('camp', 'pets', `${p.id}.png`), p.id)
    assert.ok(exists('camp', 'pets', `${p.id}-face.png`), p.id)
  })
  FOODS.concat(TREATS).forEach((f) => {
    assert.ok(exists('camp', 'foods', `${f.id}.png`), f.id)
    assert.ok(exists('camp', 'foods', 'bowl', `${f.id}.png`), `碗里的 ${f.id}`)
  })
  DECOR.forEach((d) => assert.ok(exists('camp', 'decor', `${d.id}.png`), d.id))
  ;['backdrop.jpg', 'night-backdrop.jpg'].forEach((f) => assert.ok(exists('camp', 'base', f), f))
  const { SCENE } = require('../cloudfunctions/api/lib/shared/camp')
  ;['', 'night-'].forEach((pfx) => {
    Object.keys(SCENE.cutouts).forEach((key) => {
      const files = key === 'pot' ? [0, 1, 2, 3].map((n) => `pot-${n}.png`) : [`${key}.png`]
      files.forEach((f) => assert.ok(exists('camp', 'cut', pfx + f), pfx + f))
    })
    assert.ok(exists('camp', 'cut', `${pfx}fire.jpg`), `${pfx}fire.jpg`)
    ;[0, 1].forEach((i) => assert.ok(exists('camp', 'cut', `${pfx}bowl-${i}.png`), `${pfx}bowl-${i}.png`))
  })
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
