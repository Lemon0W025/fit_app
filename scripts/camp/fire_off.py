"""篝火没点的样子：今天一顿正餐都没打卡（锅是空的）火就不烧。画上的火是画死在底图里的，这里从画上把火「熄掉」，做成盖在底图上的补丁

    python3 scripts/camp/fire_off.py [--preview 目录]
    python3 scripts/camp/fire_off.py --crop        # 裁出给 Codex 画正式「没点火」版的两块（正方形）：art/raw/cut/in-fire-off.png、in-night-fire-off.png

日景：锅底下木柴之间那几处黄白色的火苗，换成木柴堆里的暗处：木柴按 LOGS 量好的轴线和粗细顺着补全（每根柴的横截面明暗照它露在外面的部分），
      柴缝里是暗的、低处一点灰；火照在木柴、灰床、石头、锅底上的暖光去掉（lit ≈ unlit × (1 + g·c)，g 从火堆往外衰减），锅身下半截不再被火照亮
夜景：火把锅周围一大圈草地、锅、三脚架、木盖、石头、食盆都照成了暖黄。在「火、提灯、帐篷都照不到的地方」拟合日景 → 夜景的颜色变换
      （草地一套；物件一套，用树干、白花这些拟合），拿熄了火的日景算出「只有月光」的样子，换掉火照亮的那一圈
      （范围照夜景比月光预测亮出来多少算）；提灯自己的那圈光留着
输出：
    art/cut/fire-off.jpg、night-fire-off.jpg       盖在底图上的补丁，随 npm run wx:art -- cut 上传。框外圈和原画一模一样、框落在底图切块的像素格上，
                                                   所以存成不透明的 JPG 盖上去也没有接缝（和篝火逐帧图一样）；框的位置填进 shared/camp.js 的 SCENE.flame.off
    miniprogram/images/camp/cut/fire-off.jpg …      包里的兜底小图（和包里垫的整张低清画一样 768 宽的分辨率）
别的脚本要熄了火的整张画就调 unlit_day() / unlit_night()：cutouts.py 出空锅 pot-0 和夜里的 night-lid-off，
bowl_food.py 出夜里的 night-bowl-N-off，light_map.py 出熄了火时宠物身上的光。
画换了：重新量 LOGS（--preview 会把量的木柴框画在画上对），这几个脚本都重跑。
Codex 画了正式的「没点火」版（工单第 1d 节：art/raw/cut/out-fire-off.png、out-night-fire-off.png）就直接用它，不再程序熄火：
in / out 是 SCENE.flame.off 外扩成的正方形（以前裁的是框本身，两种 out 都认），只取回框里那块（外圈羽化接回原画）。
需要 Pillow 和 numpy。
"""
import argparse
import json
import os
import subprocess

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

from cutouts import objectness

REPO = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..'))
RAW = os.path.join(REPO, 'art', 'raw', 'camp')
CODEX = os.path.join(REPO, 'art', 'raw', 'cut')        # Codex 的 in-* / out-*
OUT = os.path.join(REPO, 'art', 'cut')
LOCAL = os.path.join(REPO, 'miniprogram', 'images', 'camp', 'cut')
DAY_RES = 0.75          # 和日景底图切块一样（3072 宽）
NIGHT_RES = 0.5         # 和夜景底图切块一样（2048 宽）
LOCAL_RES = 0.1875      # 包里的兜底小图：和包里垫的整张低清画（768 宽）一样

# 火堆里的木柴（画的像素）：(柴头 x, y, 里头那端 x, y, 柴头半径, 里头半径)，从后往前排（后面的先画）
LOGS = {
    'A': (1906, 2730, 1990, 2737, 21, 19),
    'G': (2220, 2726, 2160, 2736, 20, 18),
    'B': (1884, 2789, 2000, 2736, 22, 19),
    'F': (2248, 2795, 2146, 2744, 23, 20),
    'H': (2006, 2856, 2022, 2808, 9, 8),
    'I': (2091, 2876, 2088, 2806, 11, 10),
    'C': (1923, 2845, 2024, 2726, 24, 17),
    'E': (2191, 2849, 2104, 2717, 25, 17),
    'D': (2049, 2870, 2054, 2730, 30, 14),
}
PIT = [1780, 2540, 2400, 3000]          # 火堆那块（画的像素）：火苗、木柴都在里面
GLOW_C = np.array([0.7, 0.55, 0.18])    # 火光的颜色（火照亮的地方 ≈ 本色 × (1 + g·c)）
POT_BODY = (2060, 2520, 250, 200)       # 锅身的椭圆（中心 x, y, 半径 x, y）：下半截原来被火照亮
LANTERN_GLOW = (2665, 2620, 170, 200)   # 提灯自己那圈光（夜里熄了篝火也留着）
SHADOW = np.array([60, 48, 42.0])       # 柴堆里头的暗处
ASH = np.array([118, 110, 103.0])       # 低处的灰


def scene():
    js = "const C=require('./cloudfunctions/api/lib/shared/camp');console.log(JSON.stringify({W:C.W,flame:C.SCENE.flame,fire:C.SCENE.fire}))"
    return json.loads(subprocess.check_output(['node', '-e', js], cwd=REPO))


def sm(v, a, b):
    t = np.clip((v - a) / (b - a), 0, 1)
    return t * t * (3 - 2 * t)


def _box(a, r, axis):
    n = a.shape[axis]
    pad = [(0, 0)] * a.ndim
    pad[axis] = (r + 1, r)
    c = np.cumsum(np.pad(a, pad, mode='edge'), axis=axis)
    return (np.take(c, np.arange(2 * r + 1, n + 2 * r + 1), axis=axis) - np.take(c, np.arange(0, n), axis=axis)) / (2 * r + 1)


def blur(a, sigma):
    """近似高斯模糊（三次方框），浮点数组（H×W 或 H×W×C）"""
    a = np.asarray(a, float)
    r = int(round((np.sqrt(4 * sigma * sigma + 1) - 1) / 2))
    if r < 1:
        return a
    for _ in range(3):
        a = _box(_box(a, r, 0), r, 1)
    return a


def grow(mask, px):
    """布尔 mask 往外长 px 像素"""
    n = 2 * max(1, int(round(px))) + 1
    return np.asarray(Image.fromarray(mask.astype(np.uint8) * 255).filter(ImageFilter.MaxFilter(n))) > 0


def push_pull(img, wt):
    """wt≈0 的地方用周围（wt≈1）的颜色填上：带权重的金字塔，一层层往下缩、再往上插回来"""
    levels = [(img * wt[..., None], wt)]
    while min(levels[-1][1].shape) > 4:
        a, w = levels[-1]
        h2, w2 = a.shape[0] // 2 * 2, a.shape[1] // 2 * 2
        a, w = a[:h2, :w2], w[:h2, :w2]
        levels.append((a[0::2, 0::2] + a[1::2, 0::2] + a[0::2, 1::2] + a[1::2, 1::2], w[0::2, 0::2] + w[1::2, 0::2] + w[0::2, 1::2] + w[1::2, 1::2]))
    a, w = levels[-1]
    cur = a / np.maximum(w, 1e-6)[..., None]
    for a, w in reversed(levels[:-1]):
        up = np.stack([np.asarray(Image.fromarray(cur[..., c].astype(np.float32), 'F').resize((a.shape[1], a.shape[0]), Image.BILINEAR)) for c in range(cur.shape[2])], -1)
        cur = a / np.maximum(w, 1e-6)[..., None] * np.clip(w, 0, 1)[..., None] + up * (1 - np.clip(w, 0, 1))[..., None]
    out = np.empty_like(img)
    out[:cur.shape[0], :cur.shape[1]] = cur
    out[cur.shape[0]:, :cur.shape[1]] = cur[-1:]
    out[:, cur.shape[1]:] = out[:, cur.shape[1] - 1:cur.shape[1]]
    return out


def noise(rng, h, w, cy, cx):
    return np.asarray(Image.fromarray(np.uint8(rng.random((cy, cx)) * 255)).resize((w, h), Image.BICUBIC)).astype(float) / 255


# ---------------------------------------------------------------- 日景：熄火

def _codex(day_or_night, img):
    """Codex 画的「没点火」版（有的话）贴回整张画：外圈 24 画像素羽化回原画，免得边上颜色对不齐；没有就返回 None"""
    path = os.path.join(CODEX, f'out-{"night-" if day_or_night == "night" else ""}fire-off.png')
    if not os.path.exists(path):
        return None
    S = scene()
    k = img.width / S['W']
    off = _off_boxes()[day_or_night]
    raw = Image.open(path).convert('RGB')
    reg = [round(v * k) for v in _codex_region(raw, img, off, S['W'], k)]
    box = [round(v * k) for v in off]
    full = raw.resize((reg[2] - reg[0], reg[3] - reg[1]), Image.LANCZOS)
    piece = full.crop((box[0] - reg[0], box[1] - reg[1], box[2] - reg[0], box[3] - reg[1]))
    h, w = piece.height, piece.width
    yy, xx = np.mgrid[0:h, 0:w].astype(float)
    edge = np.minimum.reduce([xx, w - 1 - xx, yy, h - 1 - yy]) / k
    m = sm(edge, 0, 24)[..., None]
    under = np.asarray(img.crop(box)).astype(float)
    out = img.copy()
    out.paste(Image.fromarray(np.uint8(np.asarray(piece).astype(float) * m + under * (1 - m) + 0.5)), box[:2])
    return out


def _codex_region(out, img, off, W, k):
    """Codex 的 out 对应画上哪一块：以前 --crop 裁的是框本身（长方形），现在是外扩成的正方形。
    两块和 out 都缩成一样大比轮廓（亮度的梯度，火光的颜色变了也不怕），取最像的那块"""
    def edges(im):
        g = np.asarray(im.convert('L').resize((128, 128), Image.BILINEAR)).astype(float)
        gy, gx = np.gradient(g)
        e = np.hypot(gx, gy)
        return (e - e.mean()) / (e.std() + 1e-6)
    eo = edges(out)
    cands = [off, _square(off, W)]
    scores = [float((edges(img.crop([round(v * k) for v in c])) * eo).mean()) for c in cands]
    return cands[int(np.argmax(scores))]


def _off_boxes():
    js = "console.log(JSON.stringify(require('./cloudfunctions/api/lib/shared/camp').SCENE.flame.off))"
    return json.loads(subprocess.check_output(['node', '-e', js], cwd=REPO))


def _square(box, size):
    """把框外扩成正方形（中心不变，碰到画边往里挪）：图像模型的 edit 只出 1024×1024，给它正方形的 in，回来的 out 才不会变形"""
    side = max(box[2] - box[0], box[3] - box[1])
    x0 = min(max((box[0] + box[2] - side) // 2, 0), size - side)
    y0 = min(max((box[1] + box[3] - side) // 2, 0), size - side)
    return [x0, y0, x0 + side, y0 + side]


def crop():
    """裁出给 Codex 的两块（SCENE.flame.off 外扩成正方形）：日景火堆那块、夜景火照亮的那一大圈"""
    os.makedirs(CODEX, exist_ok=True)
    boxes = _off_boxes()
    W = scene()['W']
    for name, src, key in (('in-fire-off.png', 'camp-hd.png', 'day'), ('in-night-fire-off.png', 'night-hd.png', 'night')):
        img = Image.open(os.path.join(RAW, src)).convert('RGB')
        k = img.width / W
        x0, y0, x1, _ = _square(boxes[key], W)
        side = round((x1 - x0) * k)
        piece = img.crop((round(x0 * k), round(y0 * k), round(x0 * k) + side, round(y0 * k) + side))
        piece.save(os.path.join(CODEX, name))
        print(f'  ✓  art/raw/cut/{name}  {piece.width}×{piece.height}')
    print('Codex 按工单第 1d 节画 out-fire-off.png、out-night-fire-off.png（正方形，1024×1024 就行），回来再跑 python3 scripts/camp/fire_off.py')


def unlit_day(day):
    """日景（任意分辨率的整张画，PIL RGB）→ 同样大小、火熄了的整张画（有 Codex 画的就用它的）"""
    painted = _codex('day', day)
    if painted is not None:
        return painted
    S = scene()
    k = day.width / S['W']
    box = [round(v * k) for v in PIT]
    margin = round(520 * k)                                   # 火光的范围比火堆大一圈
    reg = [max(0, box[0] - margin), max(0, box[1] - margin), min(day.width, box[2] + margin), min(day.height, box[3] + margin)]
    C = np.asarray(day.crop(reg)).astype(float)
    h, w = C.shape[:2]
    yy, xx = np.mgrid[0:h, 0:w].astype(float)
    X = (xx + reg[0]) / k
    Y = (yy + reg[1]) / k
    R, G, B = C[..., 0], C[..., 1], C[..., 2]
    fx, fy = S['fire']
    # 火苗：黄白色（被火照亮的木柴侧面是橙褐色、G 低一截，留着）；只在锅底下那片 zone 里
    zone = Image.new('L', (w, h), 0)
    ImageDraw.Draw(zone).polygon([(x * k - reg[0], y * k - reg[1]) for x, y in S['flame']['zone']], fill=255)
    zone = blur(np.asarray(zone.filter(ImageFilter.MaxFilter(2 * round(4 * k) + 1))).astype(float) / 255, 4 * k)
    flame = sm(R, 205, 235) * sm(G, 145, 180) * (1 - sm(B / np.maximum(R, 1), 0.55, 0.72)) * zone
    fire = grow(flame > 0.3, k)
    # 火光去掉：从火堆往外衰减；锅身下半截原来被火从底下照亮，压暗一些
    g = np.exp(-(((X - (fx - 40)) / 300) ** 2) - (((Y - (fy - 70)) / 210) ** 2))
    g = g * sm(g, 0.02, 0.1)                                  # 尾巴收干净：补丁不用铺太大
    unlit = C / (1 + g[..., None] * GLOW_C)
    px, py, prx, pry = POT_BODY
    body = sm(1 - np.hypot((X - px) / prx, (Y - py) / pry), 0, 0.08)
    lower = body * sm(Y, py - 70, py + 190)
    unlit = unlit * (1 - 0.22 * lower)[..., None]
    # 火苗遮住的木柴：顺着轴线补全（横截面的明暗照这根柴露在外面的部分），里头那端熏黑一点
    out = unlit.copy()
    owner = np.full((h, w), -1)
    geo = {}
    for i, (name, (x0, y0, x1, y1, r0, r1)) in enumerate(LOGS.items()):
        v = np.array([x1 - x0, y1 - y0], float)
        length = np.hypot(*v)
        u = v / length
        s = (X - x0) * u[0] + (Y - y0) * u[1]
        tn = ((X - x0) * -u[1] + (Y - y0) * u[0]) / (r0 + (r1 - r0) * np.clip(s / length, 0, 1))
        owner[(s >= -r0 * 0.6) & (s <= length + r1 * 0.3) & (np.abs(tn) <= 1)] = i
        geo[i] = (s, tn)
    rng = np.random.default_rng(5)
    for i, (s, tn) in geo.items():
        mine = owner == i
        known = mine & ~fire
        todo = mine & fire
        if not todo.any() or known.sum() < 30:
            continue
        bins = 24
        pos = (tn + 1) / 2 * bins - 0.5
        tb = np.clip(np.round(pos).astype(int), 0, bins - 1)
        prof = np.zeros((bins, 3))
        have = np.zeros(bins, bool)
        for j in range(bins):
            sel = known & (tb == j)
            if sel.sum() >= 4:
                prof[j] = np.median(unlit[sel], 0)
                have[j] = True
        idx = np.nonzero(have)[0]
        for j in range(bins):
            if not have[j]:
                prof[j] = prof[idx[np.argmin(np.abs(idx - j))]]
        prof = np.vstack([prof[:1], prof, prof[-1:]])
        prof = (prof[:-2] + 2 * prof[1:-1] + prof[2:]) / 4
        j0 = np.clip(np.floor(pos).astype(int), 0, bins - 1)
        j1 = np.clip(j0 + 1, 0, bins - 1)
        fr = np.clip(pos - np.floor(pos), 0, 1)[..., None]
        col = prof[j0] * (1 - fr) + prof[j1] * fr
        # 亮度跟着旁边露出来的那段走（光沿着柴是渐变的）
        lum_known = np.repeat(np.where(known, unlit.mean(-1), 0)[..., None], 3, -1)
        lum_prof = np.repeat(np.where(known, col.mean(-1), 0)[..., None], 3, -1)
        ratio = push_pull(lum_known, known.astype(float))[..., 0] / np.maximum(push_pull(lum_prof, known.astype(float))[..., 0], 1)
        col = col * np.clip(ratio, 0.6, 1.4)[..., None]
        smax = np.percentile(s[known], 95)
        col = col * ((1 + (np.sin(tn * 9.0 + 0.7 * i) * 0.5) * 0.08) * (1 - np.clip((s - smax) / 70, 0, 1) * 0.4))[..., None]
        out[todo] = col[todo]
    # 柴缝：柴堆里头的暗处，锅底下最暗，低处一点灰
    gap = fire & (owner < 0)
    v = sm(Y, 2700, 2880)
    cell = 19 * k                                             # 灰的斑块约 21 画像素、颗粒约 7 画像素
    ashy = sm(v, 0.45, 1.0) * (0.6 + 0.4 * noise(rng, h, w, max(2, round(h / cell)), max(2, round(w / cell))))
    grain = 1 + (noise(rng, h, w, max(2, round(3 * h / cell)), max(2, round(3 * w / cell))) - 0.5) * 0.12
    gapc = (SHADOW * (1 - ashy[..., None]) + ASH * ashy[..., None]) * grain[..., None]
    out[gap] = gapc[gap]
    m = blur(fire.astype(float), 0.7 * k / 0.89)[..., None]
    res = unlit * (1 - m) + out * m
    img = day.copy()
    img.paste(Image.fromarray(np.clip(res, 0, 255).astype(np.uint8)), (reg[0], reg[1]))
    return img


# ---------------------------------------------------------------- 夜景：只有月光

_FITS = {}


def _fits():
    """日景 → 夜景的颜色变换（仿射 3×4，迭代重加权最小二乘）：草地一套、物件一套，只用火、提灯、帐篷都照不到的地方拟合"""
    if _FITS:
        return _FITS['grass'], _FITS['obj']
    N = 1024
    load = lambda n: Image.open(os.path.join(RAW, n)).convert('RGB').resize((N, N), Image.LANCZOS).filter(ImageFilter.GaussianBlur(0.8))
    day_i, night_i = load('camp-hd.png'), load('night-hd.png')
    day = np.asarray(day_i).astype(float) / 255
    night = np.asarray(night_i).astype(float) / 255
    obj = objectness(np.asarray(day_i))
    yy, xx = np.mgrid[0:N, 0:N] * (4096 / N)
    S = scene()
    fx, fy = S['fire']
    lx, ly = LANTERN_GLOW[:2]
    unlit = (np.hypot(xx - fx, yy - fy) > 1500) & (np.hypot(xx - lx, yy - ly) > 700) & (yy > 500) & ~((xx < 1800) & (yy < 1800))

    def fit(m):
        X = np.concatenate([day[m], np.ones((m.sum(), 1))], 1)
        Y = night[m]
        wt = np.ones(len(X))
        for _ in range(6):
            A, *_ = np.linalg.lstsq(X * wt[:, None], Y * wt[:, None], rcond=None)
            r = np.linalg.norm(X @ A - Y, axis=1)
            wt = 1 / np.maximum(1, r / (np.median(r) * 1.5 + 1e-6))
        return A
    _FITS['grass'] = fit(unlit & (obj < 0.2))
    _FITS['obj'] = fit(unlit & (obj > 0.8))
    return _FITS['grass'], _FITS['obj']


def _relit(night, day_off):
    """night、day_off 同样大小的 PIL 图 → (月光版 RGB 0～1, 火照亮的范围 0～1)，都是整张画大小"""
    S = scene()
    res = night.width / S['W']
    Ag, Ao = _fits()
    D = np.asarray(day_off.convert('RGB')).astype(float) / 255
    Nn = np.asarray(night.convert('RGB')).astype(float) / 255
    lin = lambda d: np.concatenate([d, np.ones(d.shape[:-1] + (1,))], -1)
    obj = blur(objectness(np.uint8(D * 255)), max(1, 2 * res))
    grass = np.clip(lin(D) @ Ag, 0, 1)
    synth = grass * (1 - obj[..., None]) + np.clip(lin(D) @ Ao, 0, 1) * obj[..., None]
    lum = lambda a: 0.299 * a[..., 0] + 0.587 * a[..., 1] + 0.114 * a[..., 2]
    h, w = D.shape[:2]
    yy, xx = np.mgrid[0:h, 0:w].astype(float) / res
    fx, fy = S['fire']
    excess = blur(np.clip(lum(Nn) - lum(grass), 0, 1), 40 * res)
    dist = np.hypot((xx - fx) / 1.25, yy - (fy + 80))
    pool = np.clip((excess - 0.012) / 0.08, 0, 1) * (1 - sm(dist, 1000, 1300))   # 减掉一点：远处草地纹理对不上的那点差不算火光
    pool = blur(np.maximum(pool, 1 - sm(dist, 450, 650)), 30 * res)
    lx, ly, lrx, lry = LANTERN_GLOW
    keep = np.exp(-(((xx - lx) / lrx) ** 2) - (((yy - ly) / lry) ** 2))
    M = np.clip(pool * (1 - keep), 0, 1)
    return synth, M * sm(M, 0.01, 0.06)                   # 极淡的尾巴收掉：补丁不用铺太大


def unlit_night(night, day_off):
    """夜景（PIL RGB）+ 同一张画熄了火的日景（任意大小，会缩成和夜景一样）→ 同样大小、火熄了、只有月光（提灯还亮着）的夜景
    （有 Codex 画的就用它的）"""
    painted = _codex('night', night)
    if painted is not None:
        return painted
    day_off = day_off.resize(night.size, Image.LANCZOS) if day_off.size != night.size else day_off
    synth, M = _relit(night, day_off)
    N = np.asarray(night.convert('RGB')).astype(float) / 255
    out = N * (1 - M[..., None]) + synth * M[..., None]
    return Image.fromarray(np.uint8(np.clip(out, 0, 1) * 255 + 0.5))


# ---------------------------------------------------------------- 补丁

def _snap(box, n=4):
    """框落在 4 画像素的格上（× 0.75 / 0.5 都是整数像素，和底图切块的像素对齐）"""
    return [box[0] // n * n, box[1] // n * n, -(-box[2] // n) * n, -(-box[3] // n) * n]


def _bbox(mask, res, pad=8):
    ys, xs = np.nonzero(mask)
    return _snap([int(xs.min() / res) - pad, int(ys.min() / res) - pad, int(xs.max() / res) + pad, int(ys.max() / res) + pad])


def patches(preview=None):
    S = scene()
    W = S['W']
    day_hd = Image.open(os.path.join(RAW, 'camp-hd.png')).convert('RGB')
    day = day_hd.resize((round(W * DAY_RES),) * 2, Image.LANCZOS)
    day_off = unlit_day(day_hd).resize(day.size, Image.LANCZOS)
    night = Image.open(os.path.join(RAW, 'night-hd.png')).convert('RGB').resize((round(W * NIGHT_RES),) * 2, Image.LANCZOS)
    night_off = unlit_night(night, day_off)
    os.makedirs(OUT, exist_ok=True)
    os.makedirs(LOCAL, exist_ok=True)
    boxes = {}
    for name, a, b, res in (('fire-off', day, day_off, DAY_RES), ('night-fire-off', night, night_off, NIGHT_RES)):
        diff = np.abs(np.asarray(b).astype(int) - np.asarray(a).astype(int)).max(-1) > 1
        box = _bbox(diff, res, pad=16)
        boxes[name] = box
        piece = b.crop([round(v * res) for v in box])
        path = os.path.join(OUT, f'{name}.jpg')
        piece.save(path, quality=90)
        small = piece.resize((round(piece.width * LOCAL_RES / res), round(piece.height * LOCAL_RES / res)), Image.LANCZOS)
        small.save(os.path.join(LOCAL, f'{name}.jpg'), quality=82)
        print(f'  ✓  {name}.jpg  {piece.width}×{piece.height}  {os.path.getsize(path) // 1024} KB（包里 {os.path.getsize(os.path.join(LOCAL, name + ".jpg")) // 1024} KB）')
    print('补丁的框（画的像素）→ shared/camp.js 的 SCENE.flame.off：', json.dumps({'day': boxes['fire-off'], 'night': boxes['night-fire-off']}))
    if preview:
        _preview(preview, day, day_off, night, night_off)
    return boxes


def _preview(folder, day, day_off, night, night_off):
    os.makedirs(folder, exist_ok=True)
    W = scene()['W']
    for name, a, b in (('day', day, day_off), ('night', night, night_off)):
        r = a.width / W
        box = [round(v * r) for v in (1100, 1800, 3300, 3700)]
        pair = Image.new('RGB', ((box[2] - box[0]) * 2 + 8, box[3] - box[1]), 'white')
        pair.paste(a.crop(box), (0, 0))
        pair.paste(b.crop(box), (box[2] - box[0] + 8, 0))
        pair.save(os.path.join(folder, f'fire-off-{name}.jpg'), quality=90)
    # 量的木柴框画在日景上（画换了重新量 LOGS 时对着看）
    r = day.width / W
    box = [round(v * r) for v in PIT]
    img = day.crop(box).resize(((box[2] - box[0]) * 2, (box[3] - box[1]) * 2), Image.LANCZOS)
    d = ImageDraw.Draw(img)
    P = lambda x, y: ((x * r - box[0]) * 2, (y * r - box[1]) * 2)
    for name, (x0, y0, x1, y1, r0, r1) in LOGS.items():
        v = np.array([x1 - x0, y1 - y0], float)
        u = v / np.hypot(*v)
        p = np.array([-u[1], u[0]])
        q = [np.array([x0, y0]) + p * r0, np.array([x1, y1]) + p * r1, np.array([x1, y1]) - p * r1, np.array([x0, y0]) - p * r0]
        d.polygon([P(*c) for c in q], outline=(255, 0, 255))
        d.text(P(x0, y0), name, fill=(255, 0, 255))
    img.save(os.path.join(folder, 'fire-off-logs.jpg'), quality=90)
    print(f'预览 → {folder}/fire-off-day.jpg、fire-off-night.jpg、fire-off-logs.jpg')


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('--preview', default=None)
    ap.add_argument('--crop', action='store_true')
    a = ap.parse_args()
    if a.crop:
        crop()
        raise SystemExit
    patches(a.preview)
    print('→ 接着跑 cutouts.py --from-base --local、bowl_food.py、light_map.py（熄火时的空锅、夜里的木盖 / 碗沿、光），CUT_VERSION 加一，npm run wx:art -- cut')
