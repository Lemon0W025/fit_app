"""3:4 和 2:3 之间换算：图像模型只出 1024×1536（2:3），营地却是 3:4 的画

    python3 scripts/camp/pad23.py art/guide/camp-blockout.jpg -o art/raw/camp/blockout-23.png   # 3:4 → 2:3：上面补天空色、下面补草地色（各补一半）
    python3 scripts/camp/pad23.py --crop art/raw/camp/camp-23.png -o art/raw/camp/camp.png      # 2:3 → 3:4：裁掉上下补出来的那两条

补边用的颜色取原图最上 / 最下几行的平均色，所以白模补出来还是天和草；模型画完整张 2:3 后，中间那块 3:4 就是和白模
一一对应的营地，裁回来再交给 cut_art.py / detail_crops.py。需要 Pillow。
"""
import argparse

from PIL import Image

PORTRAIT = 3 / 4      # 营地画的比例
TOOL = 2 / 3          # 图像模型能出的竖图比例


def strip_color(img, top):
    band = img.crop((0, 0, img.width, max(1, img.height // 40))) if top else img.crop((0, img.height - max(1, img.height // 40), img.width, img.height))
    px = band.resize((1, 1), Image.BOX).getpixel((0, 0))
    return tuple(px[:3])


def pad(img):
    H = round(img.width / TOOL)
    extra = H - img.height
    if extra <= 0:
        return img
    top = extra // 2
    out = Image.new('RGB', (img.width, H), strip_color(img, True))
    out.paste(Image.new('RGB', (img.width, H - top - img.height), strip_color(img, False)), (0, top + img.height))
    out.paste(img, (0, top))
    return out


def crop(img):
    H = round(img.width / PORTRAIT)
    if img.height <= H:
        return img
    top = (img.height - H) // 2
    return img.crop((0, top, img.width, top + H))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('image')
    ap.add_argument('-o', '--out', required=True)
    ap.add_argument('--crop', action='store_true', help='2:3 裁回 3:4（默认是 3:4 补成 2:3）')
    a = ap.parse_args()
    img = Image.open(a.image).convert('RGB')
    out = crop(img) if a.crop else pad(img)
    out.save(a.out, quality=95)
    print(f'{img.width}×{img.height} → {out.width}×{out.height}  {a.out}')


if __name__ == '__main__':
    main()
