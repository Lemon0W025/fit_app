"""把画上火边那两个碗（以前的两个食盆，10/26 用户说用不到就去掉）从画上擦掉，补成草地

    python3 scripts/camp/erase_bowls.py [--preview 目录]

改的是 art/raw/ 里的原图（擦之前的在 git 历史里）：营地日景 / 夜景整图（camp.png、camp-hd.png、night.png、night-hd.png）
和 Codex 画的两张「没点火」（art/raw/cut/out-fire-off.png、out-night-fire-off.png，夜景那张把碗也画进去了）。
已经擦过的（洞里看不到碗的奶白色）不再动，重跑没关系。
怎么补：碗和影子那块（HOLES，画的像素）当洞；在附近找一块干净的草地（洞外一圈和它最像、整块不碰篝火 / 帐篷 / 木盖 / 提灯），
整块搬过来，再把洞边上「原画 − 搬来的」那点差（主要是明暗：夜里左边被火照暖、右边月光）从边上往洞里抹匀（push-pull），
边上羽化接回原画。日景的「没点火」那张除了火堆和原画一样，碗那块直接用擦好的日景。
擦完接着重跑：fire_off.py → cutouts.py --from-base --local → cut_art.py（日 / 夜）→ extend_art.py → light_map.py，
ART_VERSION.base / cut 加一再 npm run wx:art。需要 Pillow 和 numpy。
"""
import argparse
import json
import os
import subprocess

import numpy as np
from PIL import Image, ImageDraw

from fire_off import blur, grow, push_pull, sm, _codex_region, _crop_boxes

REPO = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..'))
RAW = os.path.join(REPO, 'art', 'raw', 'camp')
CODEX = os.path.join(REPO, 'art', 'raw', 'cut')
# 两个碗连影子（画的像素，椭圆：中心 x, y, 半径 x, y；影子往左下拖）
HOLES = [(2675, 3130, 205, 140), (2970, 3225, 205, 140)]
REACH = 900        # 离洞多远以内找草地（画的像素）
STEP = 16          # 找的时候每次挪多少（画的像素）
RING = 48          # 洞外一圈多宽拿来比（画的像素）
BAND = 14          # 洞外多宽算「边上」：原画和搬来的差从这儿往里抹
FEATHER = 10       # 接回原画的羽化（画的像素）
KEEP_OUT = 80      # 找来的草离禁区（篝火、帐篷、木盖、提灯）至少这么远


def scene():
    js = "const C=require('./cloudfunctions/api/lib/shared/camp');console.log(JSON.stringify({W:C.W,nogo:C.SCENE.nogo}))"
    return json.loads(subprocess.check_output(['node', '-e', js], cwd=REPO))


def hole_mask(w, h, x0, y0, kx, ky):
    """整张图（或一块）上的洞：x0, y0 是图左上角在画上的位置，kx / ky 每画像素多少图像素"""
    yy, xx = np.mgrid[0:h, 0:w].astype(float)
    X, Y = xx / kx + x0, yy / ky + y0
    m = np.zeros((h, w), bool)
    for cx, cy, rx, ry in HOLES:
        m |= ((X - cx) / rx) ** 2 + ((Y - cy) / ry) ** 2 <= 1
    return m


def keep_out(w, h, x0, y0, kx, ky, S):
    img = Image.new('L', (w, h), 0)
    d = ImageDraw.Draw(img)
    for poly in S['nogo'].values():
        d.polygon([((x - x0) * kx, (y - y0) * ky) for x, y in poly], fill=255)
    return grow(np.asarray(img) > 0, KEEP_OUT * (kx + ky) / 2)


def has_bowls(arr, hole):
    """洞里还有碗的奶白色吗（白天、夜里都是亮的、偏暖白，草再亮也没这么白）"""
    R, G, B = arr[..., 0], arr[..., 1], arr[..., 2]
    lum = 0.3 * R + 0.59 * G + 0.11 * B
    cream = (lum > 165) & (B > 0.7 * G) & (R > 0.95 * G)
    return cream[hole].mean() > 0.03


def find_grass(img, x0, y0, kx, ky, S):
    """缩到每画像素约 0.12 个像素来比：洞外一圈（RING）的颜色差最小、整块不碰洞和禁区的那个挪法（画的像素）"""
    f = max(kx, ky) / 0.12
    sw, sh = max(1, round(img.width / f)), max(1, round(img.height / f))
    sx, sy = kx * sw / img.width, ky * sh / img.height        # 小图上每画像素多少像素
    small = np.asarray(img.resize((sw, sh), Image.BOX)).astype(float)
    hs = hole_mask(sw, sh, x0, y0, sx, sy)
    ring = grow(hs, RING * sx) & ~hs
    bad = grow(hs, (RING + 10) * sx) | keep_out(sw, sh, x0, y0, sx, sy, S)
    ys, xs = np.nonzero(ring | hs)
    ry, rx = np.nonzero(ring)
    target = small[ry, rx]
    best = None
    for dy in range(-REACH, REACH + 1, STEP):
        for dx in range(-REACH, REACH + 1, STEP):
            if abs(dx) < 260 and abs(dy) < 200:
                continue                                       # 挪得太少还会碰到洞
            ox, oy = int(round(dx * sx)), int(round(dy * sy))
            if xs.min() + ox < 0 or ys.min() + oy < 0 or xs.max() + ox >= sw or ys.max() + oy >= sh:
                continue
            if bad[ys + oy, xs + ox].any():
                continue
            cost = ((small[ry + oy, rx + ox] - target) ** 2).mean() * (1 + 0.15 * np.hypot(dx, dy) / REACH)
            if best is None or cost < best[0]:
                best = (cost, dx, dy)
    if best is None:
        raise SystemExit('附近找不到干净的草地，检查 HOLES / REACH')
    return best[1], best[2]


def erase(img, x0, y0, kx, ky, S, force=False):
    """img（PIL RGB，左上角在画上的 (x0, y0)，每画像素 kx / ky 个图像素）上的碗擦掉，返回新图；没有碗返回 None"""
    k = (kx + ky) / 2
    # 只在洞附近这块上算（整张高清图上做 MaxFilter / 模糊太慢）
    pad = (BAND + FEATHER * 3) * k
    xs = [c[0] - c[2] for c in HOLES] + [c[0] + c[2] for c in HOLES]
    ys = [c[1] - c[3] for c in HOLES] + [c[1] + c[3] for c in HOLES]
    l = max(0, int((min(xs) - x0) * kx - pad))
    t = max(0, int((min(ys) - y0) * ky - pad))
    r = min(img.width, int((max(xs) - x0) * kx + pad) + 1)
    b = min(img.height, int((max(ys) - y0) * ky + pad) + 1)
    if r <= l or b <= t:
        return None
    a = np.asarray(img.crop((l, t, r, b))).astype(float)
    cx0, cy0 = x0 + l / kx, y0 + t / ky
    hole = hole_mask(r - l, b - t, cx0, cy0, kx, ky)
    if not hole.any() or (not force and not has_bowls(a, hole)):
        return None
    dx, dy = find_grass(img, x0, y0, kx, ky, S)
    ox, oy = int(round(dx * kx)), int(round(dy * ky))
    # 整块搬过来（洞和外面一圈），边上的明暗差往洞里抹匀
    src = np.asarray(img.crop((l + ox, t + oy, r + ox, b + oy))).astype(float)
    band = grow(hole, BAND * k) & ~hole
    diff = np.where(band[..., None], a - src, 0)
    fixed = src + push_pull(diff, band.astype(float))
    alpha = blur(grow(hole, FEATHER * k).astype(float), FEATHER * k * 0.6)[..., None]
    piece = a * (1 - alpha) + fixed * alpha
    out = img.copy()
    out.paste(Image.fromarray(np.uint8(np.clip(piece, 0, 255) + 0.5)), (l, t))
    print(f'    从 ({dx:+d}, {dy:+d}) 画像素那儿搬的草')
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--preview', default=None)
    ap.add_argument('--force', action='store_true', help='看不到碗也再擦一遍')
    a = ap.parse_args()
    S = scene()
    W = S['W']
    if a.preview:
        os.makedirs(a.preview, exist_ok=True)
    # Codex 的「没点火」：先按没擦过的整张画对出它在画上的哪一块（_codex_region 比轮廓）
    codex = {}
    for key, name, src in (('day', 'out-fire-off.png', 'camp-hd.png'), ('night', 'out-night-fire-off.png', 'night-hd.png')):
        path = os.path.join(CODEX, name)
        if os.path.exists(path):
            full = Image.open(os.path.join(RAW, src)).convert('RGB')
            out = Image.open(path).convert('RGB')
            reg = _codex_region(out, full, _crop_boxes()[key], W, full.width / W)
            codex[key] = (path, out, reg)
    done = {}
    for name in ('camp-hd.png', 'camp.png', 'night-hd.png', 'night.png'):
        path = os.path.join(RAW, name)
        img = Image.open(path).convert('RGB')
        k = img.width / W
        print(f'  {name}')
        new = erase(img, 0, 0, k, k, S, a.force)
        if new is None:
            print('    没有碗了，不动')
            done[name] = img
            continue
        new.save(path)
        done[name] = new
        if a.preview:
            preview(img, new, k, os.path.join(a.preview, name.replace('.png', '.jpg')))
    # 日景的「没点火」：Codex 只改了火堆，别处（包括碗）和原画一个像素都不差：碗那块（洞往外一圈，擦的时候羽化到的地方）
    # 和别处跟擦好的日景只差一点的，整个换成擦好的日景，这样 fire_off.py 比出来的补丁还是只有火堆那块
    if 'day' in codex:
        path, out, reg = codex['day']
        kx, ky = out.width / (reg[2] - reg[0]), out.height / (reg[3] - reg[1])
        arr = np.asarray(out).astype(int)
        hole = hole_mask(out.width, out.height, reg[0], reg[1], kx, ky)
        print('  out-fire-off.png')
        if hole.any() and has_bowls(arr, hole):
            k = done['camp-hd.png'].width / W
            base = np.asarray(done['camp-hd.png'].crop([round(v * k) for v in reg]).resize(out.size, Image.LANCZOS)).astype(int)
            same = (np.abs(arr - base) <= 2).all(-1) | grow(hole, FEATHER * 3 * kx)
            Image.fromarray(np.uint8(np.where(same[..., None], base, arr))).save(path)
            print('    和原画一样的地方（碗那块）换成擦好的日景')
        else:
            print('    没有碗了，不动')
    if 'night' in codex:
        path, out, reg = codex['night']
        kx, ky = out.width / (reg[2] - reg[0]), out.height / (reg[3] - reg[1])
        print('  out-night-fire-off.png')
        new = erase(out, reg[0], reg[1], kx, ky, S, a.force)
        if new is None:
            print('    没有碗了，不动')
        else:
            new.save(path)
            if a.preview:
                preview(out, new, kx, os.path.join(a.preview, 'out-night-fire-off.jpg'), reg[:2])
    print('擦完了。接着 fire_off.py → cutouts.py --from-base --local → cut_art.py（日 / 夜）→ extend_art.py → light_map.py')


def preview(before, after, k, path, origin=(0, 0)):
    xs = [c[0] - c[2] for c in HOLES] + [c[0] + c[2] for c in HOLES]
    ys = [c[1] - c[3] for c in HOLES] + [c[1] + c[3] for c in HOLES]
    box = [round((min(xs) - 300 - origin[0]) * k), round((min(ys) - 250 - origin[1]) * k), round((max(xs) + 300 - origin[0]) * k), round((max(ys) + 250 - origin[1]) * k)]
    a, b = before.crop(box), after.crop(box)
    s = 600 / a.width
    a, b = a.resize((600, round(a.height * s))), b.resize((600, round(b.height * s)))
    out = Image.new('RGB', (1210, a.height), (255, 255, 255))
    out.paste(a, (0, 0))
    out.paste(b, (610, 0))
    out.save(path, quality=90)


if __name__ == '__main__':
    main()
