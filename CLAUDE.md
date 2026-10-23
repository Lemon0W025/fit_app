# 小暖养生打卡 — 给 Claude 的项目说明

微信小程序：家人（主要是妈妈）每餐拍照打卡，AI 养生师「小暖」估算热量并点评；每天按正餐打卡长一棵树（养生森林）。家人自用，走微信「体验版」，不上架。用户用中文沟通。

- 设计：`docs/superpowers/specs/`（主功能、养生森林）；实现计划：`docs/superpowers/plans/`
- 上手与排错：`README.md`

## 开发约定

- `npm test`（node:test，零依赖）必须全绿再推；改动 JS 后也跑一遍 `node --check`
- `cloudfunctions/api/lib/shared/` 与 `miniprogram/utils/shared/` 必须逐字节一致（有测试检查），改一边就复制到另一边
- 云函数响应统一 `{ ok, data }` / `{ ok: false, code, message }`，message 直接展示给用户，用中文
- services 通过依赖注入拿 repo / chat / forest，测试用 `test/helpers/fake-repo.js`；端到端用 `test/helpers/fake-cloud.js` 加载真实 `index.js`；页面用 `test/helpers/page-harness.js` 跑
- 页面面向长辈：字号偏大、文案口语化
- 图片由 `scripts/draw-images.py` 生成（需要 Pillow）

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
- 小程序后台上传 IP 白名单：已提醒用户关闭，未确认
- 小程序成长计划：用户已报名（hunyuan-exp 分组应可用）
- 用户电脑上已用开发者工具导入项目（从 GitHub ZIP），能跑起来

## 首次部署清单（新会话从这里接）

1. `npm install`，`npm test` 全绿
2. `npm run wx:function` 部署 `api` 云函数；报 IP 白名单错误就请用户去后台关闭白名单
3. 请用户到「云开发控制台 → 云函数 → api → 函数配置」把超时改成 60 秒
4. `npm run wx:preview`，用 SendUserFile 把 `.wechat/preview-qrcode.jpg` 发给用户扫码，先试建档、记体重（不依赖 AI）
5. AI：成长计划已报名，但还没确认可用模型名。请用户截图「云开发控制台 → AI → 大模型」，据此改 `cloudfunctions/api/config.js` 再 `wx:function`，然后试拍照打卡
6. 都正常后 `npm run wx:upload -- 1.0.0 首个体验版`，请用户在「版本管理」选为体验版、在「成员管理」加妈妈为体验成员
