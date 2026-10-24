"""按 shared/camp.js 的 SCENE 画营地白模（正方形大草坪、后面一片树林、正中篝火 + 暖暖锅、锅正后方的大帐篷、火边食盆）

    python3 scripts/camp/blockout.py

输出：miniprogram/images/camp/base/t00.jpg…t33.jpg（1536×1536 切 4×4，底图占位）、
miniprogram/images/camp/cut/tent.png、pot-0.png～pot-3.png（帐篷和锅的「抠图层」占位：盖在底图上，宠物走到后面会被挡住；锅按今天打了几顿换图）、
art/guide/camp-blockout.jpg（1152×1152，Codex 底稿）、art/guide/camp-blockout-labels.jpg（带名字，给人看）。需要 Pillow。
"""
import json
import os
import subprocess

from PIL import Image, ImageDraw, ImageFont

REPO = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..'))
OUT_TILES = os.path.join(REPO, 'miniprogram', 'images', 'camp', 'base')
OUT_CUT = os.path.join(REPO, 'miniprogram', 'images', 'camp', 'cut')
GUIDE = os.path.join(REPO, 'art', 'guide')
FULL_W = 1536          # 包里占位底图的宽
GUIDE_W = 1152

GRASS = (150, 205, 95)
GRASS_DARK = (128, 182, 80)
FOREST = (62, 118, 70)
MOUNTAIN = (170, 196, 205)
SKY = (218, 236, 244)
FIRE = (236, 120, 60)
STONE = (170, 165, 150)
TRUNK = (120, 86, 56)
CANOPY = (88, 150, 78)
BOWL = (210, 200, 180)
TENT = (244, 226, 196)
TENT_DARK = (214, 190, 156)
TENT_DOOR = (222, 132, 80)
POT = (96, 70, 56)
POT_RIM = (130, 98, 78)
POT_IN = (60, 44, 36)
PORRIDGE = (246, 222, 160)
VEG = (120, 170, 90)
CARROT = (230, 130, 70)


def scene():
    js = "console.log(JSON.stringify(require('./cloudfunctions/api/lib/shared/camp').SCENE))"
    return json.loads(subprocess.check_output(['node', '-e', js], cwd=REPO))


def draw_tent(d, S, k):
    """大帐篷：地面占位是 nogo.tent，门朝前（朝篝火）；后面一层深色表示进深"""
    P = lambda pts: [(x * k, y * k) for x, y in pts]
    (tx0, ty0), (tx1, _), (_, ty1) = S['nogo']['tent'][0], S['nogo']['tent'][1], S['nogo']['tent'][2]
    tmx = (tx0 + tx1) / 2
    apex = ty0 - 320
    d.polygon(P([[tx0 + 60, ty1 - 200], [tx1 - 60, ty1 - 200], [tmx, apex - 60]]), fill=TENT_DARK)
    d.polygon(P([[tx0, ty1], [tmx, ty1], [tmx, apex], [tx0 + 40, ty1 - 200]]), fill=TENT_DARK)
    d.polygon(P([[tmx, ty1], [tx1, ty1], [tx1 - 40, ty1 - 200], [tmx, apex]]), fill=TENT)
    d.polygon(P([[tmx - 150, ty1], [tmx + 150, ty1], [tmx, ty1 - 380]]), fill=TENT_DOOR)


def draw_pot(d, S, k, level=0):
    """暖暖锅：三脚架吊着一口大陶锅；level 是今天打了几顿（0～3），锅里就有几层。锅口中心 fy-348（pot 抠图层和这里一致）"""
    fx, fy = S['fire']
    E = lambda cx, cy, rx, ry, fill: d.ellipse([(cx - rx) * k, (cy - ry) * k, (cx + rx) * k, (cy + ry) * k], fill=fill)
    for dx in (-230, 230, 0):
        d.line([((fx + dx) * k, (fy + (60 if dx else -120)) * k), (fx * k, (fy - 620) * k)], fill=TRUNK, width=max(2, int(18 * k)))
    E(fx, fy - 245, 300, 235, POT)
    E(fx, fy - 348, 280, 90, POT_RIM)
    E(fx, fy - 348, 240, 77, POT_IN)
    if level >= 1:
        E(fx, fy - 348, 206, 66, PORRIDGE)
    if level >= 2:
        for dx, dy in [(-120, -16), (-20, 24), (100, -24), (160, 16), (-180, 24)]:
            E(fx + dx, fy - 348 + dy, 28, 20, VEG)
    if level >= 3:
        for dx, dy in [(-80, 16), (40, -24), (120, 24)]:
            E(fx + dx, fy - 348 + dy, 32, 24, CARROT)
        for dx, dy, r in [(-120, -160, 56), (40, -232, 72), (160, -144, 48)]:
            d.ellipse([(fx + dx - r) * k, (fy - 348 + dy - r) * k, (fx + dx + r) * k, (fy - 348 + dy + r) * k], fill=(255, 255, 255, 110))


def draw(width, labels=False):
    S = scene()
    k = width / S['width']
    height = round(S['height'] * k)
    img = Image.new('RGB', (width, height), SKY)
    d = ImageDraw.Draw(img)
    P = lambda pts: [(x * k, y * k) for x, y in pts]
    # 远山、后面一片树林（只当背景，草坪里不放树）、草地
    Wd = S['width']
    d.polygon(P([[0, 0], [Wd, 0], [Wd, 520], [Wd * 0.78, 300], [Wd * 0.52, 420], [Wd * 0.29, 280], [0, 480]]), fill=MOUNTAIN)
    d.rectangle([0, 360 * k, width, 760 * k], fill=FOREST)
    n = max(10, round(Wd / 220))
    for i in range(n):
        cx = (i + 0.5) * Wd / n
        r = 150 if i % 2 else 120
        d.ellipse([(cx - r) * k, (580 - r) * k, (cx + r) * k, (580 + r) * k], fill=CANOPY if i % 3 else FOREST)
    d.rectangle([0, 740 * k, width, height], fill=GRASS_DARK)
    d.polygon(P(S['grass']), fill=GRASS)
    draw_tent(d, S, k)
    # 篝火圈、火、旁边一根木头、食盆
    fx, fy = S['fire']
    d.ellipse([(fx - 260) * k, (fy - 170) * k, (fx + 260) * k, (fy + 170) * k], fill=STONE)
    d.ellipse([(fx - 150) * k, (fy - 110) * k, (fx + 150) * k, (fy + 80) * k], fill=FIRE)
    d.rectangle([(fx + 300) * k, (fy + 120) * k, (fx + 560) * k, (fy + 190) * k], fill=TRUNK)
    draw_pot(d, S, k, 0)
    for bx, by in S['bowls']:
        d.ellipse([(bx - 100) * k, (by - 65) * k, (bx + 100) * k, (by + 65) * k], fill=BOWL, outline=STONE, width=max(1, int(5 * k)))
    if labels:
        font = ImageFont.load_default()
        def tag(x, y, text):
            d.text((x * k + 4, y * k + 4), text, fill=(0, 0, 0), font=font)
        tx0, ty1 = S['nogo']['tent'][0][0], S['nogo']['tent'][2][1]
        tag(fx, fy, 'fire 篝火')
        tag(fx + 320, fy - 560, 'pot 暖暖锅')
        tag(tx0, ty1 + 20, 'tent 大帐篷')
        tag(S['bowls'][0][0], S['bowls'][0][1] - 120, 'bowls 食盆')
        tag(S['sun'][0][0], S['sun'][0][1], 'sun 晒太阳')
        tag(60, 400, 'forest 树林（只在后面当背景）')
        for key, c in S['cutouts'].items():
            l, t, r, b = c['box']
            d.rectangle([l * k, t * k, r * k, b * k], outline=(255, 255, 255), width=2)
            tag(l, t, f'cutout {key}')
        for i, (ex, ey) in enumerate(S['entries']):
            tag(ex, ey, f'entry {i + 1}')
        for sx, sy in S['seats']:
            d.ellipse([sx * k - 6, sy * k - 6, sx * k + 6, sy * k + 6], fill=(255, 255, 255))
        for sx, sy in S['shade'] + S['tent']['spots'] + S['sun']:
            d.ellipse([sx * k - 6, sy * k - 6, sx * k + 6, sy * k + 6], fill=(60, 60, 60))
        d.line(P(S['grass'] + [S['grass'][0]]), fill=(255, 255, 255), width=3)
    return img


def cutout(width, what, level=0):
    """透明底上只画帐篷 / 锅，再裁成 SCENE.cutouts 的那块"""
    S = scene()
    k = width / S['width']
    img = Image.new('RGBA', (width, round(S['height'] * k)), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    if what == 'tent':
        draw_tent(d, S, k)
    else:
        draw_pot(d, S, k, level)
    l, t, r, b = S['cutouts'][what]['box']
    return img.crop((round(l * k), round(t * k), round(r * k), round(b * k)))


def main():
    os.makedirs(OUT_TILES, exist_ok=True)
    os.makedirs(OUT_CUT, exist_ok=True)
    os.makedirs(GUIDE, exist_ok=True)
    full = draw(FULL_W)
    tw, th = full.width / 4, full.height / 4
    total = 0
    for row in range(4):
        for col in range(4):
            tile = full.crop((round(col * tw), round(row * th), round((col + 1) * tw), round((row + 1) * th)))
            path = os.path.join(OUT_TILES, f't{row}{col}.jpg')
            tile.save(path, quality=72, optimize=True)
            total += os.path.getsize(path)
    cuts = 0
    for name, what, level in [('tent', 'tent', 0)] + [(f'pot-{n}', 'pot', n) for n in range(4)]:
        path = os.path.join(OUT_CUT, f'{name}.png')
        cutout(FULL_W, what, level).save(path, optimize=True)
        cuts += os.path.getsize(path)
    draw(GUIDE_W).save(os.path.join(GUIDE, 'camp-blockout.jpg'), quality=88)
    draw(GUIDE_W, labels=True).save(os.path.join(GUIDE, 'camp-blockout-labels.jpg'), quality=88)
    print(f'底图 {full.width}×{full.height}，16 块共 {total // 1024} KB；抠图层 5 张共 {cuts // 1024} KB；底稿和标注图已写入 art/guide/')


if __name__ == '__main__':
    main()
