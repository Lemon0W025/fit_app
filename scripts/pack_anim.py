"""把 Codex 出的宠物动画拼图（每只两张 6×6，见 docs/art/camp-art-pack.md）对齐、统一尺寸、压小，给小程序用

    python3 scripts/pack_anim.py              # art/raw/anim/<id>-a.png、<id>-b.png → art/anim/<id>-a.png、<id>-b.png，并回写 utils/anim-sheets.js
    python3 scripts/pack_anim.py --demo       # 没有正式图时，用占位单张图合成示意拼图到 art/anim-demo/（只用来验证播放）

对齐：同一行（一个动作的 6 帧）一起平移，让这行的脚底平均落在格底往上 10% 处、水平居中——
按行而不是按帧对齐，才不会把模型画的步幅起伏抹掉。输出每格 CELL px、6×6 格、256 色 PNG，传云存储（npm run wx:art）。
需要 Pillow 和 numpy。
"""
import argparse
import json
import os
import subprocess

import numpy as np
from PIL import Image, ImageDraw, ImageFont

REPO = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
RAW = os.path.join(REPO, 'art', 'raw', 'anim')
OUT = os.path.join(REPO, 'art', 'anim')
DEMO = os.path.join(REPO, 'art', 'anim-demo')
SHEETS_JS = os.path.join(REPO, 'miniprogram', 'utils', 'anim-sheets.js')
COLS, ROWS = 6, 6
CELL = 192
FOOT = 0.10        # 脚底离格底的距离（格高比例）
ALPHA_MIN = 8
SHEETS = ['a', 'b']
GROUPS = [list(range(r * COLS, (r + 1) * COLS)) for r in range(ROWS)]


def pet_ids():
    js = "console.log(JSON.stringify(require('./cloudfunctions/api/lib/shared/pets').PETS.map((p) => p.id)))"
    return json.loads(subprocess.check_output(['node', '-e', js], cwd=REPO))


def bbox(a):
    ys, xs = np.nonzero(a)
    if not len(ys):
        return None
    return xs.min(), ys.min(), xs.max() + 1, ys.max() + 1


def pack(src):
    """6×6 原图 → 对齐好的 CELL 格拼图"""
    cw, ch = src.width / COLS, src.height / ROWS
    cells = []
    for i in range(COLS * ROWS):
        c, r = i % COLS, i // COLS
        box = (round(c * cw), round(r * ch), round((c + 1) * cw), round((r + 1) * ch))
        cell = src.crop(box)
        cells.append((cell, bbox(np.array(cell)[:, :, 3] >= ALPHA_MIN)))
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
            out.paste(moved.resize((CELL, CELL), Image.LANCZOS), (c * CELL, r * CELL))
    return out


def top_of(packed_a):
    """头顶空白：按 A 张第 2 行（坐着待机）第一格量"""
    idle = bbox(np.array(packed_a.crop((0, CELL, CELL, 2 * CELL)))[:, :, 3] >= ALPHA_MIN)
    return round(float(idle[1] / CELL), 2) if idle else 0.1


def save(img, path):
    a = np.array(img)
    a[:, :, 3][a[:, :, 3] < ALPHA_MIN] = 0
    Image.fromarray(a).quantize(colors=256, method=Image.Quantize.FASTOCTREE).save(path, optimize=True)
    return os.path.getsize(path)


def write_sheets(tops):
    """anim-sheets.js 整个重写：只列有拼图的宠物"""
    lines = ['// 有逐帧拼图的宠物（拼图在云存储 config.animArt 下，<id>-a.png / <id>-b.png；scripts/pack_anim.py 打包时回写）',
             '// top：待机帧头顶上空白占格高的比例（定气泡的高度）。没列到的宠物页面用单张图 + CSS 步态',
             'module.exports = {']
    for pet_id, top in tops.items():
        lines.append(f'  {pet_id}: {{ top: {top} }},')
    lines.append('}')
    open(SHEETS_JS, 'w', encoding='utf-8').write('\n'.join(lines) + '\n')


def demo_sheet(pet_id, sheet):
    """用占位单张图合成 36 帧示意：走路左右摇、睡觉压扁、打滚转圈，每格标帧号"""
    sprite = Image.open(os.path.join(REPO, 'miniprogram', 'images', 'camp', 'pets', f'{pet_id}.png')).convert('RGBA')
    try:
        font = ImageFont.truetype('/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc', 26)
    except OSError:
        font = ImageFont.load_default()
    S = 256
    out = Image.new('RGBA', (COLS * S, ROWS * S), (0, 0, 0, 0))
    base = sprite.copy()
    base.thumbnail((int(S * 0.72), int(S * 0.72)), Image.LANCZOS)
    for i in range(COLS * ROWS):
        c, r = i % COLS, i // COLS
        f = base.copy()
        if sheet == 'a' and r == 0:
            f = f.rotate(6 * np.sin(c / 6 * 2 * np.pi), resample=Image.BICUBIC)
        elif sheet == 'a' and r in (2, 3):
            f = f.resize((f.width, int(f.height * 0.7)), Image.LANCZOS)
        elif sheet == 'b' and r == 1:
            f = f.rotate(-60 * c, resample=Image.BICUBIC, expand=True)
        elif sheet == 'b' and r == 4:
            f = f.resize((f.width, int(f.height * (1.15 if c % 2 else 1.0))), Image.LANCZOS)
        x = c * S + (S - f.width) // 2
        y = r * S + int(S * (1 - FOOT)) - f.height
        out.paste(f, (x, y), f)
        ImageDraw.Draw(out).text((c * S + 12, r * S + 8), str(i + 1), fill=(200, 40, 40, 255), font=font)
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--demo', action='store_true')
    a = ap.parse_args()
    ids = pet_ids()
    if a.demo:
        os.makedirs(DEMO, exist_ok=True)
        total = 0
        for pet_id in ids:
            for sheet in SHEETS:
                total += save(pack(demo_sheet(pet_id, sheet)), os.path.join(DEMO, f'{pet_id}-{sheet}.png'))
        print(f'示意拼图 {len(ids) * 2} 张 → {DEMO}，共 {total // 1024} KB（只用来验证播放，不要上传）')
        return
    os.makedirs(OUT, exist_ok=True)
    tops = {}
    total = 0
    for pet_id in ids:
        paths = [os.path.join(RAW, f'{pet_id}-{s}.png') for s in SHEETS]
        if not all(os.path.exists(p) for p in paths):
            print('  跳过（a、b 两张没出齐）', pet_id)
            continue
        packed = [pack(Image.open(p).convert('RGBA')) for p in paths]
        for sheet, img in zip(SHEETS, packed):
            total += save(img, os.path.join(OUT, f'{pet_id}-{sheet}.png'))
        tops[pet_id] = top_of(packed[0])
        print(f'  {pet_id}: 2 张 {COLS * CELL}×{ROWS * CELL}，头顶空白 {tops[pet_id]}')
    if tops:
        write_sheets(tops)
        print(f'共 {len(tops)} 只 {total // 1024} KB → {OUT}；已重写 utils/anim-sheets.js。接着 npm run wx:art')
    else:
        print('art/raw/anim/ 里还没有拼图')


if __name__ == '__main__':
    main()
