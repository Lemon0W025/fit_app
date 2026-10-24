"""暖暖锅里的内容（今天打了几顿，锅里就有几层）：在画上的锅口里画一层粥面，第二顿起加几片胡萝卜和青菜，第三顿满锅冒泡

    from pot_fill import fill            # cutouts.py 抠锅的时候调
    python3 scripts/camp/pot_fill.py --preview out.jpg   # 日 / 夜各 0～3 层，放大和真实大小各一排

粥面是锅口椭圆和「往下挪了 depth」的同样椭圆的交集（俯视 45 度，液面越低看到的越少、越靠近前沿），
颜色是左上亮右下暗的柔和渐变 + 远边一道亮边 + 一块淡淡的反光；配菜是几片带明暗的胡萝卜片、青菜叶、枸杞，
都先画一圈淡影子再画本身。全部在 4 倍大的画布上画再缩回来（边缘干净）。夜里按夜景里锅沿的颜色换算整体色调。
Codex 画好 out-pot-1～3（工单第 1b 节）后就用画的那版，这个只是在那之前不难看的过渡。需要 Pillow 和 numpy。
"""
import argparse
import json
import math
import os
import subprocess

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

REPO = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..'))
SS = 4
DEPTH = {1: 44, 2: 24, 3: 9}          # 液面比锅口低多少（画的像素，屏幕上往下挪）
LIGHT, DARK = (247, 229, 182), (214, 183, 126)
CARROT = [(206, 100, 38), (244, 152, 70), (234, 128, 52)]   # 外圈、内圈、中心
LEAF, LEAF_DARK, LEAF_VEIN = (122, 174, 76), (84, 132, 52), (170, 206, 120)
GOJI, GOJI_HI = (208, 56, 44), (250, 158, 146)


def scene():
    js = "const C=require('./cloudfunctions/api/lib/shared/camp');console.log(JSON.stringify({W:C.W,pot:C.SCENE.cutouts.pot}))"
    return json.loads(subprocess.check_output(['node', '-e', js], cwd=REPO))


def night_tone():
    """夜景和日景锅沿（米白那圈）的颜色比：夜里的粥和菜都按这个比例变暗变色"""
    S = scene()
    cx, cy, rx, ry = S['pot']['rim']
    patch = [cx - rx * 0.5, cy - ry - 40, cx + rx * 0.5, cy - ry - 18]   # 锅口远边上面那段米白的锅沿
    means = []
    for name in ('camp-hd.png', 'night-hd.png'):
        img = Image.open(os.path.join(REPO, 'art', 'raw', 'camp', name)).convert('RGB')
        k = img.width / S['W']
        means.append(np.array(img.crop([round(v * k) for v in patch])).reshape(-1, 3).mean(axis=0))
    return np.clip(means[1] / np.maximum(means[0], 1), 0.2, 1.2)


def fill(crop, n, opening, tone=None):
    """crop：锅那块的 RGB（PIL）；opening：锅口在 crop 里的 (cx, cy, rx, ry)，单位 crop 像素；n：1～3"""
    if not n:
        return crop
    tone = np.ones(3) if tone is None else np.asarray(tone)
    T = lambda c: tuple(int(max(0, min(255, v))) for v in np.asarray(c) * tone)
    W, H = crop.size
    cx, cy, rx, ry = [v * SS for v in opening]
    unit = rx / 180                      # 画的 1 像素在超采样画布上多大（锅口半宽 180 画像素）
    depth = DEPTH[n] * unit
    ly = cy + depth
    yy, xx = np.mgrid[0:H * SS, 0:W * SS].astype(float)
    inO = ((xx - cx) / rx) ** 2 + ((yy - cy) / ry) ** 2 <= 1
    rL = ((xx - cx) / rx) ** 2 + ((yy - ly) / ry) ** 2
    liquid = inO & (rL <= 1)
    u = (xx - cx) / rx
    v = (yy - ly) / ry
    # 远处（贴着锅壁）暗一点、近处和中间亮一点，再加一点很淡的起伏，粥面不像一块平板
    s = np.clip(0.5 + 0.28 * v + 0.18 * (1 - np.minimum(1, u * u + v * v)) + 0.06 * u, 0, 1)
    rng = np.random.default_rng(3)
    wobble = np.array(Image.fromarray((rng.random((6, 10)) * 255).astype(np.uint8)).resize((W * SS, H * SS), Image.BICUBIC)).astype(float) / 255
    s = np.clip(s + (wobble - 0.5) * 0.12, 0, 1)
    col = np.array(T(DARK)) * (1 - s[..., None]) + np.array(T(LIGHT)) * s[..., None]
    # 液面贴着远处锅壁的地方有一道窄窄的阴影
    contact = liquid & (yy < ly) & (rL > (1 - 0.14) ** 2)
    col[contact] = col[contact] * 0.86
    canvas = Image.fromarray(np.clip(col, 0, 255).astype(np.uint8))
    layer = canvas.convert('RGBA')
    d = ImageDraw.Draw(layer)

    def shadow(box):
        sh = Image.new('RGBA', layer.size, (0, 0, 0, 0))
        b = [box[0] + 3 * unit, box[1] + 3 * unit, box[2] + 3 * unit, box[3] + 3 * unit]
        ImageDraw.Draw(sh).ellipse(b, fill=T((150, 118, 70)) + (90,))
        layer.alpha_composite(sh.filter(ImageFilter.GaussianBlur(3 * unit)))

    def carrot(px, py, size):
        a, b = size * rx, size * rx * 0.42
        box = [px - a, py - b, px + a, py + b]
        shadow(box)
        d.ellipse(box, fill=T(CARROT[0]))
        d.ellipse([px - a * 0.8, py - b * 0.8, px + a * 0.8, py + b * 0.8], fill=T(CARROT[1]))
        d.ellipse([px - a * 0.38, py - b * 0.38, px + a * 0.38, py + b * 0.38], fill=T(CARROT[2]))

    def leaf(px, py, size, angle):
        a, b = size * rx, size * rx * 0.36
        pad = int(a * 1.3)
        piece = Image.new('RGBA', (2 * pad, 2 * pad), (0, 0, 0, 0))
        pd = ImageDraw.Draw(piece)
        pd.ellipse([pad - a, pad - b, pad + a, pad + b], fill=T(LEAF), outline=T(LEAF_DARK), width=max(1, int(2 * unit)))
        pd.line([pad - a * 0.8, pad, pad + a * 0.8, pad], fill=T(LEAF_VEIN), width=max(1, int(1.5 * unit)))
        piece = piece.rotate(angle, resample=Image.BICUBIC)
        # 透视：竖向压扁
        piece = piece.resize((piece.width, max(1, int(piece.height * 0.55))), Image.LANCZOS)
        shadow([px - a * 0.8, py - b * 0.5, px + a * 0.8, py + b * 0.5])
        layer.alpha_composite(piece, (int(px - piece.width / 2), int(py - piece.height / 2)))

    def goji(px, py):
        a, b = 0.035 * rx, 0.035 * rx * 0.7
        shadow([px - a, py - b, px + a, py + b])
        d.ellipse([px - a, py - b, px + a, py + b], fill=T(GOJI))
        d.ellipse([px - a * 0.5, py - b * 0.6, px - a * 0.05, py - b * 0.1], fill=T(GOJI_HI))

    # 配菜的位置（相对液面中心，单位 rx / ry），都挑在看得见的那片里
    if n >= 2:
        for (u0, v0, sz) in ([(-0.36, 0.2, 0.125), (0.32, 0.08, 0.11)] + ([(0.05, 0.45, 0.115)] if n >= 3 else [])):
            carrot(cx + u0 * rx, ly + v0 * ry, sz)
        for (u0, v0, sz, ang) in ([(-0.04, 0.3, 0.15, 25), (0.56, 0.34, 0.13, -35)] + ([(-0.62, -0.02, 0.13, 60)] if n >= 3 else [])):
            leaf(cx + u0 * rx, ly + v0 * ry, sz, ang)
    if n >= 3:
        for (u0, v0) in [(0.15, -0.22), (-0.22, 0.48), (0.7, 0.05)]:
            goji(cx + u0 * rx, ly + v0 * ry)
        for (u0, v0, r) in [(-0.15, -0.1, 0.03), (0.45, -0.25, 0.022), (-0.45, 0.35, 0.025), (0.25, 0.4, 0.02)]:
            R = r * rx
            d.ellipse([cx + u0 * rx - R, ly + v0 * ry - R * 0.6, cx + u0 * rx + R, ly + v0 * ry + R * 0.6], outline=T((255, 250, 232)) + (200,), width=max(1, int(1.6 * unit)))
    # 只留液面那片，边缘按超采样自然抗锯齿；粥面碰到锅壁的地方稍微羽化
    m = Image.fromarray((liquid * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(1.2 * unit))
    small = layer.convert('RGB').resize((W, H), Image.LANCZOS)
    msmall = m.resize((W, H), Image.LANCZOS)
    out = crop.copy()
    out.paste(small, (0, 0), msmall)
    return out


def preview(path):
    S = scene()
    rows = []
    for name, night in (('camp-hd.png', False), ('night-hd.png', True)):
        img = Image.open(os.path.join(REPO, 'art', 'raw', 'camp', name)).convert('RGB')
        k = img.width / S['W']
        cx, cy, rx, ry = S['pot']['rim']
        box = [cx - 260, cy - 150, cx + 260, cy + 130]
        l, t = round(box[0] * k), round(box[1] * k)
        crop = img.crop((l, t, round(box[2] * k), round(box[3] * k)))
        opening = (cx * k - l, cy * k - t, rx * k, ry * k)
        tone = night_tone() if night else None
        tiles = [fill(crop, n, opening, tone) for n in range(4)]
        big = [tl.resize((420, round(420 * tl.height / tl.width)), Image.LANCZOS) for tl in tiles]
        # 真实大小：默认视角下一个画像素约 0.57 个设备像素
        real = [tl.resize((round(520 * 0.57), round(280 * 0.57)), Image.LANCZOS) for tl in tiles]
        row = Image.new('RGB', (420 * 4 + 300 * 4, max(big[0].height, real[0].height)), (40, 40, 40))
        for i, b in enumerate(big):
            row.paste(b, (i * 420, 0))
        for i, r in enumerate(real):
            row.paste(r, (1680 + i * 300, 0))
        rows.append(row)
    sheet = Image.new('RGB', (rows[0].width, sum(r.height for r in rows)))
    y = 0
    for r in rows:
        sheet.paste(r, (0, y))
        y += r.height
    sheet.save(path, quality=90)
    print('预览 →', path)


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('--preview', required=True)
    preview(ap.parse_args().preview)
