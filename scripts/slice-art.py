"""切界面图标和表情（art/raw/ui/icons.png、fx.png，透明底 3×3 格）成小程序用的单张图。

    python3 scripts/slice-art.py

宠物、装饰、食物的正式图各有自己的脚本（见 docs/art/camp-art-pack.md）。需要 Pillow 和 numpy。

物件偶尔会稍微越过格子线，所以不是按格子硬切：先找出一块块连在一起的图形，
每块归到它大部分像素所在的格子，同一格的几块合成一个物件。
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

UI_PX = {'bean': 120, 'gacha': 420, 'gift': 280, 'book': 240, 'shovel': 200,
         'capsule-common': 300, 'capsule-rare': 300, 'capsule-epic': 300, 'capsule-legendary': 300,
         'basket': 160, 'calendar': 160, 'home': 160, 'paw': 160, 'camera': 160, 'tools': 160, 'finder': 160, 'confetti': 240}
FX_PX = 96        # 动物头上的表情 / 特效

# (文件名, 种类, 九个格子的输出名)；None 是空格或不用的格子
SHEETS = [
    ('ui/icons.png', 'ui', [None, 'basket', 'calendar', 'home', 'paw', 'camera', 'tools', 'finder', 'confetti']),
    ('ui/fx.png', 'fx', ['zzz', 'heart', 'note', 'sparkle', 'drop', 'steam', 'sun', 'bang', 'grain']),
]



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
        elif kind == 'fx':
            for out, o in objs.items():
                total += save(fit(o, FX_PX, margin=2, anchor='center'), 'garden', 'fx', f'{out}.png')
        else:
            for out, o in objs.items():
                total += save(fit(o, UI_PX[out], margin=2, anchor='center'), 'garden', 'ui', f'{out}.png')
        print(f'{name}: {"、".join(objs)}')
    print(f'共写入 {total // 1024} KB')


if __name__ == '__main__':
    main()
