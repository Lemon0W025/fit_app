"""第一步的占位图：宠物（旧动物图顶替，没有的画个圆团）、装饰块（草绿底 + 色块 + 名字）、食物图标（圆底 + 两个字）

    python3 scripts/camp/placeholders.py

正式图到了由各自的脚本覆盖（装饰块 decor_patch.py、宠物 pack_anim.py + 图册插画、食物 slice-art.py）。暖暖锅的占位在 pot_art.py --placeholder。
注意：宠物占位用的旧动物图已经不在仓库里了，别再整个重跑这个脚本。需要 Pillow。
"""
import json
import os
import subprocess

from PIL import Image, ImageDraw, ImageFilter, ImageFont

REPO = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..'))
IMG = os.path.join(REPO, 'miniprogram', 'images')
OLD_ITEMS = os.path.join(IMG, 'garden', 'items')
PET_PX, FACE_PX, FOOD_PX = 240, 96, 64
PATCH_SCALE = 0.25
GRASS = (150, 205, 95)

# 旧动物图顶替；没有旧图的用这个颜色画圆团
STAND_IN = {'doudou': 'chick', 'nuonuo': 'rabbit', 'lianlian': 'duck', 'guigui': 'turtle', 'huahua': 'tabby_cat',
            'jutuan': 'ginger_cat', 'sunbao': 'panda', 'hehe': 'crane'}
BLOB = {'shishi': (176, 120, 70), 'qiqi': (230, 140, 60), 'shushu': (170, 110, 60), 'chacha': (205, 170, 120)}
CATEGORY_COLOR = {'nest': (230, 200, 120), 'eat': (236, 180, 150), 'play': (160, 200, 236), 'plant': (120, 190, 110), 'mood': (220, 170, 220)}


def data():
    js = ("const P=require('./cloudfunctions/api/lib/shared/pets'),F=require('./cloudfunctions/api/lib/shared/foods'),D=require('./cloudfunctions/api/lib/shared/decor');"
          "console.log(JSON.stringify({pets:P.PETS,foods:F.FOODS.concat(F.TREATS),decor:D.DECOR}))")
    return json.loads(subprocess.check_output(['node', '-e', js], cwd=REPO))


def font(size):
    for path in ['/usr/share/fonts/truetype/wqy/wqy-microhei.ttc', '/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc', '/usr/share/fonts/truetype/noto/NotoSansCJK-Regular.ttc']:
        if os.path.exists(path):
            return ImageFont.truetype(path, size)
    return ImageFont.load_default()


def save(img, *parts):
    path = os.path.join(IMG, *parts)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    img.save(path, optimize=True)


def pet_image(p):
    old = STAND_IN.get(p['id'])
    src = os.path.join(OLD_ITEMS, f'{old}.png') if old else None
    if src and os.path.exists(src):
        img = Image.open(src).convert('RGBA')
        img.thumbnail((PET_PX, PET_PX), Image.LANCZOS)
        canvas = Image.new('RGBA', (PET_PX, PET_PX), (0, 0, 0, 0))
        canvas.paste(img, ((PET_PX - img.width) // 2, PET_PX - img.height), img)
        return canvas
    canvas = Image.new('RGBA', (PET_PX, PET_PX), (0, 0, 0, 0))
    d = ImageDraw.Draw(canvas)
    color = BLOB.get(p['id'], (200, 200, 200))
    d.ellipse([40, 70, 200, 230], fill=color)
    d.ellipse([70, 30, 170, 130], fill=color)
    d.ellipse([95, 60, 110, 75], fill=(40, 40, 40))
    d.ellipse([130, 60, 145, 75], fill=(40, 40, 40))
    d.text((85, 150), p['name'], fill=(255, 255, 255), font=font(28))
    return canvas


def face(img):
    box = img.getbbox() or (0, 0, img.width, img.height)
    head = img.crop((box[0], box[1], box[2], box[1] + (box[2] - box[0])))
    head.thumbnail((FACE_PX, FACE_PX), Image.LANCZOS)
    canvas = Image.new('RGBA', (FACE_PX, FACE_PX), (0, 0, 0, 0))
    canvas.paste(head, ((FACE_PX - head.width) // 2, (FACE_PX - head.height) // 2), head)
    return canvas


def decor_patch(dc):
    w, h = round(dc['patch']['w'] * PATCH_SCALE), round(dc['patch']['h'] * PATCH_SCALE)
    img = Image.new('RGBA', (w, h), GRASS + (255,))
    d = ImageDraw.Draw(img)
    fw, fh = round(dc['foot']['w'] * PATCH_SCALE), round(dc['foot']['h'] * PATCH_SCALE)
    ax, ay = round(dc['anchor']['x'] * PATCH_SCALE), round(dc['anchor']['y'] * PATCH_SCALE)
    color = CATEGORY_COLOR[dc['category']]
    d.rounded_rectangle([ax - fw // 2, ay - fh, ax + fw // 2, ay], radius=6, fill=color, outline=(90, 70, 50))
    d.ellipse([ax - fw // 2, ay - 4, ax + fw // 2, ay + 4], fill=(110, 150, 70))
    d.text((ax - fw // 2 + 4, ay - fh + 4), dc['name'], fill=(50, 40, 30), font=font(12))
    # 羽化边：alpha 从边缘 6px 处渐变到 0
    mask = Image.new('L', (w, h), 0)
    ImageDraw.Draw(mask).rectangle([6, 6, w - 7, h - 7], fill=255)
    mask = mask.filter(ImageFilter.GaussianBlur(4))
    img.putalpha(mask)
    return img


def food_icon(f):
    img = Image.new('RGBA', (FOOD_PX, FOOD_PX), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    color = {'common': (200, 190, 160), 'rare': (150, 190, 230), 'epic': (200, 160, 230), 'legendary': (240, 200, 110)}[f['rarity']]
    d.ellipse([2, 2, FOOD_PX - 3, FOOD_PX - 3], fill=color, outline=(90, 80, 70), width=2)
    d.text((10, 18), f['name'][:2], fill=(40, 30, 20), font=font(22))
    return img


def main():
    D = data()
    for p in D['pets']:
        img = pet_image(p)
        save(img, 'camp', 'pets', f"{p['id']}.png")
        save(face(img), 'camp', 'pets', f"{p['id']}-face.png")
    for dc in D['decor']:
        save(decor_patch(dc), 'camp', 'decor', f"{dc['id']}.png")
    for f in D['foods']:
        save(food_icon(f), 'camp', 'foods', f"{f['id']}.png")
    print(f"宠物 {len(D['pets'])}×2、装饰 {len(D['decor'])}、食物 {len(D['foods'])} 张占位图已写入 miniprogram/images/camp/")


if __name__ == '__main__':
    main()
