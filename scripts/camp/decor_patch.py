"""装饰「原地重绘」的第二步：比对 in / out，抠出装饰本身和它的影子（split_object），裁成块，落脚点对准 anchor

    python3 scripts/camp/decor_patch.py [--ids swing,ball] [--local]

读 art/raw/decor/in-<id>.png、out-<id>.png 和 boxes.json。装饰在哪：out 和 in 不一样的地方；Codex 在装饰脚下顺手画的那圈草皮去掉，
只留比原来暗的影子，再沿底边铺一层接地影子（CONTACT）；Codex 没动过的像素一律不算装饰（被围住的空洞、茎中间透出来的原图白花都留空，不留一圈亮草边）；
离装饰远的零星小块（它顺手改的花）不要；
裁的块大小 = shared/decor.js 的 patch，块里的 anchor 对准装饰的底边中点，按 anchor 往上、往两边能放多少缩放，画得太小的放大（FILL）。
Codex 是照原来的大小画的（patch ÷ DECOR_SCALE，decor_crop.py 也按它裁），先按原来的大小算好从 out 上裁哪块，再整块放大 DECOR_SCALE 倍。
输出 art/decor/<id>.png（高清块，和营地高清图一样的分辨率，npm run wx:art -- decor 传到 camp/decor-vN/）；
加 --local 再写一份原来大小的 1/4 到 miniprogram/images/camp/decor/（替换占位块，商店、背包、图册也用它，注意包大小）。
Codex 可能把 in 放大到 1024 见方再画（boxes.json 的 box 是裁的时候在高清图上的范围），按 in 实际的宽换算。
最后重写 miniprogram/utils/decor-art.js：列出 art/decor/ 里有高清块的装饰，页面只对它们用云端的图（还没画的用包里的占位）。
需要 Pillow 和 numpy。
"""
import argparse
import json
import os
import subprocess

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

REPO = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..'))
RAW = os.path.join(REPO, 'art', 'raw', 'decor')
OUT = os.path.join(REPO, 'art', 'decor')
LOCAL = os.path.join(REPO, 'miniprogram', 'images', 'camp', 'decor')
MANIFEST = os.path.join(REPO, 'miniprogram', 'utils', 'decor-art.js')
FEATHER = 24       # 羽化宽度（画的像素）
FILL = (0.55, 0.7) # 装饰至少占块宽的 55% 或块高的 70%：Codex 画小了就放大（块在屏幕上本来就小，再小就看不清、点不着）
MARGIN = 6         # 装饰离块边至少留这么多（画的像素）
BINS = 32          # 草的颜色直方图每个通道分几格
GRASS = 0.02       # 颜色在原来这块草地里出现得够多（相对最常见的颜色）才算草；草里零星的白花不算
LOW = 0.45         # 装饰下面这么高的一截里才找草皮（上面的树冠、帐篷绿得像草也不动）
LOCAL_SCALE = 0.25
CONTACT = 0.32     # 接地影子最深多少（透明度）：家具底边往下铺一层柔和的暗，像压在草上（10/27 用户说花坛像贴纸）


def decor_table():
    js = "const D=require('./cloudfunctions/api/lib/shared/decor');console.log(JSON.stringify({decor:D.DECOR,scale:D.DECOR_SCALE}))"
    d = json.loads(subprocess.check_output(['node', '-e', js], cwd=REPO))
    return {x['id']: x for x in d['decor']}, d['scale']


def fill_holes(m):
    """bool 数组：从四边灌水灌不到的空洞也算进去"""
    pad = Image.new('L', (m.shape[1] + 2, m.shape[0] + 2), 0)
    pad.paste(Image.fromarray(m.astype(np.uint8) * 255), (1, 1))
    ImageDraw.floodfill(pad, (0, 0), 128)
    return np.asarray(pad)[1:-1, 1:-1] != 128


def parts(m):
    """bool 数组的连通块（四连通），一块一个 bool 数组，大的在前"""
    img = Image.fromarray(m.astype(np.uint8) * 255).copy()
    found = []
    while True:
        ys, xs = np.nonzero(np.asarray(img) == 255)
        if not len(ys):
            break
        ImageDraw.floodfill(img, (int(xs[0]), int(ys[0])), 100)
        part = np.asarray(img) == 100
        found.append(part)
        img.paste(50, mask=Image.fromarray(part.astype(np.uint8) * 255))
    return sorted(found, key=lambda p: -p.sum())


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
    返回 (RGB, L, L)：颜色、透明度（影子是黑色、透明度按比原来暗了多少）、只有装饰本身的透明度"""
    o = np.asarray(out).astype(int)
    i = np.asarray(inp).astype(int)
    changed = np.abs(o - i).sum(axis=2) > 8
    r = 2 * max(1, round(2 * k)) + 1
    m = np.asarray(Image.fromarray(changed.astype(np.uint8) * 255).filter(ImageFilter.MaxFilter(r)).filter(ImageFilter.MinFilter(r))) > 0
    # 远处零星的小块（Codex 顺手改了几朵花、几根草）不要：只留比最大那块的 3% 大的
    blobs = parts(m)
    m = np.zeros_like(m)
    for b in blobs:
        if b.sum() >= 0.03 * blobs[0].sum():
            m |= b
    # 被装饰围住的空洞：Codex 没动过的（秋千、梯子、栅栏、把手中间透出来的草）留空，改过的（装饰本身的一部分）和针眼大的补上
    drawn = m.copy()
    for hole in parts(fill_holes(m) & ~m):
        if hole.sum() <= 4 * k * k or changed[hole].mean() > 0.5:
            drawn |= hole
    # 草的颜色：in 的颜色直方图（3×3×3 抹匀），归一到最常见的颜色
    q = i // (256 // BINS)
    hist = np.zeros((BINS,) * 3)
    np.add.at(hist, (q[..., 0].ravel(), q[..., 1].ravel(), q[..., 2].ravel()), 1)
    hp = np.pad(hist, 1)
    hist = sum(hp[a:a + BINS, b:b + BINS, c:c + BINS] for a in range(3) for b in range(3) for c in range(3))
    hist /= hist.max()
    qo = o // (256 // BINS)
    grassy = hist[qo[..., 0], qo[..., 1], qo[..., 2]] > GRASS
    # Codex 重画的草常常比原来亮一点、直方图里没有：黄绿色（蓝很少、红不少）的也算草（家具上的叶子是偏蓝的深绿，不会被当成草）
    R, G, B = o[..., 0], o[..., 1], o[..., 2]
    grassy |= (G > R) & (G > 90) & (B < 0.55 * G) & (R > 0.5 * G)
    ys = np.nonzero(drawn)[0]
    low = np.arange(drawn.shape[0])[:, None] >= ys.max() - LOW * (ys.max() - ys.min())
    skirt = from_outside(drawn & grassy & low, drawn)
    keep = Image.fromarray((drawn & ~skirt).astype(np.uint8) * 255).filter(ImageFilter.MinFilter(3)).filter(ImageFilter.MaxFilter(3))
    obj = fill_holes(np.asarray(keep) > 0) & drawn
    # Codex 没动过的像素就是原来的草地（原图上的白花、茎和叶子中间透出来的草），不算装饰：留着就是一块块发白的方块、一圈亮草边；
    # 抗锯齿的边（装饰和草混出来的颜色）是改过的，本来就在里面；只补针眼大的洞（装饰的颜色碰巧和原来一样）
    core = Image.fromarray(changed.astype(np.uint8) * 255).filter(ImageFilter.MaxFilter(3)).filter(ImageFilter.MinFilter(3))
    obj &= np.asarray(core) > 0
    # 原图上的白花 Codex 留着、边上顺手描过（改过了、上面那步去不掉）：这里本来就白、现在还白的也去掉，连外面一圈混色的边
    white = lambda a: (a.min(axis=2) > 185) & (a.max(axis=2) - a.min(axis=2) < 60)
    petal = Image.fromarray((white(o) & white(i) & obj).astype(np.uint8) * 255).filter(ImageFilter.MaxFilter(3))
    obj &= ~(np.asarray(petal) > 0)
    a_obj = np.asarray(Image.fromarray(obj.astype(np.uint8) * 255).filter(ImageFilter.GaussianBlur(0.4 * k))).astype(float) / 255
    # 影子：草皮里比原来暗下去的（糊开了比，草叶的纹理对不上没关系）
    lum = lambda a: 0.299 * a[..., 0] + 0.587 * a[..., 1] + 0.114 * a[..., 2]
    blur = lambda a: np.asarray(Image.fromarray(a.astype(np.uint8)).filter(ImageFilter.GaussianBlur(2.5 * k))).astype(float)
    shade = np.clip((1 - lum(blur(o)) / np.maximum(lum(blur(i)), 1) - 0.06) / 0.94, 0, 0.7) * drawn * (1 - a_obj)
    # 接地影子：家具最下面一截往下挪一点、糊开，铺在家具外面（每件都有，摆到哪都像压在草上）
    yy = np.nonzero(obj)[0]
    if len(yy):
        top, bottom = yy.min(), yy.max()
        base = obj & (np.arange(obj.shape[0])[:, None] >= bottom - 0.14 * (bottom - top))
        shifted = np.zeros_like(base)
        dy = max(1, round(0.025 * (bottom - top)))
        shifted[dy:] = base[:-dy]
        wide = Image.fromarray((base | shifted).astype(np.uint8) * 255).filter(ImageFilter.MaxFilter(2 * max(1, round(3 * k)) + 1))
        contact = np.asarray(wide.filter(ImageFilter.GaussianBlur(5 * k))).astype(float) / 255 * CONTACT
        shade = np.maximum(shade, contact * (1 - a_obj))
    alpha = a_obj + shade * (1 - a_obj)
    rgb = o * (a_obj / np.maximum(alpha, 1e-3))[..., None]
    return (Image.fromarray(np.uint8(np.clip(rgb, 0, 255) + 0.5)), Image.fromarray(np.uint8(alpha * 255 + 0.5)),
            Image.fromarray(np.uint8(a_obj * 255 + 0.5)))


def feather_alpha(w, h, inner_margin, feather):
    mask = Image.new('L', (w, h), 0)
    ImageDraw.Draw(mask).rounded_rectangle([inner_margin, inner_margin, w - 1 - inner_margin, h - 1 - inner_margin], radius=feather, fill=255)
    return mask.filter(ImageFilter.GaussianBlur(feather / 2))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--ids', default='')
    ap.add_argument('--local', action='store_true')
    a = ap.parse_args()
    table, scale = decor_table()
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
        d = table.get(decor_id)
        if not d:
            continue                                                 # 下架了（小帐篷、小树、金色小帐篷）
        inp = Image.open(src).convert('RGB')
        k0 = meta['k']                                              # 高清图：每画像素多少像素
        k = k0 * inp.width / (meta['box'][2] - meta['box'][0])      # in 图（Codex 可能放大过）
        out = Image.open(dst).convert('RGB').resize(inp.size, Image.LANCZOS)
        rgb, alpha, solid = split_object(out, inp, k)
        ys, xs = np.nonzero(np.asarray(solid) > 40)
        if not len(ys):
            print(f'  ✗  {decor_id}  out 和 in 看不出区别')
            continue
        box = xs.min(), ys.min(), xs.max() + 1, ys.max() + 1
        # 装饰底边中点 = 落脚点；块按 patch 大小裁，anchor 对准它
        x0, y0, x1, y1 = box
        foot_x = (x0 + x1) / 2
        foot_y = y1
        # 按原来的大小（Codex 画的比例）算：块多大、anchor 在哪
        bw, bh = d['patch']['w'] / scale, d['patch']['h'] / scale
        ax, ay = d['anchor']['x'] / scale, d['anchor']['y'] / scale
        pw, ph = bw * k, bh * k
        ow, oh = x1 - x0, y1 - y0
        # zoom：块里的装饰放大多少。落脚点往上、往左右能放多少按 anchor 算（四周留 MARGIN），放不下就缩小；
        # 画得太小就放大到 FILL，但也不超出
        up = (ay - MARGIN) * k
        side = (min(ax, bw - ax) - MARGIN) * k
        fit = min(up / oh, side / (ow / 2))
        zoom = min(max(1, min(FILL[0] * pw / ow, FILL[1] * ph / oh)), fit)
        left = foot_x - ax * k / zoom
        top = foot_y - ay * k / zoom
        rect = (round(left), round(top), round(left + pw / zoom), round(top + ph / zoom))
        crop = rgb.crop(rect).convert('RGBA')
        crop.putalpha(alpha.crop(rect))
        # 存成和营地高清图一样的分辨率：块多大（画的像素，已经放大过 DECOR_SCALE 倍）× k0
        size = (round(d['patch']['w'] * k0), round(d['patch']['h'] * k0))
        hd = crop.resize(size, Image.LANCZOS)
        # 块边羽化只淡影子，装饰本身不淡（以前整块一起淡，顶到块边的邮箱、水壶顶上就糊了）；羽化也跟着放大
        fk = k0 * scale
        edge = np.asarray(feather_alpha(hd.width, hd.height, round(FEATHER * fk * 0.3), round(FEATHER * fk))).astype(float) / 255
        a_all = np.asarray(hd.getchannel('A')).astype(float)
        a_obj = np.minimum(np.asarray(solid.crop(rect).resize(size, Image.LANCZOS)).astype(float), a_all)
        hd.putalpha(Image.fromarray(np.uint8(np.clip(a_obj + (a_all - a_obj) * edge, 0, 255) + 0.5)))
        hd.save(os.path.join(OUT, f'{decor_id}.png'), optimize=True)
        if a.local:
            os.makedirs(LOCAL, exist_ok=True)
            small = hd.resize((round(bw * LOCAL_SCALE), round(bh * LOCAL_SCALE)), Image.LANCZOS)
            small.quantize(colors=256, method=Image.Quantize.FASTOCTREE).save(os.path.join(LOCAL, f'{decor_id}.png'), optimize=True)
        done += 1
        print(f'  ✓  {decor_id}  {hd.width}×{hd.height}' + (f'（Codex 画得{"小" if zoom > 1 else "大"}了，在块里缩放 {zoom:.2f} 倍）' if abs(zoom - 1) > 0.01 else ''))
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
