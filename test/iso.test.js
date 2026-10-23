const test = require('node:test')
const assert = require('node:assert/strict')
const { gridLayout, isoLayout, tileTop, tileCenter, tileAt } = require('../miniprogram/utils/iso')

const L = isoLayout(6, 360)

test('isoLayout：菱形格宽高 2:1，顶部留出高物件的空间', () => {
  assert.equal(L.tileW, 60)
  assert.equal(L.tileH, 30)
  assert.equal(L.originX, 180)
  assert.ok(L.top > 0)
  assert.equal(L.landHeight, 6 * 30 + L.depth)
  assert.equal(L.height, L.top + L.landHeight)
})

test('tileTop / tileCenter：(0,0) 在最上面，(5,0) 在右，(0,5) 在左', () => {
  assert.deepEqual(tileTop(0, 0, L), { x: 180, y: L.top })
  assert.deepEqual(tileCenter(0, 0, L), { x: 180, y: L.top + 15 })
  assert.equal(tileCenter(5, 0, L).x, 180 + 5 * 30)
  assert.equal(tileCenter(0, 5, L).x, 180 - 5 * 30)
  assert.equal(tileCenter(5, 5, L).y, L.top + 10 * 15 + 15)
})

test('tileAt：点每个格子的中心都能反算回这个格子', () => {
  for (let c = 0; c < 6; c++) {
    for (let r = 0; r < 6; r++) {
      const { x, y } = tileCenter(c, r, L)
      assert.deepEqual(tileAt(x, y, L), { c, r })
    }
  }
})

test('tileAt：菱形边缘附近按菱形归属，不按方框', () => {
  const { x, y } = tileTop(2, 2, L)
  // 顶点正下方一点点属于 (2,2)，正上方一点点属于 (1,1)
  assert.deepEqual(tileAt(x, y + 2, L), { c: 2, r: 2 })
  assert.deepEqual(tileAt(x, y - 2, L), { c: 1, r: 1 })
  // 顶点左右两侧分别属于 (1,2) 和 (2,1)
  assert.deepEqual(tileAt(x - 5, y, L), { c: 1, r: 2 })
  assert.deepEqual(tileAt(x + 5, y, L), { c: 2, r: 1 })
})

test('tileAt：点到地块外面返回 null', () => {
  assert.equal(tileAt(180, L.top - 5, L), null)
  assert.equal(tileAt(2, L.top + 15, L), null)
  assert.equal(tileAt(180, L.top + 6 * 30 + 5, L), null)
})

test('gridLayout：长方形网格，(0,0) 顶点在 rows × 半格宽处', () => {
  const L = gridLayout(37, 28, 40)
  assert.deepEqual([L.cols, L.rows, L.size], [37, 28, 37])
  assert.equal(L.tileW, 40)
  assert.equal(L.tileH, 20)
  assert.equal(L.width, (37 + 28) * 20)
  assert.equal(L.originX, 28 * 20)
  assert.equal(L.top, 52)
  assert.equal(L.height, 52 + (37 + 28) * 10 + 8)
  // 最左、最右、最下三个角
  assert.deepEqual(tileTop(0, 28, L), { x: 0, y: 52 + 28 * 10 })
  assert.deepEqual(tileTop(37, 0, L), { x: L.width, y: 52 + 37 * 10 })
  assert.deepEqual(tileTop(37, 28, L), { x: L.originX + 9 * 20, y: 52 + 65 * 10 })
  // isoLayout 还是正方形，只是多了 cols / rows
  const S = isoLayout(6, 360)
  assert.deepEqual([S.cols, S.rows, S.size, S.tileW, S.width], [6, 6, 6, 60, 360])
})

test('tileAt：长方形网格按 cols / rows 判边界', () => {
  const L = gridLayout(37, 28, 40)
  const c = tileCenter(36, 27, L)
  assert.deepEqual(tileAt(c.x, c.y, L), { c: 36, r: 27 })
  const out = tileCenter(36, 28, L)
  assert.equal(tileAt(out.x, out.y, L), null)
  const out2 = tileCenter(37, 10, L)
  assert.equal(tileAt(out2.x, out2.y, L), null)
})
