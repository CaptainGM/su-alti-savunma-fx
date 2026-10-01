import math
import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage as ndi
import toolkit as T
from toolkit import rgb, S


def build(out_path=None, seed=12):
    rng = np.random.default_rng(seed)
    img = T.rock_base(T.blank(), 500, 835, 300, 118, rng)

    cx, cy = 500, 585
    # kuyruk/yan yüzgeçler
    for sgn in (-1, 1):
        fin = [(cx + sgn * 200, cy + 20), (cx + sgn * 330, cy - 40), (cx + sgn * 350, cy + 60), (cx + sgn * 300, cy + 130), (cx + sgn * 190, cy + 110)]
        fm = T.mask_poly(T.smooth_closed(fin, 8))
        img = T.over(img, T.layer(fm, rgb('#4b5fb8'), rgb('#2a2f78'), angle=0 if sgn > 0 else 180, sigma=14, outline_px=10))

    # olta kolu ve fener (gövdenin arkasında başlar)
    stalk_pts = T.smooth_open([(500, 400), (520, 300), (585, 215), (672, 190)], 14)
    st = T.mask_taper(stalk_pts, 26, 12)
    img = T.over(img, T.layer(st, rgb('#4a5aa8'), rgb('#232a68'), angle=60, sigma=8, outline_px=8, gloss=0.2))
    gx, gy = 692, 192
    # fener ışıltısı
    yy, xx = np.mgrid[0:S, 0:S].astype(np.float32)
    dist = np.sqrt((xx - gx) ** 2 + (yy - gy) ** 2)
    glow = np.exp(-(dist / 120.0) ** 2) * 0.55 + np.exp(-(dist / 55.0) ** 2) * 0.35
    img = T.over(img, np.dstack([np.broadcast_to(rgb('#ffe27a'), (S, S, 3)), np.clip(glow, 0, 1)]))
    orb = T.mask_ellipse(gx, gy, 52, 52)
    img = T.over(img, T.layer(orb, rgb('#fffbe0'), rgb('#ffc94a'), angle=90, sigma=24, outline_px=9, gloss=0.6, rim=0.0, hi=(1, 1, 1)))
    img = T.add_highlight(img, gx - 15, gy - 18, 16, 10, rot=-0.6, alpha=0.9)

    # gövde
    body = T.mask_ellipse(cx, cy, 255, 215)
    tex = ndi.gaussian_filter(rng.standard_normal((S, S)).astype(np.float32), 5)
    tex = (tex - tex.min()) / (tex.max() - tex.min())
    img = T.over(img, T.layer(body, rgb('#4a63c2'), rgb('#1b2160'), angle=95, sigma=64, outline_px=12, texture=tex, gloss=0.4, rim=0.4))
    # karın
    belly = T.mask_ellipse(cx, cy + 150, 170, 80) * body
    belly = ndi.gaussian_filter(belly, 4)
    bl = T.layer(belly, rgb('#7fb4d8'), rgb('#4a7fb4'), angle=90, sigma=24, outline=False, gloss=0.0, rim=0.0)
    bl[..., 3] *= 0.7
    img = T.over(img, bl)
    # benek
    d = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    dd = ImageDraw.Draw(d)
    for _ in range(26):
        a = rng.uniform(math.radians(-170), math.radians(-10))
        r = rng.uniform(0.4, 0.92)
        x, y = cx + math.cos(a) * 255 * r, cy + math.sin(a) * 215 * r
        rr = rng.uniform(6, 13)
        dd.ellipse([x - rr, y - rr, x + rr, y + rr], fill=(140, 200, 255, 120))
    dm = np.asarray(d).astype(np.float32) / 255.0
    dm[..., 3] *= (body > 0.5)
    img = T.over(img, dm)

    # dev ağız
    mx, my, mrx, mry = cx, 655, 190, 98
    mouth = T.mask_ellipse(mx, my, mrx, mry) * body
    img = T.over(img, T.layer(mouth, rgb('#5b1636'), rgb('#220a1c'), angle=90, sigma=22, outline_px=11, gloss=0.0, rim=0.0))
    # dişler
    teeth = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    td = ImageDraw.Draw(teeth)
    ol = tuple(int(v * 255) for v in T.OUTLINE) + (255,)
    for k in range(-4, 5):
        x = mx + k * 40
        yt = my - mry * math.sqrt(max(0, 1 - ((x - mx) / mrx) ** 2))
        td.polygon([(x - 20, yt - 4), (x + 20, yt - 4), (x, yt + 52)], fill=(250, 248, 235, 255), outline=ol)
    for k in range(-3, 4):
        x = mx + k * 44 + 8
        yb = my + mry * math.sqrt(max(0, 1 - ((x - mx) / mrx) ** 2))
        td.polygon([(x - 17, yb + 4), (x + 17, yb + 4), (x, yb - 44)], fill=(250, 248, 235, 255), outline=ol)
    tm = np.asarray(teeth).astype(np.float32) / 255.0
    img = T.over(img, tm)
    # dil
    tongue = T.mask_ellipse(mx, my + 52, 80, 28) * mouth
    img = T.over(img, np.dstack([np.broadcast_to(rgb('#e0507a'), (S, S, 3)), ndi.gaussian_filter(tongue, 2) * 0.9]))

    # gözler
    img = T.eye(img, 395, 470, 70, look=(0.3, 0.12), angry=0.5, inner=1, color_iris=(0.9, 0.78, 0.15))
    img = T.eye(img, 605, 470, 70, look=(-0.3, 0.12), angry=0.5, inner=-1, color_iris=(0.9, 0.78, 0.15))

    if out_path:
        T.finish(img, out_path)
    return img
