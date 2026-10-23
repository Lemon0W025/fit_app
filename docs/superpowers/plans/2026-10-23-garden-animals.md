# 庭院小动物 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 小动物不再从扭蛋出，庭院里摆了它喜欢的东西、下次正餐打卡时搬来；住进来后在庭院里自己走动、碰到能玩的物件有特殊动作、点一下会说话。

**Architecture:** 云函数只决定「谁住进来」（`shared/garden.js` 的 `waitingAnimals` + `services/garden.js` 的 `arrive`，由 `meal.analyze` 调用）；动物怎么动全在小程序里算：`utils/animals.js` 是数据和纯函数，`utils/garden-life.js` 是每只动物一个定时器的调度器，庭院页把它给的 sprite 渲染出来，动作用 CSS。

**Tech Stack:** 微信小程序原生（WXML/WXSS/CommonJS）、微信云开发云函数（Node）、node:test（零依赖）。

## Global Constraints

- 设计文档：`docs/superpowers/specs/2026-10-23-garden-animals-design.md`
- `cloudfunctions/api/lib/shared/` 与 `miniprogram/utils/shared/` 必须逐字节一致：改完 `cloudfunctions/api/lib/shared/garden.js` 立即 `cp` 到 `miniprogram/utils/shared/garden.js`
- 云函数响应 `{ ok, data }` / `{ ok: false, code, message }`，message 中文
- 每个任务结束：`npm test` 全绿，改过的 JS 跑 `node --check`
- 提交信息结尾两行：`Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` 和 `Claude-Session: https://claude.ai/code/session_01CX9A8LkVQKcNnTEsxo35Fv`（下文 `<trailer>` 指这两行）
- 面向长辈：气泡字号 ≥ 26rpx，文案口语化
- 不新增云函数 action；`garden.get` 新增入参 `{ markSeen: true }`

---

### Task 1: 共享规则——动物标记、等候名单、扭蛋不出动物

**Files:**
- Modify: `cloudfunctions/api/lib/shared/garden.js`（然后复制到 `miniprogram/utils/shared/garden.js`）
- Test: `test/garden.test.js`

**Interfaces:**
- Produces: `ANIMALS: string[]`（9 个 id，按 ITEMS 顺序）；`placedOrder(uid): number`（`'p12'` → 12，非法 → 0）；`waitingAnimals(placed, residentIds): string[]`；动物物件新增字段 `kind: 'animal'`、`likes: string[]`、`likesCount?: number`、`needs?: string`；`pickItem` 永远不返回动物

- [ ] **Step 1: 写失败的测试**（追加到 `test/garden.test.js`，并在文件顶部的解构里加上 `ANIMALS, waitingAnimals, placedOrder`）

```js
test('小动物：9 只，各有喜欢的物件，扭蛋里抽不到', () => {
  assert.deepEqual(ANIMALS, ['chick', 'rabbit', 'duck', 'turtle', 'tabby_cat', 'panda', 'ginger_cat', 'crane', 'panda_family'])
  for (const id of ANIMALS) {
    const animal = itemById(id)
    assert.equal(animal.kind, 'animal')
    assert.ok(animal.likes.length, id)
    animal.likes.forEach((like) => assert.ok(itemById(like) && itemById(like).kind !== 'animal', like))
  }
  assert.deepEqual(itemById('panda').likes, ['bamboo'])
  assert.equal(itemById('panda_family').likesCount, 3)
  assert.equal(itemById('panda_family').needs, 'panda')
  for (const rarity of ['common', 'rare', 'epic', 'legendary']) {
    for (let k = 0; k < 100; k++) {
      const id = pickItem(rarity, 'lidong', k / 100)
      assert.equal(ANIMALS.indexOf(id), -1, `${rarity} ${id}`)
    }
  }
})

test('placedOrder：摆放编号转成数字', () => {
  assert.equal(placedOrder('p12'), 12)
  assert.equal(placedOrder('a'), 0)
  assert.equal(placedOrder(undefined), 0)
})

test('waitingAnimals：庭院里摆着喜欢的东西才等，按摆放先后排队', () => {
  const placed = [
    { uid: 'p3', itemId: 'grass', c: 0, r: 0 },
    { uid: 'p2', itemId: 'bamboo', c: 1, r: 0 },
    { uid: 'p5', itemId: 'daisy', c: 2, r: 0 },
  ]
  assert.deepEqual(waitingAnimals(placed, []), ['panda', 'chick'])
  // 已经住进来的不再等
  assert.deepEqual(waitingAnimals(placed, ['panda']), ['chick'])
  assert.deepEqual(waitingAnimals([], []), [])
})

test('waitingAnimals：熊猫一家要大熊猫住进来，且摆着 3 丛翠竹', () => {
  const bamboo = (n) => Array.from({ length: n }, (_, i) => ({ uid: `p${i + 1}`, itemId: 'bamboo', c: i, r: 0 }))
  assert.deepEqual(waitingAnimals(bamboo(3), []), ['panda'])
  assert.deepEqual(waitingAnimals(bamboo(2), ['panda']), [])
  assert.deepEqual(waitingAnimals(bamboo(3), ['panda']), ['panda_family'])
  // 按第 3 丛翠竹的编号排队：p3 比 p4 的青草丛早
  const placed = bamboo(3).concat({ uid: 'p4', itemId: 'grass', c: 5, r: 5 })
  assert.deepEqual(waitingAnimals(placed, ['panda']), ['panda_family', 'chick'])
})
```

同时把已有的两个 `pickItem` 测试里的池子改成不含动物（否则下标对不上）：

```js
test('pickItem：同稀有度等概率，排除新手大树、小动物和非当季限定', () => {
  const commons = ITEMS.filter((i) => i.rarity === 'common' && !i.starter && !i.term && i.kind !== 'animal')
  assert.equal(pickItem('common', null, 0), commons[0].id)
  assert.equal(pickItem('common', null, 0.9999), commons[commons.length - 1].id)
  for (let k = 0; k < 50; k++) {
    const id = pickItem('rare', 'lidong', k / 50)
    const item = itemById(id)
    assert.ok(!item.term || item.term === 'lidong', id)
  }
})

test('pickItem：当季限定在稀有池里权重 ×4', () => {
  const rares = ITEMS.filter((i) => i.rarity === 'rare' && !i.term && i.kind !== 'animal')
  const total = rares.length + 4
  // 限定款排在池子最后，占最后 4/total 的区间
  assert.equal(pickItem('rare', 'dongzhi', 0.9999), 'dumpling_steamer')
  assert.equal(pickItem('rare', 'dongzhi', (rares.length + 0.01) / total), 'dumpling_steamer')
  assert.notEqual(pickItem('rare', 'dongzhi', (rares.length - 0.01) / total), 'dumpling_steamer')
  assert.notEqual(pickItem('rare', null, 0.9999), 'dumpling_steamer')
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `node --test test/garden.test.js`
Expected: FAIL（`ANIMALS` 未定义 / `animal.kind` 为 undefined）

- [ ] **Step 3: 实现**

`cloudfunctions/api/lib/shared/garden.js`：

1. ITEMS 上方注释后追加一行：

```js
// kind: 'animal' 的是小动物：不进扭蛋；庭院里摆着 likes 里的东西（likesCount 件，needs 已住进来）时，下次正餐打卡搬来
```

2. 九个动物条目改成：

```js
  { id: 'chick', name: '小黄鸡', rarity: 'rare', size: 's', emoji: '🐤', kind: 'animal', likes: ['grass'] },
  { id: 'rabbit', name: '小白兔', rarity: 'rare', size: 's', emoji: '🐇', kind: 'animal', likes: ['radish'] },
  { id: 'duck', name: '小黄鸭', rarity: 'rare', size: 's', emoji: '🦆', kind: 'animal', likes: ['koi_pond'] },
  { id: 'turtle', name: '小乌龟', rarity: 'rare', size: 's', emoji: '🐢', kind: 'animal', likes: ['pebbles'] },
  { id: 'tabby_cat', name: '小花猫', rarity: 'rare', size: 's', emoji: '🐈', kind: 'animal', likes: ['stool'] },
  { id: 'panda', name: '大熊猫', rarity: 'epic', size: 'm', emoji: '🐼', kind: 'animal', likes: ['bamboo'] },
  { id: 'ginger_cat', name: '晒太阳的橘猫', rarity: 'epic', size: 'm', emoji: '😺', kind: 'animal', likes: ['tea_table'] },
  { id: 'crane', name: '仙鹤', rarity: 'epic', size: 'm', emoji: '🦢', kind: 'animal', likes: ['lotus_pond'] },
  { id: 'panda_family', name: '熊猫一家', rarity: 'legendary', size: 'l', emoji: '🐾', kind: 'animal', likes: ['bamboo'], likesCount: 3, needs: 'panda' },
```

3. `STARTER_ITEM` 下面加：

```js
const ANIMALS = ITEMS.filter((i) => i.kind === 'animal').map((i) => i.id)
```

4. `pickItem` 改成：

```js
// termKey：当前节气的 key；当季限定款进入同稀有度的池子，权重更高。小动物不进扭蛋
function pickItem(rarity, termKey, rand) {
  const inPool = (i) => i.rarity === rarity && !i.starter && i.kind !== 'animal'
  const regular = ITEMS.filter((i) => inPool(i) && !i.term)
  const seasonal = ITEMS.filter((i) => inPool(i) && i.term && i.term === termKey)
  const entries = regular.map((i) => ({ value: i.id, weight: 1 }))
    .concat(seasonal.map((i) => ({ value: i.id, weight: SEASONAL_WEIGHT })))
  return pickWeighted(entries, rand)
}
```

5. `gardenSize` 后面加：

```js
// 摆放编号 p12 → 12，越小越早摆
function placedOrder(uid) {
  return Number(String(uid).replace(/\D/g, '')) || 0
}

// 条件满足、还没住进来的动物，按「最后一件需要的物件」摆进庭院的先后排队
function waitingAnimals(placed, residentIds) {
  const waiting = []
  ITEMS.forEach((animal) => {
    if (animal.kind !== 'animal' || residentIds.indexOf(animal.id) !== -1) return
    if (animal.needs && residentIds.indexOf(animal.needs) === -1) return
    const need = animal.likesCount || 1
    const orders = placed
      .filter((p) => animal.likes.indexOf(p.itemId) !== -1)
      .map((p) => placedOrder(p.uid))
      .sort((a, b) => a - b)
    if (orders.length >= need) waiting.push({ id: animal.id, order: orders[need - 1] })
  })
  return waiting.sort((a, b) => a.order - b.order).map((w) => w.id)
}
```

6. `module.exports` 里加 `ANIMALS,`（在 `STARTER_ITEM,` 后）以及 `placedOrder,`、`waitingAnimals,`（在 `gardenSize,` 后）。

然后：

```bash
cp cloudfunctions/api/lib/shared/garden.js miniprogram/utils/shared/garden.js
```

- [ ] **Step 4: 跑测试确认通过**

Run: `node --test test/garden.test.js test/shared-sync.test.js`
Expected: PASS

- [ ] **Step 5: 全量测试并提交**

```bash
npm test 2>&1 | grep -E "^# (pass|fail)"
node --check cloudfunctions/api/lib/shared/garden.js
git add cloudfunctions/api/lib/shared/garden.js miniprogram/utils/shared/garden.js test/garden.test.js
git commit -m "feat(animals): mark animals, waiting list, keep them out of the gacha

<trailer>"
```

（如果 `npm test` 里 `services-garden` / `garden-view` 因为扭蛋池或分组变化失败，属于 Task 2 / Task 7 的范围，先看失败原因：只允许是动物不进扭蛋导致的期望值变化。）

---

### Task 2: 庭院状态与 service——住户、搬来、看过、旧数据

**Files:**
- Modify: `cloudfunctions/api/lib/garden-state.js`
- Modify: `cloudfunctions/api/services/garden.js`
- Test: `test/services-garden.test.js`

**Interfaces:**
- Consumes: `ANIMALS`, `waitingAnimals`, `itemById`（Task 1）
- Produces:
  - `normalizeGarden(doc)` 新字段 `residents: [{ id, since }]`、`arrivals: string[]`；背包/庭院里的动物物件迁成住户
  - `service.view` 新字段 `residents: string[]`、`arrivals: string[]`、`waiting: string[]`
  - `service.get(openid, input)`：`input.markSeen` 为真时返回后清空 `arrivals`
  - `service.arrive(openid) → Promise<{ id, name } | null>`

- [ ] **Step 1: 改已有测试里用到熊猫当摆件的地方**

`test/services-garden.test.js` 里 place / move / stash 三个测试把 `'panda'` 全部换成 `'pavilion'`（六角凉亭，普通摆件），包括期望值里的 `{ itemId: 'panda', ... }`。

- [ ] **Step 2: 写失败的测试**（追加到 `test/services-garden.test.js`）

```js
test('view：住户、新住户、在等的小动物', async () => {
  const { service } = setup({
    garden: richGarden({
      placed: [{ uid: 'p1', itemId: 'bamboo', c: 0, r: 0 }, { uid: 'p2', itemId: 'grass', c: 1, r: 0 }],
      residents: [{ id: 'chick', since: '2026-10-20' }],
      arrivals: ['chick'],
    }),
  })
  const view = await service.get('u1')
  assert.deepEqual(view.residents, ['chick'])
  assert.deepEqual(view.arrivals, ['chick'])
  assert.deepEqual(view.waiting, ['panda'])
})

test('arrive：摆了翠竹，熊猫搬来，一次只来一只', async () => {
  const { repo, service } = setup({
    garden: richGarden({ placed: [{ uid: 'p2', itemId: 'grass', c: 1, r: 0 }, { uid: 'p1', itemId: 'bamboo', c: 0, r: 0 }] }),
  })
  assert.deepEqual(await service.arrive('u1'), { id: 'panda', name: '大熊猫' })
  let stored = await repo.getGarden('u1')
  assert.deepEqual(stored.residents, [{ id: 'panda', since: TODAY }])
  assert.deepEqual(stored.arrivals, ['panda'])
  assert.ok(stored.collected.indexOf('panda') !== -1)

  assert.deepEqual(await service.arrive('u1'), { id: 'chick', name: '小黄鸡' })
  assert.equal(await service.arrive('u1'), null)
  stored = await repo.getGarden('u1')
  assert.deepEqual(stored.residents.map((r) => r.id), ['panda', 'chick'])
  assert.deepEqual(stored.arrivals, ['panda', 'chick'])
})

test('arrive：没有在等的动物时不写数据库', async () => {
  const { repo, service } = setup()
  assert.equal(await service.arrive('u1'), null)
  assert.equal(await repo.getGarden('u1'), null)
})

test('get：庭院页带 markSeen 才把新住户标成看过', async () => {
  const { repo, service } = setup({ garden: richGarden({ residents: [{ id: 'panda', since: TODAY }], arrivals: ['panda'] }) })
  assert.deepEqual((await service.get('u1')).arrivals, ['panda'])
  assert.deepEqual((await repo.getGarden('u1')).arrivals, ['panda'])
  assert.deepEqual((await service.get('u1', { markSeen: true })).arrivals, ['panda'])
  assert.deepEqual((await repo.getGarden('u1')).arrivals, [])
  assert.deepEqual((await service.get('u1', { markSeen: true })).arrivals, [])
})

test('旧数据：扭蛋抽到的小动物变成住户，不放进新住户', async () => {
  const { service } = setup({
    garden: richGarden({
      inventory: { panda: 1, daisy: 2 },
      placed: [{ uid: 'p1', itemId: 'crane', c: 0, r: 0 }, { uid: 'p2', itemId: 'daisy', c: 1, r: 0 }],
      collected: ['panda', 'crane', 'daisy'],
    }),
  })
  const view = await service.get('u1')
  assert.deepEqual(view.residents.sort(), ['crane', 'panda'])
  assert.deepEqual(view.arrivals, [])
  assert.deepEqual(view.inventory, [{ itemId: 'daisy', count: 2 }])
  assert.deepEqual(view.placed.map((p) => p.itemId), ['daisy'])
})
```

- [ ] **Step 3: 跑测试确认失败**

Run: `node --test test/services-garden.test.js`
Expected: FAIL（`view.residents` undefined / `service.arrive is not a function`）

- [ ] **Step 4: 实现 `lib/garden-state.js`**

整份替换为：

```js
// gardens 文档的完整形状：老数据或新用户缺的字段补上默认值，去掉已经废弃的树种字段

const { ANIMALS } = require('./shared/garden')

const LEGACY_FIELDS = ['currentSpecies', 'unlocked', 'unseen']

const isAnimal = (id) => ANIMALS.indexOf(id) !== -1

// 以前小动物是扭蛋抽的：背包里、庭院里的直接变成住户（不算新住户，免得一次走进来一群）
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
  return adoptAnimals({
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
    // 住进来的小动物 [{ id, since }]，和还没在庭院里看到的新住户
    residents: g.residents || [],
    arrivals: g.arrivals || [],
  })
}

module.exports = { normalizeGarden }
```

- [ ] **Step 5: 实现 `services/garden.js`**

1. 顶部解构里加 `waitingAnimals,`。
2. `view()` 返回对象里 `welcome,` 前加：

```js
      residents: garden.residents.map((r) => r.id),
      arrivals: garden.arrivals,
      waiting: waitingAnimals(garden.placed, garden.residents.map((r) => r.id)),
```

3. `get` 整个替换为：

```js
    // 第一次进庭院：送暖豆，并在中间种一棵大树。庭院页带 markSeen：新住户看过了
    async get(openid, input) {
      const garden = await load(openid)
      let welcome = null
      if (!garden.welcomed) {
        const center = Math.floor((gardenSize(garden.collected.length) - 1) / 2)
        garden.welcomed = true
        garden.beans = { ...garden.beans, bonus: garden.beans.bonus + WELCOME_BEANS }
        garden.placed = garden.placed.concat({ uid: newUid(garden), itemId: STARTER_ITEM, c: center, r: center })
        welcome = { beans: WELCOME_BEANS, itemId: STARTER_ITEM }
      }
      const result = view(garden, welcome)
      const seen = !!(input && input.markSeen) && garden.arrivals.length > 0
      if (seen) garden.arrivals = []
      if (welcome || seen) await repo.saveGarden(openid, garden)
      return result
    },
```

4. `stash` 后面加：

```js
    // 正餐打卡后调用：有在等的小动物就搬来一只
    async arrive(openid) {
      const garden = await load(openid)
      const next = waitingAnimals(garden.placed, garden.residents.map((r) => r.id))[0]
      if (!next) return null
      garden.residents = garden.residents.concat({ id: next, since: dateKey(now()) })
      garden.arrivals = garden.arrivals.concat(next)
      if (garden.collected.indexOf(next) === -1) garden.collected = garden.collected.concat(next)
      await repo.saveGarden(openid, garden)
      return { id: next, name: itemById(next).name }
    },
```

- [ ] **Step 6: 跑测试确认通过**

Run: `node --test test/services-garden.test.js`
Expected: PASS

- [ ] **Step 7: 全量测试并提交**

```bash
npm test 2>&1 | grep -E "^# (pass|fail)"
node --check cloudfunctions/api/lib/garden-state.js && node --check cloudfunctions/api/services/garden.js
git add cloudfunctions/api/lib/garden-state.js cloudfunctions/api/services/garden.js test/services-garden.test.js
git commit -m "feat(animals): residents, arrivals and the arrive step in the garden service

<trailer>"
```

---

### Task 3: 正餐打卡触发搬家 + 接线 + 端到端

**Files:**
- Modify: `cloudfunctions/api/services/meal.js`
- Modify: `cloudfunctions/api/index.js`
- Test: `test/services-meal.test.js`, `test/cloud-e2e.test.js`

**Interfaces:**
- Consumes: `garden.arrive(openid)`（Task 2）
- Produces: `meal.analyze` 返回值多一个 `arrival: { id, name } | null`（正餐才有，加餐恒为 `null`）；不存进打卡记录

- [ ] **Step 1: 改测试 setup 并写失败的测试**

`test/services-meal.test.js`：

1. 顶部加 `const { createGardenService } = require('../cloudfunctions/api/services/garden')`。
2. `setup` 里 `createMealService({ ... })` 加一项 `garden: createGardenService({ repo, now: () => NOW }),`，并接受参数 `garden: gardenDoc`：在 `if (withProfile)` 后加 `if (gardenDoc) repo.state.gardens.set('u1', gardenDoc)`（`setup` 的解构参数里加 `garden: gardenDoc = null`）。
3. 两处 `const { tree, ...stored } = meal` 改成 `const { tree, arrival, ...stored } = meal`。
4. 追加：

```js
const bambooGarden = () => ({ welcomed: true, placed: [{ uid: 'p1', itemId: 'bamboo', c: 0, r: 0 }] })

test('analyze：正餐打卡后，摆着翠竹的庭院搬来熊猫', async () => {
  const { repo, service } = setup({ results: [analysisJson()], garden: bambooGarden() })
  const meal = await service.analyze('u1', { mealType: 'lunch', note: '米饭青菜' })
  assert.deepEqual(meal.arrival, { id: 'panda', name: '大熊猫' })
  assert.equal(repo.state.meals.get(meal._id).arrival, undefined)
  assert.deepEqual((await repo.getGarden('u1')).residents.map((r) => r.id), ['panda'])
})

test('analyze：加餐不搬家；AI 失败的正餐照样搬', async () => {
  const snack = setup({ results: [analysisJson()], garden: bambooGarden() })
  const s = await snack.service.analyze('u1', { mealType: 'snack', note: '苹果' })
  assert.equal(s.arrival, null)
  assert.deepEqual((await snack.repo.getGarden('u1')).residents, undefined)

  const failed = setup({ results: [new Error('down'), new Error('down')], garden: bambooGarden() })
  const m = await failed.service.analyze('u1', { mealType: 'dinner', note: '面条' })
  assert.equal(m.status, 'failed')
  assert.deepEqual(m.arrival, { id: 'panda', name: '大熊猫' })
})

test('reanalyze 不触发搬家', async () => {
  const { repo, service } = setup({ results: [analysisJson(), analysisJson()] })
  const meal = await service.analyze('u1', { mealType: 'lunch', note: '米饭' })
  repo.state.gardens.set('u1', bambooGarden())
  const again = await service.reanalyze('u1', { mealId: meal._id, note: '米饭半碗' })
  assert.equal(again.arrival, undefined)
  assert.equal((await repo.getGarden('u1')).residents, undefined)
})
```

（`createFakeChat` 收到 `Error` 时会抛出——和已有失败用例一致；如果失败用例需要的错误个数不同，以 `test/services-meal.test.js` 里已有的「AI 失败」用例为准。）

`test/cloud-e2e.test.js` 追加：

```js
test('庭院小动物：摆翠竹 → 打卡午餐 → 熊猫搬来 → 庭院看到一次', async () => {
  const cloud = createFakeCloud({ replies: [analysisJson({ rating: 'green' })] })
  const { main } = loadCloudFunction(cloud)
  await main({ action: 'profile.save', data: profileInput })
  await main({ action: 'garden.get' })
  const doc = cloud.db.collections.get('gardens').get('u1')
  cloud.db.collections.get('gardens').set('u1', { ...doc, placed: doc.placed.concat({ uid: 'p9', itemId: 'bamboo', c: 0, r: 0 }) })

  const waiting = await main({ action: 'garden.get' })
  assert.deepEqual(waiting.data.waiting, ['panda'])

  const meal = await main({ action: 'meal.analyze', data: { mealType: 'lunch', note: '米饭青菜' } })
  assert.equal(meal.ok, true, meal.message)
  assert.deepEqual(meal.data.arrival, { id: 'panda', name: '大熊猫' })

  const first = await main({ action: 'garden.get', data: { markSeen: true } })
  assert.deepEqual(first.data.residents, ['panda'])
  assert.deepEqual(first.data.arrivals, ['panda'])
  assert.deepEqual(first.data.waiting, [])
  const second = await main({ action: 'garden.get', data: { markSeen: true } })
  assert.deepEqual(second.data.arrivals, [])
  assert.deepEqual(cloud.db.collections.get('gardens').get('u1').residents.map((r) => r.id), ['panda'])
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `node --test test/services-meal.test.js test/cloud-e2e.test.js`
Expected: FAIL（`meal.arrival` undefined）

- [ ] **Step 3: 实现**

`cloudfunctions/api/services/meal.js`：`createMealService({ ... })` 的参数里加 `garden`（放在 `forest` 后）；`analyze` 末尾改成：

```js
      // 只有正餐影响今天的树、引来小动物，加餐不算
      let tree = null
      let arrival = null
      if (isMainMeal(src.mealType)) {
        await forest.syncDay(openid, date)
        tree = treeChange(meals, meals.concat(saved))
        arrival = await garden.arrive(openid)
      }
      return { ...saved, tree, arrival }
```

`cloudfunctions/api/index.js`：`const forest = ...` 下面加 `const garden = createGardenService({ repo, now })`；`meal: createMealService({ ..., forest, log })` 改成 `meal: createMealService({ repo, chat, config, getImageUrl, deleteFile, now, forest, garden, log })`；路由表里 `garden: createGardenService({ repo, now }),` 改成 `garden,`。

- [ ] **Step 4: 跑测试确认通过**

Run: `node --test test/services-meal.test.js test/cloud-e2e.test.js`
Expected: PASS

- [ ] **Step 5: 全量测试并提交**

```bash
npm test 2>&1 | grep -E "^# (pass|fail)"
node --check cloudfunctions/api/services/meal.js && node --check cloudfunctions/api/index.js
git add cloudfunctions/api/services/meal.js cloudfunctions/api/index.js test/services-meal.test.js test/cloud-e2e.test.js
git commit -m "feat(animals): a main-meal check-in brings a waiting animal home

<trailer>"
```

---

### Task 4: `utils/animals.js`——动物数据与「下一步」纯函数

**Files:**
- Create: `miniprogram/utils/animals.js`
- Test: `test/animals.test.js`

**Interfaces:**
- Consumes: `itemById`, `placedOrder`, `ANIMALS`, `ITEMS`（shared/garden）
- Produces:
  - `ANIMAL_INFO[id] = { scale, stepMs, pauseMs: [min, max], sleepy, faces: 'left'|'right'|'front', likesText, arrive, hello, lines: string[] }`
  - `PLAYS[itemId] = { action, animals: string[] | 'all', at: 'beside'|'on', spot?: { x, y }, emoji, line }`
  - 常量 `PLAY_CHANCE = 0.3`、`PLAY_RANGE = 3`、`HOME_RANGE = 2`、`PLAY_COOLDOWN_MS = 60000`、`SLEEP_LINE`
  - `freeNeighbors(t, size, blocked: Set<'c,r'>) → {c,r}[]`
  - `homeOf(animalId, placed) → {c,r} | null`
  - `chooseStep(pos, { size, blocked, home }, rand) → {c,r} | null`
  - `pathTo(from, to, size, blocked) → {c,r}[] | null`（不含起点；目标格可以被占）
  - `choosePlay(animalId, pos, { size, blocked, placed, busy: Set<uid>, cooldown: {uid: ms}, now }, rand) → { uid, itemId, play, item: {c,r}, target: {c,r}, path } | null`
  - `flipFor(faces, from, to, current) → boolean`
  - `lineFor(animalId, { action, play }, rand) → string`
  - `rand` 一律是「调用一次返回 [0,1) 的函数」

- [ ] **Step 1: 写失败的测试** `test/animals.test.js`

```js
const test = require('node:test')
const assert = require('node:assert/strict')
const A = require('../miniprogram/utils/animals')
const { ANIMALS, itemById } = require('../miniprogram/utils/shared/garden')

const always = (v) => () => v
const blocked = (...tiles) => new Set(tiles.map(([c, r]) => `${c},${r}`))

test('每只动物都有脾气、台词和搬家的话', () => {
  assert.deepEqual(Object.keys(A.ANIMAL_INFO).sort(), [...ANIMALS].sort())
  for (const id of ANIMALS) {
    const info = A.ANIMAL_INFO[id]
    assert.ok(info.scale > 0 && info.scale <= 1.2, id)
    assert.ok(info.stepMs > 0 && info.pauseMs[0] <= info.pauseMs[1], id)
    assert.ok(['left', 'right', 'front'].indexOf(info.faces) !== -1, id)
    assert.ok(info.lines.length >= 4, id)
    assert.ok(info.arrive && info.hello && info.likesText.startsWith('喜欢：'), id)
  }
  assert.equal(A.ANIMAL_INFO.panda.likesText, '喜欢：翠竹')
  assert.equal(A.ANIMAL_INFO.panda_family.likesText, '喜欢：大熊猫 + 3 丛翠竹')
  assert.equal(A.ANIMAL_INFO.panda.arrive, '大熊猫闻着竹子香，搬进庭院啦！')
})

test('互动表里的物件和动物都存在，上面的物件有落脚点', () => {
  for (const [itemId, play] of Object.entries(A.PLAYS)) {
    assert.ok(itemById(itemId) && itemById(itemId).kind !== 'animal', itemId)
    if (play.animals !== 'all') play.animals.forEach((id) => assert.ok(ANIMALS.indexOf(id) !== -1, id))
    assert.ok(play.at === 'beside' || play.at === 'on', itemId)
    if (play.at === 'on') assert.ok(play.spot.x >= 0 && play.spot.x <= 1 && play.spot.y >= 0 && play.spot.y <= 1, itemId)
    assert.ok(play.emoji && play.line, itemId)
  }
  assert.equal(A.PLAYS.bamboo.action, 'eat')
  assert.equal(A.PLAYS.koi_pond.at, 'on')
  assert.equal(A.PLAYS.sweet_potato_stove.animals, 'all')
})

test('freeNeighbors：不出界、不进被占的格子', () => {
  assert.deepEqual(A.freeNeighbors({ c: 0, r: 0 }, 6, blocked([1, 0])), [{ c: 0, r: 1 }])
  assert.deepEqual(A.freeNeighbors({ c: 5, r: 5 }, 6, blocked()).length, 2)
})

test('homeOf：最早摆的那件喜欢的东西；没有就是 null', () => {
  const placed = [{ uid: 'p7', itemId: 'bamboo', c: 4, r: 4 }, { uid: 'p3', itemId: 'bamboo', c: 1, r: 2 }, { uid: 'p1', itemId: 'daisy', c: 0, r: 0 }]
  assert.deepEqual(A.homeOf('panda', placed), { c: 1, r: 2 })
  assert.equal(A.homeOf('duck', placed), null)
})

test('chooseStep：离家远了往回走；被围住就不动', () => {
  const ctx = { size: 6, blocked: blocked(), home: { c: 0, r: 0 } }
  for (const v of [0, 0.3, 0.6, 0.99]) {
    const step = A.chooseStep({ c: 4, r: 4 }, ctx, always(v))
    assert.ok(step.c + step.r < 8, JSON.stringify(step))
  }
  assert.equal(A.chooseStep({ c: 0, r: 0 }, { size: 6, blocked: blocked([1, 0], [0, 1]), home: null }, always(0)), null)
  // 没有家：四个方向都可能
  const seen = new Set([0, 0.26, 0.51, 0.76].map((v) => JSON.stringify(A.chooseStep({ c: 2, r: 2 }, { size: 6, blocked: blocked(), home: null }, always(v)))))
  assert.equal(seen.size, 4)
})

test('pathTo：最短路，绕开被占的格子，目标本身可以被占', () => {
  assert.deepEqual(A.pathTo({ c: 0, r: 0 }, { c: 0, r: 0 }, 6, blocked()), [])
  const path = A.pathTo({ c: 0, r: 0 }, { c: 2, r: 0 }, 6, blocked([1, 0], [2, 0]))
  assert.equal(path.length, 4)
  assert.deepEqual(path[path.length - 1], { c: 2, r: 0 })
  assert.ok(!path.slice(0, -1).some((t) => t.c === 1 && t.r === 0))
  assert.equal(A.pathTo({ c: 0, r: 0 }, { c: 3, r: 3 }, 6, blocked([1, 0], [0, 1])), null)
})

test('choosePlay：按概率、距离、冷却、占用挑最近能玩的物件', () => {
  const placed = [
    { uid: 'p1', itemId: 'bamboo', c: 2, r: 0 },
    { uid: 'p2', itemId: 'bamboo', c: 5, r: 5 },
    { uid: 'p3', itemId: 'koi_pond', c: 0, r: 2 },
  ]
  const ctx = (extra = {}) => ({ size: 6, blocked: blocked([2, 0], [5, 5], [0, 2]), placed, busy: new Set(), cooldown: {}, now: 1000, ...extra })
  const pos = { c: 0, r: 0 }
  assert.equal(A.choosePlay('panda', pos, ctx(), always(0.5)), null)
  const play = A.choosePlay('panda', pos, ctx(), always(0.1))
  assert.equal(play.uid, 'p1')
  assert.equal(play.play.action, 'eat')
  assert.deepEqual(play.item, { c: 2, r: 0 })
  assert.deepEqual(play.target, { c: 1, r: 0 })
  assert.deepEqual(play.path, [{ c: 1, r: 0 }])
  // 冷却中、被别的动物占着、太远都不选
  assert.equal(A.choosePlay('panda', pos, ctx({ cooldown: { p1: 5000 } }), always(0.1)), null)
  assert.equal(A.choosePlay('panda', pos, ctx({ busy: new Set(['p1']) }), always(0.1)), null)
  // 鸭子去池子上面
  const swim = A.choosePlay('duck', pos, ctx(), always(0.1))
  assert.equal(swim.uid, 'p3')
  assert.deepEqual(swim.target, { c: 0, r: 2 })
  assert.equal(swim.path.length, 2)
  // 熊猫不玩池子，鸭子不吃竹子
  assert.equal(A.choosePlay('crane', { c: 5, r: 0 }, ctx(), always(0.1)), null)
})

test('choosePlay：烤红薯炉谁都能去', () => {
  const placed = [{ uid: 'p1', itemId: 'sweet_potato_stove', c: 1, r: 1 }]
  const ctx = { size: 6, blocked: blocked([1, 1]), placed, busy: new Set(), cooldown: {}, now: 0 }
  for (const id of ANIMALS) assert.equal(A.choosePlay(id, { c: 0, r: 0 }, ctx, always(0.1)).play.action, 'warm', id)
})

test('flipFor：按图的朝向和屏幕上的左右决定镜像', () => {
  const a = { c: 2, r: 2 }
  const right = { c: 3, r: 2 } // 屏幕上往右
  const left = { c: 1, r: 2 }
  assert.equal(A.flipFor('right', a, right, true), false)
  assert.equal(A.flipFor('right', a, left, false), true)
  assert.equal(A.flipFor('front', a, left, false), true)
  assert.equal(A.flipFor('left', a, right, false), true)
  assert.equal(A.flipFor('left', a, left, true), false)
  assert.equal(A.flipFor('right', a, { c: 2, r: 2 }, true), true)
})

test('lineFor：玩的时候说玩的话，睡觉说梦话，平常随机一句', () => {
  const play = { play: A.PLAYS.bamboo }
  assert.equal(A.lineFor('panda', { action: 'eat', play }, always(0)), A.PLAYS.bamboo.line)
  assert.equal(A.lineFor('panda', { action: 'sleep', play: null }, always(0)), A.SLEEP_LINE)
  assert.equal(A.lineFor('panda', { action: 'idle', play: null }, always(0)), A.ANIMAL_INFO.panda.lines[0])
  // 在去玩的路上还是平常的话
  assert.equal(A.lineFor('panda', { action: 'walk', play }, always(0.99)), A.ANIMAL_INFO.panda.lines[A.ANIMAL_INFO.panda.lines.length - 1])
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `node --test test/animals.test.js`
Expected: FAIL（Cannot find module '../miniprogram/utils/animals'）

- [ ] **Step 3: 实现** `miniprogram/utils/animals.js`

```js
// 庭院小动物：每只的脾气、台词，能一起玩的物件，以及「下一步做什么」的纯函数（随机数由调用方传入）

const { itemById, placedOrder } = require('./shared/garden')

const PLAY_CHANCE = 0.3
const PLAY_RANGE = 3
const HOME_RANGE = 2
const PLAY_COOLDOWN_MS = 60000
const SLEEP_LINE = '呼噜…再睡五分钟'

// scale：相对格子宽度；stepMs：走一格多久；pauseMs：停多久再走；sleepy：每次停下时打盹的概率
// faces：图里的动物朝哪边（left / right / front），决定往哪边走时要不要镜像
const ANIMAL_INFO = {
  chick: {
    scale: 0.5, stepMs: 800, pauseMs: [1500, 3500], sleepy: 0.03, faces: 'right',
    likesText: '喜欢：青草丛', arrive: '小黄鸡跟着青草香，蹦蹦跳跳搬进庭院啦！', hello: '叽叽！我是小黄鸡，以后就住这儿啦！',
    lines: ['叽叽！早饭吃了没？', '多喝温水，叽！', '今天也要好好吃饭哦', '跟我一起蹦一蹦，活动活动！'],
  },
  rabbit: {
    scale: 0.55, stepMs: 800, pauseMs: [1500, 4000], sleepy: 0.08, faces: 'front',
    likesText: '喜欢：白萝卜', arrive: '小白兔闻到萝卜香，搬进庭院啦！', hello: '我是小白兔，以后就住这儿啦！',
    lines: ['蔬菜要多吃，眼睛亮亮的～', '慢慢吃，别噎着', '今天的菜绿不绿？', '蹦跶蹦跶，吃完饭走一走'],
  },
  duck: {
    scale: 0.5, stepMs: 1200, pauseMs: [2000, 4500], sleepy: 0.03, faces: 'right',
    likesText: '喜欢：锦鲤池', arrive: '小黄鸭看见锦鲤池，摇摇摆摆搬进庭院啦！', hello: '嘎嘎！我是小黄鸭，以后就住这儿啦！',
    lines: ['嘎嘎！喝水了吗？', '天凉了，多穿件衣服', '晚饭清淡一点，嘎', '摇摇摆摆，散散步'],
  },
  turtle: {
    scale: 0.5, stepMs: 2600, pauseMs: [3000, 6000], sleepy: 0.08, faces: 'right',
    likesText: '喜欢：鹅卵石', arrive: '小乌龟慢慢爬到鹅卵石边上，搬进庭院啦！', hello: '我…是…小乌龟，以后…就住这儿啦！',
    lines: ['慢慢来，吃饭也要细嚼慢咽', '不急不急，坚持最重要', '早点睡，身体好', '我爬得慢，可我从不偷懒'],
  },
  tabby_cat: {
    scale: 0.6, stepMs: 1300, pauseMs: [2500, 5000], sleepy: 0.2, faces: 'front',
    likesText: '喜欢：小板凳', arrive: '小花猫相中了小板凳，搬进庭院啦！', hello: '喵～我是小花猫，以后就住这儿啦！',
    lines: ['喵～今天吃得好吗？', '饭后别马上躺下哦', '喵，摸摸头', '水果当加餐，比零食好喵'],
  },
  ginger_cat: {
    scale: 0.7, stepMs: 2000, pauseMs: [6000, 12000], sleepy: 0.5, faces: 'left',
    likesText: '喜欢：茶桌', arrive: '胖橘猫闻着茶香，慢悠悠搬进庭院啦！', hello: '喵…我是胖橘猫，以后就在这儿晒太阳啦',
    lines: ['晒太阳好舒服，饭后也出来走走吧', '我胖，你可别学我', '喵…七分饱刚刚好', '少吃点甜的喵'],
  },
  panda: {
    scale: 0.8, stepMs: 1800, pauseMs: [3000, 6000], sleepy: 0.1, faces: 'front',
    likesText: '喜欢：翠竹', arrive: '大熊猫闻着竹子香，搬进庭院啦！', hello: '我是大熊猫，以后就住这儿啦！',
    lines: ['竹子要慢慢嚼，吃饭也一样～', '多吃蔬菜，像我一样', '吃饱了，打个滚', '今天也要开开心心的'],
  },
  crane: {
    scale: 0.8, stepMs: 2000, pauseMs: [3000, 6000], sleepy: 0, faces: 'right',
    likesText: '喜欢：荷花池', arrive: '仙鹤看中了荷花池，翩翩飞进庭院啦！', hello: '我是仙鹤，以后就住这儿啦',
    lines: ['站直一点，腰背会舒服', '早睡早起，精神好', '心平气和，福寿安康', '饭后百步走'],
  },
  panda_family: {
    scale: 1.1, stepMs: 2200, pauseMs: [4000, 8000], sleepy: 0.1, faces: 'front',
    likesText: '喜欢：大熊猫 + 3 丛翠竹', arrive: '竹林长大了，熊猫一家都搬进庭院啦！', hello: '我们是熊猫一家，以后就住这儿啦！',
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

const key = (t) => `${t.c},${t.r}`
const dist = (a, b) => Math.abs(a.c - b.c) + Math.abs(a.r - b.r)
const inside = (t, size) => t.c >= 0 && t.r >= 0 && t.c < size && t.r < size
const neighbors = (t) => [{ c: t.c + 1, r: t.r }, { c: t.c - 1, r: t.r }, { c: t.c, r: t.r + 1 }, { c: t.c, r: t.r - 1 }]

function pickOne(list, rand) {
  return list[Math.min(list.length - 1, Math.floor(rand() * list.length))]
}

// 相邻的空格（blocked：有物件或别的动物的格子）
function freeNeighbors(t, size, blocked) {
  return neighbors(t).filter((n) => inside(n, size) && !blocked.has(key(n)))
}

// 家：最早摆进庭院的那件它喜欢的东西
function homeOf(animalId, placed) {
  const animal = itemById(animalId)
  if (!animal || !animal.likes) return null
  const liked = placed
    .filter((p) => animal.likes.indexOf(p.itemId) !== -1)
    .sort((a, b) => placedOrder(a.uid) - placedOrder(b.uid))
  return liked.length ? { c: liked[0].c, r: liked[0].r } : null
}

// 下一步走哪格：有家就在家附近转（离远了往回走），没家随便逛；被围住返回 null
function chooseStep(pos, { size, blocked, home }, rand) {
  const options = freeNeighbors(pos, size, blocked)
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

// 找一件附近能玩的物件，选走过去最近的；ctx：size、blocked、placed、busy（别的动物正玩着的 uid）、cooldown（uid → 时刻）、now
function choosePlay(animalId, pos, ctx, rand) {
  if (rand() >= PLAY_CHANCE) return null
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

// 屏幕上往右走 c−r 变大；图朝右的往左走要镜像，朝左的往右走要镜像，正面的往左走镜像
function flipFor(faces, from, to, current) {
  const dx = (to.c - to.r) - (from.c - from.r)
  if (dx === 0) return current
  return faces === 'left' ? dx > 0 : dx < 0
}

function lineFor(animalId, state, rand) {
  if (state.play && state.action === state.play.play.action) return state.play.play.line
  if (state.action === 'sleep') return SLEEP_LINE
  return pickOne(ANIMAL_INFO[animalId].lines, rand)
}

module.exports = {
  ANIMAL_INFO,
  PLAYS,
  PLAY_CHANCE,
  PLAY_RANGE,
  HOME_RANGE,
  PLAY_COOLDOWN_MS,
  SLEEP_LINE,
  freeNeighbors,
  homeOf,
  chooseStep,
  pathTo,
  choosePlay,
  flipFor,
  lineFor,
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `node --test test/animals.test.js`
Expected: PASS

- [ ] **Step 5: 全量测试并提交**

```bash
npm test 2>&1 | grep -E "^# (pass|fail)"
node --check miniprogram/utils/animals.js
git add miniprogram/utils/animals.js test/animals.test.js
git commit -m "feat(animals): animal temperaments, play table and step/play/path rules

<trailer>"
```

---

### Task 5: `utils/garden-life.js`——每只动物一个定时器的调度器

**Files:**
- Create: `miniprogram/utils/garden-life.js`
- Create: `test/helpers/manual-clock.js`
- Modify: `miniprogram/utils/garden-view.js`（导出 `SIZE_SCALE`）
- Test: `test/garden-life.test.js`

**Interfaces:**
- Consumes: Task 4 全部；`tileCenter`（iso）；`SIZE_SCALE`、`itemImage`（garden-view）
- Produces:
  - `createLife({ L, placed, residents: string[], arrivals?: string[], random?, clock?, onChange?(index, sprite) })`
  - 返回 `{ sprites(), start(), pause(), resume(), stop(), updatePlaced(placed), tap(index) }`
  - sprite：`{ id, image, width, bodyHeight, left, bottom, z, flip, action, duration, bubble, bubbleWidth, bubbleLeft, emoji, tapping }`；`action ∈ idle | walk | sleep | eat | peck | swim | perch | swing | bask | warm`
  - clock：`{ set(fn, ms) → handle, clear(handle), now() → ms }`
  - `manualClock()`（测试用）：clock 接口 + `advance(ms)`、`count()`

- [ ] **Step 1: 测试工具** `test/helpers/manual-clock.js`

```js
// 手动推进的假时钟：给需要定时器的代码在测试里用
function manualClock() {
  let now = 0
  let seq = 0
  const timers = new Map()
  return {
    set(fn, ms) {
      seq += 1
      timers.set(seq, { fn, at: now + ms })
      return seq
    },
    clear(handle) {
      timers.delete(handle)
    },
    now: () => now,
    advance(ms) {
      const end = now + ms
      for (;;) {
        let next = null
        for (const [handle, t] of timers) if (!next || t.at < next[1].at) next = [handle, t]
        if (!next || next[1].at > end) break
        timers.delete(next[0])
        now = next[1].at
        next[1].fn()
      }
      now = end
    },
    count: () => timers.size,
  }
}

module.exports = { manualClock }
```

- [ ] **Step 2: 写失败的测试** `test/garden-life.test.js`

```js
const test = require('node:test')
const assert = require('node:assert/strict')
const { createLife } = require('../miniprogram/utils/garden-life')
const { isoLayout, tileCenter } = require('../miniprogram/utils/iso')
const A = require('../miniprogram/utils/animals')
const { manualClock } = require('./helpers/manual-clock')

const L = isoLayout(6, 360)

// 可重复的伪随机
function lcg(seed) {
  let s = seed
  return () => (s = (s * 16807) % 2147483647) / 2147483647
}

// sprite 站在哪一格（站在物件上面时返回 null）
function tileOf(s) {
  const x = s.left + s.width / 2
  for (let c = -1; c <= L.size; c++) {
    for (let r = 0; r < L.size; r++) {
      const center = tileCenter(c, r, L)
      if (Math.abs(center.x - x) < 0.01 && Math.abs(L.height - (center.y + L.tileH * 0.18) - s.bottom) < 0.01) return { c, r }
    }
  }
  return null
}

function setup(opts) {
  const clock = manualClock()
  const sprites = {}
  const life = createLife({ L, clock, onChange: (i, s) => { sprites[i] = s }, ...opts })
  life.sprites().forEach((s, i) => { sprites[i] = s })
  return { clock, life, sprites }
}

test('一开始站在家附近的空格，图和大小对', () => {
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
})

test('逛五分钟：不踩物件、不和别人挤一格，会走会停', () => {
  const placed = [
    { uid: 'p1', itemId: 'bamboo', c: 2, r: 2 },
    { uid: 'p2', itemId: 'starter_tree', c: 4, r: 1 },
    { uid: 'p3', itemId: 'grass', c: 1, r: 4 },
  ]
  const clock = manualClock()
  const current = {}
  const actions = new Set()
  const life = createLife({
    L, placed, residents: ['panda', 'chick', 'rabbit'], random: lcg(42), clock,
    onChange: (i, s) => {
      current[i] = s
      actions.add(s.action)
      const tiles = Object.values(current).map(tileOf).filter(Boolean).map((t) => `${t.c},${t.r}`)
      assert.equal(new Set(tiles).size, tiles.length, '两只动物挤在一格')
      tiles.forEach((k) => assert.ok(!placed.some((p) => `${p.c},${p.r}` === k), `踩到物件 ${k}`))
    },
  })
  life.sprites().forEach((s, i) => { current[i] = s })
  life.start()
  clock.advance(5 * 60 * 1000)
  assert.ok(actions.has('walk') && actions.has('idle'))
  life.stop()
  assert.equal(clock.count(), 0)
})

test('熊猫走到竹子旁边吃竹子，吃完一阵子不再吃同一丛', () => {
  const placed = [{ uid: 'p1', itemId: 'bamboo', c: 2, r: 2 }]
  // 0.2：不打盹（熊猫 0.1）、要去玩（0.3）
  const { clock, life, sprites } = setup({ placed, residents: ['panda'], random: () => 0.2 })
  life.start()
  let ate = null
  for (let i = 0; i < 60 && !ate; i++) {
    clock.advance(500)
    if (sprites[0].action === 'eat') ate = { ...sprites[0] }
  }
  assert.ok(ate, '没吃上竹子')
  assert.equal(ate.emoji, '🎋')
  const t = tileOf(ate)
  assert.equal(Math.abs(t.c - 2) + Math.abs(t.r - 2), 1)
  clock.advance(10000)
  assert.notEqual(sprites[0].action, 'eat')
  // 冷却 1 分钟内不再吃
  for (let i = 0; i < 40; i++) {
    clock.advance(1000)
    assert.notEqual(sprites[0].action, 'eat')
  }
})

test('鸭子下水：站到池子的落脚点上，半身入水', () => {
  const placed = [{ uid: 'p1', itemId: 'koi_pond', c: 3, r: 3 }]
  const { clock, life, sprites } = setup({ placed, residents: ['duck'], random: () => 0.2 })
  life.start()
  let swim = null
  for (let i = 0; i < 60 && !swim; i++) {
    clock.advance(500)
    if (sprites[0].action === 'swim') swim = { ...sprites[0] }
  }
  assert.ok(swim, '没下水')
  assert.equal(tileOf(swim), null)
  const iw = L.tileW * 1.0
  const center = tileCenter(3, 3, L)
  assert.ok(Math.abs(swim.left + swim.width / 2 - (center.x - iw / 2 + A.PLAYS.koi_pond.spot.x * iw)) < 0.01)
  assert.ok(swim.bodyHeight < swim.width)
  assert.equal(swim.emoji, '💧')
})

test('新住户从院子边上走进来，头上说自我介绍', () => {
  const { clock, life, sprites } = setup({ placed: [], residents: ['panda'], arrivals: ['panda'], random: lcg(3) })
  assert.equal(tileOf(sprites[0]).c, L.size)
  assert.equal(sprites[0].bubble, A.ANIMAL_INFO.panda.hello)
  life.start()
  clock.advance(5000)
  const t = tileOf(sprites[0])
  assert.ok(t && t.c < L.size)
  assert.equal(sprites[0].bubble, '')
})

test('点一下：蹦一下、说一句，3 秒后气泡消失；睡觉时说梦话', () => {
  const { clock, life, sprites } = setup({ placed: [], residents: ['ginger_cat'], random: () => 0 })
  life.tap(0)
  assert.equal(sprites[0].tapping, true)
  assert.ok(A.ANIMAL_INFO.ginger_cat.lines.indexOf(sprites[0].bubble) !== -1)
  assert.ok(sprites[0].bubbleWidth > 0)
  assert.ok(sprites[0].left + sprites[0].bubbleLeft >= -0.01)
  assert.ok(sprites[0].left + sprites[0].bubbleLeft + sprites[0].bubbleWidth <= L.width + 0.01)
  clock.advance(700)
  assert.equal(sprites[0].tapping, false)
  clock.advance(2500)
  assert.equal(sprites[0].bubble, '')
  // random 0 < sleepy：轮到它就打盹
  life.start()
  clock.advance(2500)
  assert.equal(sprites[0].action, 'sleep')
  assert.equal(sprites[0].emoji, '💤')
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

test('东西摆到动物脚下，它跳到旁边的空格', () => {
  const { life, sprites } = setup({ placed: [], residents: ['rabbit'], random: () => 0.5 })
  const t = tileOf(sprites[0])
  life.updatePlaced([{ uid: 'p1', itemId: 'daisy', c: t.c, r: t.r }])
  const now = tileOf(sprites[0])
  assert.ok(now && !(now.c === t.c && now.r === t.r))
  assert.equal(sprites[0].action, 'walk')
})
```

- [ ] **Step 3: 跑测试确认失败**

Run: `node --test test/garden-life.test.js`
Expected: FAIL（Cannot find module '../miniprogram/utils/garden-life'）

- [ ] **Step 4: 实现**

`miniprogram/utils/garden-view.js` 的 `module.exports` 加上 `SIZE_SCALE`：

```js
module.exports = { SIZE_SCALE, itemImage, rarityOf, buildScene, inventoryList, hintTiles, collectionGroups }
```

`miniprogram/utils/garden-life.js`：

```js
// 庭院小动物的日常：每只一个定时器，轮到它时决定走一步、去玩、打盹还是发呆，再把画面交给页面
// 定时器（clock）和随机数都能注入，测试里手动推进时间

const { itemById } = require('./shared/garden')
const { tileCenter } = require('./iso')
const { SIZE_SCALE, itemImage } = require('./garden-view')
const A = require('./animals')

const PLAY_MS = [5000, 8000]
const SLEEP_MS = [8000, 15000]
const START_MS = [300, 2000]
const BUBBLE_MS = 3000
const TAP_MS = 600
const HELLO_MS = 4000
// 下水时露出的上半身比例；气泡宽度占庭院宽度的比例
const WATER_LINE = 0.62
const BUBBLE_RATIO = 0.44

const realClock = {
  set: (fn, ms) => setTimeout(fn, ms),
  clear: (handle) => clearTimeout(handle),
  now: () => Date.now(),
}

const key = (t) => `${t.c},${t.r}`
const same = (a, b) => a.c === b.c && a.r === b.r
const inside = (t, size) => t.c >= 0 && t.r >= 0 && t.c < size && t.r < size

function createLife({ L, placed, residents, arrivals = [], random = Math.random, clock = realClock, onChange = () => {} }) {
  let items = placed
  let running = false
  const cooldown = {}
  const between = ([min, max]) => min + Math.round((max - min) * random())
  const animals = residents
    .filter((id) => A.ANIMAL_INFO[id])
    .map((id, index) => ({
      index, id, info: A.ANIMAL_INFO[id],
      c: -1, r: -1, flip: false, action: 'idle', play: null, path: [],
      bubble: '', tapping: false, duration: 0,
      timer: null, bubbleTimer: null, tapTimer: null,
    }))

  // 有物件或别的动物的格子
  function blockedFor(self) {
    const set = new Set(items.map(key))
    animals.forEach((a) => {
      if (a !== self && inside(a, L.size)) set.add(key(a))
    })
    return set
  }

  function freeTiles(blocked) {
    const tiles = []
    for (let c = 0; c < L.size; c++) {
      for (let r = 0; r < L.size; r++) if (!blocked.has(key({ c, r }))) tiles.push({ c, r })
    }
    return tiles
  }

  function nearestFree(from, blocked) {
    const d = (t) => Math.abs(t.c - from.c) + Math.abs(t.r - from.r)
    return freeTiles(blocked).sort((a, b) => d(a) - d(b))[0] || null
  }

  function itemOf(uid) {
    return items.find((p) => p.uid === uid) || null
  }

  function playing(a) {
    return !!a.play && a.action === a.play.play.action
  }

  function sprite(a) {
    const width = L.tileW * a.info.scale
    const item = playing(a) && a.play.play.at === 'on' ? itemOf(a.play.uid) : null
    let x
    let bottom
    let z
    if (item) {
      const iw = L.tileW * SIZE_SCALE[itemById(item.itemId).size]
      const center = tileCenter(item.c, item.r, L)
      x = center.x - iw / 2 + a.play.play.spot.x * iw
      bottom = L.height - (center.y + L.tileH * 0.18) + a.play.play.spot.y * iw
      z = (item.c + item.r) * 10 + item.c + 1
    } else {
      const center = tileCenter(a.c, a.r, L)
      x = center.x
      bottom = L.height - (center.y + L.tileH * 0.18)
      z = (a.c + a.r) * 10 + a.c + 5
    }
    // 气泡别出庭院左右边
    const bubbleWidth = L.width * BUBBLE_RATIO
    const bubbleX = Math.min(Math.max(x - bubbleWidth / 2, 0), L.width - bubbleWidth)
    let emoji = ''
    if (playing(a)) emoji = a.play.play.emoji
    else if (a.action === 'sleep') emoji = '💤'
    return {
      id: a.id,
      image: itemImage(a.id),
      width,
      bodyHeight: a.action === 'swim' ? width * WATER_LINE : width,
      left: x - width / 2,
      bottom,
      z,
      flip: a.flip,
      action: a.action,
      duration: a.duration,
      bubble: a.bubble,
      bubbleWidth,
      bubbleLeft: bubbleX - (x - width / 2),
      emoji,
      tapping: a.tapping,
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

  function moveTo(a, t) {
    a.flip = A.flipFor(a.info.faces, a, t, a.flip)
    a.c = t.c
    a.r = t.r
    a.duration = a.info.stepMs
  }

  function walk(a, t) {
    moveTo(a, t)
    a.action = 'walk'
    emit(a)
    schedule(a, a.info.stepMs)
  }

  function startPlay(a) {
    a.action = a.play.play.action
    if (a.play.play.at === 'beside') a.flip = A.flipFor(a.info.faces, a, a.play.item, a.flip)
    emit(a)
    schedule(a, a.info.stepMs + between(PLAY_MS))
  }

  function endPlay(a) {
    cooldown[a.play.uid] = clock.now() + A.PLAY_COOLDOWN_MS
    const wasOn = a.play.play.at === 'on'
    a.play = null
    // 从物件上下来，跳到旁边的空格
    const off = wasOn ? A.freeNeighbors(a, L.size, blockedFor(a))[0] : null
    if (off) return walk(a, off)
    rest(a)
  }

  function followPath(a) {
    const next = a.path[0]
    const isTarget = !!a.play && same(next, a.play.target)
    if (!isTarget && blockedFor(a).has(key(next))) {
      // 路被挡住了，这次不去了
      a.path = []
      a.play = null
      return rest(a)
    }
    a.path.shift()
    if (!a.path.length && a.play) {
      moveTo(a, next)
      return startPlay(a)
    }
    walk(a, next)
  }

  function turn(a) {
    a.timer = null
    if (playing(a)) return endPlay(a)
    if (a.path.length) return followPath(a)
    // 走完一步、睡醒了：先歇一会儿
    if (a.action !== 'idle') return rest(a)
    if (random() < a.info.sleepy) {
      a.action = 'sleep'
      emit(a)
      return schedule(a, between(SLEEP_MS))
    }
    const blocked = blockedFor(a)
    const busy = new Set(animals.filter((o) => o !== a && o.play).map((o) => o.play.uid))
    const play = A.choosePlay(a.id, a, { size: L.size, blocked, placed: items, busy, cooldown, now: clock.now() }, random)
    if (play) {
      a.play = play
      a.path = play.path.slice()
      return a.path.length ? followPath(a) : startPlay(a)
    }
    const step = A.chooseStep(a, { size: L.size, blocked, home: A.homeOf(a.id, items) }, random)
    if (!step) return schedule(a, between(a.info.pauseMs))
    walk(a, step)
  }

  function say(a, text, ms) {
    a.bubble = text
    clock.clear(a.bubbleTimer)
    a.bubbleTimer = clock.set(() => {
      a.bubble = ''
      emit(a)
    }, ms)
  }

  // 住户：随便站在家附近的空格
  function settleIn(a) {
    const free = freeTiles(blockedFor(a))
    if (!free.length) return
    const home = A.homeOf(a.id, items)
    const near = home ? free.filter((t) => Math.abs(t.c - home.c) + Math.abs(t.r - home.r) <= A.HOME_RANGE) : []
    const pool = near.length ? near : free
    const t = pool[Math.min(pool.length - 1, Math.floor(random() * pool.length))]
    a.c = t.c
    a.r = t.r
  }

  // 新住户：从院子右前方的边上走进来
  function walkIn(a) {
    const blocked = blockedFor(a)
    const r = Math.min(L.size - 1, Math.floor(random() * L.size))
    const start = { c: L.size, r }
    const target = nearestFree({ c: L.size - 1, r }, blocked)
    a.c = start.c
    a.r = start.r
    a.path = (target && A.pathTo(start, target, L.size, blocked)) || []
    say(a, a.info.hello, HELLO_MS)
  }

  const arriving = new Set(arrivals)
  animals.forEach((a) => (arriving.has(a.id) ? walkIn(a) : settleIn(a)))

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
        if (a.play) {
          const item = itemOf(a.play.uid)
          if (!item || !same(item, a.play.item)) {
            a.play = null
            a.path = []
            a.action = 'idle'
          }
        }
        const onItem = a.play && a.play.play.at === 'on' && playing(a)
        if (!onItem && inside(a, L.size) && items.some((p) => same(p, a))) {
          const t = nearestFree(a, blockedFor(a))
          if (t) {
            a.path = []
            moveTo(a, t)
            a.action = 'walk'
          }
        }
        emit(a)
      })
    },

    tap(index) {
      const a = animals[index]
      if (!a) return
      say(a, A.lineFor(a.id, a, random), BUBBLE_MS)
      a.tapping = true
      clock.clear(a.tapTimer)
      a.tapTimer = clock.set(() => {
        a.tapping = false
        emit(a)
      }, TAP_MS)
      emit(a)
    },
  }
}

module.exports = { createLife }
```

- [ ] **Step 5: 跑测试确认通过**

Run: `node --test test/garden-life.test.js`
Expected: PASS（若「熊猫吃竹子」「鸭子下水」因为起点刚好被随机到不同位置而超时没触发，调大循环次数而不是改断言；若「逛五分钟」断言失败，说明 blocked 计算有漏洞，修实现）

- [ ] **Step 6: 全量测试并提交**

```bash
npm test 2>&1 | grep -E "^# (pass|fail)"
node --check miniprogram/utils/garden-life.js && node --check miniprogram/utils/garden-view.js
git add miniprogram/utils/garden-life.js miniprogram/utils/garden-view.js test/helpers/manual-clock.js test/garden-life.test.js
git commit -m "feat(animals): per-animal scheduler for wandering, playing, napping and taps

<trailer>"
```

---

### Task 6: 庭院页——渲染小动物、动作 CSS、张望提示

**Files:**
- Modify: `miniprogram/pages/garden/garden.js`、`garden.wxml`、`garden.wxss`
- Test: `test/pages.test.js`

**Interfaces:**
- Consumes: `createLife`（Task 5）；`garden.get` 的 `residents / arrivals / waiting` 和 `{ markSeen: true }`（Task 2）
- Produces: 页面 data 新增 `animals: sprite[]`、`waitingText: string`；方法 `tapAnimal(e)`、`onHide()`、`onUnload()`；可注入 `page.clock`（测试用）

- [ ] **Step 1: 写失败的测试**（追加到 `test/pages.test.js`，顶部加 `const { manualClock } = require('./helpers/manual-clock')`）

```js
test('庭院小动物：张望提示 → 打卡后熊猫搬来 → 结果页横幅 → 走进庭院、点一下说话 → 离开页面停下', async () => {
  const cloud = createFakeCloud({ replies: [analysisJson({ rating: 'green' })] })
  const { main } = loadCloudFunction(cloud)
  const wx = createWx(main)
  await main({ action: 'profile.save', data: { nickname: '妈妈', sex: 'female', age: 50, heightCm: 160, weightKg: 70, targetWeightKg: 60, activity: 'light' } })
  await main({ action: 'garden.get' })
  const doc = cloud.db.collections.get('gardens').get('u1')
  cloud.db.collections.get('gardens').set('u1', { ...doc, placed: doc.placed.concat({ uid: 'p9', itemId: 'bamboo', c: 0, r: 0 }) })

  const garden = loadPage('garden', wx)
  garden.clock = manualClock()
  garden.onShow()
  await settle()
  assert.equal(garden.data.waitingText, '👀 有小动物在院子外张望…下次打卡它就来了')
  assert.deepEqual(garden.data.animals, [])
  garden.onHide()

  // 打卡午餐
  const checkin = loadPage('checkin', wx)
  checkin.onLoad()
  checkin.pickMealType(event({ value: 'lunch' }))
  checkin.onNote(event({}, { value: '米饭青菜' }))
  checkin.submit()
  await settle()
  const mealId = wx.log.nav.pop()[1].split('id=')[1]
  assert.deepEqual(wx.app.globalData.lastTree.arrival, { id: 'panda', name: '大熊猫' })

  const meal = loadPage('meal', wx)
  meal.onLoad({ id: mealId })
  await settle()
  assert.deepEqual(meal.data.arrival, { id: 'panda', name: '大熊猫', image: '/images/garden/items/panda.png', text: '大熊猫闻着竹子香，搬进庭院啦！' })
  meal.goGarden()
  assert.deepEqual(wx.log.nav.pop(), ['switchTab', '/pages/garden/garden'])

  // 回到庭院：熊猫从边上走进来
  garden.onShow()
  await settle()
  assert.equal(garden.data.waitingText, '')
  assert.equal(garden.data.animals.length, 1)
  assert.equal(garden.data.animals[0].id, 'panda')
  assert.equal(garden.data.animals[0].bubble, '我是大熊猫，以后就住这儿啦！')
  garden.clock.advance(20000)
  assert.ok(Number.isFinite(garden.data.animals[0].left) && Number.isFinite(garden.data.animals[0].bottom))
  garden.tapAnimal(event({ index: 0 }))
  assert.ok(garden.data.animals[0].bubble)
  assert.equal(garden.data.animals[0].tapping, true)

  garden.onHide()
  assert.equal(garden.clock.count(), 0)

  // 再进来不会重复走进来
  garden.onShow()
  await settle()
  assert.notEqual(garden.data.animals[0].bubble, '我是大熊猫，以后就住这儿啦！')
  garden.onUnload()
  assert.equal(garden.clock.count(), 0)
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `node --test test/pages.test.js`
Expected: FAIL（`waitingText` undefined 等）

- [ ] **Step 3: 实现 `garden.js`**

1. 顶部加 `const { createLife } = require('../../utils/garden-life')`。
2. `data` 里加：

```js
    animals: [],
    waitingText: '',
```

3. `onShow` / `load` / `render` 改成（并新增 `onHide`、`onUnload`、`syncLife`、`stopLife`、`tapAnimal`）：

```js
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
      .then((view) => this.render(view, true))
      .catch((err) => api.showError(err))
  },

  render(view, fresh) {
    const width = windowWidth() * (1 - SIDE_PADDING_RATIO)
    const L = isoLayout(view.size, width)
    this.garden = view
    this.L = L
    const termItems = view.term && view.term.items.length ? view.term.items.map((id) => itemById(id).name).join('、') : ''
    this.setData({
      loaded: true,
      beans: view.beans,
      collectedCount: view.collectedCount,
      totalCount: view.totalCount,
      term: view.term,
      termText: termItems ? `${view.term.name}限定「${termItems}」正在扭蛋机里` : '',
      waitingText: view.waiting && view.waiting.length ? '👀 有小动物在院子外张望…下次打卡它就来了' : '',
      layout: { width: L.width, height: L.height, top: L.top, landHeight: L.landHeight },
      landImage: `/images/garden/land-${view.size}.png`,
      sprites: buildScene(view.placed, L),
      inventory: inventoryList(view.inventory),
      welcome: view.welcome || this.data.welcome,
      hints: this.data.mode === 'view' ? [] : this.data.hints,
    })
    this.syncLife(view, fresh)
  },

  // ---------------------------------------------------------------- 小动物

  // 刚进页面或庭院变大了就重新安排；摆放、移动之后只告诉它们物件变了
  syncLife(view, fresh) {
    if (this.life && !fresh && this.lifeSize === view.size) {
      this.life.updatePlaced(view.placed)
      return
    }
    this.stopLife()
    this.lifeSize = view.size
    this.life = createLife({
      L: this.L,
      placed: view.placed,
      residents: view.residents || [],
      arrivals: view.arrivals || [],
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
```

4. 摆放时暂停、取消时恢复：`pickInventory` 末尾加 `if (this.life) this.life.pause()`；`tapSprite` 里 `res.tapIndex === 0` 分支的 `this.setData(...)` 后加 `if (this.life) this.life.pause()`；`cancel()` 末尾加 `if (this.life) this.life.resume()`。

（`save()` 成功时先 `this.cancel()` 再 `this.render(view)`：先恢复走动，再 `updatePlaced`，让脚下被放了东西的动物跳开。）

- [ ] **Step 4: 实现 `garden.wxml`**

`termText` 那行下面加：

```xml
  <view wx:if="{{waitingText}}" class="waiting">{{waitingText}}</view>
```

`#garden` 容器里、物件 `<image wx:for="{{sprites}}" .../>` 之后加：

```xml
    <view wx:for="{{animals}}" wx:key="id" class="animal {{mode === 'view' ? '' : 'animal-ghost'}}" style="left: {{item.left}}px; bottom: {{item.bottom}}px; width: {{item.width}}px; z-index: {{item.z + 10}}; transition-duration: {{item.duration}}ms" data-index="{{index}}" catchtap="tapAnimal">
      <view wx:if="{{item.bubble}}" class="bubble" style="width: {{item.bubbleWidth}}px; left: {{item.bubbleLeft}}px">{{item.bubble}}</view>
      <view wx:if="{{item.emoji}}" class="act-emoji">{{item.emoji}}</view>
      <view wx:if="{{item.tapping}}" class="heart">❤️</view>
      <view class="animal-body {{item.flip ? 'flip' : ''}} {{item.action === 'swim' ? 'in-water' : ''}}" style="height: {{item.bodyHeight}}px">
        <image class="animal-img act-{{item.action}} {{item.id === 'duck' && item.action === 'swim' ? 'paddle' : ''}} {{item.tapping ? 'tap' : ''}}" src="{{item.image}}" mode="widthFix" />
      </view>
      <view wx:if="{{item.action === 'swim'}}" class="ripple"></view>
    </view>
```

- [ ] **Step 5: 实现 `garden.wxss`**（追加）

```css
.waiting {
  font-size: 26rpx;
  color: var(--primary);
  background: #eef6ea;
  border-radius: 16rpx;
  padding: 12rpx 20rpx;
  margin-bottom: 16rpx;
}

/* ---------------------------------------------------------------- 小动物 */

.animal {
  position: absolute;
  transition-property: left, bottom;
  transition-timing-function: linear;
}

.animal-ghost {
  opacity: 0.35;
  pointer-events: none;
}

.animal-body {
  position: relative;
}

/* 镜像放在外层，里面的图片还能做自己的动画 */
.flip {
  transform: scaleX(-1);
}

/* 下水：只露出上半身 */
.in-water {
  overflow: hidden;
}

.animal-img {
  display: block;
  width: 100%;
  transform-origin: 50% 100%;
  filter: drop-shadow(0 4rpx 3rpx rgba(60, 50, 30, 0.25));
}

.act-walk {
  animation: hop 0.4s ease-in-out infinite;
}

.act-idle,
.act-bask,
.act-warm {
  animation: breathe 2.4s ease-in-out infinite;
}

.act-sleep,
.act-perch {
  animation: breathe 3.6s ease-in-out infinite;
}

.act-eat {
  animation: chomp 0.5s ease-in-out infinite;
}

.act-peck {
  animation: peck 0.3s ease-in-out infinite;
}

.act-swim {
  animation: bob 1.6s ease-in-out infinite;
}

.act-swing {
  transform-origin: 50% -40%;
  animation: swing 1.8s ease-in-out infinite;
}

/* 小黄鸭在池子里来回划水 */
.paddle {
  animation: paddle 4s ease-in-out infinite;
}

@keyframes paddle {
  0%,
  100% {
    transform: translateX(-18%) translateY(0);
  }
  50% {
    transform: translateX(18%) translateY(4%);
  }
}

/* 放在各种动作后面：点一下的跳跃优先 */
.tap {
  animation: jump 0.6s ease-out;
}

@keyframes hop {
  0%,
  100% {
    transform: translateY(0);
  }
  50% {
    transform: translateY(-12%);
  }
}

@keyframes breathe {
  0%,
  100% {
    transform: scale(1, 1);
  }
  50% {
    transform: scale(1.02, 0.97);
  }
}

@keyframes chomp {
  0%,
  100% {
    transform: rotate(0) translateY(0);
  }
  50% {
    transform: rotate(-6deg) translateY(4%);
  }
}

@keyframes peck {
  0%,
  100% {
    transform: rotate(0);
  }
  50% {
    transform: rotate(18deg) translateY(6%);
  }
}

@keyframes bob {
  0%,
  100% {
    transform: translateY(0);
  }
  50% {
    transform: translateY(5%);
  }
}

@keyframes swing {
  0%,
  100% {
    transform: rotate(-14deg);
  }
  50% {
    transform: rotate(14deg);
  }
}

@keyframes jump {
  0%,
  100% {
    transform: translateY(0) scale(1, 1);
  }
  30% {
    transform: translateY(-30%) scale(1.05, 0.95);
  }
  60% {
    transform: translateY(0) scale(1.08, 0.92);
  }
}

.ripple {
  position: absolute;
  left: 10%;
  bottom: -8%;
  width: 80%;
  height: 24%;
  border: 3rpx solid rgba(255, 255, 255, 0.9);
  border-radius: 50%;
  animation: ripple 1.8s ease-out infinite;
}

@keyframes ripple {
  0% {
    transform: scale(0.5);
    opacity: 1;
  }
  100% {
    transform: scale(1.4);
    opacity: 0;
  }
}

.bubble {
  position: absolute;
  bottom: 100%;
  margin-bottom: 8rpx;
  padding: 8rpx 16rpx;
  box-sizing: border-box;
  background: #fff;
  border-radius: 20rpx;
  font-size: 26rpx;
  line-height: 1.4;
  color: #4a3f35;
  text-align: center;
  box-shadow: 0 4rpx 12rpx rgba(60, 50, 30, 0.18);
  z-index: 2;
}

.act-emoji {
  position: absolute;
  right: -10%;
  top: -10%;
  font-size: 30rpx;
  animation: float 1.6s ease-in-out infinite;
}

@keyframes float {
  0%,
  100% {
    transform: translateY(0);
  }
  50% {
    transform: translateY(-8rpx);
  }
}

.heart {
  position: absolute;
  left: 50%;
  top: -20%;
  font-size: 32rpx;
  animation: rise 0.9s ease-out forwards;
}

@keyframes rise {
  0% {
    transform: translate(-50%, 0) scale(0.6);
    opacity: 1;
  }
  100% {
    transform: translate(-50%, -60rpx) scale(1.2);
    opacity: 0;
  }
}
```

- [ ] **Step 6: 跑页面测试**

Run: `node --test test/pages.test.js`
Expected: 庭院小动物用例仍 FAIL 在 `globalData.lastTree.arrival` / `meal.data.arrival`（Task 7 实现）；其余页面用例 PASS（尤其 WXML 标签配对、事件函数、数据引用检查）

- [ ] **Step 7: 提交**（Task 7 完成后整体变绿；这里先提交页面本身）

```bash
node --check miniprogram/pages/garden/garden.js
git add miniprogram/pages/garden test/pages.test.js
git commit -m "feat(animals): garden page renders wandering animals with CSS actions

<trailer>"
```

---

### Task 7: 打卡结果页搬家横幅 + 图鉴「小动物」组

**Files:**
- Modify: `miniprogram/pages/checkin/checkin.js`
- Modify: `miniprogram/pages/meal/meal.js`、`meal.wxml`、`meal.wxss`
- Modify: `miniprogram/utils/garden-view.js`（`collectionGroups`、新增 `arrivalCard`）
- Modify: `miniprogram/pages/collection/collection.wxml`、`collection.wxss`
- Test: `test/garden-view.test.js`、`test/pages.test.js`

**Interfaces:**
- Consumes: `ANIMAL_INFO`（Task 4）；`meal.analyze` 的 `arrival`（Task 3）
- Produces: `arrivalCard(arrival) → { id, name, image, text } | null`；`collectionGroups` 多一组 `{ id: 'animals', label: '小动物', color: '#4E7D5B' }`，其中每项多 `hint`（`喜欢：…`）

- [ ] **Step 1: 写失败的测试**（`test/garden-view.test.js`：顶部解构加 `arrivalCard`；替换 `collectionGroups` 用例）

```js
test('collectionGroups：按稀有度分组（不含小动物），再加小动物和节气限定', () => {
  const groups = collectionGroups(['daisy', 'panda', 'snowman', 'osmanthus'])
  assert.deepEqual(groups.map((g) => [g.label, g.items.length]), [
    ['普通', 15], ['稀有', 10], ['珍稀', 6], ['传说', 3], ['小动物', 9], ['节气限定', 5],
  ])
  const daisy = groups[0].items.find((i) => i.id === 'daisy')
  assert.equal(daisy.collected, true)
  assert.equal(groups[0].collectedCount, 1)
  assert.equal(groups[0].items.find((i) => i.id === 'grass').collected, false)
  const animals = groups[4]
  assert.equal(animals.id, 'animals')
  assert.equal(animals.collectedCount, 1)
  assert.equal(animals.items.find((i) => i.id === 'panda').hint, '喜欢：翠竹')
  assert.equal(animals.items.find((i) => i.id === 'panda_family').hint, '喜欢：大熊猫 + 3 丛翠竹')
  assert.equal(groups[0].items[0].hint, '')
  const snowman = groups[5].items.find((i) => i.id === 'snowman')
  assert.equal(snowman.termName, '小雪')
  assert.equal(snowman.collected, true)
})

test('arrivalCard：搬家横幅', () => {
  assert.deepEqual(arrivalCard({ id: 'panda', name: '大熊猫' }), {
    id: 'panda', name: '大熊猫', image: '/images/garden/items/panda.png', text: '大熊猫闻着竹子香，搬进庭院啦！',
  })
  assert.equal(arrivalCard(null), null)
  assert.equal(arrivalCard(undefined), null)
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `node --test test/garden-view.test.js`
Expected: FAIL

- [ ] **Step 3: 实现 `garden-view.js`**

1. 顶部加 `const { ANIMAL_INFO } = require('./animals')`。
2. `collectionGroups` 整个替换为：

```js
function collectionGroups(collected) {
  const has = (id) => collected.indexOf(id) !== -1
  const isAnimal = (i) => i.kind === 'animal'
  const toEntry = (i) => ({
    id: i.id,
    name: i.name,
    image: itemImage(i.id),
    collected: has(i.id),
    termName: i.term ? termName(i.term) : '',
    hint: isAnimal(i) ? ANIMAL_INFO[i.id].likesText : '',
  })
  const groups = RARITIES.map((r) => ({
    id: r.id,
    label: r.label,
    color: r.color,
    items: ITEMS.filter((i) => i.rarity === r.id && !i.starter && !i.term && !isAnimal(i)).map(toEntry),
  }))
  groups.push({ id: 'animals', label: '小动物', color: '#4E7D5B', items: ITEMS.filter(isAnimal).map(toEntry) })
  groups.push({ id: 'seasonal', label: '节气限定', color: '#D97A1E', items: ITEMS.filter((i) => i.term).map(toEntry) })
  return groups.map((g) => ({ ...g, collectedCount: g.items.filter((i) => i.collected).length }))
}

// 打卡结果页的搬家横幅
function arrivalCard(arrival) {
  if (!arrival) return null
  return { id: arrival.id, name: arrival.name, image: itemImage(arrival.id), text: ANIMAL_INFO[arrival.id].arrive }
}
```

3. `module.exports` 加 `arrivalCard`。

- [ ] **Step 4: 实现页面**

`miniprogram/pages/checkin/checkin.js`：

```js
        getApp().globalData.lastTree = { mealId: meal._id, tree: meal.tree, arrival: meal.arrival }
```

`miniprogram/pages/meal/meal.js`：顶部加 `const { arrivalCard } = require('../../utils/garden-view')`；`data` 加 `arrival: null,`；`onLoad` 里那段改成：

```js
    if (last && last.mealId === options.id) {
      this.setData({ tree: decorateTree(last.tree), arrival: arrivalCard(last.arrival) })
      app.globalData.lastTree = null
    }
```

`miniprogram/pages/meal/meal.wxml`：树横幅那个 `</view>`（`tree-banner` 结束）之后加：

```xml
  <view wx:if="{{arrival}}" class="card arrival-banner" bindtap="goGarden">
    <image class="arrival-image" src="{{arrival.image}}" mode="aspectFit" />
    <view class="arrival-body">
      <view class="arrival-title">{{arrival.text}}</view>
      <view class="arrival-link">去庭院看看 ›</view>
    </view>
  </view>
```

`miniprogram/pages/meal/meal.wxss`：`.tree-banner-hint` 规则之后加：

```css
.arrival-banner {
  display: flex;
  align-items: center;
  padding: 16rpx 24rpx;
  background: linear-gradient(90deg, #fff4e0 0%, #ffffff 80%);
}

.arrival-image {
  width: 120rpx;
  height: 120rpx;
  flex-shrink: 0;
}

.arrival-body {
  flex: 1;
  margin-left: 16rpx;
}

.arrival-title {
  font-size: 32rpx;
  font-weight: 700;
  color: #b8763a;
}

.arrival-link {
  font-size: 28rpx;
  color: var(--primary);
  margin-top: 6rpx;
}
```

`miniprogram/pages/collection/collection.wxml`：`cell-term` 那行后面加：

```xml
        <view wx:if="{{item.hint && !item.collected}}" class="cell-hint">{{item.hint}}</view>
```

`miniprogram/pages/collection/collection.wxss` 追加：

```css
.cell-hint {
  font-size: 20rpx;
  color: var(--primary);
  padding: 0 4rpx;
}
```

- [ ] **Step 5: 跑测试确认通过**

Run: `node --test test/garden-view.test.js test/pages.test.js`
Expected: PASS（包括 Task 6 的庭院小动物页面用例）

- [ ] **Step 6: 全量测试并提交**

```bash
npm test 2>&1 | grep -E "^# (pass|fail)"
for f in miniprogram/utils/garden-view.js miniprogram/pages/checkin/checkin.js miniprogram/pages/meal/meal.js; do node --check $f; done
git add miniprogram/utils/garden-view.js miniprogram/pages/checkin miniprogram/pages/meal miniprogram/pages/collection test/garden-view.test.js test/pages.test.js
git commit -m "feat(animals): arrival banner after check-in and an animals group in the collection

<trailer>"
```

---

### Task 8: 截图检查、调落脚点、文档、部署

**Files:**
- Modify（不进仓库）：scratchpad 里的 `preview/shoot.js`、`preview/wxml-render.js`
- Modify: `miniprogram/utils/animals.js`（只调 `PLAYS` 的 `spot`，视截图而定）
- Modify: `README.md`、`CLAUDE.md`、`docs/superpowers/specs/2026-10-23-garden-animals-design.md`（状态改「已确认」）

- [ ] **Step 1: 截图**

在 `shoot.js` 的庭院部分：给 gardens 文档写入 `residents`（panda、duck、tabby_cat、chick）和对应物件（bamboo、koi_pond、stool、grass），庭院页 `clock` 用手动时钟、`random` 固定，`advance` 到出现 `eat`、`swim`、`perch` 各一次时分别截图；渲染器里 `.animal` 的 `transition` 去掉（截图要终点位置）。看图确认：动物大小合适、和物件前后遮挡正确、下水只露上半身、坐在板凳/茶桌台面上、气泡不出屏幕。

- [ ] **Step 2: 调落脚点**

按截图调 `PLAYS` 里 `koi_pond / lotus_pond / zigzag_bridge / stool / tea_table / stone_table / swing_tree / pebbles` 的 `spot`，重新截图直到位置对。跑 `node --test test/animals.test.js test/garden-life.test.js`。

- [ ] **Step 3: 文档**

README「养生庭院」部分加「### 小动物」小节：对照表（同设计文档）、什么时候搬来、特殊动作、点一下；README 扭蛋那条改成「一共 48 种：扭蛋里 39 种（普通 15 · 稀有 10 · 珍稀 6 · 传说 3 · 节气限定 5）+ 9 只小动物」。CLAUDE.md 「当前状态」加一行 2026-10-23 小动物上线；设计文档状态改「已确认」。

- [ ] **Step 4: 全量测试、提交、推送**

```bash
npm test 2>&1 | grep -E "^# (pass|fail)"
git add -A && git commit -m "docs: garden animals in README; tune play spots

<trailer>"
git push -u origin claude/mini-program-dev-nzn2n0
```

- [ ] **Step 5: 部署与预览**

```bash
npm run wx:function
npm run wx:preview
```

用 SendUserFile 把 `.wechat/preview-qrcode.jpg` 发给用户；说明试法：庭院里摆一丛翠竹 → 打卡一顿正餐 → 结果页出现熊猫 → 去庭院看它走进来，点它说话、等它去吃竹子。
