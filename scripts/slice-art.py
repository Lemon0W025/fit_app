"""把 Codex 出的美术整图（透明底，3×3 格）切成小程序用的单张图。

    python3 scripts/slice-art.py

原图在 art/raw/（格子顺序见 art/raw/中文物件索引.txt），每格对应的图片名写在下面的 SHEETS 里。
切出来的图覆盖 miniprogram/images/ 下同名的占位图，代码不用改。需要 Pillow 和 numpy。

物件偶尔会稍微越过格子线，所以不是按格子硬切：先找出一块块连在一起的图形，
每块归到它大部分像素所在的格子，同一格的几块（比如蒲公英飘出去的种子）合成一个物件。
"""
import os
import sys
from collections import deque

import numpy as np
from PIL import Image

REPO = os.path.join(os.path.dirname(__file__), '..')
RAW = os.path.join(REPO, 'art', 'raw')
OUT = os.path.join(REPO, 'miniprogram', 'images')

GRID = 3
ALPHA_MIN = 4     # 低于这个透明度算背景
NOISE_PX = 120    # 比这还小的孤立碎点当噪点丢掉

ITEM_PX = 240     # 庭院物件：正方形画布，物体贴底居中（庭院里底边对齐格子）
UI_PX = {'bean': 120, 'gacha': 420, 'gift': 280, 'book': 240, 'shovel': 200,
         'capsule-common': 300, 'capsule-rare': 300, 'capsule-epic': 300, 'capsule-legendary': 300}

# (文件名, 种类, 九个格子的输出名)；None 是空格或不用的格子
SHEETS = [
    ('01-界面元素.png', 'ui', ['bean', 'gacha', 'capsule-common', 'capsule-rare', 'capsule-epic',
                           'capsule-legendary', 'gift', 'book', 'shovel']),
    # 每天的树已经不用了；这张图只取「大树」给院子中间的新手大树（见 EXTRA_ITEMS）
    ('02-每天的树.png', 'source', [None, None, None, 'small', 'big', None, None, None, None]),
    ('03-普通-花草.png', 'item', ['daisy', 'chrysanthemum', 'orchid', 'pothos', 'sunflower', 'bamboo',
                              'dandelion', 'grass', 'mushroom']),
    ('04-普通-田园.png', 'item', ['cabbage', 'radish', 'pumpkin', 'pebbles', 'fence', 'stool', None, None, None]),
    ('05-稀有-树与摆件.png', 'item', ['osmanthus', 'orange_tree', 'persimmon_tree', 'gourd_rack', 'goji_tray',
                                'tea_table', 'wood_bridge', 'lantern', 'stone_table']),
    ('06-稀有-小动物.png', 'item', ['chick', 'rabbit', 'duck', 'koi_pond', 'turtle', 'tabby_cat', None, None, None]),
    ('07-珍稀.png', 'item', ['panda', 'ginger_cat', 'plum_tree', 'lotus_pond', 'pavilion', 'arch_bridge',
                          'crane', 'swing_tree', 'waterwheel']),
    ('08-传说与节气限定.png', 'item', ['teahouse', 'zigzag_bridge', 'panda_family', 'golden_ginkgo',
                                 'dried_persimmon', 'sweet_potato_stove', 'snowman', 'wintersweet',
                                 'dumpling_steamer']),
]

# 院子中间送的那棵大树，用每日树里的「大树」
EXTRA_ITEMS = {'starter_tree': ('02-每天的树.png', 'big')}

# 小岛外面的装饰树：每日树里的大树和小树（存到 images/garden/，不是物件）
EXTRA_DECOR = {'decor-tree': ('02-每天的树.png', 'big'), 'decor-bush': ('02-每天的树.png', 'small')}


def label(mask):
    """四连通标记，返回 (标记数组, 块数)"""
    labels = np.zeros(mask.shape, dtype=np.int32)
    h, w = mask.shape
    count = 0
    for y, x in zip(*np.nonzero(mask)):
        if labels[y, x]:
            continue
        count += 1
        labels[y, x] = count
        queue = deque([(y, x)])
        while queue:
            cy, cx = queue.popleft()
            for ny, nx in ((cy + 1, cx), (cy - 1, cx), (cy, cx + 1), (cy, cx - 1)):
                if 0 <= ny < h and 0 <= nx < w and mask[ny, nx] and not labels[ny, nx]:
                    labels[ny, nx] = count
                    queue.append((ny, nx))
    return labels, count


def split_cells(img):
    """返回九个格子各自的物件图（裁到最小外框），空格为 None"""
    arr = np.array(img)
    solid = arr[..., 3] > ALPHA_MIN
    # 缩小一半再找连通块（2×2 里有一个像素就算），快四倍
    h2, w2 = solid.shape[0] // 2, solid.shape[1] // 2
    small = solid[:h2 * 2, :w2 * 2].reshape(h2, 2, w2, 2).any(axis=(1, 3))
    labels, count = label(small)
    cell = small.shape[0] / GRID
    owner = np.zeros(count + 1, dtype=np.int32) - 1
    for k in range(1, count + 1):
        ys, xs = np.nonzero(labels == k)
        if len(ys) * 4 < NOISE_PX:
            continue
        ids = np.minimum(ys // cell, GRID - 1).astype(int) * GRID + np.minimum(xs // cell, GRID - 1).astype(int)
        owner[k] = np.bincount(ids, minlength=GRID * GRID).argmax()
    full = np.kron(labels, np.ones((2, 2), dtype=np.int32))
    full = np.pad(full, ((0, solid.shape[0] - full.shape[0]), (0, solid.shape[1] - full.shape[1])))
    cell_of = owner[full]
    pieces = []
    for c in range(GRID * GRID):
        mask = solid & (cell_of == c)
        if not mask.any():
            pieces.append(None)
            continue
        ys, xs = np.nonzero(mask)
        piece = arr.copy()
        piece[..., 3] = np.where(mask, piece[..., 3], 0)  # 只留这一格的物件
        pieces.append(Image.fromarray(piece).crop((xs.min(), ys.min(), xs.max() + 1, ys.max() + 1)))
    return pieces


def fit(obj, size, margin=6, anchor='bottom'):
    """等比缩放到正好放进正方形画布"""
    scale = (size - 2 * margin) / max(obj.size)
    w, h = max(1, round(obj.width * scale)), max(1, round(obj.height * scale))
    obj = obj.resize((w, h), Image.LANCZOS)
    canvas = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    y = size - margin - h if anchor == 'bottom' else (size - h) // 2
    canvas.alpha_composite(obj, ((size - w) // 2, y))
    return canvas


def save(img, *parts):
    """量化成 256 色（保留透明度），体积小很多；小程序主包只有 2MB"""
    path = os.path.join(OUT, *parts)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    img.quantize(colors=256, method=Image.Quantize.FASTOCTREE).save(path, optimize=True)
    return os.path.getsize(path)


def main():
    cut = {}
    total = 0
    for name, kind, names in SHEETS:
        path = os.path.join(RAW, name)
        if not os.path.exists(path):
            print('跳过（没有原图）', name)
            continue
        pieces = split_cells(Image.open(path).convert('RGBA'))
        for i, (out, piece) in enumerate(zip(names, pieces)):
            if out and piece is None:
                sys.exit(f'{name} 第 {i + 1} 格是空的，但 SHEETS 里写的是 {out}')
            if not out and piece is not None and kind != 'source':
                print(f'  注意：{name} 第 {i + 1} 格有图，没用上')
        objs = {out: piece for out, piece in zip(names, pieces) if out}
        cut[name] = objs
        if kind == 'source':
            pass
        elif kind == 'item':
            for out, o in objs.items():
                total += save(fit(o, ITEM_PX), 'garden', 'items', f'{out}.png')
        else:
            for out, o in objs.items():
                total += save(fit(o, UI_PX[out], margin=2, anchor='center'), 'garden', 'ui', f'{out}.png')
        print(f'{name}: {"、".join(objs)}')
    for item_id, (sheet, piece) in EXTRA_ITEMS.items():
        if sheet in cut:
            total += save(fit(cut[sheet][piece], ITEM_PX), 'garden', 'items', f'{item_id}.png')
    for name, (sheet, piece) in EXTRA_DECOR.items():
        if sheet in cut:
            total += save(fit(cut[sheet][piece], ITEM_PX), 'garden', f'{name}.png')
    print(f'共写入 {total // 1024} KB')


if __name__ == '__main__':
    main()
