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
            bg: 'assets/maps/yosun.jpg',
            ambient: { motes: 30, bubbles: 10, moteColor: '230,255,230', caustics: 0.10, rays: { count: 5, color: '210,255,200', alpha: 0.09 }, vignette: 0.16 },
            // geo:begin yosun
            paths: [
                [
                    { x: -37, y: 150 }, { x: 245, y: 175 }, { x: 528, y: 130 }, { x: 847, y: 150 },
                    { x: 1080, y: 190 }, { x: 1197, y: 300 }, { x: 1105, y: 410 }, { x: 859, y: 440 },
                    { x: 565, y: 430 }, { x: 331, y: 455 }, { x: 202, y: 560 }, { x: 264, y: 670 },
                    { x: 491, y: 705 }, { x: 785, y: 690 }, { x: 1055, y: 715 }, { x: 1197, y: 790 },
                    { x: 1166, y: 905 },
                ],
            ],
            buildSpots: [
                { x: 209, y: 302, kind: 'high' }, { x: 430, y: 302 }, { x: 577, y: 266 },
                { x: 798, y: 290 }, { x: 945, y: 302 }, { x: 1092, y: 314, kind: 'high' },
                { x: 297, y: 578 }, { x: 444, y: 566 }, { x: 606, y: 578 },
                { x: 798, y: 542 }, { x: 945, y: 566 }, { x: 960, y: 782, kind: 'high' },
            ],
            // geo:end yosun
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
            bg: 'assets/maps/batik.jpg',
            ambient: { motes: 18, bubbles: 8, moteColor: '255,250,230', caustics: 0.16, rays: { count: 4, color: '255,250,210', alpha: 0.10 }, vignette: 0.12 },
            // geo:begin batik
            paths: [
                [
                    { x: -37, y: 55 }, { x: 233, y: 150 }, { x: 368, y: 285 }, { x: 515, y: 400 },
                    { x: 675, y: 525 }, { x: 589, y: 620 }, { x: 638, y: 710 }, { x: 835, y: 770 },
                    { x: 957, y: 830 }, { x: 930, y: 905 },
                ],
                [
                    { x: 1387, y: 80 }, { x: 1105, y: 160 }, { x: 994, y: 300 }, { x: 847, y: 405 },
                    { x: 675, y: 525 }, { x: 589, y: 620 }, { x: 638, y: 710 }, { x: 835, y: 770 },
                    { x: 957, y: 830 }, { x: 930, y: 905 },
                ],
            ],
            buildSpots: [
                { x: 827, y: 602 }, { x: 1151, y: 254, kind: 'high' }, { x: 194, y: 230, kind: 'high' },
                { x: 680, y: 374 }, { x: 724, y: 830 }, { x: 518, y: 506 },
                { x: 488, y: 626 }, { x: 901, y: 710 }, { x: 592, y: 782 },
                { x: 886, y: 482 }, { x: 1033, y: 758, kind: 'high' }, { x: 827, y: 314 },
            ],
            // geo:end batik
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
            bg: 'assets/maps/girdap.jpg',
            ambient: { motes: 22, bubbles: 14, moteColor: '210,240,255', caustics: 0.07, vignette: 0.22 },
            // geo:begin girdap
            paths: [
                [
                    { x: 933, y: -30 }, { x: 1043, y: 100 }, { x: 1123, y: 269 }, { x: 1154, y: 477 },
                    { x: 1049, y: 659 }, { x: 852, y: 767 }, { x: 621, y: 778 }, { x: 427, y: 697 },
                    { x: 318, y: 555 }, { x: 319, y: 397 }, { x: 418, y: 269 }, { x: 579, y: 204 },
                    { x: 749, y: 214 }, { x: 880, y: 288 }, { x: 939, y: 398 }, { x: 917, y: 509 },
                    { x: 832, y: 589 }, { x: 716, y: 620 }, { x: 605, y: 599 }, { x: 531, y: 540 },
                    { x: 509, y: 467 }, { x: 539, y: 403 }, { x: 599, y: 365 }, { x: 666, y: 359 },
                    { x: 677, y: 440 },
                ],
            ],
            buildSpots: [
                { x: 459, y: 350 }, { x: 1019, y: 518 }, { x: 562, y: 674 },
                { x: 930, y: 182 }, { x: 768, y: 698 }, { x: 415, y: 518 },
                { x: 768, y: 350 }, { x: 1033, y: 362 }, { x: 930, y: 638 },
                { x: 827, y: 470 }, { x: 798, y: 110 }, { x: 1195, y: 182, kind: 'high' },
                { x: 1254, y: 422, kind: 'high' }, { x: 1136, y: 698, kind: 'high' },
            ],
            // geo:end girdap
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
            bg: 'assets/maps/cukur.jpg',
            ambient: { motes: 46, bubbles: 8, moteColor: '120,255,255', vignette: 0.30 },
            // geo:begin cukur
            paths: [
                [
                    { x: -37, y: 80 }, { x: 319, y: 70 }, { x: 638, y: 110 }, { x: 687, y: 215 },
                    { x: 491, y: 290 }, { x: 319, y: 420 }, { x: 307, y: 570 }, { x: 466, y: 700 },
                    { x: 687, y: 760 }, { x: 693, y: 815 }, { x: 724, y: 905 },
                ],
                [
                    { x: -37, y: 80 }, { x: 319, y: 70 }, { x: 638, y: 110 }, { x: 687, y: 215 },
                    { x: 884, y: 290 }, { x: 1055, y: 420 }, { x: 1068, y: 570 }, { x: 908, y: 700 },
                    { x: 687, y: 760 }, { x: 693, y: 815 }, { x: 724, y: 905 },
                ],
            ],
            buildSpots: [
                { x: 479, y: 450 }, { x: 479, y: 590 }, { x: 896, y: 450 },
                { x: 896, y: 590 }, { x: 687, y: 330 }, { x: 687, y: 640 },
                { x: 312, y: 215 }, { x: 945, y: 215 }, { x: 153, y: 500, kind: 'high' },
                { x: 1227, y: 500, kind: 'high' }, { x: 491, y: 820 }, { x: 896, y: 820 },
            ],
            // geo:end cukur
        },
    ];

    if (typeof module !== 'undefined' && module.exports) module.exports = MAPS;
    else root.MAPS = MAPS;
})(typeof window !== 'undefined' ? window : globalThis);
