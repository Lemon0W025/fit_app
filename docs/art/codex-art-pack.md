# 园林大宅院 · 给 Codex 的出图工单

这份文件是给 **Codex（内置 image_gen）** 直接执行的工作清单：在仓库根目录打开 Codex，告诉它
「按 `docs/art/codex-art-pack.md` 把所有图生成出来，放到指定路径，跑 `python3 scripts/art/check_art.py` 自检直到全部通过」。
生成完把 `art/raw/` 整个目录给回仓库（提交到分支或打 zip），剩下的切图、打包、上传由小程序这边的脚本完成。

一共 **18 张图**：1 张宅院整图、1 张云朵、2 张界面（图标 + 表情特效）、3 张新物件拼图、11 张小动物动画拼图。
第 1 张最重要，值得多生成几轮挑最好的；小动物每张都要过「同一只、同一比例、不越格」这三关。

## 0. 总则（每张都适用）

**风格**（所有提示词都带上这段，和游戏里已有的 68 件物件、11 只动物保持同一种画风）：

```
UNIFIED STYLE: premium cozy mobile-game look (Animal Crossing / Hay Day quality bar). Cute 3D cartoon
rendering, soft rounded chunky shapes, matte clay-like material with subtle texture, warm cheerful pastel
colors, soft sunlight from the upper left, gentle ambient occlusion, no hard cast shadows, crisp clean
edges, rich but tidy detail, cozy Chinese countryside garden theme (NOT Japanese: no torii, no kadomatsu).
No text, no labels, no watermark, no UI, no borders.
```

**参考图**（都在仓库里，生成时作为参考图 / edit 输入；工具不支持传参考图就先用视觉能力看一遍，把看到的外形特征写进提示词）：

| 文件 | 用途 |
|---|---|
| `art/guide/style-ref.jpg` | 画风参考：游戏里已有的物件和动物长什么样，所有图都要和它一个味道 |
| `art/guide/estate-blockout-3x2.jpg` | 宅院白模，已经补成 3:2：第 1 张图直接以它为底重绘，**布局一格都不能动** |
| `art/guide/estate-blockout-labels.jpg` | 同一张白模加了院子名字，只给你看懂布局用，不要作为生成输入 |
| `art/guide/animals-ref.png` | 11 只小动物现在的样子（小鸟、蝴蝶是 emoji 占位，按文字描述画） |
| `miniprogram/images/garden/items/<动物id>.png` | 每只动物的单张图，画动画拼图时作为「同一只」的参考 |

**尺寸与格式**：
- 分辨率选工具支持的**最大**（1:1 → 1536×1536，3:2 → 1536×1024；只能出 1024 也接受）。输出原图，不要自己缩放、不要截图
- 拼图和精灵图一律 **真透明 PNG**（alpha 通道），不要把棋盘格画进图里；实在做不到透明就用纯洋红 `#FF00FF` 平涂背景，物体里不能有洋红
- 宅院整图是不透明的场景图，PNG 或高质量 JPG 都行

**拼图（sprite sheet）规则**（3×3 和 6×4 两种，都是等分格、不画格线）：

```
SHEET RULES: an invisible grid of equal cells, no visible grid lines. Exactly one isolated object per
occupied cell, filled in reading order (left to right, top to bottom); unused cells completely empty.
Each object centered in its cell with at least 8% of the cell size empty on every side; nothing touches
or crosses a cell border. Base of each object at the bottom center of its cell, no ground plane, no
cast shadow, no connected scenery. Keep silhouettes within the middle 80% of the cell.
```

**自检**：每出完一张就跑 `python3 scripts/art/check_art.py`（需要 Pillow 和 numpy），它会检查文件在不在、是不是透明、每格有没有东西、有没有贴边越格。没过的那张重新生成或用 edit 修，直到全部 ✓。

**文件清单**（输出路径必须一致，脚本按名字找）：

| # | 文件 | 比例 / 格 | 内容 |
|---|---|---|---|
| 1 | `art/raw/estate/estate.png` | 3:2 | 宅院整图（见 §1） |
| 2 | `art/raw/estate/clouds.png` | 1:1，3×3 | 9 朵云（§2） |
| 3 | `art/raw/ui/icons.png` | 1:1，3×3 | 9 个界面图标（§3） |
| 4 | `art/raw/ui/fx.png` | 1:1，3×3 | 9 个表情 / 特效（§4） |
| 5 | `art/raw/09-水生与小摆件.png` | 1:1，3×3 | 9 件新物件（§5） |
| 6 | `art/raw/10-院子家具.png` | 1:1，3×3 | 9 件新物件（§5） |
| 7 | `art/raw/11-会飞的.png` | 1:1，3×3 | 小鸟、蝴蝶的单张图，只用前 2 格（§5） |
| 8–18 | `art/raw/anim/<动物id>.png` × 11 | 3:2，6×4 | 每只动物 24 帧动画（§6） |

---

## 1. 宅院整图 `art/raw/estate/estate.png`

- **输入**：以 `art/guide/estate-blockout-3x2.jpg` 为底图做 edit / 重绘（image-to-image，相似度调高），`art/guide/style-ref.jpg` 作画风参考
- **比例**：3:2 横图（白模已经是 3:2，上下的米色是留白，照样留着）
- **怎么挑**：先看布局——11 个院子、每一道月亮门、大门和影壁、正房、荷塘、四条菜畦、三条花坛的位置大小都要和白模对上，墙的高矮厚薄也要一样；再看漂不漂亮。**院子里面必须是空的**（只有地面），不要画树、花、桌椅、灯笼、动物、人——这些是玩家自己摆的。多生成几轮挑最好的一张

```
Reference image 1 is a plain blockout of a Chinese garden estate (the exact layout). Reference image 2
shows the art style of the game's props. Repaint reference image 1 as a finished, high-end mobile-game
main scene in the style of reference image 2.

KEEP THE LAYOUT EXACTLY: same isometric camera, same framing and scale, every wall segment, every round
moon gate, the red main gate, the main hall, every pool, flower bed, vegetable bed, paved area and
footpath stay at the same position and size. Do not add, move or remove any wall, gate or building.
Keep the walls the same height and thickness as in the blockout.

Content: a Suzhou-style classical Chinese garden estate seen from above. White plaster walls with dark
grey tiled copings divide it into 11 courtyards; between courtyards are round moon gates cut through the
walls. On the front wall, centered: a vermilion double-door main gate under a small tiled roof; just
inside it a free-standing screen wall. In the center courtyard a white-walled main hall with upturned
dark-tile eaves, sitting on a stone platform with a few steps in front. Ground in each courtyard exactly
as the blockout: fresh even lawn, dark loosened soil in the beds, pale flagstone paving, light stone
footpaths. Right-middle courtyard: a large clear pond with a wooden waterside deck on the side facing
the main hall. Top-right: a steaming rocky hot-spring pool and a small wooden changing hut. Top-left: a
little chicken coop ringed by a low wooden fence. Left-middle: a Taihu-rock rockery and a patch of
white sand. Back garden spanning two columns at the top: a Taihu rockery with a small waterfall into a
pool and a winding brook with one stone slab crossing it. Far right-middle: a wooden tea deck and a
red-pillared covered corridor along the outer wall. Bottom-left: a grape trellis against the wall.
Bottom-right: four vegetable beds and a stone well.

ALL COURTYARDS ARE EMPTY INSIDE: ground only. No trees, flowers, furniture, lanterns, animals or people
(the game places those). Outside the walls: soft beige ground fading into faint distant hills; the
estate fills the frame the way it does in the blockout.
+ UNIFIED STYLE
```

**第二轮（可选，出来效果好再做）**：整图只有 1536 宽，放大看会糊。小程序这边会用 `python3 scripts/estate/detail_crops.py art/raw/estate/estate.png --pad32`
把它切成 9 块带重叠的 3:2 小图放在 `art/raw/estate/detail/in-*.png`，每块用 edit 重绘成高清版存成同名的 `out-*.png`，提示词：

```
This is a crop of a finished game scene. Re-render this exact crop at full resolution: keep every
element at the same place with the same colors and lighting; only add fine detail and sharpness
(roof-tile texture, grass blades, stone grain, water ripples, soil crumbs). Do not add new objects,
do not change the framing or the crop boundaries.
```

然后 `python3 scripts/estate/merge_details.py` 拼回一张约 4000 宽的 `estate-hd.png`。

---

## 2. 云朵 `art/raw/estate/clouds.png`（盖在还没修整的院子上）

- 1:1，3×3，9 格全用；透明底；画风参考 `style-ref.jpg`

```
A sprite sheet of 9 cute cartoon clouds for a game, 3 x 3 grid. Nine fluffy white clouds, each a
different shape and size: flat and long, round and puffy, three or four lumps joined together, a tiny
wisp. Soft white with a faint blue-grey shading on the underside, no outline. Transparent background.
+ SHEET RULES + UNIFIED STYLE
```

---

## 3. 界面图标 `art/raw/ui/icons.png`

- 1:1，3×3，9 格全用；透明底；画风参考 `style-ref.jpg`；每个图标圆润、辨识度高、128px 下也看得清

```
A sprite sheet of 9 game UI icons, 3 x 3 grid, in reading order:
1. a Chinese wooden signpost: one wooden post holding a blank horizontal plank, no writing;
2. a woven bamboo basket with a lid (the player's bag);
3. a tear-off desk calendar with a red top band, the page blank;
4. a tiny white-walled house with a dark grey Chinese tiled roof;
5. a round pale-green badge with a cute animal paw print;
6. a cute rounded camera with a big lens;
7. a small hammer and a paint brush crossed (repair tools);
8. a magnifying glass with a tiny paw print inside the lens;
9. a burst of golden confetti ribbons and small stars.
Transparent background. + SHEET RULES + UNIFIED STYLE
```

---

## 4. 表情与特效 `art/raw/ui/fx.png`（冒在小动物头上）

- 1:1，3×3，9 格全用；透明底

```
A sprite sheet of 9 small emote / effect icons for animals in a cozy game, 3 x 3 grid, in reading order:
1. three sleepy "Z" letters getting smaller (zzz), soft blue-white;
2. a glossy red heart;
3. a single music note, warm orange;
4. a four-point sparkle star, pale gold;
5. a water drop, light blue;
6. a puff of white steam, two soft wisps;
7. a small smiling sun, soft yellow;
8. an exclamation mark, coral red;
9. a few golden grains of rice scattered in a small cluster.
Flat-ish 3D cartoon, rounded, no text. Transparent background. + SHEET RULES + UNIFIED STYLE
```

---

## 5. 新物件（3 张 3×3，透明底）

和已有的 8 张物件图完全一样的规则（`art/raw/01`～`08`），画风参考 `style-ref.jpg`。物件站在格子底部中央、没有地面、没有影子；
小东西（花、碗、窝）约占格高的 40～50%，中等家具 55～65%，花架这样的大件 75%。

**`art/raw/09-水生与小摆件.png`**：

```
Sheet 9, water plants and small props. Nine cells in reading order:
1. a lotus clump: a few lotus leaves holding two pink lotus flowers, the base is the water surface, NO
stone rim, no pond edge (it will be placed inside a painted pond);
2. water lilies: two round floating pads and one white water-lily flower, again no pond edge;
3. reeds: a clump of tall slender reeds with brown fluffy seed heads, roots in water;
4. stepping stones: three flat rounded stones in a row floating on water;
5. a school of koi: three or four red-and-white koi just under the water surface with a few ripples;
6. a short wooden plank bridge with a few posts standing in water;
7. a half-rolled bamboo blind hanging from a bamboo pole;
8. a round straw nest with a soft hollow in the middle;
9. a long wooden feed trough filled with golden grain.
Transparent background. + SHEET RULES + UNIFIED STYLE
```

**`art/raw/10-院子家具.png`**：

```
Sheet 10, courtyard furniture. Nine cells in reading order:
1. a golden cone-shaped haystack;
2. a cute scarecrow with a straw hat and open arms on a wooden post;
3. a wooden ladder leaning at an angle;
4. a bamboo basket full of oranges and apples;
5. a small red-clay tea stove with a copper kettle on top, a little steam;
6. a round wooden soaking tub full of hot water with gentle steam;
7. a wooden pergola / flower rack covered in purple wisteria and small flowers — this one is a large
2 x 2 piece, draw it wider and bigger than the others (about 75% of the cell);
8. a Chinese wooden garden bench;
9. a bird feeder: a wooden post holding a small platform with scattered grain and a tiny sparrow beside.
Transparent background. + SHEET RULES + UNIFIED STYLE
```

**`art/raw/11-会飞的.png`**（只用前 2 格，其余 7 格留空；这两张是图鉴和列表用的单张图，动画帧在 §6）：

```
Sheet 11, two flying friends, only cells 1 and 2 are used, the other seven cells stay empty:
1. a round little sky-blue bird with a pale cream belly, tiny orange beak and feet, big dark eyes,
perched with wings folded, side view facing LEFT;
2. a yellow swallowtail butterfly with black vein lines and small blue and orange spots on the lower
wings, wings open, seen from a slightly raised side angle facing RIGHT.
Transparent background. + SHEET RULES + UNIFIED STYLE
```

---

## 6. 小动物动画拼图（11 张，`art/raw/anim/<动物id>.png`）

这是最花功夫、也最影响「像不像一个游戏」的部分。每只动物一张 **3:2 横图，6 列 × 4 行 = 24 格**，一格一帧，游戏里按行播放：

| 行 | 格 | 内容 | 游戏里什么时候用 |
|---|---|---|---|
| 1 | 1–6 | **朝观众走**（3/4 前侧视角，脸朝右下）：一个完整步幅拆成 6 帧 | 往屏幕下方走 |
| 2 | 7–12 | **背对观众走**（3/4 后侧视角，看到背和右侧）：同样 6 帧 | 往屏幕上方走 |
| 3 | 13–14 | 站着发呆（3/4 前侧），两帧轻微呼吸 / 眨眼 | 停下来的时候 |
| 3 | 15–16 | 睡觉（趴着或蜷着，闭眼），两帧呼吸 | 打盹、晚上 |
| 3 | 17–18 | 这只动物的**专属动作**（见下表），两帧循环 | 玩它喜欢的东西 |
| 4 | 19–20 | **被点到的反应**：抬头看观众、很开心，两帧 | 玩家点它 |
| 4 | 21–24 | **招牌小动作**（见下表），4 帧 | 它自己做小事的时候 |

硬性要求（写进每张的提示词里）：

```
ANIMATION SHEET RULES: landscape 3:2, an invisible grid of 6 columns x 4 rows of equal cells (24 frames).
The SAME character in every frame: same proportions, colors, face and scale; it must look exactly like
the attached reference sprite. Same soft lighting from the upper left in every frame. Feet on the same
baseline in every frame (about 15% above the cell bottom), centered horizontally, at least 8% of the
cell empty on every side, nothing crosses a cell border. The character always faces RIGHT (toward the
right edge of the image; the game mirrors it for the other side). Walking frames: the feet visibly lift
and step, the body stays level — NO hopping or bouncing unless the animal is a rabbit; motion must read
as real legged walking. No props unless stated, no ground, no shadow, no text, no frame numbers.
Transparent background.
```

每张的提示词 = 上面的 ANIMATION SHEET RULES + UNIFIED STYLE + 下面这只动物的 CHARACTER / ROWS。
参考图：`miniprogram/images/garden/items/<id>.png`（同一只）+ `art/guide/style-ref.jpg`（画风）。
小鸟和蝴蝶现在是 emoji 占位，没有「同一只」的参考，按文字描述画，并和 §5 第 11 张里的那只保持一致（先出第 11 张再出这两张动画）。

| 动物 id | CHARACTER（外形） | 走路要点 | 第 17–18 格 专属动作 | 第 19–20 格 开心 | 第 21–24 格 招牌小动作 |
|---|---|---|---|---|---|
| `chick` 小黄鸡 | a round fluffy yellow chick, tiny orange beak and feet, big shiny dark eyes, a small tuft on the head | waddle: short quick steps, slight side-to-side sway | pecking grain on the ground: head down, head up | flaps its stubby wings, beak open chirping | scratches the ground with one foot, looks down, pecks, pulls out a little worm |
| `rabbit` 小白兔 | a plump white rabbit, long upright ears pink inside, rosy cheeks, big dark eyes, tiny pink nose | hop cycle (the one animal allowed to hop): crouch, push off, stretched in the air, land, settle | nibbling, cheeks moving, holding a small carrot with a green top | sits up tall on hind legs, ears perked, delighted | a joyful binky: crouch, big jump with a twist in the air, land, happy shake |
| `duck` 小黄鸭 | a round yellow duckling, flat orange bill, orange webbed feet, big dark eyes | waddle: body rocks side to side, feet slap down | floating pose as if on water: legs tucked, body level, relaxed (draw no water; the game adds it) | flaps wings, bill open quacking, tail wagging | tips forward to dive: bottom up with feet in the air, comes back up and shakes the water off |
| `turtle` 小乌龟 | a small chubby green turtle, rounded olive-green patterned shell, light green head and legs, friendly eyes | slow crawl: legs move one at a time, head bobs gently, belly low | basking: neck stretched out long, eyes closed, content | lifts its head, eyes sparkle, little wiggle | hides: pulls head and legs into the shell, only the shell, peeks out, pops fully back out |
| `tabby_cat` 小花猫 | a chubby calico kitten, white body with orange and dark-grey patches, white chest and paws, big round eyes, pink nose | quadruped walk: diagonal legs alternate, body level, tail swaying | sitting in a loaf, eyes half closed, content | sits up, eyes wide, tail straight up, happy meow | a big stretch with front legs out and back arched, then licks a paw, then grooms its face |
| `ginger_cat` 胖橘猫 | a very fat orange tabby cat, darker orange stripes, cream belly, chubby cheeks, lazy half-closed eyes | heavy slow quadruped walk, belly swaying a little | sitting upright, eyes closed, blissful, as if soaking in hot water (draw no water or tub; the game covers the lower half) | rolls onto its back showing the belly, paws up | chasing its own tail in a circle: the only row where the facing may turn around |
| `panda` 大熊猫 | a chubby round giant panda, black and white, round black ears, black eye patches, pink inner ears | quadruped walk on all fours, heavy and round, body level | sitting, holding a bamboo stalk in both paws, chewing (the bamboo is the only prop) | claps its paws and bounces once in place, happy | a backward roll: sits, tucks into a ball, rolls over, lands sitting again |
| `crane` 仙鹤 | an elegant red-crowned crane, white body, black neck tips and black tail feathers, a red crown, long thin dark legs, long slender beak | long slow deliberate strides on thin legs, neck sways slightly, wings folded | standing on one leg, the other tucked up, perfectly still, eyes closed | spreads both wings wide and tilts its head up | a crane dance: wings open, a light leap, a bow, a graceful pose |
| `panda_family` 熊猫一家 | a mother giant panda together with her small cub (the cub about 40% of her height); they move as one group in every frame | mother walks on all fours, the cub trots beside her, both level | both sitting and chewing bamboo (bamboo is the only prop) | the cub climbs onto the mother's back, both smiling | piggyback play: cub on her back waving, mother bows down, cub slides off, they hug |
| `bird` 小鸟 | a round little sky-blue bird, pale cream belly, tiny orange beak and feet, big dark eyes (same bird as sheet 11 cell 1) | rows 1–2 are a FLYING cycle instead of walking: 6 frames of one wing beat (wings high, mid, low, back up), body tilted slightly forward; row 3 cells 13–14 perched with wings folded, 15–16 sleeping perched with the head tucked under a wing | singing: beak open, chest puffed | hops in place and flutters its wings | preening: tucks the beak into a wing, ruffles, shakes, looks up |
| `butterfly` 蝴蝶 | a yellow swallowtail butterfly, black vein lines, small blue and orange spots on the lower wings (same butterfly as sheet 11 cell 2) | rows 1–2 are a FLUTTERING cycle instead of walking: 6 frames of one wing beat seen from the side (row 1 the near side, row 2 from behind); row 3 cells 13–14 resting with wings open, 15–16 resting with wings closed upright | sipping nectar: wings closed, proboscis down | wings spread wide, a little glow | turning around in place, 4 frames (facing may change in this row) |

小鸟和蝴蝶体型小，占格高的 50% 左右；其他动物占 70～80%。熊猫一家按「一组」占格，母熊猫占 75%。

---

## 7. 交付之后小程序这边做什么（你不用管，写给我自己看）

- 宅院：`cut_art.py --pad32` 对齐切 16 块 → `npm run wx:art` 传云存储 → `config.estateArt`；有高清版就切高清版
- 云朵 / 图标 / 表情：`slice-art.py` 切成单张，替换 `images/garden/` 下的占位图
- 新物件：`slice-art.py`（SHEETS 已写好 09～11）
- 动画：`python3 scripts/pack_anim.py` 把 24 帧对齐、统一尺寸、压成 `art/anim/<id>.png` → `npm run wx:art` 传云存储 → `config.animArt`；页面有图用图、没图退回单张 + CSS 步态
