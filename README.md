# 小暖养生打卡

一个给家人用的微信小程序：每餐拍照打卡，AI 养生师「小暖」估算热量、点评、给下一餐建议，每天还能生成总结、记录体重。花一两千请人监督减肥的事，交给小暖。

## 功能

- **建档**：身高、体重、目标、活动量、忌口 → 自动算出每日热量预算（Mifflin-St Jeor 公式，减重留 500 千卡缺口，女性不低于 1200、男性不低于 1500）
- **拍照打卡**：选餐次、拍照、可加一句备注（"米饭只吃了一半"）。小暖识别菜品，估算热量和蛋白质/碳水/脂肪，给出 绿/黄/红 评级、点评和下一餐建议
- **没拍照也能打卡**：直接写吃了什么，按文字估算
- **今日页**：已吃 / 剩余热量进度条，每餐卡片，一键生成「今日总结」
- **估得不准**：补充描述后重新分析；可删除打卡
- **体重**：每天记录，30 天折线图（接近目标时显示目标线）；记录当天体重会自动调整每日预算
- **暖暖营地**（首页）：每天打卡换「暖豆」；暖豆拿去扭蛋抽食物，食物放进食盆引来 12 只「动物 × 养生食材」的小精灵，每次打卡都算喂它们一顿、越喂越亲；暖豆还能在商店买装饰，拖到营地草地上任意摆（详见下文）

## 暖暖营地（打卡奖励）

参考宝可梦 Sleep 和扭蛋机：每天都有一点进展，攒够了能抽到新食物、引来新住户、把营地布置得更好看，让人愿意每天回来打卡。

### 每天打卡 → 暖豆

| 今天的正餐 | 当天的暖豆 |
|---|---|
| 没打卡 | 0 |
| 打卡 1 顿 | 10 |
| 打卡 2 顿 | 20 |
| 三顿都打卡 | 40 |
| 三顿都打卡，其中两顿绿色评级 | 50 |
| 三顿都打卡，全是绿色 | 60 |

- 删掉打卡会相应扣回；加餐照常点评但不算暖豆；吃得不好不扣分，免得不敢拍
- 早 / 午 / 晚三个印章：绿色吃得好、黄色一般、红色要注意、灰色打了卡但没分析出来、虚线没打卡
- 每次打卡后结果页告诉你这次多得了多少暖豆、谁搬来了；营地左上角和今日页顶部都有「今天得了 X 暖豆」和三个印章
- 「打卡日历」按月显示每天的印章和暖豆，点某天能看到吃了几顿、多少千卡；🔥 连续天数

### 营地

- 打开小程序就是营地（第一次用会先去「我的」建档）：一块比屏幕大一圈的正方形草坪（默认看中间一半宽，拖着看两边），正中是篝火和火上的暖暖锅、左上角一顶大帐篷、火边两个食盆，后面是一片树林；今天打了几顿正餐，锅里就有几层；一指拖动、双指缩放（0.8～2.5 倍），左下角「🏠」回到篝火
- 开局豆豆就住在营地里，再送 60 暖豆
- **扭蛋抽食物**：30 暖豆一抽；普通 65% · 稀有 25% · 珍稀 8% · 传说 2%；连续 9 次没出珍稀，第 10 次必出珍稀以上。23 样食物按宠物爱吃的定，稀有度跟宠物走；10 样节气点心（霜降柿饼、冬至饺子、清明青团……）只在当季进池
- **食盆引宠物**：把食物放进食盆，爱吃它、还没住进来的小动物会在树林边探头张望；下次正餐打卡它就走进营地（一次一只）。要是爱吃它的都住下了，这份食物就由住户吃掉
- **喂熟**：每次正餐打卡所有住户都算吃了一顿（亲密度 +1，一天最多 3 次）；从背包把食物拖到某一只身上直接喂（爱吃 +3，不爱吃 +1，节气点心 +5）。五级：来了 → 新睡姿 → 小动作 → 点它会蹭过来 → 专属动作，每升一级图册里多一句小故事
- **商店买装饰**：24 件，30～150 暖豆（窝、吃喝、玩、花草、气氛），买了拖到草地任意位置放，长按挪动或收回。装饰是在营地原图上原地画出来的整块（连一圈草地一起裁、边缘羽化），不会浮在地上
- **早上的礼物**：4 级以上的住户每天早上叼来一份礼物（5 暖豆或一份普通食物），点它收下
- **图册**：每只宠物一页（没来的是剪影加提示），尝过的食物、买过的装饰各一页；12 只到齐送金色小帐篷
- 规则细节见 `docs/superpowers/specs/2026-10-24-camp-pets-design.md`

### 宠物

12 只原创小精灵，每只是一种小动物和一样养生食材长在一起：

| 名字 | 造型 | 爱吃 | 档 |
|---|---|---|---|
| 豆豆 | 小黄鸡，头顶一颗发芽的黄豆 | 小米、玉米粒 | 常见 |
| 糯糯 | 小白兔，耳朵像两条年糕 | 胡萝卜、年糕 | 常见 |
| 莲莲 | 小黄鸭，头顶一片荷叶当伞 | 莲子、小鱼 | 常见 |
| 柿柿 | 小刺猬，背上的刺挂满小柿子 | 柿子、苹果 | 常见 |
| 花花 | 小花猫，尾巴尖是一朵菊花 | 小鱼干、菊花茶 | 稀有 |
| 龟龟 | 小乌龟，龟壳是一盆小苔藓盆景 | 西瓜、草莓 | 稀有 |
| 杞杞 | 小狐狸，脖子一串枸杞项链 | 烤红薯、葡萄 | 稀有 |
| 薯薯 | 小松鼠，腮帮子鼓得像两个红薯 | 核桃、红薯 | 稀有 |
| 橘团 | 橘猫，整只像一瓣橘子 | 橘子、牛奶 | 珍稀 |
| 笋宝 | 大熊猫，戴一顶竹笋帽 | 竹笋、竹叶 | 珍稀 |
| 茶茶 | 小鹿，鹿角上开着茶花 | 茶叶、桂花糕 | 珍稀 |
| 鹤鹤 | 仙鹤，红顶是一颗山楂（只在清晨 5～9 点出现） | 山楂（莲子只能喂） | 传说 |

- 一天有作息（按手机时间）：早上在食盆和篝火边晃；白天在草地上溜达、玩秋千滚球、橘团龟龟去篝火边的向阳草地晒太阳；傍晚全员围着篝火坐；夜里到窝里睡（没买窝的睡帐篷门口或树林边）
- 点一下说话冒爱心，连点两下打滚，长按摸摸，打卡成功回来全员到篝火边蹦一蹦；它们之间还会有小事（杞杞往薯薯碗里塞枸杞、糯糯和笋宝挤着睡……）
- 右边「住户」按钮列出每只现在在干嘛，点一下屏幕滑过去找到它
- 宠物的数据（记忆点、台词、小故事）在 `utils/shared/pets.js`，走动和作息在 `utils/camp-life.js`

## 目录结构

```
miniprogram/                 小程序前端（原生 WXML/WXSS/JS）
  pages/camp|today|weight|profile  四个 tab：营地（首页）、今日、体重、我的
  pages/checkin|meal          打卡、打卡详情
  pages/gacha|shop|album|forest  扭蛋机（食物）、商店（装饰）、营地图册、打卡日历
  utils/api.js               调用云函数、上传照片、错误提示
  utils/view.js, chart.js    页面展示整理、体重图
  utils/camp-view.js         画 ↔ 屏幕换算、底图切块、装饰块、拖拽幽灵、背包 / 商店 / 食盆视图、色调
  utils/camp-life.js, pets.js, anim.js, scene-fx.js  宠物走动与作息、台词、逐帧动画帧选择、篝火等动效
  utils/shared/              与云函数共用的纯逻辑（日期、营养计算、餐次、每日暖豆与印章、暖豆 / 稀有度 / 节气 garden.js、营地几何 camp.js、宠物 pets.js、食物 foods.js、装饰 decor.js）
  images/                    tabBar 图标、营地白模切块、宠物 / 装饰 / 食物占位图、界面图标
  config.js                  云开发环境 ID、云存储图的前缀
cloudfunctions/api/          唯一的云函数，按 action 路由
  config.js                  ← AI 模型配置在这里
  services/                  建档、打卡、今日/总结、体重、每日暖豆、营地（扭蛋、食盆、喂、商店、摆放、礼物、图册）
  lib/                       提示词、AI 输出解析、校验、文档迁移等纯逻辑
scripts/draw-images.py      tabBar 图标等（需要 Pillow：pip install pillow）
scripts/camp/               营地白模 blockout.py、占位图 placeholders.py、原画切块 cut_art.py、高清 detail_crops / merge_details、3:4↔2:3 pad23、装饰原地重绘 decor_crop / decor_patch
scripts/pack_anim.py        宠物动画拼图打包；scripts/art/check_art.py 出图自检
art/guide/camp-blockout.jpg 营地白模（blockout.py 生成，给 Codex 当重绘底稿）
test/                        单元测试 + 端到端测试 + 页面冒烟测试
docs/superpowers/            设计文档与实现计划；docs/art/camp-art-pack.md 出图工单
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
- 每天的暖豆档位和印章在 `cloudfunctions/api/lib/shared/forest.js`；暖豆数额、扭蛋概率、物件清单（含能摆的地面、占几格）、节气在 `cloudfunctions/api/lib/shared/garden.js`；院子、墙、门、壳里的地面、修整价格、能不能摆 / 走在 `cloudfunctions/api/lib/shared/estate.js`

### 图片

- 美术原图在 `art/raw/`（Codex 生成的 8 张 3×3 整图，格子顺序见 `art/raw/中文物件索引.txt`）；`python3 scripts/slice-art.py` 把它们切成单张图，覆盖 `miniprogram/images/` 下的花园物件和界面图（需要 Pillow 和 numpy）
- 加新物件：在 `lib/shared/garden.js` 的 ITEMS 里加一项，按 `docs/art/codex-art-pack.md` 的拼图规则出图放进 `art/raw/`，在 `slice-art.py` 的 SHEETS 里写上格子对应的物件 id，再跑一遍
- `scripts/draw-images.py` 画 tab 图标、修整木牌、亮格；还没有正式美术的物件和图标，它会补一张 emoji 占位图（已有的不覆盖）
- `python3 scripts/estate/blockout.py` 按 `estate.js` 的布局画宅院白模：切成 16 块 jpg 当占位底图（`images/garden/estate/`）、画云朵、输出 `art/guide/estate-blockout*.jpg`
- **全套正式美术由 Codex 按 `docs/art/codex-art-pack.md` 生成**（宅院整图、云、图标、表情、新物件、11 张小动物动画拼图），输出到 `art/raw/`，`python3 scripts/art/check_art.py` 自检
- 宅院原画到了：`python3 scripts/estate/cut_art.py art/raw/estate/estate.png --pad32` 切块到 `art/estate/`，`npm run wx:art` 传云存储，把打印的 fileID 前缀填进 `miniprogram/config.js` 的 `estateArt`，再 `npm run wx:preview`；加载失败页面会自动退回白模。要更清楚：`detail_crops.py` 切块给 Codex 逐块重绘，`merge_details.py` 拼回高清图再切
- 动画拼图到了：`python3 scripts/pack_anim.py` 对齐打包到 `art/anim/`，`npm run wx:art` 一并上传，前缀填进 `config.animArt`；没图或加载失败的那只自动退回单张图 + CSS 步态。`--demo` 用现在的单张图合成示意拼图验证播放
- 遮挡：墙、月亮门、大门、建筑会挡住站在后面的物件和小动物（`utils/occlusion.js`，从底图上按多边形抠一块盖上去，只在需要时生成）。原画的墙比白模高矮不同就调里面的 `WALL_H` / `BUILDINGS`
- 小程序主包上限 2MB，现在约 1.5MB；加图后看一眼 `du -sh --apparent-size miniprogram`

## 第二期计划

- 饭点提醒（订阅消息）
- 家人查看打卡（比如子女能看到妈妈每天吃了什么）
