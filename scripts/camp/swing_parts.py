"""会动的家具拆成两层：架子不动，会摆的那层（秋千的座位 + 绳子、吊床的布）绕轴摆，小动物在上面跟着一起摆

    python3 scripts/camp/swing_parts.py [--preview 目录]

读 art/decor/<id>.png（decor_patch.py / gold_variant.py 出的高清块），按 PARTS 里每件的多边形（块里的像素，照 W0×H0 的块量的）
把会摆的那层抠出来（只要家具本身，下面的影子留在架子那层），写
    art/decor/<id>-frame.png   架子（会摆的那块挖空）
    art/decor/<id>-seat.png    会摆的那层（和块一样大，绕 pivot 摆）
和 miniprogram/utils/decor-parts.js（哪几件拆了、轴在哪、怎么摆：swing 秋千荡、rock 吊床轻轻晃）。
接着 ART_VERSION.decor 加一、npm run wx:art -- decor。
金色秋千是从秋千调色的，形状一样，用同一个多边形；以后 Codex 画了不一样的金色秋千、或者家具换了图，要重新量。需要 Pillow 和 numpy。
"""
import argparse
import json
import os

import numpy as np
from PIL import Image, ImageDraw

REPO = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..'))
OUT = os.path.join(REPO, 'art', 'decor')
PARTS_JS = os.path.join(REPO, 'miniprogram', 'utils', 'decor-parts.js')
W0, H0 = 1156, 933  # 量的时候块的大小（大号块的高清图）
# 秋千：绳子上沿贴着横梁下沿（两个结留在架子上）、座位四角、座位右端不碰到右边的柱子；轴在两个结中间、横梁的中线
SWING = {'poly': [(406, 268), (726, 316), (726, 594), (750, 596), (750, 642), (692, 684), (394, 618), (376, 584), (376, 554), (406, 546)],
         'pivot': (566, 246), 'kind': 'swing'}
# 吊床：两头的结和柱子留在架子上，中间的布摆；轴在两个结中间
HAMMOCK = {'poly': [(292, 490), (864, 520), (864, 600), (832, 692), (650, 778), (470, 772), (330, 705), (292, 610)],
           'pivot': (582, 528), 'kind': 'rock'}
PARTS = {'swing': SWING, 'gold_swing': SWING, 'hammock': HAMMOCK}


def split(img, poly_px):
    a = np.asarray(img.convert('RGBA')).astype(np.uint8)
    poly = Image.new('L', img.size, 0)
    sx, sy = img.width / W0, img.height / H0
    ImageDraw.Draw(poly).polygon([(x * sx, y * sy) for x, y in poly_px], fill=255)
    inside = np.asarray(poly) > 0
    # 只要家具本身：影子是黑的（decor_patch 出的影子颜色是 0），亮一点的才是木头、绳子、布
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
    out = {}
    for decor_id, part in PARTS.items():
        src = os.path.join(OUT, f'{decor_id}.png')
        if not os.path.exists(src):
            print(f'  ·  {decor_id}  还没有 {src}')
            continue
        img = Image.open(src)
        frame, seat = split(img, part['poly'])
        frame.save(os.path.join(OUT, f'{decor_id}-frame.png'), optimize=True)
        seat.save(os.path.join(OUT, f'{decor_id}-seat.png'), optimize=True)
        px, py = part['pivot']
        out[decor_id] = {'pivot': [round(px / W0, 4), round(py / H0, 4)], 'kind': part['kind']}
        print(f'  ✓  {decor_id}  → {decor_id}-frame.png + {decor_id}-seat.png（{part["kind"]}）')
        if a.preview:
            os.makedirs(a.preview, exist_ok=True)
            sheet = Image.new('RGBA', (img.width * 3, img.height), (120, 170, 60, 255))
            for i, layer in enumerate([img, frame, seat]):
                sheet.alpha_composite(layer.convert('RGBA'), (i * img.width, 0))
            cx, cy = img.width * 2 + px * img.width / W0, py * img.height / H0
            ImageDraw.Draw(sheet).ellipse([cx - 8, cy - 8, cx + 8, cy + 8], fill=(255, 0, 0, 255))
            sheet.convert('RGB').save(os.path.join(a.preview, f'{decor_id}-parts.jpg'), quality=85)
    lines = [
        '// 拆成两层的装饰（scripts/camp/swing_parts.py 回写）：云端高清块里有 <id>-frame.png（不动的架子）和 <id>-seat.png（会摆的那层），',
        '// pivot 是会摆的那层的轴（块里的比例），kind 是怎么摆（swing 秋千荡、rock 吊床轻轻晃，camp.wxss 的 sway-on / rock-on）。',
        '// 只有用云端高清块时才拆；包里的小图还是一整张',
        f'module.exports = {json.dumps(out)}',
    ]
    open(PARTS_JS, 'w', encoding='utf-8').write('\n'.join(lines) + '\n')
    print(f'→ utils/decor-parts.js：{", ".join(out) or "（没有）"}。接着 ART_VERSION.decor 加一、npm run wx:art -- decor')


if __name__ == '__main__':
    main()
