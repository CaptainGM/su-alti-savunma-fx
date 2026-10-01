import math
import numpy as np
from scipy import ndimage as ndi
import toolkit as T
from toolkit import rgb, S


def spike_ball(path):
    img = T.blank()
    cx = cy = 500
    for i in range(14):
        a = i * 2 * math.pi / 14
        px, py = -math.sin(a), math.cos(a)
        tip = (cx + math.cos(a) * 430, cy + math.sin(a) * 430)
        base1 = (cx + math.cos(a) * 250 + px * 70, cy + math.sin(a) * 250 + py * 70)
        base2 = (cx + math.cos(a) * 250 - px * 70, cy + math.sin(a) * 250 - py * 70)
        m = T.mask_poly([base1, tip, base2])
        img = T.over(img, T.layer(m, rgb('#ffb04a'), rgb('#c4501a'), angle=90, sigma=12, outline_px=14, gloss=0.2))
    m = T.mask_ellipse(cx, cy, 285, 285)
    img = T.over(img, T.layer(m, rgb('#ffd27a'), rgb('#e8721f'), angle=100, sigma=70, outline_px=16, gloss=0.6, rim=0.3))
    img = T.add_highlight(img, 420, 410, 90, 50, rot=-0.6, alpha=0.7)
    T.finish(img, path)


def harpoon(path):
    """Kılıç balığının uzun, parlak mızrağı (sağa bakar)."""
    img = T.blank()
    shaft = T.mask_taper([(130, 500), (500, 500), (760, 500)], 50, 34)
    img = T.over(img, T.layer(shaft, rgb('#e8f6ff'), rgb('#8fb8e0'), angle=90, sigma=14, outline_px=14, gloss=0.5))
    head = T.mask_poly([(700, 420), (930, 500), (700, 580), (740, 500)])
    img = T.over(img, T.layer(head, rgb('#ffffff'), rgb('#7fc4ff'), angle=90, sigma=12, outline_px=14, gloss=0.5))
    for x in (230, 330):
        tail = T.mask_poly([(x, 500), (x - 110, 420), (x - 70, 500), (x - 110, 580)])
        img = T.over(img, T.layer(tail, rgb('#7fc4ff'), rgb('#3a76c4'), angle=0, sigma=10, outline_px=12))
    T.finish(img, path)


def lantern_orb(path):
    """Fener Balığı'nın ışık mermisi: parlak çekirdek ve yumuşak hale."""
    yy, xx = np.mgrid[0:S, 0:S].astype(np.float32)
    d = np.sqrt((xx - 500) ** 2 + (yy - 500) ** 2)
    halo = np.clip(1 - d / 420, 0, 1) ** 1.6 * 0.55
    img = np.dstack([np.broadcast_to(rgb('#ffe27a'), (S, S, 3)), halo])
    core = T.mask_ellipse(500, 500, 165, 165)
    img = T.over(img, T.layer(core, rgb('#ffffff'), rgb('#ffc94a'), angle=90, sigma=50, outline_px=12, gloss=0.5, rim=0.0))
    img = T.add_highlight(img, 450, 450, 55, 32, rot=-0.6, alpha=0.9)
    T.finish(img, path)
