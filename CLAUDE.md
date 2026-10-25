# 小暖养生打卡 — 给 Claude 的项目说明

微信小程序：家人（主要是妈妈）每餐拍照打卡，AI 养生师「小暖」估算热量并点评；每天按正餐打卡得「暖豆」（早午晚印章），打开就是首页「暖暖营地」：一块比屏幕大一圈的正方形草坪（默认看中间一半宽，拖着看两边）：正中篝火上吊着「暖暖锅」（营地的中心，今天打了几顿正餐锅里就有几层）、草坪最左上角一顶大帐篷（拖过去才看到）、火边两个食盆，后面一片树林当背景，夜里整套换夜景图，其余是空旷草坪（没有水面、木台，草坪里也没有树），暖豆扭蛋抽食物，食物放进食盆引来 12 只「动物 × 养生食材」的原创小精灵（豆豆、糯糯、笋宝……），每次打卡都算喂它们一顿、越喂越亲（五级解锁睡姿、小动作、专属动作和图册小故事）；暖豆在商店买装饰拖到草地上任意摆，装饰是在营地原图上原地重绘的整块（连草地一起裁、羽化边）所以不会浮；宠物有作息、互动、它们之间的小事、早上叼礼物、打卡后围篝火庆祝。家人自用，走微信「体验版」，不上架。用户用中文沟通。

- 设计：`docs/superpowers/specs/`（主功能、每日树、庭院扭蛋、小动物、大地图、小岛花园、园林大宅院，最新的是 `2026-10-24-camp-pets-design.md` 暖暖营地，前面几版都被它取代）；实现计划：`docs/superpowers/plans/`（最新 `2026-10-24-camp-step1.md`）；美术需求：`docs/art/camp-art-pack.md`（给 Codex 的出图工单：营地整图、装饰原地重绘、12 只宠物各 4 张、食物和界面图标；白模和参考图在 `art/guide/`）
- 上手与排错：`README.md`

## 开发约定

- `npm test`（node:test，零依赖）必须全绿再推；改动 JS 后也跑一遍 `node --check`
- `cloudfunctions/api/lib/shared/` 与 `miniprogram/utils/shared/` 必须逐字节一致（有测试检查），改一边就复制到另一边
- 云函数响应统一 `{ ok, data }` / `{ ok: false, code, message }`，message 直接展示给用户，用中文
- services 通过依赖注入拿 repo / chat / forest，测试用 `test/helpers/fake-repo.js`；端到端用 `test/helpers/fake-cloud.js` 加载真实 `index.js`；页面用 `test/helpers/page-harness.js` 跑
- 页面面向长辈：字号偏大、文案口语化
- 图片：美术原图在 `art/raw/`；`scripts/camp/blockout.py` 按 `shared/camp.js` 的 `SCENE` 画营地白模（只是布局示意图，`art/guide/`）；`scripts/camp/placeholders.py` 画宠物 / 装饰 / 食物的占位图；`scripts/slice-art.py` 切界面图标和表情；`scripts/draw-images.py` 画 tab 图标。主包上限 2MB（现在约 1.5MB，`test/assets.test.js` 会查；大图一律走云存储）
- 画面融合（动的东西和画怎么长在一起）的规矩写在设计文档「画面融合」一节：抠图是从画上抠的精确轮廓、按脚下 y 排前后（帐篷按前沿切条、走路跨线才切换）、夜里按画上的光给精灵上色（`utils/camp-light.js`）、动效只从画上取、锅是空的火不烧（`fire_off.py` 从画上熄的火）；镜头：整个世界 = 营地画 + 上下补的天空 / 草地（`SCENE.frame`），movable-view 就是整个世界、不留白，1 倍是默认视角、捏小到全景（`minScale`）、捏大到 `maxScale`，任何时候都盖满屏幕；缩放和平移别在同一次 setData 里改。改了营地页的画面就 `node scripts/preview/record-camp.js` 录屏逐帧看（输出 `.preview/camp/`，要 Playwright 和 ffmpeg，云端环境自带）

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
| 营地整图 `art/raw/camp/camp-hd.png` | `python3 scripts/camp/cut_art.py art/raw/camp/camp-hd.png`，再 `python3 scripts/camp/extend_art.py`（画的上下补天空和草地的 `u*` / `d*` 块，和包里垫的整个世界 `images/camp/base/world.jpg`；Codex 画了 `out-sky.png` 就用它的天空），然后 `npm run wx:art`，把打印的 fileID 前缀填进 `miniprogram/config.js` 的 `campArt`（高清：`detail_crops.py` → Codex 逐块重绘 → `merge_details.py`；夜景 `night-hd.png` 用 `cut_art.py … --prefix night-` 再切一套；Codex 每批的完整步骤在工单开头「执行流程」）。画换了还要重跑下面一行的全部，和 `python3 scripts/camp/light_map.py`（夜里的光） |
| 抠图层（帐篷 / 锅 / 木盖 / 提灯）、碗沿、篝火逐帧、熄火 | 先 `python3 scripts/camp/fire_off.py [--preview 目录]`（锅是空的时「熄了火」的两块补丁；打印的框填进 `SCENE.flame.off`；画换了先量 `LOGS`；Codex 画了 `out-fire-off.png` 就用它的），再 `python3 scripts/camp/cutouts.py --from-base --local [--check 目录]`（空锅 `pot-0` 和夜里的 `lid-off` 从熄了火的画上抠）（从画上抠精确轮廓，日夜一起出 WebP；画换了先量 `SEEDS`；锅里内容由 `pot_fill.py` 画，Codex 画了锅里三态就 `--crop` 后 `cutouts.py` 换掉）、`python3 scripts/camp/bowl_food.py`（碗沿 + 碗里的吃的 + 夜里熄火时的碗沿）、`python3 scripts/camp/fx_art.py`（篝火逐帧 + 热气图）、`python3 scripts/camp/light_map.py`（夜里的光，含熄火那套），把 `scripts/wechat.js` 的 `CUT_VERSION` 加一（同名覆盖 CDN 和手机会用旧图），`npm run wx:art -- cut`，前缀填进 `config.cutArt` |
| 装饰原地重绘 `art/raw/decor/out-*.png` | `python3 scripts/camp/decor_patch.py`（之前先用 `decor_crop.py` 裁空草地给 Codex），然后 `npm run wx:art`，前缀填进 `config.decorArt` |
| 动画拼图 `art/raw/anim/<id>-a.png`、`<id>-b.png` | `python3 scripts/pack_anim.py`，然后 `npm run wx:art`，前缀填进 `config.animArt` |
| 其他 Codex 出的图 `art/raw/**` | `python3 scripts/art/check_art.py` 自检（清单 `art/manifest.json`），界面图标 `python3 scripts/slice-art.py`，宠物图册插画和食物图标的切法见 `docs/art/camp-art-pack.md` |

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
- 2026-10-24（夜）：**宅院整个换成暖暖营地**（设计 `specs/2026-10-24-camp-pets-design.md`，计划 `plans/2026-10-24-camp-step1.md`，第一步「玩法先跑通」已完成）：`shared/camp.js`（3072×4096 竖画的草地多边形、禁区、篝火坐点、食盆、入口、树荫、远近缩放、亲密度等级、礼物时机）、`pets.js`（12 只）、`foods.js`（23 + 10 节气点心）、`decor.js`（24 件 + 金帐篷、自由摆放规则）；云函数 `services/camp.js`（`camp.get/spin/putFood/takeFood/feed/buy/place/move/stash/gift/album`，正餐打卡后 `arrive`）、`lib/camp-state.js`（旧档迁移：暖豆退回、住户按原型搬来、`camp: 1`）；小程序 `pages/camp`（首页）、`shop`、`album`，`utils/camp-view.js`、`camp-life.js`（自由走动 + 绕禁区、作息、点 / 连点 / 长按 / 拖食物、它们之间的小事、礼物、庆祝）、`anim.js`（两张 6×6）、`scene-fx.js`。宅院、格子、遮挡、院子、旧物件图、`scripts/estate` 全删（git 历史里有）。**现在是白模 + 占位图**：底图 `images/camp/base/`（`blockout.py`），宠物用旧动物图顶替、没有旧图的是圆团，装饰是草绿色块，食物是圆底两个字；`config.campArt / decorArt / animArt` 都是空。包 1.05MB。**下一步**：把 `docs/art/camp-art-pack.md` + `art/guide/camp-blockout.jpg` 交给 Codex 出第一批（营地整图 + 4 只常见宠物 + 8 件装饰 + 食物图标），回来按工单末尾的流程接入
- 2026-10-24（夜 2）：用户看了 Codex 初稿后把场景改简：**去掉小溪、水塘、木台，草坪里也不放树**（树林只在上缘当背景），开局只有篝火 + 大帐篷（篝火左上、门朝篝火、约占画宽 1/3）+ 两个食盆，三样挨得近、画得大。`SCENE.nogo` 只剩 tent / fire，`SCENE.tent.spots`（门口睡）和 `SCENE.sun`（向阳草地晒太阳）取代木台和水塘，`placeProblem` 没有「离水边远一点」了；白模、工单、README、设计文档同步改。再后来按 Pokémon Sleep 改成**比屏幕大一圈的 4096×4096 正方形草坪**（默认视角铺满高度、篝火在屏幕正中、一屏看一半宽），中心是篝火上的**暖暖锅**（正中偏前），帐篷几经调整最后定在草坪最左上角（默认视角看不到，拖过去才看到）；夜里 19～6 点整套换夜景底图和夜版抠图（文件名 `night-` 前缀，占位由 `blockout.py` 的夜调色板画，正式图是 Codex 以日景为底画的同构图夜景 + 4 块粗高清，`cutouts.py --night`），`tintFor` 只剩傍晚；帐篷和锅是从底图抠出来的独立一层（`SCENE.cutouts`，`camp-view.cutoutViews`，占位 `images/camp/cut/`，宠物按 y 排前后就能被挡住），锅按今天早午晚印章数换 `pot-0～3.png`（`potLevel`），两顿起冒热气；正式图走 `scripts/camp/cutouts.py`（Codex 出「去掉帐篷 / 去掉锅」两版比对出范围），`config.cutArt`。工具链全按 Codex 的 1024×1024 走：整图直接出正方形、`detail_crops.py` 正方形 16 块、`decor_crop.py` 正方形块；Codex 每批的开场指令在工单开头「执行流程」。**出图改成「画优先」**：第 1 批 A 只给 Codex 画风 + Pokémon Sleep 参考 + 几条硬要求（正方形、草坪空旷平整、锅居中、帐篷在后、食盆在火边、没水没树），出 4 版用户挑；选定后用 `scripts/camp/overlay.py <画>` 在画上打格子量出 `SCENE`（草地、帐篷脚、篝火、锅、食盆、抠图块、坐点）改进 `shared/camp.js`，重跑 `blockout.py` 核对，再让 Codex 做第 1 批 B（抠图、装饰、宠物、图标）。白模现在只是布局示意，不是底稿。**画风卡死**：手绘 2D 插画、不要 3D 渲染感（Codex 放开就往 3D 跑），每张图都把 `art/guide/style-camp.jpg`（之前出的那张营地图）当画风参考图传给它，UNIFIED STYLE 已照此改
- 2026-10-25：**Codex 第 1 批 A 接入**（分支 `codex/art-batch-1a`）：选定候选 03，`art/raw/camp/camp.png`（1024）、`camp-hd.png`（3641）、`night.png`、`night-hd.png`（1903）已拷进本分支；按画量了 `SCENE`（篝火石圈 (2130,2820) 椭圆 460×250、帐篷多边形在左上、木盖 `lid` 和提灯树桩 `lantern` 也是禁区、食盆 (2700,3080)/(2990,3180)、`BOWL_PX` 270、坐点马蹄形 820×520）；日景切 16 块（3072）、夜景 16 块（2048）已传云存储，`config.campArt` 已填；帐篷 / 锅 / 木盖 / 提灯的抠图层是 `cutouts.py --from-base` 按量好的轮廓从画上抠的**过渡版**（锅里 1～3 层是程序画的），日夜各 7 张已传，`config.cutArt` 已填；默认视角横向对准篝火、纵向对准画中心。装饰还是占位块（改成透明底色块），宠物还是旧图。`art/anim`（旧宅院拼图）已删，`camp/anim/` 云存储里传过一次旧图没用、`animArt` 仍为空。**下一步**：让 Codex 做第 1 批 B（工单「执行流程」：先 `git pull`，锅三态 + 8 件装饰 + 4 只宠物 + 图标；「去掉帐篷 / 锅」已不需要），回来后 `cutouts.py --crop` + `cutouts.py` 换锅里三态、`decor_patch.py`、`pack_anim.py`、`slice-art.py`
- 2026-10-25（三）：用户嫌篝火占屏幕太大、想双指捏小看全景又不要看到边。正方形的画铺满竖屏高度已经是不露边能缩到的最小了，所以**画的上下各补 2048**（`SCENE.frame`，`scripts/camp/extend_art.py`）：下面的草地从画上的草一块块拼（Efros-Freeman 拼块 + 最小误差接缝，日夜同一套块；只取夜里也匀的地方，帐篷灯、篝火照到的草不取），画最下面 160 像素生成时发虚，草地从那儿就盖上去；上面的天空从画顶一行往上接渐变、被切掉的云长出圆顶、高处几朵云（夜里是星星）。出 `u*` / `d*` 各 16 块（日夜）和包里垫的整个世界 `world.jpg`（换掉以前只垫营地画的 `backdrop.jpg`，`cut_art.py` 不再出垫图）。`campLayout`：1 倍是默认视角（营地画高度 = 屏幕高度 × 0.72，锅比以前小，`HOME_ZOOM`），`minScale` 是全景（整幅宽度放进屏幕，约 0.71），`maxScale` 约 2.78（和以前最大一样细）；`focusOffset` 按整个世界算（营地画往下挪 `L.top`）；上下的块画在 `#world` 后面（盖得住画最下面那段），傍晚的橙色盖住整个世界。工单加了第 1e 节：可以让 Codex 把天空重画得更像（`extend_art.py --crop`）。小动物也跟着比以前小了一圈（和画一起缩的），捏大能看清
- 2026-10-25（二）：用户确认动画没问题。两处改动：① **镜头**：以前 movable-view 四周留白（`MARGIN_RATIO` 0.6）、能缩到 0.8，进来像一张带米色边的小图。现在 `campLayout` 按「1 倍时正方形的画正好盖满屏幕」算 k（竖屏 = 铺满高度），movable-view 就是画本身、不留白，`scale-min` 1 / `scale-max` 2、`out-of-bounds` false，怎么拖怎么捏都看不到边；默认视角 1 倍、篝火横着在正中。查清了 movable-view 的 x / y 是**缩放后**画的左上角（以前按中心缩放算，放大后位置就偏了），`focusOffset` 改过来并推到边上就拉回；同一次 setData 改 scale-value 又改 x / y 会吞掉一个，所以「回到篝火」「找它」放大过先缩回 1 倍、550ms 后再平移（`moveView`）；第一次进来 300ms 后再对准一次篝火。世界里的气泡、表情、爱心字号按 1:1 重新定。预览渲染器也改成同样的 x / y 含义。② **锅是空的火不烧**：今天还没打卡就没有火苗、火光、火星，盖一块「熄了火」的补丁（`scripts/camp/fire_off.py`：日景火苗换成柴堆里的暗处、按量好的 `LOGS` 补全被火苗挡住的木柴、去掉火光；夜景拟合日景 → 月光的颜色变换，把火照亮的那一大圈换成只有月光的样子，提灯那圈光留着），框在 `SCENE.flame.off`；空锅 `pot-0`、夜里的 `night-lid-off`、`night-bowl-N-off` 从熄了火的画上抠，`camp-light.js` 多一套 `_OFF` 光（夜里火没点时宠物、装饰、食物按它上色）。打了第一顿火就点上。抠图层传到 `camp/cut-v4/`（`config.cutArt` 已改）。工单加了第 1d 节：让 Codex 画正式的「没点火」版（日 / 夜），回来 `fire_off.py` 直接用。共用的 `camp.js` 改了（只加数据），云函数已重新部署
- 2026-10-25：**篝火重做**（用户嫌原来的火是 CSS 画的一团、盖在锅上、根本不像火）。原则写进 `utils/scene-fx.js` 开头：**不在画上用 CSS「画东西」**（火团、烟团、圆片蝴蝶都删了），只加光和很小的颗粒；有形状的东西用从画上取的帧或很淡的半透明图。现在：火苗是 `scripts/camp/fx_art.py` 从画上取锅底下、木柴之间的黄白色火苗像素做的 8 帧（亮度按往上流动的噪声一明一暗、边缘偶尔退成暗红炭色、被照亮的木柴跟着闪，木柴石头一点不动），拼成一条 JPG（`art/cut/fire.jpg`、`night-fire.jpg`，每帧四周带 `SCENE.flame.pad` 一圈原画防止相邻帧渗出细线，框坐标是 4 的倍数对齐底图像素格），压在锅下面一层 `steps(8)` 播；锅上面一圈不规则跳动的暖光（`fx-fireglow`，screen 混合，夜里大一圈）+ 白天 3 / 夜里 6 颗往上飘的火星；锅口的热气改成一缕很淡的细长白烟 `images/camp/fx/wisp.png`（两顿起一缕、三顿两缕，从锅口 `SCENE.cutouts.pot.rim` = 锅口深色那圈 (2048,2384) 180×67 冒）。锅的抠图轮廓改成沿锅底走（不把火苗抠进去），锅里的内容改由 `scripts/camp/pot_fill.py` 画在真正的锅口里（粥面随层数升高、远边一道接触阴影、第二顿起几片带明暗的胡萝卜和青菜、第三顿加枸杞和小泡），原来那个画在锅口上方的圆片 + 彩点删了。抠图层传到 `camp/cut-v2/`（`config.cutArt` 已改）。预览录屏脚本在 scratchpad（不进仓库）
- 2026-10-24（深夜）：**动画和画面融合**（用户反馈：宠物走到锅后面被锅的贴图盖住、动效违和）。根因是抠图层带着草（锅那张 25% 是草、提灯 45%），宠物走到后面被「假草」盖住；另外帐篷一个 zy 说不清斜着的前沿、走路一出发就按终点排前后、绕路不认木盖和提灯、夜里宠物是白天的颜色。改法（设计文档「画面融合」一节）：`cutouts.py --from-base` 按颜色 + 连通抠精确轮廓（草占比都是 0%），日景算一次夜景共用，WebP 和底图同分辨率，`cut-v3`；量准了提灯（原来偏右 80）、锅的左腿落地点、木盖轮廓、两个碗；帐篷禁区包住身后，帐篷切 128 宽的条按前沿排；走路跨线切段按中点排；可见性图最短路绕所有障碍（含装饰落脚框），修了线段正好穿过顶点漏判；停留点避开 `SCENE.hide`；夜里两层上色（`camp-light.js`，月光版 + 火边暖光），火光层盖在宠物上；包里垫一张低清整画（去掉白模切块，切块缝不再露线）；食盆里的吃的画在碗口里、碗沿从画上抠了盖上（`bowl_food.py`）；Codex 不用再画「去掉」版。新增 `scripts/preview/record-camp.js` 实时录屏。另找了一个独立代理审了一遍代码，按它的发现又修了：斜着走时跨线处离物件远、后半段挨上了也要切段（模拟测试改成沿路逐点检查前后，8 个种子 × 早中晚夜）；光和萤火虫层不挡点击（夜里点帐篷门口睡觉的宠物没反应）；摆放模式下装饰的月光层也变淡；在吊床、窝里的宠物盖在装饰上面；没暂停时 resume 不再打断正在走的；页面开着跨过 19 点 / 6 点会自己换整套日夜景。测试 241 个全绿，修了一个偶发失败的页面测试。云函数已部署（共用的 `camp.js` 改了）
- 2026-10-23：测试福利 `config.testGrant`（5000 暖豆，10/26 前打开花园的账号各送一次）给用户试修整角落和扭蛋。**上传体验版给妈妈之前把 `testGrant` 改成 `null` 并重新部署云函数**
- 2026-10-23：`api` 已由用户在开发者工具里创建、超时改为 60 秒；之后用 `npm run wx:function` 从云端更新成功；`npm run wx:preview` 生成预览二维码成功，已发给用户试用

## 首次部署清单（新会话从这里接）

1. `npm install`，`npm test` 全绿
2. `npm run wx:function` 部署 `api` 云函数；报 IP 白名单错误就请用户去后台关闭白名单
3. 请用户到「云开发控制台 → 云函数 → api → 函数配置」把超时改成 60 秒
4. `npm run wx:preview`，用 SendUserFile 把 `.wechat/preview-qrcode.jpg` 发给用户扫码，先试建档、记体重（不依赖 AI）
5. AI：请用户在「云开发控制台 → AI → 生文模型」打开 `hy3` 和 `hy-vision-2.0-instruct` 的「套餐抵扣」开关，然后试拍照打卡；失败就看云函数日志定位分组或模型问题
6. 都正常后先把 `cloudfunctions/api/config.js` 的 `testGrant` 改成 `null`、`npm run wx:function`，再 `npm run wx:upload -- 1.0.0 首个体验版`，请用户在「版本管理」选为体验版、在「成员管理」加妈妈为体验成员（营地的正式图没到之前先别给妈妈）
