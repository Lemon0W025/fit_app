"""高清第二轮：把营地整图切成几块带重叠的正方形小图（图像模型原生就出 1024×1024），给它逐块重绘

    python3 scripts/camp/detail_crops.py art/raw/camp/camp.png [--cols 4] [--overlap 0.15] [--dir detail]
    python3 scripts/camp/detail_crops.py art/raw/camp/night.png --cols 2 --dir night-detail   # 夜景粗一点：4 块

输出 art/raw/camp/detail/base.png（底图）、in-00.png … in-rc.png（小图，4 列 × 4 行 = 16 块）和 boxes.json（每块在底图上的位置）。
模型重绘后存成同目录的 out-00.png …（和 in 一样是正方形，1024×1024），再跑 merge_details.py 拼回高清整图（约 3600 宽）。
"""
import argparse
import json
import math
import os

from PIL import Image

REPO = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..'))
ASPECT = 1.0


def boxes_for(w, h, cols, overlap):
    cw = w / (cols - (cols - 1) * overlap)
    ch = cw / ASPECT
    required_rows = (h - ch * overlap) / (ch * (1 - overlap))
    # 浮点误差可能把 2 行算成 2.0000000000000004，ceil 后就多切一行。
    rows = max(1, math.ceil(required_rows - 1e-9))
    step_x = cw * (1 - overlap)
    step_y = (h - ch) / (rows - 1) if rows > 1 else 0
    out = []
    for r in range(rows):
        for c in range(cols):
            x = round(c * step_x)
            y = round(r * step_y)
            out.append({'key': f'{r}{c}', 'box': [x, y, min(w, round(x + cw)), min(h, round(y + ch))]})
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('image')
    ap.add_argument('--cols', type=int, default=4)
    ap.add_argument('--overlap', type=float, default=0.15)
    ap.add_argument('--dir', default='detail', help='输出到 art/raw/camp/<dir>/')
    a = ap.parse_args()
    OUT = os.path.join(REPO, 'art', 'raw', 'camp', a.dir)
    img = Image.open(a.image).convert('RGB')
    os.makedirs(OUT, exist_ok=True)
    img.save(os.path.join(OUT, 'base.png'))
    boxes = boxes_for(img.width, img.height, a.cols, a.overlap)
    for b in boxes:
        img.crop(b['box']).save(os.path.join(OUT, f'in-{b["key"]}.png'))
    json.dump({'base': [img.width, img.height], 'boxes': boxes}, open(os.path.join(OUT, 'boxes.json'), 'w'), indent=1)
    print(f'底图 {img.width}×{img.height}，切成 {len(boxes)} 块（{boxes[0]["box"][2] - boxes[0]["box"][0]}×{boxes[0]["box"][3] - boxes[0]["box"][1]}）→ {OUT}/in-*.png')
    print(f'每块重绘后存成 out-<同名>.png，然后 python3 scripts/camp/merge_details.py --dir {a.dir}')


if __name__ == '__main__':
    main()
