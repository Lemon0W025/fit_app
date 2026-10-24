"""园林大宅院的白模：按 shared/estate.js 的布局画整张底图，切成 4×4 块给小程序当占位底图；整图另存给即梦当参考

    python3 scripts/estate/blockout.py

输出：miniprogram/images/garden/estate/t00.jpg … t33.jpg（底图切块）、
     art/guide/estate-blockout.jpg（整图）、art/guide/estate-blockout-3x2.jpg（上下补成 3:2，给 Codex 当重绘底稿）、
     art/guide/estate-blockout-labels.jpg（带院子名字，给人看）
需要 Pillow。布局数据直接从 estate.js 读（用 node 跑一下），改布局只改 JS 这一处。
"""
import json
import math
import os
import random
import subprocess

from PIL import Image, ImageDraw, ImageFont

REPO = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..'))
OUT = os.path.join(REPO, 'miniprogram', 'images', 'garden')
GUIDE = os.path.join(REPO, 'art', 'guide')
FONT = '/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc'

# 一格宽（像素）。几何和 utils/iso.js 的 gridLayout 一样：格高 = 格宽 / 2，顶部留 1.3 格宽，侧面厚 0.4 格高
TW = 64
TH = TW / 2
SPLIT = 4
JPEG_QUALITY = 80

PAPER = (232, 224, 207)
COLORS = {
    'lawn': (150, 198, 108), 'soil': (150, 112, 76), 'water': (104, 172, 222), 'pave': (222, 214, 196),
    'path': (214, 204, 184), 'gate': (214, 204, 184), 'door': (214, 204, 184), 'block': (196, 192, 182),
}
WALL = (240, 238, 232)
WALL_TOP = (72, 80, 96)
WALL_H = TH * 2.2
GATE_R = TH * 1.1  # 月亮门洞半径（洞底贴地：圆心高 = 半径）
WOOD = (150, 104, 64)


def load_layout():
    js = (
        "const E=require('./cloudfunctions/api/lib/shared/estate');"
        "const kinds=[];for(let r=0;r<E.GRID.rows;r++){const row=[];for(let c=0;c<E.GRID.cols;c++)row.push(E.tileInfo(c,r).kind);kinds.push(row)}"
        "console.log(JSON.stringify({grid:E.GRID,areas:E.AREAS,shell:E.SHELL,gates:E.GATES,door:E.DOOR,kinds}))"
    )
    return json.loads(subprocess.check_output(['node', '-e', js], cwd=REPO))


LAYOUT = load_layout()
COLS, ROWS = LAYOUT['grid']['cols'], LAYOUT['grid']['rows']
KINDS = LAYOUT['kinds']
TOP = TW * 1.3
DEPTH = TH * 0.4
W = int((COLS + ROWS) * TW / 2)
H = int(TOP + (COLS + ROWS) * TH / 2 + DEPTH)
ORIGIN_X = ROWS * TW / 2


def top(c, r):
    return (ORIGIN_X + (c - r) * TW / 2, TOP + (c + r) * TH / 2)


def quad(c0, r0, c1, r1):
    return [top(c0, r0), top(c1, r0), top(c1, r1), top(c0, r1)]


def shade(color, f):
    return tuple(max(0, min(255, int(v * f))) for v in color)


def raised(pts, h):
    return [(x, y - h) for x, y in pts]


def kind_at(c, r):
    if c < 0 or r < 0 or c >= COLS or r >= ROWS:
        return 'out'
    return KINDS[r][c]


def box(d, c0, r0, c1, r1, h, color, base=0):
    """抬起来的一块：左、右两个侧面 + 顶面"""
    p0, p1, p2, p3 = [(x, y - base) for x, y in quad(c0, r0, c1, r1)]
    d.polygon([p3, p2, (p2[0], p2[1] - h), (p3[0], p3[1] - h)], fill=shade(color, 0.84))
    d.polygon([p2, p1, (p1[0], p1[1] - h), (p2[0], p2[1] - h)], fill=shade(color, 0.7))
    d.polygon(raised([p0, p1, p2, p3], h), fill=color)


def roof(d, c0, r0, c1, r1, base, rh, color, over=0.3):
    """四坡顶，屋脊沿长边"""
    a, b = c1 - c0, r1 - r0
    p0, p1, p2, p3 = [(x, y - base) for x, y in quad(c0 - over, r0 - over, c1 + over, r1 + over)]
    cx, cy = top((c0 + c1) / 2, (r0 + r1) / 2)
    cy -= base + rh
    if a >= b:
        k = (a - b) / 2 / (a + 2 * over)
        q1 = (cx - (p1[0] - p0[0]) * k, cy - (p1[1] - p0[1]) * k)
        q2 = (cx + (p1[0] - p0[0]) * k, cy + (p1[1] - p0[1]) * k)
        d.polygon([p0, p1, q2, q1], fill=shade(color, 1.12))
        d.polygon([p0, q1, p3], fill=shade(color, 0.95))
        d.polygon([p3, q1, q2, p2], fill=shade(color, 0.85))
        d.polygon([p1, p2, q2], fill=shade(color, 0.72))
    else:
        k = (b - a) / 2 / (b + 2 * over)
        q1 = (cx - (p3[0] - p0[0]) * k, cy - (p3[1] - p0[1]) * k)
        q2 = (cx + (p3[0] - p0[0]) * k, cy + (p3[1] - p0[1]) * k)
        d.polygon([p0, p3, q2, q1], fill=shade(color, 0.95))
        d.polygon([p0, q1, p1], fill=shade(color, 1.12))
        d.polygon([p1, q1, q2, p2], fill=shade(color, 0.72))
        d.polygon([p3, p2, q2], fill=shade(color, 0.85))


def rock(d, x, y, rx, h, seed):
    rnd = random.Random(seed)
    pts = []
    for i in range(9):
        a = math.pi + i * math.pi / 8
        pts.append((x + rx * math.cos(a) * rnd.uniform(0.75, 1), y - h * abs(math.sin(a)) * rnd.uniform(0.7, 1)))
    pts += [(x + rx, y), (x, y + rx * 0.3), (x - rx, y)]
    d.polygon(pts, fill=(168, 166, 158))
    d.polygon([(x - rx * 0.2, y - h * 0.9), (x + rx * 0.6, y - h * 0.5), (x + rx * 0.8, y), (x, y + rx * 0.25)], fill=(140, 138, 130))


def post(d, c, r, h, color=WOOD, width=3):
    x, y = top(c, r)
    d.line([(x, y), (x, y - h)], fill=color, width=width)


def fence(d, c0, r0, c1, r1, inset=0.45):
    """一圈矮栅栏（动物小院）"""
    pts = []
    a, b = c0 + inset, r0 + inset
    e, f = c1 - inset, r1 - inset
    n = int(e - a)
    for i in range(n + 1):
        pts.append((a + (e - a) * i / n, b))
    for i in range(1, n + 1):
        pts.append((e, b + (f - b) * i / n))
    for i in range(1, n + 1):
        pts.append((e - (e - a) * i / n, f))
    for i in range(1, n):
        pts.append((a, f - (f - b) * i / n))
    h = TH * 0.55
    line = [top(c, r) for c, r in pts] + [top(a, b)]
    for frac in (0.45, 0.9):
        d.line([(x, y - h * frac) for x, y in line], fill=WOOD, width=2)
    for c, r in pts:
        post(d, c, r, h, width=3)


def draw_ground(d, rnd):
    for r in range(ROWS):
        for c in range(COLS):
            k = KINDS[r][c]
            if k == 'wall':
                continue
            color = COLORS[k]
            if k == 'lawn':
                color = shade(color, rnd.uniform(0.96, 1.04))
            d.polygon(quad(c, r, c + 1, r + 1), fill=color)
            if k in ('path', 'gate', 'door'):
                d.polygon(quad(c + 0.1, r + 0.1, c + 0.9, r + 0.9), fill=shade(color, 1.05), outline=shade(color, 0.86))
            elif k == 'pave':
                d.polygon(quad(c, r, c + 1, r + 1), outline=shade(color, 0.9))
            elif k == 'soil':
                for t in (0.3, 0.6):
                    d.line([top(c + t, r + 0.08), top(c + t, r + 0.92)], fill=shade(color, 0.78), width=2)
            elif k == 'lawn' and rnd.random() < 0.5:
                x, y = top(c + rnd.uniform(0.2, 0.8), r + rnd.uniform(0.2, 0.8))
                d.line([(x, y), (x + 2, y - 7)], fill=shade(color, 0.8), width=2)
    # 水：靠岸的边画浅一圈，水面几道波纹
    for r in range(ROWS):
        for c in range(COLS):
            if KINDS[r][c] != 'water':
                continue
            edge = shade(COLORS['water'], 1.35)
            if kind_at(c, r - 1) != 'water':
                d.line([top(c, r), top(c + 1, r)], fill=edge, width=3)
            if kind_at(c - 1, r) != 'water':
                d.line([top(c, r), top(c, r + 1)], fill=edge, width=3)
            if kind_at(c + 1, r) != 'water':
                d.line([top(c + 1, r), top(c + 1, r + 1)], fill=edge, width=3)
            if kind_at(c, r + 1) != 'water':
                d.line([top(c, r + 1), top(c + 1, r + 1)], fill=edge, width=3)
            if rnd.random() < 0.4:
                x, y = top(c + 0.5, r + 0.5)
                d.arc([x - 9, y - 4, x + 9, y + 4], 200, 340, fill=(226, 240, 250), width=2)


def standing():
    """所有立着的东西（墙、门、建筑、篱笆），按前后顺序排好：key 越小越靠后、先画"""
    items = []

    def add(key, fn):
        items.append((key, len(items), fn))

    for r in range(ROWS):
        for c in range(COLS):
            if KINDS[r][c] == 'wall':
                add(c + r, lambda d, c=c, r=r: (box(d, c, r, c + 1, r + 1, WALL_H, WALL), d.polygon(raised(quad(c, r, c + 1, r + 1), WALL_H), fill=WALL_TOP)))
    # 月亮门：两格墙中间开一个圆洞（洞里露出对面的地）
    for g in LAYOUT['gates']:
        tiles = g['tiles']
        cs = [t[0] for t in tiles]
        rs = [t[1] for t in tiles]
        x, y = top((min(cs) + max(cs) + 1) / 2, (min(rs) + max(rs) + 1) / 2)
        rr = GATE_R

        def gate(d, tiles=tiles, x=x, y=y, rr=rr):
            for c, r in tiles:
                box(d, c, r, c + 1, r + 1, WALL_H, WALL)
                d.polygon(raised(quad(c, r, c + 1, r + 1), WALL_H), fill=WALL_TOP)
            d.ellipse([x - rr, y - rr - rr, x + rr, y], fill=COLORS['lawn'], outline=WALL_TOP, width=3)
        add(max(c + r for c, r in tiles) + 0.1, gate)
    # 大门：比墙高一点的门楼，朱红双开门
    (c0, r0), (c1, r1) = LAYOUT['door']
    x, y = top((c0 + c1 + 1) / 2, (r0 + r1 + 1) / 2)

    def door(d, x=x, y=y, tiles=LAYOUT['door']):
        h = WALL_H * 1.3
        for c, r in tiles:
            box(d, c, r, c + 1, r + 1, h, WALL)
        roof(d, tiles[0][0], tiles[0][1], tiles[1][0] + 1, tiles[1][1] + 1, h, TH * 0.6, WALL_TOP, over=0.2)
        d.rectangle([x - TW * 0.45, y - h * 0.85, x + TW * 0.45, y - h * 0.05], fill=(176, 52, 40), outline=WALL_TOP, width=3)
        d.line([(x, y - h * 0.85), (x, y - h * 0.05)], fill=WALL_TOP, width=2)
        for dx in (-TW * 0.2, TW * 0.2):
            d.ellipse([x + dx - 4, y - h * 0.5 - 4, x + dx + 4, y - h * 0.5 + 4], fill=(230, 190, 80))
    add(max(c0 + r0, c1 + r1) + 0.1, door)

    for s in LAYOUT['shell']:
        c0, r0, c1, r1 = s['rect']
        what = s.get('what')
        key = (c1 - 1) + (r1 - 1)
        if what == 'hall':
            add(key, lambda d, a=(c0, r0, c1, r1): (box(d, *a, TH * 3, (246, 244, 238)), roof(d, *a, TH * 3, TH * 1.6, WALL_TOP),
                                                  d.ellipse([top((a[0] + a[2]) / 2, a[3])[0] - TW * 0.3, top((a[0] + a[2]) / 2, a[3])[1] - TH * 2.4,
                                                             top((a[0] + a[2]) / 2, a[3])[0] + TW * 0.3, top((a[0] + a[2]) / 2, a[3])[1] - TH * 0.9], fill=(120, 100, 80))))
        elif what == 'screen':
            add(key, lambda d, a=(c0, r0, c1, r1): (box(d, *a, TH * 1.5, (246, 244, 238)), d.polygon(raised(quad(*a), TH * 1.5), fill=WALL_TOP)))
        elif what == 'coop':
            add(key, lambda d, a=(c0, r0, c1, r1): (box(d, *a, TH * 1.4, (200, 120, 80)), roof(d, *a, TH * 1.4, TH * 0.8, (150, 70, 50))))
        elif what == 'cabin':
            add(key, lambda d, a=(c0, r0, c1, r1): (box(d, *a, TH * 1.8, (190, 150, 108)), roof(d, *a, TH * 1.8, TH, (96, 80, 70))))
        elif what == 'well':
            add(key, lambda d, a=(c0, r0, c1, r1): (box(d, a[0] + 0.2, a[1] + 0.2, a[2] - 0.2, a[3] - 0.2, TH * 0.8, (160, 156, 150)),
                                                  d.polygon(raised(quad(a[0] + 0.35, a[1] + 0.35, a[2] - 0.35, a[3] - 0.35), TH * 0.8), fill=(60, 70, 90))))
        elif what == 'trellis':
            def trellis(d, a=(c0, r0, c1, r1)):
                for c, r in ((a[0] + 0.3, a[1] + 0.3), (a[2] - 0.3, a[1] + 0.3), (a[0] + 0.3, a[3] - 0.3), (a[2] - 0.3, a[3] - 0.3)):
                    post(d, c, r, TH * 1.6)
                d.polygon(raised(quad(a[0] + 0.1, a[1] + 0.1, a[2] - 0.1, a[3] - 0.1), TH * 1.6), fill=(110, 160, 80))
            add(key, trellis)
        elif what == 'rockery':
            def rockery(d, a=(c0, r0, c1, r1)):
                rnd = random.Random(a[0] * 7 + a[1])
                for i in range(int((a[2] - a[0]) * (a[3] - a[1]) * 0.9)):
                    x, y = top(rnd.uniform(a[0] + 0.3, a[2] - 0.3), rnd.uniform(a[1] + 0.3, a[3] - 0.3))
                    rock(d, x, y, rnd.uniform(TW * 0.25, TW * 0.45), rnd.uniform(TH * 1.2, TH * 2.6), i)
            add(key, rockery)
        elif what == 'corridor':
            def corridor(d, a=(c0, r0, c1, r1)):
                for r in range(a[1], a[3]):
                    post(d, a[0] + 0.5, r + 0.5, TH * 1.8, color=(176, 64, 48), width=4)
                d.polygon(raised(quad(a[0] - 0.1, a[1], a[2] + 0.1, a[3]), TH * 1.8), fill=WALL_TOP)
            add(key, corridor)
        elif what == 'spring':
            def steam(d, a=(c0, r0, c1, r1)):
                rnd = random.Random(5)
                for _ in range(10):
                    x, y = top(rnd.uniform(a[0] + 0.5, a[2] - 0.5), rnd.uniform(a[1] + 0.5, a[3] - 0.5))
                    rr = rnd.uniform(6, 12)
                    d.ellipse([x - rr, y - rr * 2 - 10, x + rr, y - 10], fill=(240, 246, 250))
            add(key, steam)
    # 动物小院的栅栏
    farm = next(a for a in LAYOUT['areas'] if a['id'] == 'farm')
    add(farm['rect'][2] - 1 + farm['rect'][3] - 1 - 0.5, lambda d: fence(d, *farm['rect']))
    return [fn for _, _, fn in sorted(items, key=lambda t: (t[0], t[1]))]


def draw_estate():
    img = Image.new('RGB', (W, H), PAPER)
    d = ImageDraw.Draw(img)
    rnd = random.Random(3)
    # 宅院外面：淡淡的远山
    for i, (x, rx, ry) in enumerate(((W * 0.2, W * 0.22, TH * 4), (W * 0.55, W * 0.3, TH * 5), (W * 0.85, W * 0.2, TH * 3.5))):
        d.ellipse([x - rx, TOP + TH * 2 - ry, x + rx, TOP + TH * 2 + ry], fill=shade((196, 214, 180), 1 - i * 0.04))
    # 地基侧面
    base = quad(0, 0, COLS, ROWS)
    d.polygon([base[3], base[2], (base[2][0], base[2][1] + DEPTH), (base[3][0], base[3][1] + DEPTH)], fill=(150, 118, 92))
    d.polygon([base[2], base[1], (base[1][0], base[1][1] + DEPTH), (base[2][0], base[2][1] + DEPTH)], fill=(176, 134, 96))
    d.polygon(base, fill=COLORS['lawn'])
    draw_ground(d, rnd)
    for fn in standing():
        fn(d)
    return img


def pad32(img):
    """上下补成 3:2（图像模型常见的横图比例），世界框居中、宽度占满；cut_art.py --pad32 按同样的比例裁回来"""
    w = img.width
    h = round(w / 1.5)
    out = Image.new('RGB', (w, h), PAPER)
    out.paste(img, (0, (h - img.height) // 2))
    return out


def draw_labels(img):
    out = img.copy()
    d = ImageDraw.Draw(out)
    font = ImageFont.truetype(FONT, int(TW * 0.5))
    small = ImageFont.truetype(FONT, int(TW * 0.3))
    for a in LAYOUT['areas']:
        c0, r0, c1, r1 = a['rect']
        x, y = top((c0 + c1) / 2, (r0 + r1) / 2)
        for text, f, dy in ((a['name'], font, -TH * 0.5), ('开局就有' if a['cost'] == 0 else f"修整 {a['cost']} 暖豆", small, TH * 0.6)):
            b = d.textbbox((x, y + dy), text, font=f, anchor='mm')
            d.rounded_rectangle([b[0] - 8, b[1] - 4, b[2] + 8, b[3] + 4], radius=8, fill=(255, 255, 255))
            d.text((x, y + dy), text, fill=(40, 40, 40), font=f, anchor='mm')
    return out


def main():
    os.makedirs(os.path.join(OUT, 'estate'), exist_ok=True)
    os.makedirs(GUIDE, exist_ok=True)
    img = draw_estate()
    tw, th = W / SPLIT, H / SPLIT
    total = 0
    for row in range(SPLIT):
        for col in range(SPLIT):
            tile = img.crop((round(col * tw), round(row * th), round((col + 1) * tw), round((row + 1) * th)))
            path = os.path.join(OUT, 'estate', f't{row}{col}.jpg')
            tile.save(path, quality=JPEG_QUALITY, optimize=True)
            total += os.path.getsize(path)
    img.save(os.path.join(GUIDE, 'estate-blockout.jpg'), quality=88, optimize=True)
    pad32(img).save(os.path.join(GUIDE, 'estate-blockout-3x2.jpg'), quality=88, optimize=True)
    draw_labels(img).save(os.path.join(GUIDE, 'estate-blockout-labels.jpg'), quality=88, optimize=True)
    print(f'底图 {W}×{H}，16 块共 {total // 1024} KB；整图、3:2 底稿和标注图已写入')


if __name__ == '__main__':
    main()
