import math
import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage as ndi
import toolkit as T
from toolkit import rgb, S


def draw_rock(seed=8):
    rng = np.random.default_rng(seed)
    return T.rock_base(T.blank(), 500, 835, 300, 118, rng)


def draw_fish(seed=8):
    """Çapraz duran (kılıç sağ üste bakan) balık. Kaya yok."""
    rng = np.random.default_rng(seed)
    np.random.default_rng(seed)
    T.rock_base(T.blank(), 500, 835, 300, 118, rng)   # rastgele akışı eskisiyle aynı tut
    img = T.blank()

    # kuyruk
    tail = T.mask_poly(T.smooth_closed([(330, 650), (215, 560), (240, 630), (190, 735), (335, 690)], 10))
    img = T.over(img, T.layer(tail, rgb('#3b6fb4'), rgb('#27508f'), angle=40, sigma=16, outline_px=10))
    # sırt yelkeni
    sail = T.mask_poly(T.smooth_closed([(468, 540), (430, 360), (462, 330), (560, 420), (640, 470), (560, 520)], 10))
    img = T.over(img, T.layer(sail, rgb('#6a8fe0'), rgb('#4b4cb0'), angle=70, sigma=22, outline_px=10, gloss=0.3))
    # göğüs yüzgeci
    pec = T.mask_poly(T.smooth_closed([(560, 600), (610, 700), (545, 690), (500, 630)], 8))
    img = T.over(img, T.layer(pec, rgb('#5e86d6'), rgb('#3f5fb2'), angle=70, sigma=12, outline_px=9))

    # gövde
    pts = [(320, 650), (430, 595), (545, 515), (650, 425), (735, 335)]
    widths = [40, 165, 225, 195, 115]
    body = T.mask_profile(pts, widths)
    tex = ndi.gaussian_filter(rng.standard_normal((S, S)).astype(np.float32), 5)
    tex = (tex - tex.min()) / (tex.max() - tex.min())
    img = T.over(img, T.layer(body, rgb('#4f86d9'), rgb('#2c4f9c'), angle=125, sigma=42, outline_px=11, texture=tex, gloss=0.5, rim=0.3))
    # karın
    belly_m = T.mask_profile([(350, 665), (450, 625), (565, 555), (665, 475), (735, 395)], [10, 90, 120, 96, 50]) * body
    belly_m = ndi.gaussian_filter(belly_m, 3)
    bl = T.layer(belly_m, rgb('#f2f7ff'), rgb('#c5d8f5'), angle=125, sigma=26, outline=False, gloss=0.0, rim=0.0)
    bl[..., 3] *= 0.95
    img = T.over(img, bl)
    # yan çizgi
    d = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    dd = ImageDraw.Draw(d)
    line = T.smooth_open([(360, 628), (460, 576), (570, 498), (672, 408)], 10)
    dd.line(line, fill=(25, 45, 110, 150), width=7)
    dm = np.asarray(d).astype(np.float32) / 255.0
    dm[..., 3] *= (body > 0.5)
    img = T.over(img, dm)

    # gaga (uzun kılıç)
    bill = T.mask_taper([(745, 325), (800, 268), (860, 205), (935, 120)], 46, 6)
    img = T.over(img, T.layer(bill, rgb('#c9d6ea'), rgb('#6f86ad'), angle=135, sigma=9, outline_px=9, gloss=0.4))
    # kafa üstü parlama
    img = T.add_highlight(img, 650, 395, 70, 22, rot=-0.75, alpha=0.5)
    img = T.add_highlight(img, 530, 500, 60, 18, rot=-0.55, alpha=0.35)

    # nişan gözlüğü: göz + merceğin çerçevesi
    ex, ey = 705, 345
    img = T.eye(img, ex, ey, 44, look=(0.3, 0.05), angry=0.5, inner=1)
    ring = T.mask_ellipse(ex, ey, 66, 66) * (1 - T.mask_ellipse(ex, ey, 52, 52))
    img = T.over(img, T.layer(ring, rgb('#e0a040'), rgb('#9a5f18'), angle=90, sigma=6, outline_px=6, gloss=0.4, rim=0.0))
    lens = T.mask_ellipse(ex, ey, 52, 52)
    glass = np.dstack([np.broadcast_to(rgb('#9fe6ff'), (S, S, 3)), lens * 0.22])
    img = T.over(img, glass)
    cross = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    cd = ImageDraw.Draw(cross)
    cd.line([(ex - 52, ey), (ex + 52, ey)], fill=(255, 60, 60, 190), width=4)
    cd.line([(ex, ey - 52), (ex, ey + 52)], fill=(255, 60, 60, 190), width=4)
    cm = np.asarray(cross).astype(np.float32) / 255.0
    cm[..., 3] *= (lens > 0.5)
    img = T.over(img, cm)
    img = T.add_highlight(img, ex - 22, ey - 24, 16, 8, rot=-0.7, alpha=0.7)

    return img


# gövde merkezi ve gaga ucu: balığı döndürürken eksen olarak kullanılır
PIVOT = (545, 515)
TIP = (935, 120)


def build(out_path=None, seed=8):
    """Marketteki simge: balık kayanın üstünde, çapraz duruyor."""
    rock = draw_rock(seed)
    img = draw_fish(seed)
    img = np.stack([ndi.shift(img[..., c], (92, 8), order=1) for c in range(4)], axis=-1)
    img = T.over(rock, img)
    if out_path:
        T.finish(img, out_path)
    return img


def build_parts(base_path, fish_path, seed=8):
    """Oyun içi: kaide ayrı, balık yatay (kılıç +x yönüne bakar) ve dönebilir."""
    T.finish(draw_rock(seed), base_path)

    fish = draw_fish(seed)
    im = Image.fromarray((np.clip(fish, 0, 1) * 255 + 0.5).astype(np.uint8), 'RGBA')
    big = Image.new('RGBA', (1600, 1600), (0, 0, 0, 0))
    off = 300
    big.alpha_composite(im, (off, off))
    pivot = (PIVOT[0] + off, PIVOT[1] + off)
    ang = math.degrees(math.atan2(TIP[1] - PIVOT[1], TIP[0] - PIVOT[0]))   # negatif: yukarı bakıyor
    big = big.rotate(ang, center=pivot, resample=Image.BICUBIC)            # saat yönünde döndürerek yataya getir
    half = 600
    crop = big.crop((pivot[0] - half, pivot[1] - half, pivot[0] + half, pivot[1] + half))
    crop.resize((600, 600), Image.LANCZOS).save(fish_path)
