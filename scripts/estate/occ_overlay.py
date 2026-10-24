"""把 utils/occlusion.js 的遮挡多边形画在对齐后的原画上，核对墙高、门洞、屋顶是不是和画对得上

    python3 scripts/estate/cut_art.py art/raw/estate/estate-hd.png --warp art/raw/estate/estate-hd.warp.json --width 4096 --save /tmp/estate-aligned.jpg
    python3 scripts/estate/occ_overlay.py /tmp/estate-aligned.jpg /tmp/occ-overlay.jpg

红：墙和围栏；紫：月亮门（绿色是门洞）；青：大门；黄：建筑。不对就改 occlusion.js 里的 FENCE_H / GATE_HOLE / BUILDINGS
"""
import json
import os
import subprocess
import sys

from PIL import Image, ImageDraw

REPO = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..'))
COLORS = {'w': (255, 0, 0, 70), 'g': (255, 0, 255, 90), 'd': (0, 255, 255, 90), 'b': (255, 255, 0, 70)}


def main():
    src, out = sys.argv[1], sys.argv[2]
    base = Image.open(src).convert('RGBA')
    pieces = json.loads(subprocess.check_output(['node', '-e', f"""
const O=require('./miniprogram/utils/occlusion');const iso=require('./miniprogram/utils/iso');const E=require('./miniprogram/utils/shared/estate');
const L=iso.gridLayout(E.GRID.cols,E.GRID.rows,{base.width}/((E.GRID.cols+E.GRID.rows)/2));
console.log(JSON.stringify(O.pieces(L).map(p=>({{key:p.key,poly:p.poly,hole:p.hole}}))))"""], cwd=REPO))
    ov = Image.new('RGBA', base.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(ov)
    for p in pieces:
        d.polygon([tuple(pt) for pt in p['poly']], fill=COLORS.get(p['key'][0], (0, 0, 0, 60)), outline=(0, 0, 0, 200))
        if isinstance(p.get('hole'), list):
            d.polygon([tuple(pt) for pt in p['hole']], fill=(0, 255, 0, 120), outline=(0, 120, 0, 255))
    Image.alpha_composite(base, ov).convert('RGB').save(out, quality=88)
    print(f'{len(pieces)} 块 → {out}')


if __name__ == '__main__':
    main()
