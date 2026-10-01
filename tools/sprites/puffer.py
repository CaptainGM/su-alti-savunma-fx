import math
import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage as ndi
import toolkit as T
from toolkit import rgb, S


def build(out_path=None, seed=5):
    rng = np.random.default_rng(seed)
    img = T.blank()
    img = T.rock_base(img, 500, 810, 310, 125, rng)

    cx, cy, R = 500, 500, 235
    # dikenler (gövdenin arkasında)
    spikes = np.zeros((S, S), np.float32)
    n = 20
    for i in range(n):
        a = math.radians(-165 + i * (150 / (n - 1)) * 1.0)
        for side in (0,):
            pass
    for i in range(22):
        a = math.radians(-200 + i * 220 / 21)
        bx, by = cx + math.cos(a) * R * 0.92, cy + math.sin(a) * R * 0.92
        tx, ty = cx + math.cos(a) * (R + 62), cy + math.sin(a) * (R + 62)
        px, py = -math.sin(a), math.cos(a)
        pts = [(bx + px * 24, by + py * 24), (tx, ty), (bx - px * 24, by - py * 24)]
        spikes = np.maximum(spikes, T.mask_poly(pts))
    sp = T.layer(spikes, rgb('#e0701f'), rgb('#a8431a'), angle=90, sigma=9, outline_px=9, gloss=0.1)
    img = T.over(img, sp)

    # yan yüzgeçler
    for sgn in (-1, 1):
        fin = [(cx + sgn * R * 0.88, cy + 40), (cx + sgn * (R + 95), cy - 10), (cx + sgn * (R + 110), cy + 70), (cx + sgn * (R + 60), cy + 125), (cx + sgn * R * 0.9, cy + 100)]
        fm = T.mask_poly(T.smooth_closed(fin, 8))
        img = T.over(img, T.layer(fm, rgb('#ffd27a'), rgb('#f0993a'), angle=0 if sgn > 0 else 180, sigma=14, outline_px=9))

    # gövde
    body = T.mask_ellipse(cx, cy, R, R * 0.97)
    tex = ndi.gaussian_filter(rng.standard_normal((S, S)).astype(np.float32), 6)
    tex = (tex - tex.min()) / (tex.max() - tex.min())
    img = T.over(img, T.layer(body, rgb('#ffb84a'), rgb('#f26d2a'), angle=100, sigma=60, outline_px=11, texture=tex, gloss=0.45, rim=0.35))
    # karın
    belly = T.mask_ellipse(cx, cy + 120, R * 0.78, R * 0.5) * body
    belly = ndi.gaussian_filter(belly, 3)
    bl = T.layer(belly, rgb('#fff1cf'), rgb('#ffdc9a'), angle=90, sigma=36, outline=False, gloss=0.0, rim=0.0)
    bl[..., 3] *= 0.92
    img = T.over(img, bl)
    # benekler
    d = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    dd = ImageDraw.Draw(d)
    for _ in range(34):
        a = rng.uniform(math.radians(-170), math.radians(-10))
        r = rng.uniform(0.35, 0.93) * R
        x, y = cx + math.cos(a) * r, cy + math.sin(a) * r * 0.95
        rr = rng.uniform(7, 15)
        dd.ellipse([x - rr, y - rr, x + rr, y + rr], fill=(176, 70, 24, 190))
    dm = np.asarray(d).astype(np.float32) / 255.0
    dm[..., 3] *= (body > 0.5)
    img = T.over(img, dm)

    # gözler
    img = T.eye(img, 400, 440, 72, look=(0.3, 0.1), angry=0.55, inner=1)
    img = T.eye(img, 600, 440, 72, look=(-0.3, 0.1), angry=0.55, inner=-1)
    # yanaklar (kırmızımsı)
    for sx in (360, 640):
        c = T.mask_ellipse(sx, 548, 44, 26)
        c = ndi.gaussian_filter(c, 12) * body
        img = T.over(img, np.dstack([np.broadcast_to(rgb('#ff6a5c'), (S, S, 3)), c * 0.55]))
    # ağız: büzük 'o'
    mm = T.mask_ellipse(500, 590, 62, 54)
    img = T.over(img, T.layer(mm, rgb('#8a2230'), rgb('#3b0f18'), gloss=0.0, sigma=16, outline_px=10, rim=0.0))
    ball = T.mask_ellipse(500, 598, 36, 34)
    img = T.over(img, T.layer(ball, rgb('#ff9a3d'), rgb('#c4501a'), sigma=12, outline_px=6, gloss=0.5, rim=0.2))
    for k in range(10):
        a = k * math.pi / 5
        img = T.over(img, T.layer(T.mask_poly([(500 + math.cos(a) * 34 - math.sin(a) * 6, 598 + math.sin(a) * 34 + math.cos(a) * 6), (500 + math.cos(a) * 52, 598 + math.sin(a) * 52), (500 + math.cos(a) * 34 + math.sin(a) * 6, 598 + math.sin(a) * 34 - math.cos(a) * 6)]) * mm, rgb('#d8601f'), rgb('#a8431a'), outline=False, gloss=0.0, sigma=3, rim=0.0))
    # parlama
    img = T.add_highlight(img, 400, 330, 70, 34, rot=-0.5, alpha=0.5)

    if out_path:
        T.finish(img, out_path)
    return img


if __name__ == '__main__':
    import sys
    build(sys.argv[1] if len(sys.argv) > 1 else 'puffer_test.png')
