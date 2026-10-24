"""把 Codex 出的小动物动画拼图（6×4，见 docs/art/codex-art-pack.md §6）对齐、统一尺寸、压小，给小程序用

    python3 scripts/pack_anim.py              # art/raw/anim/<id>.png → art/anim/<id>.png，并回写 utils/anim-sheets.js 的 top
    python3 scripts/pack_anim.py --demo       # 没有正式图时，用现在的单张图合成一套示意拼图到 art/anim-demo/（只用来验证播放）

对齐：同一组帧（走路一整行、发呆两帧、睡觉两帧……）一起平移，让这组的脚底平均落在格底往上 10% 处、水平居中——
按组而不是按帧对齐，才不会把模型画的步幅起伏抹掉。输出每格 CELL px、6×4 格、256 色 PNG，传云存储（npm run wx:art）。
需要 Pillow 和 numpy。
"""
import argparse
import json
import os
import re
import subprocess

import numpy as np
from PIL import Image, ImageDraw, ImageFont

REPO = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
RAW = os.path.join(REPO, 'art', 'raw', 'anim')
OUT = os.path.join(REPO, 'art', 'anim')
DEMO = os.path.join(REPO, 'art', 'anim-demo')
SHEETS_JS = os.path.join(REPO, 'miniprogram', 'utils', 'anim-sheets.js')
COLS, ROWS = 6, 4
CELL = 192
FOOT = 0.10        # 脚底离格底的距离（格高比例）
ALPHA_MIN = 8
# 哪些格子是一组（一起平移）
GROUPS = [list(range(0, 6)), list(range(6, 12)), [12, 13], [14, 15], [16, 17], [18, 19], [20, 21, 22, 23]]


def animal_ids():
    js = "console.log(JSON.stringify(Object.keys(require('./miniprogram/utils/anim-sheets'))))"
    return json.loads(subprocess.check_output(['node', '-e', js], cwd=REPO))


def bbox(a):
    ys, xs = np.nonzero(a)
    if not len(ys):
        return None
    return xs.min(), ys.min(), xs.max() + 1, ys.max() + 1


def pack(src):
    """6×4 原图 → (对齐好的 CELL 格拼图, 发呆帧的头顶空白比例)"""
    cw, ch = src.width / COLS, src.height / ROWS
    cells = []
    for i in range(COLS * ROWS):
        c, r = i % COLS, i // COLS
        box = (round(c * cw), round(r * ch), round((c + 1) * cw), round((r + 1) * ch))
        cell = src.crop(box)
        cells.append((cell, bbox(np.array(cell)[:, :, 3] >= ALPHA_MIN)))
    scale = CELL / cw
    out = Image.new('RGBA', (COLS * CELL, ROWS * CELL), (0, 0, 0, 0))
    for group in GROUPS:
        boxes = [cells[i][1] for i in group if cells[i][1]]
        if not boxes:
            continue
        cx = np.mean([(b[0] + b[2]) / 2 for b in boxes])
        bottom = np.mean([b[3] for b in boxes])
        dx = cw / 2 - cx
        dy = ch * (1 - FOOT) - bottom
        for i in group:
            cell, b = cells[i]
            if not b:
                continue
            c, r = i % COLS, i // COLS
            moved = Image.new('RGBA', cell.size, (0, 0, 0, 0))
            moved.paste(cell, (round(dx), round(dy)))
            small = moved.resize((CELL, CELL), Image.LANCZOS)
            out.paste(small, (c * CELL, r * CELL))
    # 头顶空白按对齐之后的发呆帧（第 13 格）量
    idle = bbox(np.array(out.crop((0, 2 * CELL, CELL, 3 * CELL)))[:, :, 3] >= ALPHA_MIN)
    top = (idle[1] / CELL) if idle else 0.1
    return out, round(float(top), 2)


def save(img, path):
    a = np.array(img)
    a[:, :, 3][a[:, :, 3] < ALPHA_MIN] = 0
    img = Image.fromarray(a)
    img.quantize(colors=256, method=Image.Quantize.FASTOCTREE).save(path, optimize=True)
    return os.path.getsize(path)


def write_tops(tops):
    s = open(SHEETS_JS, encoding='utf-8').read()
    for animal_id, top in tops.items():
        s, n = re.subn(rf"(\b{animal_id}: \{{[^}}]*top: )[0-9.]+", rf"\g<1>{top}", s)
        if not n:
            print('  注意：anim-sheets.js 里没有', animal_id)
    open(SHEETS_JS, 'w', encoding='utf-8').write(s)


def demo_sheet(animal_id):
    """用单张图合成 24 帧示意：走路左右摇、背面调暗、睡觉压扁、小动作转圈，每格标帧号"""
    sprite = Image.open(os.path.join(REPO, 'miniprogram', 'images', 'garden', 'items', f'{animal_id}.png')).convert('RGBA')
    font = ImageFont.truetype('/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc', 26)
    S = 256
    out = Image.new('RGBA', (COLS * S, ROWS * S), (0, 0, 0, 0))
    base = sprite.copy()
    base.thumbnail((int(S * 0.72), int(S * 0.72)), Image.LANCZOS)
    for i in range(COLS * ROWS):
        c, r = i % COLS, i // COLS
        f = base.copy()
        if r in (0, 1):
            f = f.rotate(6 * np.sin(c / 6 * 2 * np.pi), resample=Image.BICUBIC)
            if r == 1:
                dark = Image.new('RGBA', f.size, (0, 0, 0, 0))
                dark.paste((60, 60, 90, 255), (0, 0) + f.size)
                f = Image.blend(f, dark, 0.25)
                f.putalpha(base.rotate(6 * np.sin(c / 6 * 2 * np.pi), resample=Image.BICUBIC).split()[3])
        elif r == 2 and c in (2, 3):
            f = f.resize((f.width, int(f.height * (0.72 if c == 2 else 0.68))), Image.LANCZOS)
        elif r == 3 and c >= 2:
            f = f.rotate(-90 * (c - 2), resample=Image.BICUBIC, expand=True)
        elif r == 3:
            f = f.resize((int(f.width * 1.08), int(f.height * (1.12 if c == 0 else 1.0))), Image.LANCZOS)
        x = c * S + (S - f.width) // 2
        y = r * S + int(S * (1 - FOOT)) - f.height
        out.paste(f, (x, y), f)
        ImageDraw.Draw(out).text((c * S + 12, r * S + 8), str(i + 1), fill=(200, 40, 40, 255), font=font)
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--demo', action='store_true')
    a = ap.parse_args()
    ids = animal_ids()
    if a.demo:
        os.makedirs(DEMO, exist_ok=True)
        total = 0
        for animal_id in ids:
            packed, _ = pack(demo_sheet(animal_id))
            total += save(packed, os.path.join(DEMO, f'{animal_id}.png'))
        print(f'示意拼图 {len(ids)} 张 → {DEMO}，共 {total // 1024} KB（只用来验证播放，不要上传）')
        return
    os.makedirs(OUT, exist_ok=True)
    tops = {}
    total = 0
    for animal_id in ids:
        path = os.path.join(RAW, f'{animal_id}.png')
        if not os.path.exists(path):
            print('  跳过（还没有原图）', animal_id)
            continue
        packed, top = pack(Image.open(path).convert('RGBA'))
        size = save(packed, os.path.join(OUT, f'{animal_id}.png'))
        total += size
        tops[animal_id] = top
        print(f'  {animal_id}: {COLS * CELL}×{ROWS * CELL}，{size // 1024} KB，头顶空白 {top}')
    if tops:
        write_tops(tops)
        print(f'共 {len(tops)} 张 {total // 1024} KB → {OUT}；已回写 utils/anim-sheets.js 的 top。接着 npm run wx:art')
    else:
        print('art/raw/anim/ 里还没有拼图')


if __name__ == '__main__':
    main()
