"""Oyun içinde kayan ışık ağı dokusu (512x512, döşenebilir)."""
import os

import numpy as np
from PIL import Image

import common as C


def make_caustics(out_path, size=512, seed=77):
    rng = np.random.default_rng(seed)
    a = C.ridged(size, size, 15, rng, 3, wrap=True)
    b = C.ridged(size, size, 24, rng, 2, wrap=True)
    c = np.clip(a * 0.75 + b * 0.55, 0, 1) ** 1.9
    c = c / c.max()
    alpha = (np.clip(c * 1.25, 0, 1) * 255).astype(np.uint8)
    rgba = np.zeros(alpha.shape + (4,), np.uint8)
    rgba[..., :3] = 255
    rgba[..., 3] = alpha
    im = Image.fromarray(rgba, 'RGBA')
    if im.size[0] != size:
        im = im.resize((size, size), Image.LANCZOS)
    im.save(out_path)
