# 暖暖营地 · 给 Codex 的出图工单

这份文件是给 **Codex（内置 image_gen）** 直接执行的工作清单：在仓库根目录打开 Codex，告诉它
「按 `docs/art/camp-art-pack.md` 把第 N 批图生成出来，放到指定路径，跑 `python3 scripts/art/check_art.py` 自检直到这批全部通过」。
生成完把 `art/raw/` 整个目录给回仓库（提交到分支或打 zip），剩下的切图、打包、上传由小程序这边的脚本完成。

设计背景见 `docs/superpowers/specs/2026-10-24-camp-pets-design.md`。一共三批，每批交完小程序就能上一版：

| 批 | 内容 |
|---|---|
| 1 | 营地整图（+ 高清 12 块）；豆豆、糯糯、莲莲、柿柿各 4 张；装饰 8 件（小帐篷、草窝、野餐垫、滚球、花坛、小树、风车、小灯笼）；食物图标；界面图标 |
| 2 | 花花、龟龟、杞杞、薯薯、橘团、笋宝、茶茶各 4 张；剩下 16 件装饰 |
| 3 | 鹤鹤 4 张；金色小帐篷；全家福 |

## 执行流程（照这个顺序喂 Codex）

**准备（一次）**：在仓库根目录打开 Codex，环境里要有 `python3`（`pip install pillow numpy`）和 `node`。每一批开一个新对话，把下面对应的开场指令整段粘进去。Codex 中途会停下来给你看图（营地整图、宠物定稿），你回「可以」或者写改意见，它再往下做。

**第 1 批 A：营地整图**（整段粘给 Codex）。这一步给 Codex 自由：不用白模做底图，只给画风、参考和几条硬要求，让它出几版好看的，你挑一张。选定后我照这张画量场景数据（草地范围、帐篷脚、篝火、锅、食盆、遮挡块），所以 **A 做完要停**，等我推送新的 `shared/camp.js` 再做 B。

```
你在仓库根目录，用你内置的图像生成能力做一张游戏主场景图。先读 docs/art/camp-art-pack.md 的第 0 节和第 1 节。
按第 1 节的 PROMPT 生成 1024×1024 的正方形，画风用第 0 节的 UNIFIED STYLE，构图参考 Pokémon Sleep 的营地。
硬要求只有几条（影响玩法）：正方形；约 45 度俯视、地面平；草坪占画面大部分、干净平整没有杂物；篝火上吊着的大陶锅在正中、
是主角；帐篷在锅正后方、门朝前；两个空食盆在火的右下；没有水面；草坪里没有树（树林只在上缘），没有小路。
其余随你发挥（帐篷样式、树林怎么框、火边的小道具、花、光线、天空），目标是好看、有「想住进去」的感觉。
出 4 版各不相同，存 art/raw/camp/candidates/01.png～04.png，每张跑 python3 scripts/art/check_art.py 看比例，
然后把 4 张发给我挑。我选定后你把那张复制成 art/raw/camp/camp.png，再做高清：
python3 scripts/camp/detail_crops.py art/raw/camp/camp.png，对 art/raw/camp/detail/in-*.png 的每一块用第 1 节
「高清第二轮」的提示词 image-to-image 重绘成同名 out-*.png（1024×1024，16 块），python3 scripts/camp/merge_details.py
得到 art/raw/camp/camp-hd.png。把 art/raw/camp/ 提交到新分支 codex/art-batch-1a 并推送，然后停下来等我。
```

**A 回来之后**：告诉 Claude「营地图在分支 codex/art-batch-1a」，Claude 用 `scripts/camp/overlay.py` 在画上量出 `SCENE`（草地、帐篷、篝火、锅、食盆、抠图块、坐点……），更新白模和占位图，推送后你 `git pull`，再给 Codex 第 1 批 B。

**第 1 批 B：其余**（整段粘给 Codex）：

```
你在仓库根目录，用你内置的图像生成 / 编辑能力，按 docs/art/camp-art-pack.md 做「第 1 批 B」。先把这个文件和
docs/superpowers/specs/2026-10-24-camp-pets-design.md 读一遍。规矩：每张提示词都带第 0 节的 UNIFIED STYLE（拼图再带
SHEET RULES / ANIMATION SHEET RULES）；输出路径和 art/manifest.json 里的一致；每出一张就跑
python3 scripts/art/check_art.py <那张的路径>，没过就重出或用 edit 修，过了再做下一张。顺序：
3. 帐篷和锅的抠图 + 锅的三种状态：python3 scripts/camp/cutouts.py --crop 裁出 art/raw/cut/in-tent.png、in-pot.png，
   按第 1b 节用 edit 画 out-tent-removed.png（把帐篷整个去掉）、out-pot-removed.png（把锅和三脚架去掉）、
   out-pot-1/2/3.png（锅里一层粥底 / 加了菜 / 满锅冒热气），每张只改该改的地方，其他像素不动。
4. 装饰 8 件：python3 scripts/camp/decor_crop.py --ids tent,strawbed,picnic,ball,flowerbed,sapling,windmill,lantern，
   对每个 art/raw/decor/in-<id>.png 用 edit 按第 2 节的模板把装饰画在草地上，存 art/raw/decor/out-<id>.png
   （1024×1024，装饰以外的像素不动）。
5. 宠物 doudou、nuonuo、lianlian、shishi：每只先按 3.1 出 art/raw/pets/<id>-ref.png，四张定稿一起发给我看；
   我说可以之后，每只再出 art/raw/anim/<id>-a.png、<id>-b.png（6×6，按 3.2）和 art/raw/pets/<id>-album.png（3.3），
   都以它自己的 -ref.png 为参考图，CHARACTER 用 3.4 表里那只的。
6. 食物图标 art/raw/ui/foods.png（第 4 节）、界面图标 art/raw/ui/camp-icons.png（第 5 节）。
7. 最后 python3 scripts/art/check_art.py 全跑一遍，把输出贴给我；把 art/raw/ 整个目录提交到新分支
   codex/art-batch-1 并推送（推不了就打成 art-batch-1.zip 给我）。
```

**第 1 批回来之后**：告诉 Claude「第 1 批图在分支 codex/art-batch-1」，Claude 按第 7 节接入、发预览二维码。第 2 批之前先 `git pull`，仓库里得有第 1 批的 `art/raw/camp/camp-hd.png`（装饰是从它上面裁草地）。

**第 2 批开场指令**：

```
你在仓库根目录，按 docs/art/camp-art-pack.md 做「第 2 批」，规矩和第 1 批一样（UNIFIED STYLE、路径按 art/manifest.json、
每张 check_art.py）。顺序：
1. 装饰剩下 16 件：python3 scripts/camp/decor_crop.py --ids hammock,treehouse,table,kettle,swing,ladder,slide,pumpkins,sunflower,lights,bunting,mailbox,stonelamp,fence,clothesline,scarecrow，
   每块按第 2 节模板 edit 成 art/raw/decor/out-<id>.png。
2. 宠物 huahua、guigui、qiqi、shushu、jutuan、sunbao、chacha：先 7 张 -ref.png 一起给我看，我说可以之后每只再出 -a、-b、-album。
3. python3 scripts/art/check_art.py 全跑，把输出贴给我，art/raw/ 提交到新分支 codex/art-batch-2 并推送。
```

**第 3 批开场指令**：

```
你在仓库根目录，按 docs/art/camp-art-pack.md 做「第 3 批」，规矩同前。顺序：
1. 鹤鹤 hehe：-ref.png 给我看，然后 -a（注意 A 张第 1 行是飞）、-b、-album。
2. 金色小帐篷：python3 scripts/camp/decor_crop.py --ids gold_tent，edit 成 art/raw/decor/out-gold_tent.png。
3. 全家福 art/raw/camp/family.png（第 6 节，1536×1024），以 12 张 -ref.png 为参考，每只都要认得出。
4. check_art.py 全跑，art/raw/ 提交到新分支 codex/art-batch-3 并推送。
```

## 0. 总则（每张都适用）

**风格**（所有提示词都带上这段）：

```
UNIFIED STYLE: premium cozy mobile-game look in the spirit of Pokémon Sleep: soft 3D-rendered cartoon,
round chunky shapes, matte clay-like material with gentle subsurface softness, warm cheerful pastel
colors, soft daylight from the upper left, gentle ambient occlusion, clean tidy edges, no hard black
outlines, no text, no labels, no watermark, no UI, no borders. Everything is cute, friendly and calm.
```

**参考图**（都在仓库里，生成时作为参考图 / edit 输入；工具不支持传参考图就先用视觉能力看一遍，把看到的外形特征写进提示词）：

| 文件 | 用途 |
|---|---|
| `art/guide/camp-blockout.jpg` | 营地布局示意（**不是底稿**，别拿它做 image-to-image）：看懂有哪些东西、大致在哪就行；画好以后代码按你的画重新量 |
| `art/guide/camp-blockout-labels.jpg` | 同一张示意图加了名字 |
| `art/guide/town/*.jpg` | 画风参考（小镇风格的柔和 3D 渲染）：营地、装饰都要这个味道 |
| `art/raw/pets/<id>-ref.png` | 每只宠物的造型定稿：画它的动画和插画时作为「同一只」的参考（先出定稿） |

**尺寸与格式**：
- 分辨率选工具支持的**最大**。image_gen 一般只有 1024×1024、1024×1536、1536×1024 三档：营地整图、锅、定稿、拼图、插画、图标都是 1:1，用 1024×1024；全家福 1536×1024。输出原图，不要自己缩放、不要截图
- 拼图和精灵图一律 **真透明 PNG**（alpha 通道），不要把棋盘格画进图里；实在做不到透明就用纯洋红 `#FF00FF` 平涂背景，物体里不能有洋红
- 营地整图、装饰的「原地重绘」是不透明的场景图，PNG 或高质量 JPG 都行

**拼图（sprite sheet）规则**（3×3 和 6×6 两种，都是等分格、不画格线）：

```
SHEET RULES: an invisible grid of equal cells, no visible grid lines. Exactly one isolated object per
occupied cell, filled in reading order (left to right, top to bottom); unused cells completely empty.
Each object centered in its cell with at least 8% of the cell size empty on every side; nothing touches
or crosses a cell border. Base of each object at the bottom center of its cell, no ground plane, no
cast shadow, no connected scenery. Keep silhouettes within the middle 80% of the cell.
```

**自检**：每出完一张就跑 `python3 scripts/art/check_art.py`（需要 Pillow 和 numpy），它会检查文件在不在、是不是透明、每格有没有东西、有没有贴边越格、比例对不对。没过的那张重新生成或用 edit 修，直到这批全部 ✓。清单在 `art/manifest.json`，输出路径必须一致，脚本按名字找。

---

## 1. 营地整图 `art/raw/camp/camp.png`（1:1 正方形）

这是整个游戏的舞台，值得多生成几版挑最好的。**不要用白模做底图**：白模只是告诉你有哪些东西、大致在哪；构图、细节、氛围以好看为准，画完代码照你的画来量。

**参考**：Pokémon Sleep 的营地（一片开阔的草地俯视，帐篷在后、卡比兽在中间、周围是树）。我们把中间换成「篝火上吊着的大陶锅」。

**硬要求（影响玩法，只有这几条）**：
- 正方形 1024×1024；约 45 度俯视，地面是平的，远近物体尺寸差别不大（草坪上到处要能放东西）
- 草坪占画面大部分，**干净、平整、均匀**：允许零星小花和草的质感，不要小路、石头、水面、落叶堆，不要在远离营地的地方放杂物（装饰是游戏里玩家自己摆的）
- 篝火 + 锅在正中，是整张画的主角：一圈石头围着小火，木头三脚架吊着一口圆滚滚的大陶锅，锅是空的，木盖靠在石头边
- 帐篷在锅的正后方（画面里在它上方），门朝前对着锅，可爱、结实
- 两个空的小食盆在火的右下方草地上
- 树林只在画面上缘当背景，草坪里没有树；没有文字、界面、人物
- 自由发挥：帐篷的样式和颜色、树林怎么框住画面、火边的小道具（一两根木头、提灯、小凳子）、花、光线、天空、远山

```
PROMPT: A finished main scene for a cozy mobile pet-camp game, square 1:1, in UNIFIED STYLE. Layout inspired by
the camp in Pokémon Sleep: a wide, open grassy clearing seen from above at about 45 degrees, filling most of the
image. At the very center a stone campfire ring with a small fire and a big round clay cooking pot hanging from a
wooden tripod (the pot is the hero of the scene: empty, its wooden lid leaning against the stones). Directly
behind the fire, higher in the image, a cute cozy camping tent facing the viewer with its door open toward the
fire. Two small empty food bowls on the grass at the lower right of the fire. A soft band of round forest trees
along the top edge, gentle hills and sky beyond. The meadow itself stays clean, flat and even with only tiny
flowers and grass texture, because the game pastes decorations onto it: no paths, no rocks, no water, no clutter
away from the campsite; a log or two and a lantern right beside the fire are welcome. Warm morning light, calm
and inviting, polished like a premium game key visual. No text, no UI, no characters.
```

出 4 版各不相同（`art/raw/camp/candidates/01.png`～`04.png`），由人挑一张复制成 `camp.png`。

**高清第二轮（必做）**：`python3 scripts/camp/detail_crops.py art/raw/camp/camp.png` 切 16 块（正方形，带重叠）放在 `art/raw/camp/detail/in-*.png`，每块用 image-to-image 重绘成同构图的高清版存成同名 `out-*.png`（1024×1024），提示词：

```
Redraw this crop of the camp scene at much higher detail in the same UNIFIED STYLE: identical
composition and colors, every object in the same place, crisper edges and richer material detail.
Do not add or remove anything. Same lighting.
```

然后 `python3 scripts/camp/merge_details.py` 拼成 `art/raw/camp/camp-hd.png`。

### 1b. 帐篷和锅的抠图、锅的三种状态 `art/raw/cut/out-*.png`

帐篷和锅在游戏里是从底图里抠出来单独的一层：宠物走到它们后面会被挡住。锅还是营地的中心：妈妈今天打了几顿正餐，锅里就有几层。做法是你把它们「去掉」一版，脚本比对就知道它们的范围。

1. `python3 scripts/camp/cutouts.py --crop` 从高清营地图裁出两块：`art/raw/cut/in-tent.png`（帐篷连周围）、`in-pot.png`（锅连篝火圈）。
2. 用 edit 画，**每张只改该改的地方，其他像素一概不动**，尺寸和 in 一样：
   - `out-tent-removed.png`：把帐篷整个去掉，那块补成草地和后面的树林，像从来没有帐篷
   - `out-pot-removed.png`：把锅和三脚架去掉，只留篝火石圈、火和草地
   - `out-pot-1.png`（早）：锅里一层米白的小米粥，刚没过锅底
   - `out-pot-2.png`（午）：粥上加了青菜叶、几块胡萝卜，大半锅
   - `out-pot-3.png`（晚）：满满一锅，表面冒着两三缕白色热气（热气画淡一点，游戏里还会叠动画）
3. `python3 scripts/camp/cutouts.py` 比对 in / out 得到帐篷和锅的范围，合成 `art/cut/tent.png`、`pot-0.png`（空锅）～`pot-3.png`。

```
PROMPT（去掉）: Edit this crop of the camp scene: remove the <tent / cooking pot and its tripod> completely and fill
that area with the same meadow grass (and forest) as around it, seamless, same lighting. Change nothing else.
PROMPT（锅里）: Edit this crop of the camp scene: fill the clay cooking pot with <一层米白的小米粥 / 粥上铺着青菜和胡萝卜块 /
满满一锅热腾腾的粥菜，表面几缕淡淡的白色热气>, same camera angle, same soft light. Change ONLY the inside of the pot
(and the faint steam right above it); the pot, tripod, fire, stones and grass must stay pixel-identical. UNIFIED STYLE.
```

---

## 2. 装饰（24 件 + 金色小帐篷，`art/raw/decor/out-<id>.png`）

装饰不是单独画的透明图，而是**在营地原图的一块草地上原地画出来**，这样它天然长在地上、影子和光线都对。流程：

1. 先跑 `python3 scripts/camp/decor_crop.py --ids <逗号隔开的 id>`（在仓库里直接跑，要有 `node` 和 Pillow），从高清营地图裁出每件装饰需要的一块空草地 `art/raw/decor/in-<id>.png`（正方形，装饰块连 25% 边都在里面；正方形是为了和 edit 的 1024×1024 输出对齐，不变形）。
2. 你用 image-to-image / edit，把装饰画在这块草地**正中偏下**（装饰的底边落在块高的 80% 左右），**块里其他像素一概不动**，存成 `out-<id>.png`（1024×1024）。
3. 小程序这边 `python3 scripts/camp/decor_patch.py` 比对 in / out，把装饰连一圈草地裁下来、边缘羽化。

每件的提示词模板：

```
Edit this crop of the camp meadow: paint ONE <装饰> standing on the grass at the lower center of the
image, in UNIFIED STYLE, same camera angle (about 45–50 degrees from above) and the same soft light from
the upper left as the surrounding grass. The object must sit convincingly ON the ground with a soft
contact shadow and a few blades of grass overlapping its base. Do not change anything else: the grass
texture, colors and lighting outside the object must stay pixel-identical. No text, no people.
```

| id | 名字（中文） | 画什么（英文填进 `<装饰>`） | 块大小 |
|---|---|---|---|
| tent | 小帐篷 | a small pastel-green pup tent, clearly smaller and a different color than the big camp tent already in the scene, door flap tied open | 大 |
| hammock | 吊床 | a striped fabric hammock slung between two slim young trees | 大 |
| treehouse | 树洞小屋 | a tiny house built into a short hollow tree stump, round door, tiny windows | 大 |
| strawbed | 草窝 | a round nest bed of golden straw | 小 |
| picnic | 野餐垫 | a red-and-white checkered picnic blanket with a small basket and two cups | 中 |
| table | 小桌椅 | a small round wooden table with two little stools | 中 |
| kettle | 水壶炉 | a small camping stove with a copper kettle on it (no steam, the game adds steam) | 小 |
| swing | 秋千 | a wooden swing hanging from a sturdy wooden A-frame | 大 |
| ball | 滚球 | a big soft rubber ball, cream with a wide pastel blue band | 小 |
| ladder | 木梯 | a short wooden step ladder leaning slightly, with a flat top platform | 中 |
| slide | 小滑梯 | a small children's slide, pastel green with wooden steps | 大 |
| flowerbed | 花坛 | a round flower bed edged with small stones, full of pastel daisies and cosmos | 中 |
| pumpkins | 南瓜堆 | a pile of three plump orange pumpkins with a tiny one on top | 中 |
| sapling | 小树 | a young round tree with a bushy soft canopy and a slim trunk | 大 |
| sunflower | 向日葵 | three tall sunflowers of different heights | 小 |
| lights | 灯串 | a string of warm round festoon lights hung between two slim wooden poles (lights off in daylight, bulbs visible) | 大 |
| bunting | 彩旗 | a line of pastel triangular bunting flags strung between two short wooden poles | 中 |
| windmill | 风车 | a small wooden garden windmill with pastel sails | 小 |
| mailbox | 信箱 | a cute red mailbox on a wooden post, flag up | 小 |
| lantern | 小灯笼 | a small paper lantern on a short bamboo stick (unlit) | 小 |
| stonelamp | 石灯笼 | a small Japanese-style stone lantern with moss on top | 小 |
| fence | 木栅栏 | a short section of low wooden picket fence, three posts | 中 |
| clothesline | 晾衣绳 | a clothesline between two wooden poles with two tiny towels and a sock hanging | 中 |
| scarecrow | 稻草人 | a friendly scarecrow with a straw hat and a smiling face, arms out | 中 |
| gold_tent | 金色小帐篷 | the same camping tent but made of shimmering gold fabric with tiny star patterns (unlit) | 大 |

块大小（营地高清图按 3072 宽算）：小约 240×200、中约 360×300、大约 520×420，装饰要整个落在裁出来的块里，四周留出一圈草地。

---

## 3. 宠物（12 只 × 4 张）

每只四张，**顺序必须是**：造型定稿 → 看过没问题 → 动画 A、动画 B、图册插画。定稿没定就出动画，24 帧画完发现不像就白做了。

### 3.1 造型定稿 `art/raw/pets/<id>-ref.png`（1:1，透明底）

一张图里同一只宠物的三视图：左边正面、中间 3/4 侧面（脸朝右）、右边背面，底下对齐，再加一个记忆点的特写（比如豆豆头顶的豆芽）。提示词 = UNIFIED STYLE + 下面这只的 CHARACTER +

```
CHARACTER SHEET: the same character three times side by side on a transparent background — front view,
three-quarter side view facing right, back view — feet on one baseline, same scale, plus a small close-up
of its signature feature in a corner. Chibi proportions (big round head about 45% of the height, tiny
limbs), big glossy eyes, soft rounded body, Pokémon-like cuteness but an ORIGINAL design.
```

### 3.2 动画拼图 `art/raw/anim/<id>-a.png` 和 `<id>-b.png`（1:1，6 列 × 6 行 = 36 格，透明底）

一格一帧，游戏里按行循环播放（每行 6 帧是一个完整循环）。A 张：

| 行 | 内容 |
|---|---|
| 1 | **走路**（3/4 侧面，朝右）：一个完整步幅 6 帧，脚明显抬起落下，身体保持水平；兔子蹦、乌龟爬、鸭子鸡摇摆、猫狐狸鹿四条腿踱步、仙鹤是**飞** |
| 2 | **坐着待机**：坐着，6 帧轻微呼吸、眨眼、尾巴 / 耳朵动一动 |
| 3 | **睡姿 A**：蜷着睡，6 帧呼吸起伏 |
| 4 | **睡姿 B**：另一种睡姿（仰着 / 趴着 / 靠着什么），6 帧 |
| 5 | **吃东西**：低头吃、抬头嚼，6 帧 |
| 6 | **小动作**：伸懒腰 → 东张西望，6 帧 |

B 张：

| 行 | 内容 |
|---|---|
| 1 | **开心蹭你**：朝观众探身蹭一蹭、眼睛弯弯，6 帧 |
| 2 | **被戳打滚**：咯咯笑着打一个滚，6 帧（允许转一圈） |
| 3 | **被摸眯眼**：眯眼享受、头上冒小爱心（不画爱心，游戏加），6 帧 |
| 4 | **叼礼物走**：叼着 / 抱着一个小礼物盒走路，6 帧（礼物盒是唯一允许的道具） |
| 5 | **庆祝蹦**：原地开心地蹦，6 帧 |
| 6 | **专属动作**：见下表，6 帧 |

硬性要求（写进每张的提示词里）：

```
ANIMATION SHEET RULES: square image, an invisible grid of 6 columns x 6 rows of equal cells (36 frames).
The SAME character in every frame: same proportions, colors, face and scale; it must look exactly like
the attached character sheet. Same soft lighting from the upper left in every frame. Feet on the same
baseline in every frame (about 15% above the cell bottom), centered horizontally, at least 8% of the
cell empty on every side, nothing crosses a cell border. The character always faces RIGHT (the game
mirrors it for the other side). Each row is one looping action of 6 frames, rows in the given order.
No props unless stated, no ground, no shadow, no text, no frame numbers. Transparent background.
```

### 3.3 图册插画 `art/raw/pets/<id>-album.png`（1:1，透明底，1024 以上）

坐着的正面偏 3/4 姿势，看着观众，最可爱的一张，图册里当大头照。

### 3.4 每只的 CHARACTER 和专属动作

| id | 名字 | CHARACTER（外形，英文） | 走路 | B 张第 6 行 专属动作 |
|---|---|---|---|---|
| doudou | 豆豆 | a round fluffy yellow chick with a sprouting soybean on top of its head (a pale yellow bean with two tiny green leaves), tiny orange beak and feet, big shiny dark eyes, curious expression | waddle, short quick steps | shakes its head so the sprout wobbles and a glowing golden bean pops out and bounces |
| nuonuo | 糯糯 | a plump white rabbit whose long ears are soft, floppy and slightly translucent like strips of rice cake, pink inner ears, rosy cheeks, shy expression | hop cycle (crouch, push off, stretch, land, settle) | twists its two ears together into a braid and lets them spring apart |
| lianlian | 莲莲 | a round yellow duckling wearing a big green lotus leaf on its head like a hat/umbrella, flat orange bill, orange webbed feet, sleepy slow expression | waddle, body rocking side to side | takes the lotus leaf off and fans itself with it |
| shishi | 柿柿 | a small brown hedgehog whose back spines carry a cluster of tiny orange persimmons like fruit on branches, cream face, little black nose, busy expression | slow crawl, legs one at a time | curls up and rolls, persimmons tumble off, it uncurls and scoops them back |
| huahua | 花花 | a chubby calico kitten (white with orange and dark-grey patches) whose tail ends in a yellow chrysanthemum flower, big round eyes, pink nose, proud expression | quadruped walk, tail swaying | sits and waves its flower tail like a fan toward the viewer |
| guigui | 龟龟 | a small chubby green turtle whose shell is a tiny moss garden: velvety green moss, a pebble and one tiny mushroom growing on it; friendly half-closed eyes | slow crawl, head bobbing | pulls head and legs into the shell so only the moss garden is left, then peeks out |
| qiqi | 杞杞 | a small orange fox with a white chest and tail tip, wearing a necklace of twelve bright red goji berries, mischievous grin, one ear slightly bent | light quick quadruped trot | sneaks a goji berry off its necklace and flicks it away with a sly look |
| shushu | 薯薯 | a small brown squirrel with a huge bushy tail and enormous round cheeks the color and shape of two sweet potatoes, tiny paws, greedy happy expression | hop-run with the tail bouncing | stuffs an imaginary snack into its cheeks, cheeks balloon, looks innocent |
| jutuan | 橘团 | a very fat orange cat shaped like a tangerine segment: round body with faint tangerine ridges, a green leaf-shaped tail, cream belly, lazy half-closed eyes | heavy slow quadruped walk, belly swaying | curls into a perfect tangerine ball and rolls one full turn, then flops |
| sunbao | 笋宝 | a chubby round giant panda wearing a bamboo-shoot hat (a pale green cone with brown scales), black eye patches, round black ears, dopey sweet expression | heavy quadruped walk on all fours | takes the bamboo-shoot hat off, nibbles two bites, puts it back on |
| chacha | 茶茶 | a small cream-colored deer with white spots, slim legs, and small antlers with pink-white camellia flowers blooming on them, gentle attentive eyes, long lashes | elegant stride, legs lifting high | lowers its head toward the viewer and the camellias on its antlers open from buds to full bloom |
| hehe | 鹤鹤 | an elegant white crane with black wing tips, long legs, and a bright red hawthorn berry on its crown instead of the red patch, aloof calm expression | row 1 is FLYING: slow wing beats in the air, legs trailing (6 frames) | stands on one leg, eyes slowly close, dozes, sways slightly |

参考 `art/raw/pets/<id>-ref.png`（同一只）；A 张和 B 张分开出，每张都要带 CHARACTER。

---

## 4. 食物图标 `art/raw/ui/foods.png`（1:1，6×6，前 33 格）

每格一样食物，chibi 风格的小图标（像游戏道具），顺序按 `shared/foods.js`：

| 格 | 食物 |
|---|---|
| 1–8 | 小米（一小碗黄色小米）、玉米粒（一撮金黄的玉米粒）、胡萝卜（带绿叶）、年糕（白色软糯的一块）、莲子（几颗米白的莲子）、小鱼（一条可爱的小银鱼）、柿子（橙红色带叶）、苹果（红苹果） |
| 9–16 | 小鱼干（几条）、菊花茶（一杯泡着菊花的茶）、西瓜（一牙三角瓜）、草莓（两颗）、烤红薯（掰开冒热气的）、葡萄（紫色一小串）、核桃（两颗，一颗开壳）、红薯（一整个） |
| 17–22 | 橘子（一个带叶）、牛奶（一瓶）、竹笋（一根剥开一半）、竹叶（一枝）、茶叶（一撮绿茶叶）、桂花糕（方方一块，撒桂花） |
| 23 | 山楂（三颗红红的，带一片叶）|
| 24–33 | 节气点心：柿饼（挂霜）、烤栗子（开口）、糖葫芦（一串）、饺子（三个）、腊八粥（一碗）、春卷（两根）、青团（两个）、青梅（三颗）、粽子（一个剥开一角）、月饼（一块切开露馅）|
| 34–36 | 留空 |

```
PROMPT: UNIFIED STYLE + SHEET RULES, a 6x6 grid of cute chibi food icons for a cozy game, each a
small appetizing object on a transparent background, slightly from above, soft highlights. Cells 1–33
in this order: … Cells 34–36 empty.
```

---

## 5. 界面图标 `art/raw/ui/camp-icons.png`（1:1，3×3，9 格）

顺序：食盆（木碗，空的）、篝火（小小的篝火图标）、图册封面（一本厚厚的画册，封面有一只小宠物的剪影）、商店（一个小木摊）、背包（帆布小背包）、礼物盒（系着蝴蝶结）、爪印、相机（圆润的小相机）、回家（小帐篷图标）。透明底，每格一个，风格和现有的 `miniprogram/images/garden/ui/*.png` 一致（圆润、暖色、可爱）。

---

## 6. 全家福 `art/raw/camp/family.png`（第 3 批，3:2）

12 只宠物围着篝火坐成一圈，傍晚暖光，看向观众，每只都能认出来（参考 12 张定稿），营地背景和第 1 张一致。图册全收集后当封面。

---

## 7. 交付之后小程序这边做什么（你不用管，写给我自己看）

- 营地：`cut_art.py art/raw/camp/camp-hd.png` 切 16 块 → `npm run wx:art` 传云存储 → `config.campArt`
- 装饰：`decor_crop.py` 先出 in → Codex 出 out → `decor_patch.py` → `npm run wx:art` → `config.decorArt`
- 宠物：`pack_anim.py` 打包两张 6×6 → `npm run wx:art` → `config.animArt`；图册插画缩成 320px 放 `images/camp/pets/<id>.png`，头像 96px 放 `<id>-face.png`（替换占位）
- 食物、界面：`slice-art.py` 加两条 SHEETS（`ui/foods.png` → `images/camp/foods/`，`ui/camp-icons.png` → `images/garden/ui/`）切成单张
- 每批接完 `npm test`、截图核对、`npm run wx:preview`
