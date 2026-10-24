"""帐篷和暖暖锅的「抠图层」：从高清营地图里把它们抠成独立的透明图，盖在底图上，宠物走到后面就被挡住；锅还按今天打了几顿换图

    python3 scripts/camp/cutouts.py --crop [art/raw/camp/camp-hd.png]   # 裁出两块给 Codex：art/raw/cut/in-tent.png、in-pot.png（范围是 shared/camp.js 的 SCENE.cutouts）
    python3 scripts/camp/cutouts.py [--local]                           # 合成 art/cut/tent.png、pot-0.png～pot-3.png；--local 再写 1/4 小图到 miniprogram/images/camp/cut/
    加 --night：对夜景做同样的事（裁 art/raw/camp/night-hd.png → in-night-*.png；合成 night-tent.png、night-pot-N.png）

Codex 在裁出来的块上用 edit 画（其他像素不动）：
    out-tent-removed.png   把帐篷整个去掉，补成草地和后面的树林       → 和 in 比对得到帐篷的范围 → tent.png
    out-pot-removed.png    把锅和三脚架去掉，只留篝火石圈和草地         → 和 in 比对得到锅的范围 → pot-0.png（空锅，像素取自 in）
    out-pot-1/2/3.png      锅里一层粥底 / 加了菜 / 满锅冒热气           → 锅的范围 ∪ 画了内容的范围 → pot-1～3.png
需要 Pillow 和 numpy。
"""
import argparse
import json
import os
import subprocess

import numpy as np
from PIL import Image, ImageFilter

REPO = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..'))
RAW = os.path.join(REPO, 'art', 'raw', 'cut')
OUT = os.path.join(REPO, 'art', 'cut')
LOCAL = os.path.join(REPO, 'miniprogram', 'images', 'camp', 'cut')
DIFF_MIN = 40
LOCAL_SCALE = 0.25


def scene():
    js = "const C=require('./cloudfunctions/api/lib/shared/camp');console.log(JSON.stringify({W:C.W,cutouts:C.SCENE.cutouts}))"
    return json.loads(subprocess.check_output(['node', '-e', js], cwd=REPO))


def crop(image, pfx):
    S = scene()
    img = Image.open(image).convert('RGB')
    k = img.width / S['W']
    os.makedirs(RAW, exist_ok=True)
    for key, c in S['cutouts'].items():
        l, t, r, b = c['box']
        img.crop((round(l * k), round(t * k), round(r * k), round(b * k))).save(os.path.join(RAW, f'in-{pfx}{key}.png'))
    json.dump({'k': k, 'cutouts': S['cutouts']}, open(os.path.join(RAW, 'boxes.json'), 'w'), indent=1)
    print(f'裁好 → {RAW}/in-{pfx}tent.png、in-{pfx}pot.png；Codex 画 out-{pfx}*.png 后再跑 python3 scripts/camp/cutouts.py' + (' --night' if pfx else ''))


def mask_between(a, b):
    """两张图不一样的地方（去噪点、略扩、羽化）→ L 模式的 alpha"""
    d = np.abs(np.array(a).astype(int) - np.array(b).astype(int)).sum(axis=2) > DIFF_MIN
    return Image.fromarray((d * 255).astype(np.uint8)).filter(ImageFilter.MinFilter(3)).filter(ImageFilter.MaxFilter(15)).filter(ImageFilter.GaussianBlur(3))


def load(name, size=None):
    path = os.path.join(RAW, name)
    if not os.path.exists(path):
        return None
    img = Image.open(path).convert('RGB')
    return img.resize(size, Image.LANCZOS) if size and img.size != size else img


def emit(rgb, alpha, name, local):
    rgba = rgb.convert('RGBA')
    rgba.putalpha(alpha)
    rgba.save(os.path.join(OUT, name), optimize=True)
    if local:
        os.makedirs(LOCAL, exist_ok=True)
        rgba.resize((max(1, round(rgba.width * LOCAL_SCALE)), max(1, round(rgba.height * LOCAL_SCALE))), Image.LANCZOS).save(os.path.join(LOCAL, name), optimize=True)
    print(f'  ✓  {name}  {rgba.width}×{rgba.height}')


def build(local, pfx):
    os.makedirs(OUT, exist_ok=True)
    tent_in = load(f'in-{pfx}tent.png')
    tent_removed = load(f'out-{pfx}tent-removed.png', tent_in.size) if tent_in else None
    if tent_in and tent_removed:
        emit(tent_in, mask_between(tent_in, tent_removed), f'{pfx}tent.png', local)
    else:
        print(f'  ·  帐篷：还没有 in-{pfx}tent.png / out-{pfx}tent-removed.png')
    pot_in = load(f'in-{pfx}pot.png')
    pot_removed = load(f'out-{pfx}pot-removed.png', pot_in.size) if pot_in else None
    if not (pot_in and pot_removed):
        print(f'  ·  锅：还没有 in-{pfx}pot.png / out-{pfx}pot-removed.png')
        return
    pot_mask = mask_between(pot_in, pot_removed)
    emit(pot_in, pot_mask, f'{pfx}pot-0.png', local)
    for n in (1, 2, 3):
        out = load(f'out-{pfx}pot-{n}.png', pot_in.size)
        if not out:
            print(f'  ·  还没有 out-{pfx}pot-{n}.png')
            continue
        alpha = Image.fromarray(np.maximum(np.array(pot_mask), np.array(mask_between(pot_in, out))))
        emit(out, alpha, f'{pfx}pot-{n}.png', local)
    print(f'→ {OUT}；接着 npm run wx:art，把前缀填进 miniprogram/config.js 的 cutArt')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('image', nargs='?', default=os.path.join(REPO, 'art', 'raw', 'camp', 'camp-hd.png'))
    ap.add_argument('--crop', action='store_true')
    ap.add_argument('--local', action='store_true')
    ap.add_argument('--night', action='store_true')
    a = ap.parse_args()
    pfx = 'night-' if a.night else ''
    if a.crop:
        crop(a.image if not a.night or a.image != ap.get_default('image') else os.path.join(REPO, 'art', 'raw', 'camp', 'night-hd.png'), pfx)
    else:
        build(a.local, pfx)


if __name__ == '__main__':
    main()
