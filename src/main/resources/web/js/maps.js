// Harita verileri. Yeni harita eklemek için diziye bir nesne eklemek yeterli.
//
//   thumb        : harita kartındaki küçük önizleme
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
//   rule         : haritaya özel kural metni (arayüzde gösterilir)
//   mechanics    : kuralın ayarları (core.js World.initMechanics): tangle | pull | eruption | blizzard | guardians | darkness | treasure
//   ambient      : arka plan canlandırma ayarları (bkz. game.js, drawAmbientBack/Front).
(function (root) {
    'use strict';

    const MAPS = [
        {
            id: 'mercan',
            name: 'Mercan Kanalı',
            desc: 'Sualtı · Klasik S dönüşü',
            stars: 1,
            hpScale: 0.9,
            speedScale: 1,
            startMoney: 200,
            waves: 10,
            countScale: 1,
            boss: 'shark',
            towers: ['octopus', 'eel', 'jellyfish', 'swordfish'],
            pathStyle: 'rail',
            flipSprites: true,
            bg: 'assets/game_bg.jpg',
            thumb: 'assets/maps/thumbs/mercan.jpg',
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
            rule: 'Yosun yatakları: işaretli bölgelerde düşmanlar %38 yavaşlar',
            mechanics: [{ type: 'tangle', color: '40,120,50', zones: [{ from: 0.20, to: 0.34, factor: 0.62 }, { from: 0.56, to: 0.70, factor: 0.62 }] }],
            name: 'Yosun Ormanı',
            desc: 'Sualtı · Uzun, kıvrımlı yosun yolu',
            stars: 2,
            hpScale: 1.9,
            speedScale: 1,
            startMoney: 200,
            waves: 10,
            countScale: 1,
            mix: { flying: 1.3 },
            boss: 'brood',
            towers: ['octopus', 'jellyfish', 'puffer', 'angler'],
            flipSprites: true,
            bg: 'assets/maps/yosun.jpg',
            thumb: 'assets/maps/thumbs/yosun.jpg',
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
            id: 'mangrov',
            rule: 'Mangrov kökleri: üç kolun orta bölümünde düşmanlar %30 yavaşlar',
            mechanics: [{ type: 'tangle', color: '110,76,40', zones: [{ from: 0.38, to: 0.60, factor: 0.7 }] }],
            name: 'Mangrov Deltası',
            desc: 'Bataklık · Üçe ayrılan nehir',
            stars: 2,
            hpScale: 0.75,
            speedScale: 1.0,
            startMoney: 220,
            waves: 10,
            countScale: 1.1,
            mix: { swarm: 1.3 },
            boss: 'shark',
            towers: ['octopus', 'eel', 'jellyfish', 'puffer'],
            flipSprites: true,
            bg: 'assets/maps/mangrov.jpg',
            thumb: 'assets/maps/thumbs/mangrov.jpg',
            ambient: { motes: 40, bubbles: 4, moteColor: '232,255,122', caustics: 0.06, vignette: 0.28 },
            // geo:begin mangrov
            paths: [
                [
                    { x: -40, y: 130 }, { x: 230, y: 160 }, { x: 420, y: 190 }, { x: 560, y: 260 },
                    { x: 430, y: 400 }, { x: 370, y: 520 }, { x: 430, y: 640 }, { x: 560, y: 730 },
                    { x: 690, y: 745 }, { x: 800, y: 710 }, { x: 900, y: 770 }, { x: 1020, y: 830 },
                    { x: 1100, y: 945 },
                ],
                [
                    { x: -40, y: 130 }, { x: 230, y: 160 }, { x: 420, y: 190 }, { x: 560, y: 260 },
                    { x: 610, y: 380 }, { x: 640, y: 500 }, { x: 690, y: 610 }, { x: 750, y: 680 },
                    { x: 800, y: 710 }, { x: 900, y: 770 }, { x: 1020, y: 830 }, { x: 1100, y: 945 },
                ],
                [
                    { x: -40, y: 130 }, { x: 230, y: 160 }, { x: 420, y: 190 }, { x: 560, y: 260 },
                    { x: 800, y: 300 }, { x: 980, y: 370 }, { x: 1030, y: 520 }, { x: 930, y: 640 },
                    { x: 860, y: 690 }, { x: 800, y: 710 }, { x: 900, y: 770 }, { x: 1020, y: 830 },
                    { x: 1100, y: 945 },
                ],
            ],
            buildSpots: [
                { x: 410, y: 278 }, { x: 974, y: 710 }, { x: 590, y: 602 },
                { x: 806, y: 386 }, { x: 1094, y: 746 }, { x: 530, y: 434 },
                { x: 878, y: 566 }, { x: 842, y: 830 }, { x: 278, y: 290 },
                { x: 158, y: 242, kind: 'high' }, { x: 482, y: 122 }, { x: 1160, y: 560, kind: 'high' },
            ],
            // geo:end mangrov
        },
        {
            id: 'batik',
            rule: 'Batık hazine: sandık ara sıra parlar, tıklayıp altın topla',
            mechanics: [{ type: 'treasure', interval: 22, first: 13, life: 8, reward: 45 }],
            name: 'Batık Gemi Mezarlığı',
            desc: 'Sualtı · İki girişli tahta iskele',
            stars: 3,
            hpScale: 1.05,
            speedScale: 1,
            startMoney: 220,
            waves: 10,
            countScale: 1.15,
            mix: { armored: 1.1, swarm: 1.2 },
            boss: 'crab',
            towers: ['octopus', 'eel', 'swordfish', 'angler'],
            flipSprites: true,
            bg: 'assets/maps/batik.jpg',
            thumb: 'assets/maps/thumbs/batik.jpg',
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
            treasure: { x: 1111, y: 852 },
            // geo:end batik
        },
        {
            id: 'atlantis',
            rule: 'Koruyucu başlar: 3 taş baş her 10 sn düşmanlara vurup sersemletir',
            mechanics: [{ type: 'guardians', interval: 10, first: 7, radius: 215, flat: 14, pct: 0.12, stun: 1.6 }],
            name: 'Atlantis Harabeleri',
            desc: 'Sualtı · Mermer basamaklar',
            stars: 3,
            hpScale: 2.1,
            speedScale: 1.0,
            startMoney: 220,
            waves: 10,
            countScale: 1.1,
            mix: { flying: 1.2 },
            boss: 'manta',
            towers: ['octopus', 'jellyfish', 'swordfish', 'angler', 'puffer'],
            flipSprites: true,
            bg: 'assets/maps/atlantis.jpg',
            thumb: 'assets/maps/thumbs/atlantis.jpg',
            ambient: { motes: 26, bubbles: 8, moteColor: '255,232,150', caustics: 0.14, rays: { count: 5, color: '255,236,170', alpha: 0.11 }, vignette: 0.2 },
            // geo:begin atlantis
            paths: [
                [
                    { x: -40, y: 120 }, { x: 260, y: 120 }, { x: 300, y: 130 }, { x: 320, y: 170 },
                    { x: 330, y: 320 }, { x: 360, y: 340 }, { x: 600, y: 340 }, { x: 640, y: 360 },
                    { x: 650, y: 400 }, { x: 650, y: 530 }, { x: 690, y: 560 }, { x: 940, y: 560 },
                    { x: 980, y: 580 }, { x: 990, y: 620 }, { x: 990, y: 740 }, { x: 1030, y: 770 },
                    { x: 1300, y: 770 }, { x: 1340, y: 800 }, { x: 1390, y: 830 },
                ],
            ],
            buildSpots: [
                { x: 482, y: 422 }, { x: 1106, y: 650, kind: 'high' }, { x: 146, y: 218, kind: 'high' },
                { x: 746, y: 446 }, { x: 1250, y: 686, kind: 'high' }, { x: 410, y: 230 },
                { x: 818, y: 650 }, { x: 566, y: 518 }, { x: 902, y: 746 },
                { x: 242, y: 302 }, { x: 878, y: 470 }, { x: 542, y: 254 },
            ],
            guardians: [{ x: 246, y: 198 }, { x: 582, y: 414 }, { x: 918, y: 642 }],
            // geo:end atlantis
        },
        {
            id: 'buz',
            rule: 'Kar fırtınası: ara sıra 9 sn boyunca kule menzilleri %25 kısalır',
            mechanics: [{ type: 'blizzard', interval: 36, first: 20, warn: 3, duration: 9, rangeMul: 0.75 }],
            name: 'Buz Koyu',
            desc: 'Kutup · Çarpı biçimli kanal',
            stars: 3,
            hpScale: 0.4,
            speedScale: 1.0,
            startMoney: 220,
            waves: 10,
            countScale: 1.1,
            mix: { armored: 1.3 },
            boss: 'crab',
            towers: ['octopus', 'eel', 'jellyfish', 'swordfish', 'puffer'],
            flipSprites: true,
            bg: 'assets/maps/buz.jpg',
            thumb: 'assets/maps/thumbs/buz.jpg',
            ambient: { motes: 90, moteColor: '240,250,255', moteDir: 'down', moteSize: 1.3, bubbles: 0, caustics: 0.10, vignette: 0.24, vignetteColor: '8,28,58' },
            // geo:begin buz
            paths: [
                [
                    { x: -40, y: 70 }, { x: 230, y: 190 }, { x: 480, y: 330 }, { x: 675, y: 450 },
                    { x: 870, y: 570 }, { x: 1030, y: 700 }, { x: 1120, y: 830 }, { x: 1160, y: 945 },
                ],
                [
                    { x: 1390, y: 70 }, { x: 1120, y: 190 }, { x: 870, y: 330 }, { x: 675, y: 450 },
                    { x: 480, y: 570 }, { x: 320, y: 700 }, { x: 230, y: 830 }, { x: 190, y: 945 },
                ],
            ],
            buildSpots: [
                { x: 675, y: 350 }, { x: 495, y: 446 }, { x: 855, y: 446 },
                { x: 675, y: 556 }, { x: 560, y: 625 }, { x: 790, y: 625 },
                { x: 242, y: 290 }, { x: 1108, y: 290 }, { x: 170, y: 62, kind: 'high' },
                { x: 1180, y: 62, kind: 'high' }, { x: 340, y: 800 }, { x: 1010, y: 800 },
                { x: 182, y: 746, kind: 'high' }, { x: 1168, y: 746, kind: 'high' },
            ],
            // geo:end buz
        },
        {
            id: 'girdap',
            rule: 'Girdabın çekimi: yolun ikinci yarısında düşmanlar giderek hızlanır (en çok %35)',
            mechanics: [{ type: 'pull', from: 0.5, factor: 1.35 }],
            name: 'Girdap',
            desc: 'Sualtı · Spiral akıntı, uzun yol',
            stars: 4,
            hpScale: 1.8,
            speedScale: 1.12,
            startMoney: 200,
            waves: 10,
            countScale: 1.2,
            mix: { swarm: 1.5, flying: 0.8 },
            boss: 'manta',
            towers: ['octopus', 'eel', 'jellyfish', 'swordfish', 'puffer'],
            flipSprites: true,
            bg: 'assets/maps/girdap.jpg',
            thumb: 'assets/maps/thumbs/girdap.jpg',
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
            id: 'volkan',
            rule: 'Lav patlamaları: düşmanları yakar, yakındaki kuleleri 5 sn susturur. Bazen lav doğrudan bir kuleye düşer ve onu yok eder, uyarı gelince kuleyi sat!',
            mechanics: [{ type: 'eruption', interval: 16, first: 11, warn: 2.0, radius: 105, count: 2, pct: 0.22, stun: 5, bombChance: 0.3 }],
            name: 'Volkanik Bacalar',
            desc: 'Yanardağ · Üç sütunlu zigzag',
            stars: 4,
            hpScale: 1.6,
            speedScale: 1.0,
            startMoney: 230,
            waves: 10,
            countScale: 1.0,
            mix: { armored: 1.3, swarm: 1.2 },
            boss: 'brood',
            towers: ['octopus', 'eel', 'swordfish', 'puffer', 'angler'],
            flipSprites: true,
            bg: 'assets/maps/volkan.jpg',
            thumb: 'assets/maps/thumbs/volkan.jpg',
            ambient: { motes: 70, moteColor: '255,150,70', bubbles: 0, vignette: 0.42, vignetteColor: '40,6,0' },
            // geo:begin volkan
            paths: [
                [
                    { x: 290, y: -40 }, { x: 290, y: 200 }, { x: 290, y: 520 }, { x: 300, y: 740 },
                    { x: 390, y: 840 }, { x: 520, y: 800 }, { x: 560, y: 600 }, { x: 560, y: 300 },
                    { x: 580, y: 120 }, { x: 690, y: 60 }, { x: 820, y: 110 }, { x: 840, y: 300 },
                    { x: 840, y: 600 }, { x: 850, y: 780 }, { x: 940, y: 850 }, { x: 1060, y: 800 },
                    { x: 1090, y: 600 }, { x: 1090, y: 380 }, { x: 1110, y: 200 }, { x: 1150, y: 120 },
                    { x: 1230, y: 90 }, { x: 1300, y: 40 }, { x: 1390, y: 20 },
                ],
            ],
            buildSpots: [
                { x: 974, y: 650 }, { x: 722, y: 254 }, { x: 446, y: 650, kind: 'high' },
                { x: 1250, y: 170, kind: 'high' }, { x: 410, y: 350 }, { x: 986, y: 470, kind: 'high' },
                { x: 410, y: 506 }, { x: 962, y: 338 }, { x: 698, y: 386 },
                { x: 698, y: 530 }, { x: 698, y: 662 }, { x: 962, y: 206 },
            ],
            // geo:end volkan
        },
        {
            id: 'cukur',
            rule: 'Karanlık: Fener Balığı ışığının dışındaki kulelerin menzili %15 kısalır',
            mechanics: [{ type: 'darkness', rangeMul: 0.85, lightMul: 1.4 }],
            name: 'Derin Çukur',
            desc: 'Sualtı · Karanlık kaya adası',
            stars: 5,
            hpScale: 0.8,
            speedScale: 1,
            startMoney: 320,
            waves: 12,
            countScale: 1.1,
            mix: { armored: 1.5, flying: 1.2 },
            boss: 'crab',
            towers: ['octopus', 'eel', 'jellyfish', 'swordfish', 'angler', 'puffer'],
            flipSprites: true,
            bg: 'assets/maps/cukur.jpg',
            thumb: 'assets/maps/thumbs/cukur.jpg',
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
