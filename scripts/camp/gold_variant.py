"""金色秋千（集齐 12 只送的）：先由程序把秋千的木头调成金色，以后 Codex 画了正式的再换

    python3 scripts/camp/gold_variant.py [--src swing] [--dst gold_swing]

读 art/decor/<src>.png（decor_patch.py 出的高清块），木头（橙棕色、够饱和的）按亮度换成金色渐变（暗处古铜、亮处浅金），
绳子、影子不动；再在木头最亮的那些地方加一点高光。输出 art/decor/<dst>.png 和包里的小图 miniprogram/images/camp/decor/<dst>.png
（和 <src> 的小图一样大），最后重写 utils/decor-art.js。接着 ART_VERSION.decor 加一、npm run wx:art -- decor。需要 Pillow 和 numpy。
"""
import argparse
import os

import numpy as np
from PIL import Image

import decor_patch as D

# 金色渐变：按木头原来的亮度从暗到亮取色
STOPS = [(0.0, (88, 50, 6)), (0.3, (168, 108, 14)), (0.6, (226, 170, 34)), (0.85, (250, 214, 92)), (0.95, (255, 240, 170)), (1.0, (255, 252, 228))]


def gold_ramp(t):
    xs = np.array([s[0] for s in STOPS])
    out = np.zeros(t.shape + (3,))
    for c in range(3):
        out[..., c] = np.interp(t, xs, [s[1][c] for s in STOPS])
    return out


def goldify(img):
    a = np.asarray(img.convert('RGBA')).astype(float)
    rgb, alpha = a[..., :3], a[..., 3]
    mx, mn = rgb.max(axis=2), rgb.min(axis=2)
    sat = (mx - mn) / np.maximum(mx, 1)
    R, G, B = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    # 木头：红 > 绿 > 蓝、够饱和、不太暗（绳子是暗棕、影子是黑的，不动）
    wood = (R > G) & (G > B) & (sat > 0.35) & (mx > 110) & (alpha > 8)
    lum = (0.299 * R + 0.587 * G + 0.114 * B) / 255
    lo, hi = np.percentile(lum[wood], [3, 99]) if wood.any() else (0, 1)
    t = np.clip((lum - lo) / max(hi - lo, 1e-3), 0, 1)
    gold = gold_ramp(t * t * (3 - 2 * t))   # S 形：暗处更沉、亮处更亮，像金属
    # 边上（饱和度低一点的过渡像素）按木头的程度混一点，不出硬边
    w = np.clip((sat - 0.25) / 0.15, 0, 1) * wood
    out = rgb * (1 - w[..., None]) + gold * w[..., None]
    return Image.fromarray(np.uint8(np.clip(np.dstack([out, alpha]), 0, 255) + 0.5), 'RGBA')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--src', default='swing')
    ap.add_argument('--dst', default='gold_swing')
    a = ap.parse_args()
    src = os.path.join(D.OUT, f'{a.src}.png')
    if not os.path.exists(src):
        raise SystemExit(f'缺 {src}：先跑 decor_patch.py')
    hd = goldify(Image.open(src))
    hd.save(os.path.join(D.OUT, f'{a.dst}.png'), optimize=True)
    small_src = os.path.join(D.LOCAL, f'{a.src}.png')
    size = Image.open(small_src).size
    small = hd.resize(size, Image.LANCZOS)
    small.quantize(colors=256, method=Image.Quantize.FASTOCTREE).save(os.path.join(D.LOCAL, f'{a.dst}.png'), optimize=True)
    table, _ = D.decor_table()
    drawn = D.write_manifest(table)
    print(f'  ✓  {a.dst}  {hd.width}×{hd.height}（从 {a.src} 调成金色）；utils/decor-art.js 列了 {len(drawn)} 件')


if __name__ == '__main__':
    main()
