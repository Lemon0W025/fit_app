# 养生庭院 · 出图说明（给 Codex / 图像模型）

目标：可爱、美观、有吸引力的 **3D 卡通风** 物件图，摆在等距（斜 45° 俯视）的庭院网格里。
一共 **8 张图**（拼图），每张里放 6～9 个物件，我这边会自动切开、去背景、缩放、加阴影。

> 建议先只生成 **第 7 张（珍稀）** 发给我看风格和切图效果，没问题再出其余 7 张。

## 一、每张都要附上的统一风格（直接复制）

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

## 二、拼图格式（每张都一样）

```
A sprite sheet, 1536 x 1536 px, a 3 x 3 grid of equal 512 x 512 cells.
Each object is centered in its own cell with at least 60 px of empty space on every side.
All objects share the same camera, lighting and scale: small things (flowers, vegetables,
small animals) about 40-50% of the cell height; trees and buildings up to about 85%.
Fill the cells left-to-right, top-to-bottom in the order listed; leave unused cells empty.
```

## 三、8 张图的内容（每张：统一风格 + 拼图格式 + 下面的清单）

### 第 1 张 · 界面元素
1. 暖豆（游戏货币）：一颗圆润发光的暖橙色豆子，带小高光
2. 扭蛋机：圆形透明玻璃罩里装满彩色扭蛋，红色机身，前面一个大旋钮和出蛋口，很可爱
3. 扭蛋 · 普通：白色和浅灰拼色的圆形胶囊
4. 扭蛋 · 稀有：天蓝色和白色拼色的胶囊
5. 扭蛋 · 珍稀：紫色和白色拼色的胶囊，微微发光
6. 扭蛋 · 传说：金色和白色拼色的胶囊，闪闪发光带星星
7. 新手礼物盒：系着红丝带的礼物盒
8. 图鉴书：一本精致的绿色布面小册子
9. 小铲子：园艺小铲，木柄

### 第 2 张 · 每天的树（同一棵树在不同阶段，排成 2 行 × 3 列，只用前 6 格）
1. 一小堆刚翻过的泥土（还没种）
2. 刚冒头的两片嫩芽
3. 小树苗（细细的枝干，几片叶子）
4. 小树（圆圆的树冠）
5. 大树（茂盛的圆树冠）
6. 开满粉白花朵的大树
7. （第 7 格）结满红苹果的大树

### 第 3 张 · 普通 · 花草
1. 白色雏菊丛
2. 黄色小菊花丛
3. 青瓷花盆里的兰花
4. 陶土花盆里的绿萝
5. 一株向日葵
6. 一小丛翠竹
7. 蒲公英
8. 一丛青草
9. 一簇小红蘑菇

### 第 4 张 · 普通 · 田园（只用前 6 格）
1. 一颗大白菜
2. 白萝卜（露出一半在土里）
3. 橙色南瓜
4. 几块圆润的鹅卵石
5. 一小段木篱笆
6. 木头小板凳

### 第 5 张 · 稀有 · 树与摆件
1. 开着小黄花的桂花树
2. 挂满橘子的小橘子树
3. 挂着橙色柿子的柿子树
4. 挂着葫芦的竹葫芦架
5. 竹匾里晒着枸杞和红枣
6. 小木桌上放着紫砂茶壶和茶杯
7. 小木桥
8. 挂着红灯笼的木灯柱
9. 圆石桌配两个石凳

### 第 6 张 · 稀有 · 小动物（只用前 6 格）
1. 毛茸茸的小黄鸡
2. 小白兔
3. 小黄鸭
4. 小圆水池，里面有一条红白锦鲤
5. 小乌龟
6. 坐着的小花猫

### 第 7 张 · 珍稀（建议先出这张试风格）
1. 抱着竹子啃的大熊猫
2. 趴着晒太阳的胖橘猫
3. 开着红梅的梅花树
4. 开着粉色荷花的小荷塘
5. 红柱灰瓦的六角凉亭
6. 石拱桥
7. 优雅的白色仙鹤
8. 挂在树枝上的木秋千
9. 小水车

### 第 8 张 · 传说 + 节气限定
1. 传说：两层的中式小茶楼，挂着灯笼
2. 传说：九曲桥穿过荷塘
3. 传说：熊猫一家三口
4. 传说：金黄色叶子的大银杏树
5. 霜降限定：挂满柿饼的木架
6. 立冬限定：烤红薯的小炭炉，冒着热气
7. 小雪限定：戴红围巾的雪人
8. 大雪限定：开着黄色腊梅的树
9. 冬至限定：冒着热气的竹蒸笼，里面是饺子

## 四、交付

- 生成好的 8 张图直接发在对话里就行（原图，不要截图压缩）
- 某张不满意可以单独重出；单个物件不满意，也可以只重出那一个（同样的风格段落 + 单个物件描述，画在 512 × 512 的图中间）

## 我这边会做的处理

切图 → 去背景 → 统一缩放到 256 px → 补柔和的落地阴影 → 压缩体积。庭院的草地块、小路、边框由我用程序画，保证每块严丝合缝地拼在一起。
