# 小岛花园 · 出图说明（给 Codex / 图像模型）

花园现在的小岛底图、角落的篱笆遮罩、木牌和几个按钮图标是脚本画的占位图；角落里的风景和花坛里的花草借用的是扭蛋物件图。按下面出 **4 张图**，发 zip 给我（或传到仓库 `art/raw/`），我切图、对齐格子后替换。

**一定要附上布局草图 `art/guide/island-layout.png`**（程序按真实格子画的）：浅蓝是海；中间浅绿是「中间花园」；四个彩色块是要花暖豆修整的角落（荷塘角、竹林角、菜园角、茶亭角）；四个深绿角是花坛；米色小方块是十字石板路；红圈编号是各角落自带风景的位置，图例在下面。

## 一、统一风格（每张都附上，和以前一样）

```
Cute 3D isometric mobile-game asset, soft rounded chunky shapes, matte clay-like material
with subtle texture, warm cheerful pastel colors, soft global illumination from the upper left,
gentle ambient occlusion, no hard cast shadows, simple readable silhouette, cozy Chinese
countryside garden theme (NOT Japanese: no torii, no kadomatsu), consistent isometric camera
(about 30° elevation, object turned 45°), no text, no labels, no borders.
Background: transparent PNG. If transparency is not possible, use a perfectly flat solid
magenta background #FF00FF with no gradient, no shadow and no other magenta in the objects.
```

## 二、第 1 张 · 小岛底图（1536 × 1024，一整张）

```
One single isometric island seen from the same camera, filling the canvas width
(about 40 px empty on the left and right). The top surface is a perfect 2:1 diamond
(width exactly twice the height), split into a 12 x 12 grid like the attached layout guide
(do NOT draw grid lines). Follow the guide exactly:
- a cross-shaped light stone-slab path along the middle column and the middle row;
- the four corner 3x3 squares are flower beds packed with LOW flowers, grass tufts and
  small shrubs (nothing taller than half a cell; big trees are added separately);
- everything else is flat, even, light-green lawn with soft color variation and tiny grass
  strokes, with NO objects on it (furniture and scenery are added separately);
- under the diamond: a thin sandy beach rim, then a short warm-brown cliff side.
Outside the island: transparent (the sea is drawn by the app).
```

## 三、第 2 张 · 角落风景（1536 × 1536，3 × 3 格，每格 512 × 512）

每件占地一格，底部贴着格子中心放（和以前的物件一样），按顺序从左到右、从上到下：

1. 荷塘：一大片圆圆的荷塘，石头围边，荷叶、两三朵粉荷花（放在荷塘角最大的那块）
2. 锦鲤小池：小一点的圆池子，两条红白锦鲤
3. 一丛翠竹：三四根竹子，竹叶茂盛
4. 石灯笼：中式石灯笼（方顶，不要日式造型）
5. 菜畦：一小块整齐的菜地，两三排绿叶菜
6. 大南瓜：一个橙色大南瓜，带藤和叶子
7. 一段木篱笆：短短一段竹木篱笆，几根竖桩
8. 小茶亭：六角小凉亭，红柱灰瓦，亭子下有石凳（放在茶亭角，会放大一点）
9. 石桌石凳：一张圆石桌和两个石鼓凳

拼图格式（直接复制）：

```
A sprite sheet, 1536 x 1536 px, a 3 x 3 grid of equal 512 x 512 cells.
Each object is centered in its own cell with at least 60 px of empty space on every side,
its base at the bottom center of the cell, no ground plane under it.
Fill the cells left-to-right, top-to-bottom in the order listed.
```

## 四、第 3 张 · 没修整的角落（1536 × 1024，一整张）

```
One isometric patch of overgrown wild land, shaped exactly like the POND corner in the layout
guide: a flat parallelogram 6 cells long along the right-down direction and 3 cells wide along
the left-down direction, filling the canvas width (about 60 px empty on the left and right).
Covered with messy tall weeds, a few dry yellow grass blades, small grey stones, a couple of
tiny wild flowers. A low rustic wooden fence (posts and two rails) runs all around its four
edges. Leave about 20% empty space above the patch for the fence posts. No sign, no text.
Outside the patch: transparent.
```

只要这一张：另外三个角落我用同一张图镜像、放到各自的位置。

## 五、第 4 张 · 木牌和按钮图标（1536 × 1536，3 × 3 格，只用前 4 格）

1. 修整木牌：一根短木桩，上面钉一块横的长方形空白木板，**木板上不要写字**（字由程序写上去），木板占上半部分
2. 竹篮（背包按钮）：一个编织竹篮，里面露出一点花草
3. 台历（日历按钮）：翻页台历，红色顶边，页面上不要写字
4. 小房子（回到小岛中间的按钮）：暖黄色屋顶的小房子

拼图格式同第 2 张。

## 六、我这边怎么用

- 第 1 张对齐格子后当整座岛的底图；四个花坛里的大树、岛边零星的花草还是由程序摆物件图
- 第 2 张换掉角落里借用的扭蛋物件图（扭蛋物件本身不变）
- 第 3 张盖在还没修整的角落上，木牌立在中间；修整后遮罩淡出、风景出现
- 第 4 张换掉木牌和屏幕两侧按钮上的图标
- 大图放云存储，不占小程序 2MB 的包
