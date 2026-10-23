# 小暖养生打卡

一个给家人用的微信小程序：每餐拍照打卡，AI 养生师「小暖」估算热量、点评、给下一餐建议，每天还能生成总结、记录体重。花一两千请人监督减肥的事，交给小暖。

## 功能

- **建档**：身高、体重、目标、活动量、忌口 → 自动算出每日热量预算（Mifflin-St Jeor 公式，减重留 500 千卡缺口，女性不低于 1200、男性不低于 1500）
- **拍照打卡**：选餐次、拍照、可加一句备注（"米饭只吃了一半"）。小暖识别菜品，估算热量和蛋白质/碳水/脂肪，给出 绿/黄/红 评级、点评和下一餐建议
- **没拍照也能打卡**：直接写吃了什么，按文字估算
- **今日页**：已吃 / 剩余热量进度条，每餐卡片，一键生成「今日总结」
- **估得不准**：补充描述后重新分析；可删除打卡
- **体重**：每天记录，30 天折线图（接近目标时显示目标线）；记录当天体重会自动调整每日预算
- **养生庭院**：每天的打卡种出一棵树、换来「暖豆」；暖豆拿去扭蛋，抽花草、果树、小动物、亭子，摆进自己的庭院（详见下文）

## 养生庭院（打卡奖励）

参考 Forest 和扭蛋机：每天都有一点进展，攒够了能抽到新东西、把院子布置得更好看，让人愿意每天回来打卡。

### 每天一棵树 → 暖豆

| 今天的正餐 | 今天的树 |
|---|---|
| 没打卡 | 空地（不会有枯树） |
| 打卡 1 顿 | 🌱 树苗 |
| 打卡 2 顿 | 🌿 小树 |
| 三顿都打卡 | 🌳 大树 |
| 三顿都打卡，其中两顿绿色评级 | 🌸 开花 |
| 三顿都打卡，全是绿色 | 🍎 结果 |

- 树长到 树苗 / 小树 / 大树 / 开花 / 结果，当天分别累计得 10 / 20 / 40 / 50 / 60 暖豆（删掉打卡会相应扣回）
- 加餐照常点评但不影响树；吃得不好不扣分，免得不敢拍
- 每次打卡后结果页告诉你树长成了什么样、得了多少暖豆；今日页顶部有今天的树和下一步怎么做
- 「打卡日历」按月显示每天的树，点某天能看到吃了几顿、多少千卡；🔥 连续天数

### 扭蛋机 → 庭院 → 图鉴

- 第一次进庭院送 60 暖豆，院子中间种好一棵大树
- 扭一次 30 暖豆；普通 65% · 稀有 25% · 珍稀 8% · 传说 2%；连续 9 次没出珍稀，第 10 次必出珍稀以上
- 一共 48 种：扭蛋里 39 种（普通 15 · 稀有 10 · 珍稀 6 · 传说 3 · 节气限定 5，节气限定在霜降、立冬、小雪、大雪、冬至期间概率提高）+ 9 只小动物（见下文）
- 抽到的东西进背包，点一下再点庭院里亮着的空地就摆上去；点已摆的东西可以移动或收回背包
- 图鉴集齐 20 种，庭院从 6×6 扩大到 8×8
- 规则细节见 `docs/superpowers/specs/2026-10-23-garden-gacha-design.md`（每日树的规则见 `2026-10-22-forest-reward-design.md`）

### 小动物

小动物不从扭蛋里出：庭院里摆了它喜欢的东西，下一次正餐（早/午/晚）打卡时它就搬来，打卡结果页会告诉你谁来了。

| 小动物 | 喜欢 |
|---|---|
| 小黄鸡 | 青草丛 |
| 小白兔 | 白萝卜 |
| 小花猫 | 小板凳 |
| 小乌龟 | 鹅卵石 |
| 大熊猫 | 翠竹 |
| 小黄鸭 | 锦鲤池 |
| 胖橘猫 | 茶桌 |
| 仙鹤 | 荷花池 |
| 熊猫一家 | 大熊猫已经住进来，且摆着 3 丛翠竹 |

- 每次打卡最多来一只，按喜欢的东西摆进庭院的先后排队；有动物在等时庭院顶上会提示「有小动物在院子外张望」
- 住进来就不走：东西收回、打卡删除都不影响
- 在庭院里自己走来走去，碰到能玩的东西会停下来玩：熊猫吃竹子、兔子啃萝卜、小鸡啄草、鸭子乌龟仙鹤下水、猫跳上板凳茶桌打盹、荡秋千、乌龟爬上鹅卵石晒背、立冬限定的烤红薯炉大家都来烤火
- 点一下会蹦一下、冒爱心、说一句话（有的是养生小提醒）
- 规则细节见 `docs/superpowers/specs/2026-10-23-garden-animals-design.md`；动物的脾气、台词、能玩的东西在 `miniprogram/utils/animals.js`

## 目录结构

```
miniprogram/                 小程序前端（原生 WXML/WXSS/JS）
  pages/today|garden|weight|profile  四个 tab：今日、庭院、体重、我的
  pages/checkin|meal          打卡、打卡详情
  pages/gacha|collection|forest  扭蛋机、图鉴、打卡日历
  utils/api.js               调用云函数、上传照片、错误提示
  utils/view.js, chart.js    页面展示整理、体重图
  utils/iso.js, garden-view.js  庭院的等距网格换算、摆放与图鉴展示
  utils/animals.js, garden-life.js  小动物的脾气与台词、在庭院里走动玩耍的调度
  utils/shared/              与云函数共用的纯逻辑（日期、营养计算、餐次、每日树、庭院与扭蛋规则）
  images/                    tabBar 图标、每日树、庭院地块和物件（见下文「图片」）
  config.js                  云开发环境 ID
cloudfunctions/api/          唯一的云函数，按 action 路由
  config.js                  ← AI 模型配置在这里
  services/                  建档、打卡、今日/总结、体重、每日树与暖豆、庭院与扭蛋
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

1. 报名 **小程序成长计划**（[说明](https://docs.cloudbase.net/ai/ai-inspire-plan)），有赠送额度
2. 打开 **云开发控制台 → AI → 生文模型**，把要用的模型右边的「**套餐抵扣**」开关打开：
   - `hy-vision-2.0-instruct`：图生文，用来看饭菜照片
   - `hy3`：标注「小程序成长计划」，用来按文字估算和写每日总结
3. 模型名都写在 `cloudfunctions/api/config.js`：

```js
module.exports = {
  provider: 'cloudbase',                 // 分组名
  fallbackProviders: ['hunyuan-exp'],    // 主分组调不通时依次尝试，调通后记住
  visionModel: 'hy-vision-2.0-instruct', // 看图的模型；填 '' 则只按文字估算
  textModel: 'hy3',                      // 文字估算 + 每日总结
  imageMode: 'url',                      // 模型取不到图片时改成 'base64'
}
```

> 想换模型时，在控制台复制模型名（名字旁边有复制按钮）填进去，并打开它的「套餐抵扣」开关。调用失败的原因会写在云函数日志里（搜 `AI 分组`）。

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
2. Claude 云端环境设置（会话标题右边的小箭头 → Edit cloud environment）：
   - Network access 选 Custom，Allowed domains 每行一个：`servicewechat.com`、`*.servicewechat.com`、`*.tencentcloudapi.com`、`*.myqcloud.com`，并勾选「Also include default list of common package managers」
   - Environment variables 新增一行 `WX_UPLOAD_KEY="……"`，引号中间粘贴密钥文件的全部内容（用记事本打开、全选复制，多行没关系）
3. 网络设置一分钟内生效；环境变量要等会话重启后才读得到，最稳的是开一个新会话说「部署」，项目背景在 `CLAUDE.md`

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
- 每日树的规则在 `cloudfunctions/api/lib/shared/forest.js`；暖豆、扭蛋概率、物件清单、节气在 `cloudfunctions/api/lib/shared/garden.js`

### 图片

- 美术原图在 `art/raw/`（Codex 生成的 8 张 3×3 整图，格子顺序见 `art/raw/中文物件索引.txt`）；`python3 scripts/slice-art.py` 把它们切成单张图，覆盖 `miniprogram/images/` 下的每日树、庭院物件和界面图（需要 Pillow 和 numpy）
- 加新物件：在 `lib/shared/garden.js` 的 ITEMS 里加一项，按 `docs/art/garden-art-brief.md` 出图放进 `art/raw/`，在 `slice-art.py` 的 SHEETS 里写上格子对应的物件 id，再跑一遍
- `scripts/draw-images.py` 画 tab 图标和庭院地块（`images/garden/land-6.png`、`land-8.png`）；还没有正式美术的物件，它会补一张 emoji 占位图（已有的不覆盖）
- 小程序主包上限 2MB，现在约 1.6MB；加图后看一眼 `du -sh miniprogram`

## 第二期计划

- 饭点提醒（订阅消息）
- 家人查看打卡（比如子女能看到妈妈每天吃了什么）
