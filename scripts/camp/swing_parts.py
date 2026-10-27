"""秋千拆成两层：架子不动，座位 + 绳子那层绕横梁摆（小动物坐上去跟着一起摆）

    python3 scripts/camp/swing_parts.py [--preview 目录]

读 art/decor/swing.png、gold_swing.png（decor_patch.py / gold_variant.py 出的高清块），按 SEAT 多边形（块里的比例，照 swing.png 量的：
两根绳子从结下面开始、到座位底）把座位那层抠出来（只要秋千本身，座位下面的影子留在架子那层），写
    art/decor/<id>-frame.png   架子（座位那块挖空）
    art/decor/<id>-seat.png    座位 + 绳子（和块一样大，摆的轴 PIVOT）
和 miniprogram/utils/decor-parts.js（哪几件有座位那层、轴在哪）。接着 ART_VERSION.decor 加一、npm run wx:art -- decor。
金色秋千是从秋千调色的，形状一样，用同一个多边形；以后 Codex 画了不一样的金色秋千要重新量。需要 Pillow 和 numpy。
"""
import argparse
import json
import os

import numpy as np
from PIL import Image, ImageDraw

REPO = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..'))
OUT = os.path.join(REPO, 'art', 'decor')
PARTS = os.path.join(REPO, 'miniprogram', 'utils', 'decor-parts.js')
IDS = ['swing', 'gold_swing']
# 量的时候块是 1156×933（swing.png）：绳子上沿贴着横梁下沿（两个结留在架子上）、座位四角、座位右端不碰到右边的柱子
W0, H0 = 1156, 933
SEAT = [(406, 268), (726, 316), (726, 594), (750, 596), (750, 642), (692, 684), (394, 618), (376, 584), (376, 554), (406, 546)]
PIVOT = (566, 246)  # 两个结中间、横梁的中线


def split(img):
    a = np.asarray(img.convert('RGBA')).astype(np.uint8)
    poly = Image.new('L', img.size, 0)
    sx, sy = img.width / W0, img.height / H0
    ImageDraw.Draw(poly).polygon([(x * sx, y * sy) for x, y in SEAT], fill=255)
    inside = np.asarray(poly) > 0
    # 只要秋千本身：影子是黑的（decor_patch 出的影子颜色是 0），亮一点的才是木头和绳子
    body = inside & (a[..., :3].max(axis=2) > 30) & (a[..., 3] > 0)
    seat = a.copy()
    seat[~body, 3] = 0
    frame = a.copy()
    frame[body, 3] = 0
    return Image.fromarray(frame, 'RGBA'), Image.fromarray(seat, 'RGBA')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--preview', default=None)
    a = ap.parse_args()
    parts = {}
    for decor_id in IDS:
        src = os.path.join(OUT, f'{decor_id}.png')
        if not os.path.exists(src):
            print(f'  ·  {decor_id}  还没有 {src}')
            continue
        img = Image.open(src)
        frame, seat = split(img)
        frame.save(os.path.join(OUT, f'{decor_id}-frame.png'), optimize=True)
        seat.save(os.path.join(OUT, f'{decor_id}-seat.png'), optimize=True)
        parts[decor_id] = {'pivot': [round(PIVOT[0] / W0, 4), round(PIVOT[1] / H0, 4)]}
        print(f'  ✓  {decor_id}  → {decor_id}-frame.png + {decor_id}-seat.png')
        if a.preview:
            os.makedirs(a.preview, exist_ok=True)
            sheet = Image.new('RGBA', (img.width * 3, img.height), (120, 170, 60, 255))
            for i, layer in enumerate([img, frame, seat]):
                sheet.alpha_composite(layer.convert('RGBA'), (i * img.width, 0))
            ImageDraw.Draw(sheet).ellipse([img.width * 2 + PIVOT[0] * img.width / W0 - 8, PIVOT[1] * img.height / H0 - 8,
                                           img.width * 2 + PIVOT[0] * img.width / W0 + 8, PIVOT[1] * img.height / H0 + 8], fill=(255, 0, 0, 255))
            sheet.convert('RGB').save(os.path.join(a.preview, f'{decor_id}-parts.jpg'), quality=85)
    lines = [
        '// 拆成两层的装饰（scripts/camp/swing_parts.py 回写）：云端高清块里有 <id>-frame.png（不动的架子）和 <id>-seat.png（座位那层），',
        '// pivot 是座位那层摆的轴（块里的比例）。只有用云端高清块时才拆；包里的小图还是一整张',
        f'module.exports = {json.dumps(parts)}',
    ]
    open(PARTS, 'w', encoding='utf-8').write('\n'.join(lines) + '\n')
    print(f'→ utils/decor-parts.js：{", ".join(parts) or "（没有）"}。接着 ART_VERSION.decor 加一、npm run wx:art -- decor')


if __name__ == '__main__':
    main()
