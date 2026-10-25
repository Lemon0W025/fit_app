# 暖暖营地 · 给 Codex 的出图工单

这份文件是给 **Codex（内置 image_gen）** 直接执行的工作清单：在仓库根目录打开 Codex，告诉它
「按 `docs/art/camp-art-pack.md` 把第 N 批图生成出来，放到指定路径，跑 `python3 scripts/art/check_art.py` 自检直到这批全部通过」。
生成完把 `art/raw/` 整个目录给回仓库（提交到分支或打 zip），剩下的切图、打包、上传由小程序这边的脚本完成。

设计背景见 `docs/superpowers/specs/2026-10-24-camp-pets-design.md`。第 1 批已经做完接进来了，剩下的（原来的第 2、3 批加一张返工）合成一次做完：

| 批 | 内容 |
|---|---|
| 1 | A（已完成）：营地整图日 / 夜 + 高清。B（已完成，10/25 接入）：锅里三种状态（日 / 夜）、没点火的火堆（日 / 夜）、营地上面的天空；装饰 8 件（小帐篷、草窝、野餐垫、滚球、花坛、小树、风车、小灯笼）；豆豆、糯糯、莲莲、柿柿各 4 张；食物图标；界面图标 |
| 2（剩下的全部） | 返工：小帐篷（第 1 批画成了浅绿，和草混在一起，要天蓝）。新图 50 张：花花、龟龟、杞杞、薯薯、橘团、笋宝、茶茶、鹤鹤各 4 张；剩下 16 件装饰 + 金色小帐篷；全家福 |

## 执行流程（照这个顺序喂 Codex）

**准备（一次）**：在仓库根目录打开 Codex，环境里要有 `python3`（`pip install pillow numpy`）和 `node`。每一批开一个新对话，把下面对应的开场指令整段粘进去。Codex 中途会停下来给你看图（营地整图、宠物定稿），你回「可以」或者写改意见，它再往下做。

**第 1 批 A：营地整图**（整段粘给 Codex）。这一步给 Codex 自由：不用白模做底图，只给画风、参考和几条硬要求，让它出几版好看的，你挑一张。选定后我照这张画量场景数据（草地范围、帐篷脚、篝火、锅、食盆、遮挡块），所以 **A 做完要停**，等我推送新的 `shared/camp.js` 再做 B。

```
你在仓库根目录，用你内置的图像生成能力做一张游戏主场景图。先读 docs/art/camp-art-pack.md 的第 0 节和第 1 节。
按第 1 节的 PROMPT 生成 1024×1024 的正方形。画风卡死：把 art/guide/style-camp.jpg 作为参考图传进去，提示词带第 0 节的
UNIFIED STYLE，要手绘 2D 插画的感觉，不要 3D 渲染（塑料质感、强高光、景深都不要），出来有 3D 感就重出；参考图只参考画风，
构图不照它。构图参考 Pokémon Sleep 的营地。
硬要求只有几条（影响玩法）：正方形；约 45 度俯视、地面平；草坪占画面大部分、干净平整没有杂物；篝火上吊着的大陶锅在正中偏前一点、
是主角；帐篷在草坪的最左上角（远离锅、门朝篝火）；两个空食盆在火的右下；没有水面；草坪里没有树（树林只在上缘），没有小路。
其余随你发挥（帐篷样式、树林怎么框、火边的小道具、花、光线、天空），目标是好看、有「想住进去」的感觉。
出 4 版各不相同，存 art/raw/camp/candidates/01.png～04.png，每张跑 python3 scripts/art/check_art.py 看比例，
然后把 4 张发给我挑。我选定后你把那张复制成 art/raw/camp/camp.png，再做高清：
python3 scripts/camp/detail_crops.py art/raw/camp/camp.png，对 art/raw/camp/detail/in-*.png 的每一块用第 1 节
「高清第二轮」的提示词 image-to-image 重绘成同名 out-*.png（1024×1024，16 块），python3 scripts/camp/merge_details.py
得到 art/raw/camp/camp-hd.png。
再出夜景：以 camp.png 为底 image-to-image 按第 1c 节画同构图的夜景 art/raw/camp/night.png（所有东西位置不变），
python3 scripts/camp/detail_crops.py art/raw/camp/night.png --cols 2 --dir night-detail，4 块各重绘成 out-*.png，
python3 scripts/camp/merge_details.py --dir night-detail --out art/raw/camp/night-hd.png。
把 art/raw/camp/ 提交到新分支 codex/art-batch-1a 并推送，然后停下来等我。
```

**A 回来之后**：告诉 Claude「营地图在分支 codex/art-batch-1a」，Claude 用 `scripts/camp/overlay.py` 在画上量出 `SCENE`（草地、帐篷、篝火、锅、食盆、抠图块、坐点……），更新白模和占位图，推送后你 `git pull`，再给 Codex 第 1 批 B。

**第 1 批 B：其余**：**已完成**（分支 `codex/art-batch-1`，10/25 接入）。锅里三态、没点火、天空、8 件装饰、4 只宠物、食物和界面图标都用上了。下面这整段只在要重做时用。

重做第 1 批 B 用的整段（一共 34 张，另有 2 张可选；第 1 步出完 4 只宠物的定稿就停下来给你看，之后一口气做完）：

```
你在仓库根目录，用你内置的图像生成 / 编辑能力，按 docs/art/camp-art-pack.md 做「第 1 批 B」。
先切到最新代码：git checkout claude/mini-program-dev-nzn2n0 && git pull（脚本和场景数据都在这个分支上），
再把这个文件和 docs/superpowers/specs/2026-10-24-camp-pets-design.md 读一遍。
只往 art/raw/ 里加图，别改代码和脚本。规矩：每张提示词都带第 0 节的 UNIFIED STYLE（拼图再带 SHEET RULES /
ANIMATION SHEET RULES），把 art/guide/style-camp.jpg 当画风参考图；输出路径和 art/manifest.json 里的一致；每出一张就跑
python3 scripts/art/check_art.py <那张的路径>，没过就重出或用 edit 修，过了再做下一张。
宠物和装饰在手机上显示得很小（宠物默认只有约 30 像素宽），第 2 节和 3.1 的「屏幕上很小」那几条每张都要照做。顺序：
1. 宠物 doudou、nuonuo、lianlian、shishi 的定稿：每只按 3.1 出 art/raw/pets/<id>-ref.png，四张一起发给我看，停下来等我。
2. 我说可以之后，每只再出 art/raw/anim/<id>-a.png、<id>-b.png（6×6，按 3.2）和 art/raw/pets/<id>-album.png（3.3），
   都以它自己的 -ref.png 为参考图，CHARACTER 用 3.4 表里那只的。
3. 锅的三种状态：python3 scripts/camp/cutouts.py --crop 裁出 art/raw/cut/in-pot.png，按第 1b 节用 edit 画
   out-pot-1/2/3.png（锅里一层粥底 / 加了菜 / 满锅冒热气），只改锅口里面（和锅口上方一点热气），其他像素不动。
   夜景同样来一遍：python3 scripts/camp/cutouts.py --crop --night 裁出 in-night-pot.png，画 out-night-pot-1/2/3.png。
4. 装饰 8 件：python3 scripts/camp/decor_crop.py --ids tent,strawbed,picnic,ball,flowerbed,sapling,windmill,lantern，
   对每个 art/raw/decor/in-<id>.png 用 edit 按第 2 节的模板把装饰画在草地上，存 art/raw/decor/out-<id>.png
   （1024×1024，装饰以外的像素不动）。
5. 没点火的火堆：python3 scripts/camp/fire_off.py --crop 裁出 art/raw/cut/in-fire-off.png（日景火堆那块）和
   in-night-fire-off.png（夜景被火照亮的那一大圈），都是正方形；按第 1d 节用 edit 画 out-fire-off.png、
   out-night-fire-off.png（1024×1024）。
6. 食物图标 art/raw/ui/foods.png（第 4 节）、界面图标 art/raw/ui/camp-icons.png（第 5 节）。
7. （可选，前面都做完再做）营地上面的天空：python3 scripts/camp/extend_art.py --crop 裁出 art/raw/camp/in-sky.png、
   in-night-sky.png，按第 1e 节用 edit 只重画上半张的天空，存 art/raw/camp/out-sky.png、out-night-sky.png（1024 见方）。
8. 最后 python3 scripts/art/check_art.py 全跑一遍，把输出贴给我（第 2、3 批的图和没做的可选天空显示「还没有」是对的）；
   把 art/raw/ 整个目录提交到新分支 codex/art-batch-1 并推送（推不了就打成 art-batch-1.zip 给我）；
   推完切回 claude/mini-program-dev-nzn2n0（git checkout claude/mini-program-dev-nzn2n0），别把仓库留在新分支上。
```

**第 1 批回来之后**：告诉 Claude「第 1 批图在分支 codex/art-batch-1」，Claude 按第 7 节接入、发预览二维码。第 1 批的图接进来后都在 `claude/mini-program-dev-nzn2n0` 分支上，剩下的照样先切到这个分支 `git pull` 再做。

**剩下的全部：开场指令**（整段粘给 Codex。第 1 步出完 8 只宠物的定稿会停下来给你看，你回「可以」或写改意见，之后一口气做完）：

```
你在仓库根目录，用你内置的图像生成 / 编辑能力，按 docs/art/camp-art-pack.md 把剩下的图做完（返工 1 张 + 新图 50 张）。
先切到最新代码：git checkout claude/mini-program-dev-nzn2n0 && git pull，再把这个文件的第 0、2、3、6 节读一遍
（尤其「屏幕上很小」那几条）。只往 art/raw/ 里加图，别改代码和脚本。规矩和第 1 批一样：每张提示词都带第 0 节的
UNIFIED STYLE（拼图再带 SHEET RULES / ANIMATION SHEET RULES），把 art/guide/style-camp.jpg 当画风参考图；
输出路径和 art/manifest.json 一致；每出一张就跑 python3 scripts/art/check_art.py <那张的路径>，没过就重出或用 edit 修。
画风要和第 1 批已经接进来的一致：art/raw/pets/doudou-ref.png、nuonuo-ref.png、lianlian-ref.png、shishi-ref.png
和 art/raw/decor/out-*.png 那 8 件装饰也一起当参考图。顺序：
1. 宠物定稿 8 张：huahua、guigui、qiqi、shushu、jutuan、sunbao、chacha、hehe，每只按 3.1 出 art/raw/pets/<id>-ref.png，
   CHARACTER 用 3.4 表里那只的。12 只要光看剪影和颜色就分得开（3.4 表下面「分得开」那段，橘团、杞杞、花花最容易撞）。
   8 张一起发给我看，停下来等我。
2. 我说可以之后，每只再出 art/raw/anim/<id>-a.png、<id>-b.png（6×6，按 3.2）和 art/raw/pets/<id>-album.png（3.3），
   都以它自己的 -ref.png 为参考图。鹤鹤 A 张第 1 行是飞。
3. 返工小帐篷：上一批的 art/raw/decor/out-tent.png 画成了浅绿色，在草地上看不出来。用现有的 art/raw/decor/in-tent.png
   （别重新裁），按第 2 节模板和表里 tent 那行再 edit 一次：天蓝色帐篷布、奶白门帘，覆盖 out-tent.png。
4. 装饰 17 件：python3 scripts/camp/decor_crop.py --ids hammock,treehouse,table,kettle,swing,ladder,slide,pumpkins,sunflower,lights,bunting,mailbox,stonelamp,fence,clothesline,scarecrow,gold_tent
   （只裁这 17 件，第 1 批的不动），对每个 art/raw/decor/in-<id>.png 按第 2 节模板 edit 成 out-<id>.png（1024×1024）。
   上一批最容易错的两条：装饰宽度要占图宽的一半左右（小灯笼只画了四分之一宽）；颜色别和黄绿的草一样（小帐篷）。
   只画装饰本身、贴地的影子和压在底边的几根草，周围的草地一个像素都别动。
5. 全家福 art/raw/camp/family.png（第 6 节，1536×1024），以 12 张 -ref.png 为参考，每只都要认得出。
6. 最后 python3 scripts/art/check_art.py 全跑一遍（应该 90 / 90 通过），把输出贴给我；
   把 art/raw/ 整个目录提交到新分支 codex/art-batch-2 并推送（推不了就打成 art-batch-2.zip 给我）；
   推完 git checkout claude/mini-program-dev-nzn2n0 切回来，别把仓库留在新分支上。
中途断了（对话太长、出错）：新开对话粘同一段，先跑 python3 scripts/art/check_art.py，已经通过的别重做，从「还没有」的接着做。
```

**回来之后**：告诉 Claude「剩下的图在分支 codex/art-batch-2」，Claude 按第 7 节接入、发预览二维码。

---

## 0. 总则（每张都适用）

**风格**（所有提示词都带上这段）：

```
UNIFIED STYLE: hand-painted 2D game illustration, NOT a 3D render — the exact look of the attached style
reference (art/guide/style-camp.jpg): soft painterly cel shading with gentle gradients, rounded simplified
shapes, warm cheerful pastel colors, soft daylight from the upper left, only light ambient occlusion, clean
tidy edges, no hard black outlines. No glossy or plastic materials, no photoreal lighting, no depth of field,
no lens effects, no visible brush texture. No text, no labels, no watermark, no UI, no borders. Everything is
cute, friendly and calm.
```

**画风卡死、构图放开**：Codex 一放开就往 3D 渲染跑，所以每张图都要把 `art/guide/style-camp.jpg` 作为参考图传进去（它是之前出的一张营地图，画风就是我们要的：手绘感、软、不是 3D），提示词里写「画风照参考图，构图按文字」。出来的图只要有 3D 渲染感（塑料质感、强高光、景深）就重出。

**参考图**（都在仓库里，生成时作为参考图 / edit 输入；工具不支持传参考图就先用视觉能力看一遍，把看到的外形特征写进提示词）：

| 文件 | 用途 |
|---|---|
| `art/guide/camp-blockout.jpg` | 营地布局示意（**不是底稿**，别拿它做 image-to-image）：看懂有哪些东西、大致在哪就行；画好以后代码按你的画重新量 |
| `art/guide/camp-blockout-labels.jpg` | 同一张示意图加了名字 |
| `art/guide/style-camp.jpg` | **画风基准**（每张图都带上它当参考图）：手绘 2D 插画、软、暖，不是 3D 渲染。只参考画风，**不参考它的布局** |
| `art/raw/camp/camp.png` | 选定的营地画（第 1 批 A）：宠物、装饰都住在这张画里，颜色的饱和度、亮度和它对齐。用视觉能力看一眼就行，画宠物时**别**当参考图传（免得把草地画进透明图里） |
| `art/guide/town/*.jpg` | 更早的画风参考（偏 3D），只在 style-camp 不够用时看一眼 |
| `art/raw/pets/<id>-ref.png` | 每只宠物的造型定稿：画它的动画和插画时作为「同一只」的参考（先出定稿） |

**尺寸与格式**：
- 分辨率选工具支持的**最大**。image_gen 一般只有 1024×1024、1024×1536、1536×1024 三档：营地整图、定稿、拼图、插画、图标都是 1:1，用 1024×1024；全家福 1536×1024。输出原图，不要自己缩放、不要截图
- 用 edit 改的那几样（装饰、没点火的火堆、天空），输入 `in-*.png` 都是脚本裁好的**正方形**，输出 1024×1024 就行（脚本会缩放回去对齐）；锅那块不是正方形，出图和 in 一样大。构图一点都不能挪，挪了贴回画上就错位
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

> **第 1 批 A，已完成**（选了候选 03，日景 / 夜景和高清都已接入），本节和 1c 留着备查，不用再做。

这是整个游戏的舞台，值得多生成几版挑最好的。**不要用白模做底图**：白模只是告诉你有哪些东西、大致在哪；构图、细节、氛围以好看为准，画完代码照你的画来量。

**参考**：Pokémon Sleep 的营地（一片开阔的草地俯视，帐篷在后、卡比兽在中间、周围是树）。我们把中间换成「篝火上吊着的大陶锅」。

**硬要求（影响玩法，只有这几条）**：
- 正方形 1024×1024；约 45 度俯视，地面是平的，远近物体尺寸差别不大（草坪上到处要能放东西）
- 草坪占画面大部分，**干净、平整、均匀**：允许零星小花和草的质感，不要小路、石头、水面、落叶堆，不要在远离营地的地方放杂物（装饰是游戏里玩家自己摆的）
- 篝火 + 锅在正中**偏前一点**（稍微靠下），是整张画的主角：一圈石头围着小火，木头三脚架吊着一口圆滚滚的大陶锅，锅是空的，木盖靠在石头边
- 帐篷在草坪的**最左上角**，远离锅，门朝篝火方向，可爱、结实；默认视角里看不到它（拖过去才看到），所以画面中间只有锅是主角
- 两个空的小食盆在火的右下方草地上
- 树林只在画面上缘当背景，草坪里没有树；没有文字、界面、人物
- 自由发挥：帐篷的样式和颜色、树林怎么框住画面、火边的小道具（一两根木头、提灯、小凳子）、花、光线、天空、远山

```
PROMPT: A finished main scene for a cozy mobile pet-camp game, square 1:1, painted in UNIFIED STYLE exactly like
the attached style reference (same hand-painted 2D look, same softness and palette; do NOT copy its layout).
Layout inspired by
the camp in Pokémon Sleep: a wide, open grassy clearing seen from above at about 45 degrees, filling most of the
image. Slightly below the center a stone campfire ring with a small fire and a big round clay cooking pot hanging
from a wooden tripod (the pot is the hero of the scene: empty, its wooden lid leaning against the stones). Far
away in the upper-left corner of the meadow a cute cozy camping tent with its door open toward the fire. Two
small empty food bowls on the grass at the lower right of the fire. A soft band of round forest trees
along the top edge, gentle hills and sky beyond. The meadow itself stays clean, flat and even with only tiny
flowers and grass texture, because the game pastes decorations onto it: no paths, no rocks, no water, no clutter
away from the campsite; a log or two and a lantern right beside the fire are welcome. Warm morning light, calm
and inviting, polished like a premium game key visual. No text, no UI, no characters.
```

出 4 版各不相同（`art/raw/camp/candidates/01.png`～`04.png`），由人挑一张复制成 `camp.png`。

### 1c. 夜景整图 `art/raw/camp/night.png`（以 `camp.png` 为底的同构图）

夜里 19～6 点游戏整套换成夜景（底图 + 帐篷 / 锅的抠图），不是在白天图上盖一层蓝。以选定的 `camp.png` 做 image-to-image，**所有东西的位置、大小一点都不能变**，只改光：

```
PROMPT: Repaint this exact camp scene at night, keeping every object in exactly the same place and size: deep blue
night sky with a few stars and a soft moon glow, dark cool meadow, the campfire the only warm light source
casting a wide warm glow on the grass and the pot around it, a faint warm light inside the tent, forest dark
against the sky. Calm, cozy, inviting. UNIFIED STYLE. No text, no UI, no characters.
```

高清粗一点就够：`detail_crops.py --cols 2 --dir night-detail`（4 块）→ `merge_details.py --dir night-detail --out art/raw/camp/night-hd.png`。

**高清第二轮（必做）**：`python3 scripts/camp/detail_crops.py art/raw/camp/camp.png` 切 16 块（正方形，带重叠）放在 `art/raw/camp/detail/in-*.png`，每块用 image-to-image 重绘成同构图的高清版存成同名 `out-*.png`（1024×1024），提示词：

```
Redraw this crop of the camp scene at much higher detail in the same UNIFIED STYLE: identical
composition and colors, every object in the same place, crisper edges and richer material detail.
Do not add or remove anything. Same lighting.
```

然后 `python3 scripts/camp/merge_details.py` 拼成 `art/raw/camp/camp-hd.png`。

### 1b. 锅的三种状态 `art/raw/cut/out-pot-*.png`

帐篷、锅连三脚架、木盖、提灯在游戏里是从底图里抠出来单独的一层（宠物走到它们后面会被挡住）。这几层由脚本直接从画上抠精确轮廓
（`cutouts.py --from-base`，按颜色去掉草地、只留物件本身），**不需要你画「去掉」的版本**。只要锅里的内容：妈妈今天打了几顿正餐，锅里就有几层
（现在是脚本画的过渡版，你画的会更好看）。

1. `python3 scripts/camp/cutouts.py --crop` 从高清营地图裁出锅那块 `art/raw/cut/in-pot.png`（夜景加 `--night` → `in-night-pot.png`）。
2. 用 edit 画，**只改锅口里面（和锅口正上方一点点热气），其他像素一概不动**，尺寸和 in 一样：
   - `out-pot-1.png`（早）：锅里一层米白的小米粥，刚没过锅底
   - `out-pot-2.png`（午）：粥上加了青菜叶、几块胡萝卜，大半锅
   - `out-pot-3.png`（晚）：满满一锅，表面冒着两三缕白色热气（热气画淡一点，游戏里还会叠动画）
3. （小程序这边做，你不用跑）`python3 scripts/camp/cutouts.py` 用精确轮廓 ∪ 你画了内容的地方，合成 `pot-1`～`pot-3`。

```
PROMPT（锅里）: Edit this crop of the camp scene: fill the clay cooking pot with <一层米白的小米粥 / 粥上铺着青菜和胡萝卜块 /
满满一锅热腾腾的粥菜，表面几缕淡淡的白色热气>, same camera angle, same soft light. Change ONLY the inside of the pot
(and the faint steam right above it); the pot, tripod, fire, stones and grass must stay pixel-identical. UNIFIED STYLE.
```

### 1d. 没点火的火堆 `art/raw/cut/out-fire-off.png`、`out-night-fire-off.png`

妈妈今天还没打卡时锅是空的，火不烧。现在是脚本从画上把火「熄掉」的过渡版（`fire_off.py`：火苗换成柴堆里的暗处、夜里火照亮的那圈换成月光），
你画的会更自然。

1. `python3 scripts/camp/fire_off.py --crop` 裁出 `art/raw/cut/in-fire-off.png`（日景，锅底下的火堆和周围一圈）和 `in-night-fire-off.png`（夜景，火照亮的整片）。
   两块都是**正方形**（比要改的范围大一圈，外面那圈原样留着就行）。
2. 用 edit 画，输出 1024×1024，**构图一点不挪，物件的位置、形状一概不动**：
   - `out-fire-off.png`（白天）：火熄了——锅底下没有火苗，木柴还是那样搭着，柴缝里是暗的、底下一点灰白的灰；木柴、石头、锅底上那层橙黄的火光去掉，按白天的阳光画
   - `out-night-fire-off.png`（夜里）：火熄了——没有火苗，那一大圈暖黄的火光全部去掉，草地、石头、锅、三脚架、木盖、食盆都和远处一样只有冷冷的月光；**提灯还亮着**，只照亮它旁边一小圈
3. （小程序这边做，你不用跑）`python3 scripts/camp/fire_off.py` 直接用你画的，只取回框里那块，外圈自动羽化接回原画。

```
PROMPT（白天）: Edit this crop of the camp scene: the campfire under the clay pot is OUT — no flames, no glow. Keep the
logs exactly where they are, stacked cold, with dark gaps between them and a little grey ash at the bottom; remove the
orange firelight from the logs, stones and the pot's bottom, lit only by soft daylight. Everything else stays
pixel-identical. UNIFIED STYLE.
PROMPT（夜里）: Edit this crop of the night camp scene: the campfire is OUT — no flames and none of the warm yellow
firelight on the grass, stones, pot, tripod, lid and bowls; they are lit only by the same cool blue moonlight as the rest
of the night scene. The small lantern on the stump stays lit with its own small warm glow. Same objects, same positions.
UNIFIED STYLE.
```

### 1e. （可选）营地上面的天空 `art/raw/camp/out-sky.png`、`out-night-sky.png`

营地画的上下各补了一截（缩小看全景时竖着的手机屏也能铺满）：下面的草地是从画上的草一块块拼的，很自然；上面的天空是脚本画的
（渐变 + 几朵简单的云，被画顶切掉的云长了圆顶），你画的会更像这幅画。

1. `python3 scripts/camp/extend_art.py --crop` 裁出 `art/raw/camp/in-sky.png`（日景）、`in-night-sky.png`（夜景）：1024 见方，上半张是补的天空，下半张是营地画的上半截。
2. 用 edit **只重画上半张**（下半张的山、树林、帐篷一概不动），尺寸不变：
   - 白天：和画上一样的蓝天，越往上蓝得越深一点；几朵和画上一样的蓬松白云，画顶那几朵被切掉的云往上长完整
   - 夜里：深蓝的夜空，越往上越深；稀稀落落几颗画上那种四角小星；画顶那几朵淡淡的夜云往上长完整
3. （小程序这边做，你不用跑）`python3 scripts/camp/extend_art.py` 用你画的上半张当天空，紧挨着画顶那一小段自动接回画上。

```
PROMPT（白天）: Edit this image: repaint ONLY the upper half as open sky above the camp scene — the same soft blue as the
sky at the top of the painting, getting gently deeper toward the top, with a few fluffy white cumulus clouds in the
same painted style; the clouds cut off at the middle line continue upward naturally. The lower half (mountains, forest,
tent, grass) must stay pixel-identical. UNIFIED STYLE.
PROMPT（夜里）: Edit this image: repaint ONLY the upper half as the night sky above the camp — the same deep blue,
getting darker toward the top, a few small four-pointed stars like the ones in the painting, the faint night clouds
cut off at the middle line continue upward naturally. The lower half must stay pixel-identical. UNIFIED STYLE.
```

---

## 2. 装饰（24 件 + 金色小帐篷，`art/raw/decor/out-<id>.png`）

装饰不是单独画的透明图，而是**在营地原图的一块草地上原地画出来**，这样它天然长在地上、影子和光线都对。流程：

1. 先跑 `python3 scripts/camp/decor_crop.py --ids <逗号隔开的 id>`（在仓库里直接跑，要有 `node` 和 Pillow），从高清营地图裁出每件装饰需要的一块空草地 `art/raw/decor/in-<id>.png`（正方形，装饰块连 25% 边都在里面；正方形是为了和 edit 的 1024×1024 输出对齐，不变形）。
2. 你用 image-to-image / edit，把装饰画在这块草地**正中偏下**（装饰的底边落在块高的 80% 左右），**块里其他像素一概不动**，存成 `out-<id>.png`（1024×1024）。
3. 小程序这边 `python3 scripts/camp/decor_patch.py` 比对 in / out，只取你画了的地方：装饰本身留着，脚下顺手画的那圈草皮去掉、只留影子。所以**只画装饰、贴地的影子和压在底边的几根草**，别在周围重画一圈草地。

**屏幕上很小**：手机上默认看营地时，一件小装饰本身只有约 20 像素宽，大的也就 45 像素左右（宠物约 30）；双指捏小看全景还要再小三成。所以：
- 造型简单、轮廓清楚，大块面的颜色，别画细碎的小零件、细线、小字和花纹
- 和黄绿色的草地分得开：绿色的部分（叶子、帐篷布）用偏蓝或偏深的绿，或者边上留一圈浅色；别用和草一样的黄绿
- 大小：装饰的宽度约占 in 图宽的一半（正好是块宽的三分之二），底边落在图高的 75%～80%，别画得太小，也别顶到块外

每件的提示词模板：

```
Edit this crop of the camp meadow: paint ONE <装饰> standing on the grass at the lower center of the
image, in UNIFIED STYLE, same camera angle (about 45–50 degrees from above) and the same soft light from
the upper left as the surrounding grass. The object must sit convincingly ON the ground with a soft
contact shadow and a few blades of grass overlapping its base. It is shown small on a phone, so keep it
simple and bold: a clear silhouette, a few large color areas, no fine details, colors clearly separated
from the yellow-green grass, about half the image width. Do not change anything else: the grass
texture, colors and lighting outside the object must stay pixel-identical. No text, no people.
```

| id | 名字（中文） | 画什么（英文填进 `<装饰>`） | 块大小 |
|---|---|---|---|
| tent | 小帐篷 | a small sky-blue pup tent with a cream door flap tied open — clearly smaller than the big olive-green camp tent in the scene and NOT green | 大 |
| hammock | 吊床 | a coral-and-cream striped fabric hammock slung between two short wooden posts | 大 |
| treehouse | 树洞小屋 | a tiny house built into a short hollow tree stump, round door, tiny windows | 大 |
| strawbed | 草窝 | a round nest bed of golden straw | 小 |
| picnic | 野餐垫 | a red-and-white checkered picnic blanket with a small basket and two cups | 中 |
| table | 小桌椅 | a small round wooden table with two little stools | 中 |
| kettle | 水壶炉 | a small camping stove with a copper kettle on it (no steam, the game adds steam) | 小 |
| swing | 秋千 | a wooden swing hanging from a sturdy wooden A-frame | 大 |
| ball | 滚球 | a big soft rubber ball, cream with a wide pastel blue band | 小 |
| ladder | 木梯 | a short wooden step ladder leaning slightly, with a flat top platform | 中 |
| slide | 小滑梯 | a small children's slide, pastel coral pink with wooden steps — NOT green | 大 |
| flowerbed | 花坛 | a round flower bed edged with small stones, full of pastel daisies and cosmos | 中 |
| pumpkins | 南瓜堆 | a pile of three plump orange pumpkins with a tiny one on top | 中 |
| sapling | 小树 | a young round tree with a bushy soft canopy and a slim trunk, the same style as the round trees along the top of the camp painting but much smaller | 大 |
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

块大小（按 4096 见方的营地算，`decor_crop.py` 会自动换算到高清图上）：小 240×200、中 360×300、大 520×420。作参照，同一张画上锅连三脚架约 600 宽、食盆 270、宠物 230～380。装饰要整个落在裁出来的块里，四周留出一圈草地。

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
Designed to read when tiny on a phone screen: a simple bold silhouette, two or three large color areas,
an oversized signature feature in a contrasting color, no fine patterns or thin details, and body colors
clearly distinct from a yellow-green meadow.
```

**屏幕上很小**（这条最要紧）：手机上默认看营地时，一只宠物只有约 **30 像素宽**（指甲盖大），双指捏小看全景约 20 像素，放到最大也就 80 像素。所以：
- 轮廓简单饱满，光看剪影就能分清 12 只
- 身上 2～3 种主色、大块面；不要细碎的花纹、细线、小配件
- 记忆点（豆豆的豆芽、糯糯的长耳朵、莲莲的荷叶、柿柿背上的柿子……）画得**大**、颜色跳出来，30 像素时还认得出
- 眼睛大而亮，表情一眼看得出
- 和黄绿色的草地分得开：绿色的部分用偏蓝或偏深的绿，边上留一圈浅色；别整只都是绿的
- 画完把定稿缩到 64 像素宽看一眼，认不出是谁就改

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
The character is shown tiny on a phone, so every pose is clear and a little exaggerated (feet lifted high,
clear squash and stretch on hops and jumps, the head and signature feature moving visibly); the silhouette
changes from frame to frame enough to read as motion, while the size of the character stays the same.
```

动作幅度要比平常大一点：屏幕上只有指甲盖大，小动作看不出来。走路脚抬高（身体还是保持水平），蹦的时候有明显的压扁拉伸，记忆点（豆芽、耳朵、荷叶）跟着动；只是动作大，宠物本身的大小每帧一样。

为什么这样要求（和营地的画融在一起靠这几条）：游戏会按宠物站的位置给它加脚下的软影子、夜里按画上的光给它调亮暗和冷暖（火边暖、远处是月光的蓝白），
走到锅、帐篷、木盖后面会被正确挡住——所以宠物本身**不要画影子、不要画地面、不要画夜色或火光**，光一律左上方、亮度中等的白天光，颜色饱和度和营地的画差不多（别比画更艳）。

### 3.3 图册插画 `art/raw/pets/<id>-album.png`（1:1，透明底，1024 以上）

坐着的正面偏 3/4 姿势，看着观众，最可爱的一张，图册里当大头照。

### 3.4 每只的 CHARACTER 和专属动作

| id | 名字 | CHARACTER（外形，英文） | 走路 | B 张第 6 行 专属动作 |
|---|---|---|---|---|
| doudou | 豆豆 | a round fluffy yellow chick with a sprouting soybean on top of its head (a pale yellow bean with two tiny green leaves), tiny orange beak and feet, big shiny dark eyes, curious expression | waddle, short quick steps | shakes its head so the sprout wobbles and a glowing golden bean pops out and bounces |
| nuonuo | 糯糯 | a plump white rabbit whose long ears are soft, floppy and slightly translucent like strips of rice cake, pink inner ears, rosy cheeks, shy expression | hop cycle (crouch, push off, stretch, land, settle) | twists its two ears together into a braid and lets them spring apart |
| lianlian | 莲莲 | a round yellow duckling wearing a big blue-green lotus leaf with a pale rim on its head like a hat/umbrella (cooler than the grass so it stands out), flat orange bill, orange webbed feet, sleepy slow expression | waddle, body rocking side to side | takes the lotus leaf off and fans itself with it |
| shishi | 柿柿 | a small brown hedgehog whose back spines carry a cluster of tiny orange persimmons like fruit on branches, cream face, little black nose, busy expression | slow crawl, legs one at a time | curls up and rolls, persimmons tumble off, it uncurls and scoops them back |
| huahua | 花花 | a chubby calico kitten (white with orange and dark-grey patches) whose tail ends in a yellow chrysanthemum flower, big round eyes, pink nose, proud expression | quadruped walk, tail swaying | sits and waves its flower tail like a fan toward the viewer |
| guigui | 龟龟 | a small chubby turtle with warm tan skin whose shell is a tiny moss garden: velvety deep blue-green moss, a pale pebble and one tiny red-capped mushroom growing on it (not grass-colored, so it stands out on the meadow); friendly half-closed eyes | slow crawl, head bobbing | pulls head and legs into the shell so only the moss garden is left, then peeks out |
| qiqi | 杞杞 | a small orange fox with a white chest and tail tip, wearing a necklace of twelve bright red goji berries, mischievous grin, one ear slightly bent | light quick quadruped trot | sneaks a goji berry off its necklace and flicks it away with a sly look |
| shushu | 薯薯 | a small brown squirrel with a huge bushy tail and enormous round cheeks the color and shape of two sweet potatoes, tiny paws, greedy happy expression | hop-run with the tail bouncing | stuffs an imaginary snack into its cheeks, cheeks balloon, looks innocent |
| jutuan | 橘团 | a very fat orange cat shaped like a tangerine segment: round body with faint tangerine ridges, a green leaf-shaped tail, cream belly, lazy half-closed eyes | heavy slow quadruped walk, belly swaying | curls into a perfect tangerine ball and rolls one full turn, then flops |
| sunbao | 笋宝 | a chubby round giant panda wearing a bamboo-shoot hat (a pale green cone with brown scales), black eye patches, round black ears, dopey sweet expression | heavy quadruped walk on all fours | takes the bamboo-shoot hat off, nibbles two bites, puts it back on |
| chacha | 茶茶 | a small cream-colored deer with white spots, slim legs, and small antlers with pink-white camellia flowers blooming on them, gentle attentive eyes, long lashes | elegant stride, legs lifting high | lowers its head toward the viewer and the camellias on its antlers open from buds to full bloom |
| hehe | 鹤鹤 | an elegant white crane with black wing tips, long legs, and a bright red hawthorn berry on its crown instead of the red patch, aloof calm expression | row 1 is FLYING: slow wing beats in the air, legs trailing (6 frames) | stands on one leg, eyes slowly close, dozes, sways slightly |

参考 `art/raw/pets/<id>-ref.png`（同一只）；A 张和 B 张分开出，每张都要带 CHARACTER。

**分得开**：12 只在手机上只有 30 像素宽，光看剪影和颜色就要认得出。已经有的四只是黄色小鸡（豆豆）、白兔（糯糯）、顶荷叶的黄色小鸭（莲莲）、背柿子的棕色刺猬（柿柿）。橘团、杞杞、花花三只都带橘色，最容易撞：橘团是一整个圆滚滚的亮橘黄球、绿叶尾巴画大；杞杞瘦长、尖耳朵、大尾巴、偏红的橙色、白胸口、脖子上一串红枸杞；花花是白底三花（白色占一半以上），尾巴尖一朵黄菊花。龟龟、笋宝、茶茶别和草同色：龟壳上的苔藓用偏蓝的深绿，笋帽画大，茶茶的奶白身子和粉白山茶要跳出来。

---

## 4. 食物图标 `art/raw/ui/foods.png`（1:1，6×6，前 33 格）

每格一样食物，chibi 风格的小图标（像游戏道具），用在背包、扭蛋、图册里（放进食盆后，碗里那一小堆是脚本按食物的颜色画的，碗沿从画上抠，不用你画）。顺序按 `shared/foods.js`：

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

## 6. 全家福 `art/raw/camp/family.png`（最后做，3:2）

12 只宠物围着篝火坐成一圈，傍晚暖光，看向观众，每只都能认出来（参考 12 张定稿），营地背景和第 1 张一致。图册全收集后当封面。

---

## 7. 交付之后小程序这边做什么（你不用管，写给我自己看）

- 营地：`cut_art.py art/raw/camp/camp-hd.png` 切 16 块 → `extend_art.py`（上下补天空和草地的 16 块 + 包里垫的整个世界 `world.jpg`；Codex 画了 `out-sky.png` 就用它的天空）→ `npm run wx:art` 传云存储 → `config.campArt`
- 抠图层：画换了就 `cutouts.py --from-base --local`（精确轮廓，日夜一起出，`--check 目录` 存品红底的检查图；`SEEDS` 是物件身上的几个点，画换了要重量）→ `fx_art.py` 重出篝火逐帧 → `bowl_food.py` 重抠碗沿 → `light_map.py` 重算夜里的光 → `scripts/wechat.js` 的 `ART_VERSION.cut` 加一 → `npm run wx:art -- cut` → `config.cutArt`。Codex 画了锅里三态就 `cutouts.py --crop` 之后 `cutouts.py`（不带 `--from-base`，日夜各跑一次，夜里加 `--night`）只换 pot-1～3：锅身用精确轮廓，锅口往上的热气按「比原画白了多少」反推成半透明白烟（不连背后的草一起抠）
- 没点火：画换了或 Codex 画了 `out-fire-off.png` / `out-night-fire-off.png` 就 `fire_off.py`（出两块补丁，打印的框填进 `SCENE.flame.off`；Codex 的 in / out 是裁的时候的框外扩成的正方形，裁的框记在 `art/raw/cut/fire-off.json`，脚本只取回框里那块），再跑上一条的 `cutouts.py --from-base --local`、`bowl_food.py`、`light_map.py`（空锅、夜里的木盖和碗沿、熄火时的光都从熄了火的画上来）
- 底图：`extend_art.py` 把整个世界（含上下补的）缩成 768 宽写进包里（`images/camp/base/world.jpg`、`night-world.jpg`）当垫图
- 装饰：`decor_crop.py --ids …` 先出 in（`boxes.json` 合并着写，别的批裁过的框留着）→ Codex 出 out（它可能把 in 放大到 1024 再画，脚本按 in 实际的宽换算）→ `decor_patch.py --local` → `scripts/wechat.js` 的 `ART_VERSION.decor`（重新生成过就加一）→ `npm run wx:art -- decor` → `config.decorArt`。`decor_patch.py` 只取 Codex 画了的地方（它别处一个像素都没动），再把它在装饰脚下顺手画的那圈草皮去掉、只留比原来暗的影子（草皮 = 颜色在原来那块草地里、在装饰下半截、从外面连进来的；花坛里被石头围住的叶子不算），所以摆到哪儿都落在那儿的草上、夜里没有一圈白天的草；画得太小的放大到占块宽 55% 或块高 70%（`FILL`）。最后重写 `utils/decor-art.js`（有高清块的装饰），页面只对这些用云端的图，还没画的用包里的占位
- 宠物：`pack_anim.py` 打包两张 6×6（回写 `utils/anim-sheets.js`）→ `npm run wx:art -- anim` → `config.animArt`；`scripts/camp/pet_art.py` 把图册插画缩成 320px 放 `images/camp/pets/<id>.png`、头像 96px 放 `<id>-face.png`（替换占位）
- 食物、界面：`slice-art.py`（`ui/foods.png` 6×6 → `images/camp/foods/<id>.png` 128px；`ui/camp-icons.png` → `images/garden/ui/` 的 campfire / book / shop / bag / gift / paw / camera，食盆和回家暂时没用上）
- 每批接完 `npm test`、`node scripts/preview/record-camp.js` 录屏逐帧看（锅后面、木盖旁、提灯旁、帐篷门口、夜里的光）、`npm run wx:preview`
