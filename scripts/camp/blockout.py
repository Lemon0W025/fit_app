"""按 shared/camp.js 的 SCENE 画营地白模（空旷草坪、后面一片树林、大帐篷 + 篝火 + 食盆一组）：包里的占位底图（切 16 块）+ 给 Codex 的底稿和标注图

    python3 scripts/camp/blockout.py

输出：miniprogram/images/camp/base/t00.jpg…t33.jpg（1536×2048 切 4×4）、art/guide/camp-blockout.jpg（1152×1536，Codex 底稿）、
art/guide/camp-blockout-labels.jpg（带名字，给人看）。需要 Pillow。
"""
import json
import os
import subprocess

from PIL import Image, ImageDraw, ImageFont

REPO = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..'))
OUT_TILES = os.path.join(REPO, 'miniprogram', 'images', 'camp', 'base')
GUIDE = os.path.join(REPO, 'art', 'guide')
FULL_W = 1536          # 包里占位底图的宽（高按 3:4）
GUIDE_W = 1152

GRASS = (150, 205, 95)
GRASS_DARK = (128, 182, 80)
FOREST = (62, 118, 70)
MOUNTAIN = (170, 196, 205)
SKY = (218, 236, 244)
TENT = (244, 226, 196)
TENT_DARK = (214, 190, 156)
TENT_DOOR = (222, 132, 80)
FIRE = (236, 120, 60)
STONE = (170, 165, 150)
TRUNK = (120, 86, 56)
CANOPY = (88, 150, 78)
BOWL = (210, 200, 180)


def scene():
    js = "console.log(JSON.stringify(require('./cloudfunctions/api/lib/shared/camp').SCENE))"
    return json.loads(subprocess.check_output(['node', '-e', js], cwd=REPO))


def draw(width, labels=False):
    S = scene()
    k = width / S['width']
    height = round(S['height'] * k)
    img = Image.new('RGB', (width, height), SKY)
    d = ImageDraw.Draw(img)
    P = lambda pts: [(x * k, y * k) for x, y in pts]
    # 远山、后面一片树林（只当背景，草坪里不放树）、草地
    d.polygon(P([[0, 0], [S['width'], 0], [S['width'], 520], [2400, 300], [1600, 420], [900, 280], [0, 480]]), fill=MOUNTAIN)
    d.rectangle([0, 360 * k, width, 720 * k], fill=FOREST)
    for i in range(14):
        cx = (i + 0.5) * S['width'] / 14
        r = 150 if i % 2 else 120
        d.ellipse([(cx - r) * k, (560 - r) * k, (cx + r) * k, (560 + r) * k], fill=CANOPY if i % 3 else FOREST)
    d.rectangle([0, 700 * k, width, height], fill=GRASS_DARK)
    d.polygon(P(S['grass']), fill=GRASS)
    # 大帐篷：地面占位是 nogo.tent，帐篷本身往上立起来；左面背光、右面受光，门朝篝火（右下）
    (tx0, ty0), (tx1, _), (_, ty1) = S['nogo']['tent'][0], S['nogo']['tent'][1], S['nogo']['tent'][2]
    tmx = (tx0 + tx1) / 2
    apex = ty0 - 520
    d.polygon(P([[tx0, ty1], [tmx, ty1], [tmx, apex], [tx0, ty0]]), fill=TENT_DARK)
    d.polygon(P([[tmx, ty1], [tx1, ty1], [tx1, ty0], [tmx, apex]]), fill=TENT)
    d.polygon(P([[tmx + 60, ty1], [tx1 - 60, ty1], [tmx + 150, ty0 + 60]]), fill=TENT_DOOR)
    # 篝火、食盆
    fx, fy = S['fire']
    d.ellipse([(fx - 260) * k, (fy - 170) * k, (fx + 260) * k, (fy + 170) * k], fill=STONE)
    d.ellipse([(fx - 150) * k, (fy - 110) * k, (fx + 150) * k, (fy + 80) * k], fill=FIRE)
    d.rectangle([(fx + 300) * k, (fy + 120) * k, (fx + 560) * k, (fy + 190) * k], fill=TRUNK)   # 旁边一根木头
    for bx, by in S['bowls']:
        d.ellipse([(bx - 100) * k, (by - 65) * k, (bx + 100) * k, (by + 65) * k], fill=BOWL, outline=STONE, width=max(1, int(5 * k)))
    if labels:
        font = ImageFont.load_default()
        def tag(x, y, text):
            d.text((x * k + 4, y * k + 4), text, fill=(0, 0, 0), font=font)
        tag(fx, fy, 'fire 篝火')
        tag(tx0, ty1 + 20, 'tent 大帐篷')
        tag(S['bowls'][0][0], S['bowls'][0][1] - 120, 'bowls 食盆')
        tag(S['sun'][0][0], S['sun'][0][1], 'sun 晒太阳')
        tag(60, 400, 'forest 树林（只在后面当背景）')
        for i, (ex, ey) in enumerate(S['entries']):
            tag(ex, ey, f'entry {i + 1}')
        for sx, sy in S['seats']:
            d.ellipse([sx * k - 6, sy * k - 6, sx * k + 6, sy * k + 6], fill=(255, 255, 255))
        for sx, sy in S['shade'] + S['tent']['spots'] + S['sun']:
            d.ellipse([sx * k - 6, sy * k - 6, sx * k + 6, sy * k + 6], fill=(60, 60, 60))
        d.line(P(S['grass'] + [S['grass'][0]]), fill=(255, 255, 255), width=3)
    return img


def main():
    os.makedirs(OUT_TILES, exist_ok=True)
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
    draw(GUIDE_W).save(os.path.join(GUIDE, 'camp-blockout.jpg'), quality=88)
    draw(GUIDE_W, labels=True).save(os.path.join(GUIDE, 'camp-blockout-labels.jpg'), quality=88)
    print(f'底图 {full.width}×{full.height}，16 块共 {total // 1024} KB；底稿和标注图已写入 art/guide/')


if __name__ == '__main__':
    main()
