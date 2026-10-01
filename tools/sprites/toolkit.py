"""Kule/düşman sprite'ları için çizim araçları (yüksek çözünürlükte çizip küçültür).

Üslup: kalın koyu ana hat, yumuşak ışıklandırma, parlak vurgu, büyük gözler.
"""
import math

import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage as ndi

S = 1000          # çalışma çözünürlüğü
OUT_SIZE = 500    # çıktı
OUTLINE = np.array([0.05, 0.07, 0.16], np.float32)


def rgb(h):
    h = h.lstrip('#')
    return np.array([int(h[i:i + 2], 16) / 255.0 for i in (0, 2, 4)], np.float32)


def smooth_closed(points, per=14):
    pts = [tuple(map(float, p)) for p in points]
    ring = pts + pts[:3]
    out = []
    for i in range(1, len(pts) + 1):
        p0, p1, p2, p3 = ring[i - 1], ring[i], ring[i + 1], ring[i + 2] if i + 2 < len(ring) else ring[(i + 2) % len(pts)]
        for j in range(per):
            t = j / per
            t2, t3 = t * t, t * t * t
            out.append((
                0.5 * ((2 * p1[0]) + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
                0.5 * ((2 * p1[1]) + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3)))
    return out


def smooth_open(points, per=14):
    pts = [tuple(map(float, p)) for p in points]
    out = []
    for i in range(len(pts) - 1):
        p0 = pts[max(0, i - 1)]
        p1, p2 = pts[i], pts[i + 1]
        p3 = pts[min(len(pts) - 1, i + 2)]
        for j in range(per):
            t = j / per
            t2, t3 = t * t, t * t * t
            out.append((
                0.5 * ((2 * p1[0]) + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
                0.5 * ((2 * p1[1]) + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3)))
    out.append(pts[-1])
    return out


def mask_poly(points, size=S):
    img = Image.new('L', (size, size), 0)
    ImageDraw.Draw(img).polygon([tuple(p) for p in points], fill=255)
    return np.asarray(img).astype(np.float32) / 255.0


def mask_ellipse(cx, cy, rx, ry, rot=0.0, size=S):
    pts = []
    for i in range(72):
        a = i * 2 * math.pi / 72
        x, y = math.cos(a) * rx, math.sin(a) * ry
        pts.append((cx + x * math.cos(rot) - y * math.sin(rot), cy + x * math.sin(rot) + y * math.cos(rot)))
    return mask_poly(pts, size)


def mask_stroke(points, width, size=S):
    img = Image.new('L', (size, size), 0)
    d = ImageDraw.Draw(img)
    d.line([tuple(p) for p in points], fill=255, width=int(width), joint='curve')
    r = width / 2
    for p in (points[0], points[-1]):
        d.ellipse([p[0] - r, p[1] - r, p[0] + r, p[1] + r], fill=255)
    return np.asarray(img).astype(np.float32) / 255.0


def mask_taper(points, w0, w1, size=S):
    """Uca doğru incelen şerit (kuyruk, tentakül, burun)."""
    img = Image.new('L', (size, size), 0)
    d = ImageDraw.Draw(img)
    n = len(points)
    for i in range(n - 1):
        t = i / (n - 1)
        w = w0 + (w1 - w0) * t
        d.line([tuple(points[i]), tuple(points[i + 1])], fill=255, width=max(1, int(w)))
        r = w / 2
        d.ellipse([points[i][0] - r, points[i][1] - r, points[i][0] + r, points[i][1] + r], fill=255)
    r = max(1, w1 / 2)
    d.ellipse([points[-1][0] - r, points[-1][1] - r, points[-1][0] + r, points[-1][1] + r], fill=255)
    return np.asarray(img).astype(np.float32) / 255.0


def mask_profile(points, widths, size=S):
    """Orta çizgi boyunca değişen genişlikte gövde maskesi (dolu daireler)."""
    img = Image.new('L', (size, size), 0)
    d = ImageDraw.Draw(img)
    dense = smooth_open(points, 18)
    n = len(dense)
    ws = np.interp(np.linspace(0, 1, n), np.linspace(0, 1, len(widths)), widths)
    for (x, y), w in zip(dense, ws):
        r = w / 2
        d.ellipse([x - r, y - r, x + r, y + r], fill=255)
    return np.asarray(img).astype(np.float32) / 255.0


def layer(mask, c_top, c_bottom=None, angle=90.0, light=(-0.55, -0.8), sigma=18, outline=True,
          outline_px=9, gloss=0.35, rim=0.3, grain=0.0, rng=None, texture=None, hi=(1, 1, 1)):
    """Maskeden ışıklı, ana hatlı bir RGBA katmanı üretir (float, S x S x 4).

    angle: renk geçişinin yönü (derece, 90 = yukarıdan aşağıya)
    """
    h, w = mask.shape
    c0 = np.asarray(c_top, np.float32)
    c1 = np.asarray(c_bottom if c_bottom is not None else c_top, np.float32)
    ys, xs = np.nonzero(mask > 0.5)
    if len(xs) == 0:
        return np.zeros((h, w, 4), np.float32)
    ang = math.radians(angle)
    dx, dy = math.cos(ang), math.sin(ang)
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    proj = (xx - xs.mean()) * dx + (yy - ys.mean()) * dy
    pr = proj[mask > 0.5]
    lo, hi_ = pr.min(), pr.max()
    t = np.clip((proj - lo) / (hi_ - lo + 1e-6), 0, 1)[..., None]
    col = c0 * (1 - t) + c1 * t
    if texture is not None:
        col = col * (0.88 + 0.24 * texture[..., None])

    height = ndi.gaussian_filter(mask, sigma)
    gy, gx = np.gradient(height)
    mag = np.sqrt(gx * gx + gy * gy) + 1e-6
    lam = -(gx * light[0] + gy * light[1]) / mag
    strength = np.clip(mag / (mag.max() + 1e-6) * 2.6, 0, 1)
    shade = (lam * strength)[..., None]
    pos = np.clip(shade, 0, 1)
    neg = np.clip(-shade, 0, 1)
    col = col * (1 - 0.5 * neg) + np.array([0.0, 0.02, 0.1], np.float32) * 0.5 * neg
    col = col + (np.asarray(hi, np.float32) - col) * 0.28 * pos
    if gloss:
        top = np.clip(ndi.gaussian_filter(mask, sigma * 0.55) - 0.82, 0, 1) * np.clip(-(yy - ys.mean()) / (ys.max() - ys.min() + 1) + 0.4, 0, 1)[..., None][..., 0]
        col = col + top[..., None] * gloss * 0.9
    if rim:
        edge = np.clip(1 - ndi.gaussian_filter(mask, 10) * 1.6, 0, 1) * (mask > 0.1)
        col = col * (1 - rim * edge[..., None]) + c0 * 0.35 * rim * edge[..., None]
    if grain and rng is not None:
        g = ndi.gaussian_filter(rng.standard_normal((h, w)).astype(np.float32), 1.4)
        col = col * (1 + g[..., None] * grain)

    alpha = np.clip(mask, 0, 1)
    if outline:
        dil = ndi.maximum_filter(mask, size=int(outline_px * 2 + 1))
        dil = ndi.gaussian_filter(dil, 1.2)
        ol = np.clip(dil - mask, 0, 1)
        col = col * (1 - ol[..., None]) + OUTLINE * ol[..., None]
        alpha = np.clip(np.maximum(alpha, dil), 0, 1)
    return np.dstack([np.clip(col, 0, 1), alpha])


def over(base, top):
    """base üstüne top'u (premultiplied olmayan RGBA float) bindirir."""
    ta = top[..., 3:4]
    ba = base[..., 3:4]
    out_a = ta + ba * (1 - ta)
    out_rgb = (top[..., :3] * ta + base[..., :3] * ba * (1 - ta)) / np.maximum(out_a, 1e-6)
    return np.dstack([out_rgb, out_a[..., 0]])


def blank():
    return np.zeros((S, S, 4), np.float32)


def add_highlight(img, cx, cy, rx, ry, rot=0.0, alpha=0.7, color=(1, 1, 1)):
    m = mask_ellipse(cx, cy, rx, ry, rot)
    m = ndi.gaussian_filter(m, 2.0)
    lay = np.dstack([np.broadcast_to(np.asarray(color, np.float32), (S, S, 3)), m * alpha])
    return over(img, lay)


def eye(img, cx, cy, r, look=(0.15, 0.1), pupil=0.55, color_iris=None, angry=0.0, inner=1):
    """Büyük çizgi film gözü. angry 0..1: üst kapak içe doğru çatılır (inner: +1 sağ taraf içte, -1 sol taraf içte)."""
    m = mask_ellipse(cx, cy, r, r * 1.05)
    white = layer(m, (1, 1, 1), (0.86, 0.91, 0.97), gloss=0.0, sigma=r * 0.4, outline_px=max(5, r * 0.16), rim=0.1)
    img = over(img, white)
    pr = r * pupil
    px, py = cx + look[0] * r, cy + look[1] * r
    pm = mask_ellipse(px, py, pr, pr * 1.08)
    iris = color_iris if color_iris is not None else (0.05, 0.06, 0.12)
    img = over(img, layer(pm, iris, iris, gloss=0.0, sigma=pr * 0.5, outline=False, rim=0.0))
    img = add_highlight(img, px - pr * 0.35, py - pr * 0.4, pr * 0.32, pr * 0.28, alpha=0.95)
    if angry:
        outer_y = cy - r * 0.95
        inner_y = cy - r * (0.95 - 1.25 * angry)
        ox, ix = cx - inner * r * 1.25, cx + inner * r * 1.25
        pts = [(ox, outer_y), (ix, inner_y), (ix, cy - r * 2.5), (ox, cy - r * 2.5)]
        bm = mask_poly(pts) * mask_ellipse(cx, cy, r * 1.04, r * 1.09)
        bm = ndi.gaussian_filter(bm, 0.8)
        img = over(img, np.dstack([np.broadcast_to(OUTLINE, (S, S, 3)), bm]))
        # kapak çizgisi
        lid = mask_stroke([(ox, outer_y), (ix, inner_y)], r * 0.16) * mask_ellipse(cx, cy, r * 1.1, r * 1.15)
        img = over(img, np.dstack([np.broadcast_to(OUTLINE, (S, S, 3)), lid]))
    return img


def rock_base(img, cx, cy, rx, ry, rng, base='#7b8794', dark='#46505c', light='#c2ccd6'):
    """Kuleyi taşıyan kaya kaide: koyu yan yüzey + aydınlık üst yüzey."""
    def blob(rx_, ry_, ox, oy, jitter):
        pts = []
        n = 11
        for i in range(n):
            a = 2 * math.pi * i / n
            r = 1 + (rng.random() - 0.5) * jitter
            pts.append((cx + ox + math.cos(a) * rx_ * r, cy + oy + math.sin(a) * ry_ * r))
        return mask_poly(smooth_closed(pts, 10))
    tex = ndi.gaussian_filter(rng.standard_normal((S, S)).astype(np.float32), 9)
    tex = (tex - tex.min()) / (tex.max() - tex.min())
    side = blob(rx, ry * 1.15, 0, 34, 0.16)
    img = over(img, layer(side, rgb(base), rgb(dark), angle=90, sigma=30, outline_px=11, texture=tex, gloss=0.0, rim=0.4))
    top = blob(rx * 0.9, ry * 0.8, 0, -10, 0.10)
    img = over(img, layer(top, rgb(light), rgb(base), angle=80, sigma=26, outline_px=8, texture=tex, gloss=0.2, rim=0.2))
    d = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    dd = ImageDraw.Draw(d)
    for _ in range(6):
        x0 = cx + rng.uniform(-rx * 0.75, rx * 0.75)
        y0 = cy + ry * 0.5 + rng.uniform(0, ry * 0.5)
        pts2 = [(x0, y0), (x0 + rng.uniform(-20, 20), y0 + rng.uniform(15, 30)), (x0 + rng.uniform(-30, 30), y0 + rng.uniform(30, 55))]
        dd.line(pts2, fill=(18, 24, 36, 150), width=5)
    dm = np.asarray(d).astype(np.float32) / 255.0
    dm[..., 3] *= (side > 0.5)
    return over(img, dm)


def finish(img, path):
    im = Image.fromarray((np.clip(img, 0, 1) * 255 + 0.5).astype(np.uint8), 'RGBA')
    im = im.resize((OUT_SIZE, OUT_SIZE), Image.LANCZOS)
    im.save(path)
    return im
