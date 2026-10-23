const test = require('node:test')
const assert = require('node:assert/strict')
const E = require('../cloudfunctions/api/lib/shared/estate')

const START = ['front', 'main']
const ALL = E.AREAS.map((a) => a.id)

test('11 个院子：价格、相邻、开局两个', () => {
  assert.deepEqual(E.AREAS.map((a) => [a.id, a.cost]), [
    ['front', 0], ['main', 0], ['pond', 200], ['flower', 200], ['orchard', 300], ['veg', 300],
    ['bamboo', 400], ['tea', 400], ['farm', 500], ['spring', 500], ['back', 700],
  ])
  assert.equal(E.AREAS.reduce((s, a) => s + a.cost, 0), 3500)
  assert.deepEqual(E.START_OPENED, ['front', 'main'])
  assert.deepEqual(E.areaById('main').neighbors.sort(), ['bamboo', 'front', 'pond'])
  assert.deepEqual(E.areaById('back').neighbors.sort(), ['farm', 'pond', 'spring'])
  assert.deepEqual(E.areaById('front').neighbors.sort(), ['flower', 'main', 'orchard'])
  assert.equal(E.areaById('nope'), null)
  // 相邻是双向的
  E.AREAS.forEach((a) => a.neighbors.forEach((n) => assert.ok(E.areaById(n).neighbors.indexOf(a.id) !== -1, `${a.id}-${n}`)))
  assert.deepEqual(E.areaCenter('main'), { c: 14, r: 14 })
})

test('格子表：墙、门、院子里的地面', () => {
  assert.deepEqual(E.tileInfo(0, 0), { area: '', kind: 'wall' })
  assert.deepEqual(E.tileInfo(9, 13), { area: '', kind: 'gate' })
  assert.deepEqual(E.tileInfo(13, 27), { area: '', kind: 'door' })
  assert.deepEqual(E.tileInfo(11, 16), { area: 'main', kind: 'lawn' })
  assert.deepEqual(E.tileInfo(13, 15), { area: 'main', kind: 'path' })
  assert.deepEqual(E.tileInfo(12, 11), { area: 'main', kind: 'block' })
  assert.deepEqual(E.tileInfo(22, 13), { area: 'pond', kind: 'water' })
  assert.deepEqual(E.tileInfo(19, 13), { area: 'pond', kind: 'pave' })
  assert.deepEqual(E.tileInfo(19, 22), { area: 'flower', kind: 'soil' })
  assert.deepEqual(E.tileInfo(21, 22), { area: 'flower', kind: 'path' })
  assert.deepEqual(E.tileInfo(28, 25), { area: 'veg', kind: 'block' })
  assert.deepEqual(E.tileInfo(13, 24), { area: 'front', kind: 'block' })
  assert.deepEqual(E.tileInfo(29, 13), { area: 'tea', kind: 'pave' })
  assert.deepEqual(E.tileInfo(32, 3), { area: 'spring', kind: 'water' })
  assert.deepEqual(E.tileInfo(18, 5), { area: 'back', kind: 'lawn' }) // 后花园占两列，中间没有墙
  assert.deepEqual(E.tileInfo(37, 0), { area: '', kind: 'out' })
  assert.deepEqual(E.tileInfo(-1, 0), { area: '', kind: 'out' })
  assert.deepEqual(E.tileInfo(1.5, 2), { area: '', kind: 'out' })
  assert.deepEqual(E.STARTER_TILE, { c: 11, r: 16 })
})

test('每个院子都有能摆的草地；门两边能走；活动点都能走到', () => {
  E.AREAS.forEach((a) => {
    const lawn = E.areaTiles(a.id).filter((t) => E.tileInfo(t.c, t.r).kind === 'lawn')
    assert.ok(lawn.length >= 8, a.id)
    assert.ok(E.areaTiles(a.id).every((t) => E.tileInfo(t.c, t.r).area === a.id), a.id)
  })
  E.GATES.forEach((g) => {
    g.tiles.forEach(([c, r]) => {
      assert.equal(E.tileInfo(c, r).kind, 'gate', `${c},${r}`)
      const across = [[c + 1, r], [c - 1, r]].every(([x, y]) => E.walkable(ALL, x, y))
        || [[c, r + 1], [c, r - 1]].every(([x, y]) => E.walkable(ALL, x, y))
      assert.ok(across, `门 ${c},${r} 两边走不通`)
    })
  })
  E.SPOTS.forEach((s) => {
    assert.equal(E.tileInfo(s.c, s.r).area, s.area, s.id)
    assert.ok(E.walkable(ALL, s.c, s.r, true), s.id)
  })
})

test('全部修好时，从大门里能走到每一块能走的地', () => {
  const all = new Set()
  for (let c = 0; c < E.GRID.cols; c++) {
    for (let r = 0; r < E.GRID.rows; r++) if (E.walkable(ALL, c, r)) all.add(`${c},${r}`)
  }
  const seen = new Set(['13,26'])
  const queue = [{ c: 13, r: 26 }]
  while (queue.length) {
    const t = queue.shift()
    for (const n of [{ c: t.c + 1, r: t.r }, { c: t.c - 1, r: t.r }, { c: t.c, r: t.r + 1 }, { c: t.c, r: t.r - 1 }]) {
      const k = `${n.c},${n.r}`
      if (all.has(k) && !seen.has(k)) {
        seen.add(k)
        queue.push(n)
      }
    }
  }
  assert.equal(seen.size, all.size)
})

test('walkable：没修的院子、水、墙都不能走；水鸟能下水；门要两边都修好', () => {
  assert.equal(E.walkable(START, 11, 16), true)
  assert.equal(E.walkable(START, 13, 15), true)
  assert.equal(E.walkable(START, 19, 22), false)
  assert.equal(E.walkable(['front', 'main', 'flower'], 19, 22), true)
  assert.equal(E.walkable(START, 13, 18), true)
  assert.equal(E.walkable(START, 18, 13), false)
  assert.equal(E.walkable(['front', 'main', 'pond'], 18, 13), true)
  assert.equal(E.walkable(['front', 'main', 'pond'], 22, 13), false)
  assert.equal(E.walkable(['front', 'main', 'pond'], 22, 13, true), true)
  assert.equal(E.walkable(START, 12, 11), false)
  assert.equal(E.walkable(START, 13, 27), false)
  assert.equal(E.walkable(START, 0, 0), false)
  assert.equal(E.walkable(START, 50, 50), false)
})

test('canUnlock / unlockProblem：要挨着修好的院子', () => {
  assert.deepEqual(E.AREAS.filter((a) => E.canUnlock(START, a.id)).map((a) => a.id), ['pond', 'flower', 'orchard', 'bamboo'])
  assert.equal(E.unlockProblem(START, 'spring'), '要先修好旁边的院子')
  assert.equal(E.unlockProblem(START, 'main'), '这个院子已经修整好了')
  assert.equal(E.unlockProblem(START, 'moon'), '没有这个院子')
  assert.equal(E.unlockProblem(START, undefined), '没有这个院子')
  assert.equal(E.unlockProblem(START, 'pond'), '')
  assert.equal(E.canUnlock(['front', 'main', 'pond', 'tea'], 'spring'), true)
  assert.equal(E.canUnlock(['front', 'main', 'pond'], 'back'), true)
  assert.equal(E.canUnlock(START, 'back'), false)
})

test('signTile：木牌立在门里侧、还没修的那一边', () => {
  assert.deepEqual(E.signTile(START, 'pond'), { c: 19, r: 13 })
  assert.deepEqual(E.signTile(START, 'orchard'), { c: 8, r: 22 })
  assert.deepEqual(E.signTile(START, 'bamboo'), { c: 8, r: 13 })
  assert.equal(E.signTile(START, 'spring'), null)
  assert.equal(E.signTile(START, 'main'), null)
  assert.deepEqual(E.signTile(['front', 'main', 'pond'], 'tea'), { c: 28, r: 13 })
})

test('footprint / occupiedTiles：2×2 的左前角和它盖住的格子', () => {
  assert.deepEqual(E.footprint('daisy', 5, 5), [{ c: 5, r: 5 }])
  assert.deepEqual(E.footprint('pavilion', 5, 5), [{ c: 5, r: 5 }, { c: 4, r: 5 }, { c: 5, r: 4 }, { c: 4, r: 4 }])
  assert.deepEqual(E.footprint('nope', 5, 5), [{ c: 5, r: 5 }])
  const taken = E.occupiedTiles([{ uid: 'a', itemId: 'pavilion', c: 16, r: 16 }, { uid: 'b', itemId: 'daisy', c: 10, r: 15 }], 'b')
  assert.deepEqual([...taken].sort(), ['15,15', '15,16', '16,15', '16,16'])
})

test('placeProblem：每种不能摆的原因', () => {
  const placed = [{ uid: 'p1', itemId: 'starter_tree', c: 11, r: 16 }, { uid: 'p2', itemId: 'pavilion', c: 16, r: 16 }]
  const opened = ['front', 'main', 'pond', 'flower']
  const P = (itemId, c, r, ignore) => E.placeProblem(opened, placed, itemId, c, r, ignore)
  assert.equal(P('daisy', 0, 0), '放不到这里哦')
  assert.equal(P('daisy', 12, 11), '放不到这里哦')
  assert.equal(P('daisy', 13, 27), '放不到这里哦')
  assert.equal(P('daisy', 40, 2), '放不到这里哦')
  assert.equal(P('daisy', 3, 22), '这个院子还没修整呢')
  assert.equal(P('daisy', 13, 15), '小路上不能摆东西')
  assert.equal(P('daisy', 13, 18), '小路上不能摆东西')
  assert.equal(P('daisy', 22, 13), '这是水里，放不了它')
  assert.equal(P('stool', 19, 22), '土里只能种花种菜')
  assert.equal(P('daisy', 19, 13), '石板地上种不了，换块草地')
  assert.equal(P('daisy', 11, 16), '这块地上已经有东西了')
  assert.equal(P('daisy', 15, 15), '这块地上已经有东西了')
  assert.equal(P('pavilion', 12, 17), '这里放不下它')
  assert.equal(P('pavilion', 10, 15), '这里放不下它')
  assert.equal(P('pavilion', 17, 17), '这里放不下它')
  assert.equal(P('pavilion', 17, 17, 'p2'), '')
  assert.equal(P('daisy', 19, 22), '')
  assert.equal(P('cabbage', 19, 22), '')
  assert.equal(P('stool', 19, 13), '')
  assert.equal(P('daisy', 10, 15), '')
  assert.equal(P('daisy', 11, 16, 'p1'), '')
  assert.equal(P('nope', 10, 15), '放不到这里哦')
})

test('placeableTiles：开局 47 块草地能摆雏菊；亭子只有 2×2 都空着的角', () => {
  const placed = [{ uid: 'p1', itemId: 'starter_tree', c: 11, r: 16 }]
  assert.equal(E.placeableTiles(START, placed, 'daisy').length, 47)
  assert.equal(E.placeableTiles(START, placed, 'stool').length, 47)
  assert.equal(E.placeableTiles(START, placed, 'daisy', 'p1').length, 48)
  const big = E.placeableTiles(START, placed, 'pavilion')
  assert.ok(big.length > 0 && big.length < 47)
  big.forEach((t) => assert.equal(E.placeProblem(START, placed, 'pavilion', t.c, t.r), ''))
  assert.ok(big.some((t) => t.c === 16 && t.r === 16))
  assert.ok(!big.some((t) => t.c === 12 && t.r === 17))
  assert.equal(E.placeableTiles(['front', 'main', 'pond'], [], 'daisy').length, 47 + 1 + E.areaTiles('pond').filter((t) => E.tileInfo(t.c, t.r).kind === 'lawn').length)
})
