"""把营地整图（正方形）缩放到指定宽度、切成 4×4 块，传云存储用

    python3 scripts/camp/cut_art.py art/raw/camp/camp-hd.png [--width 3072] [--local]
    python3 scripts/camp/cut_art.py art/raw/camp/night-hd.png --prefix night-     # 夜景：同样切 16 块，文件名 night-t00.jpg…

输出到 art/camp/t00.jpg … t33.jpg（npm run wx:art 上传到 camp/base/）；画必须是正方形（和 shared/camp.js 的 W×H 一致），不是就按宽度缩放后上下居中裁 / 补边。
同时（--backdrop，默认开）把整张画缩成 768 宽写进包里 miniprogram/images/camp/base/backdrop.jpg（夜景 night-backdrop.jpg）：
页面先垫这张（一打开就有画、高清切块还没下完也不空），高清切块盖在上面；切块之间缩放时偶尔露的细缝透出来的也是同样的画，看不出缝。
"""
import argparse
import os

from PIL import Image

REPO = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..'))
SPLIT = 4
RATIO = 1.0   # 营地是正方形（shared/camp.js 的 W×H）
BACKDROP = 768  # 包里垫图的边长


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
    ap.add_argument('--prefix', default='', help='输出文件名前缀，夜景用 night-')
    ap.add_argument('--no-backdrop', action='store_true', help='不写包里的垫图')
    a = ap.parse_args()
    canvas = fit(Image.open(a.image).convert('RGB'), a.width)
    if not a.no_backdrop:
        local = os.path.join(REPO, 'miniprogram', 'images', 'camp', 'base')
        os.makedirs(local, exist_ok=True)
        path = os.path.join(local, f'{a.prefix}backdrop.jpg')
        canvas.resize((BACKDROP, BACKDROP), Image.LANCZOS).save(path, quality=74, optimize=True, progressive=True)
        print(f'垫图 → {path}（{os.path.getsize(path) // 1024} KB）')
    out = os.path.join(REPO, 'miniprogram', 'images', 'camp', 'base') if a.local else os.path.join(REPO, 'art', 'camp')
    os.makedirs(out, exist_ok=True)
    tw, th = canvas.width / SPLIT, canvas.height / SPLIT
    total = 0
    for row in range(SPLIT):
        for col in range(SPLIT):
            tile = canvas.crop((round(col * tw), round(row * th), round((col + 1) * tw), round((row + 1) * th)))
            path = os.path.join(out, f'{a.prefix}t{row}{col}.jpg')
            tile.save(path, quality=85, optimize=True)
            total += os.path.getsize(path)
    print(f'{canvas.width}×{canvas.height} → {out}，16 块共 {total // 1024} KB')


if __name__ == '__main__':
    main()
