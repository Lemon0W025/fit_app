# 小暖养生打卡 — 给 Claude 的项目说明

微信小程序：家人（主要是妈妈）每餐拍照打卡，AI 养生师「小暖」估算热量并点评；每天按正餐打卡长一棵树、得「暖豆」，暖豆去扭蛋抽物件摆进等距「养生庭院」，有图鉴和节气限定。家人自用，走微信「体验版」，不上架。用户用中文沟通。

- 设计：`docs/superpowers/specs/`（主功能、每日树、庭院扭蛋）；实现计划：`docs/superpowers/plans/`；美术需求：`docs/art/garden-art-brief.md`
- 上手与排错：`README.md`

## 开发约定

- `npm test`（node:test，零依赖）必须全绿再推；改动 JS 后也跑一遍 `node --check`
- `cloudfunctions/api/lib/shared/` 与 `miniprogram/utils/shared/` 必须逐字节一致（有测试检查），改一边就复制到另一边
- 云函数响应统一 `{ ok, data }` / `{ ok: false, code, message }`，message 直接展示给用户，用中文
- services 通过依赖注入拿 repo / chat / forest，测试用 `test/helpers/fake-repo.js`；端到端用 `test/helpers/fake-cloud.js` 加载真实 `index.js`；页面用 `test/helpers/page-harness.js` 跑
- 页面面向长辈：字号偏大、文案口语化
- 图片由 `scripts/draw-images.py` 生成（需要 Pillow）；庭院物件/扭蛋 UI 现在是 emoji 占位图，正式图换进同名文件即可（主包上限 2MB）

## 从云端部署（miniprogram-ci）

前提（用户一次性配置）：
- 环境变量 `WX_UPLOAD_KEY`：小程序后台生成的代码上传密钥内容，在环境变量里用双引号包住整段多行内容（不要让用户把密钥贴在聊天里，也不要写进仓库）。不能用 Network secrets：上传工具要在本地用密钥签名，代理注入的密钥读不到
- 网络放行（Custom，勾选包含默认包管理器列表）：`servicewechat.com`、`*.servicewechat.com`、`*.tencentcloudapi.com`、`*.myqcloud.com`（腾讯云存储，云函数代码包可能经由它上传）
- 小程序后台的上传 IP 白名单已关闭（云端出口 IP 不固定）
- `miniprogram/config.js` 填好云开发环境 ID

命令（先 `npm install`）：

| 改了什么 | 执行 |
|---|---|
| `cloudfunctions/**` | `npm run wx:function` |
| `miniprogram/**` | `npm run wx:preview`，把 `.wechat/preview-qrcode.jpg` 发给用户扫码；确认后 `npm run wx:upload -- <版本号> <描述>` |

第一次 `wx:upload` 后，需要用户在小程序后台「版本管理」把 ci 机器人 1 上传的版本选为体验版，并在「成员管理」添加体验成员。

用户电脑上也有一份代码（git clone），用微信开发者工具；约定代码只由 Claude 修改并推送，用户那边只 `git pull`。

## 当前状态

- AppID：`wx6cab54d48dba1be5`（已写入 `project.config.json`）
- 云开发环境 ID：`cloud1-d0gc0a24t697e8d8b`（已写入 `miniprogram/config.js`）
- 云端环境：网络已放行并验证能连上 servicewechat.com / tencentcloudapi.com；`WX_UPLOAD_KEY` 用户已保存（新会话里先确认读得到，只看长度，别打印内容）
- 小程序后台上传 IP 白名单：已关闭（已验证能通过）
- `WX_UPLOAD_KEY` 存的是不带 BEGIN/END 行的密钥正文，`scripts/wechat.js` 会自动补齐
- miniprogram-ci 2.1.31 不能创建新云函数（函数不存在时直接报 ResourceNotFound.Function，且它的创建逻辑用 Node 8.9）：`api` 第一次必须在开发者工具里「上传并部署：云端安装依赖」创建，之后命令行更新
- 小程序成长计划：用户已报名
- AI 模型（按用户控制台截图）：生文模型列表里有 `hy3`（标注小程序成长计划）、`hy-vision-2.0-instruct`（图生文）、`hunyuan-t1-vision-20250916` 等；开关「套餐抵扣」默认全关。config 已改为 provider `cloudbase` + 备用 `hunyuan-exp`，vision `hy-vision-2.0-instruct`，text `hy3`。分组名未验证：ai.js 会自动试备用分组，看云函数日志里的 `AI 分组 … 失败` 确认哪个分组调通，再把 `provider` 定下来。也可以试 miniprogram-ci 内部的 `dist/ci/cloud/cloudapi` 的 `boundTransactRequest` 调 tcb `DescribeAIModels` 直接查（未验证）
- 用户电脑上已用开发者工具导入项目（从 GitHub ZIP），能跑起来
- 2026-10-23：养生庭院 + 扭蛋机 + 图鉴上线（占位图）；原「森林」tab 改为「庭院」，森林页变成「打卡日历」。用户在 Codex 生成 3D 风格美术（按 art brief 的 3×3 sprite sheet），原图还没传进来：让用户作为附件发送或传到仓库 `art/raw/`，再切图、去底、底部对齐、量化后替换占位图
- 2026-10-23：`api` 已由用户在开发者工具里创建、超时改为 60 秒；之后用 `npm run wx:function` 从云端更新成功；`npm run wx:preview` 生成预览二维码成功，已发给用户试用

## 首次部署清单（新会话从这里接）

1. `npm install`，`npm test` 全绿
2. `npm run wx:function` 部署 `api` 云函数；报 IP 白名单错误就请用户去后台关闭白名单
3. 请用户到「云开发控制台 → 云函数 → api → 函数配置」把超时改成 60 秒
4. `npm run wx:preview`，用 SendUserFile 把 `.wechat/preview-qrcode.jpg` 发给用户扫码，先试建档、记体重（不依赖 AI）
5. AI：请用户在「云开发控制台 → AI → 生文模型」打开 `hy3` 和 `hy-vision-2.0-instruct` 的「套餐抵扣」开关，然后试拍照打卡；失败就看云函数日志定位分组或模型问题
6. 都正常后 `npm run wx:upload -- 1.0.0 首个体验版`，请用户在「版本管理」选为体验版、在「成员管理」加妈妈为体验成员
