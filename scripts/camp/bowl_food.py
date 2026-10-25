"""食盆里的吃的：放进食盆的食物画成「盛在碗里的一小堆」，前面那圈碗沿从画上抠下来盖在上面（食物在碗里，不是浮在碗上的圆片）

    python3 scripts/camp/bowl_food.py [--preview out.png]

输出：
    art/cut/bowl-0.webp、bowl-1.webp（+ night-）     两个食盆的碗沿和碗身（从画上抠的精确轮廓，去掉碗口里面那块），随 npm run wx:art -- cut 上传
    art/cut/night-bowl-0-off.webp …                  夜里火没点（锅是空的）时的碗沿：从 fire_off.py 熄了火的夜景上抠（碗原来被篝火照成暖黄）
    miniprogram/images/camp/cut/bowl-0.png …          包里的兜底小图
    miniprogram/images/camp/foods/bowl/<id>.png        每样食物盛在碗里的样子（只画碗口里面那一块，透明底）
碗口的大小、位置在 shared/camp.js 的 SCENE.bowl（照画量的）。等 Codex 出了正式的食物图标，这里可以换成「图标放进碗里」。需要 Pillow 和 numpy。
"""
import argparse
import json
import math
import os
import random
import subprocess

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

from cutouts import objectness, reconstruct, bitmap, small_png

REPO = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..'))
OUT = os.path.join(REPO, 'art', 'cut')
LOCAL = os.path.join(REPO, 'miniprogram', 'images', 'camp', 'cut')
FOODS_OUT = os.path.join(REPO, 'miniprogram', 'images', 'camp', 'foods', 'bowl')
RES = {'': 0.75, 'night-': 0.5}
LOCAL_RES = 0.3
SS = 4               # 超采样
MOUND_W = 180        # 碗里食物图的宽（像素）；高按碗口比例

# 每样吃的：样子（pile 一堆小颗粒 / chunk 块 / ball 圆的 / leaf 叶子 / liquid 汤水）、主色、点缀色
LOOK = {
    'xiaomi': ('grain', (236, 196, 92), None), 'yumili': ('grain', (248, 204, 64), None), 'lianzi': ('ball', (238, 228, 200), None),
    'huluobo': ('chunk', (238, 128, 46), (250, 170, 90)), 'niangao': ('chunk', (246, 242, 230), None), 'xiaoyu': ('fish', (176, 196, 210), (90, 110, 130)),
    'shizi': ('chunk', (242, 132, 40), None), 'pingguo': ('chunk', (214, 62, 50), (250, 236, 200)), 'xiaoyugan': ('fish', (200, 152, 100), (140, 96, 60)),
    'juhuacha': ('liquid', (214, 172, 70), (250, 220, 90)), 'xigua': ('chunk', (232, 72, 82), (120, 172, 82)), 'caomei': ('ball', (222, 52, 72), (110, 170, 80)),
    'kaohongshu': ('chunk', (150, 82, 52), (242, 162, 62)), 'putao': ('ball', (118, 70, 142), None), 'hetao': ('ball', (172, 132, 92), None),
    'hongshu': ('chunk', (172, 82, 92), (242, 190, 120)), 'juzi': ('chunk', (246, 152, 42), None), 'niunai': ('liquid', (250, 248, 240), None),
    'zhusun': ('chunk', (232, 216, 160), (200, 180, 110)), 'zhuye': ('leaf', (112, 172, 82), None), 'chaye': ('leaf', (92, 132, 72), None),
    'guihuagao': ('chunk', (246, 226, 160), (240, 190, 70)), 'shanzha': ('ball', (202, 42, 42), None), 'shibing': ('chunk', (212, 122, 62), None),
    'kaolizi': ('ball', (142, 82, 52), (220, 180, 120)), 'tanghulu': ('ball', (224, 42, 42), (255, 200, 200)), 'jiaozi': ('dumpling', (248, 245, 235), None),
    'labazhou': ('liquid', (172, 112, 92), (120, 60, 50)), 'chunjuan': ('rod', (232, 172, 82), None), 'qingtuan': ('ball', (112, 162, 82), None),
    'qingmei': ('ball', (162, 202, 92), None), 'zongzi': ('dumpling', (122, 162, 82), (220, 200, 140)), 'yuebing': ('chunk', (202, 142, 72), (240, 190, 110)),
}


def scene():
    js = ("const C=require('./cloudfunctions/api/lib/shared/camp'),F=require('./cloudfunctions/api/lib/shared/foods');"
          "console.log(JSON.stringify({W:C.W,bowls:C.SCENE.bowls,bowl:C.SCENE.bowl,foods:F.FOODS.concat(F.TREATS).map(f=>f.id)}))")
    return json.loads(subprocess.check_output(['node', '-e', js], cwd=REPO))


def shade(c, f):
    return tuple(int(max(0, min(255, v * f))) for v in c)


# ---------------------------------------------------------------- 碗沿（从画上抠）

def rims():
    S = scene()
    W = S['W']
    rx, ry = S['bowl']['rx'], S['bowl']['ry']
    day_hd = Image.open(os.path.join(REPO, 'art', 'raw', 'camp', 'camp-hd.png')).convert('RGB')
    full = {pfx: Image.open(os.path.join(REPO, 'art', 'raw', 'camp', 'night-hd.png' if pfx else 'camp-hd.png')).convert('RGB').resize((round(W * r),) * 2, Image.LANCZOS) for pfx, r in RES.items()}
    from fire_off import unlit_day, unlit_night
    unlit = {'night-': unlit_night(full['night-'], unlit_day(day_hd))}
    os.makedirs(OUT, exist_ok=True)
    os.makedirs(LOCAL, exist_ok=True)
    for i, (bx, by) in enumerate(S['bowls']):
        box = bowl_box(i, S)
        k = day_hd.width / W
        l, t, r, b = [round(v * k) for v in box]
        crop = day_hd.crop((l, t, r, b))
        # 碗是米白的，草是绿的：去掉像草的，从碗口中心往外长出整个碗
        obj = objectness(crop)
        hard = obj > 0.5
        seed = np.zeros_like(hard)
        cx, cy = round((bx - box[0]) * k), round((by + ry + 30 - box[1]) * k)   # 碗身正面
        seed[cy - 4:cy + 5, cx - 4:cx + 5] = True
        keep = reconstruct(seed, hard)
        near = np.asarray(bitmap(keep).filter(ImageFilter.MaxFilter(5))) > 0
        alpha = obj * near
        # 去掉碗口里面那块（食物画在那儿，碗沿盖在食物外圈上）
        hole = Image.new('L', crop.size, 0)
        ImageDraw.Draw(hole).ellipse([(bx - rx - box[0]) * k, (by - ry - box[1]) * k, (bx + rx - box[0]) * k, (by + ry - box[1]) * k], fill=255)
        hole = np.asarray(hole.filter(ImageFilter.GaussianBlur(1.2))).astype(np.float32) / 255
        alpha = alpha * (1 - hole)
        alpha_img = Image.fromarray((alpha * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(0.6))
        sources = [(pfx, img, '') for pfx, img in full.items()] + [(pfx, img, '-off') for pfx, img in unlit.items()]
        for pfx, img, suffix in sources:
            res = img.width / W
            pbox = [round(v * res) for v in box]
            piece = img.crop(pbox).convert('RGBA')
            piece.putalpha(alpha_img.resize(piece.size, Image.LANCZOS))
            a = np.array(piece)
            a[a[:, :, 3] == 0] = 0
            piece = Image.fromarray(a)
            name = f'{pfx}bowl-{i}{suffix}'
            piece.save(os.path.join(OUT, f'{name}.webp'), 'WEBP', quality=90, method=6)
            small_png(piece, LOCAL_RES / res).save(os.path.join(LOCAL, f'{name}.png'), optimize=True)
            print(f'  ✓  {name}.webp  {piece.width}×{piece.height}')


def bowl_box(i, S):
    """第 i 个碗的抠图范围（shared/camp.js 的 SCENE.bowl.boxes，页面按同样的数摆）"""
    return S['bowl']['boxes'][i]


# ---------------------------------------------------------------- 碗里的吃的（程序画）

def mound(food_id, w, h, seed):
    """w×h 的透明图，碗口椭圆里画一堆吃的：底下一层暗的堆、上面一颗颗（左上亮右下暗、各自一圈淡影子）"""
    kind, color, accent = LOOK.get(food_id, ('chunk', (200, 170, 120), None))
    rng = random.Random(seed)
    W, H = w * SS, h * SS
    # 在不透明的 RGB 上画（半透明的影子、反光才会叠上去；RGBA 图上 ImageDraw 是直接替换像素），最后再按碗口裁透明
    img = Image.new('RGB', (W, H), shade(color, 0.62))
    d = ImageDraw.Draw(img, 'RGBA')
    cx, cy, rx, ry = W / 2, H / 2, W / 2, H / 2
    inside = lambda x, y, m=1.0: ((x - cx) / (rx * m)) ** 2 + ((y - cy) / (ry * m)) ** 2 <= 1
    # 碗里的暗处（远边的碗壁投下来的影子）+ 底层
    base = shade(color, 0.62)
    d.ellipse([0, 0, W, H], fill=base + (255,))
    if kind == 'liquid':
        # 汤水：平的液面（比碗口低一点，远边露一道碗壁的暗影），一块反光，点缀几粒
        d.ellipse([W * 0.03, H * 0.16, W * 0.97, H * 1.0], fill=color + (255,))
        d.ellipse([W * 0.18, H * 0.34, W * 0.55, H * 0.56], fill=shade(color, 1.08) + (150,))
        if accent:
            for _ in range(9):
                x, y = rng.uniform(W * 0.2, W * 0.8), rng.uniform(H * 0.35, H * 0.85)
                r = rng.uniform(4, 7) * SS
                d.ellipse([x - r, y - r * 0.7, x + r, y + r * 0.7], fill=accent + (255,))
    else:
        # 一堆：中间鼓起来（左上亮），再一颗颗往上摆，后面的先画
        for i in range(10, 0, -1):
            f = i / 10
            d.ellipse([cx - rx * f, cy - ry * f * 0.9 - (1 - f) * H * 0.18, cx + rx * f, cy + ry * f * 0.9 - (1 - f) * H * 0.18], fill=shade(color, 0.66 + 0.3 * (1 - f)) + (255,))
        size = {'grain': 0.07, 'ball': 0.17, 'chunk': 0.2, 'leaf': 0.22, 'fish': 0.3, 'dumpling': 0.26, 'rod': 0.3}[kind]
        n = {'grain': 70, 'ball': 9, 'chunk': 8, 'leaf': 10, 'fish': 4, 'dumpling': 4, 'rod': 5}[kind]
        pieces = []
        for _ in range(n * 3):
            if len(pieces) >= n:
                break
            x, y = rng.uniform(0, W), rng.uniform(0, H)
            if not inside(x, y, 0.82):
                continue
            hump = 1 - (((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2)
            pieces.append((y - hump * H * 0.16, x, hump))
        for y, x, hump in sorted(pieces):
            s = W * size * rng.uniform(0.8, 1.15)
            light = 0.86 + 0.28 * hump
            piece(d, kind, x, y, s, color, accent, light, rng)
    # 和手绘的画一样软一点：整体轻轻糊一下，再加一层很淡的颗粒
    img = img.filter(ImageFilter.GaussianBlur(SS * 0.7))
    noise = np.random.default_rng(seed).normal(0, 6, (H, W, 1))
    arr = np.asarray(img).astype(np.float32)
    arr[..., :3] = np.clip(arr[..., :3] + noise, 0, 255)
    img = Image.fromarray(arr.astype(np.uint8)).convert('RGBA')
    # 碗口的形状裁一下（外面透明），边缘柔一点
    mask = Image.new('L', (W, H), 0)
    ImageDraw.Draw(mask).ellipse([0, 0, W, H], fill=255)
    img.putalpha(mask.filter(ImageFilter.GaussianBlur(SS)))
    return img.resize((w, h), Image.LANCZOS)


def piece(d, kind, x, y, s, color, accent, light, rng):
    c = shade(color, light)
    hi = shade(color, light * 1.18)
    dark = shade(color, light * 0.7)
    shadow = (0, 0, 0, 60)
    if kind in ('grain', 'ball'):
        r = s / 2
        d.ellipse([x - r, y - r * 0.6 + r * 0.25, x + r, y + r * 0.6 + r * 0.45], fill=shadow)
        d.ellipse([x - r, y - r, x + r, y + r], fill=dark + (255,))
        d.ellipse([x - r * 0.92, y - r * 0.98, x + r * 0.8, y + r * 0.78], fill=c + (255,))
        d.ellipse([x - r * 0.55, y - r * 0.7, x - r * 0.05, y - r * 0.25], fill=hi + (230,))
        if accent and kind == 'ball':
            d.ellipse([x - r * 0.25, y - r * 1.1, x + r * 0.25, y - r * 0.7], fill=accent + (255,))
    elif kind == 'chunk':
        # 圆润的一块：侧面暗、顶面亮（切开的面用点缀色），带一圈淡影子
        w, h = s * rng.uniform(0.45, 0.6), s * rng.uniform(0.28, 0.36)
        d.ellipse([x - w + s * 0.05, y - h * 0.4 + s * 0.12, x + w + s * 0.05, y + h + s * 0.12], fill=shadow)
        d.ellipse([x - w, y - h * 0.5, x + w, y + h], fill=dark + (255,))
        d.ellipse([x - w * 0.96, y - h * 0.8, x + w * 0.9, y + h * 0.55], fill=c + (255,))
        d.ellipse([x - w * 0.62, y - h * 0.62, x + w * 0.5, y + h * 0.18], fill=(accent if accent else hi) + (255,))
    elif kind == 'leaf':
        a = rng.uniform(0, math.pi)
        dx, dy = math.cos(a) * s * 0.6, math.sin(a) * s * 0.3
        d.ellipse([x - s * 0.5, y - s * 0.2, x + s * 0.5, y + s * 0.2], fill=dark + (255,))
        d.polygon([(x - dx, y - dy), (x - dy * 0.6, y + dx * 0.3), (x + dx, y + dy), (x + dy * 0.6, y - dx * 0.3)], fill=c + (255,))
        d.line([(x - dx, y - dy), (x + dx, y + dy)], fill=hi + (255,), width=max(1, int(s * 0.06)))
    elif kind == 'fish':
        d.ellipse([x - s * 0.5, y - s * 0.13, x + s * 0.42, y + s * 0.15], fill=c + (255,), outline=dark + (255,))
        d.polygon([(x + s * 0.38, y), (x + s * 0.58, y - s * 0.14), (x + s * 0.58, y + s * 0.14)], fill=(accent or dark) + (255,))
        d.ellipse([x - s * 0.38, y - s * 0.05, x - s * 0.3, y + s * 0.03], fill=(40, 40, 40, 255))
    elif kind == 'dumpling':
        # 胖乎乎的一个：扁圆的身子、上面一道捏出来的褶（亮一点）
        d.ellipse([x - s * 0.5, y - s * 0.05, x + s * 0.55, y + s * 0.32], fill=shadow)
        d.ellipse([x - s * 0.5, y - s * 0.3, x + s * 0.5, y + s * 0.26], fill=dark + (255,))
        d.ellipse([x - s * 0.47, y - s * 0.34, x + s * 0.44, y + s * 0.18], fill=c + (255,))
        d.chord([x - s * 0.36, y - s * 0.46, x + s * 0.36, y - s * 0.02], 180, 360, fill=hi + (255,))
        if accent:
            d.line([(x - s * 0.34, y - s * 0.06), (x + s * 0.34, y - s * 0.06)], fill=accent + (255,), width=max(1, int(s * 0.07)))
    elif kind == 'rod':
        a = rng.uniform(-0.5, 0.5)
        dx, dy = math.cos(a) * s * 0.5, math.sin(a) * s * 0.5
        d.line([(x - dx, y - dy + s * 0.08), (x + dx, y + dy + s * 0.08)], fill=(0, 0, 0, 60), width=int(s * 0.3))
        d.line([(x - dx, y - dy), (x + dx, y + dy)], fill=c + (255,), width=int(s * 0.26))
        d.line([(x - dx, y - dy - s * 0.06), (x + dx, y + dy - s * 0.06)], fill=hi + (255,), width=max(1, int(s * 0.07)))


def foods():
    S = scene()
    rx, ry = S['bowl']['rx'], S['bowl']['ry']
    w = MOUND_W
    h = round(w * ry / rx)
    os.makedirs(FOODS_OUT, exist_ok=True)
    total = 0
    for i, fid in enumerate(S['foods']):
        path = os.path.join(FOODS_OUT, f'{fid}.png')
        im = mound(fid, w, h, seed=i * 7 + 3)
        im.quantize(colors=128, method=Image.Quantize.FASTOCTREE).save(path, optimize=True)
        total += os.path.getsize(path)
    print(f'  ✓  {len(S["foods"])} 样吃的盛在碗里的图 → {FOODS_OUT}（共 {total // 1024} KB）')


def preview(path):
    S = scene()
    ids = S['foods']
    w = MOUND_W
    h = round(w * S['bowl']['ry'] / S['bowl']['rx'])
    cols = 9
    sheet = Image.new('RGBA', (cols * (w + 10), ((len(ids) + cols - 1) // cols) * (h + 10)), (120, 170, 70, 255))
    for i, fid in enumerate(ids):
        im = Image.open(os.path.join(FOODS_OUT, f'{fid}.png')).convert('RGBA')
        sheet.alpha_composite(im, ((i % cols) * (w + 10), (i // cols) * (h + 10)))
    sheet.save(path)
    print(f'→ {path}')


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('--preview', default=None)
    a = ap.parse_args()
    if a.preview:
        preview(a.preview)
    else:
        rims()
        foods()
