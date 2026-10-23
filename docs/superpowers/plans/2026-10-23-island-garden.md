# 小岛后花园 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 3×3 大地图换成一座 12×12 的精致小岛：中间花园 + 四个花暖豆修整的角落（自带风景）+ 四个铺满花草的花坛，花园做首页、游戏风界面、底部大按钮去打卡。

**Architecture:** 规则放 `shared/garden.js`（分区、小路、风景、`placeProblem` 统一的不能摆的原因），云函数 `garden.unlock` 修整角落、`garden.get` 带上今日暖豆和是否建档；小程序 `utils/world.js` 负责小岛布局与景色，庭院页换新布局；`scripts/draw-images.py` 画小岛底图、篱笆遮罩和给 Codex 的布局草图。

**Tech Stack:** 微信小程序原生、微信云开发、node:test、Python + Pillow。

## Global Constraints

- 设计文档：`docs/superpowers/specs/2026-10-23-island-garden-design.md`
- `cloudfunctions/api/lib/shared/*` 改完立即 `cp` 到 `miniprogram/utils/shared/`（逐字节一致）
- 云函数响应 `{ ok, data }` / `{ ok: false, code, message }`，message 中文
- 每个任务：`npm test` 全绿、改过的 JS `node --check`；提交信息结尾 `<trailer>` = `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` 和 `Claude-Session: https://claude.ai/code/session_01CX9A8LkVQKcNnTEsxo35Fv` 两行
- 小岛 12×12；分区 rect `[c 起, r 起, c 止, r 止)`：center `[3,3,9,9]` 0、pond `[3,0,9,3]` 200、bamboo `[0,3,3,9]` 300、veg `[9,3,12,9]` 400、tea `[3,9,9,12]` 500；小路 c = 6、r = 6；新手大树 (4, 4)
- 不能摆的原因（原文）：「放不到花园外面哦」「这里是花坛，不能摆」「这块地还没修整呢」「小路上不能摆东西」「这里已经有风景了」「这块地上已经有东西了」
- 修整文案：「没有这个角落」「这个角落已经修整好了」「暖豆不够啦，修整要 X 暖豆，再攒攒」
- 界面上的「庭院」一律改叫「花园」

---

### Task 1: 小岛规则 + 云函数（修整角落、风景、迁移、今日暖豆）

**Files:**
- Modify: `cloudfunctions/api/lib/shared/garden.js`（复制到 miniprogram）、`lib/garden-state.js`、`services/garden.js`、`router.js`、`index.js`
- Test: `test/garden.test.js`、`test/services-garden.test.js`、`test/router.test.js`、`test/cloud-e2e.test.js`

**Interfaces:**
- Produces（shared）：`ISLAND_SIZE = 12`、`PATH_LINE = 6`、`REGIONS: [{ id, name, cost, rect }]`、`SCENERY: [{ uid, region, itemId, c, r, scale? }]`、`regionById(id)`、`regionOf(c, r) → id | null`、`onIsland(c, r)`、`isPath(c, r)`、`sceneryIn(opened) → SCENERY 子集`、`tileOpen(opened, c, r)`、`tilePlaceable(opened, c, r)`、`placeProblem(opened, placed, c, r, ignoreUid) → '' | 原因`；删除 `PLOT_SIZE / PLOT_GRID / WORLD_SIZE / CENTER_PLOT / plotOf / parsePlot / plotNeighbors / canExpand / expandCost / inWorld`
- Produces（service）：文档字段 `opened: string[]`；`view` 去掉 `world / plots / expandCost`，加 `regions: [{ id, name, cost, unlocked }]`、`scenery`；`get` 结果另有 `hasProfile: boolean`、`daily`（`forest.today` 的结果，没注入 forest 时为 `null`）；`unlock(openid, { region }) → view`；`arrive` 把已修整分区的风景算进喜欢的东西；action `garden.unlock` 取代 `garden.expand`

- [ ] **Step 1: 写失败的测试**

`test/garden.test.js`：顶部解构里 `WORLD_SIZE, PLOT_SIZE, plotOf, parsePlot, plotNeighbors, canExpand, expandCost, tileOpen,` 换成 `ISLAND_SIZE, REGIONS, SCENERY, regionOf, isPath, onIsland, sceneryIn, tileOpen, tilePlaceable, placeProblem,`；「地图：块坐标、相邻、开荒价格、格子开没开垦」测试替换为：

```js
test('小岛：分区、小路、风景、能不能摆', () => {
  assert.equal(ISLAND_SIZE, 12)
  assert.deepEqual(REGIONS.map((g) => [g.id, g.cost]), [['center', 0], ['pond', 200], ['bamboo', 300], ['veg', 400], ['tea', 500]])
  assert.equal(regionOf(4, 4), 'center')
  assert.equal(regionOf(4, 1), 'pond')
  assert.equal(regionOf(1, 4), 'bamboo')
  assert.equal(regionOf(10, 4), 'veg')
  assert.equal(regionOf(4, 10), 'tea')
  assert.equal(regionOf(1, 1), null)
  assert.equal(regionOf(10, 10), null)
  assert.equal(isPath(6, 2), true)
  assert.equal(isPath(2, 6), true)
  assert.equal(isPath(5, 5), false)
  const keys = new Set()
  SCENERY.forEach((s) => {
    assert.equal(regionOf(s.c, s.r), s.region, s.uid)
    assert.equal(isPath(s.c, s.r), false, s.uid)
    assert.ok(itemById(s.itemId), s.uid)
    assert.ok(!keys.has(`${s.c},${s.r}`), s.uid)
    keys.add(`${s.c},${s.r}`)
  })
  assert.equal(SCENERY.filter((s) => s.region === 'bamboo' && s.itemId === 'bamboo').length, 2)
  assert.deepEqual(sceneryIn(['center']), [])
  assert.deepEqual(sceneryIn(['center', 'bamboo']).map((s) => s.itemId), ['bamboo', 'bamboo', 'lantern'])
  assert.equal(tileOpen(['center'], 4, 4), true)
  assert.equal(tileOpen(['center'], 6, 6), true)
  assert.equal(tileOpen(['center'], 4, 1), false)
  assert.equal(tileOpen(['center', 'pond'], 4, 1), true)
  assert.equal(tileOpen(['center'], 1, 1), false)
  assert.equal(tileOpen(['center'], 12, 4), false)
  assert.equal(tilePlaceable(['center'], 4, 4), true)
  assert.equal(tilePlaceable(['center'], 6, 4), false)
  assert.equal(tilePlaceable(['center', 'pond'], 4, 1), false)
  assert.equal(tilePlaceable(['center', 'pond'], 5, 1), true)
  assert.equal(tilePlaceable(['center'], 4.5, 4), false)
  assert.equal(onIsland(11, 11), true)
  assert.equal(onIsland(-1, 0), false)
})

test('placeProblem：为什么不能摆', () => {
  const placed = [{ uid: 'p1', itemId: 'daisy', c: 4, r: 4 }]
  const opened = ['center', 'pond']
  assert.equal(placeProblem(opened, placed, 12, 0), '放不到花园外面哦')
  assert.equal(placeProblem(opened, placed, 1, 1), '这里是花坛，不能摆')
  assert.equal(placeProblem(opened, placed, 1, 4), '这块地还没修整呢')
  assert.equal(placeProblem(opened, placed, 6, 4), '小路上不能摆东西')
  assert.equal(placeProblem(opened, placed, 4, 1), '这里已经有风景了')
  assert.equal(placeProblem(opened, placed, 4, 4), '这块地上已经有东西了')
  assert.equal(placeProblem(opened, placed, 4, 4, 'p1'), '')
  assert.equal(placeProblem(opened, placed, 5, 1), '')
})
```

`test/services-garden.test.js`：
1. `richGarden` 默认值里 `plots: ['0,0']` 换成 `opened: ['center']`。
2. 第一个测试：`assert.deepEqual(first.plots, ['1,1'])` 和 `assert.equal(first.expandCost, 100)` 两行换成

```js
  assert.deepEqual(first.regions.map((g) => [g.id, g.unlocked]), [['center', true], ['pond', false], ['bamboo', false], ['veg', false], ['tea', false]])
  assert.deepEqual(first.scenery, [])
  assert.equal(first.hasProfile, false)
  assert.equal(first.daily, null)
```

`[8, 8]` 改成 `[4, 4]`。
3. 坐标替换（让它们落在中间花园里、避开小路 6）：「place：从背包摆进庭院…」里 `c: 0, r: 5` → `c: 3, r: 8`（含断言 `['daisy', 0, 5]` → `['daisy', 3, 8]`）、`c: 1, r: 5` → `c: 4, r: 8`；「place：背包里没有…」里 pavilion 的 `c: 1, r: 1` → `c: 3, r: 3`，最后一个 `place … c: 1, r: 1` → `c: 3, r: 3`；「move：…」里 `{ uid: 'a', …, c: 1, r: 1 }` → `c: 3, r: 3`、`{ uid: 'b', …, c: 2, r: 2 }` → `c: 4, r: 4`、移动目标 `c: 3, r: 4` → `c: 5, r: 7`（含断言）、被挡的 `c: 2, r: 2` → `c: 4, r: 4`；「stash」里 `c: 1, r: 1` → `c: 3, r: 3`；小动物相关测试里 `c: 0, r: 0` → `c: 3, r: 3`、`c: 1, r: 0` → `c: 4, r: 3`。
4. 删除三个 `expand` 测试、「place / move：只能放在开垦了的地上」、「旧数据：小庭院的坐标挪进中间那块…」；追加：

```js
test('unlock：花暖豆修整角落，自带的风景出现，风景能引来小动物', async () => {
  const { repo, service } = setup({ garden: { welcomed: true, opened: ['center'], beans: { earned: {}, bonus: 600, spent: 0 } } })
  const view = await service.unlock('u1', { region: 'bamboo' })
  assert.equal(view.beans, 300)
  assert.deepEqual(view.regions.filter((g) => g.unlocked).map((g) => g.id), ['center', 'bamboo'])
  assert.deepEqual(view.scenery.map((s) => s.itemId), ['bamboo', 'bamboo', 'lantern'])
  assert.deepEqual(view.waiting, ['panda'])
  const stored = await repo.getGarden('u1')
  assert.deepEqual(stored.opened, ['center', 'bamboo'])
  assert.equal(stored.beans.spent, 300)
  assert.deepEqual(await service.arrive('u1'), { id: 'panda', name: '大熊猫' })
})

test('unlock：没有这个角落、已经修好、暖豆不够都不行', async () => {
  const { service } = setup({ garden: { welcomed: true, opened: ['center', 'pond'], beans: { earned: {}, bonus: 350, spent: 0 } } })
  await assert.rejects(service.unlock('u1', { region: 'moon' }), { code: 'BAD_REQUEST', message: '没有这个角落' })
  await assert.rejects(service.unlock('u1', {}), { code: 'BAD_REQUEST', message: '没有这个角落' })
  await assert.rejects(service.unlock('u1', { region: 'center' }), { code: 'BAD_REQUEST', message: '这个角落已经修整好了' })
  await assert.rejects(service.unlock('u1', { region: 'pond' }), { code: 'BAD_REQUEST', message: '这个角落已经修整好了' })
  await assert.rejects(service.unlock('u1', { region: 'veg' }), { code: 'NO_BEANS', message: '暖豆不够啦，修整要 400 暖豆，再攒攒' })
  assert.equal((await service.unlock('u1', { region: 'bamboo' })).beans, 50)
})

test('place / move：小岛上的各种不能摆', async () => {
  const { service } = setup({ garden: richGarden({ opened: ['center', 'pond'], inventory: { daisy: 3 }, placed: [{ uid: 'p1', itemId: 'pavilion', c: 4, r: 4 }] }) })
  const reject = (c, r, message) => assert.rejects(service.place('u1', { itemId: 'daisy', c, r }), { code: 'BAD_REQUEST', message })
  await reject(12, 0, '放不到花园外面哦')
  await reject(1, 1, '这里是花坛，不能摆')
  await reject(1, 4, '这块地还没修整呢')
  await reject(6, 4, '小路上不能摆东西')
  await reject(4, 1, '这里已经有风景了')
  await reject(4, 4, '这块地上已经有东西了')
  await service.place('u1', { itemId: 'daisy', c: 5, r: 1 })
  await assert.rejects(service.move('u1', { uid: 'p1', c: 6, r: 8 }), { code: 'BAD_REQUEST', message: '小路上不能摆东西' })
})

test('get：带上是否建档和今天的暖豆', async () => {
  const repo = createFakeRepo()
  repo.state.profiles.set('u1', { nickname: '妈妈' })
  const forest = { today: async (openid, date, meals) => ({ date, beansToday: 10, meals: meals.length }) }
  const service = createGardenService({ repo, now: () => NOW, forest })
  const view = await service.get('u1')
  assert.equal(view.hasProfile, true)
  assert.deepEqual(view.daily, { date: TODAY, beansToday: 10, meals: 0 })
})

test('旧数据：大地图中间那块挪进中间花园，别处和小路上的收回背包，开荒的暖豆退回', async () => {
  const { service } = setup({
    garden: {
      welcomed: true,
      plots: ['1,1', '1,0', '2,1'],
      beans: { earned: {}, bonus: 60, spent: 250 },
      placed: [
        { uid: 'p1', itemId: 'starter_tree', c: 8, r: 8 },
        { uid: 'p2', itemId: 'daisy', c: 9, r: 7 },
        { uid: 'p3', itemId: 'daisy', c: 8, r: 2 },
        { uid: 'p4', itemId: 'grass', c: 7, r: 10 },
      ],
    },
  })
  const view = await service.get('u1')
  assert.deepEqual(view.placed.map((p) => [p.itemId, p.c, p.r]), [['starter_tree', 5, 5], ['grass', 4, 7]])
  assert.deepEqual(view.inventory, [{ itemId: 'daisy', count: 2 }])
  assert.deepEqual(view.regions.filter((g) => g.unlocked).map((g) => g.id), ['center'])
  assert.equal(view.beans, 60)
})

test('旧数据：更早的小庭院坐标各加 3', async () => {
  const { service } = setup({ garden: { welcomed: true, placed: [{ uid: 'p1', itemId: 'starter_tree', c: 2, r: 2 }, { uid: 'p2', itemId: 'daisy', c: 3, r: 0 }] } })
  const view = await service.get('u1')
  assert.deepEqual(view.placed.map((p) => [p.itemId, p.c, p.r]), [['starter_tree', 5, 5]])
  assert.deepEqual(view.inventory, [{ itemId: 'daisy', count: 1 }])
})
```

`test/router.test.js`：`expand: record('garden.expand')` → `unlock: record('garden.unlock')`，pairs 里 `['garden.expand', 'garden.expand']` → `['garden.unlock', 'garden.unlock']`。

`test/cloud-e2e.test.js`：庭院流程测试里 `c: 6, r: 6` → `c: 3, r: 3`、`c: 8, r: 8`（被挡的移动）→ `c: 4, r: 4`、`c: 11, r: 11` → `c: 8, r: 8`（含断言）；小动物测试里翠竹 `c: 6, r: 6` → `c: 3, r: 4`；「开荒：豆不够提示…」整个替换为：

```js
test('修整角落：豆不够提示、修好竹林角后熊猫打卡时搬来', async () => {
  const cloud = createFakeCloud({ replies: [analysisJson({ rating: 'green' })] })
  const { main } = loadCloudFunction(cloud)
  await main({ action: 'profile.save', data: profileInput })
  const first = await main({ action: 'garden.get' })
  assert.equal(first.data.hasProfile, true)
  assert.equal(first.data.daily.beansToday, 0)
  const poor = await main({ action: 'garden.unlock', data: { region: 'bamboo' } })
  assert.equal(poor.code, 'NO_BEANS')

  const doc = cloud.db.collections.get('gardens').get('u1')
  cloud.db.collections.get('gardens').set('u1', { ...doc, beans: { ...doc.beans, bonus: 500 } })
  const opened = await main({ action: 'garden.unlock', data: { region: 'bamboo' } })
  assert.equal(opened.ok, true, opened.message)
  assert.deepEqual(opened.data.waiting, ['panda'])
  const meal = await main({ action: 'meal.analyze', data: { mealType: 'lunch', note: '米饭青菜' } })
  assert.deepEqual(meal.data.arrival, { id: 'panda', name: '大熊猫' })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `node --test test/garden.test.js test/services-garden.test.js test/router.test.js test/cloud-e2e.test.js`
Expected: FAIL

- [ ] **Step 3: 实现 `shared/garden.js`**

「庭院地图」那段常量（`// 庭院地图：…` 到 `EXPAND_STEP`）替换为：

```js
// 小岛后花园：12×12 格的等距菱形。中间花园一开始就有；四个角落花暖豆修整；四个 3×3 的角是花坛，只是景色
const ISLAND_SIZE = 12
// c = 6 那一列、r = 6 那一行是十字小路：不能摆东西，小动物能走
const PATH_LINE = 6
// rect：[c 起, r 起, c 止, r 止)，左闭右开
const REGIONS = [
  { id: 'center', name: '中间花园', cost: 0, rect: [3, 3, 9, 9] },
  { id: 'pond', name: '荷塘角', cost: 200, rect: [3, 0, 9, 3] },
  { id: 'bamboo', name: '竹林角', cost: 300, rect: [0, 3, 3, 9] },
  { id: 'veg', name: '菜园角', cost: 400, rect: [9, 3, 12, 9] },
  { id: 'tea', name: '茶亭角', cost: 500, rect: [3, 9, 9, 12] },
]
// 修整好的角落里自带的风景：每件占一格，挡摆放也挡小动物；也算小动物喜欢的东西
// 竹林角只放 2 丛翠竹：熊猫一家要 3 丛，第三丛得自己摆
const SCENERY = [
  { uid: 's1', region: 'pond', itemId: 'lotus_pond', c: 4, r: 1, scale: 1.5 },
  { uid: 's2', region: 'pond', itemId: 'koi_pond', c: 8, r: 1, scale: 1.1 },
  { uid: 's3', region: 'bamboo', itemId: 'bamboo', c: 1, r: 4 },
  { uid: 's4', region: 'bamboo', itemId: 'bamboo', c: 0, r: 8 },
  { uid: 's5', region: 'bamboo', itemId: 'lantern', c: 2, r: 7 },
  { uid: 's6', region: 'veg', itemId: 'cabbage', c: 10, r: 4 },
  { uid: 's7', region: 'veg', itemId: 'radish', c: 11, r: 4 },
  { uid: 's8', region: 'veg', itemId: 'pumpkin', c: 10, r: 8 },
  { uid: 's9', region: 'veg', itemId: 'fence', c: 9, r: 8 },
  { uid: 's10', region: 'tea', itemId: 'pavilion', c: 4, r: 10, scale: 1.4 },
  { uid: 's11', region: 'tea', itemId: 'stone_table', c: 8, r: 10 },
]
```

`plotOf` 到 `tileOpen` 这一串函数替换为：

```js
function regionById(id) {
  return REGIONS.find((g) => g.id === id) || null
}

function onIsland(c, r) {
  return Number.isInteger(c) && Number.isInteger(r) && c >= 0 && r >= 0 && c < ISLAND_SIZE && r < ISLAND_SIZE
}

// 格子在哪个分区；花坛返回 null
function regionOf(c, r) {
  const g = REGIONS.find(({ rect }) => c >= rect[0] && r >= rect[1] && c < rect[2] && r < rect[3])
  return g ? g.id : null
}

function isPath(c, r) {
  return c === PATH_LINE || r === PATH_LINE
}

function sceneryIn(opened) {
  return SCENERY.filter((s) => opened.indexOf(s.region) !== -1)
}

// 已修整分区里的格子（小路也算：小动物能走）
function tileOpen(opened, c, r) {
  return onIsland(c, r) && opened.indexOf(regionOf(c, r)) !== -1
}

// 这一格为什么不能摆（能摆返回 ''）：云函数校验和页面提示用同一套话
function placeProblem(opened, placed, c, r, ignoreUid) {
  if (!onIsland(c, r)) return '放不到花园外面哦'
  const region = regionOf(c, r)
  if (!region) return '这里是花坛，不能摆'
  if (opened.indexOf(region) === -1) return '这块地还没修整呢'
  if (isPath(c, r)) return '小路上不能摆东西'
  if (SCENERY.some((s) => s.c === c && s.r === r)) return '这里已经有风景了'
  if (placed.some((p) => p.c === c && p.r === r && p.uid !== ignoreUid)) return '这块地上已经有东西了'
  return ''
}

function tilePlaceable(opened, c, r) {
  return !placeProblem(opened, [], c, r)
}
```

`module.exports` 里去掉 `PLOT_SIZE, PLOT_GRID, WORLD_SIZE, CENTER_PLOT, plotOf, parsePlot, plotNeighbors, canExpand, expandCost, inWorld, tileOpen,`，加 `ISLAND_SIZE, PATH_LINE, REGIONS, SCENERY, regionById, onIsland, regionOf, isPath, sceneryIn, tileOpen, placeProblem, tilePlaceable,`。然后 `cp` 到 `miniprogram/utils/shared/garden.js`。

- [ ] **Step 4: 实现 `lib/garden-state.js`**

1. import 改成 `const { ANIMALS, tilePlaceable } = require('./shared/garden')`。
2. `adoptWorld` 整个替换为：

```js
// 旧数据换算成小岛：
//  - 大地图（有 plots，坐标 0～17）：中间那块（6～11）各减 3 落进中间花园；落到小路上、别的块里的收回背包；开荒花的暖豆退回
//  - 更早的小庭院（坐标 0～5）：各加 3
function adoptIsland(garden, doc) {
  const { plots, ...rest } = garden
  if (doc.opened) return { ...rest, opened: doc.opened }
  const opened = ['center']
  let shift = 3
  let refund = 0
  if (doc.plots) {
    shift = -3
    // 当年开荒的价格：100、150、200……
    for (let k = 1; k < doc.plots.length; k++) refund += 100 + 50 * (k - 1)
  }
  const placed = []
  const inventory = { ...garden.inventory }
  garden.placed.forEach((p) => {
    const c = p.c + shift
    const r = p.r + shift
    if (tilePlaceable(opened, c, r) && !placed.some((q) => q.c === c && q.r === r)) placed.push({ ...p, c, r })
    else inventory[p.itemId] = (inventory[p.itemId] || 0) + 1
  })
  return { ...rest, placed, inventory, opened, beans: { ...garden.beans, bonus: garden.beans.bonus + refund } }
}
```

3. `normalizeGarden` 里注释改成 `// 修整了哪些分区（opened）由 adoptIsland 给：旧数据换算坐标，新用户只有中间花园`，`return adoptAnimals(adoptWorld({ … }, g.plots))` 改成 `return adoptAnimals(adoptIsland({ … }, g))`，对象里「住进来的小动物」注释中的「庭院」改成「花园」。

- [ ] **Step 5: 实现 `services/garden.js`**

1. import：去掉 `PLOT_SIZE, PLOT_GRID, CENTER_PLOT, parsePlot, canExpand, expandCost, inWorld, tileOpen,`，加 `REGIONS, regionById, sceneryIn, placeProblem,`。
2. `const HIGH_RARITIES` 下面加：

```js
// 新手大树：中间花园里、小路交叉口的后方
const STARTER_TILE = { c: 4, r: 4 }
```

3. 函数签名改成 `function createGardenService({ repo, now, random = Math.random, getGrant = () => null, forest = null }) {`，上面注释补一句「forest：用来在 get 里带上今天的暖豆和印章」。
4. `newUid` 后面加：

```js
  // 小动物喜欢的东西：自己摆的，加上修整好的角落里自带的风景
  function likedThings(garden) {
    return garden.placed.concat(sceneryIn(garden.opened))
  }
```

5. `view()`：`world: …`、`plots: …`、`expandCost: …` 三行换成

```js
      regions: REGIONS.map(({ id, name, cost }) => ({ id, name, cost, unlocked: garden.opened.indexOf(id) !== -1 })),
      scenery: sceneryIn(garden.opened),
```

`waiting:` 那行改成 `waiting: waitingAnimals(likedThings(garden), garden.residents.map((r) => r.id)),`。
6. `checkTile` 整个替换为（顺带删掉它后面多出来的空行）：

```js
  function checkTile(garden, c, r, ignoreUid) {
    const problem = placeProblem(garden.opened, garden.placed, c, r, ignoreUid)
    if (problem) throw new AppError(CODES.BAD_REQUEST, problem)
  }
```

7. `get`：注释改成「第一次进花园：送暖豆，并种一棵大树。花园页带 markSeen：新住户看过了」；新手礼那段的
```js
        // 地图正中：中间那块地的中心
        const [pc, pr] = CENTER_PLOT.split(',').map(Number)
        const center = { c: pc * PLOT_SIZE + Math.floor((PLOT_SIZE - 1) / 2), r: pr * PLOT_SIZE + Math.floor((PLOT_SIZE - 1) / 2) }
```
删除，`c: center.c, r: center.r` 改成 `c: STARTER_TILE.c, r: STARTER_TILE.r`；`if (welcome || seen || testGift) await repo.saveGarden(openid, garden)` 之后、`return result` 之前加：

```js
      // 首页要用：没建档就去建档；左上角显示今天的暖豆和印章
      result.hasProfile = !!(await repo.getProfile(openid))
      result.daily = null
      if (forest) {
        const today = dateKey(now())
        result.daily = await forest.today(openid, today, await repo.listMeals(openid, today))
      }
```

8. `arrive` 里 `waitingAnimals(garden.placed, …)` 改成 `waitingAnimals(likedThings(garden), …)`。
9. `expand` 整个替换为：

```js
    // 修整角落：花暖豆，角落里自带的风景出现
    async unlock(openid, input) {
      const id = (input || {}).region
      const region = regionById(id)
      if (!region) throw new AppError(CODES.BAD_REQUEST, '没有这个角落')
      const garden = await load(openid)
      if (garden.opened.indexOf(id) !== -1) throw new AppError(CODES.BAD_REQUEST, '这个角落已经修整好了')
      if (beanBalance(garden) < region.cost) throw new AppError(CODES.NO_BEANS, `暖豆不够啦，修整要 ${region.cost} 暖豆，再攒攒`)
      garden.beans = { ...garden.beans, spent: garden.beans.spent + region.cost }
      garden.opened = garden.opened.concat(id)
      await repo.saveGarden(openid, garden)
      return view(garden)
    },
```

`router.js`：`'garden.expand': ['garden', 'expand'],` → `'garden.unlock': ['garden', 'unlock'],`。
`index.js`：`createGardenService({ repo, now, getGrant: () => config.testGrant })` → `createGardenService({ repo, now, forest, getGrant: () => config.testGrant })`。

- [ ] **Step 6: 跑测试**

```bash
cp cloudfunctions/api/lib/shared/garden.js miniprogram/utils/shared/garden.js
node --test test/garden.test.js test/services-garden.test.js test/router.test.js test/cloud-e2e.test.js test/shared-sync.test.js
```

Expected：PASS。`npm test` 里 `world.test.js`、`pages.test.js` 会失败（Task 2、Task 4 改），先不推送。

- [ ] **Step 7: 提交（本地）**

```bash
for f in cloudfunctions/api/lib/shared/garden.js cloudfunctions/api/lib/garden-state.js cloudfunctions/api/services/garden.js cloudfunctions/api/router.js cloudfunctions/api/index.js; do node --check $f; done
git add -A && git commit -m "feat(garden): island regions, scenery and corner unlocks on the server

<trailer>"
```

---

### Task 2: `utils/world.js` 小岛布局与景色

**Files:**
- Modify: `miniprogram/utils/world.js`（整份替换）、`miniprogram/utils/garden-view.js`（`buildScene` 认 `scale` 和 `region`）、`miniprogram/utils/garden-life.js`（站到放大了的物件上时按 `scale` 算落脚点）
- Test: `test/world.test.js`（整份替换）、`test/garden-life.test.js`

**Interfaces:**
- Consumes: Task 1 的 shared 小岛函数
- Produces: `islandLayout(windowWidth)`、`centerOffset(L, w, h)`、`islandView(L) → { image, left, top, width, height }`、`regionBox(id, L) → { left, top, width, height }`、`regionViews(regions, L) → [{ key, image, left, top, width, height, sign: { left, bottom, width, name, cost } }]`、`sceneryViews(opened, L)`（`buildScene` 的结果，多 `region`）、`flowerBeds(L)`、`shoreDecor(L)` → `[{ key, image, left, bottom, width, z }]`、`waves(L) → [{ key, left, top, width }]`、`tileFromTouch(x, y, rect, L)`、`placeChecker(opened)`、`openChecker(opened)`

- [ ] **Step 1: 写失败的测试** `test/world.test.js`（整份替换）

```js
const test = require('node:test')
const assert = require('node:assert/strict')
const W = require('../miniprogram/utils/world')
const { tileTop, tileCenter } = require('../miniprogram/utils/iso')

const L = W.islandLayout(375)
const REGIONS = [
  { id: 'center', name: '中间花园', cost: 0, unlocked: true },
  { id: 'pond', name: '荷塘角', cost: 200, unlocked: false },
  { id: 'bamboo', name: '竹林角', cost: 300, unlocked: true },
  { id: 'veg', name: '菜园角', cost: 400, unlocked: false },
  { id: 'tea', name: '茶亭角', cost: 500, unlocked: false },
]

test('islandLayout：1 倍时中间花园占屏幕宽 92%，四周一圈海', () => {
  assert.equal(L.size, 12)
  assert.ok(Math.abs(L.tileW * 6 - 375 * 0.92) < 1e-9)
  assert.equal(L.margin, 188)
  assert.equal(L.viewWidth, L.width + 376)
  assert.equal(L.viewHeight, L.height + 376)
})

test('centerOffset：小岛正中对准屏幕正中', () => {
  const o = W.centerOffset(L, 375, 700)
  const p = tileTop(6, 6, L)
  assert.ok(Math.abs(o.x + L.margin + p.x - 187.5) < 1e-9)
  assert.ok(Math.abs(o.y + L.margin + p.y - 350) < 1e-9)
  assert.equal(o.scale, 1)
})

test('islandView：底图盖住整座岛', () => {
  assert.deepEqual(W.islandView(L), { image: '/images/garden/island.png', left: 0, top: L.top, width: L.width, height: L.landHeight })
})

test('regionViews：没修整的角落有遮罩和木牌，横竖两种图', () => {
  const views = W.regionViews(REGIONS, L)
  assert.deepEqual(views.map((v) => v.key), ['pond', 'veg', 'tea'])
  const pond = views[0]
  assert.equal(pond.image, '/images/garden/locked-wide.png')
  assert.equal(views[1].image, '/images/garden/locked-tall.png')
  assert.equal(views[2].image, '/images/garden/locked-wide.png')
  assert.deepEqual([pond.sign.name, pond.sign.cost], ['荷塘角', 200])
  const box = W.regionBox('pond', L)
  const top = tileTop(3, 0, L)
  assert.ok(Math.abs(box.left - (top.x - 1.5 * L.tileW)) < 1e-9)
  assert.ok(Math.abs(box.width - 4.5 * L.tileW) < 1e-9)
  assert.equal(box.top, top.y)
  assert.ok(Math.abs(pond.left - box.left) < 1e-9)
  assert.ok(pond.top < box.top)
})

test('sceneryViews：只有修整好的角落有风景，放大的按 scale', () => {
  assert.deepEqual(W.sceneryViews(['center'], L), [])
  const pond = W.sceneryViews(['center', 'pond'], L)
  assert.deepEqual(pond.map((s) => s.itemId).sort(), ['koi_pond', 'lotus_pond'])
  assert.ok(Math.abs(pond.find((s) => s.itemId === 'lotus_pond').width - L.tileW * 1.5) < 1e-9)
  assert.ok(pond.every((s) => s.region === 'pond'))
})

test('flowerBeds、shoreDecor、waves：花坛和岛边铺满景色', () => {
  const beds = W.flowerBeds(L)
  assert.equal(beds.length, 28)
  assert.ok(beds.every((b) => /^\/images\/garden\/items\/\w+\.png$/.test(b.image) && Number.isInteger(b.z) && b.key))
  assert.equal(new Set(beds.filter((b) => b.key.endsWith('-0')).map((b) => b.image)).size, 4)
  const shore = W.shoreDecor(L)
  assert.equal(shore.length, 16)
  assert.ok(shore.every((s) => Number.isInteger(s.z)))
  assert.ok(W.waves(L).length >= 6)
})

test('tileFromTouch：拖动、缩放之后点到的还是那一格', () => {
  for (const scale of [0.5, 1, 1.5]) {
    const rect = { left: -300, top: -120, width: L.width * scale }
    const p = tileCenter(7, 4, L)
    assert.deepEqual(W.tileFromTouch(rect.left + p.x * scale, rect.top + p.y * scale, rect, L), { c: 7, r: 4 })
  }
  assert.equal(W.tileFromTouch(-5000, -5000, { left: 0, top: 0, width: L.width }, L), null)
})

test('placeChecker / openChecker', () => {
  const place = W.placeChecker(['center'])
  assert.equal(place(4, 4), true)
  assert.equal(place(6, 4), false)
  const open = W.openChecker(['center'])
  assert.equal(open(6, 4), true)
  assert.equal(open(1, 1), false)
})
```

`test/garden-life.test.js` 追加：

```js
test('站到放大的物件上：落脚点按 scale 算', () => {
  const placed = [{ uid: 's1', itemId: 'lotus_pond', c: 3, r: 3, scale: 1.5 }]
  const { clock, life, sprites } = setup({ placed, residents: ['crane'], random: () => 0.2 })
  life.start()
  let swim = null
  for (let i = 0; i < 120 && !swim; i++) {
    clock.advance(500)
    if (sprites[0].action === 'swim') swim = { ...sprites[0] }
  }
  assert.ok(swim, '没下水')
  const iw = L.tileW * 1.5
  const center = tileCenter(3, 3, L)
  assert.ok(Math.abs(swim.left + swim.width / 2 - (center.x - iw / 2 + A.PLAYS.lotus_pond.spot.x * iw)) < 0.01)
  life.stop()
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `node --test test/world.test.js test/garden-life.test.js`
Expected: FAIL

- [ ] **Step 3: 实现**

`garden-view.js` 的 `buildScene` 里 `const width = L.tileW * SIZE_SCALE[item.size]` 改成 `const width = L.tileW * (p.scale || SIZE_SCALE[item.size])`，返回对象里 `uid: p.uid,` 下面加 `region: p.region || '',`；注释改成「花园里摆的东西（和角落里的风景）：按前后顺序排…；scale 可以单独放大」。

`garden-life.js` 的 `sprite()` 里 `const iw = L.tileW * SIZE_SCALE[itemById(item.itemId).size]` 改成 `const iw = L.tileW * (item.scale || SIZE_SCALE[itemById(item.itemId).size])`。

`miniprogram/utils/world.js` 整份替换为：

```js
// 小岛后花园：布局尺寸、没修整角落的遮罩和木牌、风景、花坛和岛边的花草、海浪、屏幕点按 → 格子（纯函数，有单测）

const { ISLAND_SIZE, REGIONS, sceneryIn, tileOpen, tilePlaceable } = require('./shared/garden')
const { isoLayout, tileTop, tileAt } = require('./iso')
const { buildScene, itemImage } = require('./garden-view')

// 1 倍时中间花园（6 格宽）占屏幕宽度的比例；小岛外面一圈海占屏幕宽度的比例
const CENTER_SCREEN = 0.92
const MARGIN_SCREEN = 0.5
// 篱笆遮罩图在菱形上方留出的高度（格宽的比例），给篱笆柱子往上冒
const FENCE_UP = 0.6

function islandLayout(windowWidth) {
  const tileW = (windowWidth * CENTER_SCREEN) / 6
  const L = isoLayout(ISLAND_SIZE, tileW * ISLAND_SIZE)
  const margin = Math.round(windowWidth * MARGIN_SCREEN)
  return { ...L, margin, viewWidth: L.width + margin * 2, viewHeight: L.height + margin * 2 }
}

// movable-view 的位置：小岛正中对准屏幕正中
function centerOffset(L, windowWidth, windowHeight) {
  const p = tileTop(ISLAND_SIZE / 2, ISLAND_SIZE / 2, L)
  return { x: windowWidth / 2 - (L.margin + p.x), y: windowHeight / 2 - (L.margin + p.y), scale: 1 }
}

// 小岛底图：整座岛一张图，和 isoLayout 的格子位置对齐
function islandView(L) {
  return { image: '/images/garden/island.png', left: 0, top: L.top, width: L.width, height: L.landHeight }
}

// 一个分区的菱形在 #world 里的外框
function regionBox(id, L) {
  const [c0, r0, c1, r1] = REGIONS.find((g) => g.id === id).rect
  const w = c1 - c0
  const h = r1 - r0
  const top = tileTop(c0, r0, L)
  return { left: top.x - (h * L.tileW) / 2, top: top.y, width: ((w + h) * L.tileW) / 2, height: ((w + h) * L.tileH) / 2 }
}

// 没修整的角落：盖一张「篱笆 + 杂草」遮罩，中间立木牌。横着的（c 方向长）和竖着的各一张图
function regionViews(regions, L) {
  const signWidth = L.tileW * 1.5
  return regions
    .filter((g) => !g.unlocked)
    .map((g) => {
      const [c0, r0, c1, r1] = REGIONS.find((x) => x.id === g.id).rect
      const box = regionBox(g.id, L)
      const up = L.tileW * FENCE_UP
      const middle = tileTop((c0 + c1) / 2, (r0 + r1) / 2, L)
      return {
        key: g.id,
        image: c1 - c0 > r1 - r0 ? '/images/garden/locked-wide.png' : '/images/garden/locked-tall.png',
        left: box.left,
        top: box.top - up,
        width: box.width,
        height: box.height + up,
        sign: { left: middle.x - signWidth / 2, bottom: L.height - middle.y, width: signWidth, name: g.name, cost: g.cost },
      }
    })
}

function sceneryViews(opened, L) {
  return buildScene(sceneryIn(opened), L)
}

// 花草、小石头之类的景色：只是好看，不能点、不挡路；c、r 可以带小数
function decor(key, itemId, c, r, scale, L) {
  const p = tileTop(c, r, L)
  const width = L.tileW * scale
  return { key, image: itemImage(itemId), left: p.x - width / 2, bottom: L.height - p.y, width, z: Math.round((c + r) * 10 + c) }
}

// 四个花坛（3×3 的角）：每个一棵大树配六丛花草，位置是花坛里的相对格子坐标
const BEDS = [
  { c: 0, r: 0, tree: 'osmanthus' },
  { c: 9, r: 0, tree: 'orange_tree' },
  { c: 0, r: 9, tree: 'persimmon_tree' },
  { c: 9, r: 9, tree: 'plum_tree' },
]
const BED_PLANTS = [
  { dc: 1.2, dr: 1.2, itemId: '', scale: 1.25 },
  { dc: 2.3, dr: 0.8, itemId: 'chrysanthemum', scale: 0.7 },
  { dc: 0.8, dr: 2.3, itemId: 'daisy', scale: 0.7 },
  { dc: 2.0, dr: 2.0, itemId: 'sunflower', scale: 0.75 },
  { dc: 2.7, dr: 1.7, itemId: 'grass', scale: 0.55 },
  { dc: 1.7, dr: 2.7, itemId: 'dandelion', scale: 0.6 },
  { dc: 2.7, dr: 2.7, itemId: 'mushroom', scale: 0.5 },
]

function flowerBeds(L) {
  const plants = []
  BEDS.forEach((bed, i) => {
    BED_PLANTS.forEach((p, j) => {
      plants.push(decor(`bed-${i}-${j}`, p.itemId || bed.tree, bed.c + p.dc, bed.r + p.dr, p.scale, L))
    })
  })
  return plants
}

// 岛边一圈（只在花坛那几段，不压到能摆东西的地方）：小花草、小石头
const SHORE_ITEMS = ['pebbles', 'grass', 'daisy', 'mushroom']
function shoreDecor(L) {
  const spots = [0.6, 1.8, 10.2, 11.4]
  const edges = [
    (t) => [t, 0.25], // 右上边
    (t) => [0.25, t], // 左上边
    (t) => [ISLAND_SIZE - 0.25, t], // 右下边
    (t) => [t, ISLAND_SIZE - 0.25], // 左下边
  ]
  const out = []
  edges.forEach((edge, i) => {
    spots.forEach((t, j) => {
      const [c, r] = edge(t)
      out.push(decor(`shore-${i}-${j}`, SHORE_ITEMS[(i + j) % SHORE_ITEMS.length], c, r, 0.45, L))
    })
  })
  return out
}

// 海上的浪花：在 movable-view 里的位置（小岛外框四个角那片海上）
const WAVE_SPOTS = [[0.08, 0.1], [0.3, 0.05], [0.84, 0.08], [0.94, 0.42], [0.06, 0.55], [0.12, 0.9], [0.62, 0.95], [0.88, 0.86]]
function waves(L) {
  const width = L.tileW * 1.2
  return WAVE_SPOTS.map(([x, y], i) => ({ key: `wave-${i}`, left: x * L.viewWidth - width / 2, top: y * L.viewHeight, width }))
}

// 屏幕上的点 → 格子；rect 是 #world 此刻在屏幕上的位置和宽度（已经算上拖动和缩放）
function tileFromTouch(x, y, rect, L) {
  const scale = rect.width / L.width
  return tileAt((x - rect.left) / scale, (y - rect.top) / scale, L)
}

function placeChecker(opened) {
  return (c, r) => tilePlaceable(opened, c, r)
}

function openChecker(opened) {
  return (c, r) => tileOpen(opened, c, r)
}

module.exports = {
  islandLayout,
  centerOffset,
  islandView,
  regionBox,
  regionViews,
  sceneryViews,
  flowerBeds,
  shoreDecor,
  waves,
  tileFromTouch,
  placeChecker,
  openChecker,
}
```

- [ ] **Step 4: 跑测试**

Run: `node --test test/world.test.js test/garden-life.test.js test/garden-view.test.js`
Expected: PASS

- [ ] **Step 5: 提交（本地）**

```bash
for f in miniprogram/utils/world.js miniprogram/utils/garden-view.js miniprogram/utils/garden-life.js; do node --check $f; done
git add miniprogram/utils test/world.test.js test/garden-life.test.js
git commit -m "feat(garden): island layout, locked-corner overlays, scenery and flower beds

<trailer>"
```

---

### Task 3: 小岛的图：底图、篱笆遮罩、布局草图

**Files:**
- Modify: `scripts/draw-images.py`
- Create（生成）：`miniprogram/images/garden/island.png`、`locked-wide.png`、`locked-tall.png`、`art/guide/island-layout.png`
- Delete: `miniprogram/images/garden/plot-open.png`、`plot-wild.png`、`decor-cloud.png`、`decor-deadtree.png`、`decor-deadbush.png`

**Interfaces:**
- Produces: Task 2 引用的 `island.png`、`locked-wide.png`、`locked-tall.png`（`locked-tall` 是 `locked-wide` 左右镜像）；几何和 `isoLayout(12, …)` 一致：格宽 = 宽 / 12，格高 = 格宽 / 2，侧面厚 = 格高 × 0.4；遮罩图宽 = 4.5 格宽、高 = 2.25 格宽 + 0.6 格宽

- [ ] **Step 1: 改 `draw-images.py`**

1. 删除 `draw_plot`、`draw_cloud`、`draw_dead_tree`、`draw_dead_bush` 四个函数，以及 `draw_garden` 里对应的调用和「小岛外面的枯树、枯灌木」那个循环；`BARK`、`BARK_DARK`、`DRY_SOIL`、`DRY_LEAF` 常量删除（`WILD`、`WILD_DARK`、`WEED`、`STONE` 保留）。
2. `draw_hint` 前面加：

```python
ISLAND = 12
SAND = (240, 224, 184)
SAND_DARK = (222, 200, 152)
PATH_STONE = (230, 218, 194)
PATH_EDGE = (198, 184, 158)
BED_SOIL = (118, 160, 86)
BED_EDGE = (176, 150, 112)


def draw_island():
    """整座小岛的底图：草地、十字石板路、四个花坛的底色、沙滩边、悬崖土边。和 utils/world.js 的 islandView 对齐"""
    W = 1440 * 2
    tw = W / ISLAND
    th = tw / 2
    depth = th * 0.4
    H = int(ISLAND * th + depth) + 2
    img = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    top = lambda c, r: (W / 2 + (c - r) * tw / 2, (c + r) * th / 2)
    quad = lambda c0, r0, c1, r1: [top(c0, r0), top(c1, r0), top(c1, r1), top(c0, r1)]
    left, bottom, right = top(0, ISLAND), top(ISLAND, ISLAND), top(ISLAND, 0)
    # 悬崖土边，上面一圈沙滩
    d.polygon([left, bottom, (bottom[0], bottom[1] + depth), (left[0], left[1] + depth)], fill=SOIL_LEFT)
    d.polygon([bottom, right, (right[0], right[1] + depth), (bottom[0], bottom[1] + depth)], fill=SOIL_RIGHT)
    rim = depth * 0.45
    d.polygon([left, bottom, (bottom[0], bottom[1] + rim), (left[0], left[1] + rim)], fill=SAND)
    d.polygon([bottom, right, (right[0], right[1] + rim), (bottom[0], bottom[1] + rim)], fill=SAND_DARK)
    # 草地：一整片，深浅斑驳，不画格子
    d.polygon(quad(0, 0, ISLAND, ISLAND), fill=GRASS)
    layer = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    ld = ImageDraw.Draw(layer)
    rnd = random.Random(12)
    for _ in range(320):
        c, r = rnd.uniform(0.3, ISLAND - 0.3), rnd.uniform(0.3, ISLAND - 0.3)
        x, y = top(c, r)
        rx = rnd.uniform(0.3, 0.9) * tw
        color = shade(GRASS, 0.93) if rnd.random() < 0.5 else tint(GRASS, 0.12)
        ld.ellipse([x - rx, y - rx / 2, x + rx, y + rx / 2], fill=color + (70,))
    img.alpha_composite(layer)
    d = ImageDraw.Draw(img)
    # 四个花坛：深一点的土色，围一圈浅边
    for c0, r0 in ((0, 0), (9, 0), (0, 9), (9, 9)):
        d.polygon(quad(c0 + 0.2, r0 + 0.2, c0 + 2.8, r0 + 2.8), fill=BED_SOIL, outline=BED_EDGE, width=10)
    # 十字石板路：c = 6 一列、r = 6 一行（花坛里没有）
    path_tiles = {(6, i) for i in range(ISLAND)} | {(i, 6) for i in range(ISLAND)}
    for c, r in sorted(path_tiles):
        d.polygon(quad(c + 0.04, r + 0.04, c + 0.96, r + 0.96), fill=PATH_STONE)
        for _ in range(3):
            sc, sr = c + rnd.uniform(0.25, 0.75), r + rnd.uniform(0.25, 0.75)
            x, y = top(sc, sr)
            rx = rnd.uniform(0.12, 0.2) * tw
            d.ellipse([x - rx, y - rx / 2, x + rx, y + rx / 2], fill=tint(PATH_STONE, 0.3), outline=PATH_EDGE, width=5)
    # 草的小笔触
    for _ in range(ISLAND * ISLAND * 3):
        c, r = rnd.uniform(0.2, ISLAND - 0.2), rnd.uniform(0.2, ISLAND - 0.2)
        if (int(c), int(r)) in path_tiles:
            continue
        x, y = top(c, r)
        d.line([(x, y), (x + 3, y - 12)], fill=GRASS_DARK, width=5)
    img = img.resize((W // 2, H // 2), Image.LANCZOS)
    save_small(img, 'garden', 'island.png')


def draw_locked():
    """没修整的角落遮罩：杂草地 + 一圈篱笆。横着的（c 方向 6 格、r 方向 3 格）画一张，竖着的是它的镜像"""
    w, h = 6, 3
    tw = 480
    th = tw / 2
    up = tw * 0.6
    W = int((w + h) * tw / 2)
    H = int((w + h) * th / 2 + up) + 2
    img = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    x0 = h * tw / 2
    top = lambda c, r: (x0 + (c - r) * tw / 2, up + (c + r) * th / 2)
    rnd = random.Random(21)
    post_h = th * 0.9

    def fence(a, b):
        (ca, ra), (cb, rb) = a, b
        n = int(max(abs(cb - ca), abs(rb - ra)) / 0.75) + 1
        points = [top(ca + (cb - ca) * k / n, ra + (rb - ra) * k / n) for k in range(n + 1)]
        for frac in (0.35, 0.72):
            d.line([(x, y - post_h * frac) for x, y in points], fill=(150, 108, 66), width=14)
        for x, y in points:
            d.rounded_rectangle([x - 12, y - post_h, x + 12, y + 6], radius=8, fill=(126, 88, 52))

    d.polygon([top(0, 0), top(w, 0), top(w, h), top(0, h)], fill=WILD)
    fence((0, 0), (w, 0))
    fence((0, 0), (0, h))
    for _ in range(26):
        c, r = rnd.uniform(0.3, w - 0.3), rnd.uniform(0.3, h - 0.3)
        x, y = top(c, r)
        rx = rnd.uniform(14, 28)
        d.ellipse([x - rx, y - rx / 2, x + rx, y + rx / 2], fill=rnd.choice(STONE))
    for _ in range(320):
        c, r = rnd.uniform(0.1, w - 0.1), rnd.uniform(0.1, h - 0.1)
        x, y = top(c, r)
        color = rnd.choice(WEED)
        hgt = rnd.uniform(26, 56)
        for dx in (-10, 0, 10):
            d.line([(x, y), (x + dx * 1.6 + rnd.uniform(-6, 6), y - hgt)], fill=color, width=7)
    fence((w, 0), (w, h))
    fence((0, h), (w, h))
    img = img.resize((W // 2, H // 2), Image.LANCZOS)
    save_small(img, 'garden', 'locked-wide.png')
    save_small(img.transpose(Image.FLIP_LEFT_RIGHT), 'garden', 'locked-tall.png')
```

3. `draw_garden` 开头改成：

```python
    draw_island()
    draw_locked()
    draw_hint()
    draw_sign()
```

4. 加草图（给 Codex 的参照，不进小程序）：

```python
GUIDE_COLORS = {
    'center': (196, 228, 160), 'pond': (176, 214, 236), 'bamboo': (170, 214, 150),
    'veg': (232, 214, 150), 'tea': (230, 196, 196),
}


def draw_guide():
    """art/guide/island-layout.png：小岛布局草图（分区、小路、花坛、风景位置），交给 Codex 照着画精致底图"""
    regions = json.loads(subprocess.check_output(
        ['node', '-e', "const g=require('./cloudfunctions/api/lib/shared/garden');console.log(JSON.stringify({regions:g.REGIONS,scenery:g.SCENERY}))"],
        cwd=REPO))
    W = 1600
    tw = W / ISLAND
    th = tw / 2
    H = int(ISLAND * th) + 200
    img = Image.new('RGB', (W, H), (150, 200, 230))
    d = ImageDraw.Draw(img)
    top = lambda c, r: (W / 2 + (c - r) * tw / 2, 100 + (c + r) * th / 2)
    quad = lambda c0, r0, c1, r1: [top(c0, r0), top(c1, r0), top(c1, r1), top(c0, r1)]
    d.polygon(quad(0, 0, ISLAND, ISLAND), fill=(120, 170, 90))
    for g in regions['regions']:
        c0, r0, c1, r1 = g['rect']
        d.polygon(quad(c0, r0, c1, r1), fill=GUIDE_COLORS[g['id']], outline=(80, 80, 80), width=3)
        x, y = top((c0 + c1) / 2, (r0 + r1) / 2)
        d.text((x - 30, y - 8), g['id'].upper(), fill=(40, 40, 40))
    for i in range(ISLAND):
        for c, r in ((6, i), (i, 6)):
            d.polygon(quad(c + 0.1, r + 0.1, c + 0.9, r + 0.9), fill=(235, 225, 200))
    for s in regions['scenery']:
        x, y = top(s['c'] + 0.5, s['r'] + 0.5)
        d.ellipse([x - 14, y - 9, x + 14, y + 9], fill=(200, 60, 60))
        d.text((x + 16, y - 8), s['itemId'], fill=(40, 40, 40))
    path = os.path.join(REPO, 'art', 'guide', 'island-layout.png')
    os.makedirs(os.path.dirname(path), exist_ok=True)
    img.save(path, optimize=True)
```

`__main__` 末尾（`draw_garden(...)` 之后）加 `draw_guide()`。

- [ ] **Step 2: 生成、删旧图、检查**

```bash
git rm -q miniprogram/images/garden/plot-open.png miniprogram/images/garden/plot-wild.png miniprogram/images/garden/decor-cloud.png miniprogram/images/garden/decor-deadtree.png miniprogram/images/garden/decor-deadbush.png
python3 scripts/draw-images.py
ls -la miniprogram/images/garden/island.png miniprogram/images/garden/locked-*.png art/guide/island-layout.png
du -sh miniprogram
```

Expected：4 张新图；`miniprogram` < 2MB。用 Read 看 `island.png`（草地、十字路、四个花坛、沙滩边）和 `locked-wide.png`（杂草 + 一圈篱笆）。

- [ ] **Step 3: 提交（本地）**

```bash
python3 -c "import ast; ast.parse(open('scripts/draw-images.py').read())"
git add -A && git commit -m "feat(garden): island base map, locked-corner overlays and a layout guide

<trailer>"
```

---

### Task 4: 花园做首页：新布局、大打卡按钮、修整角落

**Files:**
- Modify: `miniprogram/pages/garden/garden.js`、`garden.wxml`、`garden.wxss`
- Modify: `miniprogram/app.json`（页面和 tabBar 顺序、「花园」）、`miniprogram/pages/meal/meal.wxml`（「回到花园」「去花园看看」）、`miniprogram/utils/animals.js`（搬家台词「搬进花园啦」）
- Test: `test/pages.test.js`、`test/animals.test.js`、`test/garden-view.test.js`

**Interfaces:**
- Consumes: Task 1 的 `garden.get`（`regions`、`scenery`、`hasProfile`、`daily`）、`garden.unlock`；Task 2 的 world.js；`beansCard`（view.js）
- Produces: 页面 data `island`、`regions`（遮罩视图）、`scenery`、`beds`、`shore`、`waves`、`daily`、`canSpin`；方法 `goCheckin`、`tapSign`（`data-key` 是分区 id）

- [ ] **Step 1: 写失败的测试**

`test/animals.test.js`、`test/garden-view.test.js`、`test/pages.test.js` 里所有 `搬进庭院啦` 改成 `搬进花园啦`。

`test/pages.test.js`：
1. 「养生庭院页面：…」整个替换为：

```js
test('小岛花园：首页、今日暖豆、扭蛋、背包摆放、各种不能摆、移动、收回、修整角落、回到中间、去打卡', async () => {
  const green = analysisJson({ rating: 'green' })
  const cloud = createFakeCloud({ replies: [green, green] })
  const { main } = loadCloudFunction(cloud)
  const wx = createWx(main)
  await main({ action: 'profile.save', data: { nickname: '妈妈', sex: 'female', age: 50, heightCm: 160, weightKg: 70, targetWeightKg: 60, activity: 'light' } })
  await main({ action: 'meal.analyze', data: { mealType: 'breakfast', note: '粥' } })
  await main({ action: 'meal.analyze', data: { mealType: 'lunch', note: '面' } })

  const garden = loadPage('garden', wx)
  garden.onLoad()
  garden.onShow()
  await settle()
  assert.equal(garden.data.welcome.beans, 60)
  assert.equal(garden.data.beans, 80)
  assert.equal(garden.data.canSpin, true)
  assert.equal(garden.data.daily.title, '今天得了 20 暖豆')
  assert.deepEqual(garden.data.daily.stamps.map((s) => s.cls), ['stamp-green', 'stamp-green', 'stamp-none'])
  assert.equal(garden.data.island.image, '/images/garden/island.png')
  assert.deepEqual(garden.data.regions.map((g) => g.key), ['pond', 'bamboo', 'veg', 'tea'])
  assert.deepEqual(garden.data.scenery, [])
  assert.equal(garden.data.beds.length, 28)
  assert.equal(garden.data.shore.length, 16)
  assert.ok(garden.data.waves.length > 0)
  assert.deepEqual([garden.data.sprites[0].c, garden.data.sprites[0].r], [4, 4])
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
  // 中间花园 36 格 − 十字小路 11 格 − 大树 1 格
  assert.equal(garden.data.hints.length, 24)
  wx.worldRect = { left: -420, top: -260, width: garden.L.width * 0.8 }
  const tap = (c, r) => {
    const p = tileCenter(c, r, garden.L)
    return { changedTouches: [{ clientX: wx.worldRect.left + p.x * 0.8, clientY: wx.worldRect.top + p.y * 0.8 }] }
  }
  garden.tapLand(tap(4, 4))
  assert.equal(wx.log.toasts.pop(), '这块地上已经有东西了')
  garden.tapLand(tap(6, 4))
  assert.equal(wx.log.toasts.pop(), '小路上不能摆东西')
  garden.tapLand(tap(4, 1))
  assert.equal(wx.log.toasts.pop(), '这块地还没修整呢')
  garden.tapLand(tap(1, 1))
  assert.equal(wx.log.toasts.pop(), '这里是花坛，不能摆')
  garden.tapLand(tap(3, 3))
  await settle()
  assert.equal(garden.data.mode, 'view')
  const uid = garden.data.sprites.find((x) => x.itemId === itemId).uid

  wx.actionSheetChoice = 0
  garden.tapSprite(event({ uid }))
  garden.tapLand(tap(8, 8))
  await settle()
  assert.deepEqual((({ c, r }) => [c, r])(garden.data.sprites.find((x) => x.uid === uid)), [8, 8])
  wx.actionSheetChoice = 1
  garden.tapSprite(event({ uid }))
  await settle()
  assert.match(wx.log.toasts.pop(), /收进背包了/)

  // 修整荷塘角：豆不够先提示；攒够了确认后，风景出现、小动物开始张望
  garden.tapSign(event({ key: 'pond' }))
  assert.equal(wx.log.toasts.pop(), '修整要 200 暖豆，再攒攒')
  const doc = cloud.db.collections.get('gardens').get('u1')
  cloud.db.collections.get('gardens').set('u1', { ...doc, beans: { ...doc.beans, bonus: doc.beans.bonus + 300 } })
  garden.onShow()
  await settle()
  assert.equal(garden.data.beans, 350)
  garden.tapSign(event({ key: 'pond' }))
  await settle()
  assert.match(wx.log.modals.pop(), /花 200 暖豆修整荷塘角/)
  assert.deepEqual(garden.data.regions.map((g) => g.key), ['bamboo', 'veg', 'tea'])
  assert.deepEqual(garden.data.scenery.map((s) => s.itemId).sort(), ['koi_pond', 'lotus_pond'])
  assert.equal(garden.data.beans, 150)
  assert.equal(garden.data.justOpened, 'pond')
  assert.equal(wx.log.toasts.pop(), '荷塘角修整好啦！')
  assert.equal(garden.data.waitingText, '👀 有小动物在院子外张望…下次打卡它就来了')

  const before = garden.data.view
  garden.recenter()
  assert.notDeepEqual(garden.data.view, before)

  garden.goCheckin()
  assert.deepEqual(wx.log.nav.pop(), ['navigateTo', '/pages/checkin/checkin'])
  garden.onUnload()
})

test('花园首页：还没建档时先去建档', async () => {
  const cloud = createFakeCloud({ replies: [] })
  const { main } = loadCloudFunction(cloud)
  const wx = createWx(main)
  const garden = loadPage('garden', wx)
  garden.onLoad()
  garden.onShow()
  await settle()
  assert.deepEqual(wx.log.nav.pop(), ['switchTab', '/pages/profile/profile'])
  garden.onUnload()
})
```

2. 小动物页面测试里翠竹 `c: 6, r: 6` 改成 `c: 3, r: 4`。
3. 完整流程测试里结果页那段（`meal.goGarden` 之前若有 `backToToday` 的断言保持不变），在 `// 4. 详情页` 后加一行 `assert.ok(readWxml('meal').includes('回到花园'))`。

- [ ] **Step 2: 跑测试确认失败**

Run: `node --test test/pages.test.js test/animals.test.js test/garden-view.test.js`
Expected: FAIL

- [ ] **Step 3: 文案与导航**

`miniprogram/utils/animals.js`：所有 `搬进庭院啦` → `搬进花园啦`。

`miniprogram/app.json`：`pages` 数组第一项改成 `"pages/garden/garden"`、第二项 `"pages/today/today"`；`tabBar.list` 改成花园、今日、体重、我的的顺序，花园那项 `"text": "花园"`（图标不变：`images/tab-forest.png` / `images/tab-forest-on.png`）。

`miniprogram/pages/meal/meal.wxml`：`去庭院看看 ›` → `去花园看看 ›`；底部 `<button class="btn-plain" bindtap="backToToday">回到今日</button>` → `<button class="btn-plain" bindtap="goGarden">回到花园</button>`（`backToToday` 仍给「删除」用）。

- [ ] **Step 4: `garden.js`**（整份替换）

```js
const api = require('../../utils/api')
const W = require('../../utils/world')
const { buildScene, inventoryList, hintTiles } = require('../../utils/garden-view')
const { beansCard } = require('../../utils/view')
const { itemById, placeProblem } = require('../../utils/shared/garden')
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
    island: null,
    waves: [],
    beds: [],
    shore: [],
    regions: [],
    scenery: [],
    sprites: [],
    animals: [],
    inventory: [],
    bagCount: 0,
    bagOpen: false,
    mode: 'view', // view 看 / place 从背包摆放 / move 移动已摆的
    selectedName: '',
    hints: [],
    justOpened: '',
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

  load() {
    return api.call('garden.get', { markSeen: true })
      .then((view) => {
        // 花园是首页：第一次用、还没建档，先去建档
        if (!view.hasProfile) {
          wx.switchTab({ url: '/pages/profile/profile' })
          return
        }
        this.setData({ justOpened: '' })
        this.render(view, true)
      })
      .catch((err) => api.showError(err))
  },

  render(view, fresh) {
    const info = windowInfo()
    if (!this.L) this.L = W.islandLayout(info.windowWidth || 375)
    const L = this.L
    this.garden = view
    this.opened = view.regions.filter((g) => g.unlocked).map((g) => g.id)
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
      island: W.islandView(L),
      regions: W.regionViews(view.regions, L),
      scenery: W.sceneryViews(this.opened, L),
      sprites: buildScene(view.placed, L),
      inventory,
      bagCount: inventory.reduce((sum, i) => sum + i.count, 0),
      welcome: view.welcome || this.data.welcome,
      hints: this.data.mode === 'view' ? [] : this.data.hints,
    }
    // 摆放、移动之后的结果里没有 daily，沿用上次的
    if (view.daily !== undefined) patch.daily = beansCard(view.daily)
    // 花坛、岛边、海浪只算一次
    if (!this.data.beds.length) {
      patch.beds = W.flowerBeds(L)
      patch.shore = W.shoreDecor(L)
      patch.waves = W.waves(L)
    }
    // 第一次进来把小岛正中摆到屏幕正中；之后保留拖到的位置
    if (!this.centered) {
      patch.view = W.centerOffset(L, info.windowWidth || 375, info.windowHeight || 667)
      this.centered = true
    }
    this.setData(patch)
    this.syncLife(view, fresh)
    if (view.testGift) {
      wx.showModal({ title: '测试福利', content: `送你 ${view.testGift} 暖豆，修整角落、扭蛋随便试试`, showCancel: false, confirmText: '好的' })
    }
  },

  // movable-view 只在 x / y / scale-value 的值变了才会动：每次换一点点不同的小数
  recenter() {
    const info = windowInfo()
    const center = W.centerOffset(this.L, info.windowWidth || 375, info.windowHeight || 667)
    this.nudge = !this.nudge
    const d = this.nudge ? 0.01 : 0
    this.setData({ view: { x: center.x + d, y: center.y + d, scale: 1 + d / 100 } })
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
      hints: hintTiles(this.garden.placed, this.L, null, W.placeChecker(this.opened)),
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
          this.selected = { type: 'move', uid }
          this.setData({ mode: 'move', selectedName: sprite.name, hints: hintTiles(this.garden.placed, this.L, uid, W.placeChecker(this.opened)) })
          if (this.life) this.life.pause()
        } else if (res.tapIndex === 1) {
          this.save('garden.stash', { uid }, `${sprite.name}收进背包了`)
        }
      },
    })
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
        const problem = placeProblem(this.opened, this.garden.placed, tile.c, tile.r, sel.type === 'move' ? sel.uid : undefined)
        if (problem) {
          wx.showToast({ title: problem, icon: 'none' })
          return
        }
        if (sel.type === 'place') this.save('garden.place', { itemId: sel.itemId, c: tile.c, r: tile.r })
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
    this.setData({ mode: 'view', selectedName: '', hints: [] })
    if (this.life) this.life.resume()
  },

  // ---------------------------------------------------------------- 修整角落

  tapSign(e) {
    const { key } = e.currentTarget.dataset
    const region = this.garden && this.garden.regions.find((g) => g.id === key)
    if (this.data.mode !== 'view' || !region || region.unlocked) return
    if (this.data.beans < region.cost) {
      wx.showToast({ title: `修整要 ${region.cost} 暖豆，再攒攒`, icon: 'none' })
      return
    }
    wx.showModal({
      title: '修整角落',
      content: `花 ${region.cost} 暖豆修整${region.name}？`,
      confirmText: '修整',
      success: (res) => {
        if (!res.confirm) return
        api.call('garden.unlock', { region: key })
          .then((view) => {
            this.setData({ justOpened: key })
            this.render(view, true)
            wx.showToast({ title: `${region.name}修整好啦！`, icon: 'none' })
          })
          .catch((err) => api.showError(err))
      },
    })
  },

  // ---------------------------------------------------------------- 小动物

  // 刚进页面、修整角落之后重新安排；摆放、移动之后只告诉它们东西变了。角落里的风景也当作东西：挡路、能玩
  syncLife(view, fresh) {
    const things = view.placed.concat(view.scenery || [])
    if (this.life && !fresh) {
      this.life.updatePlaced(things)
      return
    }
    this.stopLife()
    this.life = createLife({
      L: this.L,
      placed: things,
      residents: view.residents || [],
      arrivals: view.arrivals || [],
      open: W.openChecker(this.opened),
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

- [ ] **Step 5: `garden.wxml`**（整份替换）

```xml
<view class="screen">
  <view wx:if="{{!loaded}}" class="loading">正在推开花园的门…</view>

  <movable-area wx:if="{{loaded}}" class="map-area">
    <movable-view class="map" direction="all" inertia out-of-bounds="{{false}}" scale scale-min="0.5" scale-max="1.5" scale-value="{{view.scale}}" x="{{view.x}}" y="{{view.y}}" style="width: {{world.viewWidth}}px; height: {{world.viewHeight}}px">
      <view wx:for="{{waves}}" wx:key="key" class="wave" style="left: {{item.left}}px; top: {{item.top}}px; width: {{item.width}}px"></view>
      <view id="world" class="world" style="left: {{world.margin}}px; top: {{world.margin}}px; width: {{world.width}}px; height: {{world.height}}px" bindtap="tapLand">
        <image class="island" src="{{island.image}}" style="left: {{island.left}}px; top: {{island.top}}px; width: {{island.width}}px; height: {{island.height}}px" />
        <image wx:for="{{regions}}" wx:key="key" class="locked" src="{{item.image}}" style="left: {{item.left}}px; top: {{item.top}}px; width: {{item.width}}px; height: {{item.height}}px" />
        <block wx:for="{{regions}}" wx:key="key">
          <view class="sign" style="left: {{item.sign.left}}px; bottom: {{item.sign.bottom}}px; width: {{item.sign.width}}px" data-key="{{item.key}}" catchtap="tapSign">
            <image class="sign-img" src="/images/garden/sign.png" mode="widthFix" />
            <view class="sign-text">修整{{item.sign.name}}<text class="sign-cost">{{item.sign.cost}} 暖豆</text></view>
          </view>
        </block>
        <image wx:for="{{hints}}" wx:key="key" class="hint" src="/images/garden/tile-hint.png" style="left: {{item.left}}px; top: {{item.top}}px; width: {{item.width}}px; height: {{item.height}}px" />
        <image wx:for="{{beds}}" wx:key="key" class="plant" src="{{item.image}}" mode="widthFix" style="left: {{item.left}}px; bottom: {{item.bottom}}px; width: {{item.width}}px; z-index: {{item.z + 10}}" />
        <image wx:for="{{shore}}" wx:key="key" class="plant" src="{{item.image}}" mode="widthFix" style="left: {{item.left}}px; bottom: {{item.bottom}}px; width: {{item.width}}px; z-index: {{item.z + 10}}" />
        <image wx:for="{{scenery}}" wx:key="uid" class="sprite plant {{item.region === justOpened ? 'scenery-new' : ''}}" src="{{item.image}}" mode="widthFix" style="left: {{item.left}}px; bottom: {{item.bottom}}px; width: {{item.width}}px; z-index: {{item.z + 10}}" />
        <image wx:for="{{sprites}}" wx:key="uid" class="sprite {{mode === 'view' ? '' : 'sprite-ghost'}}" src="{{item.image}}" mode="widthFix" data-uid="{{item.uid}}" catchtap="tapSprite" style="left: {{item.left}}px; bottom: {{item.bottom}}px; width: {{item.width}}px; z-index: {{item.z + 10}}" />
        <view wx:for="{{animals}}" wx:key="id" class="animal {{mode === 'view' ? '' : 'animal-ghost'}}" style="left: {{item.left}}px; bottom: {{item.bottom}}px; width: {{item.width}}px; z-index: {{item.z + 10}}; transition-duration: {{item.duration}}ms" data-index="{{index}}" catchtap="tapAnimal">
          <view wx:if="{{item.bubble}}" class="bubble" style="width: {{item.bubbleWidth}}px; left: {{item.bubbleLeft}}px; bottom: {{item.bubbleBottom}}px">{{item.bubble}}</view>
          <view wx:if="{{item.emoji}}" class="act-emoji">{{item.emoji}}</view>
          <view wx:if="{{item.tapping}}" class="heart">❤️</view>
          <view class="animal-body {{item.flip ? 'flip' : ''}} {{item.action === 'swim' ? 'in-water' : ''}}" style="height: {{item.bodyHeight}}px">
            <image class="animal-img act-{{item.action}} {{item.id === 'duck' && item.action === 'swim' ? 'paddle' : ''}} {{item.tapping ? 'tap' : ''}}" src="{{item.image}}" mode="widthFix" />
          </view>
          <view wx:if="{{item.action === 'swim'}}" class="ripple"></view>
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
      <button class="btn-plain btn-small" bindtap="cancel">取消</button>
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
  </block>

  <view wx:if="{{welcome}}" class="overlay" catchtap="closeWelcome">
    <view class="welcome" catchtap="noop">
      <image class="welcome-gift" src="/images/garden/ui/gift.png" mode="aspectFit" />
      <view class="welcome-title">欢迎来到你的养生花园！</view>
      <view class="welcome-text">送你 {{welcome.beans}} 暖豆，还在花园里种了一棵大树。每天好好吃饭攒暖豆，扭蛋抽花草，摆对东西小动物会搬来；暖豆攒多了还能修整四个角落～</view>
      <button class="btn-primary" bindtap="goGacha">去扭蛋</button>
      <view class="link link-muted welcome-later" bindtap="closeWelcome">先看看</view>
    </view>
  </view>
</view>
```

- [ ] **Step 6: `garden.wxss`**

1. `.screen` 的 `background` 改成海：`background: linear-gradient(180deg, #b9e3f2 0%, #a3d6ea 55%, #8fcbe2 100%);`
2. 删除 `.plot`、`.plot-new`、`@keyframes plot-in`、`.decor`、`.decor-cloud`、`@keyframes drift`、`.dust`、`.puff*`、`@keyframes puff`、`.hud-beans`、`.recenter` 之外的 `.dock`、`.dock-btn`、`.dock-main`、`.dock-icon` 规则（`.badge`、`.recenter`、`.recenter-icon` 保留）。
3. 追加：

```css
.island,
.locked {
  position: absolute;
}

.island {
  z-index: 1;
}

.locked {
  z-index: 3;
}

.plant {
  position: absolute;
  pointer-events: none;
}

/* 修整好的角落：风景一个个蹦出来 */
.scenery-new {
  animation: pop-in 0.8s cubic-bezier(0.3, 1.6, 0.5, 1);
}

@keyframes pop-in {
  0% {
    transform: scale(0.2);
    opacity: 0;
  }
  100% {
    transform: scale(1);
    opacity: 1;
  }
}

/* 海上的浪花 */
.wave {
  position: absolute;
  height: 16rpx;
  border-top: 4rpx solid rgba(255, 255, 255, 0.7);
  border-radius: 50%;
  animation: wave 4s ease-in-out infinite alternate;
}

@keyframes wave {
  0% {
    transform: translateX(-10%);
    opacity: 0.5;
  }
  100% {
    transform: translateX(10%);
    opacity: 1;
  }
}

/* 左上角：游戏风的暖豆资源条 + 今天的暖豆和印章 */
.hud-res {
  position: absolute;
  left: 24rpx;
  z-index: 50;
  display: flex;
  align-items: center;
  min-width: 200rpx;
  padding: 0 28rpx 0 6rpx;
  box-sizing: border-box;
  border: 4rpx solid #ffffff;
  border-radius: 40rpx;
  background: linear-gradient(180deg, #3577c0 0%, #1d4f8a 100%);
  box-shadow: 0 6rpx 0 rgba(20, 50, 90, 0.35);
}

.res-icon {
  width: 60rpx;
  height: 60rpx;
}

.res-num {
  flex: 1;
  text-align: center;
  font-size: 38rpx;
  font-weight: 800;
  color: #ffffff;
}

.hud-today {
  position: absolute;
  left: 24rpx;
  z-index: 50;
  display: flex;
  align-items: center;
  gap: 10rpx;
  padding: 6rpx 16rpx;
  border-radius: 24rpx;
  background: rgba(255, 255, 255, 0.92);
}

.hud-today-text {
  font-size: 24rpx;
  font-weight: 700;
  color: #b8763a;
}

.stamps-mini {
  gap: 4rpx;
  margin: 0;
}

.stamps-mini .stamp {
  width: 36rpx;
  height: 36rpx;
  font-size: 20rpx;
}

/* 左右两列圆按钮 */
.side {
  position: absolute;
  top: 36%;
  z-index: 50;
  display: flex;
  flex-direction: column;
  gap: 24rpx;
}

.side-left {
  left: 20rpx;
}

.side-right {
  right: 20rpx;
}

.side-btn {
  position: relative;
  width: 120rpx;
  height: 120rpx;
  border-radius: 50%;
  border: 4rpx solid #ffffff;
  background: linear-gradient(180deg, #fff8ec 0%, #ffe9c7 100%);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  box-shadow: 0 6rpx 0 rgba(150, 100, 40, 0.25);
}

.side-icon {
  width: 70rpx;
  height: 70rpx;
}

.side-label {
  font-size: 22rpx;
  font-weight: 800;
  color: #8a4f1a;
  margin-top: -4rpx;
}

.dot {
  position: absolute;
  top: 4rpx;
  right: 8rpx;
  width: 22rpx;
  height: 22rpx;
  border-radius: 50%;
  background: #e8553b;
  border: 3rpx solid #ffffff;
}

/* 底部大打卡按钮 */
.checkin-btn {
  position: absolute;
  left: 50%;
  bottom: 36rpx;
  z-index: 50;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 12rpx;
  padding: 26rpx 56rpx;
  border-radius: 60rpx;
  border: 5rpx solid #ffffff;
  background: linear-gradient(180deg, #6fcf5a 0%, #3e9a3a 100%);
  box-shadow: 0 8rpx 0 #2c6e2a;
  color: #ffffff;
  font-size: 40rpx;
  font-weight: 800;
  white-space: nowrap;
}

.checkin-icon {
  font-size: 44rpx;
}
```

4. `.recenter` 的 `bottom: 220rpx` 改成 `bottom: 52rpx`、`right: 24rpx` 改成 `left: 24rpx`（并删掉 `right`）。

- [ ] **Step 7: 跑测试并提交、推送**

```bash
npm test 2>&1 | grep -E "^# (pass|fail)|^not ok"
node --check miniprogram/pages/garden/garden.js && node --check miniprogram/utils/animals.js
git add -A && git commit -m "feat(garden): island garden as the home tab with a big check-in button

<trailer>"
git push -u origin claude/mini-program-dev-nzn2n0
```

Expected：全部 PASS。

---

### Task 5: 截图检查、出图说明、文档、部署

**Files:**
- Create: `docs/art/garden-island-art-brief.md`；Delete: `docs/art/garden-map-art-brief.md`
- Modify: `README.md`、`CLAUDE.md`、`docs/superpowers/specs/2026-10-23-island-garden-design.md`（状态改「已确认」）
- Modify（不进仓库）：scratchpad 的 `preview/shoot-map.js`（用 `opened` 代替 `plots`、坐标换到小岛上、`garden.unlock`）

- [ ] **Step 1: 截图**：首屏 1 倍、缩到 0.5 看全岛、修整一个角落之后、摆放模式、背包抽屉；看：底图与格子对齐、遮罩盖住角落且篱笆位置对、木牌字在板上、花坛花草不挡能摆的地、按钮不挡胶囊、大按钮在 tab 栏上面。按需要调 `world.js` 的 `BED_PLANTS` / `FENCE_UP`、`.sign-text` 的 `top`。

- [ ] **Step 2: 出图说明** `docs/art/garden-island-art-brief.md`：说明附上的 `art/guide/island-layout.png` 是布局草图；第 1 张「小岛底图」（1536×1024，照草图画：海、沙滩、悬崖、草地、十字石板路、四个花坛种满花草树木，四个角落只画平整的空草地；俯视角度和格子比例与草图一致）；第 2 张 3×3：荷塘、锦鲤小池、竹丛、石灯笼、菜畦、南瓜、木篱笆、小茶亭、石桌（角落风景）；第 3 张：两种「篱笆 + 杂草」遮罩（横、竖，透明底，照草图里角落的形状）、开荒木牌（空白木板）、竹篮、台历、小房子图标。统一风格段落沿用 `garden-art-brief.md`。

- [ ] **Step 3: 文档**：README「养生庭院」整节改成「小岛花园」（首页、四个角落和价格、花坛、自带风景引来小动物、大打卡按钮），目录结构的 tab 顺序、「图片」小节（`island.png`、`locked-*.png`、草图、出图说明换成新文件）；CLAUDE.md 简介、美术需求文件名、「当前状态」加一行小岛上线（`testGrant` 那条保留）；设计文档状态改「已确认」。

- [ ] **Step 4: 全量测试、提交、推送、部署**

```bash
npm test 2>&1 | grep -E "^# (pass|fail)"
du -sh miniprogram
git add -A && git commit -m "docs: island garden in README; island art brief

<trailer>"
git push -u origin claude/mini-program-dev-nzn2n0
npm run wx:function
npm run wx:preview
```

用 SendUserFile 发二维码、两张截图、`art/guide/island-layout.png` 和出图说明。
