"""夜里营地每个地方有多亮、多暖：照着夜景和日景算（夜景 ÷ 日景的亮度比 + 夜景偏红还是偏蓝），写成 32×32 的格子给页面用。
宠物、装饰、食盆里的食物都按自己站的那格调亮度和暖色（CSS filter），篝火边亮而暖、远处暗而冷，和画上的光一致。
另算一套篝火没点（锅是空的）时的：夜景换成 fire_off.py 熄了火的那张，火边和远处一样只有月光，提灯边上还亮一点。

    python3 scripts/camp/light_map.py            # → miniprogram/utils/camp-light.js
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
OUT = os.path.join(REPO, 'miniprogram', 'utils', 'camp-light.js')


def maps(lit=True):
    raw = lambda name: Image.open(os.path.join(REPO, 'art', 'raw', 'camp', name)).convert('RGB')
    small = lambda img: np.asarray(img.resize((256, 256), Image.BOX)).astype(float)
    day, night_img = raw('camp.png'), raw('night.png')
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
    js = f"""// 夜里营地每个地方有多亮、多暖（scripts/camp/light_map.py 照夜景 ÷ 日景的亮度比、夜景偏红偏蓝算的，画换了重跑，别手改）
// {N}×{N} 格，一格 {4096 // N} 画像素；每格一个字符（0～63）。宠物、装饰、食盆里的食物按站的位置调亮度和暖色，篝火边亮而暖、远处暗而冷
// _OFF 是篝火没点（锅是空的）时的：火边也只有月光，提灯边上还亮一点

const N = {N}
const CELL = {4096 // N}
const B64 = '{B64}'
const BRIGHT = '{encode(bright)}'
const WARM = '{encode(warmth)}'
const BRIGHT_OFF = '{encode(bright_off)}'
const WARM_OFF = '{encode(warmth_off)}'

function cell(s, i, j) {{
  return B64.indexOf(s[Math.max(0, Math.min(N - 1, j)) * N + Math.max(0, Math.min(N - 1, i))]) / 63
}}

// 双线性插值：(x, y) 是画的像素
function sample(s, x, y) {{
  const fx = x / CELL - 0.5
  const fy = y / CELL - 0.5
  const i = Math.floor(fx)
  const j = Math.floor(fy)
  const u = fx - i
  const v = fy - j
  return (cell(s, i, j) * (1 - u) + cell(s, i + 1, j) * u) * (1 - v) + (cell(s, i, j + 1) * (1 - u) + cell(s, i + 1, j + 1) * u) * v
}}

// 亮度比（夜 / 日，0.3～1.1）和暖色（-1 偏蓝 … 1 偏红）；lit：篝火点着没有
function lightAt(x, y, lit = true) {{
  return {{ bright: {BRIGHT_LO} + {BRIGHT_SPAN} * sample(lit ? BRIGHT : BRIGHT_OFF, x, y), warm: sample(lit ? WARM : WARM_OFF, x, y) * 2 - 1 }}
}}

const r2 = (n) => Math.round(n * 100) / 100

// 夜里站在 (x, y) 的东西怎么上色（两层）：
//   light：本体的 CSS filter，按这儿的亮度压暗 / 提亮，火边、帐篷门口再偏暖、颜色足一点
//   moon：盖在本体上的「月光版」（同一张图去色、染成画上夜色那种蓝白）的不透明度：越冷越不透明，火边是 0
//   moonLight：月光版的 filter
// 两层都随位置连续变化，走路时跟着位置一起过渡（不会走到火边一下子变色）
function nightLook(x, y, lit = true) {{
  const {{ bright, warm }} = lightAt(x, y, lit)
  const hot = Math.max(0, warm)
  const cool = Math.max(0, -warm)
  const b = Math.max(0.5, Math.min(1.05, 0.2 + bright))
  return {{
    light: `brightness(${{r2(b)}}) saturate(${{r2(0.75 + 0.35 * hot)}}) sepia(${{r2(0.3 * hot)}})`,
    moon: r2(Math.min(0.85, cool)),
    moonLight: `grayscale(1) sepia(1) hue-rotate(178deg) saturate(1.7) brightness(${{r2(Math.min(0.9, b * 1.12))}})`,
  }}
}}

// 只要本体那层的 filter（食盆里的食物这种小东西不叠月光层）
function nightFilter(x, y, lit = true) {{
  return nightLook(x, y, lit).light
}}

module.exports = {{ lightAt, nightLook, nightFilter }}
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
