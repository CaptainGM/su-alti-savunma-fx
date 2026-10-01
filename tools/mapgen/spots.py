"""Kule yerlerini haritaya dengeli dağıtır: yola erişebilen hiçbir bölge boş kalmasın.

    python tools/mapgen/spots.py             rapor yazar ve tools/mapgen/spots_preview/ altına önizleme çizer
    python tools/mapgen/spots.py --write     maps.js içindeki buildSpots listelerini günceller

Mevcut (elle yerleştirilmiş) yerler korunur. Yola yeterince yakın olup çevresi boş kalan noktalara, boşluk
kalmayana kadar en uzak noktadan başlayarak yeni yer eklenir. Yola uzak yerler "yüksek zemin" olur: menzil %20
artar, ama yalnızca uzun menzilli kuleler yola yetişir. Böylece kule türünü ve yerini birlikte düşünmek gerekir.
"""
import json
import os
import re
import subprocess
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
WEB = os.path.join(HERE, '..', '..', 'src', 'main', 'resources', 'web')
MAPS_JS = os.path.join(WEB, 'js', 'maps.js')

W, H = 1350, 900
MIN_PATH = 80          # yolun eksenine en az uzaklık (yol görseli ve kule gövdesi)
MAX_PATH = 350         # bundan uzağa yer koymanın anlamı yok (uzaktakiler Kılıç Balığı / Balon Balığı için)
NEAR_PATH = 218        # bu uzaklığa kadar olan bölge sık, ötesi seyrek doldurulur
MIN_GAP = 124          # iki kule arası (kule yarıçapı 55)
HOLE = 172             # yola yakın bir noktanın en yakın yere uzaklığı bundan büyükse boşluk sayılır
FAR_HIGH = 165         # yola bu kadar uzaksa yeni yer yüksek zemin olur
MARGIN_X, MARGIN_TOP, MARGIN_BOTTOM = 70, 78, 70
KEEP_OUT = 96          # koruyucu baş / hazine sandığı çevresi


def load_maps():
    js = ("const M=require(%s);console.log(JSON.stringify(M.map(m=>({id:m.id,paths:m.paths||[m.pathPoints],"
          "spots:m.buildSpots,bg:m.bg,guardians:m.guardians||[],treasure:m.treasure||null}))))" % json.dumps(os.path.abspath(MAPS_JS)))
    out = subprocess.check_output(['node', '-e', js])
    return json.loads(out.decode('utf-8'))


def catmull(points, per=20):
    pts = [np.array([p['x'], p['y']], float) for p in points]
    out = []
    for i in range(len(pts) - 1):
        p0, p1, p2, p3 = pts[max(0, i - 1)], pts[i], pts[i + 1], pts[min(len(pts) - 1, i + 2)]
        for j in range(per):
            t = j / per
            t2, t3 = t * t, t * t * t
            out.append(0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3))
    out.append(pts[-1])
    return np.array(out)


def dist_to(points, xs, ys):
    d = np.full(xs.shape, 1e9)
    for px, py in points:
        d = np.minimum(d, np.hypot(xs - px, ys - py))
    return d


def busyness(m):
    """Arka planın karmaşıklığı (yerel standart sapma): süs eşyalarının, kristallerin ve iskeletlerin üstüne yer koymamak için."""
    from PIL import Image
    from scipy.ndimage import uniform_filter
    g = np.asarray(Image.open(os.path.join(WEB, m['bg'])).convert('L').resize((W, H)), float)
    mean = uniform_filter(g, 57)
    var = np.maximum(0, uniform_filter(g * g, 57) - mean * mean)
    return np.sqrt(var)


def solve(m):
    busy = busyness(m)
    path_pts = np.vstack([catmull(p) for p in m['paths']])
    gx, gy = np.meshgrid(np.arange(MARGIN_X, W - MARGIN_X + 1, 9.0), np.arange(MARGIN_TOP, H - MARGIN_BOTTOM + 1, 9.0))
    d_path = dist_to(path_pts, gx, gy)
    busy_at = busy[gy.astype(int), gx.astype(int)]
    ok = (d_path >= MIN_PATH) & (d_path <= MAX_PATH)
    calm_limit = np.percentile(busy_at[ok], 92)      # yalnızca en karmaşık %8 (iskelet, büyük kristal öbekleri) dışarıda kalır
    ok &= busy_at <= calm_limit
    for g in m['guardians']:
        ok &= np.hypot(gx - g['x'], gy - g['y']) >= KEEP_OUT
    if m['treasure']:
        ok &= np.hypot(gx - m['treasure']['x'], gy - m['treasure']['y']) >= KEEP_OUT
    # arayüz düğmelerinin altı
    ok &= ~((gx < 190) & (gy < 80)) & ~((gx > 1130) & (gy < 80))

    spots = [dict(s) for s in m['spots']]
    for _ in range(80):
        sx = np.array([s['x'] for s in spots], float)
        sy = np.array([s['y'] for s in spots], float)
        near = np.full(gx.shape, 1e9)
        for x, y in zip(sx, sy):
            near = np.minimum(near, np.hypot(gx - x, gy - y))
        cand = ok & (near >= MIN_GAP)
        if not cand.any():
            break
        # boşluk: yola erişebilen ama yeterince yakın yer olmayan noktalar
        hole = ((d_path >= MIN_PATH - 20) & (d_path <= NEAR_PATH) & (near > HOLE)) | ((d_path > NEAR_PATH) & (d_path <= MAX_PATH) & (near > HOLE + 40))
        if not (cand & hole).any():
            break
        score = np.where(cand & hole, near, -1)
        # yola yakın olanları hafifçe tercih et (erişilebilir olsun)
        score = score - 0.35 * np.abs(d_path - 135) - 1.6 * busy_at
        score = np.where(cand & hole, score, -1e9)
        j = np.unravel_index(np.argmax(score), score.shape)
        x, y = int(round(gx[j])), int(round(gy[j]))
        s = {'x': x, 'y': y}
        if d_path[j] >= FAR_HIGH:
            s['kind'] = 'high'
        spots.append(s)
    return spots, path_pts, (gx, gy, d_path, ok)


def spot_text(spots, per_line=3):
    items = [('{ x: %d, y: %d%s }' % (s['x'], s['y'], ", kind: 'high'" if s.get('kind') == 'high' else '')) for s in spots]
    lines = [', '.join(items[i:i + per_line]) + ',' for i in range(0, len(items), per_line)]
    return '\n'.join('                ' + ln for ln in lines)


def preview(m, spots, path_pts, folder):
    from PIL import Image, ImageDraw
    bg = Image.open(os.path.join(WEB, m['bg'])).convert('RGB').resize((W, H))
    d = ImageDraw.Draw(bg, 'RGBA')
    old = {(s['x'], s['y']) for s in m['spots']}
    for x, y in path_pts[::6]:
        d.ellipse([x - 3, y - 3, x + 3, y + 3], fill=(255, 255, 255, 140))
    for s in spots:
        new = (s['x'], s['y']) not in old
        col = (255, 215, 60, 200) if s.get('kind') == 'high' else (80, 255, 170, 200)
        d.ellipse([s['x'] - 28, s['y'] - 28, s['x'] + 28, s['y'] + 28], outline=(255, 90, 90, 255) if new else col, width=4, fill=col[:3] + (60,))
    os.makedirs(folder, exist_ok=True)
    bg.convert('RGB').resize((900, 600)).save(os.path.join(folder, m['id'] + '.jpg'), quality=82)


def main():
    write = '--write' in sys.argv
    maps = load_maps()
    text = open(MAPS_JS, encoding='utf-8').read()
    folder = os.path.join(HERE, 'spots_preview')
    for m in maps:
        spots, path_pts, _ = solve(m)
        added = len(spots) - len(m['spots'])
        print('%-9s yer %2d -> %2d (+%d)' % (m['id'], len(m['spots']), len(spots), added))
        if not write:
            preview(m, spots, path_pts, folder)
            continue
        pat = re.compile(r"(id: '%s',.*?buildSpots: \[\n).*?(\n            \],)" % m['id'], re.S)
        if not pat.search(text):
            print('  buildSpots bulunamadi')
            continue
        text = pat.sub(lambda mm: mm.group(1) + spot_text(spots) + mm.group(2), text, count=1)
    if write:
        open(MAPS_JS, 'w', encoding='utf-8', newline='\n').write(text)


if __name__ == '__main__':
    main()
