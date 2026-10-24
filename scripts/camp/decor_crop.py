"""装饰「原地重绘」的第一步：从营地高清图上裁一块空草地给 Codex，让它把装饰画在上面

    python3 scripts/camp/decor_crop.py [art/raw/camp/camp-hd.png] [--ids tent,ball]

每件装饰裁一块 patch × 1.25 的草地（按 shared/decor.js 的块大小，高清图按 3072 宽换算），位置自动挑在草地里离禁区远的地方，
存成 art/raw/decor/in-<id>.png，并把裁的位置写进 art/raw/decor/boxes.json。
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
          "const spots=[];for(let y=900;y<3900;y+=150)for(let x=300;x<2800;x+=150){const r={left:x-330,top:y-290,right:x+330,bottom:y+60};"
          "if(C.rectInPoly(r,C.SCENE.grass)&&!C.hitsNogo(r,120))spots.push([x,y])}"
          "console.log(JSON.stringify({W:C.W,decor:D.DECOR,spots}))")
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
    boxes = {}
    spots = d['spots']
    if not spots:
        raise SystemExit('草地里找不到离禁区够远的空地，检查 SCENE')
    for i, dc in enumerate(d['decor']):
        if want and dc['id'] not in want:
            continue
        cx, cy = spots[i % len(spots)]
        w, h = dc['patch']['w'] * MARGIN, dc['patch']['h'] * MARGIN
        # 以落脚点为准：块的 anchor 对着 (cx, cy)
        left = cx - dc['anchor']['x'] * MARGIN
        top = cy - dc['anchor']['y'] * MARGIN
        box = [round(left * k), round(top * k), round((left + w) * k), round((top + h) * k)]
        img.crop(box).save(os.path.join(OUT, f'in-{dc["id"]}.png'))
        boxes[dc['id']] = {'box': box, 'anchor': [cx, cy], 'k': k}
    json.dump(boxes, open(os.path.join(OUT, 'boxes.json'), 'w'), indent=1)
    print(f'{len(boxes)} 块空草地 → {OUT}/in-*.png；Codex 画完存 out-<id>.png，然后 python3 scripts/camp/decor_patch.py')


if __name__ == '__main__':
    main()
