"""把 Codex 出的宠物动画拼图（每只两张 6×6，见 docs/art/camp-art-pack.md）对齐、统一尺寸、压小，给小程序用

    python3 scripts/pack_anim.py              # art/raw/anim/<id>-a.png、<id>-b.png → art/anim/<id>-a.png、<id>-b.png，并回写 utils/anim-sheets.js
                                              # 有 <id>-c.png（正面 / 背影，第 3.5 节）的一起打包，anim-sheets.js 里记 c: true
    python3 scripts/pack_anim.py --demo       # 没有正式图时，用占位单张图合成示意拼图到 art/anim-demo/（只用来验证播放）

对齐：上下按行（一个动作的 6 帧一起平移，让这行的脚底平均落在格底往上 10% 处），不把模型画的步幅起伏、跳起来抹掉；
左右按帧（每帧的身体重心放在格子正中）：模型画的 6 格常常越画越偏（一行里漂 10～18 像素），按行对齐的话每转一圈宠物就往回跳一下，
看着一抽一抽的；在地上走、跳的位移都是页面在挪，拼图里本来就该原地。输出每格 CELL px、6×6 格、256 色 PNG，传云存储（npm run wx:art）。
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
OPTIONAL = ['c']   # C 张：背影走、正面走、背对着站 / 吃 / 坐、正面站着；没有就只用 A、B 张的侧面
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
        a = np.array(cell)[:, :, 3].astype(float)
        a[a < ALPHA_MIN] = 0
        cx = float((a.sum(0) * np.arange(a.shape[1])).sum() / a.sum()) if a.sum() else None
        cells.append((cell, bbox(a > 0), cx))
    out = Image.new('RGBA', (COLS * CELL, ROWS * CELL), (0, 0, 0, 0))
    for group in GROUPS:
        boxes = [cells[i][1] for i in group if cells[i][1]]
        if not boxes:
            continue
        bottom = np.mean([b[3] for b in boxes])
        dy = ch * (1 - FOOT) - bottom
        for i in group:
            cell, b, cx = cells[i]
            if not b:
                continue
            c, r = i % COLS, i // COLS
            moved = Image.new('RGBA', cell.size, (0, 0, 0, 0))
            moved.paste(cell, (round(cw / 2 - cx), round(dy)))
            out.paste(moved.resize((CELL, CELL), Image.LANCZOS), (c * CELL, r * CELL))
    return out


def height_of(packed, rows):
    """这几行每帧身体（不透明部分）的高度，取中位数（格高的比例）"""
    hs = []
    for r in rows:
        for c in range(COLS):
            b = bbox(np.array(packed.crop((c * CELL, r * CELL, (c + 1) * CELL, (r + 1) * CELL)))[:, :, 3] >= ALPHA_MIN)
            if b:
                hs.append((b[3] - b[1]) / CELL)
    return float(np.median(hs)) if hs else 0


# C 张每行对着 A 张哪一行比个头：背影走 / 正面走 ↔ 走，背对站 / 背对坐 / 正面站 ↔ 坐着待机，背对吃 ↔ 吃
C_PAIRS = {0: 0, 1: 0, 2: 1, 3: 4, 4: 1, 5: 1}
ROW_SPREAD = 1.15   # 每行在整张的缩放上最多再大 / 小这么多（坐、趴本来就矮一点，别硬拉）


def match_size(packed_c, packed_a):
    """C 张按 A 张的个头缩放。模型画正面 / 背影常常画大一圈（或者某几行画大），不缩的话一转身就忽大忽小。
    整张先按「背对着站 / 正面站着（第 3、6 行）对 A 张坐着待机（第 2 行）」定一个倍数，
    每行再往它对应的那行 A 张（见 C_PAIRS，走路最要紧：侧面、背影、正面一直在换）靠，最多偏 ROW_SPREAD。
    以脚底中点为圆心缩放，脚还在同一条线上；返回 (缩好的图, 整张的倍数, 每行的倍数)"""
    target, now = height_of(packed_a, [1]), height_of(packed_c, [2, 5])
    k = target / now if target and now else 1.0
    rows = []
    for r in range(ROWS):
        want, have = height_of(packed_a, [C_PAIRS[r]]), height_of(packed_c, [r])
        rk = want / have if want and have else k
        rows.append(min(k * ROW_SPREAD, max(k / ROW_SPREAD, rk)))
    if all(abs(rk - 1) < 0.03 for rk in rows):
        return packed_c, 1.0, [1.0] * ROWS
    out = Image.new('RGBA', packed_c.size, (0, 0, 0, 0))
    foot = CELL * (1 - FOOT)
    for r in range(ROWS):
        size = max(1, round(CELL * rows[r]))
        for c in range(COLS):
            cell = packed_c.crop((c * CELL, r * CELL, (c + 1) * CELL, (r + 1) * CELL)).resize((size, size), Image.LANCZOS)
            out.alpha_composite(cell, (c * CELL + round(CELL / 2 - size / 2), r * CELL + round(foot - foot * rows[r])))
    return out, k, rows


def top_of(packed_a):
    """头顶空白：按 A 张第 2 行（坐着待机）第一格量"""
    idle = bbox(np.array(packed_a.crop((0, CELL, CELL, 2 * CELL)))[:, :, 3] >= ALPHA_MIN)
    return round(float(idle[1] / CELL), 2) if idle else 0.1


def save(img, path):
    a = np.array(img)
    a[:, :, 3][a[:, :, 3] < ALPHA_MIN] = 0
    Image.fromarray(a).quantize(colors=256, method=Image.Quantize.FASTOCTREE).save(path, optimize=True)
    return os.path.getsize(path)


def write_sheets(tops, with_c=()):
    """anim-sheets.js 整个重写：只列有拼图的宠物"""
    lines = ['// 有逐帧拼图的宠物（拼图在云存储 config.animArt 下，<id>-a.png / <id>-b.png；scripts/pack_anim.py 打包时回写）',
             '// top：待机帧头顶上空白占格高的比例（定气泡的高度）；c：有 <id>-c.png（正面 / 背影）。没列到的宠物页面用单张图 + CSS 步态',
             'module.exports = {']
    for pet_id, top in tops.items():
        extra = ', c: true' if pet_id in with_c else ''
        lines.append(f'  {pet_id}: {{ top: {top}{extra} }},')
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
            for sheet in SHEETS + OPTIONAL:
                total += save(pack(demo_sheet(pet_id, sheet)), os.path.join(DEMO, f'{pet_id}-{sheet}.png'))
        print(f'示意拼图 {len(ids) * 3} 张 → {DEMO}，共 {total // 1024} KB（只用来验证播放，不要上传）')
        return
    os.makedirs(OUT, exist_ok=True)
    tops = {}
    with_c = set()
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
        for sheet in OPTIONAL:
            path = os.path.join(RAW, f'{pet_id}-{sheet}.png')
            if os.path.exists(path):
                packed_c, k, rows = match_size(pack(Image.open(path).convert('RGBA')), packed[0])
                if k != 1.0:
                    print(f'  {pet_id}-{sheet}: 比 A 张{"大" if k < 1 else "小"}，整张缩放 {k:.2f}，每行 ' + ' '.join(f'{x:.2f}' for x in rows))
                total += save(packed_c, os.path.join(OUT, f'{pet_id}-{sheet}.png'))
                with_c.add(pet_id)
        print(f'  {pet_id}: {2 + (pet_id in with_c)} 张 {COLS * CELL}×{ROWS * CELL}，头顶空白 {tops[pet_id]}')
    if tops:
        write_sheets(tops, with_c)
        print(f'共 {len(tops)} 只 {total // 1024} KB → {OUT}；已重写 utils/anim-sheets.js。接着 npm run wx:art')
    else:
        print('art/raw/anim/ 里还没有拼图')


if __name__ == '__main__':
    main()
