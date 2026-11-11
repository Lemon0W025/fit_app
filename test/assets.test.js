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
  })
  // 食盆不用了（食物直接下锅）：碗里的食物图、碗沿抠图都不进包
  assert.ok(!exists('camp', 'foods', 'bowl'))
  DECOR.forEach((d) => assert.ok(exists('camp', 'decor', `${d.id}.png`), d.id))
  ;['world.jpg', 'night-world.jpg'].forEach((f) => assert.ok(exists('camp', 'base', f), f))
  const { SCENE } = require('../cloudfunctions/api/lib/shared/camp')
  ;['', 'night-'].forEach((pfx) => {
    Object.keys(SCENE.cutouts).forEach((key) => {
      const files = key === 'pot' ? [0, 1, 2, 3].map((n) => `pot-${n}.png`) : [`${key}.png`]
      files.forEach((f) => assert.ok(exists('camp', 'cut', pfx + f), pfx + f))
    })
    assert.ok(exists('camp', 'cut', `${pfx}fire.jpg`), `${pfx}fire.jpg`)
    ;[0, 1].forEach((i) => assert.ok(!exists('camp', 'cut', `${pfx}bowl-${i}.png`), `${pfx}bowl-${i}.png`))
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

test('页面用到的线条图标（images/icons/*.svg）都在；页面模板里不拿表情符号当图标', () => {
  const MP = path.join(__dirname, '../miniprogram')
  const files = []
  const walk = (dir) => fs.readdirSync(dir).forEach((f) => {
    const p = path.join(dir, f)
    if (fs.statSync(p).isDirectory()) walk(p)
    else if (/\.(wxml|js)$/.test(f)) files.push(p)
  })
  walk(MP)
  const used = new Set()
  files.forEach((p) => {
    const text = fs.readFileSync(p, 'utf8')
    for (const m of text.matchAll(/\/images\/icons\/([\w-]+)\.svg/g)) used.add(m[1])
    // 两个都可能：heart / heart-on 是拼出来的
    if (/images\/icons\/\{\{/.test(text)) ['heart', 'heart-on'].forEach((n) => used.add(n))
  })
  assert.ok(used.size >= 12)
  used.forEach((name) => assert.ok(exists('icons', `${name}.svg`), name))
  // 打卡这几页（营地的页面另算）：模板里不再有当图标用的表情符号
  const EMOJI = /[\u{1F300}-\u{1FAFF}\u{23F0}\u{2696}\u{270D}\u{270F}]/u
  ;['today', 'checkin', 'meal', 'forest', 'profile', 'remind', 'week', 'family', 'manual', 'weight'].forEach((page) => {
    const wxml = fs.readFileSync(path.join(MP, 'pages', page, `${page}.wxml`), 'utf8')
    const hit = wxml.match(EMOJI)
    assert.ok(!hit || hit[0] === '👋', `${page}.wxml 里还有 ${hit && hit[0]}`)
  })
})
