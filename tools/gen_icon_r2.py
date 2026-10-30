"""Generate the R2 launcher icon: adaptive vector layers + legacy PNGs + a preview.
用法：python tools/gen_icon_r2.py android/app/src/main/res 预览.png"""
import math
import os
import sys
import numpy as np
from PIL import Image, ImageDraw

RES = sys.argv[1]            # android/app/src/main/res
PREVIEW = sys.argv[2]

PTS = [(8.3, 263.3), (100, 16.7), (140, 125), (70, 168.3), (105, 261.7), (150, 148.3), (191.7, 263.3)]
BH, CX, CY = 246.6, 100.0, 140.0
H_FRAC, S_FRAC = .58, .031
V, OFF = 72.0, 18.0          # 自适应图标：108 画布中间 72 是可见区域

sc = H_FRAC * V / BH
TX, TY = 54 - CX * sc, 54 - CY * sc
STROKE = S_FRAC * V / sc     # 路径单位


def u2a(u, v):
    return OFF + u * V, OFF + v * V


logo = [(x * sc + TX, y * sc + TY) for x, y in PTS]   # 108 坐标


def seg_dist(p, a, b):
    ax, ay = a
    bx, by = b
    px, py = p
    dx, dy = bx - ax, by - ay
    t = max(0, min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)))
    return math.hypot(px - ax - t * dx, py - ay - t * dy)


def dist_logo(p):
    return min(seg_dist(p, logo[i], logo[i + 1]) for i in range(len(logo) - 1))


# 轨道：和第五轮 R2 一样的椭圆（单位是可见区域的比例）
ECX, ECY, EA, EB, ROT = .5, .53, .40, .11, math.radians(-16)
RING_W = .0055 * V
CLEAR = S_FRAC * V / 2 + .035 * V + RING_W / 2    # 离 Logo 太近的部分断开（等于“压在 Logo 后面”）


def ell(t_deg):
    t = math.radians(t_deg)
    x, y = EA * math.cos(t), EB * math.sin(t)
    return u2a(ECX + x * math.cos(ROT) - y * math.sin(ROT), ECY + x * math.sin(ROT) + y * math.cos(ROT))


segments, cur = [], []
for k in range(0, 1265):
    t = -8 + k * .25                     # -8° → 308°，行星两侧留口
    p = ell(t)
    if dist_logo(p) < CLEAR:
        if len(cur) > 1:
            segments.append(cur)
        cur = []
    else:
        cur.append(p)
if len(cur) > 1:
    segments.append(cur)
# 太短的碎段（夹在两笔之间的小点）去掉，画面更干净
segments = [s for s in segments if sum(math.dist(s[i], s[i + 1]) for i in range(len(s) - 1)) > 2.0]
planet = ell(330)
PLANET_R = .017 * V


def path_d(pts):
    s = 'M%.2f,%.2f' % pts[0]
    # 抽稀：每隔几个点取一个，矢量文件小一些
    keep = pts[::3] + [pts[-1]]
    return s + ''.join(' L%.2f,%.2f' % p for p in keep[1:])


RING = '#661AA36F'      # 品牌绿 40% 透明度，叠在白底上
GREEN = '#FF1AA36F'

ring_paths = '\n'.join(
    f'''    <path android:pathData="{path_d(s)}"
        android:strokeColor="{RING}" android:strokeWidth="{RING_W:.3f}"
        android:strokeLineCap="round" android:strokeLineJoin="round" android:fillColor="#00000000"/>'''
    for s in segments)

bg_xml = f'''<?xml version="1.0" encoding="utf-8"?>
<!-- 图标背景：白到极浅绿的渐变 + 一道留口的星轨（第五轮 R2）。由 gen_icon_r2.py 生成 -->
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    xmlns:aapt="http://schemas.android.com/aapt"
    android:width="108dp" android:height="108dp"
    android:viewportWidth="108" android:viewportHeight="108">
    <path android:pathData="M0,0h108v108h-108z">
        <aapt:attr name="android:fillColor">
            <gradient android:type="linear" android:startX="54" android:startY="{OFF}" android:endX="54" android:endY="{OFF + V}">
                <item android:offset="0" android:color="#FFFFFFFF"/>
                <item android:offset="1" android:color="#FFF3F9F6"/>
            </gradient>
        </aapt:attr>
    </path>
{ring_paths}
    <path android:pathData="M{planet[0] - PLANET_R:.2f},{planet[1]:.2f} a{PLANET_R:.2f},{PLANET_R:.2f} 0 1,0 {2 * PLANET_R:.2f},0 a{PLANET_R:.2f},{PLANET_R:.2f} 0 1,0 {-2 * PLANET_R:.2f},0z"
        android:fillColor="{RING}"/>
</vector>
'''


def fg_xml(note):
    return f'''<?xml version="1.0" encoding="utf-8"?>
<!-- {note} -->
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="108dp" android:height="108dp"
    android:viewportWidth="108" android:viewportHeight="108">
    <group android:scaleX="{sc:.5f}" android:scaleY="{sc:.5f}" android:translateX="{TX:.3f}" android:translateY="{TY:.3f}">
        <path android:pathData="M8.3,263.3 L100,16.7 L140,125 L70,168.3 L105,261.7 L150,148.3 L191.7,263.3"
            android:strokeColor="{GREEN}" android:strokeWidth="{STROKE:.2f}"
            android:strokeLineCap="round" android:strokeLineJoin="round"
            android:fillColor="#00000000"/>
    </group>
</vector>
'''


def w(path, text):
    with open(os.path.join(RES, path), 'w', encoding='utf-8', newline='\n') as f:
        f.write(text)


w('drawable/ic_launcher_bg.xml', bg_xml)
w('drawable/ic_launcher_fg.xml', fg_xml('图标前景：绿色 Logo（高 58%、线宽 3.1%）'))


# ---------- 栅格化：预览图 + 安卓 7 及以下用的 PNG ----------
def render(size, mask='squircle', ss=4):
    S = size * ss
    k = S / V                                  # 可见区域 → 像素

    def px(p):
        return ((p[0] - OFF) * k, (p[1] - OFF) * k)
    t = np.linspace(0, 1, S)[:, None, None]
    bg = np.array([255, 255, 255])[None, None] * (1 - t) + np.array([243, 249, 246])[None, None] * t
    img = Image.fromarray(np.repeat(bg, S, axis=1).astype(np.uint8), 'RGB').convert('RGBA')
    over = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(over)
    rw = RING_W * k
    for s in segments:
        pts = [px(p) for p in s]
        d.line(pts, fill=(26, 163, 111, 102), width=round(rw), joint='curve')
        for p in (pts[0], pts[-1]):
            d.ellipse((p[0] - rw / 2, p[1] - rw / 2, p[0] + rw / 2, p[1] + rw / 2), fill=(26, 163, 111, 102))
    pr = PLANET_R * k
    pp = px(planet)
    d.ellipse((pp[0] - pr, pp[1] - pr, pp[0] + pr, pp[1] + pr), fill=(26, 163, 111, 102))
    img = Image.alpha_composite(img, over)
    d = ImageDraw.Draw(img)
    lw = STROKE * sc * k
    pts = [px(p) for p in logo]
    d.line(pts, fill=(26, 163, 111, 255), width=round(lw), joint='curve')
    for p in (pts[0], pts[-1]):
        d.ellipse((p[0] - lw / 2, p[1] - lw / 2, p[0] + lw / 2, p[1] + lw / 2), fill=(26, 163, 111, 255))
    y, x = np.mgrid[0:S, 0:S]
    u, v = (x + .5) / S * 2 - 1, (y + .5) / S * 2 - 1
    m = (u * u + v * v <= 1) if mask == 'circle' else (np.abs(u) ** 5 + np.abs(v) ** 5 <= 1)
    img.putalpha(Image.fromarray((m * 255).astype(np.uint8)))
    return img.resize((size, size), Image.LANCZOS)


for dens, px_ in (('mdpi', 48), ('hdpi', 72), ('xhdpi', 96), ('xxhdpi', 144), ('xxxhdpi', 192)):
    inner = round(px_ * 44 / 48)          # 旧版图标四周留 2/48 的边
    pad = (px_ - inner) // 2
    for name, mk in (('ic_launcher.png', 'squircle'), ('ic_launcher_round.png', 'circle')):
        canvas = Image.new('RGBA', (px_, px_), (0, 0, 0, 0))
        canvas.alpha_composite(render(inner, mk), (pad, pad))
        canvas.save(os.path.join(RES, f'mipmap-{dens}', name))

render(512).save(PREVIEW)
print('segments', len(segments), 'stroke', round(STROKE, 2), 'scale', round(sc, 5))
