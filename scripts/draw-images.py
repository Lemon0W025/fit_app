"""生成小程序里用到的图片：tabBar 图标、庭院地块，以及庭院物品和界面图的占位图。

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

from PIL import Image, ImageDraw

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
LAND_WIDTH = 1080  # 与 utils/iso.js 的 isoLayout 比例一致：格宽 = 宽/格数，格高 = 格宽/2，侧面厚 = 格高 × 0.4
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
WILD_DARK = (98, 132, 70)
WEED = ((92, 140, 66), (120, 166, 82), (150, 170, 90))
STONE = ((168, 162, 150), (140, 134, 124))


def draw_plot(wild=False):
    """一块 6×6 的地：开垦的是浅深相间的草地；荒地颜色深一些，长满杂草、散着小石头。带下面的土边"""
    size = 6
    W = LAND_WIDTH * 2
    tw = W / size
    th = tw / 2
    depth = th * 0.4
    H = int(size * th + depth) + 2
    img = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    top = lambda c, r: (W / 2 + (c - r) * tw / 2, (c + r) * th / 2)
    left, bottom, right = (0, size * th / 2), (W / 2, size * th), (W, size * th / 2)
    d.polygon([left, bottom, (bottom[0], bottom[1] + depth), (left[0], left[1] + depth)], fill=SOIL_LEFT)
    d.polygon([bottom, right, (right[0], right[1] + depth), (bottom[0], bottom[1] + depth)], fill=SOIL_RIGHT)
    rim = depth * 0.35
    edge = WILD_DARK if wild else GRASS_DARK
    d.polygon([left, bottom, (bottom[0], bottom[1] + rim), (left[0], left[1] + rim)], fill=edge)
    d.polygon([bottom, right, (right[0], right[1] + rim), (bottom[0], bottom[1] + rim)], fill=shade(edge, 0.92))
    base = WILD if wild else GRASS
    for c in range(size):
        for r in range(size):
            x, y = top(c, r)
            color = base if (c + r) % 2 == 0 else shade(base, 0.95)
            if wild:
                color = base
            d.polygon([(x, y), (x + tw / 2, y + th / 2), (x, y + th), (x - tw / 2, y + th / 2)], fill=color)
    rnd = random.Random(7 if wild else size)
    inside = lambda x, y, k: abs(x - W / 2) / (W / 2) + abs(y - size * th / 2) / (size * th / 2) < k
    if wild:
        for _ in range(26):
            x, y = rnd.uniform(0.1, 0.9) * W, rnd.uniform(0.12, 0.88) * size * th
            if inside(x, y, 0.85):
                rx, ry = rnd.uniform(18, 34), rnd.uniform(10, 18)
                d.ellipse([x - rx, y - ry, x + rx, y + ry], fill=rnd.choice(STONE))
        for _ in range(420):
            x, y = rnd.uniform(0.05, 0.95) * W, rnd.uniform(0.06, 0.94) * size * th
            if not inside(x, y, 0.9):
                continue
            color = rnd.choice(WEED)
            h = rnd.uniform(26, 56)
            for dx in (-10, 0, 10):
                d.line([(x, y), (x + dx * 1.6 + rnd.uniform(-6, 6), y - h)], fill=color, width=7)
    else:
        for _ in range(size * size * 2):
            x, y = rnd.uniform(0.15, 0.85) * W, rnd.uniform(0.1, 0.9) * size * th
            if inside(x, y, 0.92):
                d.line([(x, y), (x + 3, y - 10)], fill=GRASS_DARK, width=4)
    img = img.resize((LAND_WIDTH, int(H / 2)), Image.LANCZOS)
    save_small(img, 'garden', 'plot-wild.png' if wild else 'plot-open.png')


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


def draw_cloud():
    S = 480
    img = Image.new('RGBA', (S, S // 2), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    for x, y, r in ((150, 150, 70), (230, 120, 95), (320, 150, 75), (240, 175, 80)):
        d.ellipse([x - r, y - r * 0.8, x + r, y + r * 0.8], fill=(255, 255, 255, 235))
    save_small(img.resize((240, 120), Image.LANCZOS), 'garden', 'decor-cloud.png')


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


def draw_garden(force=False):
    draw_plot()
    draw_plot(wild=True)
    draw_sign()
    draw_cloud()
    draw_hint()
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
    print('images written to', os.path.normpath(ROOT))
