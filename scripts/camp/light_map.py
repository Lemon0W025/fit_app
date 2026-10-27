"""夜里营地每个地方有多亮、多暖：照着夜景和日景算（夜景 ÷ 日景的亮度比 + 夜景偏红还是偏蓝），写成 32×32 的格子给页面用。
宠物、装饰、食盆里的食物都按自己站的那格调亮度和暖色（CSS filter），篝火边亮而暖、远处暗而冷，和画上的光一致。
篝火点着时照「点火版夜景」（lit_night.py 出的 art/lit/painting.png，整片草坪被火照亮）算；没有它就用夜景原图。
另算一套篝火没点（锅是空的）时的：夜景换成 fire_off.py 熄了火的那张，火边和远处一样只有月光，提灯边上还亮一点。

    python3 scripts/camp/light_map.py            # → miniprogram/utils/camp-light-map.js（光照图数据；怎么用在 camp-light.js）
    python3 scripts/camp/light_map.py --preview out.png [--off]

画换了（尤其夜景）就重跑一遍。需要 Pillow 和 numpy。
"""
import argparse
import os

import numpy as np
from PIL import Image, ImageFilter

REPO = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..'))
N = 32
B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
BRIGHT_LO, BRIGHT_SPAN = 0.3, 0.8   # 亮度比 0.3～1.1 编成 0～63
OUT = os.path.join(REPO, 'miniprogram', 'utils', 'camp-light-map.js')


def maps(lit=True):
    raw = lambda name: Image.open(os.path.join(REPO, 'art', 'raw', 'camp', name)).convert('RGB')
    small = lambda img: np.asarray(img.resize((256, 256), Image.BOX)).astype(float)
    day, night_img = raw('camp.png'), raw('night.png')
    lit_path = os.path.join(REPO, 'art', 'lit', 'painting.png')
    if lit and os.path.exists(lit_path):
        night_img = Image.open(lit_path).convert('RGB')
    if not lit:
        from fire_off import unlit_day, unlit_night
        night_img = unlit_night(night_img, unlit_day(raw('camp-hd.png')))
    day, night = small(day), small(night_img)
    lum = lambda a: 0.299 * a[..., 0] + 0.587 * a[..., 1] + 0.114 * a[..., 2]
    ratio = lum(night) / np.maximum(lum(day), 1)
    warm = (night[..., 0] - night[..., 2]) / np.maximum(lum(night), 1)
    # 糊掉草叶的纹理，只留大块的光
    blur = lambda a, lo, hi: np.asarray(Image.fromarray(np.uint8(np.clip((a - lo) / (hi - lo), 0, 1) * 255)).filter(ImageFilter.GaussianBlur(5)).resize((N, N), Image.BOX)).astype(float) / 255
    bright = blur(ratio, BRIGHT_LO, BRIGHT_LO + BRIGHT_SPAN)
    warmth = blur(warm, -1, 1)
    return bright, warmth


def encode(a):
    return ''.join(B64[int(round(v * 63))] for v in a.reshape(-1))


def write():
    bright, warmth = maps()
    bright_off, warmth_off = maps(lit=False)
    js = f"""// 夜里营地每个地方有多亮、多暖的光照图（scripts/camp/light_map.py 照夜景 ÷ 日景的亮度比、夜景偏红偏蓝算的，画换了重跑，别手改）
// N×N 格，一格 CELL 画像素；每格一个字符（B64 里的位置 0～63）。BRIGHT / WARM 是篝火点着时（点火版夜景）的光，_OFF 是没点（熄了火的画）时的
module.exports = {{
  N: {N},
  CELL: {4096 // N},
  B64: '{B64}',
  BRIGHT: '{encode(bright)}',
  WARM: '{encode(warmth)}',
  BRIGHT_OFF: '{encode(bright_off)}',
  WARM_OFF: '{encode(warmth_off)}',
}}
"""
    open(OUT, 'w').write(js)
    print(f'→ {OUT}')


def preview(path, lit=True):
    bright, warmth = maps(lit)
    b = Image.fromarray(np.uint8(bright * 255)).resize((512, 512), Image.NEAREST).convert('RGB')
    w = Image.fromarray(np.uint8(warmth * 255)).resize((512, 512), Image.NEAREST).convert('RGB')
    out = Image.new('RGB', (1024, 512))
    out.paste(b, (0, 0))
    out.paste(w, (512, 0))
    out.save(path)
    print(f'→ {path}（左：亮度比，右：暖色）')


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('--preview', default=None)
    ap.add_argument('--off', action='store_true', help='预览篝火没点时的那套')
    a = ap.parse_args()
    if a.preview:
        preview(a.preview, not a.off)
    else:
        write()
