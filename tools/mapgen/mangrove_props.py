"""Mangrov Deltası nesneleri: mangrov ağacı, nilüfer yaprağı, kurbağa, kütük, mantar."""
import math

import numpy as np
from PIL import Image

import common as C
from common import K, SSCanvas, rgb
from props import OUT, col8

BARK = rgb('#6a4a2c')


def mangrove_tree(rng, r):
    """Üstten ağaç: radyal kökler ve yoğun yaprak tacı."""
    w = h = int(r * 3.6)
    cx = w / 2
    c = SSCanvas(w, h)
    d, s = c.d, c.s
    # kökler (taçın altında, dışarı taşar)
    for i in range(int(rng.integers(8, 12))):
        a = rng.uniform(0, 2 * math.pi)
        L = r * rng.uniform(1.25, 1.6)
        pts = []
        for t in np.linspace(0, 1, 10):
            rr = r * 0.4 + (L - r * 0.4) * t
            wob = math.sin(t * 5 + i) * r * 0.06
            pts.append((cx + math.cos(a) * rr - math.sin(a) * wob, cx + math.sin(a) * rr + math.cos(a) * wob))
        d.line([(x * s, y * s) for x, y in pts], fill=col8(OUT), width=int(r * 0.2 * s))
        d.line([(x * s, y * s) for x, y in pts], fill=col8(BARK * rng.uniform(0.85, 1.15)), width=int(r * 0.13 * s))
    roots = c.finish()
    # taç: üst üste yuvarlak yaprak kümeleri
    m = np.zeros((int(h * K), int(w * K)), np.float32)
    blobs = []
    for i in range(int(rng.integers(9, 14))):
        a = rng.uniform(0, 2 * math.pi)
        rr = r * rng.uniform(0, 0.55)
        blobs.append((cx + math.cos(a) * rr, cx + math.sin(a) * rr, r * rng.uniform(0.45, 0.7)))
    layers = Image.new('RGBA', roots.size, (0, 0, 0, 0))
    greens = [rgb('#2f6b3a'), rgb('#3f8a45'), rgb('#4fa04a'), rgb('#256030')]
    for k, (bx, by, br) in enumerate(sorted(blobs, key=lambda b: b[1])):
        bm = C.mask_patch(w, h, lambda dd, ss, bx=bx, by=by, br=br: dd.ellipse([(bx - br) * ss, (by - br) * ss, (bx + br) * ss, (by + br) * ss], fill=255))
        var = C.fbm(h, w, br * 0.3, rng, 3)
        col = greens[k % 4][None, None, :] * (0.85 + 0.3 * var[..., None])
        lay = C.shade_patch(bm, col, sigma=br * 0.5, outline=np.array([0.05, 0.18, 0.1]), outline_px=1.6, rng=rng, grain=0.04,
                            hi=np.array([0.9, 1.0, 0.7]), lo=np.array([0, 0.05, 0.02]), rim=0.25)
        layers = Image.alpha_composite(layers, lay)
    return Image.alpha_composite(roots, layers)


def lily(rng, r=14, flower=False):
    w = h = int(r * 2.6)
    cx = w / 2
    notch = rng.uniform(0, 6.28)
    pts = [(cx, cx)]
    for i in range(0, 41):
        a = notch + 0.22 + (2 * math.pi - 0.44) * i / 40
        pts.append((cx + math.cos(a) * r, cx + math.sin(a) * r))
    m = C.mask_patch(w, h, lambda d, s: d.polygon([(x * s, y * s) for x, y in pts], fill=255))
    var = C.fbm(h, w, 4, rng, 2)
    col = rgb('#4fae4a')[None, None, :] * (0.85 + 0.3 * var[..., None])
    patch = C.shade_patch(m, col, sigma=r * 0.5, outline=np.array([0.05, 0.2, 0.1]), outline_px=1.3, rng=rng, grain=0.03, rim=0.2)
    if flower:
        f = SSCanvas(w, h)
        for i in range(8):
            a = i * math.pi / 4
            f.d.ellipse([(cx + math.cos(a) * r * 0.3 - r * 0.2) * f.s, (cx + math.sin(a) * r * 0.3 - r * 0.2) * f.s,
                         (cx + math.cos(a) * r * 0.3 + r * 0.2) * f.s, (cx + math.sin(a) * r * 0.3 + r * 0.2) * f.s],
                        fill=col8(rgb('#ff9ec8')), outline=col8(OUT), width=int(f.s))
        f.d.ellipse([(cx - r * 0.12) * f.s, (cx - r * 0.12) * f.s, (cx + r * 0.12) * f.s, (cx + r * 0.12) * f.s], fill=col8(rgb('#ffe066')))
        patch = Image.alpha_composite(patch, f.finish())
    return patch


def frog(rng, size=22):
    w = h = int(size * 2.6)
    cx = w / 2
    c = SSCanvas(w, h)
    d, s = c.d, c.s
    g = rgb('#5cc040')
    ol = col8(OUT)

    def ell(x0, y0, x1, y1, fill, ow=1.6):
        d.ellipse([x0 * s, y0 * s, x1 * s, y1 * s], fill=col8(fill), outline=ol, width=int(ow * s))
    # arka bacaklar
    for sx in (-1, 1):
        d.polygon([((cx + sx * size * 0.45) * s, (cx + size * 0.1) * s), ((cx + sx * size * 1.15) * s, (cx + size * 0.75) * s),
                   ((cx + sx * size * 0.8) * s, (cx + size * 0.95) * s), ((cx + sx * size * 0.3) * s, (cx + size * 0.6) * s)], fill=col8(g * 0.9), outline=ol)
        d.polygon([((cx + sx * size * 0.4) * s, (cx - size * 0.35) * s), ((cx + sx * size * 1.0) * s, (cx - size * 0.7) * s),
                   ((cx + sx * size * 0.95) * s, (cx - size * 0.35) * s), ((cx + sx * size * 0.5) * s, (cx - size * 0.1) * s)], fill=col8(g * 0.9), outline=ol)
    ell(cx - size * 0.62, cx - size * 0.62, cx + size * 0.62, cx + size * 0.72, g)
    ell(cx - size * 0.38, cx - size * 0.15, cx + size * 0.38, cx + size * 0.6, rgb('#c8f0a0'), ow=1.0)
    for sx in (-1, 1):
        ell(cx + sx * size * 0.33 - size * 0.2, cx - size * 0.66, cx + sx * size * 0.33 + size * 0.2, cx - size * 0.28, rgb('#8be060'))
        ell(cx + sx * size * 0.33 - size * 0.1, cx - size * 0.58, cx + sx * size * 0.33 + size * 0.1, cx - size * 0.36, rgb('#101820'), ow=0)
    return c.finish().rotate(rng.uniform(0, 360), resample=Image.BICUBIC)


def log(rng, length=100, r=11):
    w = int(length + 30)
    h = int(r * 3.2)
    cy = h / 2
    pts = [(15, cy - r), (15 + length, cy - r * 0.92), (15 + length + 3, cy), (15 + length, cy + r * 0.92), (15, cy + r)]
    m = C.mask_patch(w, h, lambda d, s: d.polygon([(x * s, y * s) for x, y in pts], fill=255))
    yy, xx = C.patch_grid(m)
    bark = np.abs(np.sin((yy - cy) / r * 6 + C.fbm(h, w, 6, rng, 2) * 3)) * 0.3
    col = BARK[None, None, :] * (0.8 + 0.4 * C.fbm(h, w, 5, rng, 3)[..., None]) * (1 - bark[..., None])
    moss = np.clip((C.fbm(h, w, 8, rng, 3) - 0.55) * 4, 0, 1) * 0.7
    col = col * (1 - moss[..., None]) + rgb('#4a8a3a')[None, None, :] * moss[..., None]
    patch = C.shade_patch(m, col, light=(-0.2, -1.0), sigma=r * 0.7, outline=OUT, outline_px=1.6, rng=rng, grain=0.04, rim=0.25)
    cap = C.mask_patch(w, h, lambda d, s: d.ellipse([(15 - r * 0.3) * s, (cy - r) * s, (15 + r * 0.3) * s, (cy + r) * s], fill=255))
    ring = np.sin(np.sqrt(((xx - 15) / 0.3) ** 2 + (yy - cy) ** 2) * 1.2) * 0.12
    cp = C.shade_patch(cap, rgb('#c9a06a')[None, None, :] * (1 + ring[..., None]), sigma=3, outline=OUT, outline_px=1.2, rng=rng)
    return Image.alpha_composite(patch, cp).rotate(rng.uniform(0, 360), resample=Image.BICUBIC, expand=True)


def mushroom(rng, r=10):
    w = h = int(r * 3)
    cx = w / 2
    c = SSCanvas(w, h)
    d, s = c.d, c.s
    d.ellipse([(cx - r * 0.35) * s, (cx - r * 0.1) * s, (cx + r * 0.35) * s, (cx + r * 1.0) * s], fill=col8(rgb('#f0e6d0')), outline=col8(OUT), width=int(1.4 * s))
    d.ellipse([(cx - r) * s, (cx - r * 0.85) * s, (cx + r) * s, (cx + r * 0.35) * s], fill=col8(rgb('#d8362e')), outline=col8(OUT), width=int(1.6 * s))
    for _ in range(5):
        a = rng.uniform(0, 6.28)
        rr = rng.uniform(0.15, 0.6) * r
        x, y = cx + math.cos(a) * rr, cx - r * 0.25 + math.sin(a) * rr * 0.5
        d.ellipse([(x - r * 0.14) * s, (y - r * 0.12) * s, (x + r * 0.14) * s, (y + r * 0.12) * s], fill=(255, 255, 255, 235))
    return c.finish()
