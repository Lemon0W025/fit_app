const test = require('node:test')
const assert = require('node:assert/strict')
const { sliderFor, previewText, adjustView, adjustRequest } = require('../miniprogram/utils/portion')

const rice = { name: '米饭', portion: '一碗', grams: 150, kcal: 174 }

test('滑杆范围：按克数定一格多大，最多拖到原来的 2.5 倍（取整到 10 格）、不超过 3000 克', () => {
  assert.deepEqual(sliderFor(rice), { mode: 'grams', min: 10, max: 400, step: 10, value: 150, unit: ' 克', prefix: '' })
  assert.deepEqual(sliderFor({ grams: 30, kcal: 50 }), { mode: 'grams', min: 5, max: 100, step: 5, value: 30, unit: ' 克', prefix: '' })
  assert.deepEqual(sliderFor({ grams: 800, kcal: 900 }), { mode: 'grams', min: 50, max: 2000, step: 50, value: 800, unit: ' 克', prefix: '' })
  assert.equal(sliderFor({ grams: 2000, kcal: 900 }).max, 3000)
  assert.equal(sliderFor({ grams: 8, kcal: 10 }).max, 50)
  // 老打卡没克数：按倍数
  assert.deepEqual(sliderFor({ name: '炒菜', kcal: 300 }), { mode: 'factor', min: 0.25, max: 3, step: 0.25, value: 1, unit: ' 倍', prefix: '×' })
  assert.equal(sliderFor({ grams: 0, kcal: 300 }).mode, 'factor')
})

test('拖的时候的大字：克数 → 热量按比例；倍数 → 「原来的 1.5 倍」', () => {
  assert.equal(previewText(rice, 'grams', 150), '约 150 克 · 174 千卡')
  assert.equal(previewText(rice, 'grams', 75), '约 75 克 · 87 千卡')
  assert.equal(previewText({ kcal: 300 }, 'factor', 1), '和原来一样 · 300 千卡')
  assert.equal(previewText({ kcal: 300 }, 'factor', 1.5), '原来的 1.5 倍 · 450 千卡')
  assert.equal(previewText({ kcal: 300 }, 'factor', 0.25), '原来的 0.25 倍 · 75 千卡')
})

test('打开的样子：标题、快捷按钮（相对现在的份量、落在格上、不出范围）', () => {
  const v = adjustView(rice, 2)
  assert.equal(v.index, 2)
  assert.equal(v.title, '米饭吃了多少？')
  assert.equal(v.preview, '约 150 克 · 174 千卡')
  assert.deepEqual(v.chips, [
    { label: '一半', value: 80 },
    { label: '少一点', value: 110 },
    { label: '原样', value: 150 },
    { label: '多一点', value: 230 },
    { label: '两倍', value: 300 },
  ])
  const old = adjustView({ name: '炒菜', kcal: 300 }, 0)
  assert.deepEqual(old.chips.map((c) => c.value), [0.5, 0.75, 1, 1.5, 2])
})

test('就这么多：克数发 grams、倍数发 factor，没动就不发', () => {
  const v = adjustView(rice, 0)
  assert.equal(adjustRequest(v, 150), null)
  assert.deepEqual(adjustRequest(v, 110), { grams: 110 })
  const old = adjustView({ name: '炒菜', kcal: 300 }, 1)
  assert.equal(adjustRequest(old, 1), null)
  assert.deepEqual(adjustRequest(old, 0.5), { factor: 0.5 })
})
