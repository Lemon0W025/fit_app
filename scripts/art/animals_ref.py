"""把 11 只小动物现在的图拼成一张参考图（给 Codex 画动画帧时对照长相）

    python3 scripts/art/animals_ref.py

输出 art/guide/animals-ref.png。需要 Pillow。
"""
import os
import subprocess
import json

from PIL import Image, ImageDraw, ImageFont

REPO = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..'))
FONT = '/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc'
CELL = 300
COLS = 4


def animals():
    js = "const g=require('./cloudfunctions/api/lib/shared/garden');console.log(JSON.stringify(g.ITEMS.filter(i=>i.kind==='animal').map(i=>[i.id,i.name])))"
    return json.loads(subprocess.check_output(['node', '-e', js], cwd=REPO))


def main():
    ids = animals()
    rows = (len(ids) + COLS - 1) // COLS
    img = Image.new('RGB', (COLS * CELL, rows * CELL), (247, 243, 235))
    d = ImageDraw.Draw(img)
    font = ImageFont.truetype(FONT, 26)
    small = ImageFont.truetype(FONT, 20)
    for i, (item_id, name) in enumerate(ids):
        x0, y0 = (i % COLS) * CELL, (i // COLS) * CELL
        sprite = Image.open(os.path.join(REPO, 'miniprogram', 'images', 'garden', 'items', f'{item_id}.png')).convert('RGBA')
        sprite.thumbnail((CELL - 60, CELL - 90), Image.LANCZOS)
        img.paste(sprite, (x0 + (CELL - sprite.width) // 2, y0 + 20 + (CELL - 90 - sprite.height) // 2), sprite)
        d.text((x0 + CELL / 2, y0 + CELL - 52), name, fill=(40, 40, 40), font=font, anchor='mm')
        d.text((x0 + CELL / 2, y0 + CELL - 24), item_id, fill=(120, 120, 120), font=small, anchor='mm')
    out = os.path.join(REPO, 'art', 'guide', 'animals-ref.png')
    img.save(out, optimize=True)
    print('已写入', out, img.size)


if __name__ == '__main__':
    main()
