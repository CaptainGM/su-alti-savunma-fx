"""Yeni kule, mermi ve patron sprite'larını üretir.

    python tools/sprites/build.py
"""
import importlib.util
import os
import sys

import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import angler  # noqa: E402
import projectiles  # noqa: E402
import puffer  # noqa: E402
import swordfish  # noqa: E402
import toolkit as T  # noqa: E402

ASSETS = os.path.join(HERE, '..', '..', 'src', 'main', 'resources', 'web', 'assets')

spec = importlib.util.spec_from_file_location('sprite_varyant', os.path.join(HERE, '..', 'sprite_varyant.py'))
SV = importlib.util.module_from_spec(spec)
spec.loader.exec_module(SV)


def out(name):
    return os.path.join(ASSETS, name)


def main():
    swordfish.build(out('tower_swordfish.png'))
    angler.build(out('tower_angler.png'))
    puffer.build(out('tower_puffer.png'))
    projectiles.spike_ball(out('projectile_puffer.png'))
    projectiles.harpoon(out('projectile_swordfish.png'))

    # patron varyantları: mevcut sprite'ların renk değiştirilmiş ve taçlı halleri
    lobster = Image.open(out('enemy_lobster.png')).convert('RGBA')
    crab = SV.shift_hue(lobster, hue_shift=0.72, sat_mul=0.9, val_mul=0.78, only_blue=False, sat_min=0.3)
    crab = SV.crown(crab, 250, 84, 150, 0)
    crab.save(out('enemy_king_crab.png'))

    ray = Image.open(out('enemy_ray.png')).convert('RGBA')
    manta = SV.shift_hue(ray, hue_shift=0.40, sat_mul=0.95, val_mul=0.95, only_blue=False, sat_min=0.3)
    manta = SV.crown(manta, 170, 228, 140, -24)
    manta.save(out('enemy_king_manta.png'))

    shark = Image.open(out('enemy_shark.png')).convert('RGBA')
    brood = SV.shift_hue(shark, hue_shift=0.36, sat_mul=0.85, val_mul=1.25, only_blue=True)
    brood = SV.crown(brood, 150, 150, 150, -16)
    brood.save(out('enemy_king_brood.png'))
    print('sprite\'lar yazildi')


if __name__ == '__main__':
    main()
