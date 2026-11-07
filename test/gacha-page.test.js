// 扭蛋页：十连（camp.spinMany）
const test = require('node:test')
const assert = require('node:assert/strict')
const { createWx, loadPage, settle } = require('./helpers/page-harness')

const VIEW = { beans: 650, spinCost: 30, spinMany: 10, spinManyCost: 300, pityLeft: 4, rates: [{ id: 'common', label: '普通', weight: 65 }, { id: 'rare', label: '稀有', weight: 35 }], term: null }
const RESULTS = [
  ['xiaomi', 'common', true], ['xiaomi', 'common', false], ['huluobo', 'common', true], ['lianzi', 'rare', true], ['yumili', 'common', false],
  ['shizi', 'common', false], ['hetao', 'epic', true], ['xiaoyu', 'rare', false], ['putao', 'common', false], ['shanzha', 'legendary', true],
].map(([foodId, rarity, isNew]) => ({ foodId, rarity, isNew }))

function open(beans = 650) {
  const calls = []
  const wx = createWx(async (req) => {
    calls.push(req.action)
    if (req.action === 'camp.get') return { ok: true, data: { ...VIEW, beans } }
    if (req.action === 'camp.spinMany') return { ok: true, data: { results: RESULTS, beans: beans - 300, pityLeft: 10 } }
    return { ok: true, data: null }
  })
  const page = loadPage('gacha', wx)
  page.shakeMs = 0
  return { page, wx, calls }
}

test('十连：按钮写着 10 个 300 暖豆；点了机器摇一下，十个一起开，带稀有度颜色、「新」，一句总结；再来十连看暖豆够不够', async () => {
  const { page, wx, calls } = open()
  page.onShow()
  await settle()
  assert.deepEqual([page.data.spinMany, page.data.spinManyCost, page.data.beans], [10, 300, 650])
  page.spinMany()
  assert.equal(page.data.phase, 'shaking')
  await settle()
  assert.equal(page.data.phase, 'many')
  assert.equal(calls[calls.length - 1], 'camp.spinMany')
  assert.equal(page.data.beans, 350)
  assert.equal(page.data.pityLeft, 10)
  assert.equal(page.data.results.length, 10)
  assert.deepEqual(page.data.results.map((r) => r.name).slice(0, 3), ['小米', '小米', '胡萝卜'])
  assert.deepEqual(page.data.results.map((r) => r.isNew), RESULTS.map((r) => r.isNew))
  assert.equal(page.data.results[9].rarityLabel, '传说')
  assert.ok(page.data.results[6].rarityColor.startsWith('#'))
  assert.ok(page.data.results[0].image.endsWith('xiaomi.png'))
  assert.equal(page.data.manyText, '传说 1、珍稀 1、稀有 2，新吃的 5 样')
  // 摇着的时候再点不算；开着结果再来一次可以
  page.spinMany()
  await settle()
  assert.equal(calls.filter((c) => c === 'camp.spinMany').length, 2)
  page.closeResult()
  assert.deepEqual([page.data.phase, page.data.results], ['idle', []])
  assert.equal(wx.log.toasts.length, 0)
})

test('十连：暖豆不到 300 不扭、提示一句；单抽照旧', async () => {
  const { page, wx, calls } = open(200)
  page.onShow()
  await settle()
  page.spinMany()
  assert.equal(page.data.phase, 'idle')
  assert.match(wx.log.toasts.pop(), /十连要 300 暖豆/)
  assert.ok(!calls.includes('camp.spinMany'))
  const wxml = require('node:fs').readFileSync(require('node:path').join(__dirname, '../miniprogram/pages/gacha/gacha.wxml'), 'utf8')
  // 单抽、十连并排一行，各是一个带底座的大按钮（扭几次 + 暖豆价钱），十连角上「必出珍稀」
  assert.match(wxml, /class="pull-row[^"]*"[\s\S]*bindtap="spin"[\s\S]*\{\{spinCost\}\}[\s\S]*bindtap="spinMany"[\s\S]*必出珍稀[\s\S]*\{\{spinManyCost\}\}/)
  assert.equal(page.data.tenSure, true)
  assert.match(wxml, /wx:elif="\{\{phase === 'many'\}\}"/)
})
