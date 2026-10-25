"""装饰「原地重绘」的第二步：比对 in / out，抠出装饰本身和它的影子（split_object），裁成块，落脚点对准 anchor

    python3 scripts/camp/decor_patch.py [--ids tent,ball] [--local]

读 art/raw/decor/in-<id>.png、out-<id>.png 和 boxes.json。装饰在哪：out 和 in 不一样的地方；Codex 在装饰脚下顺手画的那圈草皮去掉，
只留比原来暗的影子；裁的块大小 = shared/decor.js 的 patch，块里的 anchor 对准装饰的底边中点，画得太小的放大（FILL）。
输出 art/decor/<id>.png（高清块，和营地高清图一样的分辨率，npm run wx:art -- decor 传到 camp/decor-vN/）；
加 --local 再写一份 1/4 大小到 miniprogram/images/camp/decor/（替换占位块，商店、背包、图册也用它，注意包大小）。
Codex 可能把 in 放大到 1024 见方再画（boxes.json 的 box 是裁的时候在高清图上的范围），按 in 实际的宽换算。
最后重写 miniprogram/utils/decor-art.js：列出 art/decor/ 里有高清块的装饰，页面只对它们用云端的图（还没画的用包里的占位）。
需要 Pillow 和 numpy。
"""
import argparse
import json
import os
import subprocess

import numpy as np
from PIL import Image, ImageChops, ImageDraw, ImageFilter

REPO = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..'))
RAW = os.path.join(REPO, 'art', 'raw', 'decor')
OUT = os.path.join(REPO, 'art', 'decor')
LOCAL = os.path.join(REPO, 'miniprogram', 'images', 'camp', 'decor')
MANIFEST = os.path.join(REPO, 'miniprogram', 'utils', 'decor-art.js')
DIFF_MIN = 40      # 三通道差之和超过这个算「画了东西」
FEATHER = 24       # 羽化宽度（画的像素）
FILL = (0.55, 0.7) # 装饰至少占块宽的 55% 或块高的 70%：Codex 画小了就放大（块在屏幕上本来就小，再小就看不清、点不着）
BINS = 32          # 草的颜色直方图每个通道分几格
GRASS = 0.02       # 颜色在原来这块草地里出现得够多（相对最常见的颜色）才算草；草里零星的白花不算
LOW = 0.45         # 装饰下面这么高的一截里才找草皮（上面的树冠、帐篷绿得像草也不动）
LOCAL_SCALE = 0.25


def decor_table():
    js = "const D=require('./cloudfunctions/api/lib/shared/decor');console.log(JSON.stringify(D.DECOR))"
    return {d['id']: d for d in json.loads(subprocess.check_output(['node', '-e', js], cwd=REPO))}


def diff_box(a, b):
    """out 和 in 不一样的像素的外框（去掉零星噪点）"""
    d = np.abs(a.astype(int) - b.astype(int)).sum(axis=2) > DIFF_MIN
    mask = Image.fromarray((d * 255).astype(np.uint8)).filter(ImageFilter.MinFilter(3)).filter(ImageFilter.MaxFilter(7))
    ys, xs = np.nonzero(np.array(mask) > 0)
    if not len(ys):
        return None
    return xs.min(), ys.min(), xs.max() + 1, ys.max() + 1


def fill_holes(m):
    """bool 数组：从四边灌水灌不到的空洞也算进去"""
    pad = Image.new('L', (m.shape[1] + 2, m.shape[0] + 2), 0)
    pad.paste(Image.fromarray(m.astype(np.uint8) * 255), (1, 1))
    ImageDraw.floodfill(pad, (0, 0), 128)
    return np.asarray(pad)[1:-1, 1:-1] != 128


def from_outside(cand, region):
    """cand 里能（只经过 cand）连到 region 外面的那些"""
    pad = np.full((cand.shape[0] + 2, cand.shape[1] + 2), 255, np.uint8)
    pad[1:-1, 1:-1] = np.where(cand | ~region, 255, 0)
    img = Image.fromarray(pad).copy()          # fromarray 出来的图是只读的，floodfill 在上面不起作用
    ImageDraw.floodfill(img, (0, 0), 128)
    return cand & (np.asarray(img)[1:-1, 1:-1] == 128)


def split_object(out, inp, k):
    """Codex 画了东西的地方（它别处一个像素都没动）分成两部分：装饰本身留着；它在装饰脚下顺手画的一小圈草皮去掉，只留比原来暗的影子。
    带着草皮的话，摆到别处草的深浅对不上，夜里更是一圈白天的草（月光层一染就是一圈亮边）。
    草皮 = 颜色在原来这块草地里（in 整块都是草）、在装饰下半截、从外面连进来的；被装饰围住的草（花坛里的叶子）不算。
    返回 (RGB, L)：影子是黑色、透明度按比原来暗了多少"""
    o = np.asarray(out).astype(int)
    i = np.asarray(inp).astype(int)
    changed = np.abs(o - i).sum(axis=2) > 8
    r = 2 * max(1, round(2 * k)) + 1
    m = Image.fromarray(changed.astype(np.uint8) * 255).filter(ImageFilter.MaxFilter(r)).filter(ImageFilter.MinFilter(r))
    drawn = fill_holes(np.asarray(m) > 0)
    # 草的颜色：in 的颜色直方图（3×3×3 抹匀），归一到最常见的颜色
    q = i // (256 // BINS)
    hist = np.zeros((BINS,) * 3)
    np.add.at(hist, (q[..., 0].ravel(), q[..., 1].ravel(), q[..., 2].ravel()), 1)
    hp = np.pad(hist, 1)
    hist = sum(hp[a:a + BINS, b:b + BINS, c:c + BINS] for a in range(3) for b in range(3) for c in range(3))
    hist /= hist.max()
    qo = o // (256 // BINS)
    grassy = hist[qo[..., 0], qo[..., 1], qo[..., 2]] > GRASS
    ys = np.nonzero(drawn)[0]
    low = np.arange(drawn.shape[0])[:, None] >= ys.max() - LOW * (ys.max() - ys.min())
    skirt = from_outside(drawn & grassy & low, drawn)
    keep = Image.fromarray((drawn & ~skirt).astype(np.uint8) * 255).filter(ImageFilter.MinFilter(3)).filter(ImageFilter.MaxFilter(3))
    obj = fill_holes(np.asarray(keep) > 0) & drawn
    a_obj = np.asarray(Image.fromarray(obj.astype(np.uint8) * 255).filter(ImageFilter.GaussianBlur(0.4 * k))).astype(float) / 255
    # 影子：草皮里比原来暗下去的（糊开了比，草叶的纹理对不上没关系）
    lum = lambda a: 0.299 * a[..., 0] + 0.587 * a[..., 1] + 0.114 * a[..., 2]
    blur = lambda a: np.asarray(Image.fromarray(a.astype(np.uint8)).filter(ImageFilter.GaussianBlur(2.5 * k))).astype(float)
    shade = np.clip((1 - lum(blur(o)) / np.maximum(lum(blur(i)), 1) - 0.06) / 0.94, 0, 0.7) * drawn * (1 - a_obj)
    alpha = a_obj + shade * (1 - a_obj)
    rgb = o * (a_obj / np.maximum(alpha, 1e-3))[..., None]
    return Image.fromarray(np.uint8(np.clip(rgb, 0, 255) + 0.5)), Image.fromarray(np.uint8(alpha * 255 + 0.5))


def feather_alpha(w, h, inner_margin, feather):
    mask = Image.new('L', (w, h), 0)
    ImageDraw.Draw(mask).rounded_rectangle([inner_margin, inner_margin, w - 1 - inner_margin, h - 1 - inner_margin], radius=feather, fill=255)
    return mask.filter(ImageFilter.GaussianBlur(feather / 2))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--ids', default='')
    ap.add_argument('--local', action='store_true')
    a = ap.parse_args()
    table = decor_table()
    boxes = json.load(open(os.path.join(RAW, 'boxes.json')))
    want = set(a.ids.split(',')) if a.ids else None
    os.makedirs(OUT, exist_ok=True)
    done = 0
    for decor_id, meta in boxes.items():
        if want and decor_id not in want:
            continue
        src = os.path.join(RAW, f'in-{decor_id}.png')
        dst = os.path.join(RAW, f'out-{decor_id}.png')
        if not os.path.exists(dst):
            print(f'  ·  {decor_id}  还没有 out-{decor_id}.png')
            continue
        d = table[decor_id]
        inp = Image.open(src).convert('RGB')
        k0 = meta['k']                                              # 高清图：每画像素多少像素
        k = k0 * inp.width / (meta['box'][2] - meta['box'][0])      # in 图（Codex 可能放大过）
        out = Image.open(dst).convert('RGB').resize(inp.size, Image.LANCZOS)
        box = diff_box(np.array(out), np.array(inp))
        if not box:
            print(f'  ✗  {decor_id}  out 和 in 看不出区别')
            continue
        # 装饰底边中点 = 落脚点；块按 patch 大小裁，anchor 对准它
        x0, y0, x1, y1 = box
        foot_x = (x0 + x1) / 2
        foot_y = y1
        pw, ph = d['patch']['w'] * k, d['patch']['h'] * k
        ow, oh = x1 - x0, y1 - y0
        # zoom：块里的装饰放大多少。比块还大就缩小放进去（底下留一点）；画得太小就放大到 FILL，但不超出块
        need = max(ow / pw, (oh + 0.1 * ph) / ph)
        zoom = 1 / need if need > 1 else min(max(1, min(FILL[0] * pw / ow, FILL[1] * ph / oh)), 0.9 * pw / ow, 0.9 * ph / oh)
        left = foot_x - d['anchor']['x'] * k / zoom
        top = foot_y - d['anchor']['y'] * k / zoom
        rect = (round(left), round(top), round(left + pw / zoom), round(top + ph / zoom))
        rgb, alpha = split_object(out, inp, k)
        crop = rgb.crop(rect).convert('RGBA')
        crop.putalpha(alpha.crop(rect))
        # 存成和营地高清图一样的分辨率：块多大（画的像素）× k0
        hd = crop.resize((round(d['patch']['w'] * k0), round(d['patch']['h'] * k0)), Image.LANCZOS)
        edge = feather_alpha(hd.width, hd.height, round(FEATHER * k0 * 0.3), round(FEATHER * k0))
        hd.putalpha(ImageChops.multiply(edge, hd.getchannel('A')))
        hd.save(os.path.join(OUT, f'{decor_id}.png'), optimize=True)
        if a.local:
            os.makedirs(LOCAL, exist_ok=True)
            small = hd.resize((round(d['patch']['w'] * LOCAL_SCALE), round(d['patch']['h'] * LOCAL_SCALE)), Image.LANCZOS)
            small.quantize(colors=256, method=Image.Quantize.FASTOCTREE).save(os.path.join(LOCAL, f'{decor_id}.png'), optimize=True)
        done += 1
        print(f'  ✓  {decor_id}  {hd.width}×{hd.height}' + (f'（装饰在块里放大 {zoom:.2f} 倍）' if abs(zoom - 1) > 0.01 else ''))
    drawn = write_manifest(table)
    print(f'{done} 块 → {OUT}；utils/decor-art.js 列了 {len(drawn)} 件有高清块的。接着 npm run wx:art，把前缀填进 miniprogram/config.js 的 decorArt')


def write_manifest(table):
    """utils/decor-art.js 整个重写：art/decor/ 里有高清块的装饰（按 shared/decor.js 的顺序）"""
    drawn = [i for i in table if os.path.exists(os.path.join(OUT, f'{i}.png'))]
    lines = [
        '// 有高清块的装饰（在云存储 config.decorArt 下，<id>.png；scripts/camp/decor_patch.py 回写）。不在这里的用包里的占位块',
        f'module.exports = {json.dumps(drawn)}',
    ]
    open(MANIFEST, 'w', encoding='utf-8').write('\n'.join(lines) + '\n')
    return drawn


if __name__ == '__main__':
    main()
