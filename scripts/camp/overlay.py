"""在 Codex 画好的营地图上画格子和当前的 SCENE，用来照着画量场景数据、量完核对

    python3 scripts/camp/overlay.py art/raw/camp/camp.png [--grid 256] [--no-scene] [-o art/raw/camp/camp-overlay.jpg]

格子按画的像素坐标（shared/camp.js 的 W×H 尺度）标数字，不管原图多大都换算成 4096 的尺度；
--no-scene 只画格子（量之前），默认再把 SCENE 的草地、禁区、篝火、坐点、食盆、入口、树荫、抠图块画上去（量完核对）。需要 Pillow。
"""
import argparse
import json
import os
import subprocess

from PIL import Image, ImageDraw, ImageFont

REPO = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..'))


def scene():
    js = "const C=require('./cloudfunctions/api/lib/shared/camp');console.log(JSON.stringify({W:C.W,H:C.H,S:C.SCENE}))"
    return json.loads(subprocess.check_output(['node', '-e', js], cwd=REPO))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('image')
    ap.add_argument('--grid', type=int, default=256)
    ap.add_argument('--no-scene', action='store_true')
    ap.add_argument('-o', '--out', default=None)
    a = ap.parse_args()
    D = scene()
    img = Image.open(a.image).convert('RGB')
    k = img.width / D['W']
    d = ImageDraw.Draw(img, 'RGBA')
    try:
        font = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', max(12, int(img.width / 90)))
    except OSError:
        font = ImageFont.load_default()
    P = lambda pts: [(x * k, y * k) for x, y in pts]
    for v in range(0, D['W'] + 1, a.grid):
        d.line([(v * k, 0), (v * k, img.height)], fill=(255, 255, 255, 110), width=1)
        d.text((v * k + 3, 3), str(v), fill=(255, 255, 0), font=font)
    for v in range(0, D['H'] + 1, a.grid):
        d.line([(0, v * k), (img.width, v * k)], fill=(255, 255, 255, 110), width=1)
        d.text((3, v * k + 3), str(v), fill=(255, 255, 0), font=font)
    if not a.no_scene:
        S = D['S']
        d.polygon(P(S['grass']), outline=(255, 255, 255, 230), width=3)
        for name, poly in S['nogo'].items():
            d.polygon(P(poly), outline=(255, 60, 60, 230), width=3)
            d.text((poly[0][0] * k, poly[0][1] * k - 16), name, fill=(255, 60, 60), font=font)
        for key, c in S['cutouts'].items():
            l, t, r, b = c['box']
            d.rectangle([l * k, t * k, r * k, b * k], outline=(80, 160, 255, 230), width=3)
            d.text((l * k + 4, t * k + 4), f'cutout {key} zy={c["zy"]}', fill=(80, 160, 255), font=font)
        dot = lambda x, y, fill, r=6: d.ellipse([x * k - r, y * k - r, x * k + r, y * k + r], fill=fill)
        for x, y in S['seats']:
            dot(x, y, (255, 255, 255, 240))
        for x, y in S['bowls']:
            dot(x, y, (255, 200, 0, 240), 10)
        for x, y in S['entries']:
            dot(x, y, (0, 200, 255, 240), 8)
        for x, y in S['shade'] + S['tent']['spots'] + S['sun']:
            dot(x, y, (40, 40, 40, 240))
        dot(S['fire'][0], S['fire'][1], (255, 80, 0, 240), 10)
    out = a.out or os.path.splitext(a.image)[0] + '-overlay.jpg'
    img.save(out, quality=90)
    print(f'→ {out}（格子每 {a.grid} 像素，按 {D["W"]} 尺度）')


if __name__ == '__main__':
    main()
