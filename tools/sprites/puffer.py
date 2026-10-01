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


def draw_body(seed=5):
    """Kaya, dikenli gövde ve yüz. Namlu ayrı çizilir (düşmana dönebilsin diye)."""
    rng = np.random.default_rng(seed)
    img = T.rock_base(T.blank(), 500, 835, 300, 118, rng)

    cx, cy, R = 500, 520, 232

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

    return img


MOUNT = (500, 330)    # namlunun gövdedeki bağlantı noktası (oyunda kule merkezinin 17 px üstü)
PIVOT = (300, 500)    # namlu çiziminde dönme noktası; namlu +x yönüne bakar


def draw_barrel():
    """Bronz havan namlusu, yatay (+x). Dönme noktası PIVOT."""
    img = T.blank()
    px, py = PIVOT
    tube = T.mask_taper([(px, py), (px + 170, py), (px + 340, py)], 130, 164)
    img = T.over(img, T.layer(tube, rgb('#e6b052'), rgb('#7d4a1c'), angle=90, sigma=18, outline_px=11, gloss=0.55, rim=0.25))
    for x, half in ((px + 110, 66), (px + 235, 72)):                   # demir bantlar
        band = T.mask_stroke([(x, py - half), (x, py + half)], 18)
        img = T.over(img, T.layer(band, rgb('#a2a8b3'), rgb('#4b4f5a'), angle=0, sigma=5, outline_px=6, gloss=0.4, rim=0.0))
    mx = px + 340                                                     # namlu ağzı
    rim = T.mask_ellipse(mx, py, 30, 92)
    img = T.over(img, T.layer(rim, rgb('#f0c060'), rgb('#9a6420'), angle=0, sigma=7, outline_px=8, gloss=0.3, rim=0.0))
    hole = T.mask_ellipse(mx + 2, py, 19, 70)
    img = T.over(img, T.layer(hole, rgb('#2a1a14'), rgb('#0d0806'), angle=0, sigma=6, outline=False, gloss=0.0, rim=0.0))
    collar = T.mask_ellipse(px, py, 80, 80)                           # bağlantı halkası
    img = T.over(img, T.layer(collar, rgb('#c9ced8'), rgb('#59606e'), angle=90, sigma=16, outline_px=10, gloss=0.5, rim=0.2))
    for ang in range(0, 360, 60):
        x = px + math.cos(math.radians(ang)) * 52
        y = py + math.sin(math.radians(ang)) * 52
        img = T.over(img, T.layer(T.mask_ellipse(x, y, 9, 9), rgb('#8a8f99'), rgb('#3b3f48'), sigma=3, outline_px=4, gloss=0.3, rim=0.0))
    img = T.add_highlight(img, px + 170, py - 44, 120, 11, rot=0, alpha=0.45)
    return img


def _to_pil(a):
    return Image.fromarray((np.clip(a, 0, 1) * 255 + 0.5).astype(np.uint8), 'RGBA')


def build(out_path=None, seed=5):
    """Marketteki simge: gövde ve sağ üste bakan namlu birlikte."""
    body = _to_pil(draw_body(seed))
    barrel = _to_pil(draw_barrel()).rotate(60, center=PIVOT, resample=Image.BICUBIC)
    icon = body.copy()
    layer = Image.new('RGBA', body.size, (0, 0, 0, 0))
    layer.alpha_composite(barrel, (MOUNT[0] - PIVOT[0], MOUNT[1] - PIVOT[1]))
    icon.alpha_composite(layer)
    if out_path:
        T.finish(np.asarray(icon).astype(np.float32) / 255.0, out_path)
    return icon


def build_parts(body_path, barrel_path, seed=5):
    """Oyun içi: sabit gövde + ayrı dönen namlu (1200 birimlik çerçeve, merkez = dönme noktası)."""
    T.finish(draw_body(seed), body_path)
    barrel = _to_pil(draw_barrel())
    frame = Image.new('RGBA', (1200, 1200), (0, 0, 0, 0))
    frame.alpha_composite(barrel, (600 - PIVOT[0], 600 - PIVOT[1]))
    frame.resize((600, 600), Image.LANCZOS).save(barrel_path)



