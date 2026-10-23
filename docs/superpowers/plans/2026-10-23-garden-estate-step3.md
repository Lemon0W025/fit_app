# 园林大宅院（第三步：步态、新物件、小鸟蝴蝶、原画工具）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 小动物按各自的步态走（不再蹦着平移）、一次走一小段；扭蛋池加 18 件新物件（水生、院子家具）；小鸟和蝴蝶两只会飞的新动物；原画「对齐切块 → 传云存储 → 页面按配置切换」的工具链先用白模跑通。

**Architecture:** 步态是 `ANIMAL_INFO.gait` + WXSS 关键帧，走路时才挂；`strollTarget` 让动物一次走 2～4 格再歇。新物件只改 `shared/garden.js` 的表（地面类别、占格、喜欢关系），`waitingAnimals` 加 `likesAny`。会飞的动物在 `garden-life.js` 里单独一条路：不占格、在「停靠点」（树、花、喂鸟台、花架、假山）之间按像素直线飞，夜里 / 非活动时段藏起来。原画工具：`scripts/estate/cut_art.py` 把整图按世界框对齐切 16 块，`npm run wx:art` 传云存储并打印 fileID 前缀，`config.estateArt` 为空时页面用本地白模切块。

**Tech Stack:** 微信小程序原生、微信云开发、node:test、Python + Pillow、miniprogram-ci（`cloud.uploadStorage`）。

## Global Constraints

- 设计文档：`docs/superpowers/specs/2026-10-23-garden-estate-design.md`（「物件 → 新物件」「小动物 → 小鸟和蝴蝶」「画面 → 底图」「上线节奏」）
- `cloudfunctions/api/lib/shared/*` 改完立即 `cp` 到 `miniprogram/utils/shared/`
- 每个任务：`npm test` 全绿、改过的 JS `node --check`、Python `ast.parse`；提交信息结尾 `<trailer>` = `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>` 和 `Claude-Session: https://claude.ai/code/session_01CX9A8LkVQKcNnTEsxo35Fv` 两行
- 用户反馈（优先）：熊猫、猫这类四条腿的要「走」，不能蹦；鸟要「飞」；别一格一格平移地跳。兔子蹦是对的
- 新物件按设计文档的表：普通 11 件（lotus_clump 荷花丛、water_lily 睡莲、reeds 芦苇、stepping_stones 汀步石、bamboo_blind 竹帘、straw_nest 草窝、feed_trough 食槽、haystack 草垛、scarecrow 稻草人、ladder 木梯、fruit_basket 果篮）、稀有 7 件（koi_school 锦鲤群、plank_bridge 小木栈桥、tea_stove 茶炉、bath_tub 泡汤木桶、flower_rack 花架、bench 长椅、bird_feeder 喂鸟台）；图鉴 48 + 18 + 2 = 68
- 小鸟：树满 3 棵（osmanthus、orange_tree、persimmon_tree、plum_tree、golden_ginkgo、swing_tree、starter_tree）或摆了喂鸟台；白天飞、19 点后藏在树里。蝴蝶：花满 3 丛（daisy、chrysanthemum、orchid、sunflower、dandelion、wintersweet、lotus_clump、water_lily）或摆了花架；8～18 点出现
- 新图先用 emoji 占位（`scripts/draw-images.py` 自动补），正式图到了再切
- 页面默认仍用本地白模切块（`config.estateArt = ''`）；云存储那套只验证能传，等原画到了、真机看过再切换

---

### Task 1: 步态：四条腿的走、鸟飞、一次走一小段

**Files:**
- Modify: `miniprogram/utils/animals.js`、`miniprogram/utils/garden-life.js`、`miniprogram/pages/garden/garden.wxml`、`miniprogram/pages/garden/garden.wxss`
- Test: `test/animals.test.js`、`test/garden-life.test.js`

**Interfaces:**
- Produces: `ANIMAL_INFO[id].gait ∈ { pad, waddle, hop, crawl, stride, fly, flutter }`、`GAITS`（合法值列表）、`strollTarget(pos, { size, blocked, free, home, allow }, rand) → { target, path } | null`（2～4 格的小段路）；sprite 多 `gait`

- [ ] **Step 1: 写失败的测试**

`test/animals.test.js`「每只动物都有脾气…」里 `assert.ok(info.lines.length >= 4, id)` 后面加一行 `assert.ok(A.GAITS.indexOf(info.gait) !== -1, id)`；测试末尾（`assert.deepEqual(A.SWIMMERS, …)` 后）加：

```js
  assert.deepEqual([A.ANIMAL_INFO.panda.gait, A.ANIMAL_INFO.tabby_cat.gait, A.ANIMAL_INFO.rabbit.gait, A.ANIMAL_INFO.duck.gait, A.ANIMAL_INFO.turtle.gait, A.ANIMAL_INFO.crane.gait],
    ['pad', 'pad', 'hop', 'waddle', 'crawl', 'stride'])
```

文件末尾追加：

```js
test('strollTarget：一次走 2～4 格的小段路，只走允许的格子，离家远了往家走', () => {
  const free = []
  for (let c = 0; c < 8; c++) for (let r = 0; r < 8; r++) free.push({ c, r })
  const ctx = { size: 8, blocked: blocked(), free, home: null, allow: null }
  for (const v of [0.1, 0.5, 0.9]) {
    const s = A.strollTarget({ c: 3, r: 3 }, ctx, always(v))
    assert.ok(s && s.path.length >= 2 && s.path.length <= 4, JSON.stringify(s))
    assert.deepEqual(s.path[s.path.length - 1], s.target)
  }
  const left = A.strollTarget({ c: 3, r: 3 }, { ...ctx, allow: (t) => t.c <= 3 }, always(0.3))
  assert.ok(left.target.c <= 3 && left.path.every((t) => t.c <= 3))
  // 离家远：目标比现在离家近
  const home = { c: 0, r: 0 }
  for (const v of [0.1, 0.5, 0.9]) {
    const s = A.strollTarget({ c: 6, r: 6 }, { ...ctx, home }, always(v))
    assert.ok(Math.abs(s.target.c) + Math.abs(s.target.r) < 12, JSON.stringify(s.target))
  }
  // 被围住：null
  assert.equal(A.strollTarget({ c: 0, r: 0 }, { ...ctx, blocked: blocked([1, 0], [0, 1]) }, always(0.5)), null)
})
```

`test/garden-life.test.js` 追加：

```js
test('走路带步态，而且一次走一小段，不是一格一停', () => {
  const { clock, life, sprites } = setup({ placed: [], residents: ['panda'], random: lcg(17) })
  life.start()
  let longest = 0
  let run = 0
  let gait = ''
  for (let t = 0; t < 3 * 60 * 1000; t += 100) {
    clock.advance(100)
    if (sprites[0].action === 'walk') {
      gait = sprites[0].gait
      run += 1
      longest = Math.max(longest, run)
    } else {
      run = 0
    }
  }
  assert.equal(gait, 'pad')
  // 熊猫一步 1800ms：连续走 2 格以上就是 ≥ 36 个 100ms 采样
  assert.ok(longest >= 36, `最长连续走 ${longest}`)
  life.stop()
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `node --test test/animals.test.js test/garden-life.test.js`
Expected: FAIL

- [ ] **Step 3: `animals.js`**

1. 每只的 `ANIMAL_INFO` 第一行（`scale: …, faces: …, top: …,`）末尾加 `gait`：chick `gait: 'waddle'`、rabbit `'hop'`、duck `'waddle'`、turtle `'crawl'`、tabby_cat `'pad'`、ginger_cat `'pad'`、panda `'pad'`、crane `'stride'`、panda_family `'pad'`。
2. `ANIMAL_INFO` 定义前面加：

```js
// 步态：pad 四条腿踱步 / waddle 摇摇摆摆 / hop 蹦 / crawl 爬 / stride 迈大步 / fly 飞 / flutter 扑棱（后两种给会飞的）
const GAITS = ['pad', 'waddle', 'hop', 'crawl', 'stride', 'fly', 'flutter']
```

`ANIMAL_INFO` 上面的注释里补一句「gait：走路的样子，页面按它挂不同的动画」。
3. `wanderTarget` 后面加：

```js
// 平时溜达：一次走 2～4 格的小段路再歇（比一格一停自然）；有家且离得远就往家那边走；allow 限制范围
function strollTarget(pos, { size, blocked, free, home, allow }, rand) {
  let pool = free.filter((t) => dist(t, pos) >= 2 && dist(t, pos) <= 4)
  if (allow) pool = pool.filter(allow)
  if (home && dist(pos, home) > HOME_RANGE) {
    const closer = pool.filter((t) => dist(t, home) < dist(pos, home))
    if (closer.length) pool = closer
  }
  for (let i = 0; i < 4 && pool.length; i++) {
    const t = pickOne(pool, rand)
    const path = pathTo(pos, t, size, blocked)
    if (path && path.length <= 4 && (!allow || path.every(allow))) return { target: t, path }
    pool = pool.filter((x) => x !== t)
  }
  return null
}
```

4. `module.exports` 加 `GAITS,`、`strollTarget,`。

- [ ] **Step 4: `garden-life.js`**

1. `sprite()` 返回对象里 `flip: a.flip,` 下面加 `gait: a.info.gait,`。
2. `turn()` 末尾这段：

```js
    const allow = period === 'morning' ? (t) => A.MORNING_AREAS.indexOf(areaOf(t.c, t.r)) !== -1 : null
    const next = A.chooseStep(a, { size: bounds, blocked, home: A.homeOf(a.id, items), allow }, random)
    if (!next) return schedule(a, between(a.info.pauseMs))
    step(a, next)
```

改成：

```js
    const allow = period === 'morning' ? (t) => A.MORNING_AREAS.indexOf(areaOf(t.c, t.r)) !== -1 : null
    const home = A.homeOf(a.id, items)
    const stroll = A.strollTarget(a, { size: bounds, blocked, free: freeTiles(blocked), home, allow }, random)
    if (stroll) return go(a, 'wander', stroll)
    const next = A.chooseStep(a, { size: bounds, blocked, home, allow }, random)
    if (!next) return schedule(a, between(a.info.pauseMs))
    step(a, next)
```

- [ ] **Step 5: 页面**

`garden.wxml` 里动物图片那行 `class="animal-img act-{{item.action}} {{item.id === 'duck' && item.action === 'swim' ? 'paddle' : ''}} {{item.tapping ? 'tap' : ''}}"` 改成 `class="animal-img act-{{item.action}} {{item.action === 'walk' ? 'gait-' + item.gait : ''}} {{item.id === 'duck' && item.action === 'swim' ? 'paddle' : ''}} {{item.tapping ? 'tap' : ''}}"`。

`garden.wxss`：删掉 `.act-walk { animation: hop 0.4s ease-in-out infinite; }`，在 `.act-idle,` 那条规则前面加：

```css
/* 走路的步态：四条腿的左右踱步，不蹦；鸭子小鸡摇摇摆摆；兔子蹦；乌龟慢慢爬；仙鹤迈大步 */
.gait-pad {
  animation: pad 0.56s ease-in-out infinite;
}

.gait-waddle {
  animation: waddle 0.36s ease-in-out infinite;
}

.gait-hop {
  animation: hop 0.45s ease-in-out infinite;
}

.gait-crawl {
  animation: crawl 1.4s ease-in-out infinite;
}

.gait-stride {
  animation: stride 0.9s ease-in-out infinite;
}

/* 会飞的：上下起伏地飞；蝴蝶扑棱翅膀 */
.gait-fly {
  animation: fly 0.8s ease-in-out infinite;
}

.gait-flutter {
  animation: flutter 0.24s ease-in-out infinite;
}

@keyframes pad {
  0%,
  100% {
    transform: rotate(-3deg) scale(1, 0.985);
  }
  50% {
    transform: rotate(3deg) scale(1, 1);
  }
}

@keyframes waddle {
  0%,
  100% {
    transform: rotate(-7deg);
  }
  50% {
    transform: rotate(7deg);
  }
}

@keyframes crawl {
  0%,
  100% {
    transform: scale(1, 1) rotate(-1.5deg);
  }
  50% {
    transform: scale(1.04, 0.97) rotate(1.5deg);
  }
}

@keyframes stride {
  0%,
  100% {
    transform: rotate(-2deg) translateY(0);
  }
  50% {
    transform: rotate(2deg) translateY(-2%);
  }
}

@keyframes fly {
  0%,
  100% {
    transform: translateY(0) rotate(-3deg);
  }
  50% {
    transform: translateY(-14%) rotate(3deg);
  }
}

@keyframes flutter {
  0%,
  100% {
    transform: scale(1, 1) translateY(0);
  }
  50% {
    transform: scale(0.55, 1.05) translateY(-6%);
  }
}
```

- [ ] **Step 6: 跑测试、提交**

```bash
node --test test/animals.test.js test/garden-life.test.js test/pages.test.js 2>&1 | grep -E "^# (pass|fail)|^not ok"
for f in miniprogram/utils/animals.js miniprogram/utils/garden-life.js; do node --check $f; done
git add miniprogram/utils/animals.js miniprogram/utils/garden-life.js miniprogram/pages/garden test/animals.test.js test/garden-life.test.js
git commit -m "feat(animals): per-animal gaits and short strolls instead of hopping tile by tile

<trailer>"
```

---

### Task 2: 18 件新物件、`likesAny`、新的互动

**Files:**
- Modify: `cloudfunctions/api/lib/shared/garden.js`（复制到 miniprogram）、`miniprogram/utils/animals.js`
- Test: `test/garden.test.js`、`test/animals.test.js`、`test/garden-view.test.js`、`test/services-garden.test.js`
- Create（生成）：`miniprogram/images/garden/items/<18 个新 id>.png`（emoji 占位）

**Interfaces:**
- Produces: `ITEMS` 多 18 件（含 `ground`、`foot`）；动物的 `likes` 扩充；`waitingAnimals` 支持 `likesAny: string[]`（摆了其中任一件就够）；`collectibleCount() === 66`；`PLAYS` 新增 koi_school、lotus_clump、plank_bridge、stepping_stones、bench、straw_nest、feed_trough、haystack、bath_tub、tea_stove、scarecrow

- [ ] **Step 1: 写失败的测试**

`test/garden.test.js`：
1. 「物品表：…」里 `[15, 15, 9, 4]` → `[26, 22, 9, 4]`，`collectibleCount(), 48` → `collectibleCount(), 66`。
2. 「物件的地面和占格」末尾追加：

```js
  assert.deepEqual(itemById('lotus_clump').ground, ['water'])
  assert.deepEqual(itemById('koi_school').ground, ['water'])
  assert.deepEqual(itemById('bench').ground, ['lawn', 'pave'])
  assert.deepEqual(itemById('scarecrow').ground, ['lawn', 'soil'])
  assert.equal(itemById('flower_rack').foot, 2)
  assert.equal(itemById('bird_feeder').rarity, 'rare')
  assert.equal(itemById('reeds').rarity, 'common')
```

3. 「小动物：9 只…」里 `assert.deepEqual(itemById('panda').likes, ['bamboo'])` 后面加：

```js
  assert.deepEqual(itemById('duck').likes, ['koi_pond', 'koi_school'])
  assert.deepEqual(itemById('crane').likes, ['lotus_pond', 'lotus_clump'])
  assert.deepEqual(itemById('chick').likes, ['grass', 'feed_trough'])
```

4. 文件末尾追加：

```js
test('waitingAnimals：likesAny 摆一件就够，和 likes 的数量条件二选一', () => {
  const ITEMS_BACKUP = ITEMS.slice()
  ITEMS.push({ id: 'tester', name: '测试鸟', rarity: 'rare', size: 's', emoji: '🐦', kind: 'animal', likes: ['osmanthus', 'orange_tree'], likesCount: 2, likesAny: ['bird_feeder'] })
  try {
    assert.deepEqual(waitingAnimals([{ uid: 'p1', itemId: 'bird_feeder', c: 10, r: 15 }], []), ['tester'])
    assert.deepEqual(waitingAnimals([{ uid: 'p1', itemId: 'osmanthus', c: 10, r: 15 }], []), [])
    assert.deepEqual(waitingAnimals([{ uid: 'p1', itemId: 'osmanthus', c: 10, r: 15 }, { uid: 'p2', itemId: 'orange_tree', c: 12, r: 15 }], []), ['tester'])
    // 排队按最早满足条件的那件算：喂鸟台 p1 比第二棵树 p3 早
    const placed = [{ uid: 'p3', itemId: 'orange_tree', c: 12, r: 15 }, { uid: 'p2', itemId: 'grass', c: 10, r: 16 }, { uid: 'p1', itemId: 'bird_feeder', c: 10, r: 15 }, { uid: 'p4', itemId: 'osmanthus', c: 15, r: 15 }]
    assert.deepEqual(waitingAnimals(placed, []), ['tester', 'chick'])
  } finally {
    ITEMS.length = 0
    ITEMS_BACKUP.forEach((i) => ITEMS.push(i))
  }
})
```

`test/animals.test.js`「互动表里的物件和动物都存在…」末尾加：

```js
  assert.equal(A.PLAYS.bath_tub.action, 'soak')
  assert.equal(A.PLAYS.bench.action, 'perch')
  assert.equal(A.PLAYS.koi_school.action, 'swim')
  assert.equal(A.PLAYS.feed_trough.action, 'peck')
  assert.equal(A.PLAYS.scarecrow.animals[0], 'chick')
```

「每只动物都有脾气…」里 `assert.equal(A.ANIMAL_INFO.panda.likesText, '喜欢：翠竹')` 后加 `assert.equal(A.ANIMAL_INFO.duck.likesText, '喜欢：锦鲤池、锦鲤群')`。

`test/garden-view.test.js`「collectionGroups…」里 `['普通', 15], ['稀有', 10], ['珍稀', 6], ['传说', 3], ['小动物', 9], ['节气限定', 5]` → `['普通', 26], ['稀有', 17], ['珍稀', 6], ['传说', 3], ['小动物', 9], ['节气限定', 5]`。

`test/services-garden.test.js`：`assert.equal(first.totalCount, 48)` → `assert.equal(first.totalCount, 66)`。

- [ ] **Step 2: 跑测试确认失败**

Run: `node --test test/garden.test.js test/animals.test.js test/garden-view.test.js test/services-garden.test.js`
Expected: FAIL

- [ ] **Step 3: `shared/garden.js`**

1. `ITEMS` 里普通那段，`{ id: 'stool', … }` 后面加：

```js
  { id: 'lotus_clump', name: '荷花丛', rarity: 'common', size: 'm', emoji: '🪷' },
  { id: 'water_lily', name: '睡莲', rarity: 'common', size: 's', emoji: '🌺' },
  { id: 'reeds', name: '芦苇', rarity: 'common', size: 'm', emoji: '🌾' },
  { id: 'stepping_stones', name: '汀步石', rarity: 'common', size: 's', emoji: '🪨' },
  { id: 'bamboo_blind', name: '竹帘', rarity: 'common', size: 'm', emoji: '🪟' },
  { id: 'straw_nest', name: '草窝', rarity: 'common', size: 's', emoji: '🪺' },
  { id: 'feed_trough', name: '食槽', rarity: 'common', size: 's', emoji: '🥣' },
  { id: 'haystack', name: '草垛', rarity: 'common', size: 'm', emoji: '🌾' },
  { id: 'scarecrow', name: '稻草人', rarity: 'common', size: 'm', emoji: '🧍' },
  { id: 'ladder', name: '木梯', rarity: 'common', size: 'm', emoji: '🪜' },
  { id: 'fruit_basket', name: '果篮', rarity: 'common', size: 's', emoji: '🧺' },
```

稀有那段，`{ id: 'stone_table', … }` 后面加：

```js
  { id: 'koi_school', name: '锦鲤群', rarity: 'rare', size: 's', emoji: '🐠' },
  { id: 'plank_bridge', name: '小木栈桥', rarity: 'rare', size: 'm', emoji: '🛤️' },
  { id: 'tea_stove', name: '茶炉', rarity: 'rare', size: 's', emoji: '🔥' },
  { id: 'bath_tub', name: '泡汤木桶', rarity: 'rare', size: 'm', emoji: '🛁' },
  { id: 'flower_rack', name: '花架', rarity: 'rare', size: 'l', emoji: '💐' },
  { id: 'bench', name: '长椅', rarity: 'rare', size: 'm', emoji: '🛋️' },
  { id: 'bird_feeder', name: '喂鸟台', rarity: 'rare', size: 'm', emoji: '🐦' },
```

2. 动物的 `likes`：chick `['grass', 'feed_trough']`、rabbit `['radish', 'straw_nest']`、duck `['koi_pond', 'koi_school']`、turtle `['pebbles', 'stepping_stones']`、tabby_cat `['stool', 'bench']`、ginger_cat `['tea_table', 'tea_stove']`、crane `['lotus_pond', 'lotus_clump']`。
3. `GROUNDS` 加 `water: ['water'],`；`ITEM_CLASS` 加 `water: ['lotus_clump', 'water_lily', 'reeds', 'stepping_stones', 'koi_school', 'plank_bridge'],`，`furniture` 列表末尾加 `'bamboo_blind', 'straw_nest', 'feed_trough', 'haystack', 'ladder', 'fruit_basket', 'tea_stove', 'bath_tub', 'flower_rack', 'bench', 'bird_feeder'`；`FOOT2` 末尾加 `'flower_rack'`。
4. `waitingAnimals` 整个替换为：

```js
// 条件满足、还没住进来的动物，按「最后一件需要的物件」摆进花园的先后排队
// likes + likesCount：喜欢的东西够数；likesAny：摆了其中任一件就够。两条路都算，谁早按谁
function waitingAnimals(placed, residentIds) {
  const waiting = []
  ITEMS.forEach((animal) => {
    if (animal.kind !== 'animal' || residentIds.indexOf(animal.id) !== -1) return
    if (animal.needs && residentIds.indexOf(animal.needs) === -1) return
    const orderOf = (ids) => placed.filter((p) => ids.indexOf(p.itemId) !== -1).map((p) => placedOrder(p.uid)).sort((a, b) => a - b)
    const need = animal.likesCount || 1
    const orders = orderOf(animal.likes || [])
    const candidates = []
    if (orders.length >= need) candidates.push(orders[need - 1])
    if (animal.likesAny) {
      const any = orderOf(animal.likesAny)
      if (any.length) candidates.push(any[0])
    }
    if (candidates.length) waiting.push({ id: animal.id, order: Math.min(...candidates) })
  })
  return waiting.sort((a, b) => a.order - b.order).map((w) => w.id)
}
```

- [ ] **Step 4: `animals.js`**

1. `likesText`：chick `'喜欢：青草丛、食槽'`、rabbit `'喜欢：白萝卜、草窝'`、duck `'喜欢：锦鲤池、锦鲤群'`、turtle `'喜欢：鹅卵石、汀步石'`、tabby_cat `'喜欢：小板凳、长椅'`、ginger_cat `'喜欢：茶桌、茶炉'`、crane `'喜欢：荷花池、荷花丛'`。
2. `PLAYS` 里 `sweet_potato_stove` 那行前面加：

```js
  koi_school: { action: 'swim', animals: POND, at: 'on', spot: { x: 0.5, y: 0.3 }, emoji: '🐟', line: '和锦鲤一起游' },
  lotus_clump: { action: 'swim', animals: POND, at: 'on', spot: { x: 0.5, y: 0.25 }, emoji: '🪷', line: '躲在荷叶底下' },
  plank_bridge: { action: 'swim', animals: POND, at: 'on', spot: { x: 0.5, y: 0.3 }, emoji: '💧', line: '从桥底下钻过去' },
  stepping_stones: { action: 'bask', animals: ['turtle'], at: 'on', spot: { x: 0.5, y: 0.45 }, emoji: '☀️', line: '石头晒得热乎乎' },
  bench: { action: 'perch', animals: CATS, at: 'on', spot: { x: 0.5, y: 0.6 }, emoji: '💤', line: '长椅上眯一会儿' },
  straw_nest: { action: 'perch', animals: ['rabbit'], at: 'on', spot: { x: 0.5, y: 0.5 }, emoji: '💤', line: '窝里软软的' },
  feed_trough: { action: 'peck', animals: ['chick'], at: 'beside', emoji: '🌾', line: '开饭啦开饭啦' },
  haystack: { action: 'peck', animals: ['chick'], at: 'beside', emoji: '🌾', line: '草垛里有谷粒' },
  bath_tub: { action: 'soak', animals: CATS.concat(['panda']), at: 'on', spot: { x: 0.5, y: 0.55 }, emoji: '♨️', line: '泡个热水澡，舒坦' },
  tea_stove: { action: 'warm', animals: ['ginger_cat'], at: 'beside', emoji: '🍵', line: '茶炉边最暖和' },
  scarecrow: { action: 'perch', animals: ['chick'], at: 'on', spot: { x: 0.5, y: 0.85 }, emoji: '👀', line: '站得高看得远' },
```

3. `PLAY_DOING` 加 `soak: '泡澡'`。

- [ ] **Step 5: 复制、占位图、跑测试、提交**

```bash
cp cloudfunctions/api/lib/shared/garden.js miniprogram/utils/shared/garden.js
python3 scripts/draw-images.py
ls miniprogram/images/garden/items | wc -l
node --test test/garden.test.js test/animals.test.js test/garden-view.test.js test/services-garden.test.js test/garden-life.test.js test/shared-sync.test.js 2>&1 | grep -E "^# (pass|fail)|^not ok"
npm test 2>&1 | grep -E "^# (pass|fail)"
du -sh --apparent-size miniprogram
for f in cloudfunctions/api/lib/shared/garden.js miniprogram/utils/animals.js; do node --check $f; done
git add -A
git commit -m "feat(garden): 18 new items (water plants, courtyard furniture), likesAny, new plays

<trailer>"
```

Expected：items 目录 67 张（48 + 1 大树 + 18）；全绿；包仍 < 1.6MB。

---

### Task 3: 小鸟和蝴蝶：会飞的住户

**Files:**
- Modify: `cloudfunctions/api/lib/shared/garden.js`（复制到 miniprogram）、`miniprogram/utils/animals.js`、`miniprogram/utils/garden-life.js`、`miniprogram/pages/garden/garden.wxml`
- Test: `test/garden.test.js`、`test/animals.test.js`、`test/garden-life.test.js`、`test/garden-view.test.js`、`test/services-garden.test.js`

**Interfaces:**
- Consumes: Task 1 的 `gait`、Task 2 的 `likesAny`
- Produces: `ITEMS` 多 `bird`（稀有）、`butterfly`（普通），都是 `kind: 'animal', fly: true`；`collectibleCount() === 68`；`ANIMALS` 变成 11 只；`A.FLYERS = { bird, butterfly }`（`perches`、`spotPerches`、`perchY`、`speed`、`restMs`、`hours?`）；`ANIMAL_INFO.bird / butterfly` 带 `fly: true`；sprite 多 `hidden`；`whereIs()` 的 `state` 多 `flyer`；`A.describe` 认 `state.flyer`

- [ ] **Step 1: 写失败的测试**

`test/garden.test.js`：
1. 「物品表」里 `[26, 22, 9, 4]` → `[27, 23, 9, 4]`，`collectibleCount(), 66` → `68`。
2. 「小动物：9 只…」改名「小动物：11 只…」，`assert.deepEqual(ANIMALS, [...])` 改成 `assert.deepEqual(ANIMALS, ['butterfly', 'chick', 'rabbit', 'duck', 'turtle', 'tabby_cat', 'bird', 'panda', 'ginger_cat', 'crane', 'panda_family'])`；末尾加：

```js
  assert.equal(itemById('bird').fly, true)
  assert.equal(itemById('bird').likesCount, 3)
  assert.deepEqual(itemById('bird').likesAny, ['bird_feeder'])
  assert.ok(itemById('bird').likes.indexOf('starter_tree') !== -1)
  assert.deepEqual(itemById('butterfly').likesAny, ['flower_rack'])
  assert.equal(itemById('panda').fly, undefined)
```

3. 「waitingAnimals：likesAny…」保留；文件末尾追加：

```js
test('waitingAnimals：树满 3 棵来小鸟，花满 3 丛来蝴蝶', () => {
  const trees = [{ uid: 'p1', itemId: 'osmanthus', c: 1, r: 19 }, { uid: 'p2', itemId: 'starter_tree', c: 11, r: 16 }, { uid: 'p3', itemId: 'plum_tree', c: 3, r: 21 }]
  assert.deepEqual(waitingAnimals(trees, []), ['bird'])
  assert.deepEqual(waitingAnimals(trees.slice(0, 2), []), [])
  const flowers = [{ uid: 'p1', itemId: 'daisy', c: 19, r: 22 }, { uid: 'p2', itemId: 'sunflower', c: 20, r: 22 }, { uid: 'p3', itemId: 'water_lily', c: 22, r: 13 }]
  assert.deepEqual(waitingAnimals(flowers, []), ['butterfly'])
  assert.deepEqual(waitingAnimals([{ uid: 'p1', itemId: 'flower_rack', c: 10, r: 15 }], []), ['butterfly'])
})
```

`test/animals.test.js`「每只动物都有脾气…」末尾加：

```js
  assert.deepEqual([A.ANIMAL_INFO.bird.gait, A.ANIMAL_INFO.butterfly.gait, A.ANIMAL_INFO.bird.fly, A.ANIMAL_INFO.panda.fly], ['fly', 'flutter', true, undefined])
  assert.deepEqual(Object.keys(A.FLYERS).sort(), ['bird', 'butterfly'])
  for (const f of Object.values(A.FLYERS)) {
    f.perches.forEach((id) => assert.ok(itemById(id) && itemById(id).kind !== 'animal', id))
    assert.ok(f.perchY > 0 && f.perchY < 1 && f.speed > 0 && f.restMs[0] <= f.restMs[1])
  }
  assert.deepEqual(A.FLYERS.butterfly.hours, [8, 18])
  assert.deepEqual(A.FLYERS.bird.spotPerches, ['rockery'])
```

「describe…」末尾加：

```js
  assert.equal(A.describe({ action: 'perch', play: null, trick: null, flyer: 'bird' }, '果园', ''), '在果园的树上歇着')
  assert.equal(A.describe({ action: 'perch', play: null, trick: null, flyer: 'butterfly' }, '花圃院', ''), '在花圃院的花上停着')
  assert.equal(A.describe({ action: 'fly', play: null, trick: null, flyer: 'bird' }, '正院', ''), '在正院飞来飞去')
  assert.equal(A.describe({ action: 'sleep', play: null, trick: null, flyer: 'bird' }, '正院', ''), '在树里睡觉')
  assert.equal(A.describe({ action: 'away', play: null, trick: null, flyer: 'butterfly' }, '', ''), '天凉了，明早再来')
```

`test/garden-view.test.js`：`['小动物', 9]` → `['小动物', 11]`。`test/services-garden.test.js`：`totalCount, 66` → `totalCount, 68`。

`test/garden-life.test.js` 追加：

```js
// 会飞的停在哪：身子底边在物件落点上方 perchY 个图宽
function perchPoints(placed, id) {
  return placed.filter((p) => A.FLYERS[id].perches.indexOf(p.itemId) !== -1).map((p) => {
    const a = itemAnchor(p, L)
    return { x: a.x, bottom: L.height - (a.y - a.width * A.FLYERS[id].perchY) }
  })
}
const onPerch = (s, points) => points.some((p) => Math.abs(s.left + s.width / 2 - p.x) < 0.01 && Math.abs(s.bottom - p.bottom) < 0.01)

test('小鸟在树和喂鸟台之间飞、停在树冠上，不占格；晚上藏在树里，早上再出来', () => {
  const placed = [{ uid: 't1', itemId: 'osmanthus', c: 1, r: 1 }, { uid: 't2', itemId: 'orange_tree', c: 3, r: 4 }, { uid: 'f1', itemId: 'bird_feeder', c: 8, r: 4 }]
  let hour = 10
  const { clock, life, sprites } = setup({ placed, residents: ['bird', 'chick'], random: lcg(4), hour: () => hour })
  const points = perchPoints(placed, 'bird')
  const bird = sprites[0]
  assert.deepEqual([bird.id, bird.gait, bird.shadow, bird.hidden, bird.action], ['bird', 'fly', null, false, 'perch'])
  assert.ok(onPerch(bird, points), '一开始没停在树上')
  life.start()
  const seen = new Set()
  let flew = false
  for (let t = 0; t < 5 * 60 * 1000; t += 200) {
    clock.advance(200)
    const s = sprites[0]
    if (s.action === 'fly') flew = true
    if (s.action === 'perch') {
      assert.ok(onPerch(s, points), `停错地方 ${s.left},${s.bottom}`)
      points.forEach((p, i) => { if (Math.abs(s.left + s.width / 2 - p.x) < 0.01) seen.add(i) })
    }
  }
  assert.ok(flew, '没飞过')
  assert.ok(seen.size >= 2, '只停过一个地方')
  // 小鸡照样能走到树下那格（小鸟不占格）
  assert.ok(sprites[1].action !== undefined)
  hour = 21
  clock.advance(60 * 1000)
  assert.deepEqual([sprites[0].hidden, sprites[0].action], [true, 'sleep'])
  hour = 9
  clock.advance(120 * 1000)
  assert.equal(sprites[0].hidden, false)
  life.stop()
})

test('蝴蝶只在 8～18 点出现，停在花上；没有花就在院子上空盘旋', () => {
  const placed = [{ uid: 'f1', itemId: 'daisy', c: 2, r: 2 }, { uid: 'f2', itemId: 'sunflower', c: 7, r: 3 }]
  let hour = 20
  const { clock, life, sprites } = setup({ placed, residents: ['butterfly'], random: lcg(6), hour: () => hour })
  life.start()
  clock.advance(5000)
  assert.deepEqual([sprites[0].hidden, sprites[0].action, sprites[0].gait], [true, 'away', 'flutter'])
  hour = 10
  clock.advance(120 * 1000)
  assert.equal(sprites[0].hidden, false)
  const points = perchPoints(placed, 'butterfly')
  let perched = false
  for (let t = 0; t < 2 * 60 * 1000 && !perched; t += 200) {
    clock.advance(200)
    if (sprites[0].action === 'perch') perched = onPerch(sprites[0], points)
  }
  assert.ok(perched, '没停到花上')
  life.stop()

  const bare = setup({ placed: [], residents: ['butterfly'], random: lcg(6), hour: () => 10 })
  bare.life.start()
  bare.clock.advance(30000)
  assert.equal(bare.sprites[0].hidden, false)
  assert.ok(Number.isFinite(bare.sprites[0].left) && Number.isFinite(bare.sprites[0].bottom))
  bare.life.stop()
})

test('新来的小鸟从大门飞进来，先说你好；whereIs 说它在树上', () => {
  const placed = [{ uid: 't1', itemId: 'osmanthus', c: 1, r: 1 }]
  const { clock, life, sprites } = setup({ placed, residents: ['bird'], arrivals: ['bird'], door: DOOR, random: lcg(3) })
  const doorCenter = tileCenter(DOOR.c, DOOR.r, L)
  assert.ok(Math.abs(sprites[0].left + sprites[0].width / 2 - doorCenter.x) < 0.01)
  assert.equal(sprites[0].bubble, A.ANIMAL_INFO.bird.hello)
  assert.equal(sprites[0].action, 'fly')
  life.start()
  clock.advance(10000)
  assert.ok(onPerch(sprites[0], perchPoints(placed, 'bird')))
  const w = life.whereIs()[0]
  assert.deepEqual([w.c, w.r, w.area, w.state.flyer], [1, 1, 'main', 'bird'])
  assert.equal(A.describe(w.state, '正院', ''), '在正院的树上歇着')
  // 树收走了：换个地方（没别的地方就在上空盘旋）
  life.updatePlaced([])
  assert.equal(sprites[0].hidden, false)
  life.tap(0)
  assert.ok(sprites[0].bubble)
  life.stop()
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `node --test test/garden.test.js test/animals.test.js test/garden-life.test.js`
Expected: FAIL

- [ ] **Step 3: `shared/garden.js`**

1. `ITEMS` 普通段最后（`fruit_basket` 后）加：

```js
  { id: 'butterfly', name: '蝴蝶', rarity: 'common', size: 's', emoji: '🦋', kind: 'animal', fly: true, likesCount: 3, likesAny: ['flower_rack'],
    likes: ['daisy', 'chrysanthemum', 'orchid', 'sunflower', 'dandelion', 'wintersweet', 'lotus_clump', 'water_lily'] },
```

2. 稀有段 `tabby_cat` 后加：

```js
  { id: 'bird', name: '小鸟', rarity: 'rare', size: 's', emoji: '🐦', kind: 'animal', fly: true, likesCount: 3, likesAny: ['bird_feeder'],
    likes: ['osmanthus', 'orange_tree', 'persimmon_tree', 'plum_tree', 'golden_ginkgo', 'swing_tree', 'starter_tree'] },
```

- [ ] **Step 4: `animals.js`**

1. `ANIMAL_INFO` 加两只（放在 `panda_family` 后面）：

```js
  bird: {
    scale: 0.4, stepMs: 600, pauseMs: [3000, 8000], sleepy: 0, faces: 'left', top: 0.05, gait: 'fly', fly: true,
    likesText: '喜欢：满 3 棵树，或喂鸟台', arrive: '树多了，小鸟扑棱棱飞进花园啦！', hello: '啾啾！我是小鸟，以后就在树上住啦',
    lines: ['啾啾～早起的鸟儿有虫吃', '多晒太阳，骨头好', '饭后走一走，啾', '今天天气真好呀'],
  },
  butterfly: {
    scale: 0.32, stepMs: 600, pauseMs: [2000, 6000], sleepy: 0, faces: 'right', top: 0.05, gait: 'flutter', fly: true,
    likesText: '喜欢：满 3 丛花，或花架', arrive: '花开了，蝴蝶翩翩飞进花园啦！', hello: '我是小蝴蝶，花开的时候就来看你',
    lines: ['花香真好闻～', '慢慢来，别着急', '心情好，身体就好', '陪你在花园里转转'],
  },
```

2. `MORNING_AREAS` 后面加：

```js
// 会飞的：在停靠点之间飞，不占格。perches 能停的物件、spotPerches 能停的壳里活动点；perchY 停在物件图多高处（按图宽的比例，从落点往上）；
// speed 像素 / 秒；restMs 停多久；hours 出现的钟点段（没有就白天都在、19 点后睡）
const FLYERS = {
  bird: {
    perches: ['osmanthus', 'orange_tree', 'persimmon_tree', 'plum_tree', 'golden_ginkgo', 'swing_tree', 'starter_tree', 'bird_feeder'],
    spotPerches: ['rockery'], perchY: 0.78, speed: 220, restMs: [8000, 20000],
  },
  butterfly: {
    perches: ['daisy', 'chrysanthemum', 'orchid', 'sunflower', 'dandelion', 'wintersweet', 'lotus_clump', 'water_lily', 'flower_rack'],
    spotPerches: [], perchY: 0.7, speed: 90, restMs: [4000, 10000], hours: [8, 18],
  },
}
```

3. `describe` 开头加：

```js
  if (state.flyer) {
    if (state.action === 'sleep') return '在树里睡觉'
    if (state.action === 'away') return '天凉了，明早再来'
    if (state.action === 'fly') return `${at}飞来飞去`
    return state.flyer === 'bird' ? `${at}的树上歇着` : `${at}的花上停着`
  }
```

（`const at = …` 那行要在它前面。）
4. `module.exports` 加 `FLYERS,`。

- [ ] **Step 5: `garden-life.js`**

1. 动物对象初始化多几个字段：`c: -1, r: -1, flip: false, action: 'idle', goal: null, path: [], afloat: false,` 后面加 `px: 0, py: 0, perchKey: '', hidden: false,`。
2. `blockedFor` 里 `if (a !== self && inside(a)) set.add(key(a))` 改成 `if (a !== self && !a.info.fly && inside(a)) set.add(key(a))`。
3. `stateOf` 返回对象加 `flyer: a.info.fly ? a.id : '',`。
4. `sprite()`：开头 `const width = L.tileW * a.info.scale` 后面加：

```js
    if (a.info.fly) {
      const bubbleWidth = Math.min(L.tileW * BUBBLE_TILES, L.width)
      const bubbleX = Math.min(Math.max(a.px - bubbleWidth / 2, 0), L.width - bubbleWidth)
      return {
        id: a.id, image: itemImage(a.id), width, bodyHeight: width,
        left: a.px - width / 2, bottom: L.height - a.py,
        z: Math.round(((a.py - L.top) / L.tileH) * 20) + 60,
        flip: a.flip, gait: a.info.gait, action: a.action, duration: a.duration, hidden: a.hidden,
        bubble: a.bubble, bubbleWidth, bubbleLeft: bubbleX - (a.px - width / 2), bubbleBottom: width + 4,
        emoji: '', tapping: a.tapping, shadow: null,
      }
    }
```

地上的动物返回对象里 `flip: a.flip,` 后面加 `hidden: false,`（`gait` Task 1 已加）。
5. `say()` 后面加会飞的那套：

```js
  // ---------------------------------------------------------------- 会飞的

  // 能停的地方：摆着的树 / 花 / 喂鸟台 / 花架，和壳里的活动点；都没有就在网格正中上空盘旋
  function perchesFor(a) {
    const f = A.FLYERS[a.id]
    const out = []
    items.forEach((p) => {
      if (f.perches.indexOf(p.itemId) === -1) return
      const anchor = itemAnchor(p, L)
      out.push({ key: `item:${p.uid}`, c: p.c, r: p.r, x: anchor.x, y: anchor.y - anchor.width * f.perchY })
    })
    spots.forEach((s) => {
      if (f.spotPerches.indexOf(s.id) === -1) return
      const center = tileCenter(s.c, s.r, L)
      out.push({ key: `spot:${s.id}`, c: s.c, r: s.r, x: center.x, y: center.y - L.tileW * 1.2 })
    })
    if (!out.length) {
      const c = Math.floor(bounds.cols / 2)
      const r = Math.floor(bounds.rows / 2)
      const center = tileCenter(c, r, L)
      out.push({ key: 'sky', c, r, x: center.x, y: center.y - L.tileW * 1.5 })
    }
    return out
  }

  function land(a, dest) {
    a.px = dest.x
    a.py = dest.y
    a.c = dest.c
    a.r = dest.r
    a.perchKey = dest.key
  }

  function flyTo(a, dest) {
    const f = A.FLYERS[a.id]
    const d = Math.hypot(dest.x - a.px, dest.y - a.py)
    a.flip = A.flipFor(a.info.faces, { c: a.px, r: 0 }, { c: dest.x, r: 0 }, a.flip)
    a.duration = Math.max(400, Math.round((d / f.speed) * 1000))
    land(a, dest)
    a.action = 'fly'
    a.hidden = false
    emit(a)
    schedule(a, a.duration)
  }

  function flyerTurn(a) {
    const f = A.FLYERS[a.id]
    const h = hour()
    const away = f.hours ? h < f.hours[0] || h >= f.hours[1] : A.periodOf(h) === 'night'
    if (away) {
      a.hidden = true
      a.action = f.hours ? 'away' : 'sleep'
      emit(a)
      return schedule(a, between(NIGHT_MS))
    }
    if (a.action === 'fly') {
      a.action = 'perch'
      emit(a)
      return schedule(a, between(f.restMs))
    }
    // 歇够了、刚醒：换个地方停
    const all = perchesFor(a)
    const others = all.filter((p) => p.key !== a.perchKey)
    const dest = others.length ? others[Math.min(others.length - 1, Math.floor(random() * others.length))] : all[0]
    if (!dest || dest.key === a.perchKey) {
      a.action = 'perch'
      a.hidden = false
      emit(a)
      return schedule(a, between(f.restMs))
    }
    flyTo(a, dest)
  }
```

6. `turn(a)` 开头 `a.timer = null` 后面加 `if (a.info.fly) return flyerTurn(a)`。
7. `settleIn` 开头加：

```js
    if (a.info.fly) {
      const all = perchesFor(a)
      land(a, all[Math.min(all.length - 1, Math.floor(random() * all.length))])
      a.action = 'perch'
      return
    }
```

8. `walkIn` 开头 `if (!door) return settleIn(a)` 后面加：

```js
    if (a.info.fly) {
      const from = tileCenter(door.c, door.r, L)
      a.px = from.x
      a.py = from.y
      say(a, a.info.hello, HELLO_MS)
      return flyTo(a, perchesFor(a)[0])
    }
```

9. `updatePlaced` 的 `animals.forEach((a) => {` 开头加：

```js
        if (a.info.fly) {
          // 停的那件东西没了：换个地方
          if (a.perchKey.indexOf('item:') === 0 && !itemOf(a.perchKey.slice(5))) flyTo(a, perchesFor(a)[0])
          else emit(a)
          return
        }
```

- [ ] **Step 6: 页面**

`garden.wxml` 动物那个 `<view class="animal …"` 加 `wx:if="{{!item.hidden}}"`（放在 `class` 前面）；图片的 class 里 `{{item.action === 'walk' ? 'gait-' + item.gait : ''}}` 改成 `{{item.action === 'walk' || item.action === 'fly' ? 'gait-' + item.gait : ''}}`。

- [ ] **Step 7: 复制、占位图、跑测试、提交**

```bash
cp cloudfunctions/api/lib/shared/garden.js miniprogram/utils/shared/garden.js
python3 scripts/draw-images.py
npm test 2>&1 | grep -E "^# (pass|fail)|^not ok"
for f in cloudfunctions/api/lib/shared/garden.js miniprogram/utils/animals.js miniprogram/utils/garden-life.js; do node --check $f; done
git add -A
git commit -m "feat(animals): bird and butterfly that fly between trees and flowers

<trailer>"
```

---

### Task 4: 原画工具链：对齐切块、传云存储、页面按配置切换

**Files:**
- Create: `scripts/estate/cut_art.py`
- Modify: `scripts/wechat.js`（`art` 命令）、`package.json`（`wx:art`）、`miniprogram/config.js`（`estateArt`）、`miniprogram/utils/world.js`（`artTiles(L, base)`）、`miniprogram/pages/garden/garden.js`、`garden.wxml`、`.gitignore`（`art/estate/`）
- Test: `test/world.test.js`、`test/pages.test.js`

**Interfaces:**
- Produces: `python3 scripts/estate/cut_art.py <图> [--width 3120] [--scale 1] [--dx 0] [--dy 0] [--local]` → `art/estate/t00.jpg … t33.jpg`（`--local` 写到 `miniprogram/images/garden/estate/`）；`npm run wx:art` 把 `art/estate/` 传到云存储 `garden/estate/` 并打印 fileID 前缀；`config.estateArt`（`''` 用本地切块，否则是 `cloud://…/garden/estate/` 前缀）；`artTiles(L, base = '')`；页面 data `artBase`、方法 `onArtError`

- [ ] **Step 1: 确认 miniprogram-ci 的云存储上传接口名**

Run: `node -e "const ci=require('miniprogram-ci');console.log(Object.keys(ci.cloud))"`
Expected：含 `uploadStorage`（参数 `{ project, env, path, remotePath }`）。不是这个名字就按打印出来的改下面的代码。

- [ ] **Step 2: 写失败的测试**

`test/world.test.js`「artTiles：…」末尾加：

```js
  const remote = W.artTiles(L, 'cloud://env.bucket/garden/estate/')
  assert.equal(remote[0].image, 'cloud://env.bucket/garden/estate/t00.jpg')
  assert.equal(remote[15].image, 'cloud://env.bucket/garden/estate/t33.jpg')
  assert.deepEqual([remote[5].left, remote[5].top], [tiles[5].left, tiles[5].top])
```

`test/pages.test.js` 大宅院首页测试里 `assert.equal(garden.data.art.length, 16)` 后面加：

```js
  assert.equal(garden.data.art[0].image, '/images/garden/estate/t00.jpg')
  // 云存储的图加载失败：退回本地白模
  garden.setData({ artBase: 'cloud://x/', art: [] })
  garden.render(garden.garden)
  assert.equal(garden.data.art[0].image, 'cloud://x/t00.jpg')
  garden.onArtError()
  assert.equal(garden.data.art[0].image, '/images/garden/estate/t00.jpg')
  assert.equal(garden.data.artBase, '')
```

- [ ] **Step 3: 跑测试确认失败**

Run: `node --test test/world.test.js test/pages.test.js`
Expected: FAIL

- [ ] **Step 4: 实现**

`miniprogram/utils/world.js` 的 `artTiles`：

```js
// 底图：一整张切成 4×4 块，正好铺满 #world。base 是云存储的 fileID 前缀（以 / 结尾），空就用包里的白模切块
function artTiles(L, base = '') {
  const w = L.width / ART_SPLIT
  const h = L.height / ART_SPLIT
  const tiles = []
  for (let row = 0; row < ART_SPLIT; row++) {
    for (let col = 0; col < ART_SPLIT; col++) {
      const name = `t${row}${col}.jpg`
      tiles.push({ key: `art-${row}-${col}`, image: base ? `${base}${name}` : `/images/garden/estate/${name}`, left: col * w, top: row * h, width: w, height: h })
    }
  }
  return tiles
}
```

`miniprogram/config.js`：

```js
// 云开发环境 ID：云开发控制台 → 设置 → 环境 ID（形如 cloud1-xxxxxx）
// 留空则使用微信开发者工具里当前选中的环境
module.exports = {
  envId: 'cloud1-d0gc0a24t697e8d8b',
  // 宅院底图在云存储里的 fileID 前缀（npm run wx:art 上传后会打印，形如 cloud://环境ID.桶名/garden/estate/）
  // 留空用包里的白模切块
  estateArt: '',
}
```

`garden.js`：
1. import 加 `const config = require('../../config')`。
2. data 加 `artBase: config.estateArt || '',`。
3. `render` 里 `art: this.data.art.length ? this.data.art : W.artTiles(L),` → `art: this.data.art.length ? this.data.art : W.artTiles(L, this.data.artBase),`。
4. `goCheckin` 前面加：

```js
  // 云存储的底图加载失败（没传、没权限、断网）：退回包里的白模
  onArtError() {
    if (!this.data.artBase) return
    this.setData({ artBase: '', art: W.artTiles(this.L, '') })
  },
```

`garden.wxml` 底图那行 `<image wx:for="{{art}}" wx:key="key" class="art" src="{{item.image}}"` 加 `binderror="onArtError"`。

`scripts/estate/cut_art.py`（新建）：

```python
"""把画好的宅院原画对齐到游戏的世界框，切成 4×4 块

    python3 scripts/estate/cut_art.py art/raw/estate.png [--width 3120] [--scale 1.0] [--dx 0] [--dy 0] [--local]

世界框的比例和 utils/iso.js 的 gridLayout 一致（和白模 art/guide/estate-blockout.jpg 一样）。原画先按宽度缩放到 --width，
再按 --scale 微调大小、--dx / --dy 微调位置（输出像素，右、下为正），超出的裁掉，不够的用原画边缘的平均色补。
输出到 art/estate/t00.jpg … t33.jpg（传云存储用）；加 --local 则写到 miniprogram/images/garden/estate/（替换白模占位，注意包大小）。
"""
import argparse
import json
import os
import subprocess

from PIL import Image

REPO = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..'))
SPLIT = 4


def world_ratio():
    """世界框 宽 : 高，从 estate.js 的网格算（格高 = 格宽 / 2，顶部留 1.3 格宽，侧面厚 0.2 格宽）"""
    grid = json.loads(subprocess.check_output(['node', '-e', "console.log(JSON.stringify(require('./cloudfunctions/api/lib/shared/estate').GRID))"], cwd=REPO))
    n = grid['cols'] + grid['rows']
    return (n / 2) / (1.3 + n / 4 + 0.2)


def edge_color(img):
    small = img.resize((32, 32))
    px = [small.getpixel((x, y)) for x in range(32) for y in (0, 31)] + [small.getpixel((x, y)) for y in range(32) for x in (0, 31)]
    return tuple(sum(c[i] for c in px) // len(px) for i in range(3))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('image')
    ap.add_argument('--width', type=int, default=3120)
    ap.add_argument('--scale', type=float, default=1.0)
    ap.add_argument('--dx', type=int, default=0)
    ap.add_argument('--dy', type=int, default=0)
    ap.add_argument('--local', action='store_true')
    a = ap.parse_args()
    src = Image.open(a.image).convert('RGB')
    W = a.width
    H = round(W / world_ratio())
    s = W / src.width * a.scale
    scaled = src.resize((max(1, round(src.width * s)), max(1, round(src.height * s))), Image.LANCZOS)
    canvas = Image.new('RGB', (W, H), edge_color(src))
    canvas.paste(scaled, ((W - scaled.width) // 2 + a.dx, (H - scaled.height) // 2 + a.dy))
    out = os.path.join(REPO, 'miniprogram', 'images', 'garden', 'estate') if a.local else os.path.join(REPO, 'art', 'estate')
    os.makedirs(out, exist_ok=True)
    tw, th = W / SPLIT, H / SPLIT
    total = 0
    for row in range(SPLIT):
        for col in range(SPLIT):
            tile = canvas.crop((round(col * tw), round(row * th), round((col + 1) * tw), round((row + 1) * th)))
            path = os.path.join(out, f't{row}{col}.jpg')
            tile.save(path, quality=85, optimize=True)
            total += os.path.getsize(path)
    print(f'{W}×{H} → {out}，16 块共 {total // 1024} KB')


if __name__ == '__main__':
    main()
```

`scripts/wechat.js`：
1. 头部用法注释加一行 `//   npm run wx:art                 把 art/estate/ 的底图切块传到云存储 garden/estate/`。
2. `if (!['function', 'preview', 'upload'].includes(command))` → `if (!['function', 'preview', 'upload', 'art'].includes(command))`，提示里加 `| art`。
3. `if (command === 'function') {` 之前加：

```js
  if (command === 'art') {
    const env = envId()
    const dir = path.join(ROOT, 'art/estate')
    if (!fs.existsSync(path.join(dir, 't00.jpg'))) fail('art/estate/ 里还没有切好的底图：先跑 python3 scripts/estate/cut_art.py <原画>')
    console.log(`上传 art/estate → 云存储 ${env}:garden/estate/ …`)
    await ci.cloud.uploadStorage({ project, env, path: dir, remotePath: 'garden/estate' })
    let prefix = ''
    try {
      // 拼 fileID 要桶名，miniprogram-ci 没公开，从它内部的环境信息里拿；拿不到就让用户去控制台看
      const { initEnvironmentByProject } = require('miniprogram-ci/dist/ci/cloud/utils')
      const { currentEnv } = await initEnvironmentByProject(project, env)
      const bucket = currentEnv && currentEnv.storages && currentEnv.storages[0] && currentEnv.storages[0].bucket
      if (bucket) prefix = `cloud://${env}.${bucket}/garden/estate/`
    } catch (e) {
      prefix = ''
    }
    console.log('✓ 底图已上传到云存储')
    console.log(prefix ? `  把 miniprogram/config.js 的 estateArt 填成 '${prefix}'，再 npm run wx:preview` : '  fileID 前缀到云开发控制台 → 存储里看（形如 cloud://环境ID.桶名/garden/estate/），填进 miniprogram/config.js 的 estateArt')
    return
  }
```

`package.json` scripts 加 `"wx:art": "node scripts/wechat.js art"`。`.gitignore` 加一行 `art/estate/`。

- [ ] **Step 5: 用白模把整条路跑一遍**

```bash
python3 -c "import ast; ast.parse(open('scripts/estate/cut_art.py').read())"
python3 scripts/estate/cut_art.py art/guide/estate-blockout.jpg --width 2080
python3 -c "
from PIL import Image; import os
a=Image.open('art/estate/t00.jpg'); b=Image.open('miniprogram/images/garden/estate/t00.jpg'); print(a.size, b.size)"
node --test test/world.test.js test/pages.test.js 2>&1 | grep -E "^# (pass|fail)|^not ok"
node --check scripts/wechat.js && node --check miniprogram/pages/garden/garden.js && node --check miniprogram/utils/world.js
npm run wx:art
```

Expected：切块尺寸和白模切块一致（520×284）；测试 PASS；上传成功并打印 `cloud://…/garden/estate/` 前缀——记到 CLAUDE.md（Task 5），`config.estateArt` 先留空。上传若报权限 / 网络错误，记录原因到 CLAUDE.md，不阻塞后面的任务。

- [ ] **Step 6: 提交**

```bash
git add -A
git commit -m "feat(art): cut painted estate into tiles, upload to cloud storage, page falls back to local

<trailer>"
```

---

### Task 5: 文档、出图说明补充、部署

**Files:**
- Modify: `README.md`、`CLAUDE.md`、`docs/art/garden-estate-art-brief.md`

- [ ] **Step 1: 出图说明补三张拼图**

`docs/art/garden-estate-art-brief.md` 的「## 我这边怎么用」前面插入：

```markdown
---

## 第 4～6 张 · 新物件和两只会飞的（3 × 3 拼图）

拼图格式和以前的物件一样（每张都附上 `style-ref.jpg`）：

```
A sprite sheet, 1536 x 1536 px, a 3 x 3 grid of equal 512 x 512 cells.
Each object is centered in its own cell with at least 60 px of empty space on every side,
its base at the bottom center of the cell, no ground plane under it.
Fill the cells left-to-right, top-to-bottom in the order listed.
Cute 3D isometric mobile-game asset, soft rounded chunky shapes, matte clay-like material,
warm cheerful pastel colors, soft light from the upper left, cozy Chinese countryside garden theme,
no text, no labels, no borders. Background: transparent PNG, or a perfectly flat solid magenta #FF00FF.
```

**第 4 张 · 水里的东西和小摆件**（按顺序 9 格）：
1. 荷花丛：几片荷叶托着两朵粉荷花，**底部是水面，不要画石头池边**（它要放进画好的池子里）
2. 睡莲：两片圆荷叶浮在水面，一朵白睡莲，同样不要池边
3. 芦苇：一丛细长的芦苇，顶上几穗棕色的穗子，根部在水里
4. 汀步石：三块扁圆的石头一溜排开，浮在水面上
5. 锦鲤群：三四条红白锦鲤在水面下游，带一点水波
6. 小木栈桥：一段矮矮的木板桥，几根木桩入水
7. 竹帘：一卷挂在竹竿上的竹帘，半卷着
8. 草窝：一个圆圆的干草窝，中间凹下去
9. 食槽：一个长条木食槽，里面有金黄的谷粒

**第 5 张 · 院子家具**（按顺序 9 格）：
1. 草垛：一个圆锥形的金黄草垛
2. 稻草人：一个可爱的稻草人，戴草帽，张开双臂
3. 木梯：一架斜靠着的木梯
4. 果篮：一只竹篮装满橘子和苹果
5. 茶炉：一个红泥小炭炉，上面坐着一把铜壶，冒一点热气
6. 泡汤木桶：一个圆木桶，里面是热水，冒着热气
7. 花架：一座木花架，上面爬满紫藤和小花（这件占 2×2 格，画大一点、宽一点）
8. 长椅：一张中式木长椅
9. 喂鸟台：一根木柱顶着一个小木台，台上撒着谷粒，旁边一只小麻雀

**第 6 张 · 会飞的（只用前 2 格，其余留空）**：
1. 小鸟：一只圆滚滚的蓝色小鸟，翅膀半张，侧身朝左，像正停在枝头
2. 蝴蝶：一只黄底黑纹的蝴蝶，翅膀张开，侧身朝右

出好后我把它们写进 `scripts/slice-art.py` 的 SHEETS 里切图替换占位图。
```

- [ ] **Step 2: README、CLAUDE.md**

`README.md`：
1. 「大宅院 → 扭蛋机 → 图鉴」里「- 一共 48 种：扭蛋里 39 种（普通 15 · 稀有 10 · 珍稀 6 · 传说 3 · 节气限定 5，…）+ 9 只小动物（见下文）」改成「- 一共 68 种：扭蛋里 57 种（普通 26 · 稀有 17 · 珍稀 6 · 传说 3 · 节气限定 5，节气限定在霜降、立冬、小雪、大雪、冬至期间概率提高）+ 11 只小动物（见下文）。新加的 18 件里，荷花丛、睡莲、芦苇、汀步石、锦鲤群、小木栈桥要放在荷塘的水里；竹帘、草窝、食槽、草垛、木梯、果篮、茶炉、泡汤木桶、花架、长椅、喂鸟台是家具；稻草人插在菜地或草地上」。
2. 「### 小动物」的表格末尾加两行：`| 小鸟 | 树满 3 棵（桂花、橘子、柿子、梅花、银杏、秋千树、大树），或喂鸟台 |`、`| 蝴蝶 | 花满 3 丛（雏菊、小菊花、兰花、向日葵、蒲公英、腊梅、荷花丛、睡莲），或花架 |`；表格里小黄鸡 → `青草丛、食槽`，小白兔 → `白萝卜、草窝`，小花猫 → `小板凳、长椅`，小乌龟 → `鹅卵石、汀步石`，小黄鸭 → `锦鲤池、锦鲤群`，胖橘猫 → `茶桌、茶炉`，仙鹤 → `荷花池、荷花丛`。
3. 「- 在整座宅院里穿过月亮门到处走…」前面加一条：`- 走路有各自的步态：猫和熊猫四条腿踱步、鸭子小鸡摇摇摆摆、兔子蹦、乌龟慢慢爬、仙鹤迈大步；一次走一小段再歇，不是一格一停`；后面加一条：`- 小鸟和蝴蝶会飞、不占格：在树、花、喂鸟台、花架、假山之间飞来飞去停一停；小鸟 19 点后藏在树里睡，蝴蝶只在 8～18 点出现`。
4. 「从云端部署」表（如果 README 里有）或「图片」一节末尾加：`- 原画到了：python3 scripts/estate/cut_art.py <原画> 切块到 art/estate/，npm run wx:art 传云存储，把打印出来的 fileID 前缀填进 miniprogram/config.js 的 estateArt，再 npm run wx:preview；加载失败页面会自动退回白模`。

`CLAUDE.md`：
1. 部署命令表加一行 `| 原画切块 \`art/estate/**\` | \`python3 scripts/estate/cut_art.py <原画>\`，然后 \`npm run wx:art\`，把打印的 fileID 前缀填进 \`miniprogram/config.js\` 的 \`estateArt\` |`。
2. 「当前状态」加一条：`- 2026-10-23：第三步上线：步态（gait，四条腿踱步 / 摇摆 / 蹦 / 爬 / 迈步 / 飞 / 扑棱）+ 小段散步；18 件新物件（水生 6、家具 11、稻草人）、likesAny；小鸟（树 3 棵或喂鸟台）和蝴蝶（花 3 丛或花架）会飞、不占格、夜里 / 非时段藏起来；图鉴 68。新图是 emoji 占位，出图说明第 4～6 张。原画工具链：cut_art.py → wx:art（已用白模验证上传，fileID 前缀 <填实际>），config.estateArt 仍为空、页面用本地白模，真机看过云存储的图再切换`。
3. 简介里「有图鉴和节气限定」前加「新物件、小鸟蝴蝶先用占位图；」。

- [ ] **Step 3: 测试、提交、推送、部署、发给用户**

```bash
npm test 2>&1 | grep -E "^# (pass|fail)"
du -sh --apparent-size miniprogram
git add -A && git commit -m "docs: gaits, new items, flyers and the painted-art pipeline

<trailer>"
git push -u origin claude/mini-program-dev-nzn2n0
npm run wx:function
npm run wx:preview
```

用 SendUserFile 发二维码和一张截图（`shoot-estate.js` 改成摆上新物件 + 小鸟蝴蝶的种子数据）、更新后的出图说明。
