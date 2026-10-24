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
  assert.deepEqual(E.areaById('main').neighbors.sort(), ['back', 'bamboo', 'farm', 'front', 'pond'])
  assert.deepEqual(E.areaById('back').neighbors.sort(), ['main', 'pond', 'spring'])
  assert.deepEqual(E.areaById('front').neighbors.sort(), ['main', 'orchard'])
  assert.deepEqual(E.areaById('flower').neighbors.sort(), ['pond', 'veg'])
  assert.equal(E.areaById('nope'), null)
  // 相邻是双向的，同一对院子有两道门也只算一次
  E.AREAS.forEach((a) => {
    a.neighbors.forEach((n) => assert.ok(E.areaById(n).neighbors.indexOf(a.id) !== -1, `${a.id}-${n}`))
    assert.equal(new Set(a.neighbors).size, a.neighbors.length, a.id)
  })
  assert.deepEqual(E.areaCenter('main'), { c: 16, r: 14 })
})

test('格子表：墙、门、院子里的地面（照第二版原画定）', () => {
  assert.deepEqual(E.tileInfo(0, 0), { area: '', kind: 'wall', fence: 'outer' })
  assert.deepEqual(E.tileInfo(14, 27), { area: '', kind: 'door', fence: 'outer' })
  // 隔断各不一样：正院西侧白墙上的月亮门、前院的矮木栏缺口、小溪上的木板桥、动物小院下来的台阶、绿篱、石柱
  assert.deepEqual(E.tileInfo(12, 15), { area: '', kind: 'wall', fence: 'wall' })
  assert.deepEqual(E.tileInfo(12, 16), { area: '', kind: 'gate', fence: 'wall' })
  assert.deepEqual(E.tileInfo(16, 20), { area: '', kind: 'gate', fence: 'fence' })
  assert.deepEqual(E.tileInfo(21, 15), { area: '', kind: 'gate', fence: 'stream' })
  assert.deepEqual(E.tileInfo(8, 9), { area: '', kind: 'gate', fence: 'cliff' })
  assert.deepEqual(E.tileInfo(20, 9), { area: '', kind: 'gate', fence: 'post' })
  assert.deepEqual(E.tileInfo(29, 12), { area: '', kind: 'wall', fence: 'hedge' })
  assert.deepEqual(E.tileInfo(13, 20), { area: '', kind: 'wall', fence: 'fence' })
  assert.deepEqual(E.tileInfo(11, 20), { area: '', kind: 'wall', fence: 'post' })
  assert.ok(Object.keys(E.FENCE_TILES).every((t) => E.FENCE_TYPES.indexOf(t) !== -1))
  // 正院：正房、台阶、房前石板场和两块草地、月亮门墙西边那列归竹林院
  assert.deepEqual(E.tileInfo(12, 11), { area: 'main', kind: 'block' })
  assert.deepEqual(E.tileInfo(14, 15), { area: 'main', kind: 'path' })
  assert.deepEqual(E.tileInfo(13, 16), { area: 'main', kind: 'pave' })
  assert.deepEqual(E.tileInfo(15, 18), { area: 'main', kind: 'lawn' })
  assert.deepEqual(E.tileInfo(11, 16), { area: 'bamboo', kind: 'lawn' })
  assert.deepEqual(E.tileInfo(11, 8), { area: 'main', kind: 'lawn' })
  // 荷塘院：小溪、方塘、塘边草地、房东侧铺地
  assert.deepEqual(E.tileInfo(21, 13), { area: 'pond', kind: 'water' })
  assert.deepEqual(E.tileInfo(25, 14), { area: 'pond', kind: 'water' })
  assert.deepEqual(E.tileInfo(22, 14), { area: 'pond', kind: 'lawn' })
  assert.deepEqual(E.tileInfo(21, 10), { area: 'pond', kind: 'pave' })
  // 后花园：瀑布、小溪、沿墙的石头、草地；温泉；茶院的茶台和水井；两组菜畦；枯山水；鸡舍
  assert.deepEqual(E.tileInfo(13, 1), { area: 'back', kind: 'water' })
  assert.deepEqual(E.tileInfo(17, 4), { area: 'back', kind: 'water' })
  assert.deepEqual(E.tileInfo(12, 1), { area: 'back', kind: 'block' })
  assert.deepEqual(E.tileInfo(20, 2), { area: 'back', kind: 'block' })
  assert.deepEqual(E.tileInfo(18, 5), { area: 'back', kind: 'lawn' })
  assert.deepEqual(E.tileInfo(34, 6), { area: 'spring', kind: 'water' })
  assert.deepEqual(E.tileInfo(31, 2), { area: 'spring', kind: 'block' })
  assert.deepEqual(E.tileInfo(31, 16), { area: 'tea', kind: 'pave' })
  assert.deepEqual(E.tileInfo(34, 16), { area: 'tea', kind: 'block' })
  assert.deepEqual(E.tileInfo(33, 11), { area: 'tea', kind: 'block' })
  assert.deepEqual(E.tileInfo(24, 23), { area: 'flower', kind: 'soil' })
  assert.deepEqual(E.tileInfo(32, 22), { area: 'veg', kind: 'soil' })
  assert.deepEqual(E.tileInfo(5, 18), { area: 'bamboo', kind: 'pave' })
  assert.deepEqual(E.tileInfo(3, 14), { area: 'bamboo', kind: 'block' })
  assert.deepEqual(E.tileInfo(8, 16), { area: 'bamboo', kind: 'path' })
  assert.deepEqual(E.tileInfo(2, 22), { area: 'orchard', kind: 'block' })
  assert.deepEqual(E.tileInfo(3, 2), { area: 'farm', kind: 'block' })
  assert.deepEqual(E.tileInfo(15, 24), { area: 'front', kind: 'pave' })
  assert.deepEqual(E.tileInfo(16, 21), { area: 'front', kind: 'path' })
  assert.deepEqual(E.tileInfo(37, 0), { area: '', kind: 'out' })
  assert.deepEqual(E.tileInfo(-1, 0), { area: '', kind: 'out' })
  assert.deepEqual(E.tileInfo(1.5, 2), { area: '', kind: 'out' })
  assert.deepEqual(E.STARTER_TILE, { c: 15, r: 18 })
  assert.equal(E.tileInfo(E.STARTER_TILE.c, E.STARTER_TILE.r).kind, 'lawn')
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
  const start = { c: E.DOOR[0][0], r: E.DOOR[0][1] - 1 }
  const seen = new Set([`${start.c},${start.r}`])
  const queue = [start]
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
  assert.equal(E.walkable(START, 15, 18), true)
  assert.equal(E.walkable(START, 14, 15), true)
  assert.equal(E.walkable(START, 24, 23), false)
  assert.equal(E.walkable(['front', 'main', 'pond', 'flower'], 24, 23), true)
  assert.equal(E.walkable(START, 16, 20), true)
  assert.equal(E.walkable(START, 21, 15), false)
  assert.equal(E.walkable(['front', 'main', 'pond'], 21, 15), true)
  assert.equal(E.walkable(['front', 'main', 'pond'], 25, 14), false)
  assert.equal(E.walkable(['front', 'main', 'pond'], 25, 14, true), true)
  assert.equal(E.walkable(START, 12, 11), false)
  assert.equal(E.walkable(START, 14, 27), false)
  assert.equal(E.walkable(START, 0, 0), false)
  assert.equal(E.walkable(START, 50, 50), false)
})

test('canUnlock / unlockProblem：要挨着修好的院子', () => {
  assert.deepEqual(E.AREAS.filter((a) => E.canUnlock(START, a.id)).map((a) => a.id), ['pond', 'orchard', 'bamboo', 'farm', 'back'])
  assert.equal(E.unlockProblem(START, 'spring'), '要先修好旁边的院子')
  assert.equal(E.unlockProblem(START, 'main'), '这个院子已经修整好了')
  assert.equal(E.unlockProblem(START, 'moon'), '没有这个院子')
  assert.equal(E.unlockProblem(START, undefined), '没有这个院子')
  assert.equal(E.unlockProblem(START, 'pond'), '')
  assert.equal(E.canUnlock(['front', 'main', 'pond', 'tea'], 'spring'), true)
  assert.equal(E.canUnlock(['front', 'main', 'pond'], 'flower'), true)
  assert.equal(E.canUnlock(START, 'flower'), false)
})

test('signTile：木牌立在门里侧、还没修的那一边', () => {
  assert.deepEqual(E.signTile(START, 'pond'), { c: 21, r: 9 })
  assert.deepEqual(E.signTile(START, 'orchard'), { c: 10, r: 25 })
  assert.deepEqual(E.signTile(START, 'bamboo'), { c: 11, r: 16 })
  assert.deepEqual(E.signTile(START, 'back'), { c: 18, r: 7 })
  assert.equal(E.signTile(START, 'spring'), null)
  assert.equal(E.signTile(START, 'main'), null)
  assert.deepEqual(E.signTile(['front', 'main', 'pond'], 'tea'), { c: 30, r: 18 })
  // 荷塘院修好后，后花园的木牌挪到石板桥那边，不再藏在正房屋顶后面
  assert.deepEqual(E.signTile(['front', 'main', 'pond'], 'back'), { c: 26, r: 7 })
})

test('footprint / occupiedTiles：2×2 的左前角和它盖住的格子', () => {
  assert.deepEqual(E.footprint('daisy', 5, 5), [{ c: 5, r: 5 }])
  assert.deepEqual(E.footprint('pavilion', 5, 5), [{ c: 5, r: 5 }, { c: 4, r: 5 }, { c: 5, r: 4 }, { c: 4, r: 4 }])
  assert.deepEqual(E.footprint('nope', 5, 5), [{ c: 5, r: 5 }])
  const taken = E.occupiedTiles([{ uid: 'a', itemId: 'pavilion', c: 16, r: 16 }, { uid: 'b', itemId: 'daisy', c: 10, r: 15 }], 'b')
  assert.deepEqual([...taken].sort(), ['15,15', '15,16', '16,15', '16,16'])
})

test('placeProblem：每种不能摆的原因', () => {
  const placed = [{ uid: 'p1', itemId: 'starter_tree', c: 15, r: 18 }, { uid: 'p2', itemId: 'pavilion', c: 19, r: 18 }]
  const opened = ['front', 'main', 'pond', 'flower']
  const P = (itemId, c, r, ignore) => E.placeProblem(opened, placed, itemId, c, r, ignore)
  assert.equal(P('daisy', 0, 0), '放不到这里哦')
  assert.equal(P('daisy', 12, 11), '放不到这里哦')
  assert.equal(P('daisy', 14, 27), '放不到这里哦')
  assert.equal(P('daisy', 13, 20), '放不到这里哦')
  assert.equal(P('daisy', 40, 2), '放不到这里哦')
  assert.equal(P('daisy', 6, 23), '这个院子还没修整呢')
  assert.equal(P('daisy', 14, 15), '小路上不能摆东西')
  assert.equal(P('daisy', 16, 20), '小路上不能摆东西')
  assert.equal(P('daisy', 25, 14), '这是水里，放不了它')
  assert.equal(P('stool', 24, 23), '土里只能种花种菜')
  assert.equal(P('daisy', 21, 10), '石板地上种不了，换块草地')
  assert.equal(P('daisy', 15, 18), '这块地上已经有东西了')
  assert.equal(P('daisy', 18, 17), '这块地上已经有东西了')
  assert.equal(P('pavilion', 16, 19), '这里放不下它')
  assert.equal(P('pavilion', 12, 9), '这里放不下它')
  assert.equal(P('pavilion', 19, 19), '这里放不下它')
  assert.equal(P('pavilion', 19, 19, 'p2'), '')
  assert.equal(P('daisy', 24, 23), '')
  assert.equal(P('cabbage', 24, 23), '')
  assert.equal(P('stool', 22, 14), '')
  assert.equal(P('stool', 21, 10), '')
  assert.equal(P('daisy', 14, 19), '')
  assert.equal(P('daisy', 15, 18, 'p1'), '')
  assert.equal(P('nope', 14, 19), '放不到这里哦')
})

test('placeableTiles：开局 55 块草地能摆雏菊；亭子只有 2×2 都空着的角', () => {
  const placed = [{ uid: 'p1', itemId: 'starter_tree', c: 15, r: 18 }]
  assert.equal(E.placeableTiles(START, placed, 'daisy').length, 55)
  assert.equal(E.placeableTiles(START, placed, 'stool').length, 98) // 家具还能摆在石板场上
  assert.equal(E.placeableTiles(START, placed, 'daisy', 'p1').length, 56)
  const big = E.placeableTiles(START, placed, 'pavilion')
  assert.ok(big.length > 0 && big.length < 98)
  big.forEach((t) => assert.equal(E.placeProblem(START, placed, 'pavilion', t.c, t.r), ''))
  assert.ok(big.some((t) => t.c === 19 && t.r === 18))
  assert.ok(!big.some((t) => t.c === 16 && t.r === 19))
  assert.equal(E.placeableTiles(['front', 'main', 'pond'], [], 'daisy').length, 55 + 1 + E.areaTiles('pond').filter((t) => E.tileInfo(t.c, t.r).kind === 'lawn').length)
})
