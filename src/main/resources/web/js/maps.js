// Harita verileri. Yeni harita eklemek için diziye bir nesne eklemek yeterli.
//
//   paths        : yol(lar). Her yol kontrol noktası listesidir, düşmanlar ilk noktadan doğar, son noktada üsse varır.
//                  Birden fazla yol verilirse düşmanlar sırayla bunlara dağılır.
//   buildSpots   : kule yerleri. kind: 'high' olursa kule menzili %20 artar (altın halka).
//   enemyPool    : bu haritada çıkabilecek düşman türleri (sprite'ı olmayanlar kapalı tutulur).
//   mix          : tür ağırlıkları (1 = varsayılan). Haritaya karakter kazandırır.
//   waves        : dalga sayısı (varsayılan 10).
//   countScale   : düşman sayısı çarpanı.
//   hpScale      : düşman canı çarpanı (haritanın genel zorluğu).
//   ambient      : arka plan canlandırma ayarları (bkz. game.js, drawAmbient).
(function (root) {
    'use strict';

    const BASIC_POOL = ['standard', 'armored', 'flying'];

    // Sualtı haritalarının hepsi Mercan Kanalı'nın kule/düşman çizimlerini kullanır; yalnızca arka plan değişir.
    const UNDERWATER_TOWERS = { octopus: 'Ahtapot', eel: 'Yılan Balığı', jellyfish: 'Deniz Anası' };
    const UNDERWATER_ENEMIES = { standard: 'Köpek Balığı', armored: 'Istakoz', flying: 'Vatoz', swarm: 'Yavru Köpek Balığı', boss: 'Kral Köpek Balığı' };
    function underwaterAssets(bg) {
        return {
            bg,
            towers: { octopus: 'assets/tower_octopus.png', eel: 'assets/tower_eel.png', jellyfish: 'assets/jellyfish.png' },
            enemies: { standard: 'assets/enemy_shark.png', armored: 'assets/enemy_lobster.png', flying: 'assets/enemy_ray.png', swarm: 'assets/enemy_pup.png', boss: 'assets/enemy_king.png' },
            projectiles: { octopus: 'assets/projectile_octopus.png', eel: 'assets/projectile_eel.png', jellyfish: 'assets/projectile_jellyfish.png' },
        };
    }

    const MAPS = [
        {
            id: 'mercan',
            hpScale: 1.2,
            name: 'Mercan Kanalı',
            desc: 'Sualtı · Klasik S dönüşü',
            stars: 1,
            speedScale: 1.00,
            startMoney: 200,
            waves: 10,
            pathStyle: 'rail',
            flipSprites: true,
            ambient: { motes: 28, bubbles: 7, moteColor: '230,255,255', fish: { schools: 2, colors: ['#ffd36b', '#ff9d6b'], alpha: 0.8 } },
            paths: [[
                { x: 830, y: 30 }, { x: 890, y: 90 }, { x: 930, y: 120 }, { x: 750, y: 145 },
                { x: 650, y: 180 }, { x: 600, y: 250 }, { x: 700, y: 320 }, { x: 750, y: 360 },
                { x: 750, y: 410 }, { x: 650, y: 460 }, { x: 600, y: 480 }, { x: 550, y: 490 },
                { x: 450, y: 520 }, { x: 380, y: 550 }, { x: 330, y: 600 }, { x: 340, y: 680 },
                { x: 390, y: 720 }, { x: 480, y: 750 }, { x: 530, y: 800 }, { x: 580, y: 880 },
            ]],
            buildSpots: [
                { x: 800, y: 200 }, { x: 500, y: 200 }, { x: 450, y: 320 }, { x: 850, y: 380 },
                { x: 550, y: 380 }, { x: 700, y: 500 }, { x: 280, y: 500 }, { x: 200, y: 620 },
                { x: 480, y: 620 }, { x: 250, y: 750 }, { x: 600, y: 700 }, { x: 400, y: 850 },
                { x: 613, y: 74 }, { x: 995, y: 210 }, { x: 889, y: 509 }, { x: 787, y: 585 },
                { x: 389, y: 425 }, { x: 704, y: 756 },
            ],
            assets: {
                bg: 'assets/game_bg.jpg',
                towers: { octopus: 'assets/tower_octopus.png', eel: 'assets/tower_eel.png', jellyfish: 'assets/jellyfish.png' },
                enemies: { standard: 'assets/enemy_shark.png', armored: 'assets/enemy_lobster.png', flying: 'assets/enemy_ray.png', swarm: 'assets/enemy_pup.png', boss: 'assets/enemy_king.png' },
                projectiles: { octopus: 'assets/projectile_octopus.png', eel: 'assets/projectile_eel.png', jellyfish: 'assets/projectile_jellyfish.png' },
            },
            towerNames: { octopus: 'Ahtapot', eel: 'Yılan Balığı', jellyfish: 'Deniz Anası' },
            enemyNames: { standard: 'Köpek Balığı', armored: 'Istakoz', flying: 'Vatoz', swarm: 'Yavru Köpek Balığı', boss: 'Kral Köpek Balığı' },
        },
        {
            id: 'yosun',
            hpScale: 1.85,
            name: 'Yosun Ormanı',
            desc: 'Sualtı · Uzun, kıvrımlı yosun yolu',
            stars: 2,
            speedScale: 1.00,
            startMoney: 200,
            waves: 10,
            countScale: 1.0,
            mix: { flying: 1.3 },
            pathStyle: 'flow',
            flowColor: '120,80,30',
            flipSprites: true,
            ambient: { motes: 30, bubbles: 10, moteColor: '230,255,230', fish: { schools: 3, colors: ['#ffb347', '#ffe066', '#ff8a65'], alpha: 0.85 }, caustics: 0.10, rays: { count: 5, color: '210,255,200', alpha: 0.09 }, vignette: 0.16 },
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
            assets: underwaterAssets('assets/maps/yosun.jpg'),
            towerNames: UNDERWATER_TOWERS,
            enemyNames: UNDERWATER_ENEMIES,
        },
        {
            id: 'batik',
            hpScale: 1.22,
            name: 'Batık Gemi Mezarlığı',
            desc: 'Sualtı · İki girişli tahta iskele',
            stars: 3,
            speedScale: 1.00,
            startMoney: 220,
            waves: 10,
            countScale: 1.15,
            mix: { armored: 1.1, swarm: 1.2 },
            pathStyle: 'flow',
            flowColor: '255,235,190',
            flipSprites: true,
            ambient: { motes: 18, bubbles: 8, moteColor: '255,250,230', fish: { schools: 2, colors: ['#ffd166', '#ff9f68'], alpha: 0.85 }, caustics: 0.16, rays: { count: 4, color: '255,250,210', alpha: 0.10 }, vignette: 0.12 },
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
            assets: underwaterAssets('assets/maps/batik.jpg'),
            towerNames: UNDERWATER_TOWERS,
            enemyNames: UNDERWATER_ENEMIES,
        },
        {
            id: 'girdap',
            hpScale: 2.3,
            name: 'Girdap',
            desc: 'Sualtı · Spiral akıntı, uzun yol',
            stars: 3,
            speedScale: 1.12,
            startMoney: 200,
            waves: 10,
            countScale: 1.2,
            mix: { swarm: 1.5, flying: 0.8 },
            pathStyle: 'flow',
            flowColor: '30,110,170',
            flipSprites: true,
            ambient: { motes: 22, bubbles: 14, moteColor: '210,240,255', fish: { schools: 2, colors: ['#ffd9a0', '#bfe9ff'], alpha: 0.7 }, caustics: 0.07, vignette: 0.22 },
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
            assets: underwaterAssets('assets/maps/girdap.jpg'),
            towerNames: UNDERWATER_TOWERS,
            enemyNames: UNDERWATER_ENEMIES,
        },
        {
            id: 'cukur',
            hpScale: 1.0,
            name: 'Derin Çukur',
            desc: 'Sualtı · Karanlık kaya adası',
            stars: 4,
            speedScale: 1.00,
            startMoney: 220,
            waves: 12,
            countScale: 1.1,
            mix: { armored: 1.5, flying: 1.2 },
            pathStyle: 'flow',
            flowColor: '90,240,255',
            flipSprites: true,
            ambient: { motes: 46, bubbles: 8, moteColor: '120,255,255', fish: { schools: 3, colors: ['#35f0ff', '#ff4fd8', '#a8ff6a'], alpha: 0.55 }, vignette: 0.30 },
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
            assets: underwaterAssets('assets/maps/cukur.jpg'),
            towerNames: UNDERWATER_TOWERS,
            enemyNames: UNDERWATER_ENEMIES,
        },
        {
            id: 'yildiz',
            name: 'Yıldız Filosu',
            desc: 'Uzay · Nairan filosunun savunma hattı',
            stars: 2,
            speedScale: 1.04,
            startMoney: 200,
            waves: 8,
            enemyPool: BASIC_POOL,
            pathStyle: 'rail',
            paths: [[
                { x: 900, y: 460 }, { x: 827, y: 607 }, { x: 673, y: 682 }, { x: 506, y: 662 },
                { x: 394, y: 566 }, { x: 375, y: 440 }, { x: 445, y: 337 }, { x: 567, y: 295 },
                { x: 685, y: 322 }, { x: 752, y: 399 }, { x: 750, y: 487 }, { x: 691, y: 549 },
                { x: 608, y: 565 }, { x: 539, y: 537 }, { x: 511, y: 486 }, { x: 524, y: 439 },
            ]],
            buildSpots: [
                { x: 1000, y: 506 }, { x: 202, y: 499 }, { x: 582, y: 185 }, { x: 543, y: 818 },
                { x: 277, y: 265 }, { x: 780, y: 764 }, { x: 330, y: 709 }, { x: 582, y: 405 },
                { x: 787, y: 261 }, { x: 903, y: 319 }, { x: 902, y: 727 }, { x: 274, y: 392 },
                { x: 398, y: 236 }, { x: 441, y: 753 }, { x: 701, y: 176 },
            ],
            assets: {
                bg: 'assets/bg_space.jpg',
                towers: { octopus: 'assets/tower_dreadnought.png', eel: 'assets/tower_battlecruiser.png', jellyfish: 'assets/tower_frigate.png' },
                enemies: { standard: 'assets/enemy_fighter.png', armored: 'assets/enemy_scout.png', flying: 'assets/enemy_torpedo.png' },
                projectiles: { octopus: 'assets/projectile_dreadnought.png', eel: 'assets/projectile_battlecruiser.png', jellyfish: 'assets/projectile_frigate.png' },
            },
            towerNames: { octopus: 'Dretnot', eel: 'Muharebe Kruvazörü', jellyfish: 'Fırkateyn' },
            enemyNames: { standard: 'Avcı Gemisi', armored: 'Keşif Gemisi', flying: 'Torpido Gemisi' },
        },
        {
            id: 'kum',
            name: 'Kum Krallığı',
            desc: 'Çöl / Ortaçağ · Kanyon geçidi',
            stars: 2,
            speedScale: 1.58,
            startMoney: 200,
            waves: 8,
            enemyPool: BASIC_POOL,
            pathStyle: 'rail',
            paths: [[
                { x: 480, y: 40 }, { x: 780, y: 90 }, { x: 800, y: 260 }, { x: 520, y: 300 },
                { x: 280, y: 330 }, { x: 260, y: 480 }, { x: 520, y: 510 }, { x: 800, y: 540 },
                { x: 800, y: 700 }, { x: 520, y: 730 }, { x: 280, y: 760 }, { x: 380, y: 870 },
            ]],
            buildSpots: [
                { x: 464, y: 149 }, { x: 816, y: 813 }, { x: 168, y: 787 }, { x: 967, y: 206 },
                { x: 70, y: 385 }, { x: 541, y: 652 }, { x: 922, y: 519 }, { x: 442, y: 416 },
                { x: 224, y: 168 }, { x: 703, y: 177 }, { x: 303, y: 607 }, { x: 719, y: 395 },
                { x: 679, y: 833 }, { x: 142, y: 501 }, { x: 586, y: 404 },
            ],
            assets: {
                bg: 'assets/bg_desert.jpg',
                towers: { octopus: 'assets/tower_warrior.png', eel: 'assets/tower_necromancer.png', jellyfish: 'assets/tower_sorceress.png' },
                enemies: { standard: 'assets/enemy_skeleton.png', armored: 'assets/enemy_goblin_berserker.png', flying: 'assets/enemy_goblin_slinger.png' },
                projectiles: { octopus: 'assets/projectile_warrior.png', eel: 'assets/projectile_necromancer.png', jellyfish: 'assets/projectile_sorceress.png' },
            },
            towerNames: { octopus: 'Savaşçı', eel: 'Nekromanser', jellyfish: 'Büyücü' },
            enemyNames: { standard: 'İskelet Asker', armored: 'Goblin Azgını', flying: 'Goblin Sapancı' },
        },
    ];

    if (typeof module !== 'undefined' && module.exports) module.exports = MAPS;
    else root.MAPS = MAPS;
})(typeof window !== 'undefined' ? window : globalThis);
