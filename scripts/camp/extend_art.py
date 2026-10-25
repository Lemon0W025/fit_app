"""营地画的上下各补一截（上面接天空、下面接草地）：缩小看全景（整幅宽度）时也盖满屏幕、看不到边

    python3 scripts/camp/extend_art.py [--preview 目录]
    python3 scripts/camp/extend_art.py --crop      # 裁出给 Codex 重画天空的两张：art/raw/camp/in-sky.png、in-night-sky.png（工单第 1e 节）

营地画是正方形，竖着的手机屏要放下整幅宽度，上下就得有差不多两倍高的内容。这里在画上面补 SCENE.frame.top 高的天空、
下面补 SCENE.frame.bottom 高的草地（画的像素）：
  草地：从画上「纯草地」的地方（下缘一条、左右两边，避开食盆、木盖和夜里火照到的地方）取 256 见方的小块，按 Efros-Freeman
        的拼法一块块接：每块挑和已经拼好的边最像的，沿误差最小的曲线接缝。日景、夜景用同一套块和接缝（两张画是同一个构图），
        白天黑夜是同一片草。画最下面约 100 像素生成时发虚，所以草地从画里面 SCENE.frame.overlap 处就盖上去，接缝在发虚那段上面
  天空：画最上面一行往上接：每一列从那一行的天色出发，渐渐变成往上越来越深的天色；被画顶切掉的云（最上面一行发白的那几段）
        长出圆鼓鼓的云顶；高处再飘几朵云；夜里是深蓝、几颗画上那种四角小星
输出：
    art/camp/u{行}{列}.jpg、d{行}{列}.jpg（+ night-）   天空两行、草地两行，每行 4 块，和底图切块一起 npm run wx:art 传云存储（campArt）
    miniprogram/images/camp/base/world.jpg、night-world.jpg   包里垫的整个世界（768 宽）：一打开就有，高清块下完盖在上面
画换了重跑（在 cut_art.py 之后）。Codex 按工单第 1e 节画了天空（art/raw/camp/out-sky.png、out-night-sky.png）就用它的上半张当天空，
紧挨着画顶那一小段还是从画顶一行接过来（接得上）。需要 Pillow 和 numpy。
"""
import argparse
import json
import os
import subprocess
import time

import numpy as np
from PIL import Image, ImageDraw

REPO = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..'))
RAW = os.path.join(REPO, 'art', 'raw', 'camp')
OUT = os.path.join(REPO, 'art', 'camp')
LOCAL = os.path.join(REPO, 'miniprogram', 'images', 'camp', 'base')
RES = {'': 0.75, 'night-': 0.5}   # 和底图切块一样：日景 3072 宽、夜景 2048 宽
LOCAL_RES = 0.1875                # 包里垫的整个世界：768 宽
TILE = 1024                       # 一块（画的像素）
HAZE = 100                        # 画最下面发虚的那段：接缝要在它上面（草地从画里面 SCENE.frame.overlap 处盖上去）
PATCH = 256                       # 草地小块（画的像素）
SEAM = 64                         # 相邻小块重叠多宽（接缝在这里面走）
CANDIDATES = 2500                 # 每块从这么多个候选位置里挑
TOLERANCE = 1.25                  # 误差在最好的 1.25 倍以内的都可能被挑中（不然到处是同一块、越拼越光秃）
SKY = {'': ((97, 189, 251), (58, 146, 236)), 'night-': ((6, 54, 143), (3, 22, 78))}  # 画顶的天色 → 补出来的最高处


def scene():
    js = ("const C=require('./cloudfunctions/api/lib/shared/camp');"
          "console.log(JSON.stringify({W:C.W,H:C.H,frame:C.SCENE.frame,fire:C.SCENE.fire}))")
    return json.loads(subprocess.check_output(['node', '-e', js], cwd=REPO))


OV = scene()['frame']['overlap']        # 草地从画里面这么深就盖上去（画最下面发虚的那段被新草换掉）


def sm(v, a, b):
    t = np.clip((v - a) / (b - a), 0, 1)
    return t * t * (3 - 2 * t)


def load(name, res, W):
    return np.asarray(Image.open(os.path.join(RAW, name)).convert('RGB').resize((round(W * res),) * 2, Image.LANCZOS)).astype(np.float32)


# ---------------------------------------------------------------- 草地

def meadow_ok(X, Y, H):
    """(X, Y) 画的像素：能当草地小块取的地方（避开食盆、木盖、石圈，和画最下面发虚的那段）"""
    low = (Y >= 3420) & (Y <= H - HAZE - 8)                              # 食盆下面那一片
    sides = (Y >= 2300) & (Y <= H - HAZE - 8) & ((X <= 1050) | (X >= 3300))  # 左右两边
    return low | sides


def min_cut(err):
    """err：h×w，从上到下误差最小的一条路（每行一个列号）"""
    h, w = err.shape
    cost = err.astype(np.float64).copy()
    back = np.zeros((h, w), np.int8)
    for i in range(1, h):
        prev = cost[i - 1]
        stack = np.stack([np.r_[np.inf, prev[:-1]], prev, np.r_[prev[1:], np.inf]])
        j = np.argmin(stack, 0)
        cost[i] += stack[j, np.arange(w)]
        back[i] = j - 1
    path = np.zeros(h, int)
    path[-1] = int(np.argmin(cost[-1]))
    for i in range(h - 1, 0, -1):
        path[i - 1] = min(w - 1, max(0, path[i] + back[i, path[i]]))
    return path


def night_even(night, res):
    """夜景里和远处草地一样暗、一样冷的地方：帐篷的灯、篝火照到的地方发亮偏黄，从那儿取的块夜里会一块一块的（小白花压住不算）"""
    lum = np.minimum(0.299 * night[..., 0] + 0.587 * night[..., 1] + 0.114 * night[..., 2], 62)
    gb = np.minimum(night[..., 1] - night[..., 2], 0)
    cell = round(128 * res)
    small = lambda a: np.asarray(Image.fromarray(a.astype(np.float32), 'F').resize((max(1, a.shape[1] // cell), max(1, a.shape[0] // cell)), Image.BOX).resize((a.shape[1], a.shape[0]), Image.BILINEAR))
    return (small(lum) <= 56) & (small(gb) <= -18)


def quilt(day, night, res, H, below, seed=11):
    """在画下面拼一条草地，日景、夜景同一套块和接缝（夜景每块的颜色按旁边拼好的拉平），返回 (日景条带, 夜景条带, 哪些像素还是画本身, 块数)。
    条带盖住画的 [H - OV, H + below)（画的像素）"""
    rng = np.random.default_rng(seed)
    n = day.shape[0]
    B = round(PATCH * res)
    O = round(SEAM * res)
    keep = round((OV - HAZE) * res)       # 画里面接缝能走的那几行（发虚那段之上）
    o = round(OV * res)
    Hc = round((OV + below) * res)
    srcs = (day, night)
    canvases = [np.zeros((Hc, n, 3), np.float32) for _ in srcs]
    for c, src in zip(canvases, srcs):
        c[:o] = src[n - o:]
    filled = np.zeros((Hc, n), bool)
    filled[:keep] = True
    kept = np.zeros((Hc, n), bool)
    kept[:o] = True
    ys, xs = np.mgrid[0:n - B:4, 0:n - B:4]
    ok = np.ones(ys.shape, bool)
    for dy in (0, B):
        for dx in (0, B):
            ok &= meadow_ok((xs + dx) / res, (ys + dy) / res, H)
    even = night_even(night, res)
    integral = np.pad(even.astype(np.int32).cumsum(0).cumsum(1), ((1, 0), (1, 0)))
    share = (integral[ys + B, xs + B] - integral[ys, xs + B] - integral[ys + B, xs] + integral[ys, xs]) / (B * B)
    ok &= share >= 0.9
    cand = np.stack([ys[ok], xs[ok]], 1)
    print(f'  草地小块的候选位置 {len(cand)} 个')
    cand = cand[rng.choice(len(cand), min(len(cand), CANDIDATES), replace=False)]
    step = B - O
    y0 = 0
    count = 0
    while y0 < Hc:
        x0 = 0
        top = keep if y0 == 0 else O
        while x0 < n:
            h, w = min(B, Hc - y0), min(B, n - x0)
            fill = filled[y0:y0 + h, x0:x0 + w]
            m = fill[::2, ::2]
            # 按日景挑（夜景一起算的话，夜里白花对比太强，挑出来全是光秃秃的草）
            t = canvases[0][y0:y0 + h:2, x0:x0 + w:2][m]
            errs = np.zeros(len(cand))
            if m.any():
                for i, (cy, cx) in enumerate(cand):
                    errs[i] = ((day[cy:cy + h:2, cx:cx + w:2][m] - t) ** 2).mean()
            pick = rng.choice(np.nonzero(errs <= errs.min() * TOLERANCE + 1e-9)[0])
            cy, cx = cand[pick]
            e = ((day[cy:cy + h, cx:cx + w] - canvases[0][y0:y0 + h, x0:x0 + w]) ** 2).sum(-1)
            use = np.ones((h, w), bool)
            if x0 > 0:
                path = min_cut(e[:, :O])
                for i in range(h):
                    use[i, :path[i]] = False
            if top:
                path = min_cut(e[:top, :].T)
                for j in range(w):
                    use[:path[j], j] = False
            use |= ~fill
            for i, (src, c) in enumerate(zip(srcs, canvases)):
                piece = src[cy:cy + h, cx:cx + w]
                if i and fill.any():
                    # 夜景：画上有的地方被帐篷灯、篝火照得发亮偏黄，按已经拼好的那圈把这块的颜色拉平（每个通道乘一个数）
                    have = c[y0:y0 + h, x0:x0 + w][fill].mean(0)
                    mine = piece[fill].mean(0)
                    piece = piece * np.clip(have / np.maximum(mine, 1), 0.75, 1.3)
                c[y0:y0 + h, x0:x0 + w][use] = piece[use]
            kept[y0:y0 + h, x0:x0 + w][use] = False
            filled[y0:y0 + h, x0:x0 + w] = True
            count += 1
            if x0 + w >= n:
                break
            x0 += step
        if y0 + h >= Hc:
            break
        y0 += step
    return canvases[0], canvases[1], kept, count


# ---------------------------------------------------------------- 天空

def puff(size, circles):
    """一团云的形状：几个圆的并集（抗锯齿），circles 是 [(cx, cy, r)]（像素），返回 0～1"""
    h, w = size
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    d = np.full((h, w), np.inf, np.float32)
    for cx, cy, r in circles:
        d = np.minimum(d, np.hypot(xx - cx, yy - cy) - r)
    return np.clip(0.5 - d / 1.6, 0, 1)


def cloud_segments(row, night):
    """画最上面一行里发白（云）的几段：[(起, 止)]（像素，含）"""
    R, G, B = row[:, 0], row[:, 1], row[:, 2]
    lum = 0.299 * R + 0.587 * G + 0.114 * B
    sat = (row.max(1) - row.min(1)) / np.maximum(row.max(1), 1)
    cloud = (lum > np.median(lum) + 12) if night else ((sat < 0.25) & (lum > 200))
    xs = np.nonzero(cloud)[0]
    if not len(xs):
        return []
    cut = np.nonzero(np.diff(xs) > 3)[0]
    starts = np.r_[xs[0], xs[cut + 1]]
    ends = np.r_[xs[cut], xs[-1]]
    return [(int(a), int(b)) for a, b in zip(starts, ends) if b - a >= 12]


def codex_sky(pfx, n, Ht, res):
    """Codex 画的天空（有的话）：out-*sky.png 是世界最上面 2×top 画像素高、整幅宽的那块（上半张是天空），缩放到这个分辨率返回天空那半"""
    path = os.path.join(RAW, f'out-{pfx}sky.png')
    if not os.path.exists(path):
        return None
    im = Image.open(path).convert('RGB').resize((n, 2 * Ht), Image.LANCZOS)
    return np.asarray(im).astype(np.float32)[:Ht]


def sky(img, res, top, pfx, seed=5):
    """画顶上补的天空（top 画像素高），返回从最高处到紧挨着画顶那一行的条带"""
    rng = np.random.default_rng(seed)
    night = bool(pfx)
    n = img.shape[1]
    Ht = round(top * res)
    row = img[0]
    segs = cloud_segments(row, night)
    # 每一列的天色：只看真正的天（云和云边那圈发白的都不算），横着大范围抹匀；不然云边的白会往上拖出一道道亮光
    R, G, B = row[:, 0], row[:, 1], row[:, 2]
    lum = 0.299 * R + 0.587 * G + 0.114 * B
    clear = lum < np.median(lum) + (4 if night else 6)
    clear &= ~np.convolve(~clear, np.ones(2 * round(30 * res) + 1), 'same').astype(bool)
    xs = np.arange(n)
    base = np.stack([np.interp(xs, xs[clear], row[clear, c]) for c in range(3)], 1)
    k = max(1, round(260 * res))
    kernel = np.exp(-0.5 * (np.arange(-2 * k, 2 * k + 1) / k) ** 2)
    kernel /= kernel.sum()
    base = np.stack([np.convolve(np.pad(base[:, c], 2 * k, mode='edge'), kernel, 'valid') for c in range(3)], 1)
    c0, c1 = (np.array(c, np.float32) for c in SKY[pfx])
    up = (Ht - np.arange(Ht))[:, None].astype(np.float32)            # 离画顶多远（像素），最高处 = Ht
    grad = c0 + (c1 - c0) * sm(up / Ht, 0, 1)[..., None]
    w = sm(up, 0, 320 * res)[..., None]
    band = base[None] * (1 - w) + grad * w
    # 紧挨着画顶的几行：和画最上面那一行一模一样（接得上）
    exact = sm(up, 1, 24 * res)[..., None]
    band = row[None] * (1 - exact) + band * exact
    # 画顶切掉的云：长出圆鼓鼓的云顶（底边和画上那段一样宽，颜色从画上那一行接过来）
    for a, b in segs:
        wd = b - a + 1
        h = round(wd * 0.62)
        pad = round(wd * 0.15)
        box_w = wd + 2 * pad
        circles = [(pad + wd * 0.5, h + wd * 0.08, wd * 0.5), (pad + wd * 0.28, h - wd * 0.12, wd * 0.25),
                   (pad + wd * 0.62, h - wd * 0.24, wd * 0.3), (pad + wd * 0.84, h - wd * 0.06, wd * 0.2)]
        shape = puff((h, box_w), circles)
        # 贴着画顶那几行：只在画上那段里（画上那段外面是天，云不能伸出去）
        yy = np.arange(h)[:, None]
        xx = np.arange(box_w)[None]
        inside = ((xx >= pad) & (xx < pad + wd)).astype(np.float32)
        near = sm(h - yy, 0, wd * 0.12)                                 # 0 在画顶，往上变 1
        shape = shape * (inside * (1 - near) + near)
        edge = row[a:b + 1]
        seam = np.zeros((box_w, 3), np.float32)
        seam[pad:pad + wd] = edge
        seam[:pad] = edge[0]
        seam[pad + wd:] = edge[-1]
        if night:
            hi = np.array([58, 108, 196], np.float32)
        else:
            hi = np.array([253, 253, 252], np.float32)
        t = sm(h - yy, 0, h * 0.7)[..., None]                           # 0 在画顶 → 1 在云顶
        col = seam[None] * (1 - t) + hi * t
        x0 = a - pad
        lo_x, hi_x = max(0, x0), min(n, x0 + box_w)
        sl = slice(lo_x - x0, hi_x - x0)
        dst = band[Ht - h:Ht, lo_x:hi_x]
        al = shape[:, sl][..., None]
        band[Ht - h:Ht, lo_x:hi_x] = dst * (1 - al) + col[:, sl] * al
    # 高处飘几朵云（白天）：一团团鼓起来的顶、底下微微压平、上白下淡蓝
    if not night:
        for cx_f, cy_f, wd in ((0.16, 0.34, 520), (0.58, 0.22, 640), (0.86, 0.46, 430)):
            wd *= res
            hh = wd * 0.52
            box_w, box_h = round(wd * 1.1), round(hh * 1.25)
            base_y = hh * 1.02
            circles = [(box_w * 0.5, base_y - wd * 0.2, wd * 0.25), (box_w * 0.32, base_y - wd * 0.12, wd * 0.18),
                       (box_w * 0.68, base_y - wd * 0.14, wd * 0.2), (box_w * 0.18, base_y - wd * 0.04, wd * 0.12),
                       (box_w * 0.83, base_y - wd * 0.05, wd * 0.13), (box_w * 0.42, base_y - wd * 0.3, wd * 0.15)]
            shape = puff((box_h, box_w), circles)
            yy = np.arange(box_h)[:, None]
            shape = shape * (1 - sm(yy, base_y - 3 * res, base_y + 5 * res))     # 底边压平、软一点
            t = sm(yy / base_y, 0.45, 1.0)[..., None]
            col = np.array([253, 253, 252], np.float32) * (1 - t) + np.array([208, 224, 243], np.float32) * t
            x0, y0 = round(cx_f * n - box_w / 2), round(cy_f * Ht - box_h / 2)
            lo_x, hi_x = max(0, x0), min(n, x0 + box_w)
            sx = slice(lo_x - x0, hi_x - x0)
            al = shape[:, sx][..., None]
            band[y0:y0 + box_h, lo_x:hi_x] = band[y0:y0 + box_h, lo_x:hi_x] * (1 - al) + col[:, sx] * al
    if night:
        stars(band, rng, res)
    painted = codex_sky(pfx, n, Ht, res)
    if painted is not None:
        keep = sm(up, 60 * res, 200 * res)[..., None]        # 紧挨着画顶那一小段用上面接出来的（和画顶一行接得上），往上换成 Codex 画的
        band = band * (1 - keep) + painted * keep
    return band


def crop():
    """裁出给 Codex 的：世界最上面那块（补的天空 + 营地画上半截），1024 见方，Codex 只重画上半张的天空"""
    S = scene()
    W, F = S['W'], S['frame']
    for pfx, name in (('', 'camp-hd.png'), ('night-', 'night-hd.png')):
        res = RES[pfx]
        img = load(name, res, W)
        band = sky(img, res, F['top'], pfx)
        top = np.concatenate([band, img[:round(F['top'] * res)]], 0)
        out = os.path.join(RAW, f'in-{pfx}sky.png')
        Image.fromarray(np.uint8(np.clip(top, 0, 255))).resize((1024, 1024), Image.LANCZOS).save(out)
        print(f'  ✓  {out}')
    print('Codex 按工单第 1e 节画 out-sky.png、out-night-sky.png（1024 见方、只改上半张），回来再跑 python3 scripts/camp/extend_art.py')


def stars(band, rng, res):
    """画上那种四角小星：一个亮点 + 十字的四个尖 + 一圈很淡的光"""
    Ht, n = band.shape[:2]
    img = Image.fromarray(np.zeros((Ht, n), np.uint8))
    d = ImageDraw.Draw(img)
    for _ in range(46):
        x, y = rng.uniform(0, n), rng.uniform(0, Ht * 0.92)
        s = rng.uniform(5, 11) * res
        d.polygon([(x, y - 2.2 * s), (x + 0.45 * s, y - 0.45 * s), (x + 2.2 * s, y), (x + 0.45 * s, y + 0.45 * s),
                   (x, y + 2.2 * s), (x - 0.45 * s, y + 0.45 * s), (x - 2.2 * s, y), (x - 0.45 * s, y - 0.45 * s)], fill=255)
    m = np.asarray(img).astype(np.float32) / 255
    glow = np.asarray(img.resize((max(1, n // 6), max(1, Ht // 6)), Image.BOX).resize((n, Ht), Image.BICUBIC)).astype(np.float32) / 255
    a = np.clip(m + glow * 1.4, 0, 1)[..., None]
    band[:] = band * (1 - a) + np.array([236, 242, 255], np.float32) * a


# ---------------------------------------------------------------- 出图

def build(preview=None):
    S = scene()
    W, H, F = S['W'], S['H'], S['frame']
    os.makedirs(OUT, exist_ok=True)
    os.makedirs(LOCAL, exist_ok=True)
    t0 = time.time()
    day = load('camp-hd.png', RES[''], W)
    night_hi = load('night-hd.png', RES[''], W)                      # 夜景先放大到日景的分辨率一起拼，再缩回去
    meadow_day, meadow_night, kept, count = quilt(day, night_hi, RES[''], H, F['bottom'])
    print(f'草地拼好：{count} 块，{time.time() - t0:.0f} 秒')
    night = load('night-hd.png', RES['night-'], W)
    worlds = {}
    for pfx, img, meadow in (('', day, meadow_day), ('night-', night, meadow_night)):
        res = RES[pfx]
        if pfx:
            size = (img.shape[1], round((OV + F['bottom']) * res))
            meadow = np.asarray(Image.fromarray(np.uint8(np.clip(meadow, 0, 255))).resize(size, Image.LANCZOS)).astype(np.float32)
            # 接缝上面留着的画：直接用这个分辨率的夜景（和夜景底图切块一模一样，盖上去不差一丝）
            k = np.asarray(Image.fromarray(np.uint8(kept * 255)).resize(size, Image.BILINEAR)).astype(np.float32)[..., None] / 255
            rows = np.zeros_like(meadow)
            o = round(OV * res)
            rows[:o] = img[img.shape[0] - o:]
            meadow = rows * k + meadow * (1 - k)
        top = sky(img, res, F['top'], pfx)
        n = img.shape[1]
        # 整个世界（这个分辨率）：天空 + 画 + 草地（草地盖住画最下面 OV 那段）
        world = np.concatenate([top, img[:n - round(OV * res)], meadow], 0)
        worlds[pfx] = world
        tiles(world, pfx, res, F, H)
        lo = Image.fromarray(np.uint8(np.clip(world, 0, 255))).resize((round(W * LOCAL_RES), round((H + F['top'] + F['bottom']) * LOCAL_RES)), Image.LANCZOS)
        path = os.path.join(LOCAL, f'{pfx}world.jpg')
        lo.save(path, quality=74, optimize=True, progressive=True)
        print(f'  ✓  包里垫的整个世界 {pfx}world.jpg {lo.width}×{lo.height}  {os.path.getsize(path) // 1024} KB')
    if preview:
        os.makedirs(preview, exist_ok=True)
        for pfx, world in worlds.items():
            im = Image.fromarray(np.uint8(np.clip(world, 0, 255)))
            im.resize((600, round(600 * im.height / im.width)), Image.LANCZOS).save(os.path.join(preview, f'{pfx or "day-"}world.jpg'), quality=88)
        print(f'预览 → {preview}')


def tiles(world, pfx, res, F, H):
    """天空 u0*（最高那行）、u1*；草地 d0*（多盖住画最下面 OV 那段）、d1*。每行 4 块"""
    rows = {'u0': (0, TILE), 'u1': (TILE, 2 * TILE), 'd0': (F['top'] + H - OV, F['top'] + H + TILE), 'd1': (F['top'] + H + TILE, F['top'] + H + 2 * TILE)}
    total = 0
    for name, (y0, y1) in rows.items():
        for col in range(4):
            box = (round(col * TILE * res), round(y0 * res), round((col + 1) * TILE * res), round(y1 * res))
            tile = Image.fromarray(np.uint8(np.clip(world[box[1]:box[3], box[0]:box[2]], 0, 255)))
            path = os.path.join(OUT, f'{pfx}{name}{col}.jpg')
            tile.save(path, quality=85, optimize=True)
            total += os.path.getsize(path)
    print(f'  ✓  {pfx or "日景"}上下 16 块 → {OUT}，共 {total // 1024} KB')


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('--preview', default=None)
    ap.add_argument('--crop', action='store_true')
    a = ap.parse_args()
    if a.crop:
        crop()
        raise SystemExit
    build(a.preview)
    print('→ 接着 npm run wx:art（和底图切块一起传），包里的 world.jpg 已更新')
