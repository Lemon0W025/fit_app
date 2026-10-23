"""检查 Codex 出的图合不合规矩（文件在不在、透明不透明、每格有没有东西、有没有贴边越格）

    python3 scripts/art/check_art.py            # 按 art/manifest.json 全部检查
    python3 scripts/art/check_art.py art/raw/anim/panda.png   # 只查这几张

退出码 0 表示全部通过。需要 Pillow 和 numpy。
"""
import json
import os
import sys

import numpy as np
from PIL import Image

REPO = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..'))
ALPHA_MIN = 8        # 低于这个透明度算背景
OCCUPIED = 0.004     # 一格里不透明像素占比超过这个算「有东西」
EDGE = 0.02          # 格子四边这么宽的一圈必须是空的（不然切图会切到）
ANIM = {'cols': 6, 'rows': 4, 'cells': 24, 'aspect': 1.5}
MAGENTA = np.array([255, 0, 255])


def load(path):
    img = Image.open(path)
    img.load()
    return img


def alpha_of(img):
    """返回 0/1 的前景掩码；没有 alpha 通道时试着把纯洋红当背景抠掉"""
    if img.mode in ('RGBA', 'LA') or (img.mode == 'P' and 'transparency' in img.info):
        a = np.array(img.convert('RGBA'))[:, :, 3]
        if a.min() < ALPHA_MIN:
            return a >= ALPHA_MIN, 'alpha'
    rgb = np.array(img.convert('RGB')).astype(int)
    dist = np.abs(rgb - MAGENTA).sum(axis=2)
    if (dist < 60).mean() > 0.2:
        return dist >= 60, 'magenta'
    return None, 'opaque'


def check_grid(path, spec, problems):
    img = load(path)
    cols, rows, cells = spec['cols'], spec['rows'], spec['cells']
    if 'aspect' in spec:
        ratio = img.width / img.height
        if abs(ratio - spec['aspect']) > 0.05:
            problems.append(f'比例应为 {spec["aspect"]:.2f}:1，现在是 {ratio:.2f}:1（{img.width}×{img.height}）')
    mask, how = alpha_of(img)
    if mask is None:
        problems.append('不透明：没有 alpha 通道，也不是纯洋红背景')
        return
    if how == 'magenta':
        problems.append('背景是洋红不是透明（能用，但最好出真透明 PNG）')
    cw, ch = img.width / cols, img.height / rows
    heights = []
    for i in range(cols * rows):
        c, r = i % cols, i // cols
        x0, y0, x1, y1 = round(c * cw), round(r * ch), round((c + 1) * cw), round((r + 1) * ch)
        cell = mask[y0:y1, x0:x1]
        filled = cell.mean()
        occupied = filled > OCCUPIED
        if i < cells and not occupied:
            problems.append(f'第 {i + 1} 格是空的（应该有东西）')
        if i >= cells and occupied:
            problems.append(f'第 {i + 1} 格有东西（应该留空）')
        if not occupied:
            continue
        ex, ey = max(2, round(cw * EDGE)), max(2, round(ch * EDGE))
        band = np.concatenate([cell[:ey].ravel(), cell[-ey:].ravel(), cell[:, :ex].ravel(), cell[:, -ex:].ravel()])
        if band.mean() > 0.002:
            problems.append(f'第 {i + 1} 格的东西贴到格子边上了（四周要留空）')
        ys = np.nonzero(cell.any(axis=1))[0]
        heights.append((i, (ys[-1] - ys[0] + 1) / ch if len(ys) else 0))
    if spec.get('kind') == 'anim' and heights:
        # 前两行是走路：同一只动物的高矮不该差太多
        for row in (0, 1):
            hs = [h for i, h in heights if i // cols == row]
            if hs and max(hs) > min(hs) * 1.35:
                problems.append(f'第 {row + 1} 行的几帧大小不一致（最高 {max(hs):.0%}、最矮 {min(hs):.0%} 格高），同一只动物比例要一样')


def check_painting(path, spec, problems):
    img = load(path)
    ratio = img.width / img.height
    if abs(ratio - spec['aspect']) > 0.05:
        problems.append(f'比例应为 {spec["aspect"]:.2f}:1，现在是 {ratio:.2f}:1')
    if img.width < spec.get('minWidth', 0):
        problems.append(f'太小：{img.width} 宽，至少 {spec["minWidth"]}')


def main():
    manifest = json.load(open(os.path.join(REPO, 'art', 'manifest.json'), encoding='utf-8'))
    only = set(os.path.normpath(os.path.join(os.getcwd(), p)) for p in sys.argv[1:])
    failed = 0
    missing = 0
    for spec in manifest['sheets']:
        path = os.path.join(REPO, spec['file'])
        if only and os.path.normpath(path) not in only:
            continue
        if not os.path.exists(path):
            missing += 1
            print(f'  ·  {spec["file"]}  还没有')
            continue
        problems = []
        try:
            if spec['kind'] == 'painting':
                check_painting(path, spec, problems)
            else:
                full = dict(ANIM, **spec) if spec['kind'] == 'anim' else spec
                check_grid(path, full, problems)
        except Exception as e:  # 打不开等
            problems.append(f'读不了：{e}')
        if problems:
            failed += 1
            print(f'  ✗  {spec["file"]}')
            for p in problems:
                print(f'       - {p}')
        else:
            img = load(path)
            print(f'  ✓  {spec["file"]}  {img.width}×{img.height}')
    total = len(manifest['sheets']) if not only else len(only)
    print(f'\n通过 {total - failed - missing} / {total}，没过 {failed}，还没出 {missing}')
    sys.exit(1 if failed else 0)


if __name__ == '__main__':
    main()
