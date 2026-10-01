"""Mevcut köpek balığı sprite'ından yavru ve kral varyantlarını üretir.

    python tools/sprite_varyant.py

Çıktı: src/main/resources/web/assets/enemy_pup.png, enemy_king.png
"""
import colorsys
import os

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ASSETS = os.path.join(os.path.dirname(__file__), '..', 'src', 'main', 'resources', 'web', 'assets')


def shift_hue(img, hue_shift, sat_mul=1.0, val_mul=1.0, only_blue=True, sat_min=0.25):
    """Mavi tonlu pikselleri başka bir renge kaydırır, gözleri ve dişleri (sarı/beyaz/kırmızı) korur."""
    arr = np.asarray(img.convert('RGBA')).astype(np.float32) / 255.0
    rgb = arr[..., :3]
    mx = rgb.max(-1)
    mn = rgb.min(-1)
    delta = mx - mn
    h = np.zeros_like(mx)
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    mask = delta > 1e-6
    rc = np.where(mask, (mx - r) / np.where(mask, delta, 1), 0)
    gc = np.where(mask, (mx - g) / np.where(mask, delta, 1), 0)
    bc = np.where(mask, (mx - b) / np.where(mask, delta, 1), 0)
    h = np.where(mx == r, bc - gc, np.where(mx == g, 2.0 + rc - bc, 4.0 + gc - rc))
    h = (h / 6.0) % 1.0
    s = np.where(mx > 0, delta / np.where(mx > 0, mx, 1), 0)
    v = mx

    # sadece mavi/camgöbeği aralığındaki, yeterince doygun pikseller
    blue = (h > 0.45) & (h < 0.72) & (s > sat_min)
    sel = blue if only_blue else (s > sat_min)
    h2 = np.where(sel, (h + hue_shift) % 1.0, h)
    s2 = np.where(sel, np.clip(s * sat_mul, 0, 1), s)
    v2 = np.where(sel, np.clip(v * val_mul, 0, 1), v)

    out = np.zeros_like(rgb)
    i = np.floor(h2 * 6).astype(int) % 6
    f = h2 * 6 - np.floor(h2 * 6)
    p = v2 * (1 - s2)
    q = v2 * (1 - f * s2)
    t = v2 * (1 - (1 - f) * s2)
    choices = [(v2, t, p), (q, v2, p), (p, v2, t), (p, q, v2), (t, p, v2), (v2, p, q)]
    for k, (cr, cg, cb) in enumerate(choices):
        m = i == k
        out[..., 0] = np.where(m, cr, out[..., 0])
        out[..., 1] = np.where(m, cg, out[..., 1])
        out[..., 2] = np.where(m, cb, out[..., 2])
    res = np.concatenate([out, arr[..., 3:4]], axis=-1)
    return Image.fromarray((res * 255).astype(np.uint8), 'RGBA')


def crown(img, cx, cy, w, tilt):
    """Altın taç çizer (4x süper örnekleme ile)."""
    S = 4
    layer = Image.new('RGBA', (img.width * S, img.height * S), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    h = w * 0.7
    x0, y0 = (cx - w / 2) * S, (cy - h / 2) * S
    pts = [(0, h), (0, h * 0.25), (w * 0.2, h * 0.6), (w * 0.35, 0), (w * 0.5, h * 0.55),
           (w * 0.65, 0), (w * 0.8, h * 0.6), (w, h * 0.25), (w, h)]
    pts = [(x0 + px * S, y0 + py * S) for px, py in pts]
    d.polygon(pts, fill=(255, 205, 40, 255), outline=(110, 60, 0, 255))
    d.line(pts + [pts[0]], fill=(110, 60, 0, 255), width=int(5 * S / 2))
    # taban bandı ve mücevherler
    d.rectangle([x0, y0 + h * 0.78 * S, x0 + w * S, y0 + h * S], fill=(235, 170, 20, 255), outline=(110, 60, 0, 255), width=int(4 * S / 2))
    for fx, col in ((0.25, (230, 50, 70, 255)), (0.5, (60, 170, 255, 255)), (0.75, (230, 50, 70, 255))):
        r = w * 0.055 * S
        px, py = x0 + w * fx * S, y0 + h * 0.89 * S
        d.ellipse([px - r, py - r, px + r, py + r], fill=col, outline=(90, 40, 0, 255), width=2)
    layer = layer.rotate(tilt, center=(cx * S, cy * S), resample=Image.BICUBIC)
    layer = layer.resize(img.size, Image.LANCZOS)
    return Image.alpha_composite(img, layer)


def main():
    shark = Image.open(os.path.join(ASSETS, 'enemy_shark.png')).convert('RGBA')

    pup = shift_hue(shark, hue_shift=-0.49, sat_mul=1.0, val_mul=1.25)
    pup.save(os.path.join(ASSETS, 'enemy_pup.png'))

    king = shift_hue(shark, hue_shift=0.30, sat_mul=1.0, val_mul=0.85)
    king = crown(king, 150, 150, 150, -16)
    king.save(os.path.join(ASSETS, 'enemy_king.png'))
    print('enemy_pup.png ve enemy_king.png yazildi')


if __name__ == '__main__':
    main()
