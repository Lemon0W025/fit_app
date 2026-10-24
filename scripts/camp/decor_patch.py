"""装饰「原地重绘」的第二步：比对 in / out，把装饰连一圈草地裁成块，边缘羽化，落脚点对准 anchor

    python3 scripts/camp/decor_patch.py [--ids tent,ball] [--local]

读 art/raw/decor/in-<id>.png、out-<id>.png 和 boxes.json。装饰在哪：out 和 in 不一样的地方；裁的块大小 = shared/decor.js 的 patch，
块里的 anchor 对准装饰的底边中点。输出 art/decor/<id>.png（高清块，npm run wx:art 传到 camp/decor/）；
加 --local 再写一份 1/4 大小到 miniprogram/images/camp/decor/（替换占位块，注意包大小）。需要 Pillow 和 numpy。
"""
import argparse
import json
import os
import subprocess

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

REPO = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..'))
RAW = os.path.join(REPO, 'art', 'raw', 'decor')
OUT = os.path.join(REPO, 'art', 'decor')
LOCAL = os.path.join(REPO, 'miniprogram', 'images', 'camp', 'decor')
DIFF_MIN = 40      # 三通道差之和超过这个算「画了东西」
FEATHER = 24       # 羽化宽度（画的像素）
LOCAL_SCALE = 0.25


def decor_table():
    js = "const D=require('./cloudfunctions/api/lib/shared/decor');console.log(JSON.stringify(D.DECOR))"
    return {d['id']: d for d in json.loads(subprocess.check_output(['node', '-e', js], cwd=REPO))}


def diff_box(a, b):
    """out 和 in 不一样的像素的外框（去掉零星噪点）"""
    d = np.abs(a.astype(int) - b.astype(int)).sum(axis=2) > DIFF_MIN
    mask = Image.fromarray((d * 255).astype(np.uint8)).filter(ImageFilter.MinFilter(3)).filter(ImageFilter.MaxFilter(7))
    ys, xs = np.nonzero(np.array(mask) > 0)
    if not len(ys):
        return None
    return xs.min(), ys.min(), xs.max() + 1, ys.max() + 1


def feather_alpha(w, h, inner_margin, feather):
    mask = Image.new('L', (w, h), 0)
    ImageDraw.Draw(mask).rounded_rectangle([inner_margin, inner_margin, w - 1 - inner_margin, h - 1 - inner_margin], radius=feather, fill=255)
    return mask.filter(ImageFilter.GaussianBlur(feather / 2))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--ids', default='')
    ap.add_argument('--local', action='store_true')
    a = ap.parse_args()
    table = decor_table()
    boxes = json.load(open(os.path.join(RAW, 'boxes.json')))
    want = set(a.ids.split(',')) if a.ids else None
    os.makedirs(OUT, exist_ok=True)
    done = 0
    for decor_id, meta in boxes.items():
        if want and decor_id not in want:
            continue
        src = os.path.join(RAW, f'in-{decor_id}.png')
        dst = os.path.join(RAW, f'out-{decor_id}.png')
        if not os.path.exists(dst):
            print(f'  ·  {decor_id}  还没有 out-{decor_id}.png')
            continue
        d = table[decor_id]
        k = meta['k']
        inp = Image.open(src).convert('RGB')
        out = Image.open(dst).convert('RGB').resize(inp.size, Image.LANCZOS)
        box = diff_box(np.array(out), np.array(inp))
        if not box:
            print(f'  ✗  {decor_id}  out 和 in 看不出区别')
            continue
        # 装饰底边中点 = 落脚点；块按 patch 大小裁，anchor 对准它
        x0, y0, x1, y1 = box
        foot_x = (x0 + x1) / 2
        foot_y = y1
        pw, ph = d['patch']['w'] * k, d['patch']['h'] * k
        left = foot_x - d['anchor']['x'] * k
        top = foot_y - d['anchor']['y'] * k
        # 装饰比块还大就按装饰放大块（页面按 patch 比例缩放，所以这里保持 patch 的宽高比）
        need = max((x1 - x0) / pw, (y1 - y0 + 0.1 * ph) / ph, 1)
        if need > 1:
            pw, ph = pw * need, ph * need
            left = foot_x - d['anchor']['x'] * k * need
            top = foot_y - d['anchor']['y'] * k * need
        crop = out.crop((round(left), round(top), round(left + pw), round(top + ph)))
        patch = Image.new('RGB', crop.size, (0, 0, 0))
        patch.paste(crop, (0, 0))
        patch = patch.convert('RGBA')
        patch.putalpha(feather_alpha(crop.width, crop.height, round(FEATHER * k * 0.3), round(FEATHER * k)))
        patch.save(os.path.join(OUT, f'{decor_id}.png'), optimize=True)
        if a.local:
            os.makedirs(LOCAL, exist_ok=True)
            small = patch.resize((max(1, round(patch.width * LOCAL_SCALE / k)), max(1, round(patch.height * LOCAL_SCALE / k))), Image.LANCZOS)
            small.save(os.path.join(LOCAL, f'{decor_id}.png'), optimize=True)
        done += 1
        print(f'  ✓  {decor_id}  {crop.width}×{crop.height}' + ('（装饰比块大，块按比例放大了）' if need > 1 else ''))
    print(f'{done} 块 → {OUT}；接着 npm run wx:art，把前缀填进 miniprogram/config.js 的 decorArt')


if __name__ == '__main__':
    main()
