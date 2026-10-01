"""Harita arka planı üretimi için ortak araçlar (gürültü, yol maskesi, gölgeli nesneler).

Her şey numpy/scipy/PIL ile yapılır. Renkler 0..1 aralığında float RGB.
"""
import math
import os

import numpy as np
from PIL import Image, ImageDraw, ImageFilter
from scipy import ndimage as ndi

W, H = 1100, 900
SS = 3  # şekil çizerken süper örnekleme

ASSETS = os.path.join(os.path.dirname(__file__), '..', '..', 'src', 'main', 'resources', 'web', 'assets')


def rgb(hexstr):
    hexstr = hexstr.lstrip('#')
    return np.array([int(hexstr[i:i + 2], 16) / 255.0 for i in (0, 2, 4)], dtype=np.float32)


def lerp(a, b, t):
    return a + (b - a) * t


def smoothstep(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0 + 1e-9), 0, 1)
    return t * t * (3 - 2 * t)


# ------------------------------------------------------------------ yollar

def catmull(points, per=20):
    """js/core.js içindeki generateSmoothPath ile aynı eğri."""
    pts = [(float(x), float(y)) for x, y in points]
    out = []
    for i in range(len(pts) - 1):
        p0 = pts[max(0, i - 1)]
        p1 = pts[i]
        p2 = pts[i + 1]
        p3 = pts[min(len(pts) - 1, i + 2)]
        for j in range(per):
            t = j / per
            t2, t3 = t * t, t * t * t
            x = 0.5 * ((2 * p1[0]) + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3)
            y = 0.5 * ((2 * p1[1]) + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3)
            out.append((x, y))
    out.append(pts[-1])
    return out


def centerline_dist(paths, per=20):
    """Her piksel için en yakın yol merkez çizgisine uzaklık (px)."""
    img = Image.new('L', (W, H), 0)
    d = ImageDraw.Draw(img)
    for p in paths:
        pts = catmull(p, per)
        d.line(pts, fill=255, width=1)
    mask = np.asarray(img) > 0
    return ndi.distance_transform_edt(~mask).astype(np.float32), [catmull(p, per) for p in paths]


def polyline_length(pts):
    return sum(math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]) for i in range(1, len(pts)))


# ------------------------------------------------------------------ gürültü

def noise(h, w, sigma, rng, wrap=True):
    n = rng.standard_normal((h, w)).astype(np.float32)
    n = ndi.gaussian_filter(n, sigma, mode='wrap' if wrap else 'reflect')
    return n / (n.std() + 1e-6)


def fbm(h, w, sigma, rng, octaves=4, gain=0.5, wrap=False):
    """0..1 aralığında, ortalaması 0.5 olan çok katmanlı gürültü."""
    total = np.zeros((h, w), np.float32)
    amp, norm = 1.0, 0.0
    for o in range(octaves):
        total += noise(h, w, max(0.8, sigma / (2 ** o)), rng, wrap) * amp
        norm += amp
        amp *= gain
    total /= norm
    return np.clip(total * 0.28 + 0.5, 0, 1)


def ridged(h, w, sigma, rng, octaves=3, wrap=False):
    """İnce, ağ benzeri çizgiler (su altı ışık kırılması / çatlaklar için)."""
    total = np.zeros((h, w), np.float32)
    amp, norm = 1.0, 0.0
    for o in range(octaves):
        n = noise(h, w, max(0.8, sigma / (2 ** o)), rng, wrap)
        total += (1 - np.abs(n) * 1.1).clip(0, 1) ** 3 * amp
        norm += amp
        amp *= 0.55
    return (total / norm).clip(0, 1)


# ------------------------------------------------------------------ sahne

class Scene:
    def __init__(self, base):
        self.img = base.astype(np.float32).copy()

    def blend(self, color, alpha):
        """color: (3,) ya da (H,W,3); alpha: (H,W) ya da skaler."""
        a = alpha[..., None] if isinstance(alpha, np.ndarray) else alpha
        self.img = self.img * (1 - a) + np.asarray(color, np.float32) * a

    def add(self, color, amount):
        a = amount[..., None] if isinstance(amount, np.ndarray) else amount
        self.img = self.img + np.asarray(color, np.float32) * a

    def multiply(self, factor):
        f = factor[..., None] if isinstance(factor, np.ndarray) else factor
        self.img = self.img * f

    def stamp(self, patch, x, y, shadow=(5, 7, 5, 0.38, (0.0, 0.05, 0.1))):
        """RGBA yamayı (x,y) merkezli yerleştirir; gölgesini altına bırakır."""
        arr = np.asarray(patch).astype(np.float32) / 255.0
        pad = 16
        arr = np.pad(arr, ((pad, pad), (pad, pad), (0, 0)))
        ph, pw = arr.shape[:2]
        x0, y0 = int(round(x - pw / 2)), int(round(y - ph / 2))
        sx0, sy0 = max(0, -x0), max(0, -y0)
        ex, ey = min(pw, W - x0), min(ph, H - y0)
        if ex <= sx0 or ey <= sy0:
            return
        sub = arr[sy0:ey, sx0:ex]
        dx0, dy0 = x0 + sx0, y0 + sy0
        region = self.img[dy0:dy0 + sub.shape[0], dx0:dx0 + sub.shape[1]]
        if shadow:
            sdx, sdy, sblur, salpha, scol = shadow
            full_alpha = arr[..., 3]
            sh = ndi.gaussian_filter(full_alpha, sblur)
            sh = np.roll(np.roll(sh, int(sdy), axis=0), int(sdx), axis=1)[sy0:ey, sx0:ex]
            sa = (sh * salpha)[..., None]
            region[:] = region * (1 - sa) + np.asarray(scol, np.float32) * sa
        a = sub[..., 3:4]
        region[:] = region * (1 - a) + sub[..., :3] * a

    def save(self, path, quality=90):
        out = (np.clip(self.img, 0, 1) * 255 + 0.5).astype(np.uint8)
        Image.fromarray(out, 'RGB').save(path, quality=quality, subsampling=0)


def gradient_bg(top, bottom, left_bias=None):
    """Dikey renk geçişi; (H,W,3)."""
    t = np.linspace(0, 1, H, dtype=np.float32)[:, None, None]
    img = np.asarray(top, np.float32) * (1 - t) + np.asarray(bottom, np.float32) * t
    return np.broadcast_to(img, (H, W, 3)).copy()


# ------------------------------------------------------------------ şekiller

def blob_points(rng, cx, cy, rx, ry, n=11, jitter=0.22, rot=0.0):
    pts = []
    for i in range(n):
        a = 2 * math.pi * i / n
        r = 1 + (rng.random() - 0.5) * 2 * jitter
        x, y = math.cos(a) * rx * r, math.sin(a) * ry * r
        pts.append((cx + x * math.cos(rot) - y * math.sin(rot), cy + x * math.sin(rot) + y * math.cos(rot)))
    # kapalı Catmull-Rom ile yumuşat
    ring = pts + pts[:3]
    out = []
    for i in range(1, len(ring) - 2):
        p0, p1, p2, p3 = ring[i - 1], ring[i], ring[i + 1], ring[i + 2]
        for j in range(8):
            t = j / 8
            t2, t3 = t * t, t * t * t
            out.append((
                0.5 * ((2 * p1[0]) + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
                0.5 * ((2 * p1[1]) + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3)))
    return out


def new_mask(w, h):
    img = Image.new('L', (w * SS, h * SS), 0)
    return img, ImageDraw.Draw(img)


def mask_to_float(img, w, h):
    return np.asarray(img.resize((w, h), Image.LANCZOS)).astype(np.float32) / 255.0


def shade_patch(mask, base, light=(-0.6, -0.8), sigma=None, hi=None, lo=None, outline=None,
                outline_px=1.6, grain=0.0, rng=None, vgrad=None, rim=0.0):
    """Maskeden yumuşak ışıklı, ana hatlı RGBA yama üretir.

    mask   : (h,w) 0..1
    base   : tek renk (3,) ya da (h,w,3)
    vgrad  : (renk_üst, renk_alt) verilirse base yerine dikey geçiş kullanılır
    """
    h, w = mask.shape
    sigma = sigma or max(2.0, min(h, w) * 0.16)
    height = ndi.gaussian_filter(mask, sigma)
    gy, gx = np.gradient(height)
    mag = np.sqrt(gx * gx + gy * gy) + 1e-6
    lam = -(gx * light[0] + gy * light[1]) / mag      # -1..1
    strength = np.clip(mag / (mag.max() + 1e-6) * 3.0, 0, 1)
    shade = lam * strength

    if vgrad is not None:
        t = np.linspace(0, 1, h, dtype=np.float32)[:, None, None]
        col = np.asarray(vgrad[0], np.float32) * (1 - t) + np.asarray(vgrad[1], np.float32) * t
        col = np.broadcast_to(col, (h, w, 3)).copy()
    else:
        col = np.broadcast_to(np.asarray(base, np.float32), (h, w, 3)).copy()

    hi = np.asarray(hi if hi is not None else [1, 1, 1], np.float32)
    lo = np.asarray(lo if lo is not None else [0, 0.02, 0.08], np.float32)
    pos = np.clip(shade, 0, 1)[..., None]
    neg = np.clip(-shade, 0, 1)[..., None]
    col = col * (1 - 0.55 * neg) + lo * 0.55 * neg
    col = col * (1 - 0.35 * pos) + hi * 0.35 * pos * col.mean(-1, keepdims=True).clip(0.3, 1)
    # üst yüzey parlaması
    top = np.clip(height - 0.55, 0, 1) * 1.6
    col = col + (hi - col) * (top[..., None] * 0.12)
    if rim:
        edge = np.clip(1 - height * 2.2, 0, 1) * (mask > 0.1)
        col = col * (1 - rim * edge[..., None]) + lo * rim * edge[..., None]
    if grain and rng is not None:
        g = rng.standard_normal((h, w)).astype(np.float32)
        g = ndi.gaussian_filter(g, 0.9)
        col = col * (1 + g[..., None] * grain)

    alpha = np.clip(mask, 0, 1)
    if outline is not None:
        dil = ndi.maximum_filter(mask, size=int(outline_px * 2 + 1))
        dil = ndi.gaussian_filter(dil, 0.6)
        ol = np.clip(dil - mask, 0, 1)
        ocol = np.asarray(outline, np.float32)
        col = col * (1 - ol[..., None]) + ocol * ol[..., None]
        alpha = np.clip(np.maximum(alpha, dil), 0, 1)
    rgba = np.dstack([np.clip(col, 0, 1), alpha])
    return Image.fromarray((rgba * 255 + 0.5).astype(np.uint8), 'RGBA')


def draw_mask_patch(w, h, draw_fn):
    """draw_fn(draw, scale) ile süper örneklemeli maske çizer, float döner."""
    img, d = new_mask(w, h)
    draw_fn(d, SS)
    return mask_to_float(img, w, h)


# ------------------------------------------------------------------ tekrar kullanılan öğeler

def pebble_patch(rng, size, base, outline=(0.05, 0.08, 0.12)):
    w = int(size * 2.4) + 8
    h = int(size * 1.8) + 8
    pts = blob_points(rng, w / 2, h / 2, size, size * 0.72, n=8, jitter=0.12, rot=rng.random() * 3)
    m = draw_mask_patch(w, h, lambda d, s: d.polygon([(x * s, y * s) for x, y in pts], fill=255))
    b = np.asarray(base, np.float32) * (0.85 + rng.random() * 0.3)
    return shade_patch(m, b, sigma=max(1.5, size * 0.5), outline=outline, outline_px=1.2, rng=rng, grain=0.03)


def scatter_points(rng, count, avoid, min_dist, margin=30, max_tries=40, bounds=None, weights=None):
    """Poisson-benzeri dağıtım. avoid: (H,W) bool, True olan yerlere konmaz."""
    pts = []
    x0, y0, x1, y1 = bounds or (margin, margin, W - margin, H - margin)
    tries = 0
    while len(pts) < count and tries < count * max_tries:
        tries += 1
        x = rng.uniform(x0, x1)
        y = rng.uniform(y0, y1)
        if avoid[int(min(H - 1, y)), int(min(W - 1, x))]:
            continue
        if weights is not None and rng.random() > weights[int(min(H - 1, y)), int(min(W - 1, x))]:
            continue
        if all((x - px) ** 2 + (y - py) ** 2 > min_dist ** 2 for px, py in pts):
            pts.append((x, y))
    return pts


def vignette(strength=0.35, power=2.2):
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    d = np.sqrt(((xx - W / 2) / (W / 2)) ** 2 + ((yy - H / 2) / (H / 2)) ** 2)
    return 1 - strength * np.clip(d - 0.35, 0, 1.2) ** power


def suggest_spots(dc, paths_pts, n, min_gap=118, near=(76, 170), margin=62, range_px=205, exclude=None):
    """Yola menzil verme uzunluğuna göre açgözlü kule yeri önerisi (düzenlemek için başlangıç)."""
    samples = []
    for pts in paths_pts:
        acc = 0.0
        for i in range(1, len(pts)):
            seg = math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1])
            samples.append((pts[i][0], pts[i][1], seg))
    sx = np.array([s[0] for s in samples])
    sy = np.array([s[1] for s in samples])
    sl = np.array([s[2] for s in samples])
    chosen = []
    covered = np.zeros(len(samples), bool)
    cand = []
    for y in range(margin, H - margin, 12):
        for x in range(margin, W - margin, 12):
            if near[0] <= dc[y, x] <= near[1] and (exclude is None or not exclude[y, x]):
                cand.append((x, y))
    cand_arr = np.array(cand)
    # her adayın kapsadığı örnekler
    cover = [np.hypot(sx - cx, sy - cy) <= range_px for cx, cy in cand]
    while len(chosen) < n and cand:
        best, best_score = None, -1
        for k, (cx, cy) in enumerate(cand):
            if any(math.hypot(cx - ox, cy - oy) < min_gap for ox, oy in chosen):
                continue
            gain = (sl * (cover[k] & ~covered)).sum() + 0.15 * (sl * cover[k]).sum()
            if gain > best_score:
                best, best_score = k, gain
        if best is None:
            break
        chosen.append(cand[best])
        covered |= cover[best]
    return chosen
