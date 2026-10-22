# 养生师打卡小程序 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 一个微信小程序：家人拍照打卡每餐，AI 养生师「小暖」估算热量并点评，记录体重，生成每日总结。

**Architecture:** 原生小程序前端 + 微信云开发。单个 `api` 云函数按 action 路由到 services；services 通过依赖注入拿到 `repo`（云数据库）与 `chat`（`cloud.ai()` 混元），纯逻辑全部在 `lib/` 里用 `node:test` 测试。前后端共用的纯逻辑放在 `shared/`，两份副本由测试保证一致。

**Tech Stack:** 微信小程序原生（WXML/WXSS/CommonJS）、wx-server-sdk ~4.0.2（`cloud.ai()`）、Node 18+ `node:test`（零依赖）。

## Global Constraints

- 日期一律东八区 `YYYY-MM-DD`（`dateKey(date, 480)`）；时间戳存毫秒数字 `createdAt: number`。
- 热量下限：女 1200、男 1500 kcal；减重赤字 500 kcal；活动系数 sedentary 1.2 / light 1.375 / moderate 1.55。
- 餐次：`breakfast`/`lunch`/`dinner`/`snack` → 早餐/午餐/晚餐/加餐。
- 评级：`green`/`yellow`/`red`，非食物为 `null`。
- 云函数响应：`{ ok: true, data }` 或 `{ ok: false, code, message }`；message 为面向用户的中文。
- AI 配置只在 `cloudfunctions/api/config.js`：`provider`、`visionModel`、`textModel`、`imageMode`。
- 共享文件 `cloudfunctions/api/lib/shared/*.js` 与 `miniprogram/utils/shared/*.js` 必须逐字节一致，且不得引用 `wx`/`require('wx-server-sdk')`。
- 点评 ≤ 80 字；总结 ≤ 150 字；不做医疗诊断。

## File Map

```
package.json                              根：仅 test 脚本
project.config.json                       miniprogramRoot / cloudfunctionRoot
cloudfunctions/api/
  package.json, config.js, index.js, router.js, ai.js, repo.js
  lib/shared/date.js | nutrition.js | meal-types.js
  lib/errors.js | profile.js | parse.js | prompts.js
  services/profile.js | meal.js | day.js | weight.js
miniprogram/
  app.js | app.json | app.wxss | sitemap.json | config.js
  utils/shared/ (同上三份) | api.js | view.js | chart.js
  pages/today | checkin | meal | weight | profile  (各 .js/.json/.wxml/.wxss)
test/
  helpers/fake-repo.js
  shared-sync | date | nutrition | meal-types | profile | parse | prompts
  services-profile | services-meal | services-day | services-weight | router | view | chart  (*.test.js)
README.md
```

## Interfaces（跨任务契约）

```js
// lib/shared/date.js
dateKey(date = new Date(), offsetMinutes = 480) -> 'YYYY-MM-DD'
localHour(date = new Date(), offsetMinutes = 480) -> 0..23
timeText(ms, offsetMinutes = 480) -> 'HH:mm'
isDateKey(s) -> boolean
addDays(key, n) -> key
dateLabel(key) -> '10月22日 周四'

// lib/shared/meal-types.js
MEAL_ORDER = ['breakfast','lunch','dinner','snack']; MEAL_LABELS; isMealType(t); guessMealType(hour)

// lib/shared/nutrition.js
ACTIVITY_FACTORS, ACTIVITY_LABELS, MIN_KCAL, DEFICIT
calcBMR({ sex, age, heightCm, weightKg }) -> number
calcDailyKcal({ sex, age, heightCm, weightKg, targetWeightKg, activity }) -> number (整十)
sumMeals(meals) -> { kcal, protein, carbs, fat }   // 只算 status==='done'
round1(n)

// lib/errors.js
class AppError(code, message); CODES = { BAD_REQUEST, NO_PROFILE, NOT_FOUND, AI_FAILED, NO_MEALS }

// lib/profile.js
validateProfile(input) -> { value, errors: string[] }

// lib/parse.js
extractJson(text) -> object (throws)
parseMealAnalysis(text) -> { isFood, foods[{name,portion,kcal}], totalKcal, protein, carbs, fat, rating, comment, suggestion }
cleanSummaryText(text) -> string

// lib/prompts.js
COACH_NAME = '小暖'
buildMealMessages({ profile, mealType, note, imageUrl, consumedKcal }) -> messages
buildSummaryMessages({ profile, date, meals, totals, latestWeight, previousWeight }) -> messages

// repo（repo.js 与 test/helpers/fake-repo.js 实现同一接口，全部 async）
getProfile(openid) -> profile|null
saveProfile(openid, profile)
listMeals(openid, date) -> meals (createdAt 升序)
getMeal(openid, id) -> meal|null
addMeal(meal) -> id
updateMeal(id, patch)
deleteMeal(id)
getSummary(openid, date) -> summary|null
saveSummary(openid, date, doc)
saveWeight(openid, date, weightKg)
listWeights(openid, limit) -> [{date, weightKg}] (date 升序，最近 limit 条)

// chat（ai.js）
chat({ provider, model, messages }) -> Promise<string>

// services
createProfileService({ repo, now }) -> { get(openid), save(openid, input) }
createMealService({ repo, chat, config, getImageUrl, deleteFile, now, log }) -> { analyze, reanalyze, get, remove }
createDayService({ repo, chat, config, now, log }) -> { get, summarize }
createWeightService({ repo, now }) -> { save, list }
createRouter(services, { log }) -> async (event, openid) => envelope

// miniprogram/utils
api.call(action, data) -> Promise<data>  (throws Error with .code)
api.uploadMealPhoto(tempPath) -> Promise<fileID>
view.decorateMeal(meal), view.buildDayView(day)
chart.computeChart(values, { width, height, padding, target }) -> { points, min, max, targetY }
```

---

### Task 1: 项目骨架 + 共享纯逻辑（date / meal-types / nutrition）

**Files:** Create `package.json`, `project.config.json`, `.gitignore`, `cloudfunctions/api/lib/shared/{date,meal-types,nutrition}.js`, `miniprogram/utils/shared/*`（复制）, `test/{date,meal-types,nutrition,shared-sync}.test.js`

- [ ] 写测试：
  - date：`dateKey(new Date('2026-10-22T16:30:00Z'))` → `'2026-10-23'`（UTC 16:30 = 北京 00:30）；`localHour` 同例为 0；`timeText(Date.UTC(2026,9,22,4,5))` → `'12:05'`；`isDateKey('2026-02-30')` false、`'2026-02-28'` true；`addDays('2026-12-31', 1)` → `'2027-01-01'`；`dateLabel('2026-10-22')` → `'10月22日 周四'`。
  - meal-types：`guessMealType(7)` breakfast、`12` lunch、`15` snack、`19` dinner、`23` snack；`isMealType('lunch')` true、`'tea'` false。
  - nutrition：女 50 岁 160cm 70kg → BMR = 10·70 + 6.25·160 − 5·50 − 161 = 1289；light、目标 60 → round10(1289·1.375 − 500) = 1270；目标 ≥ 当前体重不减 500；久坐 45kg 女性被钳到 1200；男性下限 1500；`sumMeals` 忽略 failed 并保留 1 位小数。
  - shared-sync：三个文件两侧内容相同。
- [ ] `npm test` 确认失败 → 实现 → 通过 → commit。

### Task 2: 服务端纯逻辑（errors / profile 校验 / parse / prompts）

**Files:** Create `cloudfunctions/api/lib/{errors,profile,parse,prompts}.js`, `test/{profile,parse,prompts}.test.js`

- [ ] 写测试：
  - validateProfile：合法输入 → 无 errors、数值转 number（字符串 `'160'` → 160）、体重保留 1 位；年龄 5 / 身高 300 / sex 'x' / activity 'x' 各产生错误；nickname 缺省 → `'我'`；avoid 截断 100 字。
  - parse：纯 JSON；```json 围栏包裹；前后有废话；字段缺失补默认；totalKcal 缺失时用 foods 求和；负数钳到 0；rating 非法 → `'yellow'`；`isFood:false` → rating null 且 kcal 0；完全无 JSON → throw；`cleanSummaryText` 去围栏与 `#`、截断 400。
  - prompts：system 含 `小暖`、`JSON`、`1200`；有 imageUrl 时 user content 为数组且含 `image_url`；无图时为字符串且含备注；包含 dailyKcal、已摄入、餐次中文名、忌口；summary 消息含每餐菜名与总热量、体重变化。
- [ ] 失败 → 实现 → 通过 → commit。

### Task 3: services + router（依赖注入，用 fake repo/chat 测试）

**Files:** Create `cloudfunctions/api/services/*.js`, `cloudfunctions/api/router.js`, `test/helpers/fake-repo.js`, `test/services-*.test.js`, `test/router.test.js`

- [ ] 写测试：
  - profile：首次 save 计算 dailyKcal 并写当天体重；再次 save 保留 createdAt、不重复写体重；非法输入抛 BAD_REQUEST（message 用 `；` 连接）。
  - meal.analyze：有图 + visionModel → mode vision、chat 收到 image_url；视觉 chat 抛错 + 有备注 → mode text；视觉失败无备注 → status failed、error 提示补充描述；无图无备注 → BAD_REQUEST；无档案 → NO_PROFILE；consumedKcal 只计当日 done 餐；visionModel 为空时直接走文字。
  - meal.reanalyze：带新 note 更新并成功；不属于本人 → NOT_FOUND；已有餐的热量不把自己算进 consumed。
  - meal.remove：删除记录并调用 deleteFile；deleteFile 抛错不影响结果。
  - day.get：无档案时 profile null；totals/remaining 正确；返回已有 summary。day.summarize：无 done 餐 → NO_MEALS；chat 失败 → AI_FAILED；成功保存并返回，消息含最近两次体重。
  - weight.save：同日覆盖；非法体重 BAD_REQUEST；未来日期 BAD_REQUEST；当天体重同步更新档案 weightKg 与 dailyKcal。weight.list：limit 默认 30、上限 90，返回 `{ items, targetWeightKg }`。
  - router：未知 action → UNKNOWN_ACTION；无 openid → NO_OPENID；AppError → 其 code/message；普通 Error → INTERNAL + log 被调用；成功 → `{ ok:true, data }`。
- [ ] 失败 → 实现 → 通过 → commit。

### Task 4: 云函数入口（index / ai / repo / config）

**Files:** Create `cloudfunctions/api/{index,ai,repo,config}.js`, `cloudfunctions/api/package.json`

- [ ] `ai.js`：`createChat(cloud)` 缓存 `cloud.ai().createModel(provider)`，`generateText({ model, messages })` 取 `.text`，空文本抛错。
- [ ] `repo.js`：`createRepo(db)` 实现上述接口；集合不存在（errCode -502005 / 消息含 `not exist`）时 `db.createCollection` 后重试一次；`saveProfile` 用 `doc(openid).set`；weights/summaries 用 `openid_date` 作 `_id`。
- [ ] `index.js`：组装依赖；`getImageUrl` 按 `config.imageMode`（`url` 用 getTempFileURL，`base64` 用 downloadFile 转 data URL）。
- [ ] `node --check` 全部文件；`npm test` 全绿 → commit。

### Task 5: 小程序工具层（api / view / chart）+ app 外壳

**Files:** Create `miniprogram/{app.js,app.json,app.wxss,sitemap.json,config.js}`, `miniprogram/utils/{api,view,chart}.js`, `test/{view,chart}.test.js`

- [ ] 写测试：
  - view.decorateMeal：done → `约 520 千卡`、ratingText、timeText；failed → ratingClass `failed`、kcalText `分析失败`；isFood false → ratingClass `none`。buildDayView：按 MEAL_ORDER 再按 createdAt 排序；超出时 over true、percent 100、statusText 含"超出"；无档案时 dailyKcal 用 1500 兜底。
  - chart.computeChart：两点首尾 x 等于 padding 与 width − padding；最大值在最上；全相等时不除零；单点居中；target 纳入范围并给出 targetY。
- [ ] 失败 → 实现 → 通过 → commit。

### Task 6: 页面（today / checkin / meal / weight / profile）

**Files:** Create 五个页面各 `.js/.json/.wxml/.wxss`

- [ ] profile：首次进入（`profile.get` 为 null）显示欢迎语；表单字段即档案字段，实时预览每日预算（shared nutrition）；保存后首次建档 `wx.switchTab` 今日。
- [ ] today：`onShow` 调 `day.get`，profile 为 null 时 `switchTab` 到 profile；进度条、餐卡片、今日总结按钮；下拉刷新。
- [ ] checkin：按时间预选餐次；`wx.chooseMedia` 拍照/相册；备注；提交时分阶段文案（上传中 / 小暖正在看…）；成功 `redirectTo` 餐详情。
- [ ] meal：大图可预览；菜品/营养素/点评/建议；补充描述 + 重新分析；删除（确认弹窗）。
- [ ] weight：输入体重保存；canvas 2d 折线图 + 目标虚线；最近变化与距目标。
- [ ] 检查每个 wxml 标签闭合、`bind*` 处理函数均在 js 中定义；`node --check` 所有 js → commit。

### Task 7: README 与交付

- [ ] README：功能截图位说明、准备 AppID、开通云开发、报名成长计划、控制台确认可用模型并写入 `config.js`、上传云函数（云端安装依赖）、云函数超时调到 60 秒、体验版邀请家人、常见错误排查。
- [ ] `npm test` 全绿、`node --check` 全部 js → commit → push。
