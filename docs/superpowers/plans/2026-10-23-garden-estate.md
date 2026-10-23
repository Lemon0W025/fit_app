# 园林大宅院（第一步：宅院本身）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 12×12 小岛换成 37×28 格的园林大宅院：11 个院子（开局前院 + 正院）、墙和月亮门、按地面种类的摆放规矩、2×2 物件和左右转向、脚下影子、挨着才能修的院子、小动物跨院走动 + 作息 + 小事 + 「找它」；底图先用程序画的白模切块。

**Architecture:** 宅院的布局数据和规则放 `lib/shared/estate.js`（院子、墙、门、壳里的地面、格子表、`walkable` / `placeProblem` / `canUnlock` / `signTile`），`lib/shared/garden.js` 只管物件表（加 `ground`、`foot`）和扭蛋；云函数 `garden.unlock` 校验相邻、新 `garden.flip`；小程序 `utils/world.js` 负责布局、底图切块、云朵、木牌、亮格，`utils/garden-life.js` 负责小动物（跨院寻路、作息、小事、`whereIs`），`utils/animals.js` 放作息表、小事表、睡觉点；`scripts/estate/blockout.py` 按 `estate.js` 的数据画白模、切块。原画、新物件、小鸟蝴蝶是后面两步，不在这份计划里。

**Tech Stack:** 微信小程序原生、微信云开发、node:test、Python + Pillow。

## Global Constraints

- 设计文档：`docs/superpowers/specs/2026-10-23-garden-estate-design.md`
- `cloudfunctions/api/lib/shared/*` 改完立即 `cp` 到 `miniprogram/utils/shared/`（逐字节一致，`test/shared-sync.test.js` 检查）
- 云函数响应 `{ ok, data }` / `{ ok: false, code, message }`，message 中文
- 每个任务：`npm test` 全绿、改过的 JS `node --check`、改过的 Python `python3 -c "import ast; ast.parse(open(p).read())"`；提交信息结尾 `<trailer>` = `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>` 和 `Claude-Session: https://claude.ai/code/session_01CX9A8LkVQKcNnTEsxo35Fv` 两行
- 网格 37 × 28；院子内部 8×8：列 A `c 1～8`、B `c 10～17`、C `c 19～26`、D `c 28～35`；排 后 `r 1～8`、中 `r 10～17`、前 `r 19～26`；墙在 `c = 0, 9, 18, 27, 36` 和 `r = 0, 9, 18, 27`；后花园 `c 10～26, r 1～8`
- 1 倍缩放：`tileW = windowWidth × 0.96 / 9`；新手大树 `(11, 16)`；大门 `(13, 27)`、`(14, 27)`
- 不能摆的原因（原文）：「放不到这里哦」「这个院子还没修整呢」「小路上不能摆东西」「这是水里，放不了它」「它得放到水里」「土里只能种花种菜」「石板地上种不了，换块草地」「这里放不下它」「这块地上已经有东西了」
- 修整文案：「没有这个院子」「这个院子已经修整好了」「要先修好旁边的院子」「暖豆不够啦，修整要 X 暖豆，再攒攒」
- 和设计文档的两处小出入（已和实现方式对齐）：① 格子表不是脚本生成的文件，而是 `estate.js` 在加载时按布局数据算出来（少一步生成、测试直接跑）；② 摆放模式对 2×2 物件只亮「能当左前角的格子」，点下去占 4 格（4 格都亮会叠成一片看不清）。首次进来缩放 1 倍（`tileW` 已按一个院子占满屏宽算），不是 1.2 倍：`movable-view` 带缩放时 x / y 的含义不稳。③ 修好院子时云朵直接消失、院子中间冒一把彩带（不做 0.8 秒的淡出：被移除的节点做不了动画，加定时器又会让页面测试变慢）

---

### Task 1: `iso.js` 支持长方形网格

**Files:**
- Modify: `miniprogram/utils/iso.js`
- Test: `test/iso.test.js`

**Interfaces:**
- Produces: `gridLayout(cols, rows, tileW) → { cols, rows, size, tileW, tileH, depth, top, originX, width, landHeight, height }`；`isoLayout(size, width)` 不变（内部调 `gridLayout`，多出 `cols`、`rows`）；`tileAt(x, y, L)` 用 `L.cols` / `L.rows` 判边界（没有就用 `L.size`）

- [ ] **Step 1: 写失败的测试**

`test/iso.test.js` 顶部解构里加 `gridLayout`，文件末尾追加：

```js
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
```

- [ ] **Step 2: 跑测试确认失败**

Run: `node --test test/iso.test.js`
Expected: FAIL（`gridLayout is not a function`）

- [ ] **Step 3: 实现**

`miniprogram/utils/iso.js` 整份替换为：

```js
// 等距（斜 45° 俯视）网格的坐标换算，单位 px，纯函数（有单测）
// 格子 (c, r)：c 往右下增加，r 往左下增加；(0,0) 在最上面

// 长方形网格：cols 格 × rows 格，每格宽 tileW
function gridLayout(cols, rows, tileW) {
  const tileH = tileW / 2
  const depth = tileH * 0.4 // 地块侧面的厚度
  const top = tileW * 1.3 // 给后排的大树、房子留出往上长的空间
  const width = ((cols + rows) * tileW) / 2
  const landHeight = ((cols + rows) * tileH) / 2 + depth
  return { cols, rows, size: Math.max(cols, rows), tileW, tileH, depth, top, originX: (rows * tileW) / 2, width, landHeight, height: top + landHeight }
}

// 正方形网格：size 格，整体宽 width
function isoLayout(size, width) {
  return gridLayout(size, size, width / size)
}

// 菱形格子的最上面那个顶点
function tileTop(c, r, L) {
  return { x: L.originX + ((c - r) * L.tileW) / 2, y: L.top + ((c + r) * L.tileH) / 2 }
}

function tileCenter(c, r, L) {
  const t = tileTop(c, r, L)
  return { x: t.x, y: t.y + L.tileH / 2 }
}

// 点击坐标（相对容器左上角）反算是哪一格；点在网格外面返回 null
function tileAt(x, y, L) {
  const cols = L.cols || L.size
  const rows = L.rows || L.size
  const dx = (x - L.originX) / (L.tileW / 2)
  const dy = (y - L.top) / (L.tileH / 2)
  const c = Math.floor((dy + dx) / 2)
  const r = Math.floor((dy - dx) / 2)
  if (c < 0 || r < 0 || c >= cols || r >= rows) return null
  return { c, r }
}

module.exports = { gridLayout, isoLayout, tileTop, tileCenter, tileAt }
```

- [ ] **Step 4: 跑测试**

Run: `node --test test/iso.test.js`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
node --check miniprogram/utils/iso.js
git add miniprogram/utils/iso.js test/iso.test.js
git commit -m "feat(iso): rectangular grid layout

<trailer>"
```

---

### Task 2: 宅院规则（`shared/estate.js`）+ 物件的地面和占格

**Files:**
- Create: `cloudfunctions/api/lib/shared/estate.js`（复制到 `miniprogram/utils/shared/estate.js`）
- Modify: `cloudfunctions/api/lib/shared/garden.js`（复制到 miniprogram）
- Test: `test/estate.test.js`（新）、`test/garden.test.js`

**Interfaces:**
- Produces（`estate.js`）：`GRID = { cols: 37, rows: 28 }`、`AREAS: [{ id, name, cost, rect: [c0, r0, c1, r1), neighbors: string[] }]`、`GATES: [{ a, b, tiles: [[c, r], [c, r]] }]`、`DOOR = [[13, 27], [14, 27]]`、`SHELL: [{ area, kind, what?, rect }]`、`SPOTS: [{ id, area, c, r }]`、`STARTER_TILE = { c: 11, r: 16 }`、`START_OPENED = ['front', 'main']`、`areaById(id) → area | null`、`tileInfo(c, r) → { area, kind }`（kind：`lawn / soil / water / pave / path / gate / door / wall / block / out`）、`areaTiles(id) → [{ c, r }]`、`walkable(opened, c, r, swims = false) → boolean`、`canUnlock(opened, id)`、`unlockProblem(opened, id) → '' | 原因`、`footprint(itemId, c, r) → [{ c, r }]`（第一个是左前角）、`occupiedTiles(placed, ignoreUid) → Set<'c,r'>`、`placeProblem(opened, placed, itemId, c, r, ignoreUid) → '' | 原因`、`placeableTiles(opened, placed, itemId, ignoreUid) → [{ c, r }]`、`signTile(opened, areaId) → { c, r } | null`、`areaCenter(id) → { c, r }`（可以是小数）
- Produces（`garden.js`）：每件非动物物件多 `ground: string[]`、`foot: 1 | 2`；删除 `ISLAND_SIZE / PATH_LINE / REGIONS / SCENERY / regionById / onIsland / regionOf / isPath / sceneryIn / tileOpen / placeProblem / tilePlaceable`

- [ ] **Step 1: 写失败的测试**

`test/estate.test.js`（新建）：

```js
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
```

`test/garden.test.js`：顶部解构里删掉 `ISLAND_SIZE, REGIONS, SCENERY, regionOf, isPath, onIsland, sceneryIn, tileOpen, tilePlaceable, placeProblem,`；删掉「小岛：分区、小路、风景、能不能摆」和「placeProblem：为什么不能摆」两个测试，原位置换成：

```js
test('物件的地面和占格', () => {
  assert.deepEqual(itemById('daisy').ground, ['lawn', 'soil'])
  assert.deepEqual(itemById('osmanthus').ground, ['lawn', 'soil'])
  assert.deepEqual(itemById('cabbage').ground, ['soil', 'lawn'])
  assert.deepEqual(itemById('stool').ground, ['lawn', 'pave'])
  assert.deepEqual(itemById('pavilion').ground, ['lawn', 'pave'])
  assert.deepEqual(itemById('koi_pond').ground, ['lawn'])
  assert.equal(itemById('pavilion').foot, 2)
  assert.equal(itemById('lotus_pond').foot, 2)
  assert.equal(itemById('daisy').foot, 1)
  assert.equal(itemById('panda').ground, undefined)
  ITEMS.filter((i) => i.kind !== 'animal').forEach((i) => assert.ok(i.ground.length && (i.foot === 1 || i.foot === 2), i.id))
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `node --test test/estate.test.js test/garden.test.js`
Expected: FAIL（找不到模块 `estate`；`ground` 是 undefined）

- [ ] **Step 3: 实现 `garden.js` 的地面和占格，删掉小岛**

`cloudfunctions/api/lib/shared/garden.js`：
1. 删掉从 `// 小岛后花园：12×12 格的等距菱形` 到 `SCENERY` 数组结尾 `]` 的整段常量。
2. 删掉从 `function regionById(id) {` 到 `function tilePlaceable(opened, c, r) { … }` 结尾的整段函数。
3. `module.exports` 里删掉 `ISLAND_SIZE, PATH_LINE, REGIONS, SCENERY, regionById, onIsland, regionOf, isPath, sceneryIn, tileOpen, placeProblem, tilePlaceable,`。
4. 在 `const STARTER_ITEM = 'starter_tree'` 那一行后面加：

```js
// 每件物件能摆的地面（lawn 草地 / soil 花坛菜畦的土 / water 水 / pave 石板铺地）和占几格；没列到的都是植物
const GROUNDS = {
  plant: ['lawn', 'soil'],
  veg: ['soil', 'lawn'],
  furniture: ['lawn', 'pave'],
  // 自带石头池边的水景，摆草地上
  scape: ['lawn'],
}
const ITEM_CLASS = {
  veg: ['cabbage', 'radish', 'pumpkin'],
  furniture: ['pebbles', 'fence', 'stool', 'gourd_rack', 'goji_tray', 'tea_table', 'wood_bridge', 'lantern', 'stone_table',
    'pavilion', 'teahouse', 'dried_persimmon', 'sweet_potato_stove', 'snowman', 'dumpling_steamer'],
  scape: ['koi_pond', 'lotus_pond', 'arch_bridge', 'waterwheel', 'zigzag_bridge'],
}
// 占 2×2 格的大件
const FOOT2 = ['pavilion', 'teahouse', 'zigzag_bridge', 'lotus_pond', 'koi_pond', 'arch_bridge', 'waterwheel', 'swing_tree', 'gourd_rack']
ITEMS.forEach((item) => {
  if (item.kind === 'animal') return
  const cls = Object.keys(ITEM_CLASS).find((k) => ITEM_CLASS[k].indexOf(item.id) !== -1) || 'plant'
  item.ground = GROUNDS[cls]
  item.foot = FOOT2.indexOf(item.id) !== -1 ? 2 : 1
})
```

- [ ] **Step 4: 写 `estate.js`**

`cloudfunctions/api/lib/shared/estate.js`（新建）：

```js
// 园林大宅院：院子、墙、月亮门、壳里画好的地面，以及「能不能走、能不能摆、能不能修」的规则（云函数和小程序共用，纯函数）
// 格子 (c, r)：c 往右下增加，r 往左下增加。rect = [c 起, r 起, c 止, r 止)，左闭右开

const { itemById } = require('./garden')

const GRID = { cols: 37, rows: 28 }

// 11 个院子：4 列（c 1～8、10～17、19～26、28～35）× 3 排（r 1～8、10～17、19～26），后花园占后排中间两列；院子之间隔一格墙
const AREAS = [
  { id: 'front', name: '前院', cost: 0, rect: [10, 19, 18, 27] },
  { id: 'main', name: '正院', cost: 0, rect: [10, 10, 18, 18] },
  { id: 'pond', name: '荷塘院', cost: 200, rect: [19, 10, 27, 18] },
  { id: 'flower', name: '花圃院', cost: 200, rect: [19, 19, 27, 27] },
  { id: 'orchard', name: '果园', cost: 300, rect: [1, 19, 9, 27] },
  { id: 'veg', name: '菜园', cost: 300, rect: [28, 19, 36, 27] },
  { id: 'bamboo', name: '竹林院', cost: 400, rect: [1, 10, 9, 18] },
  { id: 'tea', name: '茶院', cost: 400, rect: [28, 10, 36, 18] },
  { id: 'farm', name: '动物小院', cost: 500, rect: [1, 1, 9, 9] },
  { id: 'spring', name: '温泉院', cost: 500, rect: [28, 1, 36, 9] },
  { id: 'back', name: '后花园', cost: 700, rect: [10, 1, 27, 9] },
]
const START_OPENED = ['front', 'main']

// 壳里画好的东西，按顺序盖在草地上。kind：path 小路 / pave 石板铺地 / soil 土 / water 水 / block 建筑和山石；what 给画白模用
const SHELL = [
  // 前院：大门进来的石板路、绕过影壁、通向两边月亮门的横路
  { area: 'front', kind: 'path', rect: [12, 23, 16, 27] },
  { area: 'front', kind: 'path', rect: [13, 19, 15, 23] },
  { area: 'front', kind: 'path', rect: [10, 22, 18, 24] },
  { area: 'front', kind: 'block', what: 'screen', rect: [13, 24, 15, 25] },
  // 正院：正房占后三行，门前甬道和横路
  { area: 'main', kind: 'block', what: 'hall', rect: [10, 10, 18, 13] },
  { area: 'main', kind: 'path', rect: [13, 13, 15, 18] },
  { area: 'main', kind: 'path', rect: [10, 13, 18, 15] },
  // 荷塘院：靠正院一侧的水榭平台，中间一大片水
  { area: 'pond', kind: 'pave', what: 'deck', rect: [19, 12, 20, 16] },
  { area: 'pond', kind: 'water', what: 'pond', rect: [20, 11, 26, 16] },
  // 花圃院：三条花坛，两条小径
  { area: 'flower', kind: 'soil', rect: [19, 20, 21, 26] },
  { area: 'flower', kind: 'path', rect: [21, 19, 22, 27] },
  { area: 'flower', kind: 'soil', rect: [22, 20, 24, 26] },
  { area: 'flower', kind: 'path', rect: [24, 19, 25, 27] },
  { area: 'flower', kind: 'soil', rect: [25, 20, 27, 26] },
  // 菜园：四条菜畦和一口井
  { area: 'veg', kind: 'soil', rect: [29, 20, 30, 26] },
  { area: 'veg', kind: 'soil', rect: [31, 20, 32, 26] },
  { area: 'veg', kind: 'soil', rect: [33, 20, 34, 26] },
  { area: 'veg', kind: 'soil', rect: [35, 20, 36, 26] },
  { area: 'veg', kind: 'block', what: 'well', rect: [28, 25, 29, 26] },
  // 果园：靠墙一座葡萄架
  { area: 'orchard', kind: 'block', what: 'trellis', rect: [1, 19, 4, 21] },
  // 竹林院：假山和一片白沙地
  { area: 'bamboo', kind: 'block', what: 'rockery', rect: [1, 10, 4, 12] },
  { area: 'bamboo', kind: 'pave', what: 'sand', rect: [5, 10, 9, 13] },
  // 茶院：临水的茶亭平台和靠外墙的回廊
  { area: 'tea', kind: 'pave', what: 'deck', rect: [28, 12, 32, 16] },
  { area: 'tea', kind: 'pave', what: 'corridor', rect: [35, 10, 36, 18] },
  // 动物小院：鸡舍
  { area: 'farm', kind: 'block', what: 'coop', rect: [1, 1, 3, 3] },
  // 温泉院：更衣木屋和温泉池
  { area: 'spring', kind: 'block', what: 'cabin', rect: [28, 1, 30, 3] },
  { area: 'spring', kind: 'water', what: 'spring', rect: [30, 2, 35, 6] },
  // 后花园：假山瀑布、水潭、一条小溪（中间一块石板能踩着过）
  { area: 'back', kind: 'block', what: 'rockery', rect: [15, 1, 22, 3] },
  { area: 'back', kind: 'water', what: 'pool', rect: [17, 3, 20, 5] },
  { area: 'back', kind: 'water', what: 'stream', rect: [20, 5, 22, 6] },
  { area: 'back', kind: 'water', what: 'stream', rect: [22, 6, 24, 7] },
  { area: 'back', kind: 'path', what: 'slab', rect: [23, 6, 24, 7] },
  { area: 'back', kind: 'water', what: 'stream', rect: [24, 7, 26, 8] },
  { area: 'back', kind: 'water', what: 'stream', rect: [26, 8, 27, 9] },
]

// 月亮门（两格宽），a、b 是它连着的两个院子
const GATES = [
  { a: 'front', b: 'main', tiles: [[13, 18], [14, 18]] },
  { a: 'front', b: 'orchard', tiles: [[9, 22], [9, 23]] },
  { a: 'front', b: 'flower', tiles: [[18, 22], [18, 23]] },
  { a: 'main', b: 'bamboo', tiles: [[9, 13], [9, 14]] },
  { a: 'main', b: 'pond', tiles: [[18, 13], [18, 14]] },
  { a: 'bamboo', b: 'orchard', tiles: [[4, 18], [5, 18]] },
  { a: 'bamboo', b: 'farm', tiles: [[4, 9], [5, 9]] },
  { a: 'pond', b: 'flower', tiles: [[22, 18], [23, 18]] },
  { a: 'pond', b: 'tea', tiles: [[27, 13], [27, 14]] },
  { a: 'pond', b: 'back', tiles: [[22, 9], [23, 9]] },
  { a: 'flower', b: 'veg', tiles: [[27, 22], [27, 23]] },
  { a: 'tea', b: 'veg', tiles: [[31, 18], [32, 18]] },
  { a: 'tea', b: 'spring', tiles: [[31, 9], [32, 9]] },
  { a: 'back', b: 'farm', tiles: [[9, 4], [9, 5]] },
  { a: 'back', b: 'spring', tiles: [[27, 4], [27, 5]] },
]
// 外墙上的大门：新住户从这里进来
const DOOR = [[13, 27], [14, 27]]

// 小动物在壳里的活动点（站的那一格），作息和小事表按 id 引用
const SPOTS = [
  { id: 'coop', area: 'farm', c: 2, r: 3 },
  { id: 'eaves', area: 'main', c: 11, r: 13 },
  { id: 'steps', area: 'main', c: 14, r: 13 },
  { id: 'well', area: 'veg', c: 28, r: 24 },
  { id: 'veg_bed', area: 'veg', c: 31, r: 22 },
  { id: 'flower_path', area: 'flower', c: 21, r: 22 },
  { id: 'rockery', area: 'bamboo', c: 4, r: 11 },
  { id: 'tea_deck', area: 'tea', c: 29, r: 13 },
  { id: 'pond_water', area: 'pond', c: 22, r: 13 },
  { id: 'falls', area: 'back', c: 18, r: 4 },
  { id: 'hotspring', area: 'spring', c: 32, r: 3 },
  { id: 'bridge', area: 'back', c: 23, r: 6 },
  { id: 'haystack', area: 'farm', c: 6, r: 6 },
]

const STARTER_TILE = { c: 11, r: 16 }

// ---------------------------------------------------------------- 格子表

const TILES = []
for (let i = 0; i < GRID.cols * GRID.rows; i++) TILES.push({ area: '', kind: 'wall' })

function fill(rect, patch) {
  for (let c = rect[0]; c < rect[2]; c++) {
    for (let r = rect[1]; r < rect[3]; r++) Object.assign(TILES[r * GRID.cols + c], patch)
  }
}
AREAS.forEach((a) => fill(a.rect, { area: a.id, kind: 'lawn' }))
SHELL.forEach((s) => fill(s.rect, { kind: s.kind }))
GATES.forEach((g) => g.tiles.forEach(([c, r]) => Object.assign(TILES[r * GRID.cols + c], { area: '', kind: 'gate' })))
DOOR.forEach(([c, r]) => Object.assign(TILES[r * GRID.cols + c], { area: '', kind: 'door' }))

AREAS.forEach((a) => {
  a.neighbors = GATES.filter((g) => g.a === a.id || g.b === a.id).map((g) => (g.a === a.id ? g.b : g.a))
})

const OUT = { area: '', kind: 'out' }

function tileInfo(c, r) {
  if (!Number.isInteger(c) || !Number.isInteger(r) || c < 0 || r < 0 || c >= GRID.cols || r >= GRID.rows) return OUT
  return TILES[r * GRID.cols + c]
}

function areaById(id) {
  return AREAS.find((a) => a.id === id) || null
}

function areaTiles(id) {
  const a = areaById(id)
  if (!a) return []
  const tiles = []
  for (let c = a.rect[0]; c < a.rect[2]; c++) {
    for (let r = a.rect[1]; r < a.rect[3]; r++) tiles.push({ c, r })
  }
  return tiles
}

function areaCenter(id) {
  const [c0, r0, c1, r1] = areaById(id).rect
  return { c: (c0 + c1) / 2, r: (r0 + r1) / 2 }
}

// ---------------------------------------------------------------- 能不能走

const WALK = { lawn: true, soil: true, pave: true, path: true }

function gateAt(c, r) {
  return GATES.find((g) => g.tiles.some(([gc, gr]) => gc === c && gr === r)) || null
}

// 已修院子里的草地、土、铺地、小路；月亮门两边都修好了才通；水鸟（swims）还能下水
function walkable(opened, c, r, swims) {
  const t = tileInfo(c, r)
  if (t.kind === 'gate') {
    const g = gateAt(c, r)
    return !!g && opened.indexOf(g.a) !== -1 && opened.indexOf(g.b) !== -1
  }
  if (!t.area || opened.indexOf(t.area) === -1) return false
  return !!WALK[t.kind] || (!!swims && t.kind === 'water')
}

// ---------------------------------------------------------------- 修整

function canUnlock(opened, id) {
  const a = areaById(id)
  return !!a && opened.indexOf(id) === -1 && a.neighbors.some((n) => opened.indexOf(n) !== -1)
}

function unlockProblem(opened, id) {
  if (!areaById(id)) return '没有这个院子'
  if (opened.indexOf(id) !== -1) return '这个院子已经修整好了'
  if (!canUnlock(opened, id)) return '要先修好旁边的院子'
  return ''
}

// 木牌立在哪：从已修邻院过来的那道门里侧、还没修的这一边的格子
function signTile(opened, areaId) {
  if (opened.indexOf(areaId) !== -1) return null
  for (const g of GATES) {
    const other = g.a === areaId ? g.b : g.b === areaId ? g.a : null
    if (!other || opened.indexOf(other) === -1) continue
    const [gc, gr] = g.tiles[0]
    const inner = [{ c: gc + 1, r: gr }, { c: gc - 1, r: gr }, { c: gc, r: gr + 1 }, { c: gc, r: gr - 1 }]
      .find((t) => tileInfo(t.c, t.r).area === areaId)
    if (inner) return inner
  }
  return null
}

// ---------------------------------------------------------------- 能不能摆

const key = (c, r) => `${c},${r}`

// 物件占的格子，第一个是点下去的那格（左前角），2×2 往后（c−1、r−1）延伸
function footprint(itemId, c, r) {
  const item = itemById(itemId)
  const foot = item && item.foot === 2 ? 2 : 1
  const tiles = []
  for (let dr = 0; dr < foot; dr++) {
    for (let dc = 0; dc < foot; dc++) tiles.push({ c: c - dc, r: r - dr })
  }
  return tiles
}

function occupiedTiles(placed, ignoreUid) {
  const set = new Set()
  placed.forEach((p) => {
    if (p.uid === ignoreUid) return
    footprint(p.itemId, p.c, p.r).forEach((t) => set.add(key(t.c, t.r)))
  })
  return set
}

function groundProblem(item, kind) {
  if (item.ground.indexOf(kind) !== -1) return ''
  if (kind === 'water') return '这是水里，放不了它'
  if (item.ground.length === 1 && item.ground[0] === 'water') return '它得放到水里'
  if (kind === 'soil') return '土里只能种花种菜'
  if (kind === 'pave') return '石板地上种不了，换块草地'
  return '放不到这里哦'
}

function tileProblem(opened, item, c, r) {
  const t = tileInfo(c, r)
  if (t.kind === 'out' || t.kind === 'wall' || t.kind === 'block' || t.kind === 'door') return '放不到这里哦'
  if (t.area && opened.indexOf(t.area) === -1) return '这个院子还没修整呢'
  if (t.kind === 'path' || t.kind === 'gate') return '小路上不能摆东西'
  return groundProblem(item, t.kind)
}

// 这一格为什么不能摆（能摆返回 ''）：云函数校验和页面提示用同一套话
function placeProblem(opened, placed, itemId, c, r, ignoreUid) {
  const item = itemById(itemId)
  if (!item || !item.ground) return '放不到这里哦'
  const tiles = footprint(itemId, c, r)
  const first = tileProblem(opened, item, tiles[0].c, tiles[0].r)
  if (first) return first
  const taken = occupiedTiles(placed, ignoreUid)
  if (taken.has(key(c, r))) return '这块地上已经有东西了'
  for (const t of tiles.slice(1)) {
    if (tileProblem(opened, item, t.c, t.r) || taken.has(key(t.c, t.r))) return '这里放不下它'
  }
  return ''
}

function placeableTiles(opened, placed, itemId, ignoreUid) {
  const tiles = []
  for (let c = 0; c < GRID.cols; c++) {
    for (let r = 0; r < GRID.rows; r++) {
      if (!placeProblem(opened, placed, itemId, c, r, ignoreUid)) tiles.push({ c, r })
    }
  }
  return tiles
}

module.exports = {
  GRID,
  AREAS,
  START_OPENED,
  SHELL,
  GATES,
  DOOR,
  SPOTS,
  STARTER_TILE,
  tileInfo,
  areaById,
  areaTiles,
  areaCenter,
  walkable,
  canUnlock,
  unlockProblem,
  signTile,
  footprint,
  occupiedTiles,
  placeProblem,
  placeableTiles,
}
```

- [ ] **Step 5: 复制到小程序，跑测试**

```bash
cp cloudfunctions/api/lib/shared/garden.js miniprogram/utils/shared/garden.js
cp cloudfunctions/api/lib/shared/estate.js miniprogram/utils/shared/estate.js
node --test test/estate.test.js test/garden.test.js test/shared-sync.test.js
```

Expected: PASS。（`npm test` 里 services、world、页面相关会失败，后面的任务改。）

- [ ] **Step 6: 提交（本地）**

```bash
for f in cloudfunctions/api/lib/shared/garden.js cloudfunctions/api/lib/shared/estate.js; do node --check $f; done
git add cloudfunctions/api/lib/shared miniprogram/utils/shared test/estate.test.js test/garden.test.js
git commit -m "feat(estate): courtyards, gates, tile table and placement rules

<trailer>"
```

---

### Task 3: 云函数：旧数据迁移、`areas`、按地面校验、`flip`、挨着才能修

**Files:**
- Modify: `cloudfunctions/api/lib/garden-state.js`（整份替换）、`cloudfunctions/api/services/garden.js`、`cloudfunctions/api/router.js`
- Test: `test/services-garden.test.js`、`test/services-meal.test.js`、`test/router.test.js`、`test/cloud-e2e.test.js`

**Interfaces:**
- Consumes: Task 2 的 `estate.js`（`AREAS`、`START_OPENED`、`STARTER_TILE`、`canUnlock`、`unlockProblem`、`placeProblem`）
- Produces: gardens 文档多 `estate: 1`，`opened` 默认 `['front', 'main']`；`placed[]` 项可带 `flip: boolean`；`view` 去掉 `regions`、`scenery`，加 `areas: [{ id, name, cost, unlocked, unlockable }]`；`place(openid, { itemId, c, r, flip })`；新 `flip(openid, { uid }) → view`；`unlock(openid, { area }) → view`；action `garden.flip`

- [ ] **Step 1: 写失败的测试**

`test/services-garden.test.js`：
1. `richGarden` 改成 `const richGarden = (extra = {}) => ({ welcomed: true, estate: 1, opened: ['front', 'main'], beans: { earned: { [TODAY]: 60 }, bonus: 60, spent: 0 }, ...extra })`。
2. 第一个测试里 `assert.deepEqual(first.regions…)`、`assert.deepEqual(first.scenery, [])` 两行换成：

```js
  assert.deepEqual(first.areas.map((a) => [a.id, a.unlocked, a.unlockable]).slice(0, 5), [
    ['front', true, false], ['main', true, false], ['pond', false, true], ['flower', false, true], ['orchard', false, true],
  ])
  assert.equal(first.areas.find((a) => a.id === 'spring').unlockable, false)
  assert.equal(first.scenery, undefined)
```

`[4, 4]` 改成 `[11, 16]`。
3. 坐标替换（落在开局两个院子的草地上）：「place：从背包摆到空地上」里 `c: 3, r: 8` → `c: 10, r: 15`（含断言 `['daisy', 3, 8]` → `['daisy', 10, 15]`）、`c: 4, r: 8` → `c: 12, r: 15`；「place：背包里没有…」里 pavilion 的 `c: 3, r: 3` → `c: 16, r: 16`，最后一个 `place … c: 3, r: 3` → `c: 16, r: 16`；「move：…」里 `{ uid: 'a', itemId: 'pavilion', c: 3, r: 3 }` → `c: 16, r: 16`、`{ uid: 'b', itemId: 'daisy', c: 4, r: 4 }` → `c: 10, r: 15`、移动目标 `c: 5, r: 7` → `c: 17, r: 17`（三处，含断言）、被挡的 `c: 4, r: 4` → `c: 11, r: 16`；「stash」里 `c: 3, r: 3` → `c: 16, r: 16`；小动物相关测试（view、arrive、旧数据扭蛋动物）里 `c: 3, r: 3` → `c: 10, r: 15`、`c: 4, r: 3` → `c: 12, r: 15`。
4. 删除「unlock：花暖豆修整角落…」「unlock：没有这个角落…」「place / move：小岛上的各种不能摆」「旧数据：大地图中间那块…」「旧数据：更早的小庭院坐标各加 3」五个测试，追加：

```js
test('unlock：花暖豆修好一个院子，旁边的院子变成能修', async () => {
  const { repo, service } = setup({ garden: { welcomed: true, estate: 1, opened: ['front', 'main'], beans: { earned: {}, bonus: 600, spent: 0 } } })
  const view = await service.unlock('u1', { area: 'pond' })
  assert.equal(view.beans, 400)
  assert.deepEqual(view.areas.filter((a) => a.unlocked).map((a) => a.id), ['front', 'main', 'pond'])
  assert.deepEqual(view.areas.filter((a) => a.unlockable).map((a) => a.id), ['flower', 'orchard', 'bamboo', 'tea', 'back'])
  const stored = await repo.getGarden('u1')
  assert.deepEqual(stored.opened, ['front', 'main', 'pond'])
  assert.equal(stored.beans.spent, 200)
})

test('unlock：没有这个院子、已经修好、不挨着、暖豆不够都不行', async () => {
  const { service } = setup({ garden: { welcomed: true, estate: 1, opened: ['front', 'main'], beans: { earned: {}, bonus: 350, spent: 0 } } })
  await assert.rejects(service.unlock('u1', { area: 'moon' }), { code: 'BAD_REQUEST', message: '没有这个院子' })
  await assert.rejects(service.unlock('u1', {}), { code: 'BAD_REQUEST', message: '没有这个院子' })
  await assert.rejects(service.unlock('u1', { area: 'main' }), { code: 'BAD_REQUEST', message: '这个院子已经修整好了' })
  await assert.rejects(service.unlock('u1', { area: 'spring' }), { code: 'BAD_REQUEST', message: '要先修好旁边的院子' })
  await assert.rejects(service.unlock('u1', { area: 'bamboo' }), { code: 'NO_BEANS', message: '暖豆不够啦，修整要 400 暖豆，再攒攒' })
  assert.equal((await service.unlock('u1', { area: 'flower' })).beans, 150)
})

test('place / move：按地面规矩和占格校验', async () => {
  const { service } = setup({ garden: richGarden({ opened: ['front', 'main', 'pond', 'flower'], seq: 1, inventory: { daisy: 3, stool: 1, pavilion: 1 }, placed: [{ uid: 'p1', itemId: 'starter_tree', c: 11, r: 16 }] }) })
  const reject = (itemId, c, r, message) => assert.rejects(service.place('u1', { itemId, c, r }), { code: 'BAD_REQUEST', message })
  await reject('daisy', 0, 0, '放不到这里哦')
  await reject('daisy', 3, 22, '这个院子还没修整呢')
  await reject('daisy', 13, 15, '小路上不能摆东西')
  await reject('daisy', 22, 13, '这是水里，放不了它')
  await reject('stool', 19, 22, '土里只能种花种菜')
  await reject('daisy', 19, 13, '石板地上种不了，换块草地')
  await reject('daisy', 11, 16, '这块地上已经有东西了')
  await reject('pavilion', 12, 17, '这里放不下它')
  const view = await service.place('u1', { itemId: 'pavilion', c: 16, r: 16, flip: true })
  assert.deepEqual(view.placed.find((p) => p.itemId === 'pavilion'), { uid: 'p2', itemId: 'pavilion', c: 16, r: 16, flip: true })
  await reject('daisy', 15, 15, '这块地上已经有东西了')
  await service.place('u1', { itemId: 'daisy', c: 19, r: 22 })
  await assert.rejects(service.move('u1', { uid: 'p1', c: 13, r: 15 }), { code: 'BAD_REQUEST', message: '小路上不能摆东西' })
  const moved = await service.move('u1', { uid: 'p2', c: 17, r: 17 })
  assert.deepEqual(moved.placed.find((p) => p.uid === 'p2'), { uid: 'p2', itemId: 'pavilion', c: 17, r: 17, flip: true })
})

test('flip：换个方向', async () => {
  const { repo, service } = setup({ garden: richGarden({ placed: [{ uid: 'a', itemId: 'lantern', c: 10, r: 15 }] }) })
  let view = await service.flip('u1', { uid: 'a' })
  assert.equal(view.placed[0].flip, true)
  view = await service.flip('u1', { uid: 'a' })
  assert.equal(view.placed[0].flip, false)
  assert.equal((await repo.getGarden('u1')).placed[0].flip, false)
  await assert.rejects(service.flip('u1', { uid: 'zzz' }), { code: 'NOT_FOUND' })
})

test('旧数据：小岛的东西收回背包，大树重新种在正院，修整角落的暖豆退回', async () => {
  const { repo, service } = setup({
    garden: {
      welcomed: true, seq: 5, opened: ['center', 'pond', 'bamboo'],
      beans: { earned: {}, bonus: 60, spent: 500 },
      inventory: { grass: 1 },
      placed: [{ uid: 'p1', itemId: 'starter_tree', c: 4, r: 4 }, { uid: 'p2', itemId: 'daisy', c: 5, r: 1 }, { uid: 'p3', itemId: 'daisy', c: 7, r: 7 }],
    },
  })
  const view = await service.get('u1')
  assert.deepEqual(view.placed, [{ uid: 'p6', itemId: 'starter_tree', c: 11, r: 16 }])
  assert.deepEqual(view.inventory, [{ itemId: 'daisy', count: 2 }, { itemId: 'grass', count: 1 }])
  assert.deepEqual(view.areas.filter((a) => a.unlocked).map((a) => a.id), ['front', 'main'])
  assert.equal(view.beans, 60)
  const stored = await repo.getGarden('u1')
  assert.equal(stored.estate, 1)
  assert.deepEqual(stored.opened, ['front', 'main'])
  assert.equal(stored.beans.bonus, 560)
})

test('旧数据：大地图开荒的暖豆退回；更早的小庭院也一样迁', async () => {
  const big = setup({ garden: { welcomed: true, plots: ['1,1', '1,0', '2,1'], beans: { earned: {}, bonus: 60, spent: 250 }, placed: [{ uid: 'p1', itemId: 'starter_tree', c: 8, r: 8 }, { uid: 'p2', itemId: 'grass', c: 9, r: 7 }] } })
  const view = await big.service.get('u1')
  assert.deepEqual(view.placed.map((p) => [p.itemId, p.c, p.r]), [['starter_tree', 11, 16]])
  assert.deepEqual(view.inventory, [{ itemId: 'grass', count: 1 }])
  assert.equal(view.beans, 60)
  assert.equal((await big.repo.getGarden('u1')).plots, undefined)

  const small = setup({ garden: { welcomed: true, placed: [{ uid: 'p1', itemId: 'starter_tree', c: 2, r: 2 }, { uid: 'p2', itemId: 'daisy', c: 3, r: 0 }] } })
  const v2 = await small.service.get('u1')
  assert.deepEqual(v2.placed.map((p) => [p.itemId, p.c, p.r]), [['starter_tree', 11, 16]])
  assert.deepEqual(v2.inventory, [{ itemId: 'daisy', count: 1 }])
})

test('旧数据：还没领新手礼的空文档迁完不多出大树；已经是宅院的不再动', async () => {
  const fresh = setup({ garden: { beans: { earned: { [TODAY]: 10 }, bonus: 0, spent: 0 } } })
  const v = await fresh.service.get('u1')
  assert.deepEqual(v.welcome, { beans: 60, itemId: 'starter_tree' })
  assert.equal(v.placed.length, 1)
  const kept = setup({ garden: richGarden({ opened: ['front', 'main', 'pond'], placed: [{ uid: 'p1', itemId: 'daisy', c: 20, r: 10 }] }) })
  const k = await kept.service.get('u1')
  assert.deepEqual(k.placed.map((p) => [p.itemId, p.c, p.r]), [['daisy', 20, 10]])
  assert.deepEqual(k.areas.filter((a) => a.unlocked).map((a) => a.id), ['front', 'main', 'pond'])
})
```

`test/services-meal.test.js`：`const bambooGarden = () => ({ welcomed: true, placed: [{ uid: 'p1', itemId: 'bamboo', c: 0, r: 0 }] })` 改成 `const bambooGarden = () => ({ welcomed: true, estate: 1, placed: [{ uid: 'p1', itemId: 'bamboo', c: 10, r: 15 }] })`。

`test/router.test.js`：`unlock: record('garden.unlock')` 后面加 `, flip: record('garden.flip')`；pairs 里 `['garden.unlock', 'garden.unlock'],` 后面加 `['garden.flip', 'garden.flip'],`。

`test/cloud-e2e.test.js`：
1. 「养生庭院：…」里 `c: 3, r: 3` → `c: 10, r: 15`、被挡的 `c: 4, r: 4` → `c: 11, r: 16`、`c: 8, r: 8` → `c: 16, r: 17`（两处）。
2. 「庭院小动物」里翠竹 `c: 3, r: 4` → `c: 10, r: 15`。
3. 「修整角落：…」整个替换为：

```js
test('修整院子：豆不够提示、修好后旁边的能修、不挨着的不行', async () => {
  const cloud = createFakeCloud({ replies: [] })
  const { main } = loadCloudFunction(cloud)
  await main({ action: 'profile.save', data: profileInput })
  const first = await main({ action: 'garden.get' })
  assert.equal(first.data.hasProfile, true)
  assert.equal(first.data.daily.beansToday, 0)
  assert.deepEqual(first.data.areas.filter((a) => a.unlockable).map((a) => a.id), ['pond', 'flower', 'orchard', 'bamboo'])
  const poor = await main({ action: 'garden.unlock', data: { area: 'bamboo' } })
  assert.equal(poor.code, 'NO_BEANS')

  const doc = cloud.db.collections.get('gardens').get('u1')
  cloud.db.collections.get('gardens').set('u1', { ...doc, beans: { ...doc.beans, bonus: 500 } })
  const opened = await main({ action: 'garden.unlock', data: { area: 'bamboo' } })
  assert.equal(opened.ok, true, opened.message)
  assert.equal(opened.data.beans, 100)
  assert.deepEqual(opened.data.areas.filter((a) => a.unlocked).map((a) => a.id), ['front', 'main', 'bamboo'])
  assert.equal(opened.data.areas.find((a) => a.id === 'farm').unlockable, true)
  const far = await main({ action: 'garden.unlock', data: { area: 'spring' } })
  assert.deepEqual([far.code, far.message], ['BAD_REQUEST', '要先修好旁边的院子'])
  const flipped = await main({ action: 'garden.flip', data: { uid: first.data.placed[0].uid } })
  assert.equal(flipped.data.placed[0].flip, true)
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `node --test test/services-garden.test.js test/services-meal.test.js test/router.test.js test/cloud-e2e.test.js`
Expected: FAIL

- [ ] **Step 3: `garden-state.js`**（整份替换）

```js
// gardens 文档的完整形状：老数据或新用户缺的字段补上默认值，去掉已经废弃的字段

const { ANIMALS, STARTER_ITEM } = require('./shared/garden')
const { START_OPENED, STARTER_TILE } = require('./shared/estate')

const LEGACY_FIELDS = ['currentSpecies', 'unlocked', 'unseen']
// 小岛时代修整角落的价格，迁移时按这个退
const ISLAND_COSTS = { pond: 200, bamboo: 300, veg: 400, tea: 500 }

const isAnimal = (id) => ANIMALS.indexOf(id) !== -1

// 旧数据（小岛、3×3 大地图、更早的小庭院）换成宅院：摆的东西全收回背包，大树重新种在正院，
// 修整 / 开荒花的暖豆退回。写上 estate: 1，以后不再迁移
function adoptEstate(garden, doc) {
  const { plots, ...rest } = garden
  if (doc.estate) return { ...rest, estate: doc.estate, opened: doc.opened || START_OPENED.slice() }
  let refund = 0
  // 大地图开荒的价格：100、150、200……
  if (doc.plots) for (let k = 1; k < doc.plots.length; k++) refund += 100 + 50 * (k - 1)
  if (doc.opened) doc.opened.forEach((id) => { refund += ISLAND_COSTS[id] || 0 })
  const inventory = { ...garden.inventory }
  garden.placed.forEach((p) => {
    if (p.itemId === STARTER_ITEM) return
    inventory[p.itemId] = (inventory[p.itemId] || 0) + 1
  })
  const replant = garden.welcomed
  return {
    ...rest,
    estate: 1,
    opened: START_OPENED.slice(),
    inventory,
    placed: replant ? [{ uid: `p${garden.seq + 1}`, itemId: STARTER_ITEM, c: STARTER_TILE.c, r: STARTER_TILE.r }] : [],
    seq: replant ? garden.seq + 1 : garden.seq,
    beans: { ...garden.beans, bonus: garden.beans.bonus + refund },
  }
}

// 以前小动物是扭蛋抽的：背包里、花园里的直接变成住户（不算新住户，免得一次走进来一群）
function adoptAnimals(garden) {
  const found = garden.placed.filter((p) => isAnimal(p.itemId)).map((p) => p.itemId)
    .concat(Object.keys(garden.inventory).filter(isAnimal))
  if (!found.length) return garden
  const residents = garden.residents.slice()
  const collected = garden.collected.slice()
  found.forEach((id) => {
    if (!residents.some((r) => r.id === id)) residents.push({ id, since: null })
    if (collected.indexOf(id) === -1) collected.push(id)
  })
  const inventory = { ...garden.inventory }
  found.forEach((id) => delete inventory[id])
  return { ...garden, residents, collected, inventory, placed: garden.placed.filter((p) => !isAnimal(p.itemId)) }
}

function normalizeGarden(doc) {
  const g = { ...(doc || {}) }
  LEGACY_FIELDS.forEach((k) => delete g[k])
  const beans = g.beans || {}
  const gacha = g.gacha || {}
  // 修好了哪些院子（opened）和 estate 标记由 adoptEstate 给
  return adoptAnimals(adoptEstate({
    ...g,
    days: g.days || {},
    beans: { earned: beans.earned || {}, bonus: beans.bonus || 0, spent: beans.spent || 0 },
    inventory: g.inventory || {},
    placed: g.placed || [],
    collected: g.collected || [],
    gacha: { pulls: gacha.pulls || 0, sincePity: gacha.sincePity || 0 },
    welcomed: !!g.welcomed,
    // 摆放物品的编号计数器
    seq: g.seq || 0,
    // 住进来的小动物 [{ id, since }]，和还没在花园里看到的新住户
    residents: g.residents || [],
    arrivals: g.arrivals || [],
    // 已经领过的测试福利 id
    grants: g.grants || [],
  }, g))
}

module.exports = { normalizeGarden }
```

- [ ] **Step 4: `services/garden.js`**

1. import：`../lib/shared/garden` 的解构里删掉 `REGIONS, regionById, sceneryIn, placeProblem,`；在它后面加一行：

```js
const { AREAS, STARTER_TILE, canUnlock, unlockProblem, placeProblem } = require('../lib/shared/estate')
```

2. 删掉 `// 新手大树：中间花园里、小路交叉口的后方` 和 `const STARTER_TILE = { c: 4, r: 4 }` 两行。
3. 删掉 `// 小动物喜欢的东西：自己摆的，加上修整好的角落里自带的风景` 到 `likedThings` 函数结尾（含后面的空行）。
4. `view()`：`regions: …` 和 `scenery: …` 两行换成

```js
      areas: AREAS.map(({ id, name, cost }) => ({
        id, name, cost, unlocked: garden.opened.indexOf(id) !== -1, unlockable: canUnlock(garden.opened, id),
      })),
```

`waiting:` 那行改回 `waiting: waitingAnimals(garden.placed, garden.residents.map((r) => r.id)),`。
5. `checkTile` 整个替换为：

```js
  function checkTile(garden, itemId, c, r, ignoreUid) {
    const problem = placeProblem(garden.opened, garden.placed, itemId, c, r, ignoreUid)
    if (problem) throw new AppError(CODES.BAD_REQUEST, problem)
  }
```

6. `place`：`const { itemId, c, r } = input || {}` → `const { itemId, c, r, flip } = input || {}`；`checkTile(garden, c, r)` → `checkTile(garden, itemId, c, r)`；`garden.placed.concat({ uid: newUid(garden), itemId, c, r })` → `garden.placed.concat({ uid: newUid(garden), itemId, c, r, flip: !!flip })`。
7. `move`：`findPlaced(garden, uid)` → `const placed = findPlaced(garden, uid)`；`checkTile(garden, c, r, uid)` → `checkTile(garden, placed.itemId, c, r, uid)`。
8. `stash` 后面加：

```js
    // 换个方向：左右镜像
    async flip(openid, input) {
      const { uid } = input || {}
      const garden = await load(openid)
      const placed = findPlaced(garden, uid)
      garden.placed = garden.placed.map((p) => (p.uid === uid ? { ...p, flip: !placed.flip } : p))
      await repo.saveGarden(openid, garden)
      return view(garden)
    },
```

9. `arrive` 里 `waitingAnimals(likedThings(garden), …)` 改回 `waitingAnimals(garden.placed, …)`。
9b. `get` 开头的 `const garden = await load(openid)` 换成三行——旧数据迁移完要存回去，不然每次进来都重新迁：

```js
      const doc = await repo.getGarden(openid)
      const garden = normalizeGarden(doc)
      const migrated = !(doc && doc.estate)
```

`if (welcome || seen || testGift) await repo.saveGarden(openid, garden)` 改成 `if (welcome || seen || testGift || migrated) await repo.saveGarden(openid, garden)`。
10. `unlock` 整个替换为：

```js
    // 修整院子：要挨着已经修好的院子，花暖豆
    async unlock(openid, input) {
      const id = (input || {}).area
      const garden = await load(openid)
      const problem = unlockProblem(garden.opened, id)
      if (problem) throw new AppError(CODES.BAD_REQUEST, problem)
      const area = AREAS.find((a) => a.id === id)
      if (beanBalance(garden) < area.cost) throw new AppError(CODES.NO_BEANS, `暖豆不够啦，修整要 ${area.cost} 暖豆，再攒攒`)
      garden.beans = { ...garden.beans, spent: garden.beans.spent + area.cost }
      garden.opened = garden.opened.concat(id)
      await repo.saveGarden(openid, garden)
      return view(garden)
    },
```

`cloudfunctions/api/router.js`：`'garden.unlock': ['garden', 'unlock'],` 后面加 `'garden.flip': ['garden', 'flip'],`。

- [ ] **Step 5: 跑测试**

Run: `node --test test/services-garden.test.js test/services-meal.test.js test/router.test.js test/cloud-e2e.test.js test/estate.test.js test/garden.test.js test/shared-sync.test.js`
Expected: PASS

- [ ] **Step 6: 提交（本地）**

```bash
for f in cloudfunctions/api/lib/garden-state.js cloudfunctions/api/services/garden.js cloudfunctions/api/router.js; do node --check $f; done
git add cloudfunctions/api test/services-garden.test.js test/services-meal.test.js test/router.test.js test/cloud-e2e.test.js
git commit -m "feat(garden): estate migration, ground-aware placement, flip and adjacency unlocks

<trailer>"
```

---

### Task 4: 画面布局：`world.js` 宅院版 + `garden-view.js` 的 2×2、转向、影子

**Files:**
- Modify: `miniprogram/utils/world.js`（整份替换）、`miniprogram/utils/garden-view.js`
- Test: `test/world.test.js`（整份替换）、`test/garden-view.test.js`

**Interfaces:**
- Consumes: Task 1 的 `gridLayout`、Task 2 的 `estate.js`
- Produces（`garden-view.js`）：`FOOT2_SCALE = 2.2`、`itemAnchor(p, L) → { x, y, width, foot }`（图底边中点和图宽）、`shadowOf(x, y, width, L) → { left, bottom, width, height }`、`buildScene(placed, L)` 每项多 `foot`、`flip`、`shadow`；删除 `hintTiles`
- Produces（`world.js`）：`estateLayout(windowWidth)`、`offsetFor(point, L, win)`、`tilePoint(c, r, L)`、`areaOffset(areaId, L, win)`、`tileOffset(c, r, L, win)`、`artTiles(L) → [{ key, image, left, top, width, height }]`（16 块 `/images/garden/estate/t{row}{col}.jpg`）、`areaBox(id, L)`、`cloudViews(areas, L) → [{ key, area, image, left, top, width, delay }]`、`signViews(areas, opened, L) → [{ key, left, bottom, width, name, cost }]`、`hintViews(opened, placed, itemId, ignoreUid, L) → [{ key, c, r, left, top, width, height }]`、`tileFromTouch(x, y, rect, L)`

- [ ] **Step 1: 写失败的测试**

`test/world.test.js`（整份替换）：

```js
const test = require('node:test')
const assert = require('node:assert/strict')
const W = require('../miniprogram/utils/world')
const E = require('../miniprogram/utils/shared/estate')
const { tileTop, tileCenter } = require('../miniprogram/utils/iso')

const L = W.estateLayout(375)
const WIN = { width: 375, height: 700 }
const AREAS = E.AREAS.map((a) => ({
  id: a.id, name: a.name, cost: a.cost, unlocked: E.START_OPENED.indexOf(a.id) !== -1, unlockable: E.canUnlock(E.START_OPENED, a.id),
}))

test('estateLayout：1 倍时一个院子加两边的墙占屏幕宽 96%，四周留白', () => {
  assert.deepEqual([L.cols, L.rows], [37, 28])
  assert.ok(Math.abs(L.tileW * 9 - 375 * 0.96) < 1e-9)
  assert.equal(L.margin, 188)
  assert.equal(L.viewWidth, L.width + 376)
  assert.equal(L.viewHeight, L.height + 376)
})

test('areaOffset / tileOffset：把院子中间、某一格放到屏幕正中', () => {
  const o = W.areaOffset('main', L, WIN)
  const p = tileTop(14, 14, L)
  assert.ok(Math.abs(o.x + L.margin + p.x - 187.5) < 1e-9)
  assert.ok(Math.abs(o.y + L.margin + p.y - 350) < 1e-9)
  assert.equal(o.scale, 1)
  const t = W.tileOffset(11, 16, L, WIN)
  const q = tileCenter(11, 16, L)
  assert.ok(Math.abs(t.x + L.margin + q.x - 187.5) < 1e-9)
  assert.ok(Math.abs(t.y + L.margin + q.y - 350) < 1e-9)
})

test('artTiles：16 块正好拼满整个 #world', () => {
  const tiles = W.artTiles(L)
  assert.equal(tiles.length, 16)
  assert.equal(tiles[0].image, '/images/garden/estate/t00.jpg')
  assert.equal(tiles[15].image, '/images/garden/estate/t33.jpg')
  assert.ok(Math.abs(tiles[15].left + tiles[15].width - L.width) < 1e-9)
  assert.ok(Math.abs(tiles[15].top + tiles[15].height - L.height) < 1e-9)
  assert.deepEqual([tiles[1].left, tiles[1].top], [L.width / 4, 0])
  assert.deepEqual([tiles[4].left, tiles[4].top], [0, L.height / 4])
})

test('cloudViews：只有没修的院子有云，每个 6～9 朵，位置固定在院子里', () => {
  const clouds = W.cloudViews(AREAS, L)
  const byArea = {}
  clouds.forEach((c) => { byArea[c.area] = (byArea[c.area] || 0) + 1 })
  assert.deepEqual(Object.keys(byArea).sort(), E.AREAS.map((a) => a.id).filter((id) => E.START_OPENED.indexOf(id) === -1).sort())
  Object.values(byArea).forEach((n) => assert.ok(n >= 6 && n <= 9))
  assert.deepEqual(W.cloudViews(AREAS, L), clouds)
  const box = W.areaBox('pond', L)
  clouds.filter((c) => c.area === 'pond').forEach((c) => {
    const mid = c.left + c.width / 2
    assert.ok(mid > box.left && mid < box.left + box.width, c.key)
    assert.ok(c.top > box.top - c.width && c.top < box.top + box.height, c.key)
    assert.ok(c.image === '/images/garden/cloud.png' && c.width > 0 && c.delay >= 0)
  })
})

test('signViews：能修的院子门里侧立木牌', () => {
  const signs = W.signViews(AREAS, E.START_OPENED, L)
  assert.deepEqual(signs.map((s) => s.key), ['pond', 'flower', 'orchard', 'bamboo'])
  const pond = signs[0]
  assert.deepEqual([pond.name, pond.cost], ['荷塘院', 200])
  const p = tileCenter(19, 13, L)
  assert.ok(Math.abs(pond.left + pond.width / 2 - p.x) < 1e-9)
  assert.ok(Math.abs(pond.bottom - (L.height - p.y)) < 1e-9)
})

test('hintViews：亮起能摆的格子', () => {
  const placed = [{ uid: 'p1', itemId: 'starter_tree', c: 11, r: 16 }]
  const hints = W.hintViews(E.START_OPENED, placed, 'daisy', null, L)
  assert.equal(hints.length, 47)
  const h = hints.find((t) => t.c === 10 && t.r === 15)
  const top = tileTop(10, 15, L)
  assert.deepEqual([h.key, h.left, h.top, h.width, h.height], ['10-15', top.x - L.tileW / 2, top.y, L.tileW, L.tileH])
  assert.equal(W.hintViews(E.START_OPENED, placed, 'daisy', 'p1', L).length, 48)
  assert.ok(W.hintViews(E.START_OPENED, placed, 'pavilion', null, L).length < 47)
})

test('tileFromTouch：拖动、缩放之后点到的还是那一格', () => {
  for (const scale of [0.5, 1, 1.5]) {
    const rect = { left: -300, top: -120, width: L.width * scale }
    const p = tileCenter(21, 14, L)
    assert.deepEqual(W.tileFromTouch(rect.left + p.x * scale, rect.top + p.y * scale, rect, L), { c: 21, r: 14 })
  }
  assert.equal(W.tileFromTouch(-5000, -5000, { left: 0, top: 0, width: L.width }, L), null)
})
```

`test/garden-view.test.js`：
1. 顶部解构里删掉 `hintTiles,`，加 `itemAnchor, shadowOf, FOOT2_SCALE,`；`const { isoLayout, tileCenter } = …` 改成 `const { isoLayout, tileTop, tileCenter } = …`。
2. 删掉「hintTiles：标出所有空地…」和「hintTiles：可以只算开垦了的格子」两个测试。
3. 「buildScene：…」测试末尾（`assert.ok(sprites[1].width > sprites[0].width)` 之后）追加：

```js
  // 影子在脚下，和图一样居中
  assert.equal(panda.flip, false)
  assert.equal(panda.foot, 1)
  assert.ok(Math.abs(panda.shadow.left + panda.shadow.width / 2 - center.x) < 0.01)
  assert.ok(Math.abs(panda.shadow.width - panda.width * 0.7) < 0.01)
  assert.ok(Math.abs(panda.shadow.height - panda.shadow.width / 4) < 0.01)
  assert.ok(panda.shadow.bottom < panda.bottom && panda.shadow.bottom > panda.bottom - panda.shadow.height)
```

4. 追加测试：

```js
test('buildScene：2×2 的大件画在四格中间、按 2.2 格宽，带转向', () => {
  const [big] = buildScene([{ uid: 'a', itemId: 'pavilion', c: 3, r: 3, flip: true }], L)
  assert.equal(big.foot, 2)
  assert.equal(big.flip, true)
  assert.ok(Math.abs(big.width - L.tileW * FOOT2_SCALE) < 1e-9)
  const top = tileTop(3, 3, L)
  assert.ok(Math.abs(big.left + big.width / 2 - top.x) < 0.01)
  assert.ok(Math.abs(big.bottom - (L.height - (top.y + L.tileH * 0.36))) < 0.01)
  assert.equal(big.z, 63)
  const anchor = itemAnchor({ itemId: 'pavilion', c: 3, r: 3 }, L)
  assert.deepEqual([anchor.x, anchor.foot], [top.x, 2])
  assert.ok(Math.abs(anchor.y - (top.y + L.tileH * 0.36)) < 1e-9)
  const small = itemAnchor({ itemId: 'daisy', c: 3, r: 3 }, L)
  assert.deepEqual([small.x, small.width, small.foot], [tileCenter(3, 3, L).x, L.tileW * 0.8, 1])
  const shadow = shadowOf(100, 50, 40, L)
  assert.deepEqual(shadow, { left: 100 - 14, bottom: L.height - 50 - 3.5, width: 28, height: 7 })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `node --test test/world.test.js test/garden-view.test.js`
Expected: FAIL

- [ ] **Step 3: `garden-view.js`**

1. import 改成 `const { tileTop, tileCenter } = require('./iso')`（原来就有，确认两个都在）。
2. `const SIZE_SCALE = { s: 0.8, m: 1.0, l: 1.3 }` 后面加：

```js
// 2×2 大件的宽度（相对格子宽度）
const FOOT2_SCALE = 2.2
// 脚下影子：宽是图宽的 0.7，扁椭圆
const SHADOW_RATIO = 0.7

// 物件的落点：1 格的在格子中心，2×2 的在四格中间（正好是左前角那格的顶点）；y 是图底边（比落点再往下一点，像踩在地上）
function itemAnchor(p, L) {
  const item = itemById(p.itemId)
  const foot = item && item.foot === 2 ? 2 : 1
  const width = L.tileW * (foot === 2 ? FOOT2_SCALE : SIZE_SCALE[item ? item.size : 'm'])
  const base = foot === 2 ? tileTop(p.c, p.r, L) : tileCenter(p.c, p.r, L)
  return { x: base.x, y: base.y + L.tileH * 0.18 * foot, width, foot }
}

// 影子的位置（x、y 是图底边中点，和 itemAnchor 一样的坐标系）
function shadowOf(x, y, width, L) {
  const w = width * SHADOW_RATIO
  const h = w / 4
  return { left: x - w / 2, bottom: L.height - y - h / 2, width: w, height: h }
}
```

3. `buildScene` 整个替换为：

```js
// 花园里摆的东西：按前后排序（后排先画），图底边对准落点；2×2 的按左前角那格排前后
function buildScene(placed, L) {
  return placed
    .map((p) => ({ p, item: itemById(p.itemId) }))
    .filter((x) => x.item)
    .map(({ p, item }) => {
      const a = itemAnchor(p, L)
      return {
        uid: p.uid,
        itemId: p.itemId,
        c: p.c,
        r: p.r,
        foot: a.foot,
        flip: !!p.flip,
        name: item.name,
        image: itemImage(item.id),
        width: a.width,
        left: a.x - a.width / 2,
        bottom: L.height - a.y,
        shadow: shadowOf(a.x, a.y, a.width, L),
        z: (p.c + p.r) * 10 + p.c,
      }
    })
    .sort((a, b) => a.z - b.z)
}
```

4. 删掉 `hintTiles` 函数和它上面的注释；`module.exports` 改成 `module.exports = { SIZE_SCALE, FOOT2_SCALE, itemImage, rarityOf, itemAnchor, shadowOf, buildScene, inventoryList, collectionGroups, arrivalCard }`。

- [ ] **Step 4: `world.js`**（整份替换）

```js
// 园林大宅院的画面布局：尺寸、底图切块、没修院子上的云朵、修整木牌、摆放时的亮格、屏幕点按 → 格子（纯函数，有单测）

const { GRID, areaById, signTile, placeableTiles } = require('./shared/estate')
const { gridLayout, tileTop, tileAt } = require('./iso')

// 1 倍时一个院子（8 格 + 两边的墙）占屏幕宽的比例；宅院外面一圈留白占屏幕宽的比例
const COURT_SCREEN = 0.96
const MARGIN_SCREEN = 0.5
// 底图切成 ART_SPLIT × ART_SPLIT 块
const ART_SPLIT = 4
const CLOUD_IMAGE = '/images/garden/cloud.png'

function estateLayout(windowWidth) {
  const tileW = (windowWidth * COURT_SCREEN) / 9
  const L = gridLayout(GRID.cols, GRID.rows, tileW)
  const margin = Math.round(windowWidth * MARGIN_SCREEN)
  return { ...L, margin, viewWidth: L.width + margin * 2, viewHeight: L.height + margin * 2 }
}

// movable-view 的位置：让 #world 里的某个点对准屏幕正中
function offsetFor(point, L, win) {
  return { x: win.width / 2 - (L.margin + point.x), y: win.height / 2 - (L.margin + point.y), scale: 1 }
}

// 格子中心（c、r 可以是小数）
function tilePoint(c, r, L) {
  return tileTop(c + 0.5, r + 0.5, L)
}

function areaOffset(areaId, L, win) {
  const [c0, r0, c1, r1] = areaById(areaId).rect
  return offsetFor(tileTop((c0 + c1) / 2, (r0 + r1) / 2, L), L, win)
}

function tileOffset(c, r, L, win) {
  return offsetFor(tilePoint(c, r, L), L, win)
}

// 底图：一整张切成 4×4 块，正好铺满 #world
function artTiles(L) {
  const w = L.width / ART_SPLIT
  const h = L.height / ART_SPLIT
  const tiles = []
  for (let row = 0; row < ART_SPLIT; row++) {
    for (let col = 0; col < ART_SPLIT; col++) {
      tiles.push({ key: `art-${row}-${col}`, image: `/images/garden/estate/t${row}${col}.jpg`, left: col * w, top: row * h, width: w, height: h })
    }
  }
  return tiles
}

// 一个院子的菱形在 #world 里的外框
function areaBox(id, L) {
  const [c0, r0, c1, r1] = areaById(id).rect
  const w = c1 - c0
  const h = r1 - r0
  const top = tileTop(c0, r0, L)
  return { left: top.x - (h * L.tileW) / 2, top: top.y, width: ((w + h) * L.tileW) / 2, height: ((w + h) * L.tileH) / 2 }
}

// 可重复的伪随机：同一个院子、同一朵云每次位置一样
function noise(n) {
  const x = Math.sin(n * 12.9898 + 78.233) * 43758.5453
  return x - Math.floor(x)
}

// 没修的院子：铺 6～9 朵云，慢慢飘
function cloudViews(areas, L) {
  const out = []
  areas.forEach((a, ai) => {
    if (a.unlocked) return
    const [c0, r0, c1, r1] = areaById(a.id).rect
    const n = 6 + Math.floor(noise(ai + 1) * 4)
    for (let i = 0; i < n; i++) {
      const u = 0.1 + 0.8 * noise(ai * 100 + i * 3 + 1)
      const v = 0.1 + 0.8 * noise(ai * 100 + i * 3 + 2)
      const p = tileTop(c0 + u * (c1 - c0), r0 + v * (r1 - r0), L)
      const width = L.tileW * (2.4 + 1.6 * noise(ai * 100 + i * 3 + 3))
      out.push({ key: `${a.id}-${i}`, area: a.id, image: CLOUD_IMAGE, left: p.x - width / 2, top: p.y - width * 0.25, width, delay: Math.round(i * 7) / 10 })
    }
  })
  return out
}

// 能修的院子：门里侧立木牌
function signViews(areas, opened, L) {
  const signWidth = L.tileW * 1.6
  const out = []
  areas.forEach((a) => {
    if (!a.unlockable) return
    const t = signTile(opened, a.id)
    if (!t) return
    const p = tilePoint(t.c, t.r, L)
    out.push({ key: a.id, left: p.x - signWidth / 2, bottom: L.height - p.y, width: signWidth, name: a.name, cost: a.cost })
  })
  return out
}

// 摆放、移动时亮起的格子（2×2 的只亮能当左前角的格，点下去占 4 格）
function hintViews(opened, placed, itemId, ignoreUid, L) {
  return placeableTiles(opened, placed, itemId, ignoreUid).map(({ c, r }) => {
    const t = tileTop(c, r, L)
    return { key: `${c}-${r}`, c, r, left: t.x - L.tileW / 2, top: t.y, width: L.tileW, height: L.tileH }
  })
}

// 屏幕上的点 → 格子；rect 是 #world 此刻在屏幕上的位置和宽度（已经算上拖动和缩放）
function tileFromTouch(x, y, rect, L) {
  const scale = rect.width / L.width
  return tileAt((x - rect.left) / scale, (y - rect.top) / scale, L)
}

module.exports = {
  estateLayout,
  offsetFor,
  tilePoint,
  areaOffset,
  tileOffset,
  artTiles,
  areaBox,
  cloudViews,
  signViews,
  hintViews,
  tileFromTouch,
}
```

- [ ] **Step 5: 跑测试**

Run: `node --test test/world.test.js test/garden-view.test.js`
Expected: PASS（`garden-life.test.js` 这时会因为 `hintTiles`/`scale` 不存在而失败，Task 5 改）

- [ ] **Step 6: 提交（本地）**

```bash
for f in miniprogram/utils/world.js miniprogram/utils/garden-view.js; do node --check $f; done
git add miniprogram/utils/world.js miniprogram/utils/garden-view.js test/world.test.js test/garden-view.test.js
git commit -m "feat(garden): estate layout, art tiles, clouds, signs, 2x2 anchors and shadows

<trailer>"
```

---

### Task 5: 小动物：跨院走动、作息、小事、回窝、「找它」

**Files:**
- Modify: `miniprogram/utils/animals.js`（整份替换）、`miniprogram/utils/garden-life.js`（整份替换）
- Test: `test/animals.test.js`、`test/garden-life.test.js`（整份替换）

**Interfaces:**
- Consumes: Task 2 的 `footprint`；Task 4 的 `itemAnchor`、`shadowOf`
- Produces（`animals.js`）：`SWIMMERS`、`SLEEP_SPOTS`、`MORNING_AREAS`、`TRICKS: [{ id, animals, spot, action?, emoji, doing, line }]`、`TRICK_CHANCE`、`TRICK_RANGE`、`TRICK_COOLDOWN_MS`、`PLAY_RANGE = 6`、`periodOf(hour) → 'morning' | 'noon' | 'day' | 'night'`、`chooseStep(pos, { size, blocked, home, allow? }, rand)`（`size` 可以是数字或 `{ cols, rows }`）、`choosePlay(animalId, pos, { …, chance? }, rand)`、`chooseTrick(animalId, pos, { spots, blocked, size, busy, cooldown, now }, rand) → { trick, target, path } | null`、`sleepTarget(animalId, pos, { spots, blocked, size, areaOf, free }) → { target, path } | null`、`gatherTarget(pos, { blocked, size, areaOf, free })`、`wanderTarget(pos, { blocked, size, free }, rand)`、`describe(state, areaName, toAreaName) → string`、`lineFor(animalId, state, rand)`（`state = { action, play, trick }`）
- Produces（`garden-life.js`）：`createLife({ L, placed, residents, arrivals, walk(c, r, swims), areaOf(c, r), spots, door, hour, random, clock, onChange })`；sprite 多 `shadow`（下水时为 `null`）；新方法 `whereIs() → [{ index, id, name, image, c, r, area, toArea, state }]`、`focus(index) → { c, r }`；`open` 参数删除

- [ ] **Step 1: 写失败的测试**

`test/animals.test.js`：
1. 「每只动物都有脾气…」里 `assert.deepEqual(Object.keys(A.ANIMAL_INFO).sort(), [...ANIMALS].sort())` 保持；测试末尾追加 `assert.deepEqual(A.SWIMMERS, ['duck', 'turtle', 'crane'])`。
2. 「chooseStep：…」末尾追加：

```js
  // allow：只走允许的格子
  const onlyLeft = (t) => t.c <= 2
  for (const v of [0, 0.3, 0.6, 0.99]) {
    const s = A.chooseStep({ c: 2, r: 2 }, { size: 6, blocked: blocked(), home: null, allow: onlyLeft }, always(v))
    assert.ok(s.c <= 2, JSON.stringify(s))
  }
  assert.equal(A.chooseStep({ c: 2, r: 2 }, { size: { cols: 3, rows: 6 }, blocked: blocked(), home: null, allow: (t) => t.c > 5 }, always(0)), null)
```

3. 「choosePlay：按概率…」里 `const play = A.choosePlay('panda', pos, ctx(), always(0.1))` 前面加一行 `assert.equal(A.choosePlay('panda', pos, ctx({ chance: 0.6 }), always(0.5)).uid, 'p1')`。
4. 「lineFor：…」末尾追加 `assert.equal(A.lineFor('tabby_cat', { action: 'trick', play: null, trick: A.TRICKS[0] }, always(0)), A.TRICKS[0].line)`。
5. 文件末尾追加：

```js
test('periodOf：早上、中午、晚上、其他', () => {
  assert.deepEqual([5, 6, 8, 9, 11, 13, 14, 18, 19, 23].map(A.periodOf), ['night', 'morning', 'morning', 'day', 'noon', 'noon', 'day', 'day', 'night', 'night'])
})

test('小事表：动物、活动点都对得上，每只至少两件', () => {
  const spotIds = require('../miniprogram/utils/shared/estate').SPOTS.map((s) => s.id)
  for (const t of A.TRICKS) {
    t.animals.forEach((id) => assert.ok(ANIMALS.indexOf(id) !== -1, t.id))
    if (t.spot) assert.ok(spotIds.indexOf(t.spot) !== -1, `${t.id} 的活动点 ${t.spot}`)
    assert.ok(t.emoji && t.doing && t.line, t.id)
  }
  for (const id of ANIMALS) assert.ok(A.TRICKS.filter((t) => t.animals.indexOf(id) !== -1).length >= 2, id)
  for (const [id, spot] of Object.entries(A.SLEEP_SPOTS)) assert.ok(ANIMALS.indexOf(id) !== -1 && spotIds.indexOf(spot) !== -1, id)
})

test('chooseTrick：按概率、冷却、活动点有没有修、能不能走到挑一件小事', () => {
  const spots = [{ id: 'well', area: 'veg', c: 3, r: 0 }, { id: 'steps', area: 'main', c: 0, r: 3 }]
  const ctx = (extra = {}) => ({ spots, blocked: blocked([3, 0]), size: 6, busy: new Set(), cooldown: {}, now: 1000, ...extra })
  const pos = { c: 0, r: 0 }
  assert.equal(A.chooseTrick('tabby_cat', pos, ctx(), always(0.5)), null)
  const trick = A.chooseTrick('tabby_cat', pos, ctx(), always(0))
  assert.equal(trick.trick.id, 'mirror')
  assert.deepEqual(trick.target, { c: 3, r: 0 })
  assert.equal(trick.path.length, 3)
  // 井被别的动物占着、冷却中：换别的（always(0) 挑第一件）
  assert.notEqual(A.chooseTrick('tabby_cat', pos, ctx({ busy: new Set(['well']) }), always(0)).trick.id, 'mirror')
  assert.notEqual(A.chooseTrick('tabby_cat', pos, ctx({ cooldown: { 'tabby_cat:mirror': 5000 } }), always(0)).trick.id, 'mirror')
  // 没有活动点的小事在原地做
  const tail = A.chooseTrick('ginger_cat', pos, ctx({ spots: [] }), always(0))
  assert.equal(tail.trick.id, 'tail')
  assert.deepEqual([tail.target, tail.path], [pos, []])
  // 活动点没修（不在 spots 里）就做不了；小花猫的小事都要活动点，就没事可做
  assert.equal(A.chooseTrick('tabby_cat', pos, ctx({ spots: [] }), always(0)), null)
})

test('sleepTarget / gatherTarget / wanderTarget', () => {
  const free = []
  for (let c = 0; c < 6; c++) for (let r = 0; r < 6; r++) free.push({ c, r })
  const areaOf = (c) => (c < 3 ? 'main' : 'pond')
  const spots = [{ id: 'eaves', area: 'main', c: 1, r: 1 }, { id: 'pond_water', area: 'pond', c: 5, r: 5 }]
  const sleep = A.sleepTarget('tabby_cat', { c: 4, r: 4 }, { spots, blocked: blocked(), size: 6, areaOf, free })
  assert.deepEqual(sleep.target, { c: 1, r: 1 })
  assert.equal(sleep.path.length, 6)
  // 窝被占了：睡旁边
  const beside = A.sleepTarget('tabby_cat', { c: 4, r: 4 }, { spots, blocked: blocked([1, 1]), size: 6, areaOf, free })
  assert.equal(Math.abs(beside.target.c - 1) + Math.abs(beside.target.r - 1), 1)
  // 没有窝（院子没修）：正院里最近的空格
  const fallback = A.sleepTarget('chick', { c: 4, r: 0 }, { spots, blocked: blocked(), size: 6, areaOf, free })
  assert.deepEqual(fallback.target, { c: 2, r: 0 })
  // 已经在窝里：不用走
  assert.deepEqual(A.sleepTarget('tabby_cat', { c: 1, r: 1 }, { spots, blocked: blocked(), size: 6, areaOf, free }).path, [])
  const gather = A.gatherTarget({ c: 5, r: 2 }, { blocked: blocked(), size: 6, areaOf, free })
  assert.equal(gather.target.c, 2)
  assert.equal(gather.path.length, 3)
  assert.equal(A.gatherTarget({ c: 1, r: 2 }, { blocked: blocked(), size: 6, areaOf, free }), null)
  const wander = A.wanderTarget({ c: 0, r: 0 }, { blocked: blocked(), size: 6, free }, always(0.5))
  assert.ok(wander && wander.path.length >= 3)
  assert.equal(A.wanderTarget({ c: 0, r: 0 }, { blocked: blocked(), size: 6, free: [{ c: 0, r: 1 }] }, always(0.5)), null)
})

test('describe：告诉你它在哪在干嘛', () => {
  assert.equal(A.describe({ action: 'sleep', play: null, trick: null }, '正院', ''), '在正院睡觉')
  assert.equal(A.describe({ action: 'trick', play: null, trick: A.TRICKS[0] }, '菜园', ''), '在菜园照镜子')
  assert.equal(A.describe({ action: 'eat', play: { play: A.PLAYS.bamboo }, trick: null }, '竹林院', ''), '在竹林院吃东西')
  assert.equal(A.describe({ action: 'swim', play: { play: A.PLAYS.koi_pond }, trick: null }, '荷塘院', ''), '在荷塘院玩水')
  assert.equal(A.describe({ action: 'walk', play: null, trick: null }, '正院', '荷塘院'), '正往荷塘院走')
  assert.equal(A.describe({ action: 'walk', play: null, trick: null }, '正院', ''), '正往那边走')
  assert.equal(A.describe({ action: 'idle', play: null, trick: null }, '前院', ''), '在前院溜达')
  assert.equal(A.describe({ action: 'idle', play: null, trick: null }, '', ''), '溜达')
})
```

`test/garden-life.test.js`（整份替换）。用一个 12 × 6 的假宅院：左边 c 0～4 是「正院」，c 5 是墙、`(5, 2)` 是门，右边 c 6～10 是「荷塘院」，`(8, 2)` 是水，c 11 是墙；大门在网格外 `(2, 6)`：

```js
const test = require('node:test')
const assert = require('node:assert/strict')
const { createLife } = require('../miniprogram/utils/garden-life')
const { gridLayout, tileCenter } = require('../miniprogram/utils/iso')
const { itemAnchor } = require('../miniprogram/utils/garden-view')
const A = require('../miniprogram/utils/animals')
const { manualClock } = require('./helpers/manual-clock')

const L = gridLayout(12, 6, 40)
const WATER = { c: 8, r: 2 }
const walk = (c, r, swims) => {
  if (c < 0 || r < 0 || c >= 12 || r >= 6) return false
  if (c === 8 && r === 2) return !!swims
  if (c === 5) return r === 2
  return c !== 11
}
const areaOf = (c) => (c <= 4 ? 'main' : c >= 6 && c <= 10 ? 'pond' : '')
const SPOTS = [
  { id: 'eaves', area: 'main', c: 1, r: 1 },
  { id: 'pond_water', area: 'pond', c: 8, r: 2 },
  { id: 'well', area: 'pond', c: 9, r: 4 },
  { id: 'steps', area: 'main', c: 0, r: 3 },
]
const DOOR = { c: 2, r: 6 }

// 可重复的伪随机
function lcg(seed) {
  let s = seed
  return () => (s = (s * 16807) % 2147483647) / 2147483647
}

// sprite 站在哪一格（站在物件上面时返回 null）
function tileOf(s) {
  const x = s.left + s.width / 2
  for (let c = -1; c <= L.cols; c++) {
    for (let r = -1; r <= L.rows; r++) {
      const center = tileCenter(c, r, L)
      if (Math.abs(center.x - x) < 0.01 && Math.abs(L.height - (center.y + L.tileH * 0.18) - s.bottom) < 0.01) return { c, r }
    }
  }
  return null
}

function setup(opts) {
  const clock = manualClock()
  const sprites = {}
  const life = createLife({ L, clock, walk, areaOf, spots: SPOTS, hour: () => 15, onChange: (i, s) => { sprites[i] = s }, ...opts })
  life.sprites().forEach((s, i) => { sprites[i] = s })
  return { clock, life, sprites }
}

// 跑一段时间，记录每只动物到过的格子和做过的动作
function run(life, clock, sprites, ms, step = 500) {
  const tiles = {}
  const actions = {}
  for (let t = 0; t < ms; t += step) {
    clock.advance(step)
    Object.entries(sprites).forEach(([i, s]) => {
      const tile = tileOf(s)
      if (tile) (tiles[i] = tiles[i] || []).push(tile)
      ;(actions[i] = actions[i] || new Set()).add(s.action)
    })
  }
  return { tiles, actions }
}

test('一开始站在家附近的空格，图、大小、影子都对', () => {
  const placed = [{ uid: 'p1', itemId: 'bamboo', c: 2, r: 2 }, { uid: 'p2', itemId: 'starter_tree', c: 0, r: 0 }]
  const { sprites } = setup({ placed, residents: ['panda', 'chick'], random: lcg(7) })
  const panda = sprites[0]
  assert.equal(panda.id, 'panda')
  assert.equal(panda.image, '/images/garden/items/panda.png')
  assert.equal(panda.width, L.tileW * 0.8)
  assert.equal(panda.bodyHeight, panda.width)
  const t = tileOf(panda)
  assert.ok(Math.abs(t.c - 2) + Math.abs(t.r - 2) <= 2)
  assert.ok(!(t.c === 2 && t.r === 2) && !(t.c === 0 && t.r === 0))
  assert.notDeepEqual(tileOf(sprites[1]), t)
  assert.equal(panda.action, 'idle')
  assert.ok(Math.abs(panda.shadow.width - panda.width * 0.7) < 0.01)
  assert.ok(Math.abs(panda.shadow.left + panda.shadow.width / 2 - (panda.left + panda.width / 2)) < 0.01)
})

test('逛十分钟：只走能走的地，不踩物件（2×2 的四格都不踩），不挤一格，会穿门去另一个院子', () => {
  const placed = [{ uid: 'p1', itemId: 'pavilion', c: 2, r: 4 }, { uid: 'p2', itemId: 'grass', c: 7, r: 1 }]
  const clock = manualClock()
  const current = {}
  const life = createLife({
    L, placed, residents: ['chick', 'rabbit', 'tabby_cat'], random: lcg(42), clock, walk, areaOf, spots: SPOTS, hour: () => 15,
    onChange: (i, s) => {
      current[i] = s
      const tiles = Object.values(current).map(tileOf).filter(Boolean)
      const keys = tiles.map((t) => `${t.c},${t.r}`)
      assert.equal(new Set(keys).size, keys.length, '两只动物挤在一格')
      tiles.forEach((t) => {
        assert.ok(walk(t.c, t.r, false), `走到了不能走的地 ${t.c},${t.r}`)
        assert.ok(!['2,4', '1,4', '2,3', '1,3', '7,1'].includes(`${t.c},${t.r}`), `踩到物件 ${t.c},${t.r}`)
      })
    },
  })
  life.sprites().forEach((s, i) => { current[i] = s })
  life.start()
  const seen = new Set()
  for (let t = 0; t < 10 * 60 * 1000; t += 500) {
    clock.advance(500)
    Object.values(current).forEach((s) => {
      const tile = tileOf(s)
      if (tile) seen.add(areaOf(tile.c))
    })
  }
  assert.deepEqual([...seen].filter(Boolean).sort(), ['main', 'pond'])
  life.stop()
  assert.equal(clock.count(), 0)
})

test('鸭子能下水，别的不下：下水时半身入水、没有影子', () => {
  const { clock, life, sprites } = setup({ placed: [], residents: ['duck', 'chick'], random: lcg(5) })
  life.start()
  const { tiles } = run(life, clock, sprites, 10 * 60 * 1000)
  const duckInWater = tiles[0].some((t) => t.c === WATER.c && t.r === WATER.r)
  assert.ok(duckInWater, '鸭子没下过水')
  assert.ok(!tiles[1].some((t) => t.c === WATER.c && t.r === WATER.r))
  life.stop()
})

test('站到物件上玩：猫趴小板凳，落脚点按物件的图算；2×2 的池子鸭子也能下', () => {
  const placed = [{ uid: 'p1', itemId: 'stool', c: 3, r: 3 }]
  const { clock, life, sprites } = setup({ placed, residents: ['tabby_cat'], random: () => 0.25 })
  life.start()
  let perch = null
  for (let i = 0; i < 120 && !perch; i++) {
    clock.advance(500)
    if (sprites[0].action === 'perch') perch = { ...sprites[0] }
  }
  assert.ok(perch, '没上板凳')
  assert.equal(tileOf(perch), null)
  const a = itemAnchor(placed[0], L)
  assert.ok(Math.abs(perch.left + perch.width / 2 - (a.x - a.width / 2 + A.PLAYS.stool.spot.x * a.width)) < 0.01)
  assert.ok(Math.abs(perch.bottom - (L.height - a.y + A.PLAYS.stool.spot.y * a.width)) < 0.01)
  assert.equal(perch.emoji, '💤')
  life.stop()

  const pond = [{ uid: 'p1', itemId: 'koi_pond', c: 3, r: 3 }]
  const d = setup({ placed: pond, residents: ['duck'], random: () => 0.25 })
  d.life.start()
  let swim = null
  for (let i = 0; i < 120 && !swim; i++) {
    d.clock.advance(500)
    if (d.sprites[0].action === 'swim') swim = { ...d.sprites[0] }
  }
  assert.ok(swim, '没下池子')
  const b = itemAnchor(pond[0], L)
  assert.ok(Math.abs(swim.left + swim.width / 2 - (b.x - b.width / 2 + A.PLAYS.koi_pond.spot.x * b.width)) < 0.01)
  assert.ok(swim.bodyHeight < swim.width)
  assert.equal(swim.shadow, null)
  assert.ok(Math.abs(swim.bubbleBottom - (swim.bodyHeight - swim.width * A.ANIMAL_INFO.duck.top + 4)) < 0.01)
  d.life.stop()
})

test('晚上回窝睡：猫到屋檐下，鸭子睡在水里；白天醒来', () => {
  let hour = 22
  const { clock, life, sprites } = setup({ placed: [], residents: ['tabby_cat', 'duck'], random: lcg(3), hour: () => hour })
  life.start()
  clock.advance(3 * 60 * 1000)
  assert.deepEqual(tileOf(sprites[0]), { c: 1, r: 1 })
  assert.equal(sprites[0].action, 'sleep')
  assert.equal(sprites[0].emoji, '💤')
  assert.deepEqual(tileOf(sprites[1]), WATER)
  assert.equal(sprites[1].action, 'sleep')
  assert.ok(sprites[1].bodyHeight < sprites[1].width)
  assert.equal(sprites[1].shadow, null)
  // 一直睡到天亮
  clock.advance(5 * 60 * 1000)
  assert.equal(sprites[0].action, 'sleep')
  hour = 8
  clock.advance(3 * 60 * 1000)
  assert.notEqual(sprites[0].action, 'sleep')
  life.stop()
})

test('早上 6～9 点：都往正院凑，不乱跑', () => {
  const { clock, life, sprites } = setup({ placed: [], residents: ['chick', 'rabbit', 'duck'], random: lcg(21), hour: () => 7 })
  life.start()
  clock.advance(2 * 60 * 1000)
  const { tiles, actions } = run(life, clock, sprites, 3 * 60 * 1000)
  Object.values(tiles).forEach((list) => list.forEach((t) => assert.equal(areaOf(t.c), 'main', JSON.stringify(t))))
  Object.values(actions).forEach((set) => assert.ok(!set.has('sleep')))
  life.stop()
})

test('中午 11～14 点：爱打盹', () => {
  const { clock, life, sprites } = setup({ placed: [], residents: ['chick'], random: lcg(8), hour: () => 12 })
  life.start()
  const { actions } = run(life, clock, sprites, 2 * 60 * 1000)
  assert.ok(actions[0].has('sleep'))
  life.stop()
})

test('白天会做小事：小花猫去井边照镜子，头上冒表情和话', () => {
  const { clock, life, sprites } = setup({ placed: [], residents: ['tabby_cat'], random: lcg(13) })
  life.start()
  let tricked = null
  for (let i = 0; i < 20 * 60 * 2 && !tricked; i++) {
    clock.advance(500)
    if (sprites[0].action === 'trick' && sprites[0].emoji === '✨') tricked = { ...sprites[0] }
  }
  assert.ok(tricked, '没去照镜子')
  assert.deepEqual(tileOf(tricked), { c: 9, r: 4 })
  assert.equal(tricked.bubble, '井里有只猫在看我，喵')
  life.stop()
})

test('新住户从大门走进来，头上说自我介绍，走到家旁边', () => {
  const placed = [{ uid: 'p1', itemId: 'grass', c: 1, r: 2 }]
  const { clock, life, sprites } = setup({ placed, residents: ['chick'], arrivals: ['chick'], door: DOOR, random: lcg(3) })
  assert.deepEqual(tileOf(sprites[0]), DOOR)
  assert.equal(sprites[0].bubble, A.ANIMAL_INFO.chick.hello)
  life.start()
  clock.advance(20000)
  const t = tileOf(sprites[0])
  assert.ok(t && walk(t.c, t.r, false), JSON.stringify(t))
  assert.ok(Math.abs(t.c - 1) + Math.abs(t.r - 2) <= 2)
  assert.equal(sprites[0].bubble, '')
  life.stop()
})

test('whereIs / focus：告诉你每只在哪在干嘛，找它时冒爱心', () => {
  const { clock, life, sprites } = setup({ placed: [], residents: ['tabby_cat', 'duck'], random: lcg(2) })
  const list = life.whereIs()
  assert.equal(list.length, 2)
  assert.deepEqual([list[0].index, list[0].id, list[0].name, list[0].image], [0, 'tabby_cat', '小花猫', '/images/garden/items/tabby_cat.png'])
  assert.ok(['main', 'pond'].indexOf(list[0].area) !== -1)
  assert.deepEqual(list[0].state, { action: 'idle', play: null, trick: null })
  assert.deepEqual({ c: list[0].c, r: list[0].r }, tileOf(sprites[0]))
  const where = life.focus(0)
  assert.deepEqual(where, { c: list[0].c, r: list[0].r })
  assert.equal(sprites[0].tapping, true)
  assert.equal(sprites[0].bubble, '')
  clock.advance(700)
  assert.equal(sprites[0].tapping, false)
  assert.equal(life.focus(9), null)
  life.stop()
})

test('点一下：蹦一下、说一句，3 秒后气泡消失；睡觉时说梦话；气泡不超出花园', () => {
  const { clock, life, sprites } = setup({ placed: [], residents: ['ginger_cat'], random: () => 0 })
  life.tap(0)
  assert.equal(sprites[0].tapping, true)
  assert.ok(A.ANIMAL_INFO.ginger_cat.lines.indexOf(sprites[0].bubble) !== -1)
  assert.equal(sprites[0].bubbleWidth, L.tileW * 5)
  assert.ok(sprites[0].left + sprites[0].bubbleLeft >= -0.01)
  assert.ok(sprites[0].left + sprites[0].bubbleLeft + sprites[0].bubbleWidth <= L.width + 0.01)
  clock.advance(700)
  assert.equal(sprites[0].tapping, false)
  clock.advance(2500)
  assert.equal(sprites[0].bubble, '')
  life.start()
  clock.advance(2500)
  assert.equal(sprites[0].action, 'sleep')
  life.tap(0)
  assert.equal(sprites[0].bubble, A.SLEEP_LINE)
  life.stop()
})

test('暂停时不动，恢复后继续；stop 清掉所有定时器', () => {
  const { clock, life, sprites } = setup({ placed: [], residents: ['chick'], random: lcg(9) })
  life.start()
  clock.advance(3000)
  life.pause()
  const frozen = JSON.stringify(sprites[0])
  clock.advance(30000)
  assert.equal(JSON.stringify(sprites[0]), frozen)
  life.resume()
  clock.advance(30000)
  assert.notEqual(JSON.stringify(sprites[0]), frozen)
  life.tap(0)
  life.stop()
  assert.equal(clock.count(), 0)
})

test('东西摆到动物脚下（含 2×2 盖住的格子），它跳到旁边的空格', () => {
  const { life, sprites } = setup({ placed: [], residents: ['rabbit'], random: () => 0.5 })
  const t = tileOf(sprites[0])
  life.updatePlaced([{ uid: 'p1', itemId: 'pavilion', c: t.c + 1, r: t.r + 1 }])
  const now = tileOf(sprites[0])
  assert.ok(now && !(now.c === t.c && now.r === t.r))
  assert.equal(sprites[0].action, 'walk')
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `node --test test/animals.test.js test/garden-life.test.js`
Expected: FAIL

- [ ] **Step 3: `animals.js`**（整份替换）

```js
// 花园小动物：每只的脾气、台词，能一起玩的物件，一天的作息，会做的小事，以及「下一步做什么」的纯函数（随机数由调用方传入）

const { itemById, placedOrder } = require('./shared/garden')

const PLAY_CHANCE = 0.3
const PLAY_RANGE = 6
const HOME_RANGE = 2
const PLAY_COOLDOWN_MS = 60000
const TRICK_CHANCE = 0.1
const TRICK_RANGE = 14
const TRICK_COOLDOWN_MS = 180000
const WANDER_RANGE = 12
const PATH_CAP = 40
const SLEEP_LINE = '呼噜…再睡五分钟'

// scale：相对格子宽度；stepMs：走一格多久；pauseMs：停多久再走；sleepy：每次停下时打盹的概率
// faces：图里的动物朝哪边（left / right / front），决定往哪边走时要不要镜像
// top：图里动物头顶上面空着的比例（按 images/garden/items 里的图量的，换图要重量），用来定水面和气泡的高度
const ANIMAL_INFO = {
  chick: {
    scale: 0.5, stepMs: 800, pauseMs: [1500, 3500], sleepy: 0.03, faces: 'right', top: 0.03,
    likesText: '喜欢：青草丛', arrive: '小黄鸡跟着青草香，蹦蹦跳跳搬进花园啦！', hello: '叽叽！我是小黄鸡，以后就住这儿啦！',
    lines: ['叽叽！早饭吃了没？', '多喝温水，叽！', '今天也要好好吃饭哦', '跟我一起蹦一蹦，活动活动！'],
  },
  rabbit: {
    scale: 0.55, stepMs: 800, pauseMs: [1500, 4000], sleepy: 0.08, faces: 'front', top: 0.03,
    likesText: '喜欢：白萝卜', arrive: '小白兔闻到萝卜香，搬进花园啦！', hello: '我是小白兔，以后就住这儿啦！',
    lines: ['蔬菜要多吃，眼睛亮亮的～', '慢慢吃，别噎着', '今天的菜绿不绿？', '蹦跶蹦跶，吃完饭走一走'],
  },
  duck: {
    scale: 0.5, stepMs: 1200, pauseMs: [2000, 4500], sleepy: 0.03, faces: 'right', top: 0.03,
    likesText: '喜欢：锦鲤池', arrive: '小黄鸭看见锦鲤池，摇摇摆摆搬进花园啦！', hello: '嘎嘎！我是小黄鸭，以后就住这儿啦！',
    lines: ['嘎嘎！喝水了吗？', '天凉了，多穿件衣服', '晚饭清淡一点，嘎', '摇摇摆摆，散散步'],
  },
  turtle: {
    scale: 0.5, stepMs: 2600, pauseMs: [3000, 6000], sleepy: 0.08, faces: 'right', top: 0.27,
    likesText: '喜欢：鹅卵石', arrive: '小乌龟慢慢爬到鹅卵石边上，搬进花园啦！', hello: '我…是…小乌龟，以后…就住这儿啦！',
    lines: ['慢慢来，吃饭也要细嚼慢咽', '不急不急，坚持最重要', '早点睡，身体好', '我爬得慢，可我从不偷懒'],
  },
  tabby_cat: {
    scale: 0.6, stepMs: 1300, pauseMs: [2500, 5000], sleepy: 0.2, faces: 'front', top: 0.03,
    likesText: '喜欢：小板凳', arrive: '小花猫相中了小板凳，搬进花园啦！', hello: '喵～我是小花猫，以后就住这儿啦！',
    lines: ['喵～今天吃得好吗？', '饭后别马上躺下哦', '喵，摸摸头', '水果当加餐，比零食好喵'],
  },
  ginger_cat: {
    scale: 0.7, stepMs: 2000, pauseMs: [6000, 12000], sleepy: 0.5, faces: 'left', top: 0.39,
    likesText: '喜欢：茶桌', arrive: '胖橘猫闻着茶香，慢悠悠搬进花园啦！', hello: '喵…我是胖橘猫，以后就在这儿晒太阳啦',
    lines: ['晒太阳好舒服，饭后也出来走走吧', '我胖，你可别学我', '喵…七分饱刚刚好', '少吃点甜的喵'],
  },
  panda: {
    scale: 0.8, stepMs: 1800, pauseMs: [3000, 6000], sleepy: 0.1, faces: 'front', top: 0.03,
    likesText: '喜欢：翠竹', arrive: '大熊猫闻着竹子香，搬进花园啦！', hello: '我是大熊猫，以后就住这儿啦！',
    lines: ['竹子要慢慢嚼，吃饭也一样～', '多吃蔬菜，像我一样', '吃饱了，打个滚', '今天也要开开心心的'],
  },
  crane: {
    scale: 0.8, stepMs: 2000, pauseMs: [3000, 6000], sleepy: 0, faces: 'right', top: 0.03,
    likesText: '喜欢：荷花池', arrive: '仙鹤看中了荷花池，翩翩飞进花园啦！', hello: '我是仙鹤，以后就住这儿啦',
    lines: ['站直一点，腰背会舒服', '早睡早起，精神好', '心平气和，福寿安康', '饭后百步走'],
  },
  panda_family: {
    scale: 1.1, stepMs: 2200, pauseMs: [4000, 8000], sleepy: 0.1, faces: 'front', top: 0.22,
    likesText: '喜欢：大熊猫 + 3 丛翠竹', arrive: '竹林长大了，熊猫一家都搬进花园啦！', hello: '我们是熊猫一家，以后就住这儿啦！',
    lines: ['一家人一起吃饭最香', '宝宝也要好好吃饭哦', '一起散步去～', '团团圆圆，平平安安'],
  },
}

// 能一起玩的物件。at：beside 站到旁边的空格；on 到物件上面，spot 是落脚点在物件图里的位置（x 从左、y 从下，按图宽的比例）
const POND = ['duck', 'turtle', 'crane']
const CATS = ['tabby_cat', 'ginger_cat']
const PLAYS = {
  bamboo: { action: 'eat', animals: ['panda', 'panda_family'], at: 'beside', emoji: '🎋', line: '嚼嚼…别抢我竹子～' },
  radish: { action: 'eat', animals: ['rabbit'], at: 'beside', emoji: '🥕', line: '咔嚓咔嚓，萝卜真甜' },
  cabbage: { action: 'eat', animals: ['rabbit'], at: 'beside', emoji: '🥬', line: '白菜嫩嫩的，你也多吃菜' },
  grass: { action: 'peck', animals: ['chick'], at: 'beside', emoji: '🌾', line: '啄啄，找到一粒小米！' },
  goji_tray: { action: 'peck', animals: ['chick'], at: 'beside', emoji: '🍒', line: '枸杞红枣，补气血！' },
  koi_pond: { action: 'swim', animals: POND, at: 'on', spot: { x: 0.5, y: 0.22 }, emoji: '💧', line: '水里凉快～' },
  lotus_pond: { action: 'swim', animals: POND, at: 'on', spot: { x: 0.5, y: 0.22 }, emoji: '💧', line: '荷花真香' },
  zigzag_bridge: { action: 'swim', animals: POND, at: 'on', spot: { x: 0.35, y: 0.3 }, emoji: '💧', line: '在荷塘里游一圈' },
  stool: { action: 'perch', animals: CATS, at: 'on', spot: { x: 0.5, y: 0.62 }, emoji: '💤', line: SLEEP_LINE },
  tea_table: { action: 'perch', animals: CATS, at: 'on', spot: { x: 0.45, y: 0.55 }, emoji: '💤', line: '桌上暖和，眯一会儿' },
  stone_table: { action: 'perch', animals: CATS, at: 'on', spot: { x: 0.5, y: 0.6 }, emoji: '💤', line: '石桌凉凉的，舒服' },
  swing_tree: { action: 'swing', animals: ['panda'].concat(CATS), at: 'on', spot: { x: 0.66, y: 0.2 }, emoji: '🎵', line: '荡呀荡～真开心' },
  pebbles: { action: 'bask', animals: ['turtle'], at: 'on', spot: { x: 0.5, y: 0.4 }, emoji: '☀️', line: '晒晒背，暖洋洋' },
  sweet_potato_stove: { action: 'warm', animals: 'all', at: 'beside', emoji: '♨️', line: '烤红薯真香，暖暖的' },
}
// 「找它」列表里玩的时候怎么说
const PLAY_DOING = { eat: '吃东西', peck: '啄米', swim: '玩水', perch: '打盹', swing: '荡秋千', bask: '晒太阳', warm: '烤火' }

// 会下水的
const SWIMMERS = POND
// 晚上回哪儿睡：壳里的活动点 id（见 shared/estate.js 的 SPOTS）；院子没修就在正院找块地
const SLEEP_SPOTS = {
  chick: 'coop', rabbit: 'coop',
  duck: 'pond_water', turtle: 'pond_water', crane: 'pond_water',
  tabby_cat: 'eaves', ginger_cat: 'eaves',
  panda: 'rockery', panda_family: 'rockery',
}
// 早上往这些院子凑
const MORNING_AREAS = ['front', 'main']

// 一天的时段：morning 6～9 往前院正院凑、noon 11～14 爱打盹、night 19 点后回窝睡、其他 day
function periodOf(hour) {
  if (hour >= 19 || hour < 6) return 'night'
  if (hour < 9) return 'morning'
  if (hour >= 11 && hour < 14) return 'noon'
  return 'day'
}

// 小事：spot 是壳里的活动点 id（null 就在原地做）；action 默认 trick，soak 是泡在水里；doing 给「找它」列表用
const TRICKS = [
  { id: 'mirror', animals: ['tabby_cat'], spot: 'well', emoji: '✨', doing: '照镜子', line: '井里有只猫在看我，喵' },
  { id: 'chase', animals: ['tabby_cat'], spot: 'flower_path', emoji: '🦋', doing: '追蝴蝶', line: '抓到了…咦，飞走了' },
  { id: 'belly', animals: ['tabby_cat'], spot: 'steps', emoji: '☀️', doing: '晒肚皮', line: '太阳晒肚皮，舒服～' },
  { id: 'soak_cat', animals: ['ginger_cat'], spot: 'hotspring', action: 'soak', emoji: '♨️', doing: '泡温泉', line: '呼…泡得我直打哈欠' },
  { id: 'sniff_tea', animals: ['ginger_cat'], spot: 'tea_deck', emoji: '🍵', doing: '闻茶香', line: '这茶…香的喵' },
  { id: 'tail', animals: ['ginger_cat'], spot: null, emoji: '🌀', doing: '追自己的尾巴', line: '转…转…抓不到' },
  { id: 'roll', animals: ['panda'], spot: 'rockery', emoji: '🎋', doing: '抱着竹子打滚', line: '咕噜咕噜～' },
  { id: 'soak_panda', animals: ['panda'], spot: 'hotspring', action: 'soak', emoji: '♨️', doing: '泡温泉', line: '热乎乎，毛都蓬了' },
  { id: 'hang', animals: ['panda'], spot: 'rockery', emoji: '🙃', doing: '倒挂在假山上', line: '倒过来看世界～' },
  { id: 'queue', animals: ['panda_family'], spot: 'bridge', emoji: '🐾', doing: '排队过桥', line: '一个跟一个，别掉队' },
  { id: 'piggyback', animals: ['panda_family'], spot: null, emoji: '💕', doing: '宝宝爬到背上', line: '宝宝抱紧啦' },
  { id: 'scratch', animals: ['chick'], spot: 'veg_bed', emoji: '🐛', doing: '刨土找虫', line: '刨刨刨，有虫子！' },
  { id: 'hay', animals: ['chick'], spot: 'haystack', emoji: '🌾', doing: '钻草垛', line: '草垛里暖和' },
  { id: 'steal', animals: ['rabbit'], spot: 'veg_bed', emoji: '🥬', doing: '偷吃一口菜', line: '就吃一口…被发现了？' },
  { id: 'nest', animals: ['rabbit'], spot: 'coop', emoji: '💤', doing: '钻草窝', line: '窝里软软的' },
  { id: 'stand', animals: ['rabbit'], spot: null, emoji: '👀', doing: '站起来张望', line: '那边有什么好吃的？' },
  { id: 'stones', animals: ['duck'], spot: 'pond_water', action: 'soak', emoji: '💧', doing: '排队过汀步石', line: '嘎嘎，一步一步来' },
  { id: 'dive', animals: ['duck'], spot: 'pond_water', action: 'soak', emoji: '🐟', doing: '倒栽葱找鱼', line: '屁股朝天找鱼鱼' },
  { id: 'shower', animals: ['duck'], spot: 'falls', action: 'soak', emoji: '🚿', doing: '在瀑布下冲澡', line: '哗啦啦，凉快！' },
  { id: 'flip_over', animals: ['turtle'], spot: null, emoji: '🙃', doing: '翻过来蹬腿', line: '翻…翻过来了' },
  { id: 'hide', animals: ['turtle'], spot: null, emoji: '🐢', doing: '缩进壳里', line: '我不在…' },
  { id: 'one_leg', animals: ['crane'], spot: 'pond_water', action: 'soak', emoji: '🦩', doing: '单脚站着发呆', line: '站着站着就入定了' },
  { id: 'wings', animals: ['crane'], spot: 'falls', action: 'soak', emoji: '🪽', doing: '展翅', line: '舒展一下' },
  { id: 'preen', animals: ['crane'], spot: null, emoji: '✨', doing: '梳羽毛', line: '羽毛要理整齐' },
]

const key = (t) => `${t.c},${t.r}`
const dist = (a, b) => Math.abs(a.c - b.c) + Math.abs(a.r - b.r)
// size 可以是正方形的边长，也可以是 { cols, rows }
const inside = (t, size) => {
  const cols = size.cols || size
  const rows = size.rows || size
  return t.c >= 0 && t.r >= 0 && t.c < cols && t.r < rows
}
const neighbors = (t) => [{ c: t.c + 1, r: t.r }, { c: t.c - 1, r: t.r }, { c: t.c, r: t.r + 1 }, { c: t.c, r: t.r - 1 }]

function pickOne(list, rand) {
  return list[Math.min(list.length - 1, Math.floor(rand() * list.length))]
}

// 相邻的空格（blocked：有物件或别的动物的格子）
function freeNeighbors(t, size, blocked) {
  return neighbors(t).filter((n) => inside(n, size) && !blocked.has(key(n)))
}

// 家：最早摆进花园的那件它喜欢的东西
function homeOf(animalId, placed) {
  const animal = itemById(animalId)
  if (!animal || !animal.likes) return null
  const liked = placed
    .filter((p) => animal.likes.indexOf(p.itemId) !== -1)
    .sort((a, b) => placedOrder(a.uid) - placedOrder(b.uid))
  return liked.length ? { c: liked[0].c, r: liked[0].r } : null
}

// 下一步走哪格：有家就在家附近转（离远了往回走），没家随便逛；allow 限制只走某些格子；被围住返回 null
function chooseStep(pos, { size, blocked, home, allow }, rand) {
  let options = freeNeighbors(pos, size, blocked)
  if (allow) options = options.filter(allow)
  if (!options.length) return null
  if (home) {
    const near = options.filter((n) => dist(n, home) <= HOME_RANGE || dist(n, home) < dist(pos, home))
    if (near.length) return pickOne(near, rand)
  }
  return pickOne(options, rand)
}

// 最短路线（不含起点）；目标格本身可以被占（比如要到物件上面）；走不到返回 null
function pathTo(from, to, size, blocked) {
  if (from.c === to.c && from.r === to.r) return []
  const prev = new Map([[key(from), null]])
  const queue = [from]
  while (queue.length) {
    const cur = queue.shift()
    for (const n of neighbors(cur)) {
      const k = key(n)
      if (!inside(n, size) || prev.has(k)) continue
      const isTarget = n.c === to.c && n.r === to.r
      if (!isTarget && blocked.has(k)) continue
      prev.set(k, cur)
      if (isTarget) {
        const path = []
        for (let p = n; p && key(p) !== key(from); p = prev.get(key(p))) path.unshift({ c: p.c, r: p.r })
        return path
      }
      queue.push(n)
    }
  }
  return null
}

function canPlay(animalId, itemId) {
  const play = PLAYS[itemId]
  return !!play && (play.animals === 'all' || play.animals.indexOf(animalId) !== -1)
}

// 找一件附近能玩的物件，选走过去最近的；ctx：size、blocked、placed、busy（别的动物正玩着的 uid）、cooldown（uid → 时刻）、now、chance（概率，默认 PLAY_CHANCE）
function choosePlay(animalId, pos, ctx, rand) {
  if (rand() >= (ctx.chance == null ? PLAY_CHANCE : ctx.chance)) return null
  const options = []
  ctx.placed.forEach((p) => {
    if (!canPlay(animalId, p.itemId) || ctx.busy.has(p.uid) || (ctx.cooldown[p.uid] || 0) > ctx.now) return
    if (dist(pos, p) > PLAY_RANGE) return
    const play = PLAYS[p.itemId]
    let target = { c: p.c, r: p.r }
    if (play.at === 'beside') {
      const spots = neighbors(p).filter((n) => inside(n, ctx.size) && (!ctx.blocked.has(key(n)) || (n.c === pos.c && n.r === pos.r)))
      if (!spots.length) return
      target = spots.sort((a, b) => dist(a, pos) - dist(b, pos))[0]
    }
    const path = pathTo(pos, target, ctx.size, ctx.blocked)
    if (path) options.push({ uid: p.uid, itemId: p.itemId, play, item: { c: p.c, r: p.r }, target, path })
  })
  if (!options.length) return null
  return options.sort((a, b) => a.path.length - b.path.length)[0]
}

// 挑一件小事：有活动点的要院子修好了（在 ctx.spots 里）、没被别的动物占着、走得到；没活动点的原地做
// ctx：spots、blocked、size、busy（别的动物正用着的活动点 id）、cooldown（'动物:小事' → 时刻）、now
function chooseTrick(animalId, pos, ctx, rand) {
  if (rand() >= TRICK_CHANCE) return null
  const ready = []
  TRICKS.forEach((trick) => {
    if (trick.animals.indexOf(animalId) === -1 || (ctx.cooldown[`${animalId}:${trick.id}`] || 0) > ctx.now) return
    if (!trick.spot) return ready.push({ trick, target: { c: pos.c, r: pos.r }, path: [] })
    const spot = ctx.spots.find((s) => s.id === trick.spot)
    if (!spot || ctx.busy.has(spot.id)) return
    const target = { c: spot.c, r: spot.r }
    const path = pathTo(pos, target, ctx.size, ctx.blocked)
    if (path && path.length <= TRICK_RANGE) ready.push({ trick, target, path })
  })
  if (!ready.length) return null
  return pickOne(ready, rand)
}

function reachable(from, candidates, ctx, cap) {
  for (const t of candidates) {
    const path = pathTo(from, t, ctx.size, ctx.blocked)
    if (path && path.length <= cap) return { target: t, path }
  }
  return null
}

// 晚上回窝：自己的睡觉点（被占了就睡旁边）；没有就去正院最近的空格；都不行返回 null（原地睡）
function sleepTarget(animalId, pos, ctx) {
  const spot = ctx.spots.find((s) => s.id === SLEEP_SPOTS[animalId])
  if (spot) {
    if (pos.c === spot.c && pos.r === spot.r) return { target: { c: spot.c, r: spot.r }, path: [] }
    const candidates = [{ c: spot.c, r: spot.r }].concat(neighbors(spot)).filter((t) => inside(t, ctx.size) && !ctx.blocked.has(key(t)))
    const found = reachable(pos, candidates, ctx, PATH_CAP)
    if (found) return found
  }
  if (ctx.areaOf(pos.c, pos.r) === 'main') return { target: { c: pos.c, r: pos.r }, path: [] }
  const main = ctx.free.filter((t) => ctx.areaOf(t.c, t.r) === 'main').sort((a, b) => dist(a, pos) - dist(b, pos)).slice(0, 6)
  return reachable(pos, main, ctx, PATH_CAP)
}

// 早上往前院、正院凑：最近的能走到的空格；已经在那儿返回 null
function gatherTarget(pos, ctx) {
  if (MORNING_AREAS.indexOf(ctx.areaOf(pos.c, pos.r)) !== -1) return null
  const near = ctx.free.filter((t) => MORNING_AREAS.indexOf(ctx.areaOf(t.c, t.r)) !== -1).sort((a, b) => dist(a, pos) - dist(b, pos)).slice(0, 6)
  return reachable(pos, near, ctx, PATH_CAP)
}

// 出去逛逛：随便挑一个不远不近的空格（会穿过月亮门到别的院子），试几次走不到就算了
function wanderTarget(pos, ctx, rand) {
  const far = ctx.free.filter((t) => dist(t, pos) >= 3 && dist(t, pos) <= WANDER_RANGE)
  for (let i = 0; i < 4 && far.length; i++) {
    const t = pickOne(far, rand)
    const path = pathTo(pos, t, ctx.size, ctx.blocked)
    if (path && path.length <= PATH_CAP) return { target: t, path }
  }
  return null
}

// 屏幕上往右走 c−r 变大；图朝右的往左走要镜像，朝左的往右走要镜像，正面的往左走镜像
function flipFor(faces, from, to, current) {
  const dx = (to.c - to.r) - (from.c - from.r)
  if (dx === 0) return current
  return faces === 'left' ? dx > 0 : dx < 0
}

// state：{ action, play, trick }，play 是 choosePlay 的结果，trick 是 TRICKS 里的一项
function lineFor(animalId, state, rand) {
  if (state.play && state.action === state.play.play.action) return state.play.play.line
  if (state.trick && (state.action === 'trick' || state.action === 'soak')) return state.trick.line
  if (state.action === 'sleep') return SLEEP_LINE
  return pickOne(ANIMAL_INFO[animalId].lines, rand)
}

// 「找它」列表里的一句话：在哪、在干嘛
function describe(state, areaName, toAreaName) {
  const at = areaName ? `在${areaName}` : ''
  if (state.action === 'sleep') return `${at}睡觉`
  if (state.trick && (state.action === 'trick' || state.action === 'soak')) return `${at}${state.trick.doing}`
  if (state.play && state.action === state.play.play.action) return `${at}${PLAY_DOING[state.action] || '玩'}`
  if (state.action === 'walk') return `正往${toAreaName || '那边'}走`
  return `${at}溜达`
}

module.exports = {
  ANIMAL_INFO,
  PLAYS,
  TRICKS,
  SWIMMERS,
  SLEEP_SPOTS,
  MORNING_AREAS,
  PLAY_CHANCE,
  PLAY_RANGE,
  HOME_RANGE,
  PLAY_COOLDOWN_MS,
  TRICK_CHANCE,
  TRICK_RANGE,
  TRICK_COOLDOWN_MS,
  SLEEP_LINE,
  periodOf,
  freeNeighbors,
  homeOf,
  chooseStep,
  pathTo,
  choosePlay,
  chooseTrick,
  sleepTarget,
  gatherTarget,
  wanderTarget,
  flipFor,
  lineFor,
  describe,
}
```

- [ ] **Step 4: `garden-life.js`**（整份替换）

```js
// 花园小动物的日常：每只一个定时器，轮到它时决定走一步、去玩、做件小事、打盹、晚上回窝，再把画面交给页面
// 定时器（clock）、随机数、钟点（hour）都能注入，测试里手动推进

const { itemById } = require('./shared/garden')
const { footprint } = require('./shared/estate')
const { tileCenter } = require('./iso')
const { itemImage, itemAnchor, shadowOf } = require('./garden-view')
const A = require('./animals')

const PLAY_MS = [5000, 8000]
const TRICK_MS = [6000, 10000]
const SLEEP_MS = [8000, 15000]
const NIGHT_MS = [40000, 80000]
const START_MS = [300, 2000]
const BUBBLE_MS = 3000
const TAP_MS = 600
const HELLO_MS = 4000
// 下水时露出的上半身比例（按动物本身算，不算图里头顶的空白）；气泡宽度是几格宽
const WATER_LINE = 0.62
const BUBBLE_TILES = 5
// 白天没事干时出门逛逛的概率
const EXCURSION_CHANCE = 0.12

const realClock = {
  set: (fn, ms) => setTimeout(fn, ms),
  clear: (handle) => clearTimeout(handle),
  now: () => Date.now(),
}
const realHour = () => new Date().getHours()

const key = (t) => `${t.c},${t.r}`
const same = (a, b) => a.c === b.c && a.r === b.r
const dist = (a, b) => Math.abs(a.c - b.c) + Math.abs(a.r - b.r)

// walk(c, r, swims)：这一格能不能走（水鸟传 swims）；areaOf(c, r)：在哪个院子；spots：已修院子里的活动点；door：新住户进来的那格（网格外也行）
function createLife({
  L, placed, residents, arrivals = [], walk = () => true, areaOf = () => '', spots = [], door = null,
  hour = realHour, random = Math.random, clock = realClock, onChange = () => {},
}) {
  const bounds = { cols: L.cols || L.size, rows: L.rows || L.size }
  let items = placed
  let running = false
  const cooldown = {}
  const between = ([min, max]) => min + Math.round((max - min) * random())
  const inside = (t) => t.c >= 0 && t.r >= 0 && t.c < bounds.cols && t.r < bounds.rows
  const swims = (a) => A.SWIMMERS.indexOf(a.id) !== -1
  const animals = residents
    .filter((id) => A.ANIMAL_INFO[id])
    .map((id, index) => ({
      index, id, info: A.ANIMAL_INFO[id],
      c: -1, r: -1, flip: false, action: 'idle', goal: null, path: [], afloat: false,
      bubble: '', tapping: false, duration: 0,
      timer: null, bubbleTimer: null, tapTimer: null,
    }))

  // 走不进去的地，按能不能下水分两套
  const closed = { land: new Set(), water: new Set() }
  for (let c = 0; c < bounds.cols; c++) {
    for (let r = 0; r < bounds.rows; r++) {
      if (!walk(c, r, false)) closed.land.add(key({ c, r }))
      if (!walk(c, r, true)) closed.water.add(key({ c, r }))
    }
  }
  const isWater = (t) => closed.land.has(key(t)) && !closed.water.has(key(t))

  // 走不进去的格子：地不能走的、摆了东西的（2×2 的四格都算）、有别的动物的
  function blockedFor(self) {
    const set = new Set(swims(self) ? closed.water : closed.land)
    items.forEach((p) => footprint(p.itemId, p.c, p.r).forEach((t) => set.add(key(t))))
    animals.forEach((a) => {
      if (a !== self && inside(a)) set.add(key(a))
    })
    return set
  }

  function freeTiles(blocked) {
    const tiles = []
    for (let c = 0; c < bounds.cols; c++) {
      for (let r = 0; r < bounds.rows; r++) if (!blocked.has(key({ c, r }))) tiles.push({ c, r })
    }
    return tiles
  }

  function nearestFree(from, blocked) {
    return freeTiles(blocked).sort((a, b) => dist(a, from) - dist(b, from))[0] || null
  }

  function itemOf(uid) {
    return items.find((p) => p.uid === uid) || null
  }

  const playing = (a) => !!a.goal && a.goal.type === 'play' && a.action === a.goal.play.play.action
  const tricking = (a) => !!a.goal && a.goal.type === 'trick' && (a.action === 'trick' || a.action === 'soak')
  const inWater = (a) => a.action === 'swim' || a.action === 'soak' || a.afloat
  const stateOf = (a) => ({
    action: a.action,
    play: a.goal && a.goal.type === 'play' ? a.goal.play : null,
    trick: a.goal && a.goal.type === 'trick' ? a.goal.trick : null,
  })

  function sprite(a) {
    const width = L.tileW * a.info.scale
    const item = playing(a) && a.goal.play.play.at === 'on' ? itemOf(a.goal.play.uid) : null
    let x
    let y
    let z
    if (item) {
      const anchor = itemAnchor(item, L)
      x = anchor.x - anchor.width / 2 + a.goal.play.play.spot.x * anchor.width
      y = anchor.y - a.goal.play.play.spot.y * anchor.width
      z = (item.c + item.r) * 10 + item.c + 1
    } else {
      const center = tileCenter(a.c, a.r, L)
      x = center.x
      y = center.y + L.tileH * 0.18
      z = (a.c + a.r) * 10 + a.c + 5
    }
    // 下水时水面在身子的 62% 处，没有影子；气泡贴着头顶，别出花园左右边
    const headroom = width * a.info.top
    const bodyHeight = inWater(a) ? headroom + (width - headroom) * WATER_LINE : width
    const bubbleWidth = Math.min(L.tileW * BUBBLE_TILES, L.width)
    const bubbleX = Math.min(Math.max(x - bubbleWidth / 2, 0), L.width - bubbleWidth)
    let emoji = ''
    if (playing(a)) emoji = a.goal.play.play.emoji
    else if (tricking(a)) emoji = a.goal.trick.emoji
    else if (a.action === 'sleep') emoji = '💤'
    return {
      id: a.id,
      image: itemImage(a.id),
      width,
      bodyHeight,
      left: x - width / 2,
      bottom: L.height - y,
      z,
      flip: a.flip,
      action: a.action,
      duration: a.duration,
      bubble: a.bubble,
      bubbleWidth,
      bubbleLeft: bubbleX - (x - width / 2),
      bubbleBottom: bodyHeight - headroom + 4,
      emoji,
      tapping: a.tapping,
      shadow: inWater(a) ? null : shadowOf(x, y, width, L),
    }
  }

  function emit(a) {
    onChange(a.index, sprite(a))
  }

  function schedule(a, ms) {
    clock.clear(a.timer)
    a.timer = running ? clock.set(() => turn(a), ms) : null
  }

  function rest(a) {
    a.action = 'idle'
    emit(a)
    schedule(a, between(a.info.pauseMs))
  }

  function doze(a, range) {
    a.action = 'sleep'
    emit(a)
    schedule(a, between(range))
  }

  function moveTo(a, t) {
    a.flip = A.flipFor(a.info.faces, a, t, a.flip)
    a.c = t.c
    a.r = t.r
    a.afloat = isWater(t)
    a.duration = a.info.stepMs
  }

  function step(a, t) {
    moveTo(a, t)
    a.action = 'walk'
    emit(a)
    schedule(a, a.info.stepMs)
  }

  function say(a, text, ms) {
    a.bubble = text
    clock.clear(a.bubbleTimer)
    a.bubbleTimer = clock.set(() => {
      a.bubble = ''
      emit(a)
    }, ms)
  }

  // 走到了目的地：开始玩 / 做小事 / 睡觉
  function startGoal(a) {
    const g = a.goal
    if (g.type === 'play') {
      a.action = g.play.play.action
      if (g.play.play.at === 'beside') a.flip = A.flipFor(a.info.faces, a, g.play.item, a.flip)
      emit(a)
      return schedule(a, a.info.stepMs + between(PLAY_MS))
    }
    if (g.type === 'trick') {
      a.action = g.trick.action || 'trick'
      say(a, g.trick.line, between(TRICK_MS))
      emit(a)
      return schedule(a, a.info.stepMs + between(TRICK_MS))
    }
    a.goal = null
    if (g.type === 'sleep') return doze(a, NIGHT_MS)
    rest(a)
  }

  function endGoal(a) {
    const g = a.goal
    a.goal = null
    let off = null
    if (g.type === 'play') {
      cooldown[g.play.uid] = clock.now() + A.PLAY_COOLDOWN_MS
      // 从物件上下来，跳到旁边的空格
      if (g.play.play.at === 'on') off = A.freeNeighbors(a, bounds, blockedFor(a))[0]
    } else if (g.type === 'trick') {
      cooldown[`${a.id}:${g.trick.id}`] = clock.now() + A.TRICK_COOLDOWN_MS
      if (g.trick.action === 'soak' && !swims(a)) off = A.freeNeighbors(a, bounds, blockedFor(a))[0]
    }
    if (off) return step(a, off)
    rest(a)
  }

  // 别的动物站着的格子
  function animalTiles(self) {
    const set = new Set()
    animals.forEach((a) => {
      if (a !== self && inside(a)) set.add(key(a))
    })
    return set
  }

  function followPath(a) {
    const next = a.path[0]
    const g = a.goal
    // 最后一步踩到物件上（on）或下水（soak）是允许的，只要没有别的动物在那儿；其他情况照常不能挤
    const onto = !!g && same(next, g.target) && ((g.type === 'play' && g.play.play.at === 'on') || (g.type === 'trick' && g.trick.action === 'soak'))
    if ((onto ? animalTiles(a) : blockedFor(a)).has(key(next))) {
      // 路被挡住了，这次不去了
      a.path = []
      a.goal = null
      return rest(a)
    }
    a.path.shift()
    if (!a.path.length && a.goal) {
      moveTo(a, next)
      return startGoal(a)
    }
    step(a, next)
  }

  function go(a, type, plan, extra) {
    a.goal = { type, target: plan.target, ...extra }
    a.path = plan.path.slice()
    return a.path.length ? followPath(a) : startGoal(a)
  }

  function turn(a) {
    a.timer = null
    if (playing(a) || tricking(a)) return endGoal(a)
    if (a.path.length) return followPath(a)
    const period = A.periodOf(hour())
    // 晚上睡着了就接着睡；白天睡醒了、走完一步了，先歇一会儿
    if (a.action === 'sleep') return period === 'night' ? doze(a, NIGHT_MS) : rest(a)
    if (a.action !== 'idle') return rest(a)
    const blocked = blockedFor(a)
    if (period === 'night') {
      const plan = A.sleepTarget(a.id, a, { spots, blocked, size: bounds, areaOf, free: freeTiles(blocked) })
      if (plan && plan.path.length) return go(a, 'sleep', plan)
      return doze(a, NIGHT_MS)
    }
    if (period === 'morning') {
      const plan = A.gatherTarget(a, { blocked, size: bounds, areaOf, free: freeTiles(blocked) })
      if (plan) return go(a, 'wander', plan)
    }
    const sleepy = period === 'noon' ? Math.min(0.9, a.info.sleepy * 3 + 0.15) : period === 'morning' ? 0 : a.info.sleepy
    if (random() < sleepy) return doze(a, SLEEP_MS)
    const busy = new Set(animals.filter((o) => o !== a && o.goal && o.goal.type === 'play').map((o) => o.goal.play.uid))
    const play = A.choosePlay(a.id, a, {
      size: bounds, blocked, placed: items, busy, cooldown, now: clock.now(), chance: period === 'noon' ? A.PLAY_CHANCE * 2 : A.PLAY_CHANCE,
    }, random)
    if (play) return go(a, 'play', play, { play })
    if (period !== 'morning') {
      const busySpots = new Set(animals.filter((o) => o !== a && o.goal && o.goal.type === 'trick' && o.goal.trick.spot).map((o) => o.goal.trick.spot))
      const trick = A.chooseTrick(a.id, a, { spots, blocked, size: bounds, busy: busySpots, cooldown, now: clock.now() }, random)
      if (trick) return go(a, 'trick', trick, { trick: trick.trick })
      if (random() < EXCURSION_CHANCE) {
        const plan = A.wanderTarget(a, { blocked, size: bounds, free: freeTiles(blocked) }, random)
        if (plan) return go(a, 'wander', plan)
      }
    }
    const allow = period === 'morning' ? (t) => A.MORNING_AREAS.indexOf(areaOf(t.c, t.r)) !== -1 : null
    const next = A.chooseStep(a, { size: bounds, blocked, home: A.homeOf(a.id, items), allow }, random)
    if (!next) return schedule(a, between(a.info.pauseMs))
    step(a, next)
  }

  // 住户：站在家附近的空格；没有家就在前院、正院随便站
  function settleIn(a) {
    const free = freeTiles(blockedFor(a))
    if (!free.length) return
    const home = A.homeOf(a.id, items)
    const near = home ? free.filter((t) => dist(t, home) <= A.HOME_RANGE) : free.filter((t) => A.MORNING_AREAS.indexOf(areaOf(t.c, t.r)) !== -1)
    const pool = near.length ? near : free
    const t = pool[Math.min(pool.length - 1, Math.floor(random() * pool.length))]
    a.c = t.c
    a.r = t.r
    a.afloat = isWater(t)
  }

  // 新住户：从大门走进来，一路走到家旁边（没有家就走到最近的空格）
  function walkIn(a) {
    if (!door) return settleIn(a)
    const blocked = blockedFor(a)
    const home = A.homeOf(a.id, items)
    const free = freeTiles(blocked)
    const targets = (home ? free.filter((t) => dist(t, home) <= A.HOME_RANGE) : free).sort((a1, b1) => dist(a1, door) - dist(b1, door)).slice(0, 6)
    for (const t of targets) {
      const path = A.pathTo(door, t, bounds, blocked)
      if (path) {
        a.c = door.c
        a.r = door.r
        a.goal = { type: 'wander', target: t }
        a.path = path
        say(a, a.info.hello, HELLO_MS)
        return
      }
    }
    settleIn(a)
  }

  const arriving = new Set(arrivals)
  animals.forEach((a) => (arriving.has(a.id) ? walkIn(a) : settleIn(a)))

  function heart(a) {
    a.tapping = true
    clock.clear(a.tapTimer)
    a.tapTimer = clock.set(() => {
      a.tapping = false
      emit(a)
    }, TAP_MS)
    emit(a)
  }

  return {
    sprites: () => animals.map(sprite),

    start() {
      running = true
      animals.forEach((a) => schedule(a, between(START_MS)))
    },

    pause() {
      running = false
      animals.forEach((a) => {
        clock.clear(a.timer)
        a.timer = null
      })
    },

    resume() {
      this.start()
    },

    stop() {
      running = false
      animals.forEach((a) => {
        ;[a.timer, a.bubbleTimer, a.tapTimer].forEach((handle) => clock.clear(handle))
        a.timer = a.bubbleTimer = a.tapTimer = null
      })
    },

    // 物件摆放、移动、收回之后：玩的东西没了就不玩了，脚下被放了东西就跳开
    updatePlaced(next) {
      items = next
      animals.forEach((a) => {
        if (a.goal && a.goal.type === 'play') {
          const item = itemOf(a.goal.play.uid)
          if (!item || !same(item, a.goal.play.item)) {
            a.goal = null
            a.path = []
            a.action = 'idle'
          }
        }
        const onItem = a.goal && a.goal.type === 'play' && a.goal.play.play.at === 'on' && playing(a)
        if (!onItem && inside(a) && items.some((p) => footprint(p.itemId, p.c, p.r).some((t) => same(t, a)))) {
          const t = nearestFree(a, blockedFor(a))
          if (t) {
            a.path = []
            a.goal = null
            moveTo(a, t)
            a.action = 'walk'
          }
        }
        emit(a)
      })
    },

    // 每只现在在哪、在干嘛（给「找它」列表）
    whereIs() {
      return animals.map((a) => ({
        index: a.index,
        id: a.id,
        name: itemById(a.id).name,
        image: itemImage(a.id),
        c: a.c,
        r: a.r,
        area: areaOf(a.c, a.r),
        toArea: a.goal ? areaOf(a.goal.target.c, a.goal.target.r) : '',
        state: stateOf(a),
      }))
    },

    // 找它：冒一下爱心，返回它在哪一格
    focus(index) {
      const a = animals[index]
      if (!a) return null
      heart(a)
      return { c: a.c, r: a.r }
    },

    tap(index) {
      const a = animals[index]
      if (!a) return
      say(a, A.lineFor(a.id, stateOf(a), random), BUBBLE_MS)
      heart(a)
    },
  }
}

module.exports = { createLife }
```

- [ ] **Step 5: 跑测试**

Run: `node --test test/animals.test.js test/garden-life.test.js test/garden-view.test.js`
Expected: PASS

- [ ] **Step 6: 提交（本地）**

```bash
for f in miniprogram/utils/animals.js miniprogram/utils/garden-life.js; do node --check $f; done
git add miniprogram/utils/animals.js miniprogram/utils/garden-life.js test/animals.test.js test/garden-life.test.js
git commit -m "feat(animals): roam between courtyards, daily routine, tricks, sleep spots and whereIs

<trailer>"
```

---

### Task 6: 白模底图、云朵；删掉小岛的图

**Files:**
- Create: `scripts/estate/blockout.py`
- Modify: `scripts/draw-images.py`（删掉小岛相关）
- Create（生成）：`miniprogram/images/garden/estate/t00.jpg` … `t33.jpg`、`miniprogram/images/garden/cloud.png`、`art/guide/estate-blockout.jpg`、`art/guide/estate-blockout-labels.jpg`
- Delete: `miniprogram/images/garden/island.png`、`locked-wide.png`、`locked-tall.png`、`art/guide/island-layout.png`

**Interfaces:**
- Consumes: Task 2 的 `estate.js`（脚本用 node 读 `GRID / AREAS / SHELL / GATES / DOOR / tileInfo`，布局只在 JS 里维护一份）
- Produces: Task 4 `artTiles` 引用的 16 块底图（整图比例 = `L.width : L.height`，几何和 `gridLayout` 完全一致：格高 = 格宽 / 2、顶部留 1.3 格宽、侧面厚 0.4 格高）、`cloud.png`（透明底）

- [ ] **Step 1: 写 `scripts/estate/blockout.py`**

```python
"""园林大宅院的白模：按 shared/estate.js 的布局画整张底图，切成 4×4 块给小程序当占位底图；整图另存给即梦当参考

    python3 scripts/estate/blockout.py

输出：miniprogram/images/garden/estate/t00.jpg … t33.jpg（底图切块）、miniprogram/images/garden/cloud.png（云朵）、
     art/guide/estate-blockout.jpg（整图，给即梦）、art/guide/estate-blockout-labels.jpg（带院子名字，给人看）
需要 Pillow。布局数据直接从 estate.js 读（用 node 跑一下），改布局只改 JS 这一处。
"""
import json
import math
import os
import random
import subprocess

from PIL import Image, ImageDraw, ImageFont

REPO = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..'))
OUT = os.path.join(REPO, 'miniprogram', 'images', 'garden')
GUIDE = os.path.join(REPO, 'art', 'guide')
FONT = '/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc'

# 一格宽（像素）。几何和 utils/iso.js 的 gridLayout 一样：格高 = 格宽 / 2，顶部留 1.3 格宽，侧面厚 0.4 格高
TW = 64
TH = TW / 2
SPLIT = 4
JPEG_QUALITY = 80

PAPER = (232, 224, 207)
COLORS = {
    'lawn': (150, 198, 108), 'soil': (150, 112, 76), 'water': (104, 172, 222), 'pave': (222, 214, 196),
    'path': (214, 204, 184), 'gate': (214, 204, 184), 'door': (214, 204, 184), 'block': (196, 192, 182),
}
WALL = (240, 238, 232)
WALL_TOP = (72, 80, 96)
WALL_H = TH * 1.6
WOOD = (150, 104, 64)


def load_layout():
    js = (
        "const E=require('./cloudfunctions/api/lib/shared/estate');"
        "const kinds=[];for(let r=0;r<E.GRID.rows;r++){const row=[];for(let c=0;c<E.GRID.cols;c++)row.push(E.tileInfo(c,r).kind);kinds.push(row)}"
        "console.log(JSON.stringify({grid:E.GRID,areas:E.AREAS,shell:E.SHELL,gates:E.GATES,door:E.DOOR,kinds}))"
    )
    return json.loads(subprocess.check_output(['node', '-e', js], cwd=REPO))


LAYOUT = load_layout()
COLS, ROWS = LAYOUT['grid']['cols'], LAYOUT['grid']['rows']
KINDS = LAYOUT['kinds']
TOP = TW * 1.3
DEPTH = TH * 0.4
W = int((COLS + ROWS) * TW / 2)
H = int(TOP + (COLS + ROWS) * TH / 2 + DEPTH)
ORIGIN_X = ROWS * TW / 2


def top(c, r):
    return (ORIGIN_X + (c - r) * TW / 2, TOP + (c + r) * TH / 2)


def quad(c0, r0, c1, r1):
    return [top(c0, r0), top(c1, r0), top(c1, r1), top(c0, r1)]


def shade(color, f):
    return tuple(max(0, min(255, int(v * f))) for v in color)


def raised(pts, h):
    return [(x, y - h) for x, y in pts]


def kind_at(c, r):
    if c < 0 or r < 0 or c >= COLS or r >= ROWS:
        return 'out'
    return KINDS[r][c]


def box(d, c0, r0, c1, r1, h, color, base=0):
    """抬起来的一块：左、右两个侧面 + 顶面"""
    p0, p1, p2, p3 = [(x, y - base) for x, y in quad(c0, r0, c1, r1)]
    d.polygon([p3, p2, (p2[0], p2[1] - h), (p3[0], p3[1] - h)], fill=shade(color, 0.84))
    d.polygon([p2, p1, (p1[0], p1[1] - h), (p2[0], p2[1] - h)], fill=shade(color, 0.7))
    d.polygon(raised([p0, p1, p2, p3], h), fill=color)


def roof(d, c0, r0, c1, r1, base, rh, color, over=0.3):
    """四坡顶，屋脊沿长边"""
    a, b = c1 - c0, r1 - r0
    p0, p1, p2, p3 = [(x, y - base) for x, y in quad(c0 - over, r0 - over, c1 + over, r1 + over)]
    cx, cy = top((c0 + c1) / 2, (r0 + r1) / 2)
    cy -= base + rh
    if a >= b:
        k = (a - b) / 2 / (a + 2 * over)
        q1 = (cx - (p1[0] - p0[0]) * k, cy - (p1[1] - p0[1]) * k)
        q2 = (cx + (p1[0] - p0[0]) * k, cy + (p1[1] - p0[1]) * k)
        d.polygon([p0, p1, q2, q1], fill=shade(color, 1.12))
        d.polygon([p0, q1, p3], fill=shade(color, 0.95))
        d.polygon([p3, q1, q2, p2], fill=shade(color, 0.85))
        d.polygon([p1, p2, q2], fill=shade(color, 0.72))
    else:
        k = (b - a) / 2 / (b + 2 * over)
        q1 = (cx - (p3[0] - p0[0]) * k, cy - (p3[1] - p0[1]) * k)
        q2 = (cx + (p3[0] - p0[0]) * k, cy + (p3[1] - p0[1]) * k)
        d.polygon([p0, p3, q2, q1], fill=shade(color, 0.95))
        d.polygon([p0, q1, p1], fill=shade(color, 1.12))
        d.polygon([p1, q1, q2, p2], fill=shade(color, 0.72))
        d.polygon([p3, p2, q2], fill=shade(color, 0.85))


def rock(d, x, y, rx, h, seed):
    rnd = random.Random(seed)
    pts = []
    for i in range(9):
        a = math.pi + i * math.pi / 8
        pts.append((x + rx * math.cos(a) * rnd.uniform(0.75, 1), y - h * abs(math.sin(a)) * rnd.uniform(0.7, 1)))
    pts += [(x + rx, y), (x, y + rx * 0.3), (x - rx, y)]
    d.polygon(pts, fill=(168, 166, 158))
    d.polygon([(x - rx * 0.2, y - h * 0.9), (x + rx * 0.6, y - h * 0.5), (x + rx * 0.8, y), (x, y + rx * 0.25)], fill=(140, 138, 130))


def post(d, c, r, h, color=WOOD, width=3):
    x, y = top(c, r)
    d.line([(x, y), (x, y - h)], fill=color, width=width)


def fence(d, c0, r0, c1, r1, inset=0.45):
    """一圈矮栅栏（动物小院）"""
    pts = []
    a, b = c0 + inset, r0 + inset
    e, f = c1 - inset, r1 - inset
    n = int(e - a)
    for i in range(n + 1):
        pts.append((a + (e - a) * i / n, b))
    for i in range(1, n + 1):
        pts.append((e, b + (f - b) * i / n))
    for i in range(1, n + 1):
        pts.append((e - (e - a) * i / n, f))
    for i in range(1, n):
        pts.append((a, f - (f - b) * i / n))
    h = TH * 0.55
    line = [top(c, r) for c, r in pts] + [top(a, b)]
    for frac in (0.45, 0.9):
        d.line([(x, y - h * frac) for x, y in line], fill=WOOD, width=2)
    for c, r in pts:
        post(d, c, r, h, width=3)


def draw_ground(d, rnd):
    for r in range(ROWS):
        for c in range(COLS):
            k = KINDS[r][c]
            if k == 'wall':
                continue
            color = COLORS[k]
            if k == 'lawn':
                color = shade(color, rnd.uniform(0.96, 1.04))
            d.polygon(quad(c, r, c + 1, r + 1), fill=color)
            if k in ('path', 'gate', 'door'):
                d.polygon(quad(c + 0.1, r + 0.1, c + 0.9, r + 0.9), fill=shade(color, 1.05), outline=shade(color, 0.86))
            elif k == 'pave':
                d.polygon(quad(c, r, c + 1, r + 1), outline=shade(color, 0.9))
            elif k == 'soil':
                for t in (0.3, 0.6):
                    d.line([top(c + t, r + 0.08), top(c + t, r + 0.92)], fill=shade(color, 0.78), width=2)
            elif k == 'lawn' and rnd.random() < 0.5:
                x, y = top(c + rnd.uniform(0.2, 0.8), r + rnd.uniform(0.2, 0.8))
                d.line([(x, y), (x + 2, y - 7)], fill=shade(color, 0.8), width=2)
    # 水：靠岸的边画浅一圈，水面几道波纹
    for r in range(ROWS):
        for c in range(COLS):
            if KINDS[r][c] != 'water':
                continue
            edge = shade(COLORS['water'], 1.35)
            if kind_at(c, r - 1) != 'water':
                d.line([top(c, r), top(c + 1, r)], fill=edge, width=3)
            if kind_at(c - 1, r) != 'water':
                d.line([top(c, r), top(c, r + 1)], fill=edge, width=3)
            if kind_at(c + 1, r) != 'water':
                d.line([top(c + 1, r), top(c + 1, r + 1)], fill=edge, width=3)
            if kind_at(c, r + 1) != 'water':
                d.line([top(c, r + 1), top(c + 1, r + 1)], fill=edge, width=3)
            if rnd.random() < 0.4:
                x, y = top(c + 0.5, r + 0.5)
                d.arc([x - 9, y - 4, x + 9, y + 4], 200, 340, fill=(226, 240, 250), width=2)


def standing():
    """所有立着的东西（墙、门、建筑、篱笆），按前后顺序排好：key 越小越靠后、先画"""
    items = []

    def add(key, fn):
        items.append((key, len(items), fn))

    for r in range(ROWS):
        for c in range(COLS):
            if KINDS[r][c] == 'wall':
                add(c + r, lambda d, c=c, r=r: (box(d, c, r, c + 1, r + 1, WALL_H, WALL), d.polygon(raised(quad(c, r, c + 1, r + 1), WALL_H), fill=WALL_TOP)))
    # 月亮门：两格中间一个圆洞
    for g in LAYOUT['gates']:
        (c0, r0), (c1, r1) = g['tiles']
        x, y = top((c0 + c1 + 1) / 2, (r0 + r1 + 1) / 2)
        rr = TH * 0.9

        def gate(d, x=x, y=y, rr=rr):
            d.ellipse([x - rr, y - WALL_H * 0.55 - rr, x + rr, y - WALL_H * 0.55 + rr], fill=(150, 196, 110), outline=WALL_TOP, width=3)
        add(max(c0 + r0, c1 + r1) + 0.1, gate)
    # 大门：红门
    (c0, r0), (c1, r1) = LAYOUT['door']
    x, y = top((c0 + c1 + 1) / 2, (r0 + r1 + 1) / 2)

    def door(d, x=x, y=y):
        d.rectangle([x - TW * 0.45, y - WALL_H * 0.95, x + TW * 0.45, y - WALL_H * 0.1], fill=(176, 52, 40), outline=WALL_TOP, width=3)
        d.line([(x, y - WALL_H * 0.95), (x, y - WALL_H * 0.1)], fill=WALL_TOP, width=2)
        for dx in (-TW * 0.2, TW * 0.2):
            d.ellipse([x + dx - 4, y - WALL_H * 0.55 - 4, x + dx + 4, y - WALL_H * 0.55 + 4], fill=(230, 190, 80))
    add(max(c0 + r0, c1 + r1) + 0.1, door)

    for s in LAYOUT['shell']:
        c0, r0, c1, r1 = s['rect']
        what = s.get('what')
        key = (c1 - 1) + (r1 - 1)
        if what == 'hall':
            add(key, lambda d, a=(c0, r0, c1, r1): (box(d, *a, TH * 3, (246, 244, 238)), roof(d, *a, TH * 3, TH * 1.6, WALL_TOP),
                                                  d.ellipse([top((a[0] + a[2]) / 2, a[3])[0] - TW * 0.3, top((a[0] + a[2]) / 2, a[3])[1] - TH * 2.4,
                                                             top((a[0] + a[2]) / 2, a[3])[0] + TW * 0.3, top((a[0] + a[2]) / 2, a[3])[1] - TH * 0.9], fill=(120, 100, 80))))
        elif what == 'screen':
            add(key, lambda d, a=(c0, r0, c1, r1): (box(d, *a, TH * 1.5, (246, 244, 238)), d.polygon(raised(quad(*a), TH * 1.5), fill=WALL_TOP)))
        elif what == 'coop':
            add(key, lambda d, a=(c0, r0, c1, r1): (box(d, *a, TH * 1.4, (200, 120, 80)), roof(d, *a, TH * 1.4, TH * 0.8, (150, 70, 50))))
        elif what == 'cabin':
            add(key, lambda d, a=(c0, r0, c1, r1): (box(d, *a, TH * 1.8, (190, 150, 108)), roof(d, *a, TH * 1.8, TH, (96, 80, 70))))
        elif what == 'well':
            add(key, lambda d, a=(c0, r0, c1, r1): (box(d, a[0] + 0.2, a[1] + 0.2, a[2] - 0.2, a[3] - 0.2, TH * 0.8, (160, 156, 150)),
                                                  d.polygon(raised(quad(a[0] + 0.35, a[1] + 0.35, a[2] - 0.35, a[3] - 0.35), TH * 0.8), fill=(60, 70, 90))))
        elif what == 'trellis':
            def trellis(d, a=(c0, r0, c1, r1)):
                for c, r in ((a[0] + 0.3, a[1] + 0.3), (a[2] - 0.3, a[1] + 0.3), (a[0] + 0.3, a[3] - 0.3), (a[2] - 0.3, a[3] - 0.3)):
                    post(d, c, r, TH * 1.6)
                d.polygon(raised(quad(a[0] + 0.1, a[1] + 0.1, a[2] - 0.1, a[3] - 0.1), TH * 1.6), fill=(110, 160, 80))
            add(key, trellis)
        elif what == 'rockery':
            def rockery(d, a=(c0, r0, c1, r1)):
                rnd = random.Random(a[0] * 7 + a[1])
                for i in range(int((a[2] - a[0]) * (a[3] - a[1]) * 0.9)):
                    x, y = top(rnd.uniform(a[0] + 0.3, a[2] - 0.3), rnd.uniform(a[1] + 0.3, a[3] - 0.3))
                    rock(d, x, y, rnd.uniform(TW * 0.25, TW * 0.45), rnd.uniform(TH * 1.2, TH * 2.6), i)
            add(key, rockery)
        elif what == 'corridor':
            def corridor(d, a=(c0, r0, c1, r1)):
                for r in range(a[1], a[3]):
                    post(d, a[0] + 0.5, r + 0.5, TH * 1.8, color=(176, 64, 48), width=4)
                d.polygon(raised(quad(a[0] - 0.1, a[1], a[2] + 0.1, a[3]), TH * 1.8), fill=WALL_TOP)
            add(key, corridor)
        elif what == 'spring':
            def steam(d, a=(c0, r0, c1, r1)):
                rnd = random.Random(5)
                for _ in range(10):
                    x, y = top(rnd.uniform(a[0] + 0.5, a[2] - 0.5), rnd.uniform(a[1] + 0.5, a[3] - 0.5))
                    rr = rnd.uniform(6, 12)
                    d.ellipse([x - rr, y - rr * 2 - 10, x + rr, y - 10], fill=(240, 246, 250))
            add(key, steam)
    # 动物小院的栅栏
    farm = next(a for a in LAYOUT['areas'] if a['id'] == 'farm')
    add(farm['rect'][2] - 1 + farm['rect'][3] - 1 - 0.5, lambda d: fence(d, *farm['rect']))
    return [fn for _, _, fn in sorted(items, key=lambda t: (t[0], t[1]))]


def draw_estate():
    img = Image.new('RGB', (W, H), PAPER)
    d = ImageDraw.Draw(img)
    rnd = random.Random(3)
    # 宅院外面：淡淡的远山
    for i, (x, rx, ry) in enumerate(((W * 0.2, W * 0.22, TH * 4), (W * 0.55, W * 0.3, TH * 5), (W * 0.85, W * 0.2, TH * 3.5))):
        d.ellipse([x - rx, TOP + TH * 2 - ry, x + rx, TOP + TH * 2 + ry], fill=shade((196, 214, 180), 1 - i * 0.04))
    # 地基侧面
    base = quad(0, 0, COLS, ROWS)
    d.polygon([base[3], base[2], (base[2][0], base[2][1] + DEPTH), (base[3][0], base[3][1] + DEPTH)], fill=(150, 118, 92))
    d.polygon([base[2], base[1], (base[1][0], base[1][1] + DEPTH), (base[2][0], base[2][1] + DEPTH)], fill=(176, 134, 96))
    d.polygon(base, fill=COLORS['lawn'])
    draw_ground(d, rnd)
    for fn in standing():
        fn(d)
    return img


def draw_labels(img):
    out = img.copy()
    d = ImageDraw.Draw(out)
    font = ImageFont.truetype(FONT, int(TW * 0.5))
    small = ImageFont.truetype(FONT, int(TW * 0.3))
    for a in LAYOUT['areas']:
        c0, r0, c1, r1 = a['rect']
        x, y = top((c0 + c1) / 2, (r0 + r1) / 2)
        for text, f, dy in ((a['name'], font, -TH * 0.5), ('开局就有' if a['cost'] == 0 else f"修整 {a['cost']} 暖豆", small, TH * 0.6)):
            b = d.textbbox((x, y + dy), text, font=f, anchor='mm')
            d.rounded_rectangle([b[0] - 8, b[1] - 4, b[2] + 8, b[3] + 4], radius=8, fill=(255, 255, 255))
            d.text((x, y + dy), text, fill=(40, 40, 40), font=f, anchor='mm')
    return out


def draw_cloud():
    """一朵蓬松的云，透明底"""
    S = 2
    img = Image.new('RGBA', (360 * S, 200 * S), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    blobs = ((90, 130, 60), (160, 100, 80), (240, 125, 70), (290, 150, 50), (180, 150, 70))
    for x, y, r in blobs:
        d.ellipse([(x - r) * S, (y - r * 0.8 + 14) * S, (x + r) * S, (y + r * 0.8 + 14) * S], fill=(196, 212, 230, 255))
    for x, y, r in blobs:
        d.ellipse([(x - r) * S, (y - r * 0.8) * S, (x + r) * S, (y + r * 0.8) * S], fill=(255, 255, 255, 255))
    img = img.resize((360, 200), Image.LANCZOS)
    path = os.path.join(OUT, 'cloud.png')
    img.quantize(colors=256, method=Image.Quantize.FASTOCTREE).save(path, optimize=True)


def main():
    os.makedirs(os.path.join(OUT, 'estate'), exist_ok=True)
    os.makedirs(GUIDE, exist_ok=True)
    img = draw_estate()
    tw, th = W / SPLIT, H / SPLIT
    total = 0
    for row in range(SPLIT):
        for col in range(SPLIT):
            tile = img.crop((round(col * tw), round(row * th), round((col + 1) * tw), round((row + 1) * th)))
            path = os.path.join(OUT, 'estate', f't{row}{col}.jpg')
            tile.save(path, quality=JPEG_QUALITY, optimize=True)
            total += os.path.getsize(path)
    img.save(os.path.join(GUIDE, 'estate-blockout.jpg'), quality=88, optimize=True)
    draw_labels(img).save(os.path.join(GUIDE, 'estate-blockout-labels.jpg'), quality=88, optimize=True)
    draw_cloud()
    print(f'底图 {W}×{H}，16 块共 {total // 1024} KB；云朵和草图已写入')


if __name__ == '__main__':
    main()
```

- [ ] **Step 2: `draw-images.py` 删掉小岛**

1. 删除 `draw_island`、`draw_locked`、`draw_guide` 三个函数，以及常量 `ISLAND`、`SAND`、`SAND_DARK`、`PATH_STONE`、`PATH_EDGE`、`BED_SOIL`、`BED_EDGE`、`GUIDE_FONT`、`GUIDE_COLORS`、`WILD`、`WEED`、`STONE`（后三个只有 `draw_locked` 用；`WILD_DARK` 之前已经删了，还在的话一起删）。
2. `draw_garden` 开头的 `draw_island()`、`draw_locked()` 两行删掉（保留 `draw_hint()`、`draw_sign()`）；`__main__` 里的 `draw_guide()` 删掉。
3. `from PIL import Image, ImageDraw, ImageFont` 改回 `from PIL import Image, ImageDraw`（确认文件里没有别的 `ImageFont` 用法：`grep -n ImageFont scripts/draw-images.py` 应无输出）。
4. 文件开头的 docstring 第一行改成 `"""生成小程序里用到的图片：tabBar 图标、修整木牌、亮格，以及庭院物品和界面图的占位图。`。

- [ ] **Step 3: 生成、删旧图、检查**

```bash
git rm -q miniprogram/images/garden/island.png miniprogram/images/garden/locked-wide.png miniprogram/images/garden/locked-tall.png art/guide/island-layout.png
python3 -c "import ast; ast.parse(open('scripts/estate/blockout.py').read()); ast.parse(open('scripts/draw-images.py').read())"
python3 scripts/estate/blockout.py
python3 scripts/draw-images.py
ls miniprogram/images/garden/estate | wc -l
du -sh --apparent-size miniprogram
```

Expected：16 块；`miniprogram` < 1.8MB。用 Read 看 `art/guide/estate-blockout-labels.jpg`：11 个院子位置对、墙和月亮门在格子线上、正房在正院后排、荷塘的水在院子中间、菜畦四条、大门在最前面；`cloud.png` 是一朵白云。

- [ ] **Step 4: 提交（本地）**

```bash
git add -A
git commit -m "feat(garden): estate blockout base tiles, cloud sprite; drop island art

<trailer>"
```

---

### Task 7: 花园页：宅院底图、云朵、木牌、影子、换方向、住户列表

**Files:**
- Modify: `miniprogram/pages/garden/garden.js`、`garden.wxml`（整份替换）、`garden.wxss`
- Test: `test/pages.test.js`

**Interfaces:**
- Consumes: Task 3 的 `garden.get`（`areas`）、`garden.unlock({ area })`、`garden.flip({ uid })`、`garden.place({ …, flip })`；Task 4 的 world.js、`buildScene`；Task 5 的 `createLife`（`walk / areaOf / spots / door / hour`）、`whereIs`、`focus`、`A.describe`
- Produces: 页面 data `art`、`clouds`、`signs`、`residents`、`residentsOpen`、`placingFlip`、`burst`；方法 `toggleFlip`、`openResidents`、`closeResidents`、`findResident`（`data-index`）、`tapSign`（`data-key` 是院子 id）；测试可注入 `page.clock`、`page.hour`

- [ ] **Step 1: 写失败的测试**

`test/pages.test.js`：
1. 顶部 `const { tileCenter } = require('../miniprogram/utils/iso')` 下面加一行 `const { placeableTiles } = require('../miniprogram/utils/shared/estate')`。
2. 「小岛花园：首页、…」整个替换为：

```js
test('园林大宅院首页：今日暖豆、底图云朵木牌、扭蛋、背包摆放、各种不能摆、换方向、移动、收回、修整、找它、去打卡', async () => {
  const green = analysisJson({ rating: 'green' })
  const cloud = createFakeCloud({ replies: [green, green] })
  const { main } = loadCloudFunction(cloud)
  const wx = createWx(main)
  await main({ action: 'profile.save', data: { nickname: '妈妈', sex: 'female', age: 50, heightCm: 160, weightKg: 70, targetWeightKg: 60, activity: 'light' } })
  await main({ action: 'meal.analyze', data: { mealType: 'breakfast', note: '粥' } })
  await main({ action: 'meal.analyze', data: { mealType: 'lunch', note: '面' } })

  const garden = loadPage('garden', wx)
  garden.hour = () => 15
  garden.onLoad()
  garden.onShow()
  await settle()
  assert.equal(garden.data.welcome.beans, 60)
  assert.equal(garden.data.beans, 80)
  assert.equal(garden.data.canSpin, true)
  assert.equal(garden.data.daily.title, '今天得了 20 暖豆')
  assert.deepEqual(garden.data.daily.stamps.map((s) => s.cls), ['stamp-green', 'stamp-green', 'stamp-none'])
  assert.equal(garden.data.art.length, 16)
  assert.deepEqual(garden.data.signs.map((s) => s.key), ['pond', 'flower', 'orchard', 'bamboo'])
  assert.ok(garden.data.clouds.length >= 9 * 6)
  assert.ok(!garden.data.clouds.some((c) => c.area === 'front' || c.area === 'main'))
  assert.deepEqual([garden.data.sprites[0].c, garden.data.sprites[0].r], [11, 16])
  assert.ok(garden.data.sprites[0].shadow.width > 0)
  garden.goGacha()
  assert.deepEqual(wx.log.nav.pop(), ['navigateTo', '/pages/gacha/gacha'])

  const gacha = loadPage('gacha', wx)
  gacha.shakeMs = 0
  gacha.onShow()
  await settle()
  gacha.spin()
  await settle()
  gacha.openCapsule()
  const itemId = gacha.data.result.itemId
  gacha.goPlace()

  // 背包 → 摆放；地图拖动并缩小到 0.8 倍
  garden.onShow()
  await settle()
  garden.openBag()
  garden.pickInventory(event({ id: itemId }))
  assert.equal(garden.data.mode, 'place')
  const opened = ['front', 'main']
  assert.equal(garden.data.hints.length, placeableTiles(opened, garden.garden.placed, itemId).length)
  assert.ok(garden.data.hints.length > 0)
  wx.worldRect = { left: -420, top: -260, width: garden.L.width * 0.8 }
  const tap = (c, r) => {
    const p = tileCenter(c, r, garden.L)
    return { changedTouches: [{ clientX: wx.worldRect.left + p.x * 0.8, clientY: wx.worldRect.top + p.y * 0.8 }] }
  }
  garden.tapLand(tap(11, 16))
  assert.equal(wx.log.toasts.pop(), '这块地上已经有东西了')
  garden.tapLand(tap(13, 15))
  assert.equal(wx.log.toasts.pop(), '小路上不能摆东西')
  garden.tapLand(tap(20, 12))
  assert.equal(wx.log.toasts.pop(), '这个院子还没修整呢')
  garden.tapLand(tap(0, 0))
  assert.equal(wx.log.toasts.pop(), '放不到这里哦')
  // 换个方向再摆
  garden.toggleFlip()
  assert.equal(garden.data.placingFlip, true)
  const spot = garden.data.hints[0]
  garden.tapLand(tap(spot.c, spot.r))
  await settle()
  assert.equal(garden.data.mode, 'view')
  const mine = garden.data.sprites.find((x) => x.itemId === itemId)
  assert.deepEqual([mine.c, mine.r, mine.flip], [spot.c, spot.r, true])

  // 移动：换到另一块亮着的地；移动中换方向直接存
  wx.actionSheetChoice = 0
  garden.tapSprite(event({ uid: mine.uid }))
  assert.equal(garden.data.mode, 'move')
  const other = garden.data.hints.find((t) => t.c !== mine.c || t.r !== mine.r)
  garden.toggleFlip()
  await settle()
  assert.equal(garden.data.sprites.find((x) => x.uid === mine.uid).flip, false)
  garden.tapLand(tap(other.c, other.r))
  await settle()
  assert.deepEqual((({ c, r }) => [c, r])(garden.data.sprites.find((x) => x.uid === mine.uid)), [other.c, other.r])
  wx.actionSheetChoice = 1
  garden.tapSprite(event({ uid: mine.uid }))
  await settle()
  assert.match(wx.log.toasts.pop(), /收进背包了/)

  // 修整荷塘院：豆不够先提示；攒够了确认后云散开、木牌换位置、屏幕滑过去
  garden.tapSign(event({ key: 'pond' }))
  assert.equal(wx.log.toasts.pop(), '修整要 200 暖豆，再攒攒')
  const toastCount = wx.log.toasts.length
  garden.tapSign(event({ key: 'spring' }))
  assert.equal(wx.log.toasts.length, toastCount)
  const doc = cloud.db.collections.get('gardens').get('u1')
  cloud.db.collections.get('gardens').set('u1', { ...doc, beans: { ...doc.beans, bonus: doc.beans.bonus + 300 } })
  garden.onShow()
  await settle()
  assert.equal(garden.data.beans, 350)
  const before = garden.data.view
  garden.tapSign(event({ key: 'pond' }))
  await settle()
  assert.match(wx.log.modals.pop(), /花 200 暖豆修整荷塘院/)
  assert.deepEqual(garden.data.signs.map((s) => s.key), ['flower', 'orchard', 'bamboo', 'tea', 'back'])
  assert.ok(!garden.data.clouds.some((c) => c.area === 'pond'))
  assert.equal(garden.data.beans, 150)
  assert.equal(garden.data.justOpened, 'pond')
  assert.ok(garden.data.burst)
  assert.equal(wx.log.toasts.pop(), '荷塘院修整好啦！')
  assert.notDeepEqual(garden.data.view, before)

  // 还没有住户时的「找它」
  garden.openResidents()
  assert.deepEqual(garden.data.residents, [])
  assert.equal(garden.data.residentsOpen, true)
  garden.closeResidents()
  assert.equal(garden.data.residentsOpen, false)

  const centered = garden.data.view
  garden.recenter()
  assert.notDeepEqual(garden.data.view, centered)
  garden.goCheckin()
  assert.deepEqual(wx.log.nav.pop(), ['navigateTo', '/pages/checkin/checkin'])
  garden.onUnload()
})
```

3. 「庭院小动物：…」测试：
   - 翠竹 `c: 3, r: 4` → `c: 10, r: 15`
   - `garden.clock = manualClock()` 下面加 `garden.hour = () => 15`
   - 注释 `// 回到庭院：熊猫从边上走进来` 改成 `// 回到花园：熊猫从大门走进来`
   - `garden.tapAnimal(event({ index: 0 }))` 之前加：

```js
  // 找它：列表里有它、写着在哪在干嘛；点一下屏幕滑过去
  garden.openResidents()
  assert.equal(garden.data.residents.length, 1)
  assert.equal(garden.data.residents[0].name, '大熊猫')
  assert.match(garden.data.residents[0].text, /^(在.+|正往.+走|溜达)$/)
  const viewBefore = garden.data.view
  garden.findResident(event({ index: 0 }))
  assert.equal(garden.data.residentsOpen, false)
  assert.notDeepEqual(garden.data.view, viewBefore)
  assert.equal(garden.data.animals[0].tapping, true)
  garden.clock.advance(700)
```

- [ ] **Step 2: 跑测试确认失败**

Run: `node --test test/pages.test.js`
Expected: FAIL

- [ ] **Step 3: `garden.js`**（整份替换）

```js
const api = require('../../utils/api')
const W = require('../../utils/world')
const A = require('../../utils/animals')
const { buildScene, inventoryList } = require('../../utils/garden-view')
const { beansCard } = require('../../utils/view')
const { itemById } = require('../../utils/shared/garden')
const { SPOTS, DOOR, areaById, tileInfo, walkable, placeProblem } = require('../../utils/shared/estate')
const { createLife } = require('../../utils/garden-life')

function windowInfo() {
  return wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync()
}

// 右上角胶囊按钮的位置：浮在上面的按钮要避开它
function capsule() {
  try {
    return wx.getMenuButtonBoundingClientRect()
  } catch (e) {
    return null
  }
}

function areaName(id) {
  const a = areaById(id)
  return a ? a.name : ''
}

Page({
  data: {
    loaded: false,
    beans: 0,
    canSpin: false,
    daily: null,
    collectedCount: 0,
    totalCount: 0,
    termText: '',
    waitingText: '',
    hud: { top: 28, height: 32, below: 72 },
    world: null,
    view: { x: 0, y: 0, scale: 1 },
    art: [],
    clouds: [],
    signs: [],
    sprites: [],
    animals: [],
    inventory: [],
    bagCount: 0,
    bagOpen: false,
    residents: [],
    residentsOpen: false,
    mode: 'view', // view 看 / place 从背包摆放 / move 移动已摆的
    selectedName: '',
    placingFlip: false,
    hints: [],
    justOpened: '',
    burst: null,
    welcome: null,
  },

  onLoad() {
    const rect = capsule()
    if (rect && rect.height) this.setData({ hud: { top: rect.top, height: rect.height, below: rect.bottom + 12 } })
  },

  onShow() {
    this.cancel()
    this.load()
  },

  onHide() {
    this.stopLife()
  },

  onUnload() {
    this.stopLife()
  },

  win() {
    const info = windowInfo()
    return { width: info.windowWidth || 375, height: info.windowHeight || 667 }
  },

  load() {
    return api.call('garden.get', { markSeen: true })
      .then((view) => {
        // 花园是首页：第一次用、还没建档，先去建档
        if (!view.hasProfile) {
          wx.switchTab({ url: '/pages/profile/profile' })
          return
        }
        this.setData({ justOpened: '', burst: null })
        this.render(view, true)
      })
      .catch((err) => api.showError(err))
  },

  render(view, fresh) {
    const win = this.win()
    if (!this.L) this.L = W.estateLayout(win.width)
    const L = this.L
    this.garden = view
    this.opened = view.areas.filter((a) => a.unlocked).map((a) => a.id)
    const termItems = view.term && view.term.items.length ? view.term.items.map((id) => itemById(id).name).join('、') : ''
    const inventory = inventoryList(view.inventory)
    const patch = {
      loaded: true,
      beans: view.beans,
      canSpin: view.beans >= view.spinCost,
      collectedCount: view.collectedCount,
      totalCount: view.totalCount,
      termText: termItems ? `${view.term.name}限定「${termItems}」正在扭蛋机里` : '',
      waitingText: view.waiting && view.waiting.length ? '👀 有小动物在院子外张望…下次打卡它就来了' : '',
      world: { width: L.width, height: L.height, viewWidth: L.viewWidth, viewHeight: L.viewHeight, margin: L.margin },
      art: this.data.art.length ? this.data.art : W.artTiles(L),
      clouds: W.cloudViews(view.areas, L),
      signs: W.signViews(view.areas, this.opened, L),
      sprites: buildScene(view.placed, L),
      inventory,
      bagCount: inventory.reduce((sum, i) => sum + i.count, 0),
      welcome: view.welcome || this.data.welcome,
      hints: this.data.mode === 'view' ? [] : this.data.hints,
    }
    // 摆放、移动之后的结果里没有 daily，沿用上次的
    if (view.daily !== undefined) patch.daily = beansCard(view.daily)
    // 第一次进来把正院摆到屏幕正中；之后保留拖到的位置
    if (!this.centered) {
      patch.view = W.areaOffset('main', L, win)
      this.centered = true
    }
    this.setData(patch)
    this.syncLife(view, fresh)
    if (view.testGift) {
      wx.showModal({ title: '测试福利', content: `送你 ${view.testGift} 暖豆，修整院子、扭蛋随便试试`, showCancel: false, confirmText: '好的' })
    }
  },

  // movable-view 只在 x / y / scale-value 的值变了才会动：每次换一点点不同的小数
  nudgeView(offset) {
    this.nudge = !this.nudge
    const d = this.nudge ? 0.01 : 0
    this.setData({ view: { x: offset.x + d, y: offset.y + d, scale: 1 + d / 100 } })
  },

  recenter() {
    this.nudgeView(W.areaOffset('main', this.L, this.win()))
  },

  goCheckin() {
    wx.navigateTo({ url: '/pages/checkin/checkin' })
  },

  // ---------------------------------------------------------------- 背包与摆放

  openBag() {
    this.setData({ bagOpen: true })
  },

  closeBag() {
    this.setData({ bagOpen: false })
  },

  pickInventory(e) {
    const { id } = e.currentTarget.dataset
    const item = itemById(id)
    this.selected = { type: 'place', itemId: id }
    this.setData({
      bagOpen: false,
      mode: 'place',
      selectedName: item ? item.name : '',
      placingFlip: false,
      hints: W.hintViews(this.opened, this.garden.placed, id, null, this.L),
    })
    if (this.life) this.life.pause()
  },

  tapSprite(e) {
    if (this.data.mode !== 'view') return
    const uid = e.currentTarget.dataset.uid
    const sprite = this.data.sprites.find((s) => s.uid === uid)
    if (!sprite) return
    wx.showActionSheet({
      itemList: ['移动位置', '收回背包'],
      success: (res) => {
        if (res.tapIndex === 0) {
          this.selected = { type: 'move', uid, itemId: sprite.itemId }
          this.setData({
            mode: 'move',
            selectedName: sprite.name,
            placingFlip: sprite.flip,
            hints: W.hintViews(this.opened, this.garden.placed, sprite.itemId, uid, this.L),
          })
          if (this.life) this.life.pause()
        } else if (res.tapIndex === 1) {
          this.save('garden.stash', { uid }, `${sprite.name}收进背包了`)
        }
      },
    })
  },

  // 换个方向：摆放时记在本地，摆下去一起存；移动时直接改
  toggleFlip() {
    const sel = this.selected
    if (!sel) return
    if (sel.type === 'place') {
      this.setData({ placingFlip: !this.data.placingFlip })
      return
    }
    api.call('garden.flip', { uid: sel.uid })
      .then((view) => {
        this.setData({ placingFlip: !this.data.placingFlip })
        this.render(view)
      })
      .catch((err) => api.showError(err))
  },

  tapLand(e) {
    if (this.data.mode === 'view' || !this.selected) return
    const touch = (e.changedTouches && e.changedTouches[0]) || e.detail
    const x = touch.clientX != null ? touch.clientX : touch.x
    const y = touch.clientY != null ? touch.clientY : touch.y
    wx.createSelectorQuery()
      .select('#world')
      .boundingClientRect()
      .exec((res) => {
        const rect = res && res[0]
        if (!rect) return
        const tile = W.tileFromTouch(x, y, rect, this.L)
        if (!tile) return
        const sel = this.selected
        const problem = placeProblem(this.opened, this.garden.placed, sel.itemId, tile.c, tile.r, sel.type === 'move' ? sel.uid : undefined)
        if (problem) {
          wx.showToast({ title: problem, icon: 'none' })
          return
        }
        if (sel.type === 'place') this.save('garden.place', { itemId: sel.itemId, c: tile.c, r: tile.r, flip: this.data.placingFlip })
        else this.save('garden.move', { uid: sel.uid, c: tile.c, r: tile.r })
      })
  },

  save(action, data, toast) {
    if (this.saving) return
    this.saving = true
    api.call(action, data)
      .then((view) => {
        this.saving = false
        this.cancel()
        this.render(view)
        if (toast) wx.showToast({ title: toast, icon: 'none' })
      })
      .catch((err) => {
        this.saving = false
        api.showError(err)
      })
  },

  cancel() {
    this.selected = null
    this.setData({ mode: 'view', selectedName: '', placingFlip: false, hints: [] })
    if (this.life) this.life.resume()
  },

  // ---------------------------------------------------------------- 修整院子

  tapSign(e) {
    const { key } = e.currentTarget.dataset
    const area = this.garden && this.garden.areas.find((a) => a.id === key)
    if (this.data.mode !== 'view' || !area || !area.unlockable) return
    if (this.data.beans < area.cost) {
      wx.showToast({ title: `修整要 ${area.cost} 暖豆，再攒攒`, icon: 'none' })
      return
    }
    wx.showModal({
      title: '修整院子',
      content: `花 ${area.cost} 暖豆修整${area.name}？`,
      confirmText: '修整',
      success: (res) => {
        if (!res.confirm) return
        api.call('garden.unlock', { area: key })
          .then((view) => {
            const box = W.areaBox(key, this.L)
            this.setData({ justOpened: key, burst: { left: box.left + box.width / 2, top: box.top + box.height / 2 } })
            this.render(view, true)
            this.nudgeView(W.areaOffset(key, this.L, this.win()))
            wx.showToast({ title: `${area.name}修整好啦！`, icon: 'none' })
          })
          .catch((err) => api.showError(err))
      },
    })
  },

  // ---------------------------------------------------------------- 小动物

  // 刚进页面、修整院子之后重新安排；摆放、移动之后只告诉它们东西变了
  syncLife(view, fresh) {
    if (this.life && !fresh) {
      this.life.updatePlaced(view.placed)
      return
    }
    this.stopLife()
    const opened = this.opened
    this.life = createLife({
      L: this.L,
      placed: view.placed,
      residents: view.residents || [],
      arrivals: view.arrivals || [],
      walk: (c, r, swims) => walkable(opened, c, r, swims),
      areaOf: (c, r) => tileInfo(c, r).area,
      spots: SPOTS.filter((s) => opened.indexOf(s.area) !== -1),
      door: { c: DOOR[0][0], r: DOOR[0][1] },
      hour: this.hour || undefined,
      clock: this.clock || undefined,
      onChange: (i, sprite) => this.setData({ [`animals[${i}]`]: sprite }),
    })
    this.setData({ animals: this.life.sprites() })
    if (this.data.mode === 'view') this.life.start()
  },

  stopLife() {
    if (this.life) this.life.stop()
    this.life = null
  },

  tapAnimal(e) {
    if (this.data.mode !== 'view' || !this.life) return
    this.life.tap(e.currentTarget.dataset.index)
  },

  // ---------------------------------------------------------------- 找它

  openResidents() {
    const list = this.life ? this.life.whereIs() : []
    const residents = list.map((w) => ({ ...w, text: A.describe(w.state, areaName(w.area), areaName(w.toArea)) }))
    this.setData({ residents, residentsOpen: true })
  },

  closeResidents() {
    this.setData({ residentsOpen: false })
  },

  findResident(e) {
    const { index } = e.currentTarget.dataset
    const at = this.life ? this.life.focus(index) : null
    this.setData({ residentsOpen: false })
    if (at) this.nudgeView(W.tileOffset(at.c, at.r, this.L, this.win()))
  },

  // ---------------------------------------------------------------- 跳转

  closeWelcome() {
    this.setData({ welcome: null })
  },

  // 点弹窗内容时不关闭弹窗
  noop() {},

  goGacha() {
    this.setData({ welcome: null })
    wx.navigateTo({ url: '/pages/gacha/gacha' })
  },

  goCollection() {
    wx.navigateTo({ url: '/pages/collection/collection' })
  },

  goCalendar() {
    wx.navigateTo({ url: '/pages/forest/forest' })
  },
})
```

- [ ] **Step 4: `garden.wxml`**（整份替换）

```xml
<view class="screen">
  <view wx:if="{{!loaded}}" class="loading">正在推开花园的门…</view>

  <movable-area wx:if="{{loaded}}" class="map-area">
    <movable-view class="map" direction="all" inertia out-of-bounds="{{false}}" scale scale-min="0.5" scale-max="2" scale-value="{{view.scale}}" x="{{view.x}}" y="{{view.y}}" style="width: {{world.viewWidth}}px; height: {{world.viewHeight}}px">
      <view id="world" class="world" style="left: {{world.margin}}px; top: {{world.margin}}px; width: {{world.width}}px; height: {{world.height}}px" bindtap="tapLand">
        <image wx:for="{{art}}" wx:key="key" class="art" src="{{item.image}}" style="left: {{item.left}}px; top: {{item.top}}px; width: {{item.width}}px; height: {{item.height}}px" />
        <image wx:for="{{hints}}" wx:key="key" class="hint" src="/images/garden/tile-hint.png" style="left: {{item.left}}px; top: {{item.top}}px; width: {{item.width}}px; height: {{item.height}}px" />
        <block wx:for="{{sprites}}" wx:key="uid">
          <view class="shadow" style="left: {{item.shadow.left}}px; bottom: {{item.shadow.bottom}}px; width: {{item.shadow.width}}px; height: {{item.shadow.height}}px; z-index: {{item.z + 9}}"></view>
          <image class="sprite {{item.flip ? 'flip' : ''}} {{mode === 'view' ? '' : 'sprite-ghost'}}" src="{{item.image}}" mode="widthFix" data-uid="{{item.uid}}" catchtap="tapSprite" style="left: {{item.left}}px; bottom: {{item.bottom}}px; width: {{item.width}}px; z-index: {{item.z + 10}}" />
        </block>
        <block wx:for="{{animals}}" wx:key="id">
          <view wx:if="{{item.shadow}}" class="shadow" style="left: {{item.shadow.left}}px; bottom: {{item.shadow.bottom}}px; width: {{item.shadow.width}}px; height: {{item.shadow.height}}px; z-index: {{item.z + 9}}; transition-duration: {{item.duration}}ms"></view>
          <view class="animal {{mode === 'view' ? '' : 'animal-ghost'}}" style="left: {{item.left}}px; bottom: {{item.bottom}}px; width: {{item.width}}px; z-index: {{item.z + 10}}; transition-duration: {{item.duration}}ms" data-index="{{index}}" catchtap="tapAnimal">
            <view wx:if="{{item.bubble}}" class="bubble" style="width: {{item.bubbleWidth}}px; left: {{item.bubbleLeft}}px; bottom: {{item.bubbleBottom}}px">{{item.bubble}}</view>
            <view wx:if="{{item.emoji}}" class="act-emoji">{{item.emoji}}</view>
            <view wx:if="{{item.tapping}}" class="heart">❤️</view>
            <view class="animal-body {{item.flip ? 'flip' : ''}} {{item.bodyHeight < item.width ? 'in-water' : ''}}" style="height: {{item.bodyHeight}}px">
              <image class="animal-img act-{{item.action}} {{item.id === 'duck' && item.action === 'swim' ? 'paddle' : ''}} {{item.tapping ? 'tap' : ''}}" src="{{item.image}}" mode="widthFix" />
            </view>
            <view wx:if="{{item.bodyHeight < item.width}}" class="ripple"></view>
          </view>
        </block>
        <block wx:for="{{signs}}" wx:key="key">
          <view class="sign" style="left: {{item.left}}px; bottom: {{item.bottom}}px; width: {{item.width}}px" data-key="{{item.key}}" catchtap="tapSign">
            <image class="sign-img" src="/images/garden/sign.png" mode="widthFix" />
            <view class="sign-text">修整{{item.name}}<text class="sign-cost">{{item.cost}} 暖豆</text></view>
          </view>
        </block>
        <image wx:for="{{clouds}}" wx:key="key" class="cloud" src="{{item.image}}" mode="widthFix" style="left: {{item.left}}px; top: {{item.top}}px; width: {{item.width}}px; animation-delay: {{item.delay}}s" />
        <view wx:if="{{burst}}" class="confetti" style="left: {{burst.left}}px; top: {{burst.top}}px">
          <view class="confetti-bit b1"></view>
          <view class="confetti-bit b2"></view>
          <view class="confetti-bit b3"></view>
          <view class="confetti-bit b4"></view>
          <view class="confetti-bit b5"></view>
          <view class="confetti-bit b6"></view>
        </view>
      </view>
    </movable-view>
  </movable-area>

  <block wx:if="{{loaded}}">
    <view class="hud-res" style="top: {{hud.top}}px; height: {{hud.height}}px">
      <image class="res-icon" src="/images/garden/ui/bean.png" mode="aspectFit" />
      <text class="res-num">{{beans}}</text>
    </view>
    <view wx:if="{{daily}}" class="hud-today" style="top: {{hud.below}}px">
      <text class="hud-today-text">{{daily.title}}</text>
      <view class="stamps stamps-mini">
        <view wx:for="{{daily.stamps}}" wx:key="key" class="stamp {{item.cls}}">{{item.label}}</view>
      </view>
    </view>
    <view class="hud-collect" style="top: {{hud.below}}px" bindtap="goCollection">图鉴 {{collectedCount}}/{{totalCount}} ›</view>
    <view class="hud-notes" style="top: {{hud.below + 50}}px">
      <view wx:if="{{termText}}" class="hud-note">🍂 {{termText}}</view>
      <view wx:if="{{waitingText}}" class="hud-note hud-note-green">{{waitingText}}</view>
    </view>

    <view wx:if="{{mode === 'view'}}" class="side side-left">
      <view class="side-btn" bindtap="goCollection">
        <image class="side-icon" src="/images/garden/ui/book.png" mode="aspectFit" />
        <text class="side-label">图鉴</text>
      </view>
      <view class="side-btn" bindtap="goCalendar">
        <image class="side-icon" src="/images/garden/ui/calendar.png" mode="aspectFit" />
        <text class="side-label">日历</text>
      </view>
    </view>
    <view wx:if="{{mode === 'view'}}" class="side side-right">
      <view class="side-btn" bindtap="goGacha">
        <image class="side-icon" src="/images/garden/ui/gacha.png" mode="aspectFit" />
        <text class="side-label">扭蛋</text>
        <view wx:if="{{canSpin}}" class="dot"></view>
      </view>
      <view class="side-btn" bindtap="openBag">
        <image class="side-icon" src="/images/garden/ui/basket.png" mode="aspectFit" />
        <text class="side-label">背包</text>
        <view wx:if="{{bagCount}}" class="badge">{{bagCount}}</view>
      </view>
      <view class="side-btn" bindtap="openResidents">
        <text class="side-emoji">🐾</text>
        <text class="side-label">住户</text>
      </view>
    </view>

    <view wx:if="{{mode === 'view'}}" class="recenter" bindtap="recenter">
      <image class="recenter-icon" src="/images/garden/ui/home.png" mode="aspectFit" />
    </view>
    <view wx:if="{{mode === 'view'}}" class="checkin-btn" bindtap="goCheckin">
      <text class="checkin-icon">📷</text>
      <text>拍一拍这一餐</text>
    </view>

    <view wx:if="{{mode !== 'view'}}" class="placing">
      <view class="placing-text">{{mode === 'place' ? '摆放' : '移动'}}「{{selectedName}}」：点一块亮着的空地</view>
      <view class="placing-btns">
        <button class="btn-plain btn-small" bindtap="toggleFlip">↔ 换个方向</button>
        <button class="btn-plain btn-small" bindtap="cancel">取消</button>
      </view>
    </view>

    <view wx:if="{{bagOpen}}" class="drawer-mask" catchtap="closeBag"></view>
    <view class="drawer {{bagOpen ? 'drawer-open' : ''}}">
      <view class="drawer-head">
        <text class="drawer-title">背包（点一下，摆进花园）</text>
        <text class="drawer-close" catchtap="closeBag">✕</text>
      </view>
      <scroll-view wx:if="{{inventory.length}}" class="bag" scroll-x enhanced show-scrollbar="{{false}}">
        <view wx:for="{{inventory}}" wx:key="itemId" class="bag-item" style="border-color: {{item.rarityColor}}" data-id="{{item.itemId}}" bindtap="pickInventory">
          <image class="bag-image" src="{{item.image}}" mode="aspectFit" />
          <view class="bag-name">{{item.name}}</view>
          <view wx:if="{{item.count > 1}}" class="bag-count">×{{item.count}}</view>
        </view>
      </scroll-view>
      <view wx:else class="muted small">背包空空的，去扭蛋机试试手气吧～</view>
    </view>

    <view wx:if="{{residentsOpen}}" class="drawer-mask" catchtap="closeResidents"></view>
    <view class="drawer {{residentsOpen ? 'drawer-open' : ''}}">
      <view class="drawer-head">
        <text class="drawer-title">住户（点一下，带你去找它）</text>
        <text class="drawer-close" catchtap="closeResidents">✕</text>
      </view>
      <view wx:if="{{residents.length}}" class="res-list">
        <view wx:for="{{residents}}" wx:key="id" class="res-row" data-index="{{item.index}}" bindtap="findResident">
          <image class="res-avatar" src="{{item.image}}" mode="aspectFit" />
          <view class="res-body">
            <view class="res-name">{{item.name}}</view>
            <view class="res-text">{{item.text}}</view>
          </view>
          <text class="res-go">去看看 ›</text>
        </view>
      </view>
      <view wx:else class="muted small">还没有小动物搬来。摆上它们喜欢的东西，下次打卡就会来～</view>
    </view>
  </block>

  <view wx:if="{{welcome}}" class="overlay" catchtap="closeWelcome">
    <view class="welcome" catchtap="noop">
      <image class="welcome-gift" src="/images/garden/ui/gift.png" mode="aspectFit" />
      <view class="welcome-title">欢迎来到你的养生花园！</view>
      <view class="welcome-text">送你 {{welcome.beans}} 暖豆，还在正院里种了一棵大树。每天好好吃饭攒暖豆，扭蛋抽花草家具布置院子，摆对东西小动物会搬来；暖豆攒多了还能一个个修整后面的院子～</view>
      <button class="btn-primary" bindtap="goGacha">去扭蛋</button>
      <view class="link link-muted welcome-later" bindtap="closeWelcome">先看看</view>
    </view>
  </view>
</view>
```

- [ ] **Step 5: `garden.wxss`**

1. `.screen` 的 `background` 改成 `background: #e8e0cf;`（和白模四周一样的纸色）。
2. 删除 `.island`、`.locked`（两处）、`.plant`、`.scenery-new`、`@keyframes pop-in`、`.wave`、`@keyframes wave` 规则。
3. `.sign` 的 `z-index: 8` 改成 `z-index: 45`（要在云上面）。
4. 文件末尾追加：

```css
/* ---------------------------------------------------------------- 宅院 */

.art {
  position: absolute;
  z-index: 1;
}

/* 物件、小动物脚下的影子 */
.shadow {
  position: absolute;
  border-radius: 50%;
  background: rgba(30, 40, 20, 0.18);
  pointer-events: none;
  transition-property: left, bottom;
  transition-timing-function: linear;
}

.sprite.flip {
  transform: scaleX(-1);
}

/* 没修的院子上的云，慢慢飘 */
.cloud {
  position: absolute;
  z-index: 40;
  pointer-events: none;
  opacity: 0.96;
  animation: drift 7s ease-in-out infinite alternate;
}

@keyframes drift {
  0% {
    transform: translate(-4%, 0);
  }
  100% {
    transform: translate(4%, -3%);
  }
}

/* 修好院子时冒的一把彩带 */
.confetti {
  position: absolute;
  z-index: 60;
  width: 0;
  height: 0;
  pointer-events: none;
}

.confetti-bit {
  position: absolute;
  width: 16rpx;
  height: 24rpx;
  border-radius: 4rpx;
  animation: toss 1.1s ease-out forwards;
}

.b1 { background: #f4b740; --dx: -120rpx; --dy: -200rpx; }
.b2 { background: #e8553b; --dx: 90rpx; --dy: -240rpx; animation-delay: 0.05s; }
.b3 { background: #6fcf5a; --dx: -170rpx; --dy: -110rpx; animation-delay: 0.1s; }
.b4 { background: #3577c0; --dx: 160rpx; --dy: -140rpx; animation-delay: 0.08s; }
.b5 { background: #ff8ab8; --dx: -40rpx; --dy: -260rpx; animation-delay: 0.12s; }
.b6 { background: #ffd34d; --dx: 50rpx; --dy: -90rpx; animation-delay: 0.15s; }

@keyframes toss {
  0% {
    transform: translate(0, 0) rotate(0deg);
    opacity: 1;
  }
  100% {
    transform: translate(var(--dx), var(--dy)) rotate(540deg);
    opacity: 0;
  }
}

/* 做小事：轻轻扭一扭；泡在水里：上下浮 */
.act-trick {
  animation: wiggle 0.8s ease-in-out infinite;
}

@keyframes wiggle {
  0%,
  100% {
    transform: rotate(-6deg);
  }
  50% {
    transform: rotate(6deg);
  }
}

.act-soak {
  animation: bob 2s ease-in-out infinite;
}

/* 摆放时的两个按钮 */
.placing-btns {
  display: flex;
  gap: 12rpx;
}

.side-emoji {
  font-size: 56rpx;
  line-height: 1.1;
}

/* 住户列表 */
.res-list {
  max-height: 50vh;
  overflow-y: auto;
}

.res-row {
  display: flex;
  align-items: center;
  gap: 20rpx;
  padding: 16rpx 8rpx;
  border-bottom: 2rpx solid rgba(0, 0, 0, 0.05);
}

.res-avatar {
  width: 88rpx;
  height: 88rpx;
}

.res-body {
  flex: 1;
}

.res-name {
  font-size: 32rpx;
  font-weight: 700;
}

.res-text {
  font-size: 26rpx;
  color: var(--muted);
  margin-top: 4rpx;
}

.res-go {
  font-size: 28rpx;
  color: var(--primary);
}
```

确认 `@keyframes bob` 还在文件里（`.act-swim` 用的）：`grep -n "keyframes bob" miniprogram/pages/garden/garden.wxss`。

- [ ] **Step 6: 跑测试、看截图、提交、推送**

```bash
npm test 2>&1 | grep -E "^# (pass|fail)|^not ok"
node --check miniprogram/pages/garden/garden.js
```

Expected：全部 PASS。用 scratchpad 里的 `preview/shoot-island.js` 改一份 `shoot-estate.js`（种子数据改成 `estate: 1, opened: ['front', 'main', 'pond']`、物件坐标落在正院 / 前院 / 荷塘院的草地上、`garden.tapSign(event({ key: 'flower' }))`、`garden.hour = () => 15`）截图看：底图和格子对齐（物件落在草地上、不在墙上）、云盖住没修的院子、木牌在门里侧、2×2 的亭子落在四格中间、影子在脚下、「住户」列表、修整后的彩带。按需要调 `world.js` 的 `COURT_SCREEN`、`.sign-text` 的 `top`、`cloudViews` 的云大小。

```bash
git add -A
git commit -m "feat(garden): estate page with clouds, signs, shadows, flip and resident finder

<trailer>"
git push -u origin claude/mini-program-dev-nzn2n0
```

---

### Task 8: 文档、出图说明、部署

**Files:**
- Create: `docs/art/garden-estate-art-brief.md`；Delete: `docs/art/garden-island-art-brief.md`
- Modify: `README.md`、`CLAUDE.md`、`docs/superpowers/specs/2026-10-23-garden-estate-design.md`（架构表注明格子表在加载时算、首次 1 倍）

- [ ] **Step 1: 出图说明** `docs/art/garden-estate-art-brief.md`

```markdown
# 园林大宅院 · 即梦出图包

一共 **3 张图**。第 1 张最重要，值得多生成几轮挑最好的；后两张各一轮就够。

参考图都在仓库 `art/guide/` 里（我也会直接发给你）：

| 文件 | 用途 |
|---|---|
| `estate-blockout.jpg` | **白模**：整座宅院的布局，墙、月亮门、正房、池子、花坛的土、菜畦、假山都按游戏里的格子摆好。第 1 张图照着它画 |
| `estate-blockout-labels.jpg` | 同一张白模加了院子名字，给你看懂布局用，**不要**上传给即梦 |
| `style-ref.jpg` | **画风参考**：游戏里扭蛋物件和小动物的样子，宅院要画成同一种风格，摆上去才不突兀 |

## 通用设置

- 用即梦的「图片生成」，模型选最新的（图片 4.0 或更新）
- 分辨率选**最高**，下载**原图**，不要截图
- 一次出 4 张，挑一张最好的；不满意就再来一轮
- 选中的图打包成 zip 发给我，告诉我哪张是哪张

---

## 第 1 张 · 宅院整图（最重要）

- **参考图**：上传 `estate-blockout.jpg`（第 1 张）和 `style-ref.jpg`（第 2 张）。有「参考强度 / 相似度」的话调到偏高，布局别跑偏
- **比例**：16:9（横图；白模本身是 16:9 偏一点点，我会对齐裁切）
- **怎么挑**：先看布局有没有跟白模对上——11 个院子、每道月亮门、正房、荷塘的水、四条菜畦、三条花坛的位置和大小；再看漂不漂亮。**院子里面必须是空的**（草地、土、铺地、水面），不要画树、花、桌椅、动物——这些是玩家自己摆的

**提示词（整段复制）：**

```
参考图1是一座中式园林宅院的白模布局图，参考图2是画风参考。请把参考图1重绘成一张精品手游的主城场景原画。
严格保持参考图1的构图、等距俯视角度、每一道围墙和月亮门的位置、每个院子的大小和形状、正房和各个建筑的位置、水池、花坛、菜畦、铺地和小路的位置，不要移动、增加或删掉任何墙、门和建筑。
画风参考图2：可爱的3D卡通渲染，圆润饱满的粘土质感，温暖明亮的色彩，柔和的左上方光照，细腻的环境光遮蔽，精致、干净、细节丰富。

画面内容：一座苏州园林式的大宅院，白墙黛瓦的围墙把它分成11个院子，院子之间是圆形的月亮门，最前面的外墙正中是一扇朱红色大门，门内一面影壁。
正中偏后的院子里是一座白墙黛瓦的正房，飞檐翘角，坐在石砌台基上，门前几级石阶。
每个院子里的地面按白模画：嫩绿平整的草坪、深褐色翻松的花坛和菜畦、浅色石板铺地、灰白色石板小路；右边中间的院子里是一大片清澈的池水，靠正院一侧是一个木平台；右上角院子里是冒着热气的岩石温泉池和一间小木屋；左上角院子里有一座小鸡舍，四周围着矮木栅栏；左边中间的院子里有一座太湖石假山和一片白沙地；后面横跨两个院子的大后花园里有一座太湖石假山、一道小瀑布落进水潭、一条小溪蜿蜒流过；最右边中间的院子有一个临水的木平台和一条靠墙的红柱回廊；左下角院子靠墙有一座葡萄架；右下角院子里有四条菜畦和一口石井。
所有院子里面都是空的：只有地面，没有树木、花草、桌椅、灯笼、动物、人物（这些由游戏另外摆上去）。
宅院外面是淡淡的远山和柔和的米色，整体干净、精致、温暖。

要求：高清，细节丰富，画面里没有文字、没有界面按钮、没有边框，宅院占满画面。
```

---

## 第 2 张 · 云雾（盖住还没修整的院子）

- **参考图**：上传 `style-ref.jpg`
- **比例**：1:1

```
一组可爱的卡通云朵游戏素材，参考图的3D卡通渲染画风。6朵形状、大小都不一样的蓬松白云：有扁长的、有圆滚滚的、有三四团连在一起的，云朵洁白柔软，底部带一点淡淡的蓝灰色阴影。6朵云整齐分开排列，彼此不重叠、不相连。
背景是纯黑色，干净平整，没有任何渐变和杂物。没有文字。
```

背景一定要是**纯黑**，我靠它把云朵干净地抠出来。

---

## 第 3 张 · 木牌和按钮图标

- **参考图**：上传 `style-ref.jpg`
- **比例**：3:2

```
一组手游界面图标素材，参考图的3D卡通渲染画风，圆润可爱，色彩明亮。6个物件整齐排成2行3列，彼此分开，不重叠：
1. 一块立在草地上的中式木牌：一根木桩上钉着一块横的长方形空白木板，木板上不要写任何字；
2. 一只编织竹篮，里面装着花草和小果子；
3. 一本红色顶边的翻页台历，页面是空白的，不要写字；
4. 一座小小的白墙黛瓦中式房子；
5. 一个可爱的小动物脚印图案的圆形徽章；
6. 一团金色闪光的庆祝彩带和小星星。
背景是纯洋红色（#FF00FF），干净平整，没有渐变和阴影。没有文字。
```

背景用**纯洋红色**也是为了好抠图；这些图标里没有洋红色，抠起来不会伤到物件。

---

## 我这边怎么用

- 第 1 张对齐游戏格子后切成 16 块放云存储，当整座宅院的底图；物件、小动物摆在上面，脚下有影子
- 第 2 张抠成云朵，盖在还没修整的院子上
- 第 3 张：1 是修整木牌，2～5 换掉背包、日历、回家、住户按钮的图标，6 是修整成功时的彩带
- 大图放云存储，不占小程序 2MB 的包
```

- [ ] **Step 2: README、CLAUDE.md、设计文档**

`README.md`：
1. 「功能」里「**小岛花园**（首页）」那条换成 `- **园林大宅院**（首页）：每天打卡换「暖豆」；暖豆拿去扭蛋抽花草、家具，布置一座苏州园林式的大宅院——壳是画好的，院子里的东西全是你摆的；摆对东西小动物会搬来、在各个院子里过日子；暖豆攒多了一个个修整后面的院子（详见下文）`。
2. 「## 小岛花园（打卡奖励）」标题改成「## 园林大宅院（打卡奖励）」；「### 小岛花园 → 扭蛋机 → 图鉴」整节替换为：

```markdown
### 大宅院 → 扭蛋机 → 图鉴

- 打开小程序就是花园（第一次用会先去「我的」建档）：一座白墙黛瓦的大宅院，墙和月亮门隔成 11 个院子，一屏看一个院子，拖着逛；底部大按钮「📷 拍一拍这一餐」去打卡
- 一指拖动、双指缩放（0.5～2 倍），左下角「🏠」回到正院；左边是图鉴、打卡日历，右边是扭蛋机（暖豆够扭一次时有小红点）、背包、住户
- 开局有前院和正院，第一次进来送 60 暖豆，并在正院种好一棵大树
- 其他 9 个院子盖着云雾，挨着已修好的院子才能修：挨着的门里侧立着木牌，点一下花暖豆修整。荷塘院 200、花圃院 200、果园 300、菜园 300、竹林院 400、茶院 400、动物小院 500、温泉院 500、后花园 700，共 3500
- 院子的「壳」是画好的（墙、门、正房、池子、花坛的土、菜畦、假山、瀑布……），院子里的东西全靠你摆
- 什么东西摆什么地面：草地什么都能摆；花坛和菜畦的土只能种花种菜；荷塘的水只能放水里的东西；石板铺地只能放家具；小路和月亮门只给小动物走。点错地方会说原因
- 大件（亭子、茶楼、荷花池、锦鲤池、拱桥、水车、秋千树、葫芦架、九曲桥）占 2×2 格；摆放、移动时可以「↔ 换个方向」；所有东西脚下有影子
- 扭一次 30 暖豆；普通 65% · 稀有 25% · 珍稀 8% · 传说 2%；连续 9 次没出珍稀，第 10 次必出珍稀以上
- 一共 48 种：扭蛋里 39 种（普通 15 · 稀有 10 · 珍稀 6 · 传说 3 · 节气限定 5，节气限定在霜降、立冬、小雪、大雪、冬至期间概率提高）+ 9 只小动物（见下文）
- 抽到的东西进背包（从下往上滑出来的抽屉），点一下再点亮着的地就摆上去；点已摆的东西可以移动或收回背包
- 规则细节见 `docs/superpowers/specs/2026-10-23-garden-gacha-design.md`、`2026-10-23-garden-estate-design.md`
```

3. 「### 小动物」一节：「小动物不从扭蛋里出：花园里摆了它喜欢的东西（修整好的角落里自带的风景也算：修好竹林角，熊猫就会来），…」改成「小动物不从扭蛋里出：花园里摆了它喜欢的东西，下一次正餐（早/午/晚）打卡时它就从大门走进来，打卡结果页会告诉你谁来了。」；「- 在花园里自己走来走去（不进花坛和没修整的角落），碰到能玩的东西会停下来玩（角落里的风景也能玩）：」改成「- 在整座宅院里穿过月亮门到处走（只去修好的院子），碰到能玩的东西会停下来玩：」；这一条后面加：

```markdown
- 一天有作息（按手机时间）：早上 6～9 点都往前院、正院凑；中午 11～14 点爱打盹；晚上 7 点后各回各的窝（小鸡回鸡舍、鸭子鹤乌龟睡水里、猫在正院屋檐下、熊猫在竹林假山边；院子没修就在正院睡）
- 会做自己的小事：小花猫去菜园的井边照镜子、胖橘猫泡温泉、熊猫抱着竹子打滚、小白兔偷吃菜、小黄鸭排队过汀步石……修好相关的院子才会有
- 右边「住户」按钮列出每只现在在哪在干嘛，点一下屏幕滑过去找到它
```

4. 目录结构：`pages/garden|today|weight|profile  四个 tab：花园（首页）、今日、体重、我的` 不变；`utils/iso.js, world.js, garden-view.js  等距网格换算、小岛布局（遮罩、风景、花坛、海浪）与点按换算、摆放与图鉴展示` 改成 `utils/iso.js, world.js, garden-view.js  等距网格换算、宅院布局（底图切块、云朵、木牌、亮格）与点按换算、摆放（2×2、转向、影子）与图鉴展示`；`utils/animals.js, garden-life.js  小动物的脾气与台词、在花园里走动玩耍的调度` 改成 `utils/animals.js, garden-life.js  小动物的脾气、台词、作息、小事，在宅院里走动玩耍的调度`；`utils/shared/ … 花园 / 扭蛋 / 小岛分区规则` 改成 `… 花园 / 扭蛋规则、宅院布局与摆放规则（estate.js）`；`images/ tabBar 图标、小岛底图和物件` 改成 `images/ tabBar 图标、白模底图切块、物件`；`services/ … 花园 / 扭蛋 / 修整角落` 改成 `… 花园 / 扭蛋 / 修整院子`；`art/guide/island-layout.png …` 那行改成 `art/guide/estate-blockout.jpg  宅院白模整图（给即梦出图参照，由 scripts/estate/blockout.py 生成）`；`scripts/draw-images.py` 那行后面加 `scripts/estate/blockout.py  按 shared/estate.js 画宅院白模、切块、画云朵`。
5. 「开发」一节：「暖豆数额、扭蛋概率、物件清单、节气、小岛分区与修整价格、角落风景在 `cloudfunctions/api/lib/shared/garden.js`」改成「暖豆数额、扭蛋概率、物件清单（含能摆的地面、占几格）、节气在 `cloudfunctions/api/lib/shared/garden.js`；院子、墙、门、壳里的地面、修整价格、能不能摆 / 走在 `cloudfunctions/api/lib/shared/estate.js`」。
6. 「图片」一节：`scripts/draw-images.py` 那条改成「- `scripts/draw-images.py` 画 tab 图标、修整木牌、亮格；还没有正式美术的物件和图标，它会补一张 emoji 占位图（已有的不覆盖）」；下一条改成「- `python3 scripts/estate/blockout.py` 按 `estate.js` 的布局画宅院白模：切成 16 块 jpg 当占位底图（`images/garden/estate/`）、画云朵、输出 `art/guide/estate-blockout*.jpg`；正式美术按 `docs/art/garden-estate-art-brief.md` 出图（附上白模）」；包大小那条按 `du -sh --apparent-size miniprogram` 的实际数字改。

`CLAUDE.md`：
1. 简介改成：`微信小程序：家人（主要是妈妈）每餐拍照打卡，AI 养生师「小暖」估算热量并点评；每天按正餐打卡得「暖豆」（早午晚印章），打开就是首页「园林大宅院」：可拖动缩放的等距大宅院，墙和月亮门隔成 11 个院子，壳画好、院子里的东西靠玩家摆（扭蛋抽物件，按地面种类摆、2×2 大件、能转向），花暖豆挨着修整院子；有图鉴和节气限定；摆了小动物喜欢的东西，打卡后它从大门搬进来，在各院子里按作息走动、玩耍、做小事。家人自用，走微信「体验版」，不上架。用户用中文沟通。`
2. 设计那行：`（主功能、每日树、庭院扭蛋、小动物、大地图、小岛花园）` → `（主功能、每日树、庭院扭蛋、小动物、大地图、小岛花园、园林大宅院）`；美术需求 → `` `docs/art/garden-art-brief.md`、`docs/art/garden-estate-art-brief.md`（附 `art/guide/estate-blockout.jpg` 白模） ``。
3. 开发约定「图片」那条改成：`图片：美术原图在 art/raw/，python3 scripts/slice-art.py 切成物件和界面图；scripts/draw-images.py 画 tab 图标、木牌、亮格和缺图时的占位图；scripts/estate/blockout.py 按 shared/estate.js 画宅院白模（底图切块、云朵、给即梦的整图）。主包上限 2MB（现在约 X MB，用 du -sh --apparent-size miniprogram 看）`（X 填实际数字）。
4. 「当前状态」里小岛花园那条末尾加「（已被园林大宅院取代）」，再加一条：`- 2026-10-23：园林大宅院上线（第一步）：37×28 格、11 个院子（开局前院 + 正院，其余挨着修，共 3500 暖豆），shared/estate.js 管布局和规则；物件按地面摆、2×2、flip、影子；小动物跨院走动、作息、小事、「找它」；旧数据迁移（物件收回背包、暖豆退回、estate: 1）。底图是白模切块（jpg），正式原画等用户按 docs/art/garden-estate-art-brief.md 出；第二步换原画（切块传云存储）、第三步新物件 18 件 + 小鸟蝴蝶，见设计文档「上线节奏」`。

设计文档 `docs/superpowers/specs/2026-10-23-garden-estate-design.md`：「架构」表里 `lib/shared/estate-map.js（新，生成）` 那行改成 `` `lib/shared/estate.js`（新） | 布局数据（`AREAS`、`SHELL`、`GATES`、`DOOR`、`SPOTS`）和加载时算出的格子表，以及 `tileInfo / walkable / canUnlock / unlockProblem / signTile / footprint / placeProblem / placeableTiles` ``；`scripts/estate/` 那行改成 `` `scripts/estate/blockout.py`（新） | 用 node 读 `estate.js` 的布局画白模，切成 16 块 jpg 当占位底图，画云朵，输出给即梦的整图 ``；「浏览」一节「第一次进来 1.2 倍」改成「第一次进来 1 倍（一个院子正好占满屏宽）」。

- [ ] **Step 3: 全量测试、提交、推送、部署、发给用户**

```bash
git rm -q docs/art/garden-island-art-brief.md
npm test 2>&1 | grep -E "^# (pass|fail)"
du -sh --apparent-size miniprogram
git add -A && git commit -m "docs: garden estate in README and CLAUDE.md; estate art brief

<trailer>"
git push -u origin claude/mini-program-dev-nzn2n0
echo "key length: ${#WX_UPLOAD_KEY}"
npm run wx:function
npm run wx:preview
```

用 SendUserFile 发：`.wechat/preview-qrcode.jpg`、两张截图、`art/guide/estate-blockout.jpg`、`art/guide/estate-blockout-labels.jpg`、`art/guide/style-ref.jpg`、`docs/art/garden-estate-art-brief.md`。提醒用户：旧数据会迁移（摆的东西回背包、暖豆退回），测试福利还在；原画按出图说明去即梦生成。
