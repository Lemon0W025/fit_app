"""营地小动静要用的图：篝火逐帧 + 热气

    python3 scripts/camp/fx_art.py                      # 日景 art/raw/camp/camp-hd.png、夜景 night-hd.png → art/cut/fire.jpg、night-fire.jpg（传云存储）
                                                        #   + miniprogram/images/camp/cut/ 里的小图兜底 + miniprogram/images/camp/fx/wisp.png
    python3 scripts/camp/fx_art.py --preview out.gif [--night]   # 预览：帧贴回整画、盖上锅，存 GIF

篝火逐帧不画任何外来的形状：从画上取火苗那几处的像素（锅底下、木柴之间那片 SCENE.flame.zone 里的黄白色），
让亮度按往上流动的噪声一明一暗、边缘偶尔退成暗红的炭色，周围被火照亮的木柴跟着一起闪。木柴、石头的形状一点不动。
帧横着拼成一条（FRAMES 帧），页面用 steps() 播。整块的外圈渐变回原画、框的坐标落在底图切块的像素格上，所以存成不透明的 JPG
（比带透明的 PNG 小几倍，256 色 PNG 会让火发灰、锅底起色带）盖在底图上也看不出接缝。
热气是一缕很淡的白烟（半透明，叠在画上不会像一团棉花）。需要 Pillow 和 numpy。
"""
import argparse
import json
import math
import os
import subprocess

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

REPO = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..'))
RAW = os.path.join(REPO, 'art', 'raw', 'camp')
OUT = os.path.join(REPO, 'art', 'cut')
LOCAL = os.path.join(REPO, 'miniprogram', 'images', 'camp')
FRAMES = 8                                     # 和 camp.wxss 的 steps(8)、scene-fx.js 的 FIRE_FRAMES 一致
GAINS = [1.0, 0.84, 1.1, 0.93, 1.16, 0.88, 1.05, 0.8]   # 每帧整体亮度：不规则地跳，火才像火
RES = {'day': 0.75, 'night': 0.5}              # 每个画像素出几个像素，和底图切块一致（日景 3072 宽、夜景 2048 宽）
LOCAL_RES = 0.2


def scene():
    js = "const C=require('./cloudfunctions/api/lib/shared/camp');console.log(JSON.stringify({W:C.W,flame:C.SCENE.flame,fire:C.SCENE.fire,pot:C.SCENE.cutouts.pot}))"
    return json.loads(subprocess.check_output(['node', '-e', js], cwd=REPO))


def sm(v, a, b):
    t = np.clip((v - a) / (b - a), 0, 1)
    return t * t * (3 - 2 * t)


def periodic_noise(rng, h, w, cy, cx):
    """竖直方向首尾相接的平滑噪声（往上滚一整圈刚好接上，动画能无缝循环）"""
    grid = rng.random((cy, cx))
    tall = Image.fromarray((np.vstack([grid, grid, grid]) * 255).astype(np.uint8)).resize((w, 3 * h), Image.BICUBIC)
    return np.array(tall).astype(float)[h:2 * h] / 255


def fire_frames(image):
    S = scene()
    img = Image.open(image).convert('RGB')
    k = img.width / S['W']
    box = S['flame']['box']
    pad = S['flame']['pad']
    cell = [box[0] - pad, box[1] - pad, box[2] + pad, box[3] + pad]   # 每帧比 box 四周多 pad：这一圈是原画，只是防渗
    l, t, r, b = [round(v * k) for v in cell]
    C = np.array(img.crop((l, t, r, b))).astype(float)
    R, G, B = C[..., 0], C[..., 1], C[..., 2]
    h, w = R.shape
    zone_img = Image.new('L', (w, h), 0)
    ImageDraw.Draw(zone_img).polygon([((x - cell[0]) * k, (y - cell[1]) * k) for x, y in S['flame']['zone']], fill=255)
    zone = np.array(zone_img.filter(ImageFilter.GaussianBlur(max(1.5, 8 * k)))).astype(float) / 255
    # 火苗：黄白色（木柴是橙褐色、石头偏灰白，蓝通道把它们分开），只在 zone 里
    core = sm(G, 150, 195) * sm(R, 215, 240) * (1 - sm(B, 150, 190)) * zone
    # 被火照亮的木柴和橙色火边：跟着整体亮度一起闪（石头的 B/R 高，排除）
    warm = sm(R, 185, 230) * sm(G, 85, 120) * (1 - sm(B / np.maximum(R, 1), 0.33, 0.45))
    yy, xx = np.mgrid[0:h, 0:w].astype(float)
    X = xx / k + cell[0]
    Y = yy / k + cell[1]
    fx, fy = S['fire']
    lightw = np.exp(-(((X - (fx - 40)) / 260) ** 2) - (((Y - (fy - 40)) / 150) ** 2)) * warm
    edge = np.minimum.reduce([X - box[0], box[2] - X, Y - box[1], box[3] - Y])
    feather = sm(edge, 0, 30)          # box 外圈 30 画像素渐变回原画（box 外的 pad 那圈就是原画）：贴上去没有接缝
    rng = np.random.default_rng(7)
    n1 = 0.6 * periodic_noise(rng, h, w, 3, 4) + 0.4 * periodic_noise(rng, h, w, 6, 8)
    n2 = periodic_noise(rng, h, w, 5, 7)
    n1 = (n1 - n1.mean()) / (n1.std() * 2.2)
    n2 = (n2 - n2.mean()) / (n2.std() * 2.2)
    coal = C * np.array([0.8, 0.46, 0.28])     # 火苗退下去露出的暗红炭色
    frames = []
    for f in range(FRAMES):
        gain = GAINS[f]
        n = np.clip(0.65 * np.roll(n1, -round(f * h / FRAMES), axis=0) + 0.35 * np.roll(n2, -round(2 * f * h / FRAMES), axis=0), -1, 1)
        lit = C * (1 + (gain - 1) * 0.6 * lightw[..., None])
        flame = np.clip(C * (gain * (1 + 0.3 * n))[..., None], 0, 255)
        hot = np.clip((n - 0.25) * 1.6, 0, 1)[..., None] * 0.45 * gain
        flame = flame + (np.array([255, 248, 215]) - flame) * hot
        alpha = core * np.clip(0.8 + 0.55 * n, 0.3, 1)
        under = lit * (1 - core[..., None]) + coal * core[..., None]
        F = under * (1 - alpha[..., None]) + flame * alpha[..., None]
        F = C * (1 - feather[..., None]) + F * feather[..., None]
        frames.append(Image.fromarray(np.clip(F, 0, 255).astype(np.uint8), 'RGB'))
    return img, k, (l, t), frames


def strip(frames, scale):
    fw, fh = max(1, round(frames[0].width * scale)), max(1, round(frames[0].height * scale))
    out = Image.new('RGB', (fw * len(frames), fh))
    for i, f in enumerate(frames):
        out.paste(f.resize((fw, fh), Image.LANCZOS), (i * fw, 0))
    return out


def wisp():
    """一缕热气：细长的一道，弯两下，下面细而浓、上面散而淡；画在 4 倍大的布上连成一条再缩小，看不出一个个圆"""
    W, H, SSW = 64, 256, 4
    w, h = W * SSW, H * SSW
    yy, xx = np.ogrid[:h, :w]
    acc = np.zeros((h, w))
    for i in range(400):
        t = i / 399
        cx = w / 2 + (9 * SSW) * math.sin(2 * math.pi * 1.25 * t + 0.4) * (0.35 + 0.65 * t)
        cy = h - 10 * SSW - (h - 30 * SSW) * t
        r = (3 + 11 * t) * SSW
        a = (1 - t) ** 1.3 * min(1, t * 10)
        d2 = (xx - cx) ** 2 + (yy - cy) ** 2
        acc = np.maximum(acc, a * np.exp(-d2 / (2 * (r * 0.55) ** 2)))
    alpha = Image.fromarray((np.clip(acc, 0, 1) * 150).astype(np.uint8)).filter(ImageFilter.GaussianBlur(3 * SSW)).resize((W, H), Image.LANCZOS)
    img = Image.new('RGBA', (W, H), (255, 252, 246, 0))
    img.putalpha(alpha)
    return img


def save(img, path):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    if path.endswith('.jpg'):
        img.convert('RGB').save(path, quality=90, subsampling=0, optimize=True)
    else:
        img.save(path, optimize=True)
    print(f'  ✓  {os.path.relpath(path, REPO)}  {img.width}×{img.height}  {os.path.getsize(path) // 1024} KB')


def preview(out, night):
    S = scene()
    img, k, (l, t), frames = fire_frames(os.path.join(RAW, 'night-hd.png' if night else 'camp-hd.png'))
    pot_path = os.path.join(OUT, ('night-' if night else '') + 'pot-0.png')
    pot = Image.open(pot_path).convert('RGBA') if os.path.exists(pot_path) else None
    pb = S['pot']['box']
    view = [S['fire'][0] - 430, S['fire'][1] - 520, S['fire'][0] + 430, S['fire'][1] + 180]
    gif = []
    for f in frames:
        canvas = img.copy().convert('RGBA')
        canvas.paste(f, (l, t))
        if pot:
            canvas.alpha_composite(pot.resize((round((pb[2] - pb[0]) * k), round((pb[3] - pb[1]) * k)), Image.LANCZOS), (round(pb[0] * k), round(pb[1] * k)))
        gif.append(canvas.crop([round(v * k) for v in view]).convert('RGB'))
    gif[0].save(out, save_all=True, append_images=gif[1:], duration=120, loop=0)
    print(f'预览 → {out}')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--preview', default='')
    ap.add_argument('--night', action='store_true')
    a = ap.parse_args()
    if a.preview:
        preview(a.preview, a.night)
        return
    for tag, name in [('day', 'camp-hd.png'), ('night', 'night-hd.png')]:
        path = os.path.join(RAW, name)
        if not os.path.exists(path):
            print(f'  ·  没有 {name}，跳过')
            continue
        img, k, _, frames = fire_frames(path)
        pfx = 'night-' if tag == 'night' else ''
        save(strip(frames, RES[tag] / k), os.path.join(OUT, f'{pfx}fire.jpg'))   # 和底图切块同一个分辨率（夜景原图 1903 宽也放大到 0.5），像素格对齐
        save(strip(frames, LOCAL_RES / k), os.path.join(LOCAL, 'cut', f'{pfx}fire.jpg'))
    save(wisp(), os.path.join(LOCAL, 'fx', 'wisp.png'))
    print('接着 npm run wx:art（art/cut/ 传到 camp/cut/）')


if __name__ == '__main__':
    main()
