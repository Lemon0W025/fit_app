"""夜里篝火点着（锅里煮着东西）时的「点火版夜景」：整片草坪被火照亮，火边最亮最暖，越往外越带一点夜里的蓝，四周和树林留着夜色（用户选的 B2）

    python3 scripts/camp/lit_night.py [--preview 目录]

照日景和夜景合成（不等 Codex）：
    亮度权重 w = min(PEAK, PEAK·exp(-(d/R)²) + FLOOR) × 树林渐变，d 是到篝火光心的距离（竖着压 FLAT，地面透视）；
    树林那条（画的 y FOREST）往上渐变到 0，天空和树林保持夜色；
    被火照亮的颜色 = 日景 × WARM × BRIGHT；
    结果 = max(夜景 ×(1 − w) + 照亮色 × w, 夜景)：锅边本来那圈火光、帐篷门口的灯不会被盖暗。
整个世界一起做（天空 + 画 + 下面补的草地），从已经切好的日景、夜景块（art/camp/*.jpg，cut_art.py + extend_art.py 出的）拼回来算，
所以先跑那两个。输出：
    art/camp/lit-t*.jpg（画，16 块）、lit-d*.jpg（下面的草地，8 块），和夜景同分辨率；天空和夜景一样，不另出
    miniprogram/images/camp/base/lit-world.jpg   包里垫的整个世界（768 宽）
    art/lit/painting.png                           点火版的画（夜景分辨率），cutouts.py 从它抠点火版的帐篷 / 木盖 / 提灯
接着：cutouts.py --from-base --local（会出 lit- 那套抠图）、cutouts.py --local、cutouts.py --local --night、light_map.py，
ART_VERSION.base / cut 加一，npm run wx:art -- base cut。需要 Pillow 和 numpy。
"""
import argparse
import json
import os
import subprocess

import numpy as np
from PIL import Image

REPO = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..'))
TILES = os.path.join(REPO, 'art', 'camp')
LIT = os.path.join(REPO, 'art', 'lit')
LOCAL = os.path.join(REPO, 'miniprogram', 'images', 'camp', 'base')
RES = {'': 0.75, 'night-': 0.5}   # 日景块 3072 宽、夜景块 2048 宽（cut_art.py / extend_art.py）
TILE = 1024
LOCAL_RES = 0.1875
GLOW = (0, -120)                   # 光心：篝火往上一点（火苗和锅底）
R, FLOOR, PEAK = 2200, 0.12, 0.92
FLAT = 0.62
WARM = np.array([1.0, 0.82, 0.58])
BRIGHT = 0.70
FOREST = (655, 983)                # 树林那条：这以上不照（天空、树林保持夜色）


def scene():
    js = "const C=require('./cloudfunctions/api/lib/shared/camp');console.log(JSON.stringify({W:C.W,H:C.H,fire:C.SCENE.fire,frame:C.SCENE.frame}))"
    return json.loads(subprocess.check_output(['node', '-e', js], cwd=REPO))


def rows_of(S):
    """世界里每排块的 [名字, 上沿, 下沿]（画的像素，世界坐标：天空在最上面）"""
    top, H, ov = S['frame']['top'], S['H'], S['frame']['overlap']
    rows = [('u0', 0, TILE), ('u1', TILE, 2 * TILE)]
    rows += [(f't{r}', top + r * TILE, top + (r + 1) * TILE) for r in range(4)]
    rows += [('d0', top + H - ov, top + H + TILE), ('d1', top + H + TILE, top + H + 2 * TILE)]
    return rows


def world(S, pfx):
    """把切好的块拼回整个世界（这一套自己的分辨率）；下面的草地盖住画最下面那段，和页面上一样"""
    res = RES[pfx]
    W, height = S['W'], S['frame']['top'] + S['H'] + S['frame']['bottom']
    out = Image.new('RGB', (round(W * res), round(height * res)))
    for name, y0, _ in rows_of(S):
        for col in range(4):
            path = os.path.join(TILES, f'{pfx}{name}{col}.jpg')
            if not os.path.exists(path):
                raise SystemExit(f'缺 {path}：先跑 cut_art.py（日 / 夜）和 extend_art.py')
            out.paste(Image.open(path).convert('RGB'), (round(col * TILE * res), round(y0 * res)))
    return out


def weight(S, shape, res):
    """每个像素被火照亮多少（0～PEAK）"""
    h, w = shape
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    X = xx / res
    Y = yy / res - S['frame']['top']                                # 画的坐标（天空那段是负的）
    fx, fy = S['fire'][0] + GLOW[0], S['fire'][1] + GLOW[1]
    d = np.hypot(X - fx, (Y - fy) / FLAT)
    t = np.clip((Y - FOREST[0]) / (FOREST[1] - FOREST[0]), 0, 1)
    t = t * t * (3 - 2 * t)
    return np.minimum(PEAK, PEAK * np.exp(-(d / R) ** 2) + FLOOR) * t


def lit_world(S):
    night = world(S, 'night-')
    day = world(S, '').resize(night.size, Image.LANCZOS)
    N = np.asarray(night).astype(np.float32)
    D = np.asarray(day).astype(np.float32)
    w = weight(S, N.shape[:2], RES['night-'])[..., None]
    lit = np.maximum(N * (1 - w) + D * WARM * BRIGHT * w, N)
    return Image.fromarray(np.uint8(np.clip(lit, 0, 255) + 0.5)), night


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--preview', default=None)
    a = ap.parse_args()
    S = scene()
    img, night = lit_world(S)
    res = RES['night-']
    total = 0
    for name, y0, y1 in rows_of(S):
        if name.startswith('u'):
            continue                                                 # 天空不照，用夜景的
        for col in range(4):
            box = (round(col * TILE * res), round(y0 * res), round((col + 1) * TILE * res), round(y1 * res))
            path = os.path.join(TILES, f'lit-{name}{col}.jpg')
            img.crop(box).save(path, quality=85, optimize=True)
            total += os.path.getsize(path)
    print(f'  ✓  点火版 24 块 → {TILES}/lit-*.jpg，共 {total // 1024} KB')
    os.makedirs(LIT, exist_ok=True)
    top = round(S['frame']['top'] * res)
    painting = img.crop((0, top, img.width, top + round(S['H'] * res)))
    painting.save(os.path.join(LIT, 'painting.png'))
    print(f'  ✓  点火版的画 → art/lit/painting.png {painting.width}×{painting.height}')
    lo = img.resize((round(S['W'] * LOCAL_RES), round(img.height / res * LOCAL_RES)), Image.LANCZOS)
    path = os.path.join(LOCAL, 'lit-world.jpg')
    lo.save(path, quality=74, optimize=True, progressive=True)
    print(f'  ✓  包里垫的整个世界 lit-world.jpg {lo.width}×{lo.height}  {os.path.getsize(path) // 1024} KB')
    if a.preview:
        os.makedirs(a.preview, exist_ok=True)
        pair = Image.new('RGB', (1210, round(600 * img.height / img.width)), 'white')
        pair.paste(night.resize((600, pair.height)), (0, 0))
        pair.paste(img.resize((600, pair.height)), (610, 0))
        pair.save(os.path.join(a.preview, 'lit-night.jpg'), quality=88)
        print(f'预览 → {a.preview}/lit-night.jpg（左：火没点的夜景底，右：点火版）')
    print('→ 接着 cutouts.py --from-base --local、cutouts.py --local、cutouts.py --local --night、light_map.py，ART_VERSION.base / cut 加一，npm run wx:art -- base cut')


if __name__ == '__main__':
    main()
