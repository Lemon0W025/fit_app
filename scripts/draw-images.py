"""生成小程序里用到的图片：tabBar 图标、小岛底图和没修整角落的遮罩、庭院物品和界面图的占位图，以及给 Codex 的小岛布局草图。

用法（需要 Pillow）：
    python3 scripts/draw-images.py            # 占位图只补缺的，不覆盖已有的正式美术
    python3 scripts/draw-images.py --force    # 占位图全部重画（会盖掉正式美术，之后再跑 scripts/slice-art.py）

正式美术由 scripts/slice-art.py 从 art/raw/ 的整图切出来。

输出到 miniprogram/images/。所有图先按 4 倍尺寸画，再缩小，边缘更平滑。
"""
import json
import math
import os
import random
import subprocess
import sys

from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'miniprogram', 'images')
K = 4


def shrink(img, size):
    return img.resize((size, size), Image.LANCZOS)


def save(img, size, *parts):
    path = os.path.join(ROOT, *parts)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    shrink(img, size).save(path, optimize=True)


# ---------------------------------------------------------------- tabBar 图标

TAB_SIZE = 81
TAB_COLORS = {'': (138, 131, 120, 255), '-on': (78, 125, 91, 255)}


def tab_canvas():
    s = TAB_SIZE * K
    img = Image.new('RGBA', (s, s), (0, 0, 0, 0))
    return img, ImageDraw.Draw(img), s


def tab_today(d, c, s):
    w = 6 * K
    d.chord([56, 60, s - 56, s - 60], 0, 180, fill=c)
    d.rounded_rectangle([44, s // 2 - 6, s - 44, s // 2 + 14], radius=10, fill=c)
    d.rounded_rectangle([s // 2 - 52, s - 76, s // 2 + 52, s - 56], radius=8, fill=c)
    for x in (s // 2 - 56, s // 2, s // 2 + 56):
        d.arc([x - 14, 36, x + 14, 88], 90, 270, fill=c, width=w)
        d.arc([x - 14, 84, x + 14, 136], 270, 90, fill=c, width=w)


def tab_forest(d, c, s):
    cx = s // 2
    d.rounded_rectangle([cx - 14, 190, cx + 14, s - 52], radius=6, fill=c)
    for x, y, r in ((cx, 112, 72), (cx - 62, 160, 50), (cx + 62, 160, 50), (cx, 168, 58)):
        d.ellipse([x - r, y - r, x + r, y + r], fill=c)
    d.rounded_rectangle([60, s - 60, s - 60, s - 44], radius=8, fill=c)


def tab_weight(d, c, s):
    w = 6 * K
    d.rounded_rectangle([52, 52, s - 52, s - 52], radius=48, outline=c, width=w)
    cx, cy = s // 2, 130
    d.arc([cx - 64, cy - 40, cx + 64, cy + 88], 200, 340, fill=c, width=w)
    d.line([cx, cy + 24, cx + 30, cy - 18], fill=c, width=w)
    d.ellipse([cx - 12, cy + 12, cx + 12, cy + 36], fill=c)


def tab_profile(d, c, s):
    w = 6 * K
    cx = s // 2
    d.ellipse([cx - 56, 44, cx + 56, 156], outline=c, width=w)
    d.arc([cx - 112, 182, cx + 112, 406], 180, 360, fill=c, width=w)
    d.line([cx - 112 + w // 2, 294, cx + 112 - w // 2, 294], fill=c, width=w)


def draw_tabs():
    for name, fn in (('today', tab_today), ('forest', tab_forest), ('weight', tab_weight), ('profile', tab_profile)):
        for suffix, color in TAB_COLORS.items():
            img, d, s = tab_canvas()
            fn(d, color, s)
            save(img, TAB_SIZE, f'tab-{name}{suffix}.png')


# ---------------------------------------------------------------- 颜色与小工具

GRASS = (165, 209, 122)
GRASS_DARK = (134, 184, 94)
SOIL_LEFT = (156, 107, 67)
SOIL_RIGHT = (185, 130, 79)


def shade(color, f):
    return tuple(max(0, min(255, int(c * f))) for c in color[:3])


def tint(color, f):
    return tuple(int(c + (255 - c) * f) for c in color[:3])


def P(*xy):
    return [v * K for v in xy]


# ---------------------------------------------------------------- 养生庭院

REPO = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
EMOJI_FONT = '/usr/share/fonts/truetype/noto/NotoColorEmoji.ttf'
ITEM_SIZE = 160


def load_items():
    out = subprocess.check_output(
        ['node', '-e', "console.log(JSON.stringify(require('./cloudfunctions/api/lib/shared/garden').ITEMS))"], cwd=REPO)
    return json.loads(out)


def emoji_image(ch, box):
    from PIL import ImageFont
    font = ImageFont.truetype(EMOJI_FONT, 109)
    im = Image.new('RGBA', (180, 180), (0, 0, 0, 0))
    ImageDraw.Draw(im).text((10, 10), ch, font=font, embedded_color=True)
    im = im.crop(im.getbbox())
    scale = box / max(im.size)
    return im.resize((max(1, int(im.width * scale)), max(1, int(im.height * scale))), Image.LANCZOS)


def bottom_anchored(obj, size=ITEM_SIZE, margin=4):
    """物品图统一成正方形，物体贴底居中，这样在庭院里底边对齐格子"""
    canvas = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    canvas.alpha_composite(obj, ((size - obj.width) // 2, size - margin - obj.height))
    return canvas


def save_small(img, *parts, quantize=True):
    """量化成 256 色调色板（保留透明度），体积小很多，肉眼看不出区别"""
    path = os.path.join(ROOT, *parts)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    if quantize:
        img = img.quantize(colors=256, method=Image.Quantize.FASTOCTREE)
    img.save(path, optimize=True)


WILD = (126, 160, 92)
WEED = ((92, 140, 66), (120, 166, 82), (150, 170, 90))
STONE = ((168, 162, 150), (140, 134, 124))


def draw_sign():
    """开荒木牌：一根木桩 + 上面一块空白木板（价格由页面写上去）"""
    S = 480
    img = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    wood, wood_dark, board = (150, 100, 56), (112, 72, 38), (226, 184, 120)
    d.rounded_rectangle([S / 2 - 22, 150, S / 2 + 22, S - 20], radius=10, fill=wood_dark)
    d.ellipse([S / 2 - 60, S - 44, S / 2 + 60, S - 8], fill=(90, 120, 60, 120))
    d.rounded_rectangle([40, 40, S - 40, 230], radius=28, fill=wood_dark)
    d.rounded_rectangle([52, 50, S - 52, 218], radius=22, fill=board)
    for y in (100, 160):
        d.line([(70, y), (S - 70, y)], fill=shade(board, 0.9), width=4)
    d.ellipse([S / 2 - 12, 58, S / 2 + 12, 82], fill=wood)
    save_small(img.resize((240, 240), Image.LANCZOS), 'garden', 'sign.png')


ISLAND = 12
SAND = (240, 224, 184)
SAND_DARK = (222, 200, 152)
PATH_STONE = (230, 218, 194)
PATH_EDGE = (198, 184, 158)
BED_SOIL = (118, 160, 86)
BED_EDGE = (176, 150, 112)


def draw_island():
    """整座小岛的底图：草地、十字石板路、四个花坛的底色、沙滩边、悬崖土边。和 utils/world.js 的 islandView 对齐"""
    W = 1440 * 2
    tw = W / ISLAND
    th = tw / 2
    depth = th * 0.4
    H = int(ISLAND * th + depth) + 2
    img = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    top = lambda c, r: (W / 2 + (c - r) * tw / 2, (c + r) * th / 2)
    quad = lambda c0, r0, c1, r1: [top(c0, r0), top(c1, r0), top(c1, r1), top(c0, r1)]
    left, bottom, right = top(0, ISLAND), top(ISLAND, ISLAND), top(ISLAND, 0)
    # 悬崖土边，上面一圈沙滩
    d.polygon([left, bottom, (bottom[0], bottom[1] + depth), (left[0], left[1] + depth)], fill=SOIL_LEFT)
    d.polygon([bottom, right, (right[0], right[1] + depth), (bottom[0], bottom[1] + depth)], fill=SOIL_RIGHT)
    rim = depth * 0.45
    d.polygon([left, bottom, (bottom[0], bottom[1] + rim), (left[0], left[1] + rim)], fill=SAND)
    d.polygon([bottom, right, (right[0], right[1] + rim), (bottom[0], bottom[1] + rim)], fill=SAND_DARK)
    # 草地：一整片，深浅斑驳，不画格子
    d.polygon(quad(0, 0, ISLAND, ISLAND), fill=GRASS)
    layer = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    ld = ImageDraw.Draw(layer)
    rnd = random.Random(12)
    for _ in range(320):
        c, r = rnd.uniform(0.3, ISLAND - 0.3), rnd.uniform(0.3, ISLAND - 0.3)
        x, y = top(c, r)
        rx = rnd.uniform(0.3, 0.9) * tw
        color = shade(GRASS, 0.93) if rnd.random() < 0.5 else tint(GRASS, 0.12)
        ld.ellipse([x - rx, y - rx / 2, x + rx, y + rx / 2], fill=color + (70,))
    # 只留小岛上的部分，别洇到海上
    land = Image.new('L', (W, H), 0)
    ImageDraw.Draw(land).polygon(quad(0, 0, ISLAND, ISLAND), fill=255)
    layer.putalpha(Image.composite(layer.getchannel('A'), land, land))
    img.alpha_composite(layer)
    d = ImageDraw.Draw(img)
    # 四个花坛：深一点的土色，围一圈浅边
    for c0, r0 in ((0, 0), (9, 0), (0, 9), (9, 9)):
        d.polygon(quad(c0 + 0.2, r0 + 0.2, c0 + 2.8, r0 + 2.8), fill=BED_SOIL, outline=BED_EDGE, width=10)
    # 十字石板路：c = 6 一列、r = 6 一行（花坛里没有）
    path_tiles = {(6, i) for i in range(ISLAND)} | {(i, 6) for i in range(ISLAND)}
    for c, r in sorted(path_tiles):
        d.polygon(quad(c + 0.04, r + 0.04, c + 0.96, r + 0.96), fill=PATH_STONE)
        for _ in range(3):
            sc, sr = c + rnd.uniform(0.25, 0.75), r + rnd.uniform(0.25, 0.75)
            x, y = top(sc, sr)
            rx = rnd.uniform(0.12, 0.2) * tw
            d.ellipse([x - rx, y - rx / 2, x + rx, y + rx / 2], fill=tint(PATH_STONE, 0.3), outline=PATH_EDGE, width=5)
    # 草的小笔触
    for _ in range(ISLAND * ISLAND * 3):
        c, r = rnd.uniform(0.2, ISLAND - 0.2), rnd.uniform(0.2, ISLAND - 0.2)
        if (int(c), int(r)) in path_tiles:
            continue
        x, y = top(c, r)
        d.line([(x, y), (x + 3, y - 12)], fill=GRASS_DARK, width=5)
    img = img.resize((W // 2, H // 2), Image.LANCZOS)
    save_small(img, 'garden', 'island.png')


def draw_locked():
    """没修整的角落遮罩：杂草地 + 一圈篱笆。横着的（c 方向 6 格、r 方向 3 格）画一张，竖着的是它的镜像"""
    w, h = 6, 3
    tw = 480
    th = tw / 2
    up = tw * 0.6
    W = int((w + h) * tw / 2)
    H = int((w + h) * th / 2 + up) + 2
    img = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    x0 = h * tw / 2
    top = lambda c, r: (x0 + (c - r) * tw / 2, up + (c + r) * th / 2)
    rnd = random.Random(21)
    post_h = th * 0.9

    def fence(a, b):
        (ca, ra), (cb, rb) = a, b
        n = int(max(abs(cb - ca), abs(rb - ra)) / 0.75) + 1
        points = [top(ca + (cb - ca) * k / n, ra + (rb - ra) * k / n) for k in range(n + 1)]
        for frac in (0.35, 0.72):
            d.line([(x, y - post_h * frac) for x, y in points], fill=(150, 108, 66), width=14)
        for x, y in points:
            d.rounded_rectangle([x - 12, y - post_h, x + 12, y + 6], radius=8, fill=(126, 88, 52))

    d.polygon([top(0, 0), top(w, 0), top(w, h), top(0, h)], fill=WILD)
    fence((0, 0), (w, 0))
    fence((0, 0), (0, h))
    for _ in range(26):
        c, r = rnd.uniform(0.3, w - 0.3), rnd.uniform(0.3, h - 0.3)
        x, y = top(c, r)
        rx = rnd.uniform(14, 28)
        d.ellipse([x - rx, y - rx / 2, x + rx, y + rx / 2], fill=rnd.choice(STONE))
    for _ in range(320):
        c, r = rnd.uniform(0.1, w - 0.1), rnd.uniform(0.1, h - 0.1)
        x, y = top(c, r)
        color = rnd.choice(WEED)
        hgt = rnd.uniform(26, 56)
        for dx in (-10, 0, 10):
            d.line([(x, y), (x + dx * 1.6 + rnd.uniform(-6, 6), y - hgt)], fill=color, width=7)
    fence((w, 0), (w, h))
    fence((0, h), (w, h))
    img = img.resize((W // 2, H // 2), Image.LANCZOS)
    save_small(img, 'garden', 'locked-wide.png')
    save_small(img.transpose(Image.FLIP_LEFT_RIGHT), 'garden', 'locked-tall.png')


def draw_hint():
    W, H = 360, 180
    img = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    pts = [(W / 2, 6), (W - 6, H / 2), (W / 2, H - 6), (6, H / 2)]
    d.polygon(pts, fill=(255, 250, 220, 120), outline=(255, 214, 102, 255), width=8)
    save_small(img.resize((180, 90), Image.LANCZOS), 'garden', 'tile-hint.png')


def draw_capsule(top_color, glow=None):
    S = 640
    img = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    if glow:
        for i in range(12, 0, -1):
            a = int(10 * (13 - i))
            d.ellipse([S / 2 - 250 - i * 6, S / 2 - 250 - i * 6, S / 2 + 250 + i * 6, S / 2 + 250 + i * 6], fill=glow + (a // 4,))
    box = [S / 2 - 240, S / 2 - 240, S / 2 + 240, S / 2 + 240]
    d.ellipse(box, fill=(246, 244, 240))
    d.pieslice(box, 180, 360, fill=top_color)
    d.rectangle([box[0], S / 2 - 18, box[2], S / 2 + 18], fill=(255, 255, 255))
    d.ellipse([S / 2 - 150, S / 2 - 190, S / 2 - 60, S / 2 - 120], fill=(255, 255, 255, 170))
    return img.resize((160, 160), Image.LANCZOS)


def draw_gacha_machine():
    S = 800
    img = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.rounded_rectangle([200, 470, 600, 760], radius=60, fill=(214, 64, 52))
    d.rounded_rectangle([170, 440, 630, 500], radius=30, fill=(232, 182, 60))
    d.ellipse([170, 80, 630, 520], fill=(220, 238, 246), outline=(255, 255, 255), width=10)
    rnd = random.Random(3)
    colors = [(246, 244, 240), (90, 160, 230), (170, 110, 220), (240, 196, 60), (230, 90, 80)]
    for _ in range(16):
        x, y = rnd.uniform(250, 550), rnd.uniform(260, 430)
        c = rnd.choice(colors)
        d.ellipse([x - 48, y - 48, x + 48, y + 48], fill=c, outline=(255, 255, 255), width=6)
    d.ellipse([280, 120, 360, 180], fill=(255, 255, 255, 180))
    d.rounded_rectangle([340, 40, 460, 100], radius=30, fill=(214, 64, 52))
    d.ellipse([370, 10, 430, 70], fill=(232, 182, 60))
    d.ellipse([350, 560, 450, 660], fill=(232, 182, 60))
    d.rectangle([390, 575, 410, 645], fill=(190, 140, 40))
    d.rounded_rectangle([470, 640, 560, 720], radius=20, fill=(120, 40, 34))
    return img.resize((320, 320), Image.LANCZOS)


GUIDE_FONT = '/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc'
GUIDE_COLORS = {
    'center': (196, 228, 160), 'pond': (176, 214, 236), 'bamboo': (170, 214, 150),
    'veg': (232, 214, 150), 'tea': (230, 196, 196),
}


def draw_guide():
    """art/guide/island-layout.png：小岛布局草图（分区、小路、花坛、风景位置），交给 Codex 照着画精致底图"""
    regions = json.loads(subprocess.check_output(
        ['node', '-e', "const g=require('./cloudfunctions/api/lib/shared/garden');"
         "console.log(JSON.stringify({regions:g.REGIONS,scenery:g.SCENERY.map((s)=>({...s,name:g.itemById(s.itemId).name}))}))"],
        cwd=REPO))
    W = 1600
    tw = W / ISLAND
    th = tw / 2
    H = int(ISLAND * th) + 420
    img = Image.new('RGB', (W, H), (150, 200, 230))
    d = ImageDraw.Draw(img)
    top = lambda c, r: (W / 2 + (c - r) * tw / 2, 100 + (c + r) * th / 2)
    quad = lambda c0, r0, c1, r1: [top(c0, r0), top(c1, r0), top(c1, r1), top(c0, r1)]
    try:
        font = ImageFont.truetype(GUIDE_FONT, 22)
        big = ImageFont.truetype(GUIDE_FONT, 30)
    except OSError:
        font = big = ImageFont.load_default()

    def label(x, y, text, f):
        box = d.textbbox((x, y), text, font=f, anchor='mm')
        d.rounded_rectangle([box[0] - 8, box[1] - 4, box[2] + 8, box[3] + 4], radius=8, fill=(255, 255, 255))
        d.text((x, y), text, fill=(40, 40, 40), font=f, anchor='mm')

    d.polygon(quad(0, 0, ISLAND, ISLAND), fill=(120, 170, 90))
    for g in regions['regions']:
        c0, r0, c1, r1 = g['rect']
        d.polygon(quad(c0, r0, c1, r1), fill=GUIDE_COLORS[g['id']], outline=(80, 80, 80), width=3)
    for i in range(ISLAND):
        for c, r in ((6, i), (i, 6)):
            d.polygon(quad(c + 0.1, r + 0.1, c + 0.9, r + 0.9), fill=(235, 225, 200))
    for c0, r0 in ((0, 0), (9, 0), (0, 9), (9, 9)):
        label(*top(c0 + 1.5, r0 + 1.5), 'flower bed 花坛', font)
    for g in regions['regions']:
        c0, r0, c1, r1 = g['rect']
        cost = f" · {g['cost']}" if g['cost'] else ''
        # 中间花园的名字往后挪一点，别压在十字路口上
        c, r = ((c0 + c1) / 2, (r0 + r1) / 2) if g['id'] != 'center' else (4.5, 4.5)
        label(*top(c, r), f"{g['id'].upper()} {g['name']}{cost}", big)
    # 风景：格子上画编号，下面列图例
    for i, s in enumerate(regions['scenery'], 1):
        x, y = top(s['c'] + 0.5, s['r'] + 0.5)
        d.ellipse([x - 20, y - 20, x + 20, y + 20], fill=(200, 60, 60), outline=(255, 255, 255), width=3)
        d.text((x, y), str(i), fill=(255, 255, 255), font=font, anchor='mm')
    legend_top = int(ISLAND * th) + 200
    d.text((40, legend_top), 'Scenery 风景（每件占一格；红圈编号 = 位置）', fill=(30, 30, 30), font=font)
    for i, s in enumerate(regions['scenery'], 1):
        col, row = (i - 1) % 3, (i - 1) // 3
        x, y = 40 + col * 520, legend_top + 44 + row * 40
        d.ellipse([x, y, x + 30, y + 30], fill=(200, 60, 60))
        d.text((x + 15, y + 15), str(i), fill=(255, 255, 255), font=font, anchor='mm')
        d.text((x + 42, y + 15), f"{s['itemId']} {s['name']}  ({s['region']}, c{s['c']} r{s['r']})", fill=(30, 30, 30), font=font, anchor='lm')
    path = os.path.join(REPO, 'art', 'guide', 'island-layout.png')
    os.makedirs(os.path.dirname(path), exist_ok=True)
    img.save(path, optimize=True)


def draw_garden(force=False):
    draw_island()
    draw_locked()
    draw_hint()
    draw_sign()
    # 物品与界面的占位图：已经有正式美术就不覆盖
    def missing(*parts):
        return force or not os.path.exists(os.path.join(ROOT, *parts))
    for item in load_items():
        if missing('garden', 'items', item['id'] + '.png'):
            box = {'s': 110, 'm': 130, 'l': 150}[item['size']]
            save_small(bottom_anchored(emoji_image(item['emoji'], box)), 'garden', 'items', item['id'] + '.png')
    ui = {
        'bean.png': lambda: bottom_anchored(emoji_image('🫘', 120), margin=20),
        'gift.png': lambda: bottom_anchored(emoji_image('🎁', 130)),
        'book.png': lambda: bottom_anchored(emoji_image('📗', 130)),
        'shovel.png': lambda: bottom_anchored(emoji_image('⛏️', 130)),
        'gacha.png': draw_gacha_machine,
        'capsule-common.png': lambda: draw_capsule((214, 210, 204)),
        'capsule-rare.png': lambda: draw_capsule((84, 160, 232)),
        'capsule-epic.png': lambda: draw_capsule((168, 104, 224), glow=(190, 130, 255)),
        'capsule-legendary.png': lambda: draw_capsule((240, 192, 48), glow=(255, 214, 90)),
        'calendar.png': lambda: bottom_anchored(emoji_image('📅', 130)),
        'basket.png': lambda: bottom_anchored(emoji_image('🧺', 130)),
        'home.png': lambda: bottom_anchored(emoji_image('🏠', 130)),
    }
    for name, fn in ui.items():
        if missing('garden', 'ui', name):
            save_small(fn(), 'garden', 'ui', name)


if __name__ == '__main__':
    draw_tabs()
    draw_garden(force='--force' in sys.argv)
    draw_guide()
    print('images written to', os.path.normpath(ROOT))
