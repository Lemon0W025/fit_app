# 小暖养生打卡

一个给家人用的微信小程序：每餐拍照打卡，AI 养生师「小暖」估算热量、点评、给下一餐建议，每天还能生成总结、记录体重。花一两千请人监督减肥的事，交给小暖。

## 功能

- **建档**：身高、体重、目标、活动量、忌口 → 自动算出每日热量预算（Mifflin-St Jeor 公式，减重留 500 千卡缺口，女性不低于 1200、男性不低于 1500）
- **拍照打卡**：选餐次、拍照、可加一句备注（"米饭只吃了一半"）。小暖识别菜品，估算热量和蛋白质/碳水/脂肪，给出 绿/黄/红 评级、点评和下一餐建议
- **没拍照也能打卡**：直接写吃了什么，按文字估算
- **今日页**：已吃 / 剩余热量进度条，每餐卡片，一键生成「今日总结」
- **估得不准**：补充描述后重新分析；可删除打卡
- **体重**：每天记录，30 天折线图（接近目标时显示目标线）；记录当天体重会自动调整每日预算
- **养生森林**：每天种一棵树，三顿正餐的打卡决定它长多大，坚持的日子按月连成一片森林（详见下文）

## 养生森林（打卡奖励）

参考 Forest：每天一棵树，让人每天都有成就感、愿意坚持。

| 今天的正餐 | 今天的树 |
|---|---|
| 没打卡 | 空地（不会有枯树） |
| 打卡 1 顿 | 🌱 树苗 |
| 打卡 2 顿 | 🌿 小树 |
| 三顿都打卡 | 🌳 大树 |
| 三顿都打卡，其中两顿绿色评级 | 🌸 开花 |
| 三顿都打卡，全是绿色 | 🍎 结果 |

- 加餐照常点评但不影响树；吃得不好不扣分，免得不敢拍
- 每次打卡后结果页告诉你树长成了什么样、下一步怎么做；今日页顶部有今天的树
- 「森林」页按月显示每天的树，点某天能看到吃了几顿、多少千卡；🔥 连续天数
- 累计种满 7 / 15 / 30 / 50 / 80 棵树，依次解锁橘子树、桃树、石榴树、柿子树、樱桃树，可以选今天种哪种
- 规则细节见 `docs/superpowers/specs/2026-10-22-forest-reward-design.md`

## 目录结构

```
miniprogram/                 小程序前端（原生 WXML/WXSS/JS）
  pages/today|forest|checkin|meal|weight|profile
  utils/api.js               调用云函数、上传照片、错误提示
  utils/view.js, chart.js    页面展示整理、体重图
  utils/shared/              与云函数共用的纯逻辑（日期、营养计算、餐次、森林规则）
  images/                    tabBar 图标、森林树块（由 scripts/draw-images.py 生成）
  config.js                  云开发环境 ID
cloudfunctions/api/          唯一的云函数，按 action 路由
  config.js                  ← AI 模型配置在这里
  services/                  建档、打卡、今日/总结、体重、森林
  lib/                       提示词、AI 输出解析、校验等纯逻辑
scripts/draw-images.py      重新生成图片（需要 Pillow：pip install pillow）
test/                        单元测试 + 端到端测试 + 页面冒烟测试
docs/superpowers/            设计文档与实现计划
```

## 上手步骤

### 1. 准备

- 在 [微信公众平台](https://mp.weixin.qq.com/) 注册一个小程序（**个人主体即可**），在「开发管理 → 开发设置」里拿到 **AppID**
- 安装 [微信开发者工具](https://developers.weixin.qq.com/miniprogram/dev/devtools/download.html)

### 2. 导入项目

开发者工具 → 导入项目 → 选择本仓库根目录。AppID 已经写在 `project.config.json` 里，会自动带出；换了小程序账号的话改成新的 AppID。

### 3. 开通云开发

工具栏点「云开发」→ 开通 → 创建一个环境（套餐和价格以控制台显示为准）。

把环境 ID 填进 `miniprogram/config.js`；留空则使用开发者工具当前选中的环境。

### 4. 开通 AI 并确认模型名

小暖用的是云开发自带的大模型，在云函数里通过 `cloud.ai().createModel(分组名)` 调用。

1. 报名 **小程序成长计划**（[说明](https://docs.cloudbase.net/ai/ai-inspire-plan)），开通后 `hunyuan-exp` 分组有赠送额度
2. 打开 **云开发控制台 → AI → 大模型**，看 `hunyuan-exp` 分组里已开启哪些模型
3. 把实际可用的模型名填进 `cloudfunctions/api/config.js`：

```js
module.exports = {
  provider: 'hunyuan-exp',                         // 分组名
  visionModel: 'hunyuan-vision',                   // 看图的模型；没有就填 ''，只按文字估算
  textModel: 'hunyuan-2.0-instruct-20251111',      // 文字估算 + 每日总结
  imageMode: 'url',                                // 模型取不到图片时改成 'base64'
}
```

> 看图需要**视觉模型**（名字里一般带 `vision` 或 `V`）。默认的 `hunyuan-2.0-instruct` 只认文字。如果你的分组里没有视觉模型：
> - 在控制台为该分组开启一个视觉模型，或
> - 改用 `provider: 'cloudbase'`（需要购买 Token 资源包），在控制台开启一个视觉模型并把名字填进 `visionModel`，或
> - 先把 `visionModel` 设成 `''`，打卡时写一句文字描述（照片照样保存、显示）

### 5. 部署云函数

1. 在开发者工具里右键 `cloudfunctions/api` → **上传并部署：云端安装依赖**
2. 打开 **云开发控制台 → 云函数 → api → 函数配置**，把 **超时时间改成 60 秒**（默认 3 秒，AI 看图来不及）

数据库**不用手动建集合**：`users`、`meals`、`weights`、`summaries`、`gardens` 会在第一次使用时自动创建，权限保持默认的「仅创建者可读写」即可。

以后改了 `cloudfunctions/api/config.js` 或其他云函数代码，都要重新「上传并部署」。

### 6. 预览和给家人用

- 工具栏「预览」，用自己的微信扫码试用
- 给妈妈用：工具栏「上传」→ 小程序后台「版本管理」把这个版本设为 **体验版** →「成员管理」里把妈妈的微信加为 **体验成员**，她扫体验版二维码就能用，不需要审核上架

> 如果以后想正式上架给外人用：含生成式 AI 的小程序需要相应的主体和资质，个人主体一般过不了审核。家人自用请用体验版。

### 7.（可选）让 Claude 在云端直接部署

用微信官方的 [miniprogram-ci](https://www.npmjs.com/package/miniprogram-ci)，不用开开发者工具也能上传代码、部署云函数、生成预览二维码（`scripts/wechat.js`）。一次性准备：

1. 小程序后台「开发管理 → 开发设置 → 小程序代码上传」：生成**代码上传密钥**并下载；IP 白名单选择关闭（云端出口 IP 不固定）。密钥能上传开发版本，不要外传
2. Claude 云端环境设置（会话标题栏的环境菜单 → Edit）：
   - Network access 放行 `servicewechat.com`、`tcb.tencentcloudapi.com`、`scf.tencentcloudapi.com`、`flexdb.tencentcloudapi.com`
   - 新增环境变量 `WX_UPLOAD_KEY`，值为密钥文件的全部内容（用记事本打开复制）
3. 设置对新会话生效：开一个新会话说「部署」即可，项目背景在 `CLAUDE.md`

命令：`npm install` 之后 `npm run wx:function` / `npm run wx:preview` / `npm run wx:upload -- 版本号 描述`。

## 常见问题

| 现象 | 原因和处理 |
|---|---|
| 弹出「云函数超时了」 | 云函数超时时间没改，按第 5 步改成 60 秒 |
| 弹出「还没有部署云函数」 | 右键 `cloudfunctions/api` → 上传并部署：云端安装依赖 |
| 弹出「云开发环境不可用」 | 没开通云开发，或 `miniprogram/config.js` 的环境 ID 写错 |
| 打卡总显示「照片暂时没认出来」 | 视觉模型名不对或没开启。看 **云开发控制台 → 云函数 → api → 日志**，搜 `vision analysis failed` 查看具体报错；模型取不到图片时把 `imageMode` 改成 `'base64'` |
| 「小暖暂时没回上话」/「总结没生成出来」 | 文字模型名不对、没开启或额度用完，同样看云函数日志（报错里有 `AI+ 请求出错，错误码`） |
| 估算的热量明显不准 | 在详情页点「估得不准？」补充描述（份量、做法、剩了多少）后重新分析 |

## 开发

需要 Node.js 18+，不需要安装任何依赖：

```bash
npm test
```

测试包括：

- 纯逻辑单测：营养计算、日期、AI 输出解析、提示词
- services 和路由测试：用内存版数据库和假的 AI
- 端到端测试：加载真实的 `cloudfunctions/api/index.js`，配一个模拟 wx-server-sdk 的假云环境
- 页面冒烟测试：在 Node 里用假的 `wx` 跑每个页面的完整使用流程，并检查 WXML 标签配对、事件函数和数据引用

约定：

- `cloudfunctions/api/lib/shared/` 和 `miniprogram/utils/shared/` 两份文件必须一模一样（测试会检查），改了一边记得复制到另一边
- 云函数响应统一为 `{ ok: true, data }` 或 `{ ok: false, code, message }`，`message` 会直接展示给用户
- 提示词在 `cloudfunctions/api/lib/prompts.js`，想调整小暖的说话风格改这里
- 森林规则（阶段、树种、解锁门槛）在 `cloudfunctions/api/lib/shared/forest.js`；加新树种时同时在 `scripts/draw-images.py` 里加颜色并重新生成图片

## 第二期计划

- 饭点提醒（订阅消息）
- 家人查看打卡（比如子女能看到妈妈每天吃了什么）
