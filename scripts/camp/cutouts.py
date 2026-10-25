"""帐篷和暖暖锅的「抠图层」：从高清营地图里把它们抠成独立的透明图，盖在底图上，宠物走到后面就被挡住；锅还按今天打了几顿换图

    python3 scripts/camp/cutouts.py --crop [art/raw/camp/camp-hd.png]   # 裁出给 Codex 的块：art/raw/cut/in-pot.png 等（范围是 shared/camp.js 的 SCENE.cutouts）
    python3 scripts/camp/cutouts.py [--local]                           # 用 Codex 画的 out-pot-1～3 换掉锅里的过渡版
    加 --night：对夜景做同样的事（裁 art/raw/camp/night-hd.png → in-night-*.png；合成 night-pot-N）
    python3 scripts/camp/cutouts.py --from-base [--local] [--check out-dir]
        不等 Codex 的「去掉」版，直接从画上抠出物件本身的精确轮廓（日景、夜景一起出）：
        poly 只圈个大概，圈里按颜色去掉草地（偏绿）、树林深处的暗青，只留和物件身上几个点（SEEDS）连着的那一大块（草里的花、碎叶断开就丢了），
        边缘按「像草的程度」留半透明；夜景构图和日景一样，直接用日景算出的轮廓。锅里的内容由 pot_fill.py 画在锅口里。
        日景按 0.75（和底图切块一样 3072 宽）、夜景按 0.5（2048 宽）出，像素和底图切块对齐；--check 把每张抠图贴在品红底上存一份看边
        空锅 pot-0 只在锅是空的（火没点）时用，所以从 fire_off.py 熄了火的画上抠；夜里的木盖被火照着，另出一张熄火版 night-lid-off
        Codex 的 B 批出了再用下面的比对法覆盖

Codex 在裁出来的锅那块上用 edit 画（其他像素不动）：
    out-pot-1/2/3.png      锅里一层粥底 / 加了菜 / 满锅冒热气           → 精确轮廓 ∪ 画了内容的地方 → pot-1～3（替换 pot_fill.py 画的过渡版）
（以前还要 Codex 画「去掉帐篷 / 去掉锅」两版来比对范围，现在 --from-base 直接从画上抠精确轮廓，不需要了）
需要 Pillow 和 numpy。
"""
import argparse
import json
import os
import subprocess

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

from pot_fill import fill, night_tone

REPO = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..'))
RAW = os.path.join(REPO, 'art', 'raw', 'cut')
OUT = os.path.join(REPO, 'art', 'cut')
LOCAL = os.path.join(REPO, 'miniprogram', 'images', 'camp', 'cut')
DAY_RES = 0.75         # 日景抠图的分辨率（相对 4096 的画）：和日景底图切块一样，盖上去像素对得上、不糊
NIGHT_RES = 0.5        # 夜景：和夜景底图切块一样
LOCAL_RES = 0.16       # 包里的兜底小图
DAY_HD = os.path.join(REPO, 'art', 'raw', 'camp', 'camp-hd.png')
NIGHT_HD = os.path.join(REPO, 'art', 'raw', 'camp', 'night-hd.png')
# 物件身上的几个点（画的像素）：只留和它们连着的那一大块
SEEDS = {
    'tent': [(600, 800), (1000, 1100), (1350, 1150), (250, 1150), (700, 1400), (1530, 1200)],
    'pot': [(2050, 2550), (2100, 1830), (2055, 2080), (1690, 2520), (2550, 2700), (2470, 2470)],
    'lid': [(1680, 2840)],
    'lantern': [(2665, 2760), (2665, 2610), (2668, 2530)],
}


def scene():
    js = "const C=require('./cloudfunctions/api/lib/shared/camp');console.log(JSON.stringify({W:C.W,cutouts:C.SCENE.cutouts,fire:C.SCENE.fire,flame:C.SCENE.flame}))"
    return json.loads(subprocess.check_output(['node', '-e', js], cwd=REPO))


def smooth(lo, hi, v):
    t = np.clip((v - lo) / (hi - lo), 0, 1)
    return t * t * (3 - 2 * t)


def objectness(rgb):
    """每个像素「是物件不是草地」的程度 0～1：
    草地和叶子绿得多（G 占 RGB 的比例高、G 比 R、B 都大一截），帐篷的橄榄绿、木头、锅、石头、绳子都不算；树林深处暗青色的也算背景"""
    a = np.asarray(rgb).astype(np.float32)
    R, G, B = a[..., 0], a[..., 1], a[..., 2]
    grass = smooth(0.415, 0.45, G / (R + G + B + 1)) * smooth(10, 22, G - np.maximum(R, B))
    forest = (np.maximum(np.maximum(R, G), B) < 110) & (G >= R) & (B >= R - 10)
    return (1 - grass) * ~forest


def poly_mask(size, polys, k, l, t, grow=0):
    m = Image.new('L', size, 0)
    d = ImageDraw.Draw(m)
    for poly in polys:
        d.polygon([(x * k - l, y * k - t) for x, y in poly], fill=255)
    if grow:
        m = m.filter(ImageFilter.MaxFilter(2 * grow + 1))
    return np.asarray(m) > 0


def bitmap(a):
    return Image.fromarray(a.astype(np.uint8) * 255)


def reconstruct(seed, mask):
    """seed 在 mask 里一圈圈长，长到不再变：mask 里和 seed 连着的部分"""
    cur = bitmap(seed & mask)
    m = np.asarray(bitmap(mask))
    prev = -1
    while True:
        for _ in range(25):
            cur = Image.fromarray(np.minimum(np.asarray(cur.filter(ImageFilter.MaxFilter(3))), m))
        total = int(np.asarray(cur).sum())
        if total == prev:
            return np.asarray(cur) > 0
        prev = total


def object_alpha(img, key, S):
    """在高清日景上抠 key 的精确轮廓：返回 box 那块的 alpha（L 模式，img 的分辨率）"""
    k = img.width / S['W']
    c = S['cutouts'][key]
    l, t, r, b = [round(v * k) for v in c['box']]
    crop = img.crop((l, t, r, b))
    obj = objectness(crop) * poly_mask(crop.size, [c['poly']], k, l, t, grow=4)
    if key == 'pot':
        # 木盖在锅前面，自己一层；火苗在锅底下那层逐帧动：都不抠进锅里
        cut = poly_mask(crop.size, [S['cutouts']['lid']['poly'], S['flame']['zone']], k, l, t, grow=2)
        obj = obj * ~cut
    hard = obj > 0.5
    seed = np.zeros_like(hard)
    for x, y in SEEDS[key]:
        X, Y = round(x * k - l), round(y * k - t)
        if not hard[Y, X]:
            raise SystemExit(f'{key} 的种子点 ({x}, {y}) 不在物件上：画换了就重新量 SEEDS')
        seed[Y - 3:Y + 4, X - 3:X + 4] = True
    # 先开运算（细的花茎、草叶连着的地方断开），从种子长出物件那一大块，再放回被开运算削掉的边
    opened = np.asarray(bitmap(hard).filter(ImageFilter.MinFilter(5)).filter(ImageFilter.MaxFilter(5))) > 0
    core = reconstruct(seed, opened)
    keep = (np.asarray(bitmap(core).filter(ImageFilter.MaxFilter(7))) > 0) & hard
    near = np.asarray(bitmap(keep).filter(ImageFilter.MaxFilter(5))) > 0
    # 边缘按「像草的程度」留半透明，再往里收一像素：挡在宠物前面时不带一圈草绿
    alpha = Image.fromarray((obj * near * 255).astype(np.uint8)).filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(0.7))
    return alpha


def from_base(local, check=None):
    """日景、夜景的抠图层一起出：轮廓在高清日景上算一次，两套共用"""
    S = scene()
    W = S['W']
    day_hd = Image.open(DAY_HD).convert('RGB')
    # 和 cut_art.py 一样先把整张画缩到底图切块的分辨率再裁：抠图的像素和底图一模一样
    full = {
        '': day_hd.resize((round(W * DAY_RES),) * 2, Image.LANCZOS),
        'night-': Image.open(NIGHT_HD).convert('RGB').resize((round(W * NIGHT_RES),) * 2, Image.LANCZOS),
    }
    tone = night_tone()
    from fire_off import unlit_day, unlit_night   # fire_off 也用这里的 objectness，放在这儿 import 免得互相引用
    day_off = unlit_day(day_hd).resize(full[''].size, Image.LANCZOS)
    unlit = {'': day_off, 'night-': unlit_night(full['night-'], day_off)}
    os.makedirs(OUT, exist_ok=True)
    if check:
        os.makedirs(check, exist_ok=True)
    for key, c in S['cutouts'].items():
        alpha_hd = object_alpha(day_hd, key, S)
        for pfx, img in full.items():
            res = img.width / W
            box = [round(v * res) for v in c['box']]
            crop = img.crop(box)
            alpha = alpha_hd.resize(crop.size, Image.LANCZOS)
            if key == 'lid' and pfx:
                emit_full(unlit[pfx].crop(box), alpha, f'{pfx}lid-off.png', local, res)
            for n in ([0, 1, 2, 3] if key == 'pot' else [None]):
                rgb = unlit[pfx].crop(box) if n == 0 else crop
                if n:
                    cx, cy, rx, ry = c['rim']
                    rgb = fill(crop, n, (cx * res - box[0], cy * res - box[1], rx * res, ry * res), tone if pfx else None)
                name = f'{pfx}{key}{"-" + str(n) if n is not None else ""}.png'
                emit_full(rgb, alpha, name, local, res)
                if check and n in (None, 0):
                    on = Image.new('RGBA', rgb.size, (255, 0, 255, 255))
                    piece = rgb.convert('RGBA')
                    piece.putalpha(alpha)
                    on.alpha_composite(piece)
                    on.convert('RGB').save(os.path.join(check, name.replace('.png', '-on-magenta.jpg')), quality=88)
    print(f'→ {OUT}（从画上抠的精确轮廓）；接着 npm run wx:art -- cut')


def emit_full(rgb, alpha, name, local, res):
    """云端：WebP（有损 q90 + 无损透明，真彩 PNG 的十分之一大；页面的 image 带 webp 属性，iOS 也能解）；
    包里：缩到 LOCAL_RES 的 256 色 PNG（云端那张加载失败时的兜底）"""
    rgba = rgb.convert('RGBA')
    rgba.putalpha(alpha)
    a = np.array(rgba)
    a[a[:, :, 3] == 0] = 0
    rgba = Image.fromarray(a)
    path = os.path.join(OUT, name.replace('.png', '.webp'))
    rgba.save(path, 'WEBP', quality=90, method=6)
    if local:
        os.makedirs(LOCAL, exist_ok=True)
        small_png(rgba, LOCAL_RES / res).save(os.path.join(LOCAL, name), optimize=True)
    print(f'  ✓  {os.path.basename(path)}  {rgba.width}×{rgba.height}  {os.path.getsize(path) // 1024} KB')


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


def load(name, size=None):
    path = os.path.join(RAW, name)
    if not os.path.exists(path):
        return None
    img = Image.open(path).convert('RGB')
    return img.resize(size, Image.LANCZOS) if size and img.size != size else img


def small_png(rgba, scale):
    """缩小 + 256 色（带透明），体积只有真彩的几分之一"""
    img = rgba.resize((max(1, round(rgba.width * scale)), max(1, round(rgba.height * scale))), Image.LANCZOS)
    a = np.array(img)
    a[:, :, 3][a[:, :, 3] < 6] = 0
    return Image.fromarray(a).quantize(colors=256, method=Image.Quantize.FASTOCTREE)


def with_steam(pot_in, out, base_alpha, rim_y):
    """锅身以内直接用 Codex 的 out；锅外面它只画了锅口飘上去的热气（半透明白烟）。不能把 out 和 in 不一样的那一圈连背后的草一起抠
    （宠物走到锅后面会被一块假草盖住），按「比原画白了多少」反推白烟本身的颜色 S 和透明度 a（out = in·(1−a) + S·a），只取锅口往上的"""
    I = np.asarray(pot_in).astype(float)
    O = np.asarray(out).astype(float)
    b = np.asarray(base_alpha).astype(float) / 255
    lift = (O - I).mean(-1)
    above = np.arange(I.shape[0])[:, None] < rim_y
    smoke = (lift > 12) & (b < 0.5) & above
    if smoke.sum() < 50:
        return out, base_alpha
    # 白烟本身是白的（偏一点暖），只取它多亮：画上最浓的地方也还透着背后的草，直接取颜色会发绿
    L = np.percentile(O[smoke].max(-1), 99)
    S = np.array([L, L, L * 0.97])
    D = S - I
    a = np.clip(((O - I) * D).sum(-1) / np.maximum((D * D).sum(-1), 1), 0, 1) * smooth(6, 16, lift) * above
    alpha = b + a * (1 - b)
    rgb = (O * b[..., None] + S * (a * (1 - b))[..., None]) / np.maximum(alpha, 1e-3)[..., None]
    return Image.fromarray(np.uint8(np.clip(rgb, 0, 255) + 0.5)), Image.fromarray(np.uint8(alpha * 255 + 0.5))


def build(local, pfx):
    """Codex 画好了锅里三态（out-pot-1～3）：锅的范围用从画上抠的精确轮廓，锅口往上加 Codex 画的热气（with_steam）。
    帐篷、空锅不用 Codex 的「去掉」版了（from_base 直接抠得准），这里只换锅里的 1～3 层。"""
    S = scene()
    c = S['cutouts']['pot']
    pot_in = load(f'in-{pfx}pot.png')
    if not pot_in:
        print(f'  ·  还没有 in-{pfx}pot.png（先 python3 scripts/camp/cutouts.py --crop{" --night" if pfx else ""}）')
        return
    base_alpha = object_alpha(Image.open(DAY_HD).convert('RGB'), 'pot', S).resize(pot_in.size, Image.LANCZOS)
    res = NIGHT_RES if pfx else DAY_RES
    size = (round((c['box'][2] - c['box'][0]) * res), round((c['box'][3] - c['box'][1]) * res))
    rim_y = (c['rim'][1] - c['box'][1]) * pot_in.width / (c['box'][2] - c['box'][0])
    os.makedirs(OUT, exist_ok=True)
    done = 0
    for n in (1, 2, 3):
        out = load(f'out-{pfx}pot-{n}.png', pot_in.size)
        if not out:
            print(f'  ·  还没有 out-{pfx}pot-{n}.png')
            continue
        rgb, alpha = with_steam(pot_in, out, base_alpha, rim_y)
        emit_full(rgb.resize(size, Image.LANCZOS), alpha.resize(size, Image.LANCZOS), f'{pfx}pot-{n}.png', local, res)
        done += 1
    print(f'→ {OUT}（锅里 {done} 层换成 Codex 画的）；scripts/wechat.js 的 ART_VERSION.cut 加一，npm run wx:art -- cut，把前缀填进 config.cutArt')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('image', nargs='?', default=os.path.join(REPO, 'art', 'raw', 'camp', 'camp-hd.png'))
    ap.add_argument('--crop', action='store_true')
    ap.add_argument('--local', action='store_true')
    ap.add_argument('--night', action='store_true')
    ap.add_argument('--from-base', action='store_true')
    ap.add_argument('--check', default=None)
    a = ap.parse_args()
    pfx = 'night-' if a.night else ''
    if a.from_base:
        from_base(a.local, a.check)
    elif a.crop:
        crop(a.image if not a.night or a.image != ap.get_default('image') else os.path.join(REPO, 'art', 'raw', 'camp', 'night-hd.png'), pfx)
    else:
        build(a.local, pfx)


if __name__ == '__main__':
    main()
