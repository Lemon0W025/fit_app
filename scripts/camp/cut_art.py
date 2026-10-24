"""把营地整图（竖画 3:4）缩放到指定宽度、切成 4×4 块，传云存储用

    python3 scripts/camp/cut_art.py art/raw/camp/camp-hd.png [--width 3072] [--local]

输出到 art/camp/t00.jpg … t33.jpg（npm run wx:art 上传到 camp/base/）；加 --local 则写到 miniprogram/images/camp/base/
（替换白模占位，注意包大小，一般不用）。画的比例必须是 3:4（和 shared/camp.js 的 W×H 一致），不是就按宽度缩放后上下居中裁 / 补边。
"""
import argparse
import os

from PIL import Image

REPO = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..'))
SPLIT = 4
RATIO = 3072 / 4096


def edge_color(img):
    small = img.resize((32, 32))
    px = [small.getpixel((x, y)) for x in range(32) for y in (0, 31)] + [small.getpixel((x, y)) for y in range(32) for x in (0, 31)]
    return tuple(sum(c[i] for c in px) // len(px) for i in range(3))


def fit(src, W):
    """按宽度缩放到 W，高度按 3:4 裁掉多的 / 用边缘色补"""
    H = round(W / RATIO)
    scaled = src.resize((W, max(1, round(src.height * W / src.width))), Image.LANCZOS)
    canvas = Image.new('RGB', (W, H), edge_color(src))
    canvas.paste(scaled, (0, (H - scaled.height) // 2))
    return canvas


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('image')
    ap.add_argument('--width', type=int, default=3072)
    ap.add_argument('--local', action='store_true')
    a = ap.parse_args()
    canvas = fit(Image.open(a.image).convert('RGB'), a.width)
    out = os.path.join(REPO, 'miniprogram', 'images', 'camp', 'base') if a.local else os.path.join(REPO, 'art', 'camp')
    os.makedirs(out, exist_ok=True)
    tw, th = canvas.width / SPLIT, canvas.height / SPLIT
    total = 0
    for row in range(SPLIT):
        for col in range(SPLIT):
            tile = canvas.crop((round(col * tw), round(row * th), round((col + 1) * tw), round((row + 1) * th)))
            path = os.path.join(out, f't{row}{col}.jpg')
            tile.save(path, quality=85, optimize=True)
            total += os.path.getsize(path)
    print(f'{canvas.width}×{canvas.height} → {out}，16 块共 {total // 1024} KB')


if __name__ == '__main__':
    main()
