"""高清第二轮：把营地整图切成几块带重叠的 3:4 小图，给图像模型逐块重绘

    python3 scripts/camp/detail_crops.py art/raw/camp/camp.png [--cols 3] [--overlap 0.15]

输出 art/raw/camp/detail/base.png（底图）、in-00.png … in-rc.png（小图，3 列 × 4 行 = 12 块）和 boxes.json（每块在底图上的位置）。
模型重绘后存成同目录的 out-00.png …（和 in 同样的比例，尺寸尽量大），再跑 merge_details.py 拼回高清整图。
"""
import argparse
import json
import math
import os

from PIL import Image

REPO = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..'))
OUT = os.path.join(REPO, 'art', 'raw', 'camp', 'detail')
ASPECT = 3 / 4


def boxes_for(w, h, cols, overlap):
    cw = w / (cols - (cols - 1) * overlap)
    ch = cw / ASPECT
    rows = max(1, math.ceil((h - ch * overlap) / (ch * (1 - overlap))))
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
    ap.add_argument('--cols', type=int, default=3)
    ap.add_argument('--overlap', type=float, default=0.15)
    a = ap.parse_args()
    img = Image.open(a.image).convert('RGB')
    os.makedirs(OUT, exist_ok=True)
    img.save(os.path.join(OUT, 'base.png'))
    boxes = boxes_for(img.width, img.height, a.cols, a.overlap)
    for b in boxes:
        img.crop(b['box']).save(os.path.join(OUT, f'in-{b["key"]}.png'))
    json.dump({'base': [img.width, img.height], 'boxes': boxes}, open(os.path.join(OUT, 'boxes.json'), 'w'), indent=1)
    print(f'底图 {img.width}×{img.height}，切成 {len(boxes)} 块（{boxes[0]["box"][2] - boxes[0]["box"][0]}×{boxes[0]["box"][3] - boxes[0]["box"][1]}）→ {OUT}/in-*.png')
    print('每块重绘后存成 out-<同名>.png，然后 python3 scripts/camp/merge_details.py')


if __name__ == '__main__':
    main()
