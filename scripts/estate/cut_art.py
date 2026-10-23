"""把画好的宅院原画对齐到游戏的世界框，切成 4×4 块

    python3 scripts/estate/cut_art.py art/raw/estate.png [--width 3120] [--scale 1.0] [--dx 0] [--dy 0] [--local]

世界框的比例和 utils/iso.js 的 gridLayout 一致（和白模 art/guide/estate-blockout.jpg 一样）。原画先按宽度缩放到 --width，
再按 --scale 微调大小、--dx / --dy 微调位置（输出像素，右、下为正），超出的裁掉，不够的用原画边缘的平均色补。
输出到 art/estate/t00.jpg … t33.jpg（传云存储用）；加 --local 则写到 miniprogram/images/garden/estate/（替换白模占位，注意包大小）。
"""
import argparse
import json
import os
import subprocess

from PIL import Image

REPO = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..'))
SPLIT = 4


def world_ratio():
    """世界框 宽 : 高，从 estate.js 的网格算（格高 = 格宽 / 2，顶部留 1.3 格宽，侧面厚 0.2 格宽）"""
    grid = json.loads(subprocess.check_output(['node', '-e', "console.log(JSON.stringify(require('./cloudfunctions/api/lib/shared/estate').GRID))"], cwd=REPO))
    n = grid['cols'] + grid['rows']
    return (n / 2) / (1.3 + n / 4 + 0.2)


def edge_color(img):
    small = img.resize((32, 32))
    px = [small.getpixel((x, y)) for x in range(32) for y in (0, 31)] + [small.getpixel((x, y)) for y in range(32) for x in (0, 31)]
    return tuple(sum(c[i] for c in px) // len(px) for i in range(3))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('image')
    ap.add_argument('--width', type=int, default=3120)
    ap.add_argument('--scale', type=float, default=1.0)
    ap.add_argument('--dx', type=int, default=0)
    ap.add_argument('--dy', type=int, default=0)
    ap.add_argument('--local', action='store_true')
    a = ap.parse_args()
    src = Image.open(a.image).convert('RGB')
    W = a.width
    H = round(W / world_ratio())
    s = W / src.width * a.scale
    scaled = src.resize((max(1, round(src.width * s)), max(1, round(src.height * s))), Image.LANCZOS)
    canvas = Image.new('RGB', (W, H), edge_color(src))
    canvas.paste(scaled, ((W - scaled.width) // 2 + a.dx, (H - scaled.height) // 2 + a.dy))
    out = os.path.join(REPO, 'miniprogram', 'images', 'garden', 'estate') if a.local else os.path.join(REPO, 'art', 'estate')
    os.makedirs(out, exist_ok=True)
    tw, th = W / SPLIT, H / SPLIT
    total = 0
    for row in range(SPLIT):
        for col in range(SPLIT):
            tile = canvas.crop((round(col * tw), round(row * th), round((col + 1) * tw), round((row + 1) * th)))
            path = os.path.join(out, f't{row}{col}.jpg')
            tile.save(path, quality=85, optimize=True)
            total += os.path.getsize(path)
    print(f'{W}×{H} → {out}，16 块共 {total // 1024} KB')


if __name__ == '__main__':
    main()
