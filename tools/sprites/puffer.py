"""Balon Balığı: kayanın üstünde şişmiş, dikenli balık; sırtında bronz havan namlusu."""
import math

import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage as ndi

import toolkit as T
from toolkit import S, rgb


def cone(img, cx, cy, ang, base_r, length, c0, c1, width):
    """Dışa bakan konik diken."""
    px, py = -math.sin(ang), math.cos(ang)
    bx, by = cx + math.cos(ang) * base_r, cy + math.sin(ang) * base_r
    tip = (cx + math.cos(ang) * (base_r + length), cy + math.sin(ang) * (base_r + length))
    pts = [(bx + px * width, by + py * width), tip, (bx - px * width, by - py * width)]
    return T.over(img, T.layer(T.mask_poly(pts), rgb(c0), rgb(c1), angle=math.degrees(ang) + 90, sigma=6, outline_px=8, gloss=0.15, rim=0.0))


def build(out_path=None, seed=5):
    rng = np.random.default_rng(seed)
    img = T.rock_base(T.blank(), 500, 835, 300, 118, rng)

    cx, cy, R = 500, 520, 232

    # --- havan namlusu (gövdenin arkasında, sağ üste eğik)
    ax, ay = 462, 380
    bx, by = 592, 140
    barrel = T.mask_taper([(ax, ay), ((ax + bx) / 2, (ay + by) / 2), (bx, by)], 118, 150)
    img = T.over(img, T.layer(barrel, rgb('#e0a84a'), rgb('#7d4a1c'), angle=20, sigma=16, outline_px=11, gloss=0.5, rim=0.25))
    dirx, diry = bx - ax, by - ay
    ln = math.hypot(dirx, diry)
    dirx, diry = dirx / ln, diry / ln
    nx, ny = -diry, dirx
    for t, w in ((0.30, 68), (0.62, 74)):                       # demir bantlar
        mx, my = ax + (bx - ax) * t, ay + (by - ay) * t
        band = T.mask_stroke([(mx - nx * w, my - ny * w), (mx + nx * w, my + ny * w)], 16)
        img = T.over(img, T.layer(band, rgb('#8a8f99'), rgb('#4b4f5a'), angle=90, sigma=5, outline_px=6, gloss=0.4, rim=0.0))
    # namlu ağzı (karanlık delik)
    mouth = T.mask_ellipse(bx, by, 76, 34, rot=math.atan2(ny, nx) + math.pi / 2 - math.pi / 2)
    ring = T.mask_ellipse(bx, by, 88, 42, rot=math.atan2(ny, nx) + math.pi / 2 - math.pi / 2)
    img = T.over(img, T.layer(ring, rgb('#f0c060'), rgb('#9a6420'), angle=90, sigma=6, outline_px=8, gloss=0.3, rim=0.0))
    img = T.over(img, T.layer(mouth, rgb('#2a1a14'), rgb('#0d0806'), angle=90, sigma=6, outline=False, gloss=0.0, rim=0.0))
    # namlu üzerinde ince duman
    yy, xx = np.mgrid[0:S, 0:S].astype(np.float32)
    for k, (ox, oy, rr, a) in enumerate(((10, -50, 42, 0.30), (-14, -105, 54, 0.22), (14, -170, 62, 0.14))):
        d = np.sqrt((xx - (bx + ox)) ** 2 + (yy - (by + oy)) ** 2)
        puff = np.clip(1 - d / rr, 0, 1) ** 0.8 * a
        img = T.over(img, np.dstack([np.broadcast_to(rgb('#cfd6dc'), (S, S, 3)), puff]))

    # --- arka diken halkası
    for i in range(30):
        a = math.radians(-205 + i * (230 / 29))
        if -100 < math.degrees(a) < -60 and True:
            pass
        img = cone(img, cx, cy, a, R * 0.9, 74, '#f08a2a', '#b84a18', 24)
    # --- yan yüzgeçler
    for sgn in (-1, 1):
        fin = [(cx + sgn * R * 0.86, cy + 40), (cx + sgn * (R + 92), cy - 6), (cx + sgn * (R + 108), cy + 74), (cx + sgn * (R + 56), cy + 124), (cx + sgn * R * 0.88, cy + 104)]
        fm = T.mask_poly(T.smooth_closed(fin, 8))
        img = T.over(img, T.layer(fm, rgb('#ffe08a'), rgb('#f2a23a'), angle=0 if sgn > 0 else 180, sigma=14, outline_px=9))

    # --- gövde
    body = T.mask_ellipse(cx, cy, R, R * 0.98)
    tex = ndi.gaussian_filter(rng.standard_normal((S, S)).astype(np.float32), 6)
    tex = (tex - tex.min()) / (tex.max() - tex.min())
    img = T.over(img, T.layer(body, rgb('#ffc247'), rgb('#ec6a24'), angle=100, sigma=64, outline_px=12, texture=tex, gloss=0.5, rim=0.35))
    # karın
    belly = T.mask_ellipse(cx, cy + 132, R * 0.8, R * 0.5) * body
    belly = ndi.gaussian_filter(belly, 4)
    bl = T.layer(belly, rgb('#fff3d6'), rgb('#ffe0a0'), angle=90, sigma=36, outline=False, gloss=0.0, rim=0.0)
    bl[..., 3] *= 0.92
    img = T.over(img, bl)
    # ön yüzde küçük dikenler (sırt çizgisi boyunca) ve benekler
    for a_deg in range(-165, -14, 15):
        a = math.radians(a_deg)
        img = cone(img, cx, cy, a, R * 0.80, 34, '#ff9a3a', '#c4501a', 13)
    d = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    dd = ImageDraw.Draw(d)
    for _ in range(30):
        a = rng.uniform(math.radians(-160), math.radians(-20))
        r = rng.uniform(0.35, 0.78) * R
        x, y = cx + math.cos(a) * r, cy + math.sin(a) * r * 0.95
        rr = rng.uniform(6, 13)
        dd.ellipse([x - rr, y - rr, x + rr, y + rr], fill=(178, 66, 20, 170))
    dm = np.asarray(d).astype(np.float32) / 255.0
    dm[..., 3] *= (body > 0.5)
    img = T.over(img, dm)

    # --- yüz: iri, kararlı gözler
    img = T.eye(img, 402, 482, 70, look=(0.15, 0.12), angry=0.3, inner=1)
    img = T.eye(img, 598, 482, 70, look=(-0.15, 0.12), angry=0.3, inner=-1)
    for sx in (352, 648):                                          # yanak kızarıklığı
        c = ndi.gaussian_filter(T.mask_ellipse(sx, 572, 44, 25), 12) * body
        img = T.over(img, np.dstack([np.broadcast_to(rgb('#ff6a58'), (S, S, 3)), c * 0.55]))
    # büzük, şişkin dudaklar
    lips = T.mask_ellipse(500, 590, 50, 36)
    img = T.over(img, T.layer(lips, rgb('#ff8a96'), rgb('#d94c64'), angle=90, sigma=12, outline_px=9, gloss=0.5, rim=0.2))
    hole = T.mask_ellipse(500, 592, 20, 14)
    img = T.over(img, T.layer(hole, rgb('#7a1f2a'), rgb('#3b0f18'), angle=90, sigma=6, outline=False, gloss=0.0, rim=0.0))
    img = T.add_highlight(img, 488, 576, 15, 7, rot=-0.4, alpha=0.7)
    img = T.add_highlight(img, 395, 335, 76, 30, rot=-0.45, alpha=0.5)

    if out_path:
        T.finish(img, out_path)
    return img


if __name__ == '__main__':
    import sys
    build(sys.argv[1] if len(sys.argv) > 1 else 'puffer_test.png')
