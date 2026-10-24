"""把画好的宅院原画对齐到游戏的世界框，切成 4×4 块

    python3 scripts/estate/cut_art.py art/raw/estate/estate.png [--pad32] [--width 3120] [--scale 1.0] [--dx 0] [--dy 0] [--local]
    python3 scripts/estate/cut_art.py art/raw/estate/estate-hd.png --warp art/raw/estate/estate-hd.warp.json --width 4096

--warp：原画不是严格 2:1 等距（Codex 第二版带一点透视）时，用四点透视校正：json 里写原画上外墙内侧四个角
（top / right / bottom / left，像素坐标），拉到网格内环四角 (1,1) (36,1) (36,27) (1,27)；画外没画到的地方用边缘颜色抹开补上。

世界框的比例和 utils/iso.js 的 gridLayout 一致（和白模 art/guide/estate-blockout.jpg 一样）。
--pad32：原画是按 3:2 补了上下留白的白模底稿（estate-blockout-3x2.jpg）画的，先裁掉留白。原画先按宽度缩放到 --width，
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


def unpad32(img, ratio):
    """裁掉 blockout.py pad32 补的上下留白：世界框宽度占满、垂直居中"""
    h = round(img.width / ratio)
    top = max(0, (img.height - h) // 2)
    return img.crop((0, top, img.width, min(img.height, top + h)))


def find_coeffs(src, dst):
    """PIL 的 PERSPECTIVE 要的是 输出坐标 → 输入坐标 的 8 个系数"""
    import numpy as np
    rows = []
    for (x, y), (u, v) in zip(dst, src):
        rows.append([x, y, 1, 0, 0, 0, -u * x, -u * y])
        rows.append([0, 0, 0, x, y, 1, -v * x, -v * y])
    b = [c for p in src for c in p]
    return np.linalg.solve(np.array(rows, dtype=float), np.array(b, dtype=float))


def warp(src, pts, W, H, pad=400):
    """四点透视校正到 W×H 的世界框。pts：原画上外墙内侧四角；画外的部分先按边缘颜色延伸、再横向抹平，免得拉出一道道条纹"""
    import numpy as np
    from PIL import ImageFilter
    grid = json.loads(subprocess.check_output(['node', '-e', "console.log(JSON.stringify(require('./cloudfunctions/api/lib/shared/estate').GRID))"], cwd=REPO))
    tileW = W / ((grid['cols'] + grid['rows']) / 2)
    tileH = tileW / 2
    top, originX = tileW * 1.3, grid['rows'] * tileW / 2
    tile_top = lambda c, r: (originX + (c - r) * tileW / 2, top + (c + r) * tileH / 2)
    arr = np.asarray(src).copy()
    # 最上面一行里墙头那段（画出了画框）换成两边地面颜色的渐变，往上延伸时就不会拖出一条灰带
    tx = sorted([pts['top'][0] - int(src.width * 0.08), pts['top'][0] + int(src.width * 0.08)])
    x0, x1 = max(0, tx[0]), min(src.width - 1, tx[1])
    row = arr[0].astype(float)
    a, b = row[x0], row[x1]
    for x in range(x0, x1 + 1):
        row[x] = a + (b - a) * (x - x0) / max(1, x1 - x0)
    top_row = row.astype(np.uint8)
    arr = np.pad(arr, ((pad, pad), (pad, pad), (0, 0)), mode='edge')
    arr[:pad, pad:pad + src.width] = top_row[None, :, :]
    arr[:pad, :pad] = top_row[0]
    arr[:pad, pad + src.width:] = top_row[-1]
    padded = Image.fromarray(arr)
    blurred = padded.filter(ImageFilter.GaussianBlur(60))
    mask = Image.new('L', padded.size, 255)
    mask.paste(0, (pad, pad, pad + src.width, pad + src.height))
    padded = Image.composite(blurred, padded, mask)
    order = ['top', 'right', 'bottom', 'left']
    srcp = [(pts[k][0] + pad, pts[k][1] + pad) for k in order]
    dstp = [tile_top(1, 1), tile_top(grid['cols'] - 1, 1), tile_top(grid['cols'] - 1, grid['rows'] - 1), tile_top(1, grid['rows'] - 1)]
    return padded.transform((W, H), Image.PERSPECTIVE, tuple(find_coeffs(srcp, dstp)), Image.BICUBIC)


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
    ap.add_argument('--pad32', action='store_true')
    ap.add_argument('--warp', help='四点透视校正的 json（top/right/bottom/left 四个角的原画像素坐标）')
    ap.add_argument('--save', help='顺便把对齐后的整张画存到这里（核对用）')
    a = ap.parse_args()
    src = Image.open(a.image).convert('RGB')
    if a.pad32:
        src = unpad32(src, world_ratio())
    W = a.width
    H = round(W / world_ratio())
    if a.warp:
        canvas = warp(src, json.load(open(a.warp)), W, H)
    else:
        s = W / src.width * a.scale
        scaled = src.resize((max(1, round(src.width * s)), max(1, round(src.height * s))), Image.LANCZOS)
        canvas = Image.new('RGB', (W, H), edge_color(src))
        canvas.paste(scaled, ((W - scaled.width) // 2 + a.dx, (H - scaled.height) // 2 + a.dy))
    if a.save:
        canvas.save(a.save, quality=90)
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
