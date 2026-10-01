"""Haritalar arasında paylaşılan çizim adımları."""
import math

import numpy as np
from PIL import Image, ImageDraw

import common as C
import props as P
from common import H, W, rgb, smoothstep


def disk(avoid, x, y, r):
    y0, y1 = max(0, int(y - r)), min(H, int(y + r) + 1)
    x0, x1 = max(0, int(x - r)), min(W, int(x + r) + 1)
    yy, xx = np.mgrid[y0:y1, x0:x1]
    avoid[y0:y1, x0:x1] |= (xx - x) ** 2 + (yy - y) ** 2 <= r * r


def caustics_layer(rng, strength=0.22, scale=26, color=(1, 1, 1), depth=None):
    """Sabit (pişirilmiş) ışık ağı. depth: 0..1, 1 = derin (daha az ışık)."""
    a = C.ridged(H, W, scale, rng, 3)
    b = C.ridged(H, W, scale * 1.7, rng, 2)
    c = np.clip(a * 0.7 + b * 0.5, 0, 1) ** 1.6
    if depth is not None:
        c = c * (1 - depth * 0.7)
    return c * strength


def paint_path(sc, dc, rng, hw=38, wobble=4.5, sand=('#e9cb8e', '#cfa766'), edge_shadow=0.30,
               fringe=None, rim_light=0.10, glow=None, pebble_col=None, center_light=0.10):
    """Yolu (kumlu patika) çizer.

    fringe : {'colors': (a, b), 'width': px, 'alpha': 0..1} yosun/yosunlu kenar
    glow   : {'color': rgb, 'strength': x} yol ortasında parlayan çatlaklar
    """
    wob = (C.fbm(H, W, 22, rng, 3) - 0.5) * 2
    d = dc - (hw + wob * wobble)

    sh = smoothstep(16, 0, d) * (d > -2)
    sc.multiply(1 - sh * edge_shadow)

    if fringe:
        fw = fringe['width']
        n1 = C.fbm(H, W, 9, rng, 3)
        n2 = C.fbm(H, W, 3, rng, 2)
        band = smoothstep(0.0, 3.0, fw * (0.45 + 1.0 * n1) - d) * (d > -4)
        ca, cb = rgb(fringe['colors'][0]), rgb(fringe['colors'][1])
        mix = np.clip(n2 * 1.4 - 0.2 + (n1 - 0.5) * 0.8, 0, 1)[..., None]
        col = ca * (1 - mix) + cb * mix
        spec = (C.noise(H, W, 1.1, rng) > 1.3).astype(np.float32)[..., None]
        col = col * (1 - 0.35 * spec) + np.array([0.04, 0.1, 0.06], np.float32) * 0.35 * spec
        sc.blend(col, band * fringe.get('alpha', 0.95))

    inside = smoothstep(1.4, -1.4, d)
    s_light, s_dark = rgb(sand[0]), rgb(sand[1])
    t = np.clip(C.fbm(H, W, 15, rng, 3) * 1.6 - 0.3, 0, 1)
    fine = C.fbm(H, W, 2.2, rng, 2)
    col = s_dark[None, None, :] * (1 - t[..., None]) + s_light[None, None, :] * t[..., None]
    col = col * (0.88 + 0.24 * fine[..., None])
    center = np.clip(1 - dc / hw, 0, 1) ** 1.3
    col = col + center[..., None] * center_light
    rim = smoothstep(7, 0, -d) * (d < 0) * smoothstep(-0.5, 2.5, -d)
    col = col + rim[..., None] * rim_light
    inner_sh = smoothstep(5, 0, -d) * (d < 0) * 0.16
    col = col * (1 - inner_sh[..., None])
    sc.blend(col, inside)

    if glow:
        cr = C.ridged(H, W, 9, rng, 3)
        g = (cr ** 2.4) * smoothstep(hw * 0.95, hw * 0.1, dc) * inside * glow['strength']
        sc.add(glow['color'], g)
        core = smoothstep(hw * 0.5, 0, dc) * inside * glow.get('core', 0.0)
        sc.add(glow['color'], core * 0.5)

    return d, inside


def path_pebbles(sc, rng, dc, hw, base, count=140, size=(1.6, 4.4)):
    inner = dc > hw * 0.15
    avoid = ~((dc < hw * 0.9) & inner)
    pts = C.scatter_points(rng, count, avoid, 9)
    for x, y in sorted(pts, key=lambda p: p[1]):
        pb = P.pebble(rng, rng.uniform(*size), np.asarray(base) * rng.uniform(0.8, 1.15))
        sc.stamp(pb, x, y, shadow=(1, 2, 1.5, 0.3, (0.1, 0.07, 0.03)))
    edge = (dc > hw * 0.82) & (dc < hw * 1.05)
    pts = C.scatter_points(rng, count // 2, ~edge, 8)
    for x, y in sorted(pts, key=lambda p: p[1]):
        pb = P.pebble(rng, rng.uniform(2.4, 6.2), np.asarray(base) * rng.uniform(0.7, 1.05))
        sc.stamp(pb, x, y, shadow=(2, 3, 2, 0.4, (0.05, 0.05, 0.05)))


def spot_pads(sc, rng, spots, base, ring, high_base=None):
    """Kule yerlerinin altına düz bir taş/kum zemin çizer."""
    for x, y, kind in spots:
        high = kind == 'high'
        rx, ry = (46, 40) if not high else (50, 44)
        w, h = int(rx * 2.6), int(ry * 2.6)
        m = C.draw_mask_patch(w, h, lambda d, s: d.ellipse([(w / 2 - rx) * s, (h / 2 - ry) * s, (w / 2 + rx) * s, (h / 2 + ry) * s], fill=255))
        b = rgb(high_base) if (high and high_base) else rgb(base)
        var = C.fbm(h, w, 8, rng, 3)
        col = b[None, None, :] * (0.88 + 0.22 * var[..., None])
        patch = C.shade_patch(m, col, light=(-0.5, -0.8), sigma=11, outline=np.array([0.10, 0.16, 0.18]), outline_px=1.4, rng=rng, grain=0.05, rim=0.12)
        sc.stamp(patch, x, y + 4, shadow=(3, 8, 5, 0.40, (0.02, 0.05, 0.08)))
        if high:
            # yüksek zemin: taş kenar ve altın kabartma
            for i in range(14):
                a = i * 2 * math.pi / 14 + rng.uniform(-0.1, 0.1)
                px, py = x + math.cos(a) * (rx + 3), y + 4 + math.sin(a) * (ry + 3)
                sc.stamp(P.pebble(rng, rng.uniform(4, 7), rgb(ring)), px, py, shadow=(2, 3, 2, 0.4, (0.05, 0.05, 0.05)))
        else:
            for i in range(9):
                a = i * 2 * math.pi / 9 + rng.uniform(-0.2, 0.2)
                px, py = x + math.cos(a) * (rx - 4), y + 4 + math.sin(a) * (ry - 4)
                sc.stamp(P.pebble(rng, rng.uniform(2.5, 4.5), rgb(ring)), px, py, shadow=(1, 2, 1.5, 0.3, (0.05, 0.05, 0.05)))


def sprinkle(sc, rng, factory, count, avoid, min_dist, shadow=(5, 7, 5, 0.38, (0.0, 0.05, 0.1)),
             bounds=None, weights=None, block=None, keepout=None):
    """factory(rng) -> RGBA yama. Noktaları avoid maskesine işler.

    keepout: yalnızca bu çağrı için ek yasak alan (büyük nesnelerin kule yerlerine taşmaması için).
    """
    pts = C.scatter_points(rng, count, avoid if keepout is None else (avoid | keepout), min_dist, bounds=bounds, weights=weights)
    placed = []
    for x, y in sorted(pts, key=lambda p: p[1]):
        patch = factory(rng)
        sc.stamp(patch, x, y, shadow=shadow)
        disk(avoid, x, y, block if block is not None else min_dist * 0.5)
        placed.append((x, y))
    return placed


def edge_weights(power=1.4, floor=0.12):
    """Kenarlara doğru artan ağırlık: nesneler haritayı çerçevelesin, orta alan sade kalsın."""
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    d = np.sqrt(((xx - W / 2) / (W / 2)) ** 2 + ((yy - H / 2) / (H / 2)) ** 2)
    return np.clip(floor + (d / 1.3) ** power, 0, 1)


def finish(sc, rng, vig=0.38, grain=0.014, sat=1.12, contrast=1.05, tint=None):
    img = sc.img
    if tint is not None:
        img = img * np.asarray(tint, np.float32)
    lum = img.mean(-1, keepdims=True)
    img = lum + (img - lum) * sat
    img = (img - 0.5) * contrast + 0.5
    img = img * C.vignette(vig)[..., None]
    g = rng.standard_normal((H, W)).astype(np.float32)
    img = img + g[..., None] * grain
    sc.img = np.clip(img, 0, 1)
