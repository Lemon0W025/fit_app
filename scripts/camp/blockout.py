"""按 shared/camp.js 的 SCENE 画营地白模（正方形大草坪、后面一片树林、正中篝火 + 暖暖锅、锅正后方的大帐篷、火边食盆）

    python3 scripts/camp/blockout.py

输出：art/guide/camp-blockout.jpg（1152×1152，布局示意）、art/guide/camp-blockout-labels.jpg（带名字，给人看）。
包里不再放白模切块：页面底下垫的是正式画缩小的那张（cut_art.py --backdrop），高清切块在云存储。需要 Pillow。
"""
import json
import os
import re
import subprocess

from PIL import Image, ImageDraw, ImageFont

REPO = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..'))
GUIDE = os.path.join(REPO, 'art', 'guide')
GUIDE_W = 1152

DAY = dict(GRASS=(150, 205, 95), GRASS_DARK=(128, 182, 80), FOREST=(62, 118, 70), MOUNTAIN=(170, 196, 205), SKY=(218, 236, 244),
           FIRE=(236, 120, 60), STONE=(170, 165, 150), TRUNK=(120, 86, 56), CANOPY=(88, 150, 78), BOWL=(210, 200, 180),
           TENT=(244, 226, 196), TENT_DARK=(214, 190, 156), TENT_DOOR=(222, 132, 80), POT=(96, 70, 56), POT_RIM=(130, 98, 78), POT_IN=(60, 44, 36),
           PORRIDGE=(246, 222, 160), VEG=(120, 170, 90), CARROT=(230, 130, 70), GLOW=None, STARS=False)
NIGHT = dict(GRASS=(66, 104, 72), GRASS_DARK=(54, 88, 62), FOREST=(26, 56, 46), MOUNTAIN=(48, 62, 96), SKY=(26, 36, 78),
             FIRE=(255, 160, 70), STONE=(118, 112, 104), TRUNK=(78, 54, 36), CANOPY=(38, 80, 58), BOWL=(150, 142, 130),
             TENT=(168, 156, 136), TENT_DARK=(130, 118, 102), TENT_DOOR=(255, 196, 96), POT=(70, 52, 44), POT_RIM=(96, 72, 58), POT_IN=(40, 30, 26),
             PORRIDGE=(214, 192, 140), VEG=(96, 136, 76), CARROT=(200, 112, 60), GLOW=(255, 170, 70), STARS=True)
C = dict(DAY)


def use(palette):
    """换调色板：日景 / 夜景（夜景多一圈篝火暖光和星星）"""
    C.clear()
    C.update(palette)


def scene():
    js = "console.log(JSON.stringify(require('./cloudfunctions/api/lib/shared/camp').SCENE))"
    return json.loads(subprocess.check_output(['node', '-e', js], cwd=REPO))


def draw_tent(d, S, k):
    """大帐篷：按抠图轮廓 poly 画一块（地面占位 nogo.tent 画深一点）"""
    P = lambda pts: [(x * k, y * k) for x, y in pts]
    d.polygon(P(S['cutouts']['tent']['poly']), fill=C['TENT'])
    d.polygon(P(S['nogo']['tent']), fill=C['TENT_DARK'])


def draw_pot(d, S, k, level=0):
    """暖暖锅：三脚架吊着一口大陶锅；level 是今天打了几顿（0～3），锅里就有几层。锅口中心 fy-348（pot 抠图层和这里一致）"""
    fx, fy = S['fire']
    E = lambda cx, cy, rx, ry, fill: d.ellipse([(cx - rx) * k, (cy - ry) * k, (cx + rx) * k, (cy + ry) * k], fill=fill)
    for dx in (-230, 230, 0):
        d.line([((fx + dx) * k, (fy + (60 if dx else -120)) * k), (fx * k, (fy - 620) * k)], fill=C['TRUNK'], width=max(2, int(18 * k)))
    E(fx, fy - 245, 300, 235, C['POT'])
    E(fx, fy - 348, 280, 90, C['POT_RIM'])
    E(fx, fy - 348, 240, 77, C['POT_IN'])
    if level >= 1:
        E(fx, fy - 348, 206, 66, C['PORRIDGE'])
    if level >= 2:
        for dx, dy in [(-120, -16), (-20, 24), (100, -24), (160, 16), (-180, 24)]:
            E(fx + dx, fy - 348 + dy, 28, 20, C['VEG'])
    if level >= 3:
        for dx, dy in [(-80, 16), (40, -24), (120, 24)]:
            E(fx + dx, fy - 348 + dy, 32, 24, C['CARROT'])
        for dx, dy, r in [(-120, -160, 56), (40, -232, 72), (160, -144, 48)]:
            d.ellipse([(fx + dx - r) * k, (fy - 348 + dy - r) * k, (fx + dx + r) * k, (fy - 348 + dy + r) * k], fill=(255, 255, 255, 110))


def draw(width, labels=False):
    S = scene()
    k = width / S['width']
    height = round(S['height'] * k)
    img = Image.new('RGB', (width, height), C['SKY'])
    d = ImageDraw.Draw(img)
    P = lambda pts: [(x * k, y * k) for x, y in pts]
    # 远山、后面一片树林（只当背景，草坪里不放树）、草地
    Wd = S['width']
    d.polygon(P([[0, 0], [Wd, 0], [Wd, 520], [Wd * 0.78, 300], [Wd * 0.52, 420], [Wd * 0.29, 280], [0, 480]]), fill=C['MOUNTAIN'])
    d.rectangle([0, 360 * k, width, 760 * k], fill=C['FOREST'])
    n = max(10, round(Wd / 220))
    for i in range(n):
        cx = (i + 0.5) * Wd / n
        r = 150 if i % 2 else 120
        d.ellipse([(cx - r) * k, (580 - r) * k, (cx + r) * k, (580 + r) * k], fill=C['CANOPY'] if i % 3 else C['FOREST'])
    d.rectangle([0, 740 * k, width, height], fill=C['GRASS_DARK'])
    d.polygon(P(S['grass']), fill=C['GRASS'])
    if C['STARS']:
        import random
        rnd = random.Random(7)
        for _ in range(60):
            sx, sy = rnd.random() * width, rnd.random() * 330 * k
            d.ellipse([sx - 1.5, sy - 1.5, sx + 1.5, sy + 1.5], fill=(255, 255, 230))
    fx, fy = S['fire']
    if C['GLOW']:
        # 夜里篝火把周围一圈草地照暖
        glow = Image.new('RGBA', img.size, (0, 0, 0, 0))
        gd = ImageDraw.Draw(glow)
        for r, al in [(1100, 40), (800, 60), (520, 90)]:
            gd.ellipse([(fx - r) * k, (fy - r * 0.7) * k, (fx + r) * k, (fy + r * 0.7) * k], fill=C['GLOW'] + (al,))
        img.paste(Image.alpha_composite(img.convert('RGBA'), glow).convert('RGB'))
        d = ImageDraw.Draw(img)
    draw_tent(d, S, k)
    # 篝火圈、火、旁边一根木头、食盆
    d.ellipse([(fx - 260) * k, (fy - 170) * k, (fx + 260) * k, (fy + 170) * k], fill=C['STONE'])
    d.ellipse([(fx - 150) * k, (fy - 110) * k, (fx + 150) * k, (fy + 80) * k], fill=C['FIRE'])
    d.rectangle([(fx + 300) * k, (fy + 120) * k, (fx + 560) * k, (fy + 190) * k], fill=C['TRUNK'])
    draw_pot(d, S, k, 0)
    for bx, by in S['bowls']:
        d.ellipse([(bx - 100) * k, (by - 65) * k, (bx + 100) * k, (by + 65) * k], fill=C['BOWL'], outline=C['STONE'], width=max(1, int(5 * k)))
    if labels:
        font = ImageFont.load_default()
        def tag(x, y, text):
            d.text((x * k + 4, y * k + 4), text, fill=(0, 0, 0), font=font)
        tag(fx, fy, 'fire 篝火')
        tag(fx + 320, fy - 560, 'pot 暖暖锅')
        tag(S['nogo']['tent'][0][0], S['nogo']['tent'][0][1] + 20, 'tent 大帐篷')
        tag(S['bowls'][0][0], S['bowls'][0][1] - 120, 'bowls 食盆')
        tag(S['sun'][0][0], S['sun'][0][1], 'sun 晒太阳')
        tag(60, 400, 'forest 树林（只在后面当背景）')
        for key, c in S['cutouts'].items():
            l, t, r, bb = c['box']
            d.rectangle([l * k, t * k, r * k, bb * k], outline=(255, 255, 255), width=2)
            if c.get('poly'):
                d.polygon(P(c['poly']), outline=(80, 160, 255))
            tag(l, t, f'cutout {key}')
        for i, (ex, ey) in enumerate(S['entries']):
            tag(ex, ey, f'entry {i + 1}')
        for sx, sy in S['seats']:
            d.ellipse([sx * k - 6, sy * k - 6, sx * k + 6, sy * k + 6], fill=(255, 255, 255))
        for sx, sy in S['shade'] + S['tent']['spots'] + S['sun']:
            d.ellipse([sx * k - 6, sy * k - 6, sx * k + 6, sy * k + 6], fill=(60, 60, 60))
        d.line(P(S['grass'] + [S['grass'][0]]), fill=(255, 255, 255), width=3)
    return img


def main():
    os.makedirs(GUIDE, exist_ok=True)
    use(DAY)
    draw(GUIDE_W).save(os.path.join(GUIDE, 'camp-blockout.jpg'), quality=88)
    draw(GUIDE_W, labels=True).save(os.path.join(GUIDE, 'camp-blockout-labels.jpg'), quality=88)
    print('底稿和标注图已写入 art/guide/（底图垫图由 cut_art.py --backdrop 出，抠图层由 cutouts.py 从画上抠）')


if __name__ == '__main__':
    main()
