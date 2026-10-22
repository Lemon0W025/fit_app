# 养生师打卡小程序 — 设计文档

日期：2026-10-22 · 状态：已确认

## 背景与目标

家里长辈想花一两千请人"监督减肥"：每天把吃的饭菜拍照发过去，对方点评、提醒。这个小程序用 AI 养生师替代这项服务，先给自己家人用（微信「体验版」邀请使用，不上架、不收费）。

成功标准：

- 长辈能独立完成：建档 → 拍照打卡 → 看到点评和今日剩余热量。
- 每餐点评在一次等待（< 30 秒）内返回，失败时打卡不丢、可重试。
- 点评口吻亲切、建议具体，不给出危险的节食建议。

## 已确认的决策

| 项 | 决定 |
|---|---|
| 使用对象 | 自己家人，体验版，不做支付 |
| 后端 | 微信云开发（数据库 + 云存储 + 云函数） |
| AI 模型 | 云开发自带混元，`cloud.ai().createModel("hunyuan-exp")`，模型名放配置文件 |
| 点评风格 | 现代营养学算账（热量、蛋白/碳水/脂肪）+ 养生师口吻（食物寒热、规律作息） |
| 第二期 | 饭点提醒推送（订阅消息）、家人查看打卡 |

## 功能（第一版）

1. **建档**：昵称、性别、年龄、身高、体重、目标体重、日常活动量、忌口。用 Mifflin-St Jeor 公式算 BMR × 活动系数得到 TDEE，减重目标时每日预算 = TDEE − 500，下限女 1200 / 男 1500 kcal；目标体重 ≥ 当前体重时不减 500。首次建档同时记一条当天体重。
2. **打卡**：选餐次（早餐/午餐/晚餐/加餐，按当前时间预选），拍照或从相册选（可不拍照，只写文字），可选备注。AI 返回：识别出的菜品（名称、份量、热量）、总热量、蛋白/碳水/脂肪、评级（绿/黄/红）、点评、下一餐建议。
3. **今日页**：已摄入 / 预算进度条，各餐卡片（缩略图、热量、评级、点评摘要），「今日总结」按钮生成养生师当日总结。
4. **餐详情**：大图、菜品列表、营养素、点评与建议；失败的打卡可「重新分析」；可删除。
5. **体重**：每天记一次（同一天重复记覆盖），近 30 条折线图，显示较初始变化与距目标差距。
6. **我的**：查看/修改档案（与建档同一页面）。

## 架构

```
miniprogram/                 原生小程序（WXML/WXSS/JS），无框架
  utils/shared/              与云函数共用的纯逻辑（date / nutrition / meal-types），内容必须与云函数侧一致（有测试保证）
  utils/api.js               wx.cloud.callFunction 封装，统一解包 { ok, data | message }
  utils/chart.js             体重折线图坐标计算（纯函数，可测）
  pages/today | checkin | meal | weight | profile
cloudfunctions/api/          单个云函数 + action 路由（共享代码最简单，只需部署一个函数）
  index.js                   入口：cloud.init、组装依赖、路由
  router.js                  action → service，统一错误信封
  config.js                  AI provider / 视觉模型 / 文本模型
  lib/                       纯函数：shared/(date, nutrition, meal-types)、parse、prompts、profile 校验
  services/                  profile / meal / day / weight，依赖注入 repo 与 chat，便于测试
  repo.js                    云数据库实现（薄层）
  ai.js                      cloud.ai() 封装为 chat({ model, messages }) → text
test/                        node:test 单元测试（零依赖）
```

> 与口头方案的差异：原说三个云函数，实现改为一个 `api` 云函数按 action 路由。功能不变，好处是纯逻辑与提示词只有一份、只需部署一次。

### 云函数 actions

| action | 入参 | 说明 |
|---|---|---|
| `profile.get` | — | 返回档案或 null |
| `profile.save` | 档案字段 | 校验、计算 dailyKcal、upsert；首次建档写当天体重 |
| `meal.analyze` | fileID?, mealType, note? | 调 AI 并保存，返回 meal |
| `meal.reanalyze` | mealId | 用原图/备注重跑 AI |
| `meal.get` / `meal.delete` | mealId | 删除同时删云存储图片 |
| `day.get` | date? | 档案预算、当日 meals、合计、已有总结 |
| `summary.generate` | date? | 生成并覆盖当日总结 |
| `weight.save` / `weight.list` | weightKg, date? / limit? | 每天一条（_id = openid_date） |

所有 action 通过 `cloud.getWXContext().OPENID` 隔离数据。响应统一为 `{ ok: true, data }` 或 `{ ok: false, code, message }`。

### 数据模型

- `users`：`_id = openid`，nickname, sex(`female`/`male`), age, heightCm, weightKg, targetWeightKg, activity(`sedentary`/`light`/`moderate`), avoid, dailyKcal, createdAt, updatedAt
- `meals`：_openid, date(`YYYY-MM-DD`, 东八区), mealType, fileID?, note, status(`done`/`failed`), mode(`vision`/`text`), analysis{foods[{name, portion, kcal}], totalKcal, protein, carbs, fat, rating(`green`/`yellow`/`red`/null), isFood, comment, suggestion}, error?, createdAt
- `weights`：`_id = openid_date`，_openid, date, weightKg, createdAt
- `summaries`：`_id = openid_date`，_openid, date, text, totalKcal, createdAt

集合权限设为「仅创建者可读写」，实际读写全部经云函数。

### AI 调用流程（meal.analyze）

1. 读档案（无档案 → `NO_PROFILE`），读当日已完成的餐，算已摄入与剩余预算。
2. 有图片且配置了 `visionModel`：`getTempFileURL` 取 https 地址，消息 content 为 `[{type:"text"}, {type:"image_url"}]`，调用视觉模型。
3. 视觉调用失败或无图片：若有备注，用 `textModel` 按文字描述分析（mode = `text`，点评注明"根据你的描述"）；若既无可用图片分析又无备注，保存为 `failed`，前端可重试。
4. 模型被要求只输出 JSON；`parse.js` 容错（去代码块围栏、截取首尾大括号、字段归一化与数值钳制），解析失败同样落为 `failed`。

### 提示词要点

- 角色：养生师「小暖」，温和但认真；营养学算账 + 养生常识；口语化，点评 ≤ 80 字。
- 上下文：档案、忌口、每日预算、今日已摄入、本餐餐次与备注。
- 安全：不做医疗诊断；不建议每日低于下限；发现明显节食、暴食或身体不适时建议就医/咨询专业人士。
- 非食物图片：返回 `isFood: false`，评级为 null。

## 错误处理

- 云函数超时设为 60 秒（README 说明控制台配置）；前端显示"养生师正在看你的饭菜…"。
- 上传前 `wx.compressImage` 压缩，降低 token 与超时风险。
- 所有 service 抛出带 `code` 的业务错误，router 转成 `{ ok:false }`；未知错误统一"服务开小差了"，详细信息写日志。

## 测试

- `node --test`：nutrition（BMR、预算、下限）、date（东八区跨日）、meal-types（按时间预选）、parse（围栏、脏 JSON、钳制、非食物）、prompts（包含关键上下文）、profile 校验、services（视觉成功、视觉失败回退文字、无备注失败、重新分析、总结无餐报错、体重覆盖）、router（未知 action、错误信封）、chart 坐标、共享文件一致性。
- 前端页面无自动化测试，交付后在微信开发者工具真机预览验证。

## 不做（YAGNI）

支付、订阅消息提醒、家人互看、多语言、运动记录、自定义营养目标。
