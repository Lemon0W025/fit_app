const test = require('node:test')
const assert = require('node:assert/strict')
const { extractJson, parseMealAnalysis, cleanSummaryText } = require('../cloudfunctions/api/lib/parse')

const good = {
  isFood: true,
  foods: [
    { name: '米饭', portion: '一碗', kcal: 230 },
    { name: '红烧肉', portion: '6块', kcal: 400 },
  ],
  totalKcal: 630,
  protein: 22.33,
  carbs: 60,
  fat: 32,
  rating: 'red',
  comment: '红烧肉有点多啦',
  suggestion: '晚上清淡些',
}

test('extractJson 解析纯 JSON', () => {
  assert.deepEqual(extractJson(JSON.stringify(good)), good)
})

test('extractJson 去掉 ```json 围栏和前后废话', () => {
  const text = '好的，以下是分析：\n```json\n' + JSON.stringify(good) + '\n```\n希望有帮助'
  assert.deepEqual(extractJson(text), good)
})

test('extractJson 没有 JSON 时抛错', () => {
  assert.throws(() => extractJson('我看不清这张图'))
  assert.throws(() => extractJson(''))
  assert.throws(() => extractJson(undefined))
})

test('parseMealAnalysis 归一化正常结果', () => {
  const a = parseMealAnalysis(JSON.stringify(good))
  assert.deepEqual(a, {
    isFood: true,
    foods: good.foods,
    totalKcal: 630,
    protein: 22.3,
    carbs: 60,
    fat: 32,
    rating: 'red',
    comment: '红烧肉有点多啦',
    suggestion: '晚上清淡些',
  })
})

test('parseMealAnalysis totalKcal 缺失时用 foods 求和', () => {
  const a = parseMealAnalysis(JSON.stringify({ ...good, totalKcal: undefined }))
  assert.equal(a.totalKcal, 630)
})

test('parseMealAnalysis 数字字符串、负数、缺字段的容错', () => {
  const a = parseMealAnalysis(JSON.stringify({
    foods: [{ name: '苹果', kcal: '-5' }, { kcal: 100 }, 'bad'],
    totalKcal: '120',
    protein: -3,
    rating: 'purple',
  }))
  assert.equal(a.isFood, true)
  assert.deepEqual(a.foods, [
    { name: '苹果', portion: '', kcal: 0 },
    { name: '未知食物', portion: '', kcal: 100 },
  ])
  assert.equal(a.totalKcal, 120)
  assert.equal(a.protein, 0)
  assert.equal(a.carbs, 0)
  assert.equal(a.rating, 'yellow')
  assert.equal(a.comment, '')
  assert.equal(a.suggestion, '')
})

test('parseMealAnalysis 钳制离谱的数值', () => {
  const a = parseMealAnalysis(JSON.stringify({ foods: [{ name: 'x', kcal: 99999 }], totalKcal: 99999, fat: 5000 }))
  assert.equal(a.foods[0].kcal, 5000)
  assert.equal(a.totalKcal, 10000)
  assert.equal(a.fat, 1000)
})

test('parseMealAnalysis 非食物时评级为 null、热量为 0', () => {
  const a = parseMealAnalysis(JSON.stringify({ isFood: false, comment: '这好像是一只猫', totalKcal: 300, rating: 'green' }))
  assert.equal(a.isFood, false)
  assert.equal(a.rating, null)
  assert.equal(a.totalKcal, 0)
  assert.deepEqual(a.foods, [])
  assert.equal(a.comment, '这好像是一只猫')
})

test('parseMealAnalysis 截断过长的点评和菜品数量', () => {
  const foods = Array.from({ length: 20 }, (_, i) => ({ name: '菜' + i, kcal: 10 }))
  const a = parseMealAnalysis(JSON.stringify({ foods, comment: '啊'.repeat(500), suggestion: '好'.repeat(500) }))
  assert.equal(a.foods.length, 12)
  assert.equal(a.comment.length, 200)
  assert.equal(a.suggestion.length, 200)
})

test('parseMealAnalysis 解析失败抛错', () => {
  assert.throws(() => parseMealAnalysis('抱歉，我无法识别'))
  assert.throws(() => parseMealAnalysis('[1,2,3]'))
})

test('cleanSummaryText 去掉围栏、标题符号并截断', () => {
  assert.equal(cleanSummaryText('```\n## 今日总结\n吃得不错！\n```'), '今日总结\n吃得不错！')
  assert.equal(cleanSummaryText('  好\n\n\n\n棒  '), '好\n\n棒')
  assert.equal(cleanSummaryText('字'.repeat(600)).length, 400)
  assert.equal(cleanSummaryText(undefined), '')
})
