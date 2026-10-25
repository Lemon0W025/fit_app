# 打卡动效和连续打卡里程碑 — 设计文档

日期：2026-10-25 · 状态：已确认（三段逐段确认过）

## 背景与目标

准时拍照打卡是第一优先（`2026-10-25-on-time-checkin-design.md`），但打卡的几个页面现在几乎是静态的：结果页一出来就是一堆字，只有打卡页提交时有一个转圈。
用户希望把打卡相关的组件做得好看、有手感，并且在「打卡到一个周期」时有里程碑的感觉。

成功标准：

- 拍完一顿，结果页像「盖了一个章」：印章落下、暖豆跳出来、热量数字滚到位，手机轻轻一震。
- 首页「下一顿」大卡在饭点内一眼能看出「现在该拍了」。
- 连续打卡到 3、7、14……天时有一次像样的庆祝，并留下一枚能反复看的纪念章。
- 妈妈用：动效短、不闪、不吵，点一下就能跳过；包几乎不变大。

## 已确认的决策

| 项 | 决定 |
|---|---|
| 里程碑 | 只算「连续打卡天数」（某天拍了任意一顿正餐就算那天打了卡，用现在 `streakFrom` 的算法），不算连续准时、不算累计 |
| 奖励 | 庆祝特效 + 一枚纪念章（收在打卡日历顶上）。不给暖豆、不给装饰，不碰营地的经济 |
| 热闹程度 | 画面 + 轻震动（`wx.vibrateShort`），不要声音 |
| 做法 | 自己写：CSS 动画 + 一个 canvas 彩带组件，用我们自己的颜色和元素；不引 Lottie、不换 UI 组件库（主包已 1.68MB，上限 2MB） |

## 一、打卡组件的日常动效

原则：每个动效都短，一屏最多约 1.5 秒播完；点一下屏幕直接跳到结束的样子；不闪烁、不一直转（只有首页大卡在饭点内轻轻「呼吸」）；
震动只在「盖章」（`light`）和「里程碑」（`medium`）两处。

### 结果页（`pages/meal`，最重要的一刻）

刚打完卡进来（`gain` 有值）时按顺序播，后一步在前一步快结束时开始：

1. **盖章**：这次新盖的那个印章（早 / 午 / 晚，`gain.mealType`）从 1.6 倍落到 1 倍、先歪 −12° 再回正，周围一圈墨色晕开后淡掉；
   准时的再晚一点跳出金边和「准」字。同时 `wx.vibrateShort({ type: 'light' })`。别的印章不动。
2. **得暖豆**：暖豆图标弹一下，「+15」从 0 滚到 15（标题里的数字）。
3. **三顿都准时**（`gain.allOnTime`）：彩带从顶上撒一小把（`celebrate` 组件的 `burst` 模式，约 1 秒，没有卡片）。
4. **热量**：大数字从 0 滚到实际千卡数；三大营养素、「认出来的食物」、小暖的点评卡依次从下面浮上来（每张晚 120ms）。
5. **里程碑**（`gain.milestone`）：上面播完后弹出庆祝画面（见第三节）。

从列表点进来看一条旧打卡（没有 `gain`）只做第 4 步的浮上来，不滚数字、不震动。

### 首页（`pages/today`）

- 进来时几张卡片依次浮上来（每张晚 80ms，只在第一次显示时播，之后每分钟刷新不再播）。
- 「下一顿」大卡：`state` 是 `open`（饭点内）时卡片外圈一圈暖色光慢慢呼吸（4 秒一次），「拍某某」按钮轻轻一胀一缩；
  `warn`（快过点）时光圈换成琥珀色、呼吸快一点（2.5 秒）。其他状态不动。
- 热量卡：数字从 0 滚到已吃的千卡，进度条从 0 长到当前宽度（CSS `transition: width`）。
- 暖豆卡：三个印章依次「啪」地出现（每个晚 100ms）；连续天数后面加一句下一个里程碑（见第二节）。

### 打卡页（`pages/checkin`）

- 选餐次的小按钮点中时弹一下（0.2 秒）。
- 提交后的等待层：现在的转圈换成「小暖在看」——照片缩成一张小卡（没照片就是一张写着备注的便签），一道斜光在上面来回扫；
  下面三步「上传照片 → 认出菜 → 算热量」，页面已有的 `stage` 走到哪步就给前面的打勾，当前这步的点在跳。

### 所有按钮

`.btn-primary`、`.btn-plain`、`.chip`、卡片上能点的地方加 `hover-class`：按下缩到 0.96、阴影变浅，松手弹回（0.15 秒）。

### 打卡日历（`pages/forest`）

今天那一格加一圈淡淡的高亮；顶上加纪念章一排（第二节）。

## 二、连续打卡里程碑和纪念章

### 规则（共用 `shared/streak.js`，云函数和小程序各一份、逐字节一致）

- **连续天数**：沿用 `shared/forest.js` 的 `streakFrom(days, today)`（`days` 是营地数据里「有正餐打卡的日子」，`forest.syncDay` 维护）。
- **里程碑**：`MILESTONES = [3, 7, 14, 21, 30, 60, 100, 150, 200, 300, 365]`，365 以后每满 100 天再算一次（465、565……）。
  - `isMilestone(n)`：在列表里，或 `n > 365 && (n - 365) % 100 === 0`。
  - `nextMilestone(n)` → `{ days, left }`：比 n 大的下一个里程碑和还差几天。
  - `badgeLook(days)` → `{ tier, glow }`：`tier` 是 `'bronze'`（3、7）/ `'silver'`（14、21、30）/ `'gold'`（60 以上），365 和以后 `glow: true`。
  - `milestonesUpTo(days)`：不超过 days 的里程碑（日历列纪念章用）。
- **什么时候触发**：某天第一次有了正餐打卡（这一天从「没算」变成「算了」）、并且算上这天的连续天数正好是里程碑。
  - 只看正餐：加餐不调用 `syncDay`，本来就不会触发。
  - 一天只触发一次：纪念章记着上次触发的日期 `last`，等于今天就不再触发（同一天删了再拍不会再庆祝）。
  - 断了以后再连到同一个天数，照样庆祝，`times` 加一。
  - 删掉打卡让那天不算了，纪念章不收回。

### 存储

营地数据（`garden` 集合那条，`normalizeCamp` 补默认值）多一个字段：

```js
streakBadges: { '7': { first: '2026-11-01', last: '2026-11-01', times: 1 }, … }
```

### 接口

- `forest.syncDay(openid, date)` 返回值从 `{ beans }` 变成 `{ beans, milestone }`：这次让这一天从「没算」变成「算了」并且到了里程碑时，
  更新 `streakBadges` 一起存，`milestone = { days, times, tier, glow, petId }`，否则 `null`。
  `petId` 是营地里 `fed` 最多的那只（同样多取先来的），没有宠物时为空。
- `meal.create` 的 `gain` 多一个 `milestone`（照 `syncDay` 的结果原样带上）；重新分析、删除不带。
- `forest.today`（首页、营地页用的 `daily`）多 `nextMilestone: { days, left }`。
- `forest.get`（打卡日历）多 `badges`：按里程碑列表列出，已拿的带 `first`、`times`，没拿的只有 `days`（只列到「下一个」为止，不列一长串够不着的）。

### 页面

- 首页、日历顶上的暖豆卡：「🔥 已连续 5 天 · 再 2 天拿 7 天纪念章」（`left` 为 1 时说「明天再拍就拿 7 天纪念章」）；连续 0 天时只说「今天拍一顿，开始连续打卡」。
- 打卡日历顶上一排纪念章（`medal` 组件）：已拿的彩色，没拿的（下一个）灰色轮廓写「还差 N 天」；点已拿的弹 `wx.showModal`：「连续打卡 7 天 · 第一次 2026-11-01 · 共 2 次」。

### 纪念章的样子（`components/medal`，纯 CSS，没有图片）

圆章 + 下面两条 V 形绶带，中间大字「7」、下面小字「天」。`bronze` 铜色、`silver` 银色、`gold` 金色（渐变 + 内圈描边）；`glow` 外面一圈慢慢转的光。
参数：`days`、`tier`、`glow`、`size`（rpx）、`locked`（灰色轮廓）。

## 三、庆祝画面（`components/celebrate`）

### 两种模式

- `burst`：只撒一把彩带（三顿都准时用），约 1 秒，没有遮罩、不挡点击。
- `milestone`：完整的庆祝（下面），挡住页面直到关掉。

### 里程碑庆祝

1. 屏幕盖一层半透明暗色（0.3 秒淡入）。
2. 彩带：`<canvas type="2d">` 画约 80 片，从顶上撒下来带一点左右飘和翻转；形状有长条、小圆（暖豆色）、小圆环（印章）；
   颜色用 `app.wxss` 的暖色（主色、金、珊瑚、浅绿）。约 2 秒落完就停（不循环），画布停掉动画帧。
3. 中间一张卡（从 0.6 倍弹到 1 倍）：
   - 纪念章（`medal`，大号）转半圈放大落定，同时 `wx.vibrateShort({ type: 'medium' })`；
   - 大字「连续打卡 7 天！」，第 2 次以后下面小字「第 2 次做到」；
   - 营地里最亲的那只（`petId`）的图册小图从卡片左下角探出头（`images/camp/pets/<id>.png`），没宠物就放暖豆图标；
   - 一句小暖的话（按天数挑，写在 `utils/milestone-lines.js`，比如 7 天「一周都没落下，身体会记得的」、30 天「一个月了，这已经是习惯啦」）；
   - 大按钮「收下纪念章」。
4. 点按钮或卡片外面关掉（0.2 秒淡出），结果页照常可用。

### 组件接口

`<celebrate mode="milestone" milestone="{{gain.milestone}}" bind:close="onCelebrateClose" />`，`mode` 为空时什么都不渲染。
`burst` 模式：`<celebrate mode="burst" />`，播完自己发 `close`。
组件里的计时、动画帧都走可以注入的时钟（测试里快进），canvas 拿不到（老基础库）时只显示卡片、不撒彩带。

## 四、怎么搭

- `miniprogram/utils/shared/streak.js` + `cloudfunctions/api/lib/shared/streak.js`：第二节的规则，纯函数。
- `cloudfunctions/api/services/forest.js`：`syncDay` 判断里程碑、写 `streakBadges`；`today` / `get` 多带字段。`lib/camp-state.js` 的 `normalizeCamp` 补 `streakBadges: {}`。
- `cloudfunctions/api/services/meal.js`：`gain.milestone`。
- `miniprogram/utils/fx.js`：
  - `countUp(from, to, ms, onStep, clock)`：数字滚动（缓出），最后一步一定等于 `to`；
  - `buzz(type)`：包一层 `wx.vibrateShort`，不支持就忽略；
  - `clockOf(page)`：页面 / 组件的 `this.clock`（测试里注入手动时钟），没有就用真的定时器。
  依次出现的节奏用 CSS 的 `animation-delay`（`fx-d1`～`fx-d8`，每档 100ms）。
- `miniprogram/utils/view.js`：`decorateGain` 多 `milestone`、`newStamp`（哪个印章要播盖章）；`beansCard` 的 `streakText` 带下一个里程碑；日历的 `badges` 视图。
- `miniprogram/app.wxss`：共用的动画（`fx-stamp`、`fx-pop`、`fx-rise`、`fx-breathe`、`fx-breathe-warn`、`fx-press`），页面加 class 就能用。
- `miniprogram/components/celebrate/`、`miniprogram/components/medal/`：两个自定义组件；`meal`、`forest` 页面的 `json` 里注册。
- 包大小：全是代码和样式，没有新图片，预计多二三十 KB。

## 五、测试

- `shared/streak.js`：`isMilestone` 列表里的、365 以后每 100 天、不在的；`nextMilestone` 的边界（0、2、3、365、366）；`milestonesUpTo`；`badgeLook` 各档；两边逐字节一致（现有检查自动覆盖）。
- `forest.syncDay`：当天第一顿正餐到 7 天触发；同一天第二顿不触发；同一天删了再拍不再触发；断了再连到 7 天 `times` 为 2；
  删打卡让那天不算了，纪念章还在；`petId` 取 `fed` 最多的。
- `meal.create`：正餐带 `gain.milestone`，加餐没有 `gain`；端到端（`fake-cloud`）连续 7 天打卡第 7 天的结果里有 `milestone`。
- `utils/fx.js`：`countUp` 快进到结束等于目标值、中途单调、`finish` 直接到目标值。
- 页面（`page-harness`）：结果页带 `gain` 时播盖章（`newStamp` 对）、带 `milestone` 时出现庆祝、点「收下纪念章」关掉；看旧打卡不震动；
  首页的 `streakText` 带「再 N 天」；日历显示已拿和下一个纪念章、点开的文字。
- 录屏：仿照 `scripts/preview/record-camp.js` 加 `scripts/preview/record-checkin.js`，用同一个 `wxml-render` 把结果页（普通 / 三顿准时 / 里程碑）、
  首页（饭点内 / 快过点）在浏览器里真跑动效，录成视频逐帧看（输出 `.preview/checkin/`）。真机靠扫码看。
- 共用文件改了，`npm run wx:function` 重新部署云函数。

## 不做（YAGNI）

- 声音。
- 累计打卡、连续准时、自然周 / 月的里程碑。
- 里程碑给暖豆、装饰。
- 「减少动态效果」开关（动效本来就短、能点掉；以后妈妈觉得晃眼再加）。
- 纪念章分享到微信（做第四块家人时再看要不要）。
