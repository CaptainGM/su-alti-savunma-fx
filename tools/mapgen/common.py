"""Harita arka planı üretimi için ortak araçlar.

Tüm uzunluklar "mantıksal" birimdedir (oyundaki 1350x900 tuval). Diziler K kat çözünürlükte (varsayılan 2x → 2700x1800)
üretilir, böylece geniş ekranlarda da keskin görünür. Fonksiyonlar mantıksal boyut alır, dizileri K katı döndürür.
"""
import math
import os

import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage as ndi

K = int(os.environ.get('MAPGEN_K', '2'))
W, H = 1350, 900
PW, PH = W * K, H * K
SS = 3  # şekil çizerken süper örnekleme (K'ya ek)
SX = 1350 / 1100  # eski 1100 genişlikli yerleşimleri yeni tuvale oturtmak için

ASSETS = os.path.join(os.path.dirname(__file__), '..', '..', 'src', 'main', 'resources', 'web', 'assets')


def rgb(hexstr):
    hexstr = hexstr.lstrip('#')
    return np.array([int(hexstr[i:i + 2], 16) / 255.0 for i in (0, 2, 4)], dtype=np.float32)


def lerp(a, b, t):
    return a + (b - a) * t


def smoothstep(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0 + 1e-9), 0, 1)
    return t * t * (3 - 2 * t)


def X(x):
    """Eski (1100 geniş) x koordinatını yeni tuvale ölçekler."""
    return int(round(x * SX))


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
    """Her piksel için en yakın yol merkez çizgisine uzaklık (mantıksal birim), PHxPW."""
    img = Image.new('L', (PW, PH), 0)
    d = ImageDraw.Draw(img)
    smooth = [catmull(p, per) for p in paths]
    for pts in smooth:
        d.line([(x * K, y * K) for x, y in pts], fill=255, width=1)
    mask = np.asarray(img) > 0
    dc = ndi.distance_transform_edt(~mask).astype(np.float32) / K
    return dc, smooth


def polyline_length(pts):
    return sum(math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]) for i in range(1, len(pts)))


# ------------------------------------------------------------------ dizi yardımcıları

def logic(a):
    """PHxPW diziyi yerleşim mantığı için HxW'ye indirger."""
    return a[K // 2::K, K // 2::K][:H, :W]


def grid():
    """Mantıksal koordinatlı (yy, xx) ızgarası, PHxPW."""
    yy = ((np.arange(PH, dtype=np.float32) + 0.5) / K)[:, None] * np.ones((1, PW), np.float32)
    xx = ((np.arange(PW, dtype=np.float32) + 0.5) / K)[None, :] * np.ones((PH, 1), np.float32)
    return yy, xx


def blur(a, sigma):
    """Mantıksal sigma ile bulanıklaştırır; büyük sigmalar için düşük çözünürlükte çalışır."""
    sp = sigma * K
    if sp <= 10:
        return ndi.gaussian_filter(a, sp)
    f = int(2 ** math.floor(math.log2(sp / 4)))
    small = a[::f, ::f] if a.ndim == 2 else a[::f, ::f, ...]
    small = ndi.gaussian_filter(small, sp / f)
    zoom = (a.shape[0] / small.shape[0], a.shape[1] / small.shape[1]) + ((1,) if a.ndim == 3 else ())
    return ndi.zoom(small, zoom, order=1)[:a.shape[0], :a.shape[1]]


def noise(h, w, sigma, rng, wrap=True):
    """Gauss gürültüsü; (h, w) ve sigma mantıksal birimde. Çıktı std=1."""
    ph, pw = int(round(h * K)), int(round(w * K))
    sp = max(0.8, sigma * K)
    f = int(2 ** math.floor(math.log2(max(1.0, sp / 3.0))))
    ch, cw = max(4, -(-ph // f)), max(4, -(-pw // f))
    n = rng.standard_normal((ch, cw)).astype(np.float32)
    n = ndi.gaussian_filter(n, sp / f, mode='wrap' if wrap else 'reflect')
    if f > 1 or (ch, cw) != (ph, pw):
        n = ndi.zoom(n, (ph / ch, pw / cw), order=3 if f > 1 else 1)[:ph, :pw]
        if n.shape != (ph, pw):
            n = np.pad(n, ((0, ph - n.shape[0]), (0, pw - n.shape[1])), mode='edge')
    return n / (n.std() + 1e-6)


def fbm(h, w, sigma, rng, octaves=4, gain=0.5, wrap=False):
    """0..1 aralığında, ortalaması 0.5 olan çok katmanlı gürültü."""
    total = None
    amp, norm = 1.0, 0.0
    for o in range(octaves):
        n = noise(h, w, max(0.5, sigma / (2 ** o)), rng, wrap) * amp
        total = n if total is None else total + n
        norm += amp
        amp *= gain
    total /= norm
    return np.clip(total * 0.28 + 0.5, 0, 1).astype(np.float32)


def ridged(h, w, sigma, rng, octaves=3, wrap=False):
    """İnce, ağ benzeri çizgiler (ışık kırılması / çatlaklar için)."""
    total = None
    amp, norm = 1.0, 0.0
    for o in range(octaves):
        n = noise(h, w, max(0.5, sigma / (2 ** o)), rng, wrap)
        v = (1 - np.abs(n) * 1.1).clip(0, 1) ** 3 * amp
        total = v if total is None else total + v
        norm += amp
        amp *= 0.55
    return (total / norm).clip(0, 1).astype(np.float32)


# ------------------------------------------------------------------ sahne

class Scene:
    def __init__(self, base):
        self.img = base.astype(np.float32).copy()

    def blend(self, color, alpha):
        """color: (3,) ya da (PH,PW,3); alpha: (PH,PW) ya da skaler."""
        a = alpha[..., None] if isinstance(alpha, np.ndarray) else alpha
        self.img = self.img * (1 - a) + np.asarray(color, np.float32) * a

    def add(self, color, amount):
        a = amount[..., None] if isinstance(amount, np.ndarray) else amount
        self.img = self.img + np.asarray(color, np.float32) * a

    def multiply(self, factor):
        f = factor[..., None] if isinstance(factor, np.ndarray) else factor
        self.img = self.img * f

    def stamp(self, patch, x, y, shadow=(5, 7, 5, 0.38, (0.0, 0.05, 0.1))):
        """RGBA yamayı (x,y) (mantıksal) merkezli yerleştirir; gölge parametreleri mantıksal birimdedir."""
        arr = np.asarray(patch).astype(np.float32) / 255.0
        pad = 16 * K
        arr = np.pad(arr, ((pad, pad), (pad, pad), (0, 0)))
        ph, pw = arr.shape[:2]
        x0, y0 = int(round(x * K - pw / 2)), int(round(y * K - ph / 2))
        sx0, sy0 = max(0, -x0), max(0, -y0)
        ex, ey = min(pw, PW - x0), min(ph, PH - y0)
        if ex <= sx0 or ey <= sy0:
            return
        sub = arr[sy0:ey, sx0:ex]
        dx0, dy0 = x0 + sx0, y0 + sy0
        region = self.img[dy0:dy0 + sub.shape[0], dx0:dx0 + sub.shape[1]]
        if shadow:
            sdx, sdy, sblur, salpha, scol = shadow
            sh = ndi.gaussian_filter(arr[..., 3], sblur * K)
            sh = np.roll(np.roll(sh, int(sdy * K), axis=0), int(sdx * K), axis=1)[sy0:ey, sx0:ex]
            sa = (sh * salpha)[..., None]
            region[:] = region * (1 - sa) + np.asarray(scol, np.float32) * sa
        a = sub[..., 3:4]
        region[:] = region * (1 - a) + sub[..., :3] * a

    def save(self, path, quality=88):
        out = (np.clip(self.img, 0, 1) * 255 + 0.5).astype(np.uint8)
        Image.fromarray(out, 'RGB').save(path, quality=quality, subsampling=0, optimize=True)


def gradient_bg(top, bottom):
    t = np.linspace(0, 1, PH, dtype=np.float32)[:, None, None]
    img = np.asarray(top, np.float32) * (1 - t) + np.asarray(bottom, np.float32) * t
    return np.broadcast_to(img, (PH, PW, 3)).copy()


# ------------------------------------------------------------------ şekil çizimi (PIL)

class SSCanvas:
    """Mantıksal koordinatlarla çizilen, süper örneklemeli RGBA yama. Kullanım:
        c = SSCanvas(w, h); c.d.ellipse([x*c.s ...]); patch = c.finish()
    """

    def __init__(self, w, h):
        self.w, self.h = w, h
        self.s = SS * K
        self.img = Image.new('RGBA', (int(w * self.s), int(h * self.s)), (0, 0, 0, 0))
        self.d = ImageDraw.Draw(self.img)

    def finish(self):
        return self.img.resize((int(self.w * K), int(self.h * K)), Image.LANCZOS)


def mask_patch(w, h, draw_fn):
    """draw_fn(draw, s): koordinatlar mantıksal * s. Çıktı float (h*K, w*K)."""
    s = SS * K
    img = Image.new('L', (int(w * s), int(h * s)), 0)
    draw_fn(ImageDraw.Draw(img), s)
    img = img.resize((int(w * K), int(h * K)), Image.LANCZOS)
    return np.asarray(img).astype(np.float32) / 255.0


def blob_points(rng, cx, cy, rx, ry, n=11, jitter=0.22, rot=0.0):
    pts = []
    for i in range(n):
        a = 2 * math.pi * i / n
        r = 1 + (rng.random() - 0.5) * 2 * jitter
        x, y = math.cos(a) * rx * r, math.sin(a) * ry * r
        pts.append((cx + x * math.cos(rot) - y * math.sin(rot), cy + x * math.sin(rot) + y * math.cos(rot)))
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


def patch_grid(mask):
    """Yama dizisi için mantıksal koordinatlı ızgara."""
    ph, pw = mask.shape[:2]
    yy = ((np.arange(ph, dtype=np.float32) + 0.5) / K)[:, None] * np.ones((1, pw), np.float32)
    xx = ((np.arange(pw, dtype=np.float32) + 0.5) / K)[None, :] * np.ones((ph, 1), np.float32)
    return yy, xx


def shade_patch(mask, base, light=(-0.6, -0.8), sigma=None, hi=None, lo=None, outline=None,
                outline_px=1.6, grain=0.0, rng=None, vgrad=None, rim=0.0):
    """Maskeden yumuşak ışıklı, ana hatlı RGBA yama (PIL) üretir. sigma/outline_px mantıksal birimdedir.

    mask  : (ph,pw) 0..1
    base  : tek renk (3,) ya da (ph,pw,3)
    vgrad : (renk_üst, renk_alt) verilirse dikey geçiş kullanılır
    """
    ph, pw = mask.shape
    sigma = (sigma if sigma is not None else max(2.0, min(ph, pw) / K * 0.16)) * K
    height = ndi.gaussian_filter(mask, sigma)
    gy, gx = np.gradient(height)
    mag = np.sqrt(gx * gx + gy * gy) + 1e-9
    lam = -(gx * light[0] + gy * light[1]) / mag
    strength = np.clip(mag / (mag.max() + 1e-9) * 3.0, 0, 1)
    shade = lam * strength

    if vgrad is not None:
        t = np.linspace(0, 1, ph, dtype=np.float32)[:, None, None]
        col = np.asarray(vgrad[0], np.float32) * (1 - t) + np.asarray(vgrad[1], np.float32) * t
        col = np.broadcast_to(col, (ph, pw, 3)).copy()
    else:
        col = np.broadcast_to(np.asarray(base, np.float32), (ph, pw, 3)).copy()

    hi = np.asarray(hi if hi is not None else [1, 1, 1], np.float32)
    lo = np.asarray(lo if lo is not None else [0, 0.02, 0.08], np.float32)
    pos = np.clip(shade, 0, 1)[..., None]
    neg = np.clip(-shade, 0, 1)[..., None]
    col = col * (1 - 0.55 * neg) + lo * 0.55 * neg
    col = col * (1 - 0.35 * pos) + hi * 0.35 * pos * col.mean(-1, keepdims=True).clip(0.3, 1)
    top = np.clip(height - 0.55, 0, 1) * 1.6
    col = col + (hi - col) * (top[..., None] * 0.12)
    if rim:
        edge = np.clip(1 - height * 2.2, 0, 1) * (mask > 0.1)
        col = col * (1 - rim * edge[..., None]) + lo * rim * edge[..., None]
    if grain and rng is not None:
        g = rng.standard_normal((ph, pw)).astype(np.float32)
        g = ndi.gaussian_filter(g, 0.9 * K)
        col = col * (1 + g[..., None] * grain)

    alpha = np.clip(mask, 0, 1)
    if outline is not None:
        size = int(outline_px * K * 2 + 1)
        dil = ndi.maximum_filter(mask, size=size)
        dil = ndi.gaussian_filter(dil, 0.6 * K)
        ol = np.clip(dil - mask, 0, 1)
        ocol = np.asarray(outline, np.float32)
        col = col * (1 - ol[..., None]) + ocol * ol[..., None]
        alpha = np.clip(np.maximum(alpha, dil), 0, 1)
    rgba = np.dstack([np.clip(col, 0, 1), alpha])
    return Image.fromarray((rgba * 255 + 0.5).astype(np.uint8), 'RGBA')


def pebble_patch(rng, size, base, outline=(0.05, 0.08, 0.12)):
    w = int(size * 2.4) + 8
    h = int(size * 1.8) + 8
    pts = blob_points(rng, w / 2, h / 2, size, size * 0.72, n=8, jitter=0.12, rot=rng.random() * 3)
    m = mask_patch(w, h, lambda d, s: d.polygon([(x * s, y * s) for x, y in pts], fill=255))
    b = np.asarray(base, np.float32) * (0.85 + rng.random() * 0.3)
    return shade_patch(m, b, sigma=max(1.5, size * 0.5), outline=outline, outline_px=1.2, rng=rng, grain=0.03)


def scatter_points(rng, count, avoid, min_dist, margin=30, max_tries=40, bounds=None, weights=None):
    """Poisson-benzeri dağıtım. avoid: (H,W) bool (mantıksal), True olan yerlere konmaz."""
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
    yy, xx = grid()
    d = np.sqrt(((xx - W / 2) / (W / 2)) ** 2 + ((yy - H / 2) / (H / 2)) ** 2)
    return 1 - strength * np.clip(d - 0.35, 0, 1.2) ** power


def suggest_spots(dc, paths_pts, n, min_gap=118, near=(76, 170), margin=62, range_px=205, exclude=None):
    """Yola menzil verme uzunluğuna göre açgözlü kule yeri önerisi (düzenlemek için başlangıç)."""
    dc1 = logic(dc)
    samples = []
    for pts in paths_pts:
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
            if near[0] <= dc1[y, x] <= near[1] and (exclude is None or not exclude[y, x]):
                cand.append((x, y))
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
