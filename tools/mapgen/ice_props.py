"""Buz Koyu nesneleri: buzdağı, kar yığını, penguen, buz kristali."""
import math

import numpy as np
from PIL import Image

import common as C
from common import K, SSCanvas, rgb
from props import OUT, col8

ICE_OUT = np.array([0.08, 0.20, 0.34], np.float32)


def iceberg(rng, size, tint=0.0):
    """Düşük poligonlu, yüzlü buzdağı."""
    w = int(size * 2.4) + 10
    h = int(size * 2.2) + 10
    cx, cy = w / 2, h * 0.58
    n = 9
    pts = []
    for i in range(n):
        a = 2 * math.pi * i / n + rng.uniform(-0.12, 0.12)
        rr = size * rng.uniform(0.7, 1.05) * (1.0 if i % 2 == 0 else 0.78)
        pts.append((cx + math.cos(a) * rr, cy + math.sin(a) * rr * 0.72))
    peak = (cx + rng.uniform(-size * 0.2, size * 0.2), cy - size * rng.uniform(0.75, 1.0))
    c = SSCanvas(w, h)
    d, s = c.d, c.s
    base_cols = [rgb('#f4fbff'), rgb('#cfe8f6'), rgb('#9fcbe6'), rgb('#7fb4d8'), rgb('#e1f2fb')]
    # tepeden çevreye üçgen yüzler
    for i in range(n):
        p1, p2 = pts[i], pts[(i + 1) % n]
        col = base_cols[(i * 2 + int(rng.integers(0, 2))) % len(base_cols)]
        # sol-üst yüzler daha aydınlık
        mid_a = math.atan2((p1[1] + p2[1]) / 2 - cy, (p1[0] + p2[0]) / 2 - cx)
        lit = 0.5 + 0.5 * math.cos(mid_a + 2.4)
        col = np.clip(col * (0.78 + 0.3 * lit), 0, 1)
        d.polygon([(peak[0] * s, peak[1] * s), (p1[0] * s, p1[1] * s), (p2[0] * s, p2[1] * s)], fill=col8(col), outline=col8(ICE_OUT))
    # çevre çizgisi
    d.line([(x * s, y * s) for x, y in pts + [pts[0]]], fill=col8(ICE_OUT), width=int(2.2 * s))
    for i in range(n):
        d.line([(peak[0] * s, peak[1] * s), (pts[i][0] * s, pts[i][1] * s)], fill=col8(ICE_OUT, 150), width=max(1, int(1.2 * s)))
    return c.finish()


def snow_mound(rng, r):
    w = int(r * 2.6)
    h = int(r * 2.0)
    pts = C.blob_points(rng, w / 2, h / 2, r, r * 0.7, n=9, jitter=0.16, rot=rng.uniform(-0.3, 0.3))
    m = C.mask_patch(w, h, lambda d, s: d.polygon([(x * s, y * s) for x, y in pts], fill=255))
    var = C.fbm(h, w, r * 0.4, rng, 3)
    col = rgb('#f6fbff')[None, None, :] * (0.92 + 0.12 * var[..., None])
    return C.shade_patch(m, col, sigma=r * 0.6, hi=np.array([1, 1, 1]), lo=np.array([0.35, 0.55, 0.78]),
                         outline=np.array([0.45, 0.66, 0.82]), outline_px=1.2, rng=rng, grain=0.01)


def ice_crystals(rng, size, main='#bfeaff', hi='#ffffff', count=4):
    """Parlamayan buz sivrileri."""
    w = int(size * 2.6)
    h = int(size * 2.4)
    c = SSCanvas(w, h)
    d, s = c.d, c.s
    m = rgb(main)
    items = []
    for i in range(count):
        ang = (i - (count - 1) / 2) * 0.34 + rng.uniform(-0.1, 0.1)
        items.append((ang, size * rng.uniform(0.7, 1.15), size * rng.uniform(0.16, 0.24)))
    items.sort(key=lambda it: -abs(it[0]))
    for ang, L, wd in items:
        bx, by = w / 2 + math.sin(ang) * size * 0.3, h * 0.88
        ca, sa = math.cos(ang), math.sin(ang)

        def P_(px, py):
            return (bx + px * ca - py * sa, by + px * sa + py * ca)
        bl, br = P_(-wd, 0), P_(wd, 0)
        sl, sr = P_(-wd, -L * 0.72), P_(wd, -L * 0.72)
        tip, mid, mb = P_(0, -L), P_(0, -L * 0.72), P_(0, 0)
        d.polygon([(x * s, y * s) for x, y in [bl, sl, tip, mid, mb]], fill=col8(m * 0.78), outline=col8(ICE_OUT))
        d.polygon([(x * s, y * s) for x, y in [mb, mid, tip, sr, br]], fill=col8(m), outline=col8(ICE_OUT))
        d.polygon([(x * s, y * s) for x, y in [sl, tip, mid]], fill=col8(rgb(hi) * 0.96), outline=col8(ICE_OUT))
        d.polygon([(x * s, y * s) for x, y in [mid, tip, sr]], fill=col8(rgb(hi)), outline=col8(ICE_OUT))
    return c.finish()


def penguin(rng, size=34):
    """Küçük, sevimli penguen (önden)."""
    w = int(size * 2.2)
    h = int(size * 2.6)
    c = SSCanvas(w, h)
    d, s = c.d, c.s
    cx = w / 2
    navy = rgb('#1d2c44')

    def ell(x0, y0, x1, y1, fill, outline=OUT, ow=2):
        d.ellipse([x0 * s, y0 * s, x1 * s, y1 * s], fill=col8(fill), outline=col8(outline), width=int(ow * s))
    # ayaklar
    for sgn in (-1, 1):
        ell(cx + sgn * size * 0.28 - size * 0.2, h * 0.86, cx + sgn * size * 0.28 + size * 0.2, h * 0.97, rgb('#f6a02a'))
    # kanatlar
    for sgn in (-1, 1):
        d.polygon([((cx + sgn * size * 0.62) * s, (h * 0.42) * s), ((cx + sgn * size * 0.98) * s, (h * 0.66) * s),
                   ((cx + sgn * size * 0.7) * s, (h * 0.68) * s)], fill=col8(navy), outline=col8(OUT))
    # gövde
    ell(cx - size * 0.7, h * 0.28, cx + size * 0.7, h * 0.92, navy)
    ell(cx - size * 0.46, h * 0.42, cx + size * 0.46, h * 0.9, rgb('#f3f8fc'), outline=navy, ow=1.2)
    # kafa
    ell(cx - size * 0.5, h * 0.06, cx + size * 0.5, h * 0.5, navy)
    ell(cx - size * 0.32, h * 0.2, cx + size * 0.32, h * 0.46, rgb('#f3f8fc'), outline=navy, ow=1.0)
    for sgn in (-1, 1):
        ell(cx + sgn * size * 0.2 - size * 0.12, h * 0.2, cx + sgn * size * 0.2 + size * 0.12, h * 0.31, rgb('#ffffff'), outline=OUT, ow=1.2)
        ell(cx + sgn * size * 0.2 - size * 0.05, h * 0.235, cx + sgn * size * 0.2 + size * 0.05, h * 0.285, rgb('#0a0e18'), outline=rgb('#0a0e18'), ow=0)
    d.polygon([((cx - size * 0.16) * s, (h * 0.33) * s), ((cx + size * 0.16) * s, (h * 0.33) * s), (cx * s, (h * 0.45) * s)],
              fill=col8(rgb('#f6a02a')), outline=col8(OUT))
    return c.finish()
