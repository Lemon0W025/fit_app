"""界面线性图标（SVG）：24 × 24、2 宽圆头描边，和 docs/superpowers/specs/2026-11-07-ui-bento-design.md 的「图标小圆章」一套。

    python3 scripts/draw-icons.py      写到 miniprogram/images/icons/<名字>.svg（深色），
                                       tab 图标另出 -off（灰）、拍照另出 -white（白）

图片组件不认 currentColor，所以颜色直接写进文件；要别的颜色就在 VARIANTS 里加一份。
"""
import os

ROOT = os.path.join(os.path.dirname(__file__), '..', 'miniprogram', 'images', 'icons')
INK = '#17191c'
OFF = '#9a9ea5'
TAB_OFF = '#6b6f76'  # 底栏没选中的图标：和下面的字一个颜色（字要够深，图标跟着）
WHITE = '#ffffff'

ICONS = {
    'grid': '<rect x="3.5" y="3.5" width="7" height="7" rx="2"/><rect x="13.5" y="3.5" width="7" height="7" rx="2"/>'
            '<rect x="3.5" y="13.5" width="7" height="7" rx="2"/><rect x="13.5" y="13.5" width="7" height="7" rx="2"/>',
    'tent': '<path d="M2.5 20h19"/><path d="M12 4 4 20"/><path d="M12 4l8 16"/><path d="M12 11.5 9 20"/><path d="M12 11.5 15 20"/>',
    'camera': '<path d="M4 8h3l1.6-2.4h6.8L17 8h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z"/>'
              '<circle cx="12" cy="13.2" r="3.6"/>',
    'scale': '<rect x="3.5" y="3.5" width="17" height="17" rx="4.5"/><path d="M8.2 9.6a5.4 5.4 0 0 1 7.6 0"/><path d="M12 10.4l1.4-2.1"/>',
    'user': '<circle cx="12" cy="8" r="4"/><path d="M4 20.5c1.4-3.6 4.4-5.5 8-5.5s6.6 1.9 8 5.5"/>',
    'flame': '<path d="M12 21c-3.9 0-7-2.8-7-6.6 0-3.3 2.3-5.4 3.8-7.3.4 1.6 1.3 2.8 2.6 3.4C11.6 7 12.4 4.6 14.6 3'
             'c.2 2.8 1.6 4.6 3 6.4 1 1.3 1.4 2.8 1.4 4.6 0 3.9-3.1 7-7 7z"/>',
    'pie': '<path d="M11 4a8.5 8.5 0 1 0 9 9h-9z"/><path d="M14.5 3.3a8.5 8.5 0 0 1 6.2 6.2h-6.2z"/>',
    'clock': '<circle cx="12" cy="12" r="8.8"/><path d="M12 7.2V12l3.2 2"/>',
    'calendar': '<rect x="3.5" y="5" width="17" height="15.5" rx="3.5"/><path d="M3.5 10.2h17"/><path d="M8 3v4"/><path d="M16 3v4"/>',
    'chevron': '<path d="M9.5 5.5 16 12l-6.5 6.5"/>',
    'down': '<path d="M6 9.5l6 6 6-6"/>',
    'bell': '<path d="M6 16v-5a6 6 0 0 1 12 0v5l1.6 2.2H4.4z"/><path d="M10 20.6a2.3 2.3 0 0 0 4 0"/>',
    'sparkle': '<path d="M11 3.5l1.9 5.1 5.1 1.9-5.1 1.9L11 17.5l-1.9-5.1L4 10.5l5.1-1.9z"/>'
               '<path d="M18.5 15l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z"/>',
    'utensils': '<path d="M7 3v8"/><path d="M4.5 3v5a2.5 2.5 0 0 0 5 0V3"/><path d="M7 11v10"/>'
                '<path d="M17.5 21V3c-2.2 1.2-3.4 3.6-3.4 7v3.5h3.4"/>',
    'chart': '<path d="M5 20v-7"/><path d="M12 20V5"/><path d="M19 20v-10"/>',
    'book': '<path d="M5 5.5A2.5 2.5 0 0 1 7.5 3H19v14.5H7.5A2.5 2.5 0 0 0 5 20z"/><path d="M5 20a1.5 1.5 0 0 0 1.5 1.5H19"/>',
    'refresh': '<path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3"/><path d="M19.8 4v4.2h-4.2"/>',
    'users': '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.9-3.3 3.4-5 6.5-5s5.6 1.7 6.5 5"/>'
             '<path d="M15.5 4.8a3.5 3.5 0 0 1 0 6.4"/><path d="M18 15.3c1.7.8 2.9 2.4 3.5 4.7"/>',
    'pencil': '<path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>',
    'check': '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
    'leaf': '<path d="M5.5 18.5C5 10 10 5 19.5 4.5 19 14 14 19 5.5 18.5z"/><path d="M4 20l9-9"/>',
    'photo': '<rect x="3.5" y="4.5" width="17" height="15" rx="3.5"/><circle cx="9" cy="10" r="1.8"/>'
             '<path d="M4 18l5-5 4 4 2.5-2.5L20 19"/>',
    'target': '<circle cx="12" cy="12" r="8.8"/><circle cx="12" cy="12" r="4.6"/><circle cx="12" cy="12" r="0.6"/>',
    'trophy': '<path d="M8 4h8v5a4 4 0 0 1-8 0z"/><path d="M8 6H4.5a3 3 0 0 0 3.5 4"/><path d="M16 6h3.5a3 3 0 0 1-3.5 4"/>'
              '<path d="M12 13v4"/><path d="M8.5 20.5h7"/><path d="M9.5 17h5"/>',
}

# 名字 → [(后缀, 颜色)]：tab 的灰色、拍照按钮的白色
VARIANTS = {
    'grid': [('-off', TAB_OFF)],
    'tent': [('-off', TAB_OFF)],
    'scale': [('-off', TAB_OFF)],
    'user': [('-off', TAB_OFF)],
    'camera': [('-white', WHITE)],
    'chevron': [('-off', OFF)],
}


def svg(body, color):
    return ('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="%s" '
            'stroke-width="2" stroke-linecap="round" stroke-linejoin="round">%s</svg>\n' % (color, body))


def main():
    os.makedirs(ROOT, exist_ok=True)
    for name, body in ICONS.items():
        with open(os.path.join(ROOT, name + '.svg'), 'w') as f:
            f.write(svg(body, INK))
        for suffix, color in VARIANTS.get(name, []):
            with open(os.path.join(ROOT, name + suffix + '.svg'), 'w') as f:
                f.write(svg(body, color))
    print('icons written to', os.path.normpath(ROOT))


if __name__ == '__main__':
    main()
