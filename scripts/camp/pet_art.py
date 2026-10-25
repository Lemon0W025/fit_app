"""宠物的图册插画 → 包里的两张小图（替换占位）

    python3 scripts/camp/pet_art.py

art/raw/pets/<id>-album.png（Codex 出的图册插画，透明底，见 docs/art/camp-art-pack.md 3.3）→
    miniprogram/images/camp/pets/<id>.png        320 见方、脚踩在底边、256 色：图册、搬来的横幅；拼图加载失败时营地里也用它（底边对着落脚点）
    miniprogram/images/camp/pets/<id>-face.png   96 见方的头像：人物最上面一个正方形（和占位的取法一样），偷看食盆、「找它」、图册里没来的
有 -album 的才换，别的留着占位。需要 Pillow。
"""
import os

from PIL import Image

REPO = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..'))
RAW = os.path.join(REPO, 'art', 'raw', 'pets')
OUT = os.path.join(REPO, 'miniprogram', 'images', 'camp', 'pets')
PET_PX, FACE_PX = 320, 96
MARGIN = 0.04       # 人物四周留的空（边长的比例）


def small(img, path):
    img.quantize(colors=256, method=Image.Quantize.FASTOCTREE).save(path, optimize=True)
    return os.path.getsize(path)


def portrait(img):
    """裁到人物、按长边缩进正方形，水平居中、脚踩在底边（留一点空）"""
    fig = img.crop(img.getbbox())
    side = round(max(fig.size) / (1 - 2 * MARGIN))
    canvas = Image.new('RGBA', (side, side), (0, 0, 0, 0))
    canvas.paste(fig, ((side - fig.width) // 2, side - round(side * MARGIN) - fig.height), fig)
    return canvas.resize((PET_PX, PET_PX), Image.LANCZOS)


def face(img):
    box = img.getbbox()
    w = box[2] - box[0]
    head = img.crop((box[0], box[1], box[2], box[1] + w))
    head.thumbnail((FACE_PX, FACE_PX), Image.LANCZOS)
    canvas = Image.new('RGBA', (FACE_PX, FACE_PX), (0, 0, 0, 0))
    canvas.paste(head, ((FACE_PX - head.width) // 2, (FACE_PX - head.height) // 2), head)
    return canvas


def main():
    done = []
    for name in sorted(os.listdir(RAW)):
        if not name.endswith('-album.png'):
            continue
        pet_id = name[:-len('-album.png')]
        img = Image.open(os.path.join(RAW, name)).convert('RGBA')
        a = small(portrait(img), os.path.join(OUT, f'{pet_id}.png'))
        b = small(face(img), os.path.join(OUT, f'{pet_id}-face.png'))
        done.append(pet_id)
        print(f'  ✓  {pet_id}.png {a // 1024} KB、{pet_id}-face.png {b // 1024} KB')
    print(f'{len(done)} 只换上了图册插画 → {OUT}' if done else 'art/raw/pets/ 里还没有 -album.png')


if __name__ == '__main__':
    main()
