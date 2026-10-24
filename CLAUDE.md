# 小暖养生打卡 — 给 Claude 的项目说明

微信小程序：家人（主要是妈妈）每餐拍照打卡，AI 养生师「小暖」估算热量并点评；每天按正餐打卡得「暖豆」（早午晚印章），打开就是首页「园林大宅院」：可拖动缩放的等距大宅院，墙和月亮门隔成 11 个院子，壳画好、院子里的东西靠玩家摆（扭蛋抽物件，按地面种类摆、2×2 大件、能转向），花暖豆挨着修整院子；有图鉴和节气限定；摆了小动物喜欢的东西，打卡后它从大门搬进来，在各院子里按作息走动、玩耍、做小事；新物件、小鸟蝴蝶先用占位图。家人自用，走微信「体验版」，不上架。用户用中文沟通。

- 设计：`docs/superpowers/specs/`（主功能、每日树、庭院扭蛋、小动物、大地图、小岛花园、园林大宅院）；实现计划：`docs/superpowers/plans/`；美术需求：`docs/art/codex-art-pack.md`（给 Codex 的全套出图工单：宅院、云、图标、表情、新物件、动画拼图；参考图在 `art/guide/`），早期物件的出图说明 `docs/art/garden-art-brief.md`
- 上手与排错：`README.md`

## 开发约定

- `npm test`（node:test，零依赖）必须全绿再推；改动 JS 后也跑一遍 `node --check`
- `cloudfunctions/api/lib/shared/` 与 `miniprogram/utils/shared/` 必须逐字节一致（有测试检查），改一边就复制到另一边
- 云函数响应统一 `{ ok, data }` / `{ ok: false, code, message }`，message 直接展示给用户，用中文
- services 通过依赖注入拿 repo / chat / forest，测试用 `test/helpers/fake-repo.js`；端到端用 `test/helpers/fake-cloud.js` 加载真实 `index.js`；页面用 `test/helpers/page-harness.js` 跑
- 页面面向长辈：字号偏大、文案口语化
- 图片：美术原图在 `art/raw/`，`python3 scripts/slice-art.py` 切成物件和界面图；`scripts/draw-images.py` 画 tab 图标、木牌、亮格和缺图时的占位图；`scripts/estate/blockout.py` 按 `shared/estate.js` 画宅院白模（兜底的底图切块、给 Codex 的 3:2 底稿）。主包上限 2MB（**现在约 1.93MB，很满了**，再往包里加图先用 `du -sb miniprogram` 看字节数；大图一律走云存储）

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
| 宅院原画 `art/raw/estate/estate-hd.png` | `python3 scripts/estate/cut_art.py art/raw/estate/estate-hd.png --warp art/raw/estate/estate-hd.warp.json --width 4096`（画得和白模一样正的用 `--pad32` 自动对齐），然后 `npm run wx:art`，把打印的 fileID 前缀填进 `miniprogram/config.js` 的 `estateArt`；壳数据要跟着画改（见「当前状态」最新一条） |
| 动画拼图 `art/raw/anim/*.png` | `python3 scripts/pack_anim.py`，然后 `npm run wx:art`，前缀填进 `config.animArt` |
| 其他 Codex 出的图 `art/raw/**` | `python3 scripts/art/check_art.py` 自检，`python3 scripts/slice-art.py` 切图替换占位 |

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
- 2026-10-23：养生庭院 + 扭蛋机 + 图鉴上线；原「森林」tab 改为「庭院」，森林页变成「打卡日历」。用户用 Codex 生成的 3D 风格美术（zip 上传，8 张整图）已全部切好换上，48 个物件、6 个树阶段、扭蛋机/扭蛋/礼盒/图鉴/暖豆都是正式图
- 2026-10-23：庭院小动物上线：9 只动物不再从扭蛋出，摆了喜欢的东西后下次正餐打卡搬来，在庭院里自己走动、和物件互动、点一下说话（`utils/animals.js` + `utils/garden-life.js`，设计见 specs/2026-10-23-garden-animals-design.md）
- 2026-10-23：大地图上线：庭院页全屏（自定义导航）、`movable-view` 拖动缩放，3×3 块地、花暖豆开荒；界面去掉每日的树，改成早午晚印章 + 暖豆；（已被小岛花园取代）
- 2026-10-23：小岛花园上线，取代 3×3 大地图：花园做首页（tab 第一个，没建档跳去建档），12×12 小岛 = 中间花园 + 四个修整角落（200/300/400/500，自带风景，风景也引小动物）+ 四个花坛；十字小路不能摆；底部大按钮去打卡；旧数据自动迁移（大地图坐标 −3、开荒暖豆退回）。（已被园林大宅院取代）
- 2026-10-23：园林大宅院上线（第一步）：37×28 格、11 个院子（开局前院 + 正院，其余挨着修，共 3500 暖豆），`shared/estate.js` 管布局和规则；物件按地面摆、2×2、flip、影子；小动物跨院走动、作息、小事、「找它」；旧数据迁移（物件收回背包、暖豆退回、`estate: 1`）。底图是白模切块（jpg），正式原画等用户按 `docs/art/garden-estate-art-brief.md` 出；第二步换原画（切块传云存储）、第三步新物件 18 件 + 小鸟蝴蝶，见设计文档「上线节奏」
- 2026-10-23：第三步上线：步态（`gait`：四条腿踱步 / 摇摆 / 蹦 / 爬 / 迈步 / 飞 / 扑棱）+ 小段散步；18 件新物件（水生 6、家具 11、稻草人）、`likesAny`；小鸟（树 3 棵或喂鸟台）和蝴蝶（花 3 丛或花架）会飞、不占格、夜里 / 非时段藏起来；图鉴 68。新图是 emoji 占位，出图说明第 4～6 张。原画工具链 `cut_art.py` → `wx:art` 已用白模验证上传成功，fileID 前缀 `cloud://cloud1-d0gc0a24t697e8d8b.636c-cloud1-d0gc0a24t697e8d8b-1514373455/garden/estate/`；`config.estateArt` 仍为空、页面用本地白模，真机看过云存储的图再切换
- 2026-10-23：第四步上线：遮挡（`utils/occlusion.js`：墙 / 月亮门 / 大门 / 建筑按多边形从底图抠块盖在后面的东西上，只在需要时生成；木牌云朵彩带 z 2000+）；逐帧动画引擎（`utils/anim.js` + `anim-sheets.js`，6×4 拼图、steps 跳帧、朝向分正背面、没图退回单张图；`config.animArt` 仍为空）；给 Codex 的出图工单 `docs/art/codex-art-pack.md`（18 张）+ `art/manifest.json` + `scripts/art/check_art.py`；第二轮高清工具 `detail_crops.py` / `merge_details.py`；`cut_art.py --pad32`。
- 2026-10-24：Codex 出的 18 张图全部接入：宅院原画（自动对齐 scale 0.99 / dy −3，`cut_art.py --pad32 --width 3072`）和 11 张动画拼图已传云存储，`config.estateArt` / `animArt` 都已填（前缀 `cloud://cloud1-d0gc0a24t697e8d8b.636c-cloud1-d0gc0a24t697e8d8b-1514373455/garden/estate/` 和 `…/garden/anim/`）；18 件新物件、小鸟蝴蝶单张、木牌、背包/日历/回家/住户/相机图标、9 朵云（`images/garden/clouds/`，`world.js` 轮换）、9 个表情（`images/garden/fx/`，页面 `fx` 表把常用 emoji 换成图）都进了包。壳数据按原画微调：荷塘院水榭平台去掉、池北加木桥 `pave`，后花园假山改成 `[9,1,22,3]` 一长排、瀑布水潭 `[13,2,15,4]`+`[15,3,17,4]`，温泉木屋 `[27,1,29,3]`，影壁 `[12,23,14,25]`。木牌文字按木牌宽度定字号、价钱放板子下面的白条。**待办**：真机核对遮挡多边形和原画（尤其正房屋顶、月亮门洞）；原画只有 1536 宽，想更清楚就做第二轮高清（`detail_crops.py` → Codex 逐块重绘 → `merge_details.py` → 重新 `cut_art.py`，这次不用 `--pad32`）
- 2026-10-24（晚）：第二版宅院原画接入。Codex 按新画风重画（低围栏 / 绿篱 / 小溪 / 台地，宅院坐在石崖上，`art/raw/estate/estate.png` + 高清 `estate-hd.png` 4146 宽）。原画带一点透视、布局和白模也不完全一样，所以：`cut_art.py --warp art/raw/estate/estate-hd.warp.json --width 4096`（四点透视校正：json 里是外墙内侧四角在原画上的像素坐标，`--save` 可存出对齐后的整张画）切 16 块传云存储（已传，`estateArtVersion: 2`）；`shared/estate.js` 的院子矩形、壳、门、隔断（`FENCE_TILES`，一格一格列）、活动点、起始格 (15,18) 全部照画重新量过（`scripts/estate/occ_overlay.py` 把遮挡多边形画在对齐后的画上核对，`FENCE_H` 分 outer 1.1 / wall 1.9，正房屋顶 3.4 格高、出挑 0.7）；旧档迁移 `adoptEstate2`（estate 1 → 2：摆在现在摆不了的格子上的收回背包，大树挪到新起始格）。相邻关系有变：前院只挨果园和正院，正院挨后花园和动物小院，花圃院只挨荷塘院和菜园。物件只有 07 珍稀一张重画了（已切），03～06、08～11 还是第一版风格。**待办**：真机看第二版原画和遮挡；要不要让 Codex 把剩下的物件拼图也按新画风重画
- 2026-10-23：测试福利 `config.testGrant`（5000 暖豆，10/26 前打开花园的账号各送一次）给用户试修整角落和扭蛋。**上传体验版给妈妈之前把 `testGrant` 改成 `null` 并重新部署云函数**
- 2026-10-23：`api` 已由用户在开发者工具里创建、超时改为 60 秒；之后用 `npm run wx:function` 从云端更新成功；`npm run wx:preview` 生成预览二维码成功，已发给用户试用

## 首次部署清单（新会话从这里接）

1. `npm install`，`npm test` 全绿
2. `npm run wx:function` 部署 `api` 云函数；报 IP 白名单错误就请用户去后台关闭白名单
3. 请用户到「云开发控制台 → 云函数 → api → 函数配置」把超时改成 60 秒
4. `npm run wx:preview`，用 SendUserFile 把 `.wechat/preview-qrcode.jpg` 发给用户扫码，先试建档、记体重（不依赖 AI）
5. AI：请用户在「云开发控制台 → AI → 生文模型」打开 `hy3` 和 `hy-vision-2.0-instruct` 的「套餐抵扣」开关，然后试拍照打卡；失败就看云函数日志定位分组或模型问题
6. 都正常后先把 `cloudfunctions/api/config.js` 的 `testGrant` 改成 `null`、`npm run wx:function`，再 `npm run wx:upload -- 1.0.0 首个体验版`，请用户在「版本管理」选为体验版、在「成员管理」加妈妈为体验成员
