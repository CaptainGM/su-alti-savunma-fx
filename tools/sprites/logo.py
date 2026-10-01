"""Uygulama simgesi ve menü logosu: dalga rozetinin içinde ahtapot.

    python tools/sprites/logo.py
"""
import math
import os

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
ASSETS = os.path.join(HERE, '..', '..', 'src', 'main', 'resources', 'web', 'assets')
N = 1024


def build():
    yy, xx = np.mgrid[0:N, 0:N].astype(np.float32)
    d = np.sqrt((xx - N / 2) ** 2 + (yy - N / 2 - 30) ** 2) / (N / 2)
    c_in = np.array([0.20, 0.82, 0.88], np.float32)
    c_mid = np.array([0.05, 0.42, 0.78], np.float32)
    c_out = np.array([0.02, 0.14, 0.40], np.float32)
    t = np.clip(d, 0, 1)[..., None]
    col = np.where(t < 0.55, c_in + (c_mid - c_in) * (t / 0.55), c_mid + (c_out - c_mid) * ((t - 0.55) / 0.45))
    # ışık huzmeleri
    rays = np.sin(np.arctan2(yy - N / 2, xx - N / 2) * 7 + 0.6) * 0.5 + 0.5
    col = col + (rays[..., None] * 0.06) * np.clip(1 - d, 0, 1)[..., None]
    img = Image.fromarray((np.clip(col, 0, 1) * 255).astype(np.uint8), 'RGB').convert('RGBA')

    # daire rozet maskesi
    mask = Image.new('L', (N * 2, N * 2), 0)
    ImageDraw.Draw(mask).ellipse([30 * 2, 30 * 2, (N - 30) * 2, (N - 30) * 2], fill=255)
    mask = mask.resize((N, N), Image.LANCZOS)

    # dalga çizgileri
    wave = Image.new('RGBA', (N, N), (0, 0, 0, 0))
    wd = ImageDraw.Draw(wave)
    for k, (y0, a) in enumerate(((760, 110), (810, 80), (860, 55))):
        pts = [(x, y0 + math.sin(x / 85.0 + k) * 20) for x in range(0, N + 1, 8)]
        wd.line(pts, fill=(255, 255, 255, a), width=14, joint='curve')
    img.alpha_composite(wave)

    # ahtapot
    octo = Image.open(os.path.join(ASSETS, 'tower_octopus.png')).convert('RGBA').resize((640, 640), Image.LANCZOS)
    shadow = Image.new('RGBA', (N, N), (0, 0, 0, 0))
    sh = Image.new('RGBA', (640, 640), (0, 0, 20, 0))
    sh.putalpha(octo.split()[3].point(lambda v: int(v * 0.5)))
    shadow.alpha_composite(sh, (N // 2 - 320 + 10, N // 2 - 310 + 22))
    shadow = shadow.filter(ImageFilter.GaussianBlur(14))
    img.alpha_composite(shadow)
    img.alpha_composite(octo, (N // 2 - 320, N // 2 - 330))

    # kabarcıklar
    bub = Image.new('RGBA', (N, N), (0, 0, 0, 0))
    bd = ImageDraw.Draw(bub)
    for x, y, r in ((200, 300, 34), (260, 210, 20), (800, 260, 28), (850, 360, 16), (720, 170, 14), (150, 440, 14)):
        bd.ellipse([x - r, y - r, x + r, y + r], outline=(255, 255, 255, 200), width=7, fill=(255, 255, 255, 40))
        bd.ellipse([x - r * 0.45, y - r * 0.55, x - r * 0.1, y - r * 0.2], fill=(255, 255, 255, 220))
    img.alpha_composite(bub)

    # beyaz köpük çerçevesi
    ring = Image.new('RGBA', (N * 2, N * 2), (0, 0, 0, 0))
    rd = ImageDraw.Draw(ring)
    rd.ellipse([30 * 2, 30 * 2, (N - 30) * 2, (N - 30) * 2], outline=(240, 252, 255, 255), width=26)
    rd.ellipse([52 * 2, 52 * 2, (N - 52) * 2, (N - 52) * 2], outline=(20, 70, 130, 120), width=8)
    ring = ring.resize((N, N), Image.LANCZOS)
    img.putalpha(mask)
    img.alpha_composite(ring)
    return img


def main():
    img = build()
    img.resize((512, 512), Image.LANCZOS).save(os.path.join(ASSETS, 'logo.png'))
    for size in (256, 128, 64, 32):
        img.resize((size, size), Image.LANCZOS).save(os.path.join(ASSETS, f'icon_{size}.png'))
    # Windows için çok boyutlu .ico (isteğe bağlı kısayol/paketleme)
    img.resize((256, 256), Image.LANCZOS).save(os.path.join(ASSETS, 'icon.ico'), sizes=[(256, 256), (128, 128), (64, 64), (48, 48), (32, 32), (16, 16)])
    print('logo ve simgeler yazildi')


if __name__ == '__main__':
    main()
