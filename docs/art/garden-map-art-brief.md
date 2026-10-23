# 养生庭院大地图 · 出图说明（给 Codex / 图像模型）

大地图上现在用的荒地杂草、开荒木牌、外围云朵和三个按钮图标是脚本画的占位图。按下面出 **1 张 3×3 拼图**，发 zip 给我（或传到仓库 `art/raw/`），我切图替换，代码不用改。

## 一、统一风格（和上次一样，直接复制）

```
Cute 3D isometric mobile-game asset, soft rounded chunky shapes, matte clay-like material
with subtle texture, warm cheerful pastel colors, soft global illumination from the upper left,
gentle ambient occlusion, no hard cast shadows, simple readable silhouette, cozy Chinese
countryside garden theme (NOT Japanese: no torii, no kadomatsu), consistent isometric camera
(about 30° elevation, object turned 45°), each object stands alone with its base at the bottom
center of its cell, no ground plane under it, no text, no labels, no borders.
Background: transparent PNG. If transparency is not possible, use a perfectly flat solid
magenta background #FF00FF with no gradient, no shadow and no other magenta in the objects.
```

## 二、拼图格式

```
A sprite sheet, 1536 x 1536 px, a 3 x 3 grid of equal 512 x 512 cells.
Each object is centered in its own cell with at least 60 px of empty space on every side.
Fill the cells left-to-right, top-to-bottom in the order listed.
```

## 三、第 9 张 · 大地图

1. 荒地杂草丛：一小丛乱糟糟的野草，夹着两三根枯黄的草，矮矮的（占格子高度 35% 左右）
2. 另一种杂草丛：带一两朵很小的野花，和第 1 个形状不一样
3. 小石头堆：三四块灰色圆石头，矮
4. 开荒木牌：一根短木桩，上面钉一块横的长方形空白木板，**木板上不要写字**（字由程序写上去），木板占上半部分
5. 一团尘土：开荒时冒起来的浅棕色圆滚滚的尘土云，柔和、可爱
6. 外围枯树：没有叶子的老树，枝条弯弯地分叉，树皮灰褐色，脚下一小片干土（小岛外面是荒野，要显得萧瑟但还是可爱）
7. 外围枯灌木：一丛干枝条，挂着几片枯黄的叶子
8. 白云：一朵蓬松可爱的白云，带一点点淡蓝阴影
9. 竹篮（背包按钮图标）：一个编织竹篮，里面露出一点花草

可选第二张（3 格就够）：日历图标（翻页台历，红色顶边）、小房子图标（「回到中间」按钮用，暖黄色屋顶）、空格。

## 四、我这边怎么用

- 1～3 随机撒在荒地上当杂草，4 立在能开荒的荒地中间，5 在开荒的一瞬间冒出来
- 6～8 摆在小岛外面当风景（外面荒着，衬得院子里有生气）
- 9 和可选的两个图标换掉屏幕底部按钮上的 emoji 图标
