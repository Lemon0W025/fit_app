"""装饰「原地重绘」的第一步：从营地高清图上裁一块空草地给 Codex，让它把装饰画在上面

    python3 scripts/camp/decor_crop.py [art/raw/camp/camp-hd.png] [--ids tent,ball]

每件装饰裁一块正方形草地（边长 = shared/decor.js 的块大小 × 1.25 里较长的那边，高清图按 shared/camp.js 的画宽换算；正方形是因为图像模型的
edit 只出 1024×1024，这样 out 和 in 不会变形），位置自动挑在草地里离禁区远的地方，存成 art/raw/decor/in-<id>.png，
并把裁的位置写进 art/raw/decor/boxes.json。
Codex 把装饰画在这块草地上（其他像素不动）存成 out-<id>.png，再跑 decor_patch.py 裁成带羽化边的块。需要 Pillow。
"""
import argparse
import json
import os
import subprocess

from PIL import Image

REPO = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..'))
OUT = os.path.join(REPO, 'art', 'raw', 'decor')
MARGIN = 1.25


def data():
    js = ("const C=require('./cloudfunctions/api/lib/shared/camp'),D=require('./cloudfunctions/api/lib/shared/decor');"
          "const spots=[];for(let y=900;y<C.H-300;y+=150)for(let x=300;x<C.W-300;x+=150){const r={left:x-330,top:y-290,right:x+330,bottom:y+60};"
          "if(C.rectInPoly(r,C.SCENE.grass)&&!C.hitsNogo(r,120))spots.push([x,y])}"
          "console.log(JSON.stringify({W:C.W,decor:D.DECOR,scale:D.DECOR_SCALE,spots}))")
    return json.loads(subprocess.check_output(['node', '-e', js], cwd=REPO))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('image', nargs='?', default=os.path.join(REPO, 'art', 'raw', 'camp', 'camp-hd.png'))
    ap.add_argument('--ids', default='')
    a = ap.parse_args()
    d = data()
    img = Image.open(a.image).convert('RGB')
    k = img.width / d['W']
    want = set(a.ids.split(',')) if a.ids else None
    os.makedirs(OUT, exist_ok=True)
    # 一批只裁几件（--ids）时，别的批裁过的框留着（decor_patch.py 还要用）
    path = os.path.join(OUT, 'boxes.json')
    boxes = json.load(open(path)) if os.path.exists(path) else {}
    spots = d['spots']
    if not spots:
        raise SystemExit('草地里找不到离禁区够远的空地，检查 SCENE')
    for i, dc in enumerate(d['decor']):
        if want and dc['id'] not in want:
            continue
        cx, cy = spots[i % len(spots)]
        # 按原来的大小裁（patch ÷ DECOR_SCALE），Codex 照这个比例画，decor_patch.py 裁块时再放大
        s = d['scale']
        w, h = dc['patch']['w'] / s * MARGIN, dc['patch']['h'] / s * MARGIN
        # 以落脚点为准：块的 anchor 对着 (cx, cy)，再往外扩成正方形
        side = max(w, h)
        left = cx - dc['anchor']['x'] / s * MARGIN - (side - w) / 2
        top = cy - dc['anchor']['y'] / s * MARGIN - (side - h) / 2
        x0, y0, n = round(left * k), round(top * k), round(side * k)
        box = [x0, y0, x0 + n, y0 + n]
        img.crop(box).save(os.path.join(OUT, f'in-{dc["id"]}.png'))
        boxes[dc['id']] = {'box': box, 'anchor': [cx, cy], 'k': k}
    json.dump(boxes, open(path, 'w'), indent=1)
    print(f'裁好 → {OUT}/in-*.png（boxes.json 里共 {len(boxes)} 件）；Codex 画完存 out-<id>.png，然后 python3 scripts/camp/decor_patch.py')


if __name__ == '__main__':
    main()
