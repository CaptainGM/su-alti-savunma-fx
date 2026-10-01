// Harita verileri. Yeni harita eklemek için diziye bir nesne eklemek yeterli.
//
//   bg           : arka plan resmi. Tuval haritanın 'size' değeriyle (varsayılan 1350x900) eşleşmeli
//   paths        : yol(lar). Her yol kontrol noktası listesidir, düşmanlar ilk noktadan doğar, son noktada üsse varır.
//                  Birden fazla yol verilirse düşmanlar sırayla bunlara dağılır.
//   buildSpots   : kule yerleri. kind: 'high' olursa kule menzili %20 artar (altın halka).
//   towers       : bu haritada marketten alınabilecek kule türleri (Core.TOWER_TYPES anahtarları)
//   boss         : patron türü: 'shark' | 'crab' | 'manta' | 'brood' (Core.BOSS_KINDS)
//   enemyPool    : bu haritada çıkabilecek düşman türleri (varsayılan hepsi)
//   mix          : tür ağırlıkları (1 = varsayılan). Haritaya karakter kazandırır.
//   waves        : dalga sayısı (varsayılan 10).
//   countScale   : düşman sayısı çarpanı.
//   hpScale      : düşman canı çarpanı (haritanın genel zorluğu; ilk dalgada 1, son dalgada bu değer).
//   ambient      : arka plan canlandırma ayarları (bkz. game.js, drawAmbientBack/Front).
(function (root) {
    'use strict';

    const MAPS = [
        {
            id: 'mercan',
            name: 'Mercan Kanalı',
            desc: 'Sualtı · Klasik S dönüşü',
            stars: 1,
            hpScale: 1.2,
            speedScale: 1,
            startMoney: 200,
            waves: 10,
            countScale: 1,
            boss: 'shark',
            towers: ['octopus', 'eel', 'jellyfish', 'swordfish'],
            pathStyle: 'rail',
            flipSprites: true,
            bg: 'assets/game_bg.jpg',
            ambient: { motes: 28, bubbles: 7, moteColor: '230,255,255' },
            paths: [
                [
                    { x: 1019, y: 30 }, { x: 1092, y: 90 }, { x: 1141, y: 120 }, { x: 920, y: 145 },
                    { x: 798, y: 180 }, { x: 736, y: 250 }, { x: 859, y: 320 }, { x: 920, y: 360 },
                    { x: 920, y: 410 }, { x: 798, y: 460 }, { x: 736, y: 480 }, { x: 675, y: 490 },
                    { x: 552, y: 520 }, { x: 466, y: 550 }, { x: 405, y: 600 }, { x: 417, y: 680 },
                    { x: 479, y: 720 }, { x: 589, y: 750 }, { x: 650, y: 800 }, { x: 712, y: 880 },
                ],
            ],
            buildSpots: [
                { x: 982, y: 200 }, { x: 614, y: 200 }, { x: 552, y: 320 },
                { x: 1043, y: 380 }, { x: 675, y: 380 }, { x: 859, y: 500 },
                { x: 344, y: 500 }, { x: 245, y: 620 }, { x: 589, y: 620 },
                { x: 307, y: 750 }, { x: 736, y: 700 }, { x: 491, y: 850 },
                { x: 752, y: 74 }, { x: 1221, y: 210 }, { x: 1091, y: 509 },
                { x: 966, y: 585 }, { x: 477, y: 425 }, { x: 864, y: 756 },
            ],
        },
        {
            id: 'yosun',
            name: 'Yosun Ormanı',
            desc: 'Sualtı · Uzun, kıvrımlı yosun yolu',
            stars: 2,
            hpScale: 1.85,
            speedScale: 1,
            startMoney: 200,
            waves: 10,
            countScale: 1,
            mix: { flying: 1.3 },
            boss: 'brood',
            towers: ['octopus', 'jellyfish', 'puffer', 'angler'],
            flipSprites: true,
            size: { w: 1100, h: 900 },
            bg: 'assets/maps/yosun.jpg',
            ambient: { motes: 30, bubbles: 10, moteColor: '230,255,230', caustics: 0.10, rays: { count: 5, color: '210,255,200', alpha: 0.09 }, vignette: 0.16 },
            paths: [
                [
                    { x: -30, y: 150 }, { x: 200, y: 175 }, { x: 430, y: 130 }, { x: 690, y: 150 },
                    { x: 880, y: 190 }, { x: 975, y: 300 }, { x: 900, y: 410 }, { x: 700, y: 440 },
                    { x: 460, y: 430 }, { x: 270, y: 455 }, { x: 165, y: 560 }, { x: 215, y: 670 },
                    { x: 400, y: 705 }, { x: 640, y: 690 }, { x: 860, y: 715 }, { x: 975, y: 790 },
                    { x: 950, y: 905 },
                ],
            ],
            buildSpots: [
                { x: 170, y: 302, kind: 'high' }, { x: 350, y: 302 }, { x: 470, y: 266 },
                { x: 650, y: 290 }, { x: 770, y: 302 }, { x: 890, y: 314, kind: 'high' },
                { x: 242, y: 578 }, { x: 362, y: 566 }, { x: 494, y: 578 },
                { x: 650, y: 542 }, { x: 770, y: 566 }, { x: 782, y: 782, kind: 'high' },
            ],
        },
        {
            id: 'batik',
            name: 'Batık Gemi Mezarlığı',
            desc: 'Sualtı · İki girişli tahta iskele',
            stars: 3,
            hpScale: 1.22,
            speedScale: 1,
            startMoney: 220,
            waves: 10,
            countScale: 1.15,
            mix: { armored: 1.1, swarm: 1.2 },
            boss: 'crab',
            towers: ['octopus', 'eel', 'swordfish', 'angler'],
            flipSprites: true,
            size: { w: 1100, h: 900 },
            bg: 'assets/maps/batik.jpg',
            ambient: { motes: 18, bubbles: 8, moteColor: '255,250,230', caustics: 0.16, rays: { count: 4, color: '255,250,210', alpha: 0.10 }, vignette: 0.12 },
            paths: [
                [
                    { x: -30, y: 55 }, { x: 190, y: 150 }, { x: 300, y: 285 }, { x: 420, y: 400 },
                    { x: 550, y: 525 }, { x: 480, y: 620 }, { x: 520, y: 710 }, { x: 680, y: 770 },
                    { x: 780, y: 830 }, { x: 758, y: 905 },
                ],
                [
                    { x: 1130, y: 80 }, { x: 900, y: 160 }, { x: 810, y: 300 }, { x: 690, y: 405 },
                    { x: 550, y: 525 }, { x: 480, y: 620 }, { x: 520, y: 710 }, { x: 680, y: 770 },
                    { x: 780, y: 830 }, { x: 758, y: 905 },
                ],
            ],
            buildSpots: [
                { x: 674, y: 602 }, { x: 938, y: 254, kind: 'high' }, { x: 158, y: 230, kind: 'high' },
                { x: 554, y: 374 }, { x: 590, y: 830 }, { x: 422, y: 506 },
                { x: 398, y: 626 }, { x: 734, y: 710 }, { x: 482, y: 782 },
                { x: 722, y: 482 }, { x: 842, y: 758, kind: 'high' }, { x: 674, y: 314 },
            ],
        },
        {
            id: 'girdap',
            name: 'Girdap',
            desc: 'Sualtı · Spiral akıntı, uzun yol',
            stars: 3,
            hpScale: 2.3,
            speedScale: 1.12,
            startMoney: 200,
            waves: 10,
            countScale: 1.2,
            mix: { swarm: 1.5, flying: 0.8 },
            boss: 'manta',
            towers: ['octopus', 'eel', 'jellyfish', 'swordfish', 'puffer'],
            flipSprites: true,
            size: { w: 1100, h: 900 },
            bg: 'assets/maps/girdap.jpg',
            ambient: { motes: 22, bubbles: 14, moteColor: '210,240,255', caustics: 0.07, vignette: 0.22 },
            paths: [
                [
                    { x: 760, y: -30 }, { x: 850, y: 100 }, { x: 915, y: 269 }, { x: 940, y: 477 },
                    { x: 855, y: 659 }, { x: 694, y: 767 }, { x: 506, y: 778 }, { x: 348, y: 697 },
                    { x: 259, y: 555 }, { x: 260, y: 397 }, { x: 341, y: 269 }, { x: 472, y: 204 },
                    { x: 610, y: 214 }, { x: 717, y: 288 }, { x: 765, y: 398 }, { x: 747, y: 509 },
                    { x: 678, y: 589 }, { x: 583, y: 620 }, { x: 493, y: 599 }, { x: 433, y: 540 },
                    { x: 415, y: 467 }, { x: 439, y: 403 }, { x: 488, y: 365 }, { x: 543, y: 359 },
                    { x: 552, y: 440 },
                ],
            ],
            buildSpots: [
                { x: 374, y: 350 }, { x: 830, y: 518 }, { x: 458, y: 674 },
                { x: 758, y: 182 }, { x: 626, y: 698 }, { x: 338, y: 518 },
                { x: 626, y: 350 }, { x: 842, y: 362 }, { x: 758, y: 638 },
                { x: 674, y: 470 }, { x: 650, y: 110 }, { x: 974, y: 182, kind: 'high' },
                { x: 1022, y: 422, kind: 'high' }, { x: 926, y: 698, kind: 'high' },
            ],
        },
        {
            id: 'cukur',
            name: 'Derin Çukur',
            desc: 'Sualtı · Karanlık kaya adası',
            stars: 4,
            hpScale: 1,
            speedScale: 1,
            startMoney: 220,
            waves: 12,
            countScale: 1.1,
            mix: { armored: 1.5, flying: 1.2 },
            boss: 'brood',
            towers: ['octopus', 'eel', 'jellyfish', 'swordfish', 'angler', 'puffer'],
            flipSprites: true,
            size: { w: 1100, h: 900 },
            bg: 'assets/maps/cukur.jpg',
            ambient: { motes: 46, bubbles: 8, moteColor: '120,255,255', vignette: 0.30 },
            paths: [
                [
                    { x: -30, y: 80 }, { x: 260, y: 70 }, { x: 520, y: 110 }, { x: 560, y: 215 },
                    { x: 400, y: 290 }, { x: 260, y: 420 }, { x: 250, y: 570 }, { x: 380, y: 700 },
                    { x: 560, y: 760 }, { x: 565, y: 815 }, { x: 590, y: 905 },
                ],
                [
                    { x: -30, y: 80 }, { x: 260, y: 70 }, { x: 520, y: 110 }, { x: 560, y: 215 },
                    { x: 720, y: 290 }, { x: 860, y: 420 }, { x: 870, y: 570 }, { x: 740, y: 700 },
                    { x: 560, y: 760 }, { x: 565, y: 815 }, { x: 590, y: 905 },
                ],
            ],
            buildSpots: [
                { x: 390, y: 450 }, { x: 390, y: 590 }, { x: 730, y: 450 },
                { x: 730, y: 590 }, { x: 560, y: 330 }, { x: 560, y: 640 },
                { x: 254, y: 215 }, { x: 770, y: 215 }, { x: 125, y: 500, kind: 'high' },
                { x: 1000, y: 500, kind: 'high' }, { x: 400, y: 820 }, { x: 730, y: 820 },
            ],
        },
    ];

    if (typeof module !== 'undefined' && module.exports) module.exports = MAPS;
    else root.MAPS = MAPS;
})(typeof window !== 'undefined' ? window : globalThis);
