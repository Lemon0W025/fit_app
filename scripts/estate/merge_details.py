"""把逐块重绘的高清小图拼回一张整图（重叠处羽化过渡）

    python3 scripts/estate/merge_details.py [--out art/raw/estate/estate-hd.png]

读 art/raw/estate/detail/boxes.json 和 out-*.png；缺哪块就用底图放大顶上（会提示）。
输出尺寸 = 底图 × （小图宽 / 原切块宽），通常 2.5～3 倍。然后 cut_art.py 切这张高清图即可（不用 --pad32）。
"""
import argparse
import json
import os

import numpy as np
from PIL import Image

REPO = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..'))
DIR = os.path.join(REPO, 'art', 'raw', 'estate', 'detail')


def feather(w, h, margin):
    """四边线性渐变到 0 的权重图"""
    x = np.minimum(np.arange(w) + 1, w - np.arange(w)) / margin
    y = np.minimum(np.arange(h) + 1, h - np.arange(h)) / margin
    return np.minimum(np.minimum.outer(np.clip(y, 0, 1), np.clip(x, 0, 1)), 1)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--out', default=os.path.join(REPO, 'art', 'raw', 'estate', 'estate-hd.png'))
    a = ap.parse_args()
    meta = json.load(open(os.path.join(DIR, 'boxes.json')))
    base = Image.open(os.path.join(DIR, 'base.png')).convert('RGB')
    first = meta['boxes'][0]['box']
    sample = next((os.path.join(DIR, f'out-{b["key"]}.png') for b in meta['boxes'] if os.path.exists(os.path.join(DIR, f'out-{b["key"]}.png'))), None)
    if not sample:
        raise SystemExit('detail/ 里还没有 out-*.png')
    scale = Image.open(sample).width / (first[2] - first[0])
    W, H = round(base.width * scale), round(base.height * scale)
    acc = np.zeros((H, W, 3), dtype=np.float64)
    wsum = np.zeros((H, W), dtype=np.float64)
    missing = []
    for b in meta['boxes']:
        x0, y0, x1, y1 = b['box']
        X0, Y0, X1, Y1 = round(x0 * scale), round(y0 * scale), round(x1 * scale), round(y1 * scale)
        path = os.path.join(DIR, f'out-{b["key"]}.png')
        if os.path.exists(path):
            tile = Image.open(path).convert('RGB')
        else:
            missing.append(b['key'])
            tile = base.crop((x0, y0, x1, y1))
        tile = np.array(tile.resize((X1 - X0, Y1 - Y0), Image.LANCZOS)).astype(np.float64)
        w = feather(X1 - X0, Y1 - Y0, max(8, round((x1 - x0) * scale * 0.08)))
        acc[Y0:Y1, X0:X1] += tile * w[:, :, None]
        wsum[Y0:Y1, X0:X1] += w
    wsum[wsum == 0] = 1
    out = Image.fromarray(np.clip(acc / wsum[:, :, None], 0, 255).astype(np.uint8))
    out.save(a.out)
    print(f'拼好 {W}×{H} → {a.out}' + (f'（缺 {"、".join(missing)}，先用底图放大顶着）' if missing else ''))


if __name__ == '__main__':
    main()
