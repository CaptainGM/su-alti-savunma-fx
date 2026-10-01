"""Sahne nesneleri: her biri ana hatlı, ışıklı bir RGBA yama (PIL Image) döndürür."""
import math

import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage as ndi

import common as C
from common import SS, rgb

OUT = np.array([0.04, 0.09, 0.12], np.float32)   # genel koyu ana hat rengi


def _ribbon_polys(pts, widths):
    left, right = [], []
    n = len(pts)
    for i, (x, y) in enumerate(pts):
        if i == 0:
            dx, dy = pts[1][0] - x, pts[1][1] - y
        elif i == n - 1:
            dx, dy = x - pts[i - 1][0], y - pts[i - 1][1]
        else:
            dx, dy = pts[i + 1][0] - pts[i - 1][0], pts[i + 1][1] - pts[i - 1][1]
        ln = math.hypot(dx, dy) or 1
        nx, ny = -dy / ln, dx / ln
        left.append((x + nx * widths[i], y + ny * widths[i]))
        right.append((x - nx * widths[i], y - ny * widths[i]))
    return left, right


def blade(d, s, base, ang, length, width, bend, c_base, c_tip, c_hi, outline=OUT, ow=2.2):
    """Tek yaprak: tabandan uca doğru gradyan, orta damar ve ana hat."""
    n = 22
    pts, widths = [], []
    px, py = base
    ca, sa = math.cos(ang), math.sin(ang)
    for i in range(n + 1):
        t = i / n
        along = length * t
        side = bend * length * math.sin(math.pi * t) * (1 - 0.3 * t)
        x = px + ca * along - sa * side
        y = py + sa * along + ca * side
        pts.append((x, y))
        widths.append(width * (math.sin(math.pi * min(1, t * 1.05 + 0.02)) ** 0.7) * (1 - 0.35 * t) + 0.4)
    left, right = _ribbon_polys(pts, widths)
    # ana hat (alt katman)
    poly = [(x * s, y * s) for x, y in left + right[::-1]]
    d.polygon(poly, fill=tuple(int(v * 255) for v in outline) + (255,))
    inner_w = [max(0.2, w - ow) for w in widths]
    left, right = _ribbon_polys(pts, inner_w)
    for i in range(n):
        t = (i + 0.5) / n
        col = np.asarray(c_base) * (1 - t) + np.asarray(c_tip) * t
        quad = [left[i], left[i + 1], right[i + 1], right[i]]
        d.polygon([(x * s, y * s) for x, y in quad], fill=tuple(int(v * 255) for v in col) + (255,))
    # orta damar / parlama
    hl_pts = [(0.5 * (l[0] + r[0]) + 0.28 * (l[0] - r[0]) * 0.5, 0.5 * (l[1] + r[1]) + 0.28 * (l[1] - r[1]) * 0.5) for l, r in zip(left, right)]
    d.line([(x * s, y * s) for x, y in hl_pts[2:-2]], fill=tuple(int(v * 255) for v in c_hi) + (150,), width=max(1, int(1.6 * s)))


def tuft(rng, count, length, width, c_base, c_tip, c_hi, spread=1.2, lean=0.0, pad=14):
    """Köşeden yayılan yaprak demeti (yosun/deniz çimi)."""
    size = int(length * 2 + pad * 2)
    cx = cy = size // 2 + int(length * 0.35)
    img = Image.new('RGBA', (size * SS, size * SS), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    items = []
    for i in range(count):
        a = -math.pi / 2 + lean + (rng.random() - 0.5) * spread * 2
        L = length * (0.65 + rng.random() * 0.45)
        items.append((a, L, rng.uniform(-0.28, 0.28)))
    items.sort(key=lambda it: -abs(it[0] + math.pi / 2))
    for a, L, b in items:
        jitter = np.array([rng.uniform(-0.04, 0.04) for _ in range(3)], np.float32)
        blade(d, SS, (cx + rng.uniform(-5, 5), cy + rng.uniform(-3, 3)), a, L, width * (0.8 + rng.random() * 0.5), b,
              np.clip(c_base + jitter, 0, 1), np.clip(c_tip + jitter, 0, 1), c_hi)
    return img.resize((size, size), Image.LANCZOS)


def rock(rng, r, base, moss=None, ratio=0.78, rot=None, grain=0.05):
    w = int(r * 2.5) + 10
    h = int(r * 2.0) + 10
    pts = C.blob_points(rng, w / 2, h / 2, r, r * ratio, n=9, jitter=0.2, rot=rng.uniform(-0.4, 0.4) if rot is None else rot)
    m = C.draw_mask_patch(w, h, lambda d, s: d.polygon([(x * s, y * s) for x, y in pts], fill=255))
    base = np.asarray(base, np.float32)
    # taş yüzeyine renk değişimi
    var = C.fbm(h, w, r * 0.35, rng, 3)
    col = base[None, None, :] * (0.82 + 0.36 * var[..., None])
    if moss is not None:
        yy = np.linspace(0, 1, h)[:, None]
        gate = np.clip((var - 0.5) * 3 + 0.9 - yy * 1.4, 0, 1) * 0.8
        col = col * (1 - gate[..., None]) + np.asarray(moss, np.float32) * gate[..., None]
    patch = C.shade_patch(m, col, sigma=r * 0.55, outline=OUT, outline_px=1.8, rng=rng, grain=grain,
                          hi=np.array([1.0, 1.0, 0.95]), lo=np.array([0.0, 0.03, 0.08]), rim=0.25)
    return patch


def pebble(rng, size, base):
    return C.pebble_patch(rng, size, base)


def starfish(rng, r, body, dot):
    w = int(r * 2.4) + 8
    pts = []
    rot = rng.uniform(0, 6.28)
    for i in range(10):
        a = rot + i * math.pi / 5
        rr = r if i % 2 == 0 else r * 0.45
        pts.append((w / 2 + math.cos(a) * rr, w / 2 + math.sin(a) * rr))
    m = C.draw_mask_patch(w, w, lambda d, s: d.polygon([(x * s, y * s) for x, y in pts], fill=255))
    m = ndi.gaussian_filter(m, 1.4)
    m = np.clip((m - 0.35) * 3.0, 0, 1)
    patch = C.shade_patch(m, body, sigma=r * 0.4, outline=OUT, outline_px=1.4, rng=rng, grain=0.04)
    d = ImageDraw.Draw(patch)
    for i in range(5):
        a = rot + i * 2 * math.pi / 5
        for k in (0.35, 0.58, 0.8):
            x, y = w / 2 + math.cos(a) * r * k, w / 2 + math.sin(a) * r * k
            d.ellipse([x - 1.2, y - 1.2, x + 1.2, y + 1.2], fill=tuple(int(v * 255) for v in dot) + (255,))
    return patch


def urchin(rng, r, body=(0.28, 0.14, 0.42), spine=(0.55, 0.3, 0.7)):
    w = int(r * 3.2) + 8
    img = Image.new('RGBA', (w * SS, w * SS), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    c = w / 2
    n = 26
    for i in range(n):
        a = i * 2 * math.pi / n + rng.uniform(-0.1, 0.1)
        L = r * rng.uniform(1.25, 1.55)
        d.line([((c + math.cos(a) * r * 0.5) * SS, (c + math.sin(a) * r * 0.5) * SS),
                ((c + math.cos(a) * L) * SS, (c + math.sin(a) * L) * SS)],
               fill=tuple(int(v * 255) for v in OUT) + (255,), width=int(3.4 * SS))
        d.line([((c + math.cos(a) * r * 0.5) * SS, (c + math.sin(a) * r * 0.5) * SS),
                ((c + math.cos(a) * L) * SS, (c + math.sin(a) * L) * SS)],
               fill=tuple(int(v * 255) for v in spine) + (255,), width=int(1.7 * SS))
    img = img.resize((w, w), Image.LANCZOS)
    m = C.draw_mask_patch(w, w, lambda dd, s: dd.ellipse([(c - r) * s, (c - r) * s, (c + r) * s, (c + r) * s], fill=255))
    core = C.shade_patch(m, body, sigma=r * 0.5, outline=OUT, outline_px=1.5, rng=rng, grain=0.05)
    return Image.alpha_composite(img, core)


def tube_cluster(rng, count, r, body, inner, hi):
    """Harita 1'deki turuncu tüp mercanlara benzeyen sünger/mercan kümesi."""
    w = int(r * 5.0) + 20
    h = int(r * 6.4) + 20
    base = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    tubes = []
    for i in range(count):
        tubes.append((w / 2 + rng.uniform(-r * 1.4, r * 1.4), h * 0.7 + rng.uniform(-r * 0.6, r * 0.5),
                      r * rng.uniform(0.42, 0.62), r * rng.uniform(1.8, 3.2)))
    tubes.sort(key=lambda t: t[1])
    for x, y, tr, th in tubes:
        pw = int(tr * 2.6) + 6
        ph = int(th + tr * 1.2) + 10
        cx = pw / 2
        top_y = tr * 0.7 + 3

        def body_mask(d, s):
            d.rectangle([(cx - tr) * s, top_y * s, (cx + tr) * s, (top_y + th) * s], fill=255)
            d.ellipse([(cx - tr) * s, (top_y + th - tr * 0.5) * s, (cx + tr) * s, (top_y + th + tr * 0.5) * s], fill=255)
            d.ellipse([(cx - tr) * s, (top_y - tr * 0.5) * s, (cx + tr) * s, (top_y + tr * 0.5) * s], fill=255)
        m = C.draw_mask_patch(pw, ph, body_mask)
        tube = C.shade_patch(m, body, light=(-1.0, -0.2), sigma=tr * 0.6, outline=OUT, outline_px=1.6, rng=rng, grain=0.05)
        dd = ImageDraw.Draw(tube)
        col_in = tuple(int(v * 255) for v in inner) + (255,)
        dd.ellipse([cx - tr * 0.7, top_y - tr * 0.32, cx + tr * 0.7, top_y + tr * 0.32], fill=col_in, outline=tuple(int(v * 255) for v in OUT) + (255,), width=1)
        dd.ellipse([cx - tr * 0.45, top_y - tr * 0.12, cx + tr * 0.1, top_y + tr * 0.08], fill=tuple(int(v * 255) for v in hi) + (110,))
        base.alpha_composite(tube, (int(x - pw / 2), int(y - ph * 0.75)))
    return base


def shell(rng, r, body, rib):
    w = int(r * 2.6) + 8
    pts = [(w / 2, w * 0.82)]
    for i in range(0, 21):
        a = math.pi * (1.1 + 0.8 * i / 20)
        pts.append((w / 2 + math.cos(a) * r * 1.05, w * 0.82 + math.sin(a) * r * 1.2))
    m = C.draw_mask_patch(w, w, lambda d, s: d.polygon([(x * s, y * s) for x, y in pts], fill=255))
    patch = C.shade_patch(m, body, sigma=r * 0.4, outline=OUT, outline_px=1.4, rng=rng, grain=0.03)
    d = ImageDraw.Draw(patch)
    for i in range(1, 8):
        a = math.pi * (1.1 + 0.8 * i / 8)
        d.line([(w / 2, w * 0.82), (w / 2 + math.cos(a) * r * 1.0, w * 0.82 + math.sin(a) * r * 1.15)],
               fill=tuple(int(v * 255) for v in rib) + (150,), width=1)
    return patch


def sea_fan(rng, size, body, hi):
    """Dallanan yelpaze mercan: yarı saydam zar üstünde kalın dallar."""
    w = int(size * 2.4) + 10
    h = int(size * 2.2) + 10
    img = Image.new('RGBA', (w * SS, h * SS), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    ox, oy = w / 2, h * 0.93
    fan = [(ox, oy)]
    for i in range(0, 31):
        a = -math.pi / 2 - 1.0 + 2.0 * i / 30
        fan.append((ox + math.cos(a) * size * 0.98 * (0.9 + 0.1 * math.sin(i * 1.7)), oy + math.sin(a) * size * 0.98 * (0.9 + 0.1 * math.sin(i * 1.7))))
    d.polygon([(x * SS, y * SS) for x, y in fan], fill=tuple(int(v * 255) for v in body) + (70,))

    def branch(x, y, ang, length, depth, width):
        if depth == 0 or length < 4:
            return
        x2, y2 = x + math.cos(ang) * length, y + math.sin(ang) * length
        for col, ww in ((OUT, width + 2.4), (body, width)):
            d.line([(x * SS, y * SS), (x2 * SS, y2 * SS)], fill=tuple(int(v * 255) for v in col) + (255,), width=int(ww * SS))
            r = ww / 2 * SS
            d.ellipse([x2 * SS - r, y2 * SS - r, x2 * SS + r, y2 * SS + r], fill=tuple(int(v * 255) for v in col) + (255,))
        n = 2 if depth > 2 else 3
        for k in range(n):
            off = (k - (n - 1) / 2) * rng.uniform(0.4, 0.62)
            branch(x2, y2, ang + off, length * rng.uniform(0.66, 0.78), depth - 1, max(1.6, width * 0.7))

    for k in range(-2, 3):
        branch(ox + k * 3, oy, -math.pi / 2 + k * 0.36, size * 0.34, 4, 6.0)
    img = img.resize((w, h), Image.LANCZOS)
    return img


def bubbles(rng, n, spread, col=(0.8, 0.95, 1.0)):
    w = int(spread * 2) + 12
    img = Image.new('RGBA', (w * SS, w * SS), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    for _ in range(n):
        x, y = rng.uniform(8, w - 8), rng.uniform(8, w - 8)
        r = rng.uniform(2, 6)
        d.ellipse([(x - r) * SS, (y - r) * SS, (x + r) * SS, (y + r) * SS], outline=tuple(int(v * 255) for v in col) + (190,),
                  fill=tuple(int(v * 255) for v in col) + (45,), width=SS)
        d.ellipse([(x - r * 0.5) * SS, (y - r * 0.6) * SS, (x - r * 0.1) * SS, (y - r * 0.2) * SS], fill=(255, 255, 255, 200))
    return img.resize((w, w), Image.LANCZOS)
