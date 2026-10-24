"""暖暖锅的三种状态（今天打了几顿，锅里就有几层）：裁给 Codex、合成贴图、画占位图

    python3 scripts/camp/pot_art.py --crop [art/raw/camp/camp-hd.png]   # 从高清营地图裁出锅那块（shared/camp.js 的 SCENE.pot.box）→ art/raw/pot/in.png
    python3 scripts/camp/pot_art.py [--local]                           # 比对 in.png 和 out-1/2/3.png，只留画了内容的像素（羽化）→ art/pot/p1.png～p3.png
                                                                        #   加 --local 再写一份 1/4 大小到 miniprogram/images/camp/pot/（替换占位）
    python3 scripts/camp/pot_art.py --placeholder                       # 没有正式图时，画三张占位到 miniprogram/images/camp/pot/

Codex 在 in.png 上画：out-1 一层粥底、out-2 加了菜、out-3 满满一锅冒热气；锅以外的像素不动。页面把 pN.png 叠在底图的锅上（camp-view.potView）。需要 Pillow 和 numpy。
"""
import argparse
import json
import os
import subprocess

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

REPO = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..'))
RAW = os.path.join(REPO, 'art', 'raw', 'pot')
OUT = os.path.join(REPO, 'art', 'pot')
LOCAL = os.path.join(REPO, 'miniprogram', 'images', 'camp', 'pot')
DIFF_MIN = 40
LOCAL_SCALE = 0.25


def scene():
    js = "const C=require('./cloudfunctions/api/lib/shared/camp');console.log(JSON.stringify({W:C.W,box:C.SCENE.pot.box,fire:C.SCENE.fire}))"
    return json.loads(subprocess.check_output(['node', '-e', js], cwd=REPO))


def crop(image):
    S = scene()
    img = Image.open(image).convert('RGB')
    k = img.width / S['W']
    l, t, r, b = S['box']
    os.makedirs(RAW, exist_ok=True)
    img.crop((round(l * k), round(t * k), round(r * k), round(b * k))).save(os.path.join(RAW, 'in.png'))
    json.dump({'k': k, 'box': S['box']}, open(os.path.join(RAW, 'box.json'), 'w'))
    print(f'锅那块 → {RAW}/in.png；Codex 画三版 out-1.png / out-2.png / out-3.png，然后 python3 scripts/camp/pot_art.py')


def patch(local):
    inp = Image.open(os.path.join(RAW, 'in.png')).convert('RGB')
    os.makedirs(OUT, exist_ok=True)
    done = 0
    for n in (1, 2, 3):
        path = os.path.join(RAW, f'out-{n}.png')
        if not os.path.exists(path):
            print(f'  ·  还没有 out-{n}.png')
            continue
        out = Image.open(path).convert('RGB').resize(inp.size, Image.LANCZOS)
        diff = np.abs(np.array(out).astype(int) - np.array(inp).astype(int)).sum(axis=2) > DIFF_MIN
        mask = Image.fromarray((diff * 255).astype(np.uint8)).filter(ImageFilter.MinFilter(3)).filter(ImageFilter.MaxFilter(15)).filter(ImageFilter.GaussianBlur(4))
        rgba = out.convert('RGBA')
        rgba.putalpha(mask)
        rgba.save(os.path.join(OUT, f'p{n}.png'), optimize=True)
        if local:
            os.makedirs(LOCAL, exist_ok=True)
            small = rgba.resize((max(1, round(rgba.width * LOCAL_SCALE)), max(1, round(rgba.height * LOCAL_SCALE))), Image.LANCZOS)
            small.save(os.path.join(LOCAL, f'p{n}.png'), optimize=True)
        done += 1
        print(f'  ✓  p{n}.png  {rgba.width}×{rgba.height}')
    print(f'{done} 张 → {OUT}；接着 npm run wx:art，把前缀填进 miniprogram/config.js 的 potArt')


def placeholder():
    """占位：按 blockout.py 里锅的位置画锅里的内容（锅口在块里的位置和白模一致）"""
    S = scene()
    l, t, r, b = S['box']
    k = LOCAL_SCALE
    w, h = round((r - l) * k), round((b - t) * k)
    fx, fy = S['fire']
    rim = ((fx - l) * k, (fy - 348 - t) * k, 280 * k, 90 * k)   # 和 blockout.py 的锅口一致：中心、半径
    try:
        font = ImageFont.truetype('/usr/share/fonts/truetype/wqy/wqy-microhei.ttc', 14)
    except OSError:
        font = ImageFont.load_default()
    os.makedirs(LOCAL, exist_ok=True)
    for n in (1, 2, 3):
        img = Image.new('RGBA', (w, h), (0, 0, 0, 0))
        d = ImageDraw.Draw(img)
        cx, cy, rx, ry = rim
        d.ellipse([cx - rx * 0.86, cy - ry * 0.86, cx + rx * 0.86, cy + ry * 0.86], fill=(246, 222, 160, 255))
        if n >= 2:
            for dx, dy in [(-30, -4), (-5, 6), (25, -6), (40, 4), (-45, 6)]:
                d.ellipse([cx + dx - 7, cy + dy - 5, cx + dx + 7, cy + dy + 5], fill=(120, 170, 90, 255))
        if n >= 3:
            for dx, dy in [(-20, 4), (10, -6), (30, 6)]:
                d.ellipse([cx + dx - 8, cy + dy - 6, cx + dx + 8, cy + dy + 6], fill=(230, 130, 70, 255))
            for i, (dx, dy, rr) in enumerate([(-30, -40, 14), (10, -58, 18), (40, -36, 12)]):
                d.ellipse([cx + dx - rr, cy + dy - rr, cx + dx + rr, cy + dy + rr], fill=(255, 255, 255, 110))
        d.text((cx - 22, cy - 9), '早午晚'[:n], fill=(80, 50, 20, 255), font=font)
        img.save(os.path.join(LOCAL, f'p{n}.png'), optimize=True)
    print(f'占位 p1～p3 → {LOCAL}（{w}×{h}）')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('image', nargs='?', default=os.path.join(REPO, 'art', 'raw', 'camp', 'camp-hd.png'))
    ap.add_argument('--crop', action='store_true')
    ap.add_argument('--local', action='store_true')
    ap.add_argument('--placeholder', action='store_true')
    a = ap.parse_args()
    if a.placeholder:
        placeholder()
    elif a.crop:
        crop(a.image)
    else:
        patch(a.local)


if __name__ == '__main__':
    main()
