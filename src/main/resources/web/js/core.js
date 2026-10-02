// Oyun mantığı. DOM'a dokunmaz, bu yüzden hem oyunda hem Node'da (tools/balans.js) çalışır.
// Çizim, ses ve arayüz js/game.js içinde; buradan gelen olaylara (onEvent) tepki verir.
(function (root) {
    'use strict';

    const ENEMY_TYPES = {
        standard: { speed: 50, hp: 50, reward: 10, damage: 5, armor: 0, flying: false, size: 80 },
        armored: { speed: 25, hp: 75, reward: 20, damage: 10, armor: 100, flying: false, size: 80 },
        flying: { speed: 75, hp: 50, reward: 15, damage: 5, armor: 0, flying: true, size: 80 },
        swarm: { speed: 92, hp: 22, reward: 5, damage: 3, armor: 0, flying: false, size: 56 },
        boss: { speed: 22, hp: 800, reward: 130, damage: 55, armor: 45, flying: false, size: 175 },
    };

    // Patron çeşitleri: her harita birini seçer (map.boss)
    const BOSS_KINDS = {
        shark: { name: 'Kral Köpek Balığı', hp: 1.0, speed: 1.0, armor: 45, flying: false, heavy: false, note: 'dengeli patron',
            fury: { verb: 'ısırıp yuttu', interval: 12, first: 6, targets: 1, casts: 2, range: 340 } },
        crab: { name: 'Dev Kral Yengeç', hp: 1.35, speed: 0.72, armor: 80, flying: false, heavy: true, note: 'çok zırhlı ve yavaş',
            fury: { verb: 'kıskaçla ezip yuttu', interval: 14, first: 7, targets: 1, casts: 2, range: 300 } },
        manta: { name: 'Manta İmparatoru', hp: 0.85, speed: 1.35, armor: 20, flying: true, heavy: false, note: 'havadan gelir',
            fury: { verb: 'şokladı ve yuttu', interval: 10, first: 5, targets: 1, casts: 2, range: 380 } },
        brood: { name: 'Yavru Anası', hp: 1.0, speed: 0.95, armor: 30, flying: false, heavy: false, splits: 8, note: 'yarı canda yavru saçar',
            fury: { verb: 'yumurtalarıyla sarıp yuttu', interval: 12, first: 6, targets: 1, casts: 2, range: 340 } },
    };

    const ENEMY_NAMES = {
        standard: 'Köpek Balığı', armored: 'Istakoz', flying: 'Vatoz',
        swarm: 'Yavru Köpek Balığı', boss: 'Patron',
    };

    // role: markette görünen kısa açıklama
    const TOWER_TYPES = {
        octopus: { name: 'Ahtapot', cost: 50, range: 210, dmg: 9, rate: 0.9, projSpeed: 520, role: 'Hızlı atar, havadakini de vurur. Zırhlı düşmana zayıf.' },
        eel: { name: 'Yılan Balığı', cost: 70, range: 180, dmg: 28, rate: 2.6, aoe: 62, groundOnly: true, pierce: 0.5, role: 'Yere alan şoku verir, zırhı deler. Havadakini vuramaz.' },
        jellyfish: { name: 'Deniz Anası', cost: 60, range: 200, dmg: 12, rate: 1.7, slow: 0.5, slowTime: 3, projSpeed: 480, role: 'Vurduğu düşmanı yavaşlatır, kalabalığı geciktirir.' },
        swordfish: { name: 'Kılıç Balığı', cost: 100, range: 380, dmg: 50, rate: 3.6, projSpeed: 1100, pierce: 0.3, defaultMode: 'strong', role: 'Çok uzun menzilli keskin nişancı. Patronlara %50 fazla hasar verir.' },
        angler: { name: 'Fener Balığı', cost: 80, range: 200, dmg: 17, rate: 1.2, projSpeed: 620, pierce: 0.2, role: 'Dengeli bir kule. Karanlık haritada çevresini aydınlatır, ışığındaki kuleler menzil kaybetmez.' },
        puffer: { name: 'Balon Balığı', cost: 90, range: 270, dmg: 38, rate: 3.0, aoe: 78, lob: true, groundOnly: true, projSpeed: 300, role: 'Havan: düşmanın gideceği yere atar, kümelere alan hasarı verir. Havadakini vuramaz.' },
    };

    // ---------------------------------------------------------------- yetenek ağacı
    // Her kule 3. ve 5. seviyeye çıkarken iki yetenekten birini seçer (toplam 4 seçim, 24 yetenek). `fx` alanları:
    //   çarpanlar: dmgMul rateMul rangeMul aoeMul     toplananlar: shotsAdd pierceAdd lightBonus auraDmg
    //   özel: noHeavy bossHit slow mark poison burn chain crit execute salvo overload pulse slowArea gas auraSlow
    // Etkileri Tower.derive() ile World.fire/strike/afterHit/splash uygular.
    const PERKS = {
        octopus: {
            3: [
                { id: 'oct-twin', name: 'Çift Mürekkep', desc: 'Aynı anda iki hedefe atar; her mermi biraz daha zayıftır.', fx: { shotsAdd: 1, dmgMul: 0.9 } },
                { id: 'oct-pierce', name: 'Delici Mürekkep', desc: 'Zırhın %40\'ını deler, zırhlılara yarı hasar cezası kalkar. Hasar +%10.', fx: { pierceAdd: 0.4, noHeavy: true, dmgMul: 1.1 } },
            ],
            5: [
                { id: 'oct-rain', name: 'Mürekkep Yağmuru', desc: 'Bir hedef daha vurur ve atış aralığı %10 kısalır.', fx: { shotsAdd: 1, rateMul: 0.9 } },
                { id: 'oct-mark', name: 'Karartma Bulutu', desc: 'Vurduğu düşman 4 sn işaretlenir: tüm kulelerden %20 fazla hasar alır.', fx: { mark: { pct: 0.2, time: 4 } } },
            ],
        },
        eel: {
            3: [
                { id: 'eel-chain', name: 'Zincir Şoku', desc: 'Şok alanının dışındaki en yakın 2 yer düşmanına %60 hasarla sıçrar.', fx: { chain: { count: 2, range: 150, mul: 0.6 } } },
                { id: 'eel-wide', name: 'Geniş Şok', desc: 'Şok alanı %45 genişler, hasar %8 azalır. Kalabalıklar için.', fx: { aoeMul: 1.45, dmgMul: 0.92 } },
            ],
            5: [
                { id: 'eel-overload', name: 'Aşırı Yük', desc: 'Her 4. şok iki kat vurur ve düşmanları 1,2 sn sersemletir (patronları 0,4 sn).', fx: { overload: { every: 4, mul: 2, stun: 1.2, stunBoss: 0.4 } } },
                { id: 'eel-burn', name: 'Elektrik Yanığı', desc: 'Şoklanan düşman 3 sn boyunca saniyede canının %2\'sini kaybeder (zırh saymaz, patronlarda %0,8).', fx: { burn: { pct: 0.02, bossPct: 0.008, time: 3 } } },
            ],
        },
        jellyfish: {
            3: [
                { id: 'jel-ice', name: 'Buz Dokunuşu', desc: 'Yavaşlatma çok güçlenir: düşman %65 yavaşlar ve 4,5 sn sürer.', fx: { slow: { factor: 0.35, time: 4.5 } } },
                { id: 'jel-poison', name: 'Zehirli Dokunuş', desc: 'Vurulan düşman 4 sn zehirlenir: saniyede kule hasarının %30\'u kadar, zırh saymaz.', fx: { poison: { dpsMul: 0.3, time: 4 } } },
            ],
            5: [
                { id: 'jel-field', name: 'Elektrikli Su', desc: 'İsabet ettiği yerin 85 piksel çevresindeki herkesi de yavaşlatır.', fx: { slowArea: { radius: 85 } } },
                { id: 'jel-pulse', name: 'Derin Nabız', desc: 'Her 6. atışta menzilinin %80\'indeki tüm düşmanları (havadakiler dahil) 2,5 sn %55 yavaşlatır.', fx: { pulse: { every: 6, rangeMul: 0.8, factor: 0.45, time: 2.5 } } },
            ],
        },
        swordfish: {
            3: [
                { id: 'swo-cut', name: 'Zırh Kesen', desc: 'Zırhın %35 daha fazlasını deler, patronlara %80 fazla hasar verir (normalde %50).', fx: { pierceAdd: 0.35, bossHit: 1.8 } },
                { id: 'swo-aim', name: 'Keskin Nişan', desc: '%25 şansla 2,5 kat vurur (kritik). Menzil +%10.', fx: { crit: { chance: 0.25, mul: 2.5 }, rangeMul: 1.1 } },
            ],
            5: [
                { id: 'swo-hunt', name: 'Av Başı', desc: 'Canı %30\'un altındaki düşmana iki kat hasar verir.', fx: { execute: { below: 0.3, mul: 2 } } },
                { id: 'swo-rain', name: 'Kılıç Yağmuru', desc: 'Her 5. atış menzildeki en güçlü 3 düşmana birden gider.', fx: { salvo: { every: 5, count: 3 } } },
            ],
        },
        angler: {
            3: [
                { id: 'ang-halo', name: 'Aydınlık Çevre', desc: 'Işık alanı %40 büyür; ışığındaki diğer kuleler %10 fazla hasar verir.', fx: { lightBonus: 0.4, auraDmg: 0.1 } },
                { id: 'ang-focus', name: 'Odak Işığı', desc: 'Menzil +%20, hasar +%25: tek başına daha güçlü bir kule.', fx: { rangeMul: 1.2, dmgMul: 1.25 } },
            ],
            5: [
                { id: 'ang-dawn', name: 'Şafak Ağı', desc: 'Işık alanındaki düşmanlar %12 yavaşlar.', fx: { auraSlow: 0.88 } },
                { id: 'ang-twin', name: 'Çifte Işık', desc: 'İki hedefe birden ateş eder, atış aralığı %15 kısalır.', fx: { shotsAdd: 1, rateMul: 0.85 } },
            ],
        },
        puffer: {
            3: [
                { id: 'puf-big', name: 'Büyük Patlama', desc: 'Patlama %35 büyür, hasar +%15, atış %10 yavaşlar.', fx: { aoeMul: 1.35, dmgMul: 1.15, rateMul: 1.1 } },
                { id: 'puf-fast', name: 'Hızlı Namlu', desc: 'Atış aralığı %35 kısalır, hasar %10 azalır.', fx: { rateMul: 0.65, dmgMul: 0.9 } },
            ],
            5: [
                { id: 'puf-gas', name: 'Zehirli Gaz', desc: 'Patlama yerinde 3,5 sn kalan bir gaz bulutu bırakır: içindekilere zırh saymayan hasar verir.', fx: { gas: { dpsMul: 0.45, time: 3.5, radiusMul: 0.85 } } },
                { id: 'puf-goo', name: 'Yapışkan Sıvı', desc: 'Patlamadan etkilenen herkes 3 sn %50 yavaşlar.', fx: { slow: { factor: 0.5, time: 3 } } },
            ],
        },
    };

    const perkOptions = (type, level) => (PERKS[type] && PERKS[type][level]) || null;
    const findPerk = (type, level, id) => {
        const list = perkOptions(type, level);
        return list ? (list.find(o => o.id === id) || null) : null;
    };

    const MAX_LEVEL = 5;
    const SLOW_VULNERABILITY = 1.2;   // yavaşlamış düşman %20 fazla hasar alır (Deniz Anası ile birlikte oynamak karşılığını verir)
    const ADAPT_FROM_WAVE = 4;        // düşmanlar bu dalgadan sonra en çok hasar veren türe alışmaya başlar
    const ADAPT_FREE_SHARE = 0.55;    // bir türün hasar payı bunun altındaysa alışma olmaz
    const ADAPT_MAX = 0.25;           // en çok %25 hasar azalması
    const BUILD_SPOT_RADIUS = 55;
    const HIGH_GROUND_RANGE = 1.2;
    const TARGET_MODES = ['first', 'last', 'strong', 'close'];

    // Zorluk: oyunu gerçekten değiştiren ayarlar (arayüzde de gösterilir).
    // startBonus: haritanın başlangıç enerjisine eklenir (kolay +50, zor -50: yuvarlak sayılar).
    // costStep: aynı türden her yeni kulenin fiyat artışı (yalnızca zorda var; yığılmayı alışma da cezalandırır).
    const DIFFICULTY = {
        easy: { label: 'Kolay', hp: 0.9, speed: 0.97, startBonus: 50, reward: 1.08, bonus: 1.15, refund: 0.6, health: 120, costStep: 0 },
        normal: { label: 'Normal', hp: 1.0, speed: 1.0, startBonus: 0, reward: 1.0, bonus: 1.0, refund: 0.5, health: 100, costStep: 0 },
        hard: { label: 'Zor', hp: 1.06, speed: 1.03, startBonus: -50, reward: 0.97, bonus: 0.95, refund: 0.45, health: 90, costStep: 0.06 },
    };

    function describeDifficulty(d) {
        const pct = (v, label) => (Math.abs(v - 1) < 0.005 ? null : `${label} ${v > 1 ? '+' : ''}${Math.round((v - 1) * 100)}%`);
        const parts = [pct(d.hp, 'düşman canı'), pct(d.speed, 'düşman hızı'), d.startBonus ? `başlangıç enerjisi ${d.startBonus > 0 ? '+' : ''}${d.startBonus}` : null,
            pct(d.reward, 'öldürme ödülü'), pct(d.bonus, 'dalga bonusu')].filter(Boolean);
        const head = parts.length ? parts.join(' · ') : 'Standart ayarlar';
        const price = d.costStep ? `aynı türden her kule +%${Math.round(d.costStep * 100)} pahalı` : 'sabit kule fiyatı';
        return `${head} · ${price} · üs canı ${d.health} · satış iadesi %${Math.round(d.refund * 100)}`;
    }

    function mulberry32(seed) {
        let a = seed >>> 0;
        return function () {
            a = (a + 0x6D2B79F5) >>> 0;
            let t = a;
            t = Math.imul(t ^ (t >>> 15), t | 1);
            t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    }

    function catmullRom(p0, p1, p2, p3, t) {
        const t2 = t * t;
        const t3 = t2 * t;
        return {
            x: 0.5 * ((2 * p1.x) + (-p0.x + p2.x) * t +
                (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 +
                (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
            y: 0.5 * ((2 * p1.y) + (-p0.y + p2.y) * t +
                (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 +
                (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3)
        };
    }

    function generateSmoothPath(points, pointsPerSegment = 20) {
        const smooth = [];
        for (let i = 0; i < points.length - 1; i++) {
            const p0 = points[Math.max(0, i - 1)];
            const p1 = points[i];
            const p2 = points[i + 1];
            const p3 = points[Math.min(points.length - 1, i + 2)];
            for (let j = 0; j < pointsPerSegment; j++) {
                smooth.push(catmullRom(p0, p1, p2, p3, j / pointsPerSegment));
            }
        }
        smooth.push(points[points.length - 1]);
        return smooth;
    }

    function buildPath(controlPoints) {
        const points = generateSmoothPath(controlPoints);
        const dist = [0];
        let total = 0;
        for (let i = 1; i < points.length; i++) {
            total += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
            dist.push(total);
        }
        return { points, dist, length: total };
    }

    function mapPaths(map) {
        return map.paths || [map.pathPoints];
    }

    // ---------------------------------------------------------------- dalga planı

    function waveHpScale(n) {
        return 1.25 * (1 + 0.30 * (n - 1) + 0.035 * (n - 1) * (n - 1));
    }

    function totalWavesOf(map) {
        return map.waves || 10;
    }

    // n. dalganın düşman listesi. Aynı (harita, n, seed) her zaman aynı listeyi verir,
    // böylece arayüz bir sonraki dalgayı önceden gösterebilir.
    function buildWavePlan(map, n, seed) {
        const rng = mulberry32((seed ^ (n * 7919)) >>> 0);
        const total = totalWavesOf(map);
        const pool = map.enemyPool || ['standard', 'armored', 'flying', 'swarm', 'boss'];
        const mix = Object.assign({ standard: 1, armored: 1, flying: 1, swarm: 1 }, map.mix);
        const lanes = mapPaths(map).length;
        const has = t => pool.includes(t);
        const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

        const base = Math.round((3 + 1.9 * n + 0.08 * n * n) * (map.countScale || 1));
        const armoredShare = has('armored') && n >= 2 ? clamp((0.10 + 0.03 * n) * mix.armored, 0, 0.5) : 0;
        const flyingShare = has('flying') && n >= 3 ? clamp((0.10 + 0.02 * n) * mix.flying, 0, 0.45) : 0;
        const nArmored = Math.round(base * armoredShare);
        const nFlying = Math.round(base * flyingShare);
        const nStandard = Math.max(1, base - nArmored - nFlying);

        let items = [];
        const push = (type, count) => { for (let i = 0; i < count; i++) items.push({ type, gap: 0 }); };
        push('standard', nStandard);
        push('armored', nArmored);
        push('flying', nFlying);

        for (let i = items.length - 1; i > 0; i--) {
            const j = Math.floor(rng() * (i + 1));
            [items[i], items[j]] = [items[j], items[i]];
        }

        const gap = Math.max(0.55, 1.5 - 0.06 * n);
        items.forEach(it => { it.gap = gap * (0.85 + rng() * 0.3); });

        if (has('swarm') && n >= 2 && n % 2 === 0) {
            const count = Math.round((6 + 1.2 * n) * mix.swarm);
            const pack = [];
            for (let i = 0; i < count; i++) pack.push({ type: 'swarm', gap: 0.32 });
            pack[0].gap = 2.2;
            const at = Math.floor(rng() * (items.length + 1));
            items.splice(at, 0, ...pack);
        }

        if (has('boss')) {
            const kind = map.boss || 'shark';
            // sonsuz modda döngü: her 'total' dalgada bir patron, ortalarında ara patron
            const m = n % total;
            if (m === 0) {
                items.push({ type: 'boss', kind, gap: 3, hpMul: 1 });
            } else if (total >= 8 && m === Math.floor(total / 2)) {
                items.push({ type: 'boss', kind, gap: 3, hpMul: 0.35, mini: true });
            }
        }

        items.forEach((it, i) => { it.lane = lanes > 1 ? (i + (rng() < 0.15 ? 1 : 0)) % lanes : 0; });
        return items;
    }

    function summarizePlan(plan) {
        const counts = {};
        plan.forEach(it => { counts[it.type] = (counts[it.type] || 0) + 1; });
        return counts;
    }

    // ---------------------------------------------------------------- varlıklar

    // yol üzerinde d mesafesindeki nokta
    function pointAt(path, d) {
        d = Math.max(0, Math.min(path.length, d));
        const dist = path.dist;
        let lo = 0;
        let hi = dist.length - 1;
        while (hi - lo > 1) {
            const mid = (lo + hi) >> 1;
            if (dist[mid] <= d) lo = mid; else hi = mid;
        }
        const a = path.points[lo];
        const b = path.points[hi];
        const len = dist[hi] - dist[lo] || 1;
        const t = (d - dist[lo]) / len;
        return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
    }

    class Enemy {
        constructor(world, type, lane, id, waveNo, spawn) {
            const st = ENEMY_TYPES[type];
            const diff = world.diff;
            const hpMul = (spawn && spawn.hpMul) || 1;
            this.id = id;
            this.type = type;
            this.lane = lane;
            this.waveNo = waveNo;
            this.mini = !!(spawn && spawn.mini);
            this.kind = type === 'boss' ? ((spawn && spawn.kind) || 'shark') : null;
            const bk = this.kind ? BOSS_KINDS[this.kind] : null;
            this.name = (world.map.enemyNames && world.map.enemyNames[type]) || ENEMY_NAMES[type] || type;
            if (bk) this.name = this.mini ? 'Ara Patron · ' + bk.name : bk.name;
            this.flying = bk ? bk.flying : st.flying;
            this.armor = bk ? bk.armor : st.armor;
            this.heavy = type === 'armored' || (bk ? bk.heavy : false);
            this.splits = bk && bk.splits && !this.mini ? bk.splits : 0;
            this.size = st.size * (this.mini ? 0.75 : 1);
            // hpScale ilk dalgada 1'dir, son dalgada haritanın değerine ulaşır: erken oyun herkes için yumuşak kalır
            const base = totalWavesOf(world.map);
            const mapRamp = 1 + ((world.map.hpScale || 1) - 1) * Math.min(1, (waveNo - 1) / Math.max(1, base - 1));
            this.maxHealth = Math.round(st.hp * (bk ? bk.hp : 1) * hpMul * waveHpScale(waveNo) * diff.hp * mapRamp);
            this.health = this.maxHealth;
            this.speed = st.speed * (bk ? bk.speed : 1) * (world.map.speedScale || 1) * diff.speed * (1 + 0.012 * (waveNo - 1));
            this.originalSpeed = this.speed;
            this.reward = Math.round(st.reward * (1 + 0.05 * (waveNo - 1)) * diff.reward * (this.mini ? 1.4 : 1));
            this.damage = this.mini ? Math.round(st.damage * 0.5) : st.damage;
            this.slowTime = 0;
            this.isSlowed = false;
            this.markT = 0;        // işaretli: tüm kulelerden fazla hasar alır
            this.markPct = 0;
            this.dotT = 0;         // zehir / yanık (zırh saymayan zamanla hasar)
            this.dotDps = 0;
            this.dotType = null;
            this.auraMul = 1;      // ışık ağı gibi alan etkilerinden gelen hız çarpanı
            this.traveled = 0;
            this.segment = 0;
            this.path = world.paths[lane] || world.paths[0];
            this.angle = 0;
            this.dirX = 1;
            this.born = world.time;
            this.x = this.path.points[0].x;
            this.y = this.path.points[0].y;
            this.lastHit = -10;
            this.didSplit = false;
            this.stunTime = 0;
            // patron saldırısı: aralıklarla yakındaki 1-2 kuleyi yutar
            this.fury = bk ? Object.assign({}, bk.fury) : null;
            if (this.fury && this.mini) this.fury.casts = 1;      // ara patron yalnızca bir kez saldırır
            this.furyCasts = 0;
            this.furyTimer = this.fury ? this.fury.first : 0;
            this.furyPhase = 'idle';
            this.furyT = 0;
            this.furyTargets = [];
            this.pathMul = world.pathSpeedFn(lane);   // haritaya özel yavaşlatma/hızlandırma bölgeleri
            this.zoneMul = 1;
        }

        get progress() { return this.traveled / this.path.length; }

        // true dönerse düşman üsse ulaşmıştır
        update(dt) {
            if (this.slowTime > 0) {
                this.slowTime -= dt;
                if (this.slowTime <= 0) {
                    this.speed = this.originalSpeed;
                    this.isSlowed = false;
                }
            }
            if (this.stunTime > 0) {
                this.stunTime -= dt;
                return false;
            }
            this.zoneMul = this.pathMul ? this.pathMul(this.traveled / this.path.length) : 1;
            this.traveled += this.speed * this.zoneMul * this.auraMul * dt;
            if (this.traveled >= this.path.length) return true;

            const d = this.path.dist;
            while (this.segment < d.length - 2 && this.traveled > d[this.segment + 1]) this.segment++;
            while (this.segment > 0 && this.traveled < d[this.segment]) this.segment--;
            const a = this.path.points[this.segment];
            const b = this.path.points[this.segment + 1];
            const segLen = d[this.segment + 1] - d[this.segment];
            const t = segLen > 0 ? (this.traveled - d[this.segment]) / segLen : 0;
            this.x = a.x + (b.x - a.x) * t;
            this.y = a.y + (b.y - a.y) * t;
            this.angle = Math.atan2(b.y - a.y, b.x - a.x);
            if (Math.abs(b.x - a.x) > 0.01) this.dirX = b.x > a.x ? 1 : -1;
            return false;
        }

        // o: kulenin vuruş ayarları (Tower.strikeOpts): noHeavy, bossHit, executeBelow, executeMul
        takeDamage(amount, towerType, pierce, o) {
            o = o || {};
            if (towerType === 'octopus' && this.heavy && !o.noHeavy) amount *= 0.5;
            if (this.type === 'boss') amount *= o.bossHit || (towerType === 'swordfish' ? 1.5 : 1);
            if (this.isSlowed) amount *= SLOW_VULNERABILITY;      // yavaşlayan düşman daha kolay vurulur
            if (this.markT > 0) amount *= 1 + this.markPct;       // işaretli düşman her kuleden fazla hasar alır
            if (o.executeBelow && this.health <= this.maxHealth * o.executeBelow) amount *= o.executeMul;
            const armor = this.armor * (1 - (pierce || 0));
            const actual = amount * (1 - armor / (armor + 100));
            this.health -= actual;
            const dead = this.health <= 0;
            if (dead) this.health = 0;
            return { dead, dmg: actual };
        }

        slowDown(factor, time) {
            if (this.type === 'boss') factor = 1 - (1 - factor) * 0.5;
            this.speed = this.originalSpeed * factor;
            this.slowTime = time;
            this.isSlowed = true;
        }
    }

    class Tower {
        constructor(world, type, spot, id) {
            this.world = world;
            this.id = id;
            this.type = type;
            this.spot = spot;
            this.x = spot.x;
            this.y = spot.y;
            this.name = (world.map.towerNames && world.map.towerNames[type]) || TOWER_TYPES[type].name;
            this.level = 1;
            this.lastFire = 0;
            this.target = null;
            this.mode = TOWER_TYPES[type].defaultMode || 'first';
            this.invested = 0;
            this.firedAt = -10;
            this.stun = 0;        // lav patlaması gibi olaylarla geçici susturma (sn)
            this.dark = false;    // karanlık haritada ışık dışında kalma
            this.perks = {};      // seviye (3, 5) -> seçilen yeteneğin kimliği
            this.shotCount = 0;   // 'her n. atış' yetenekleri için sayaç
            this.auraBonus = 0;   // yakındaki Fener Balığı'ndan gelen hasar bonusu
            this.derive();
        }

        // seçilen yeteneklerin birleşik etkisi
        perkFx() {
            const out = { dmgMul: 1, rateMul: 1, rangeMul: 1, aoeMul: 1, shotsAdd: 0, pierceAdd: 0, lightBonus: 0, auraDmg: 0 };
            for (const lv of [3, 5]) {
                if (this.level < lv) continue;
                const opt = findPerk(this.type, lv, this.perks[lv]);
                if (!opt) continue;
                for (const [k, v] of Object.entries(opt.fx)) {
                    if (k.endsWith('Mul')) out[k] *= v;
                    else if (k === 'shotsAdd' || k === 'pierceAdd' || k === 'lightBonus' || k === 'auraDmg') out[k] += v;
                    else out[k] = v;
                }
            }
            return out;
        }

        // seçilmiş yeteneklerin adı ve açıklaması (arayüz için)
        perkLines() {
            const out = [];
            for (const lv of [3, 5]) {
                const opt = this.level >= lv ? findPerk(this.type, lv, this.perks[lv]) : null;
                if (opt) out.push({ level: lv, name: opt.name, desc: opt.desc, id: opt.id });
            }
            return out;
        }

        // seviyeye, zemine, yeteneklere ve destek kulelerine göre güncel değerler
        derive() {
            const st = TOWER_TYPES[this.type];
            const L = this.level - 1;
            const fx = this.fx = this.perkFx();
            const high = this.spot.kind === 'high' ? HIGH_GROUND_RANGE : 1;
            this.dmg = Math.round(st.dmg * (1 + 0.35 * L) * fx.dmgMul * (1 + (this.auraBonus || 0)));
            const w = this.world;
            const envMul = (w ? w.rangeMul : 1) * (this.dark && w ? w.darkMul : 1);
            this.range = Math.round(st.range * (1 + 0.07 * L) * high * envMul * fx.rangeMul);
            this.rate = +(st.rate * (1 - 0.11 * L) * fx.rateMul).toFixed(2);
            this.aoe = st.aoe ? Math.round(st.aoe * (1 + 0.05 * L) * fx.aoeMul) : 0;
            this.slow = st.slow || 0;
            this.slowTime = st.slowTime ? st.slowTime + 0.25 * L : 0;
            if (fx.slow) { this.slow = fx.slow.factor; this.slowTime = fx.slow.time; }
            this.shots = 1 + fx.shotsAdd;
            this.pierce = (st.pierce || 0) + fx.pierceAdd;
            this.strikeOpts = {
                noHeavy: !!fx.noHeavy,
                bossHit: fx.bossHit || (this.type === 'swordfish' ? 1.5 : 1),
                executeBelow: fx.execute ? fx.execute.below : 0,
                executeMul: fx.execute ? fx.execute.mul : 1,
            };
        }

        // Yükseltme ve yetenek özeti
        perk() {
            const lines = this.perkLines().map(l => `${l.name}: ${l.desc}`);
            return lines.length ? lines.join('\n') : (this.type === 'angler' ? 'Karanlık haritada çevresini aydınlatır: ışığındaki kuleler menzil cezası almaz.' : '');
        }

        // bir sonraki seviyeye çıkarken yetenek seçimi gerekiyorsa seçenekler
        nextPerkOptions() {
            return this.level < MAX_LEVEL ? perkOptions(this.type, this.level + 1) : null;
        }

        upgradeCost() {
            if (this.level >= MAX_LEVEL) return null;
            const base = TOWER_TYPES[this.type].cost;
            return Math.round(base * [0.8, 1.3, 2.0, 3.0][this.level - 1]);
        }

        sellValue(refund) { return Math.round(this.invested * (refund != null ? refund : 0.5)); }

        canTarget(enemy) {
            return !(TOWER_TYPES[this.type].groundOnly && enemy.flying);
        }

        pick(enemies) {
            let best = null;
            let bestScore = -Infinity;
            for (const e of enemies) {
                if (e.health <= 0 || !this.canTarget(e)) continue;
                const d = Math.hypot(e.x - this.x, e.y - this.y);
                if (d > this.range) continue;
                let score;
                switch (this.mode) {
                    case 'last': score = -e.progress; break;
                    case 'strong': score = e.health; break;
                    case 'close': score = -d; break;
                    default: score = e.progress;
                }
                if (score > bestScore) { bestScore = score; best = e; }
            }
            return best;
        }
    }

    class Projectile {
        constructor(tower, target, aim) {
            this.x = tower.x;
            this.y = tower.y;
            if (tower.type === 'swordfish' && target) {
                // mermi kılıcın ucundan çıkar
                const d = Math.hypot(target.x - tower.x, target.y - tower.y) || 1;
                this.x = tower.x + 4 + ((target.x - tower.x) / d) * 52;
                this.y = tower.y + 10 + ((target.y - tower.y) / d) * 52;
            }
            this.sx = this.x;
            this.sy = this.y;
            this.target = target;
            this.owner = tower;
            this.type = tower.type;
            this.dmg = tower.dmg;
            this.slow = tower.slow;
            this.slowTime = tower.slowTime;
            this.pierce = tower.pierce;
            this.aoe = tower.aoe;
            this.lob = !!TOWER_TYPES[tower.type].lob;
            this.speed = TOWER_TYPES[tower.type].projSpeed || 500;
            this.active = true;
            this.angle = 0;
            if (this.lob) {
                // havan: hedefin ilerleyeceği noktaya doğru uçar
                this.tx = aim.x;
                this.ty = aim.y;
                this.total = Math.hypot(aim.x - tower.x, aim.y - tower.y) || 1;
            }
        }

        // 0..1 uçuş ilerlemesi (yalnızca havan)
        get flight() { return this.lob ? Math.min(1, Math.hypot(this.x - this.sx, this.y - this.sy) / this.total) : 0; }
    }

    // ---------------------------------------------------------------- dünya

    class World {
        constructor(map, opts = {}) {
            this.map = map;
            this.diffKey = opts.difficulty || 'normal';
            this.diff = DIFFICULTY[this.diffKey];
            this.seed = opts.seed != null ? opts.seed : Date.now();
            this.onEvent = opts.onEvent || (() => { });

            this.paths = mapPaths(map).map(buildPath);
            this.spots = map.buildSpots.map(s => ({ x: s.x, y: s.y, kind: s.kind || 'normal', tower: null }));
            this.totalWaves = totalWavesOf(map);
            this.endless = false;
            this.available = map.towers || Object.keys(TOWER_TYPES);
            this.rng = mulberry32((this.seed ^ 0x5bd1e995) >>> 0);
            this.initMechanics();

            this.health = this.diff.health;
            this.maxHealth = this.diff.health;
            this.money = (map.startMoney || 250) + this.diff.startBonus;
            this.wave = 0;
            this.time = 0;
            this.enemies = [];
            this.towers = [];
            this.projectiles = [];
            this.queue = [];
            this.spawnTimer = 0;
            this.unclearedWaves = [];
            this.nextEnemyId = 1;
            this.nextTowerId = 1;
            this.result = null;
            this.stats = { kills: 0, leaks: 0, earned: 0 };
            this.plans = {};
            this.gas = [];        // Balon Balığı'nın zehirli gaz bulutları
            this.dealt = {};      // tür başına verilen hasar (alışma hesabı için)
            this.adapt = {};      // tür -> düşmanların o türe karşı kazandığı direnç (0..0.3)
        }

        emit(type, data) { this.onEvent(type, data); }

        planFor(n) {
            if (!this.plans[n]) this.plans[n] = buildWavePlan(this.map, n, this.seed);
            return this.plans[n];
        }

        // ---- haritaya özel mekanikler (maps.js içindeki `mechanics` listesi)

        initMechanics() {
            const list = this.map.mechanics || [];
            this.rangeMul = 1;
            this.darkMul = 1;
            this.treasure = null;
            this.meteors = [];
            this.mech = list.map(cfg => {
                const m = { cfg, phase: 'idle', t: 0, timer: cfg.first != null ? cfg.first : (cfg.interval || 20) * 0.7 };
                if (cfg.type === 'guardians') {
                    const g = this.map.guardians || [];
                    m.guards = g.map((p, i) => ({ x: p.x, y: p.y, timer: (cfg.first || 8) + (i * cfg.interval) / Math.max(1, g.length), warned: false }));
                }
                if (cfg.type === 'darkness') this.darkMul = cfg.rangeMul;
                return m;
            });
        }

        // yoldaki yavaşlatma (tangle) ve çekim (pull) bölgeleri için ilerlemeye göre hız çarpanı
        pathSpeedFn(lane) {
            const zones = [];
            let pull = null;
            for (const m of (this.map.mechanics || [])) {
                if (m.type === 'tangle') {
                    for (const z of m.zones) if (z.lane == null || z.lane === lane) zones.push(z);
                }
                if (m.type === 'pull') pull = m;
            }
            if (!zones.length && !pull) return null;
            return (p) => {
                let mul = 1;
                for (const z of zones) if (p >= z.from && p <= z.to) mul *= z.factor;
                if (pull && p > pull.from) {
                    const k = Math.min(1, (p - pull.from) / (1 - pull.from));
                    mul *= 1 + (pull.factor - 1) * k;
                }
                return mul;
            };
        }

        // Fener Balığı'nın ışık yarıçapı (karanlık haritada kulelerin cezadan kurtulduğu alan)
        lightRadius(t) {
            const d = (this.map.mechanics || []).find(m => m.type === 'darkness');
            return t.range * (d && d.lightMul ? d.lightMul : 1) * (1 + (t.fx ? t.fx.lightBonus : 0));
        }

        setRangeMul(m) {
            this.rangeMul = m;
            this.towers.forEach(t => t.derive());
        }

        // çevre hasarı (zırh saymaz); patronlar yüzde olarak sınırlanır
        envDamage(e, amount) {
            if (e.health <= 0) return;
            if (e.type === 'boss') amount = Math.min(amount, e.maxHealth * 0.05);
            e.health -= amount;
            e.lastHit = this.time;
            if (e.health <= 0) {
                e.health = 0;
                this.money += e.reward;
                this.stats.kills++;
                this.stats.earned += e.reward;
                this.emit('kill', { enemy: e, reward: e.reward, env: true });
            }
        }

        updateMechanics(dt) {
            const live = this.enemies.length > 0;
            for (const m of this.mech) {
                switch (m.cfg.type) {
                    case 'eruption': this.tickEruption(m, dt, live); break;
                    case 'blizzard': this.tickBlizzard(m, dt, live); break;
                    case 'guardians': this.tickGuardians(m, dt, live); break;
                    case 'treasure': this.tickTreasure(m, dt, live); break;
                    default: break;
                }
            }
        }

        // -- patron saldırısı: önce hırlar ve kuleye yönelir, sonra kuleyi yer (kule yok olur)
        tickBoss(e, dt) {
            const f = e.fury;
            if (e.furyPhase === 'done') return;
            if (e.furyPhase === 'idle') {
                e.furyTimer -= dt;
                if (e.furyTimer > 0) return;
                const targets = this.towers
                    .filter(t => Math.hypot(t.x - e.x, t.y - e.y) <= f.range)
                    .sort((a, b) => (b.level - a.level) || (Math.hypot(a.x - e.x, a.y - e.y) - Math.hypot(b.x - e.x, b.y - e.y)))
                    .slice(0, f.targets);
                if (!targets.length) { e.furyTimer = 1.5; return; }
                e.furyTargets = targets;
                e.furyPhase = 'cast';
                e.furyT = 1.4;
                this.emit('bossFury', { enemy: e, towers: targets, time: e.furyT });
            } else {
                e.furyT -= dt;
                if (e.furyT > 0) return;
                for (const t of e.furyTargets) {
                    if (this.towers.includes(t)) this.destroyTower(t, 'patron', e);
                }
                e.furyTargets = [];
                e.furyCasts++;
                e.furyPhase = e.furyCasts >= f.casts ? 'done' : 'idle';
                e.furyTimer = f.interval;
            }
        }

        // -- lav patlaması: önce uyarı çemberi, sonra düşmanları yakar, yakındaki kuleleri susturur
        tickEruption(m, dt, live) {
            const c = m.cfg;
            if (m.phase === 'idle') {
                if (!live) return;
                m.timer -= dt;
                if (m.timer > 0) return;
                const pts = this.pickEruptionPoints(c.count || 2, c.radius, c.warn);
                if (!pts.length) { m.timer = 3; return; }
                m.phase = 'warn';
                m.t = c.warn;
                m.points = pts;
                this.emit('hazardWarn', { type: 'eruption', points: pts, time: c.warn });
            } else {
                m.t -= dt;
                if (m.t > 0) return;
                for (const p of m.points) {
                    this.emit('eruption', { x: p.x, y: p.y, r: p.r });
                    for (const e of this.enemies) {
                        if (e.health > 0 && Math.hypot(e.x - p.x, e.y - p.y) <= p.r) {
                            this.envDamage(e, Math.max(18, c.pct * e.maxHealth));
                        }
                    }
                    for (const t of this.towers) {
                        if (Math.hypot(t.x - p.x, t.y - p.y) <= p.r + 25) {
                            t.stun = c.stun;
                            this.emit('towerStun', { tower: t, time: c.stun });
                        }
                    }
                }
                // bazen patlamayla birlikte bir kuleye lav kayası düşer: uyarı yoktur, kule doğrudan yok olur
                if (c.bombChance && this.towers.length && this.rng() < c.bombChance) {
                    const tw = this.towers[Math.floor(this.rng() * this.towers.length)];
                    const fall = c.fall || 0.8;
                    this.meteors.push({ t: fall, towerId: tw.id, x: tw.x, y: tw.y });
                    this.emit('meteor', { x: tw.x, y: tw.y, time: fall, towerId: tw.id });
                }
                m.phase = 'idle';
                m.timer = c.interval;
            }
        }

        // düşen lav kayaları: yere varınca kule yok olur
        tickMeteors(dt) {
            for (const mt of this.meteors) {
                mt.t -= dt;
                if (mt.t > 0) continue;
                this.emit('eruption', { x: mt.x, y: mt.y, r: 58, bomb: true });
                const tw = this.towers.find(t => t.id === mt.towerId);
                if (tw) this.destroyTower(tw, 'lav');
            }
            this.meteors = this.meteors.filter(mt => mt.t > 0);
        }

        pickEruptionPoints(n, r, warn) {
            const cand = this.enemies.filter(e => e.health > 0 && e.progress > 0.08 && e.progress < 0.92);
            const pts = [];
            while (pts.length < n && cand.length) {
                const e = cand.splice(Math.floor(this.rng() * cand.length), 1)[0];
                // düşmanın uyarı süresince gideceği yer
                const q = pointAt(e.path, e.traveled + e.speed * warn);
                if (pts.every(p => Math.hypot(p.x - q.x, p.y - q.y) > r * 1.4)) pts.push({ x: q.x, y: q.y, r });
            }
            return pts;
        }

        // -- kar fırtınası: kule menzilleri geçici olarak kısalır
        tickBlizzard(m, dt, live) {
            const c = m.cfg;
            if (m.phase === 'idle') {
                if (!live) return;
                m.timer -= dt;
                if (m.timer > 0) return;
                m.phase = 'warn';
                m.t = c.warn;
                this.emit('hazardWarn', { type: 'blizzard', time: c.warn });
            } else if (m.phase === 'warn') {
                m.t -= dt;
                if (m.t > 0) return;
                m.phase = 'storm';
                m.t = c.duration;
                this.setRangeMul(c.rangeMul);
                this.emit('hazardStart', { type: 'blizzard', time: c.duration });
            } else {
                m.t -= dt;
                if (m.t > 0) return;
                m.phase = 'idle';
                m.timer = c.interval;
                this.setRangeMul(1);
                this.emit('hazardEnd', { type: 'blizzard' });
            }
        }

        get stormActive() { return this.mech.some(m => m.cfg.type === 'blizzard' && m.phase === 'storm'); }

        // -- Atlantis koruyucuları: periyodik darbe, hasar + sersemletme
        tickGuardians(m, dt, live) {
            if (!live) return;
            const c = m.cfg;
            for (const g of m.guards) {
                g.timer -= dt;
                if (!g.warned && g.timer <= 1.0) {
                    g.warned = true;
                    this.emit('guardianWarn', { x: g.x, y: g.y, r: c.radius });
                }
                if (g.timer > 0) continue;
                g.timer = c.interval;
                g.warned = false;
                let hits = 0;
                for (const e of this.enemies) {
                    if (e.health <= 0 || Math.hypot(e.x - g.x, e.y - g.y) > c.radius) continue;
                    hits++;
                    this.envDamage(e, c.flat + c.pct * e.maxHealth);
                    e.stunTime = Math.max(e.stunTime, e.type === 'boss' ? 0.4 : c.stun);
                }
                this.emit('guardianPulse', { x: g.x, y: g.y, r: c.radius, hits });
            }
        }

        // -- batık hazine: sandık ara sıra parlar, tıklayarak altın alınır
        tickTreasure(m, dt, live) {
            const c = m.cfg;
            if (!this.treasure) {
                if (!live) return;
                m.timer -= dt;
                if (m.timer > 0) return;
                const pos = this.map.treasure;
                this.treasure = { x: pos.x, y: pos.y, life: c.life, max: c.life, reward: Math.round((c.reward + 6 * this.wave) * this.diff.reward) };
                this.emit('treasureOpen', this.treasure);
            } else {
                this.treasure.life -= dt;
                if (this.treasure.life <= 0) {
                    this.treasure = null;
                    m.timer = c.interval;
                    this.emit('treasureClose', {});
                }
            }
        }

        collectTreasure() {
            const t = this.treasure;
            if (!t) return false;
            this.money += t.reward;
            this.stats.earned += t.reward;
            this.treasure = null;
            const m = this.mech.find(x => x.cfg.type === 'treasure');
            if (m) m.timer = m.cfg.interval;
            this.emit('treasureTaken', { x: t.x, y: t.y, reward: t.reward });
            return true;
        }

        // ---- kule işlemleri

        towerCost(type) {
            const owned = this.towers.filter(t => t.type === type).length;
            const raw = TOWER_TYPES[type].cost * (1 + this.diff.costStep * owned);
            return Math.round(raw / 5) * 5;
        }

        placeTower(type, spot) {
            if (this.result) return { ok: false, reason: 'over' };
            if (!this.available.includes(type)) return { ok: false, reason: 'unavailable' };
            if (!spot || spot.tower) return { ok: false, reason: 'occupied' };
            const cost = this.towerCost(type);
            if (this.money < cost) return { ok: false, reason: 'money', cost };
            this.money -= cost;
            const tower = new Tower(this, type, spot, this.nextTowerId++);
            tower.invested = cost;
            spot.tower = tower;
            this.towers.push(tower);
            this.refreshLight();
            this.emit('build', { tower, cost });
            return { ok: true, tower, cost };
        }

        // choice: yetenek seçimi gereken seviyelerde seçenek sırası (0 ya da 1); verilmezse ilk seçenek
        upgradeTower(tower, choice) {
            const cost = tower.upgradeCost();
            if (cost === null || this.money < cost) return false;
            this.money -= cost;
            tower.level++;
            tower.invested += cost;
            let perk = null;
            const opts = perkOptions(tower.type, tower.level);
            if (opts) {
                perk = opts[choice === 1 ? 1 : 0];
                tower.perks[tower.level] = perk.id;
            }
            tower.derive();
            this.refreshLight();
            this.emit('upgrade', { tower, cost, perk });
            return true;
        }

        sellTower(tower) {
            const refund = tower.sellValue(this.diff.refund);
            this.money += refund;
            tower.spot.tower = null;
            this.towers = this.towers.filter(t => t !== tower);
            this.projectiles.forEach(p => { if (p.owner === tower) p.active = false; });
            this.refreshLight();
            this.emit('sell', { tower, refund });
            return refund;
        }

        // Karanlık haritada Fener Balığı'nın ışığındaki kuleler menzil cezası almaz
        refreshLight() {
            const lights = this.towers.filter(t => t.type === 'angler');
            for (const t of this.towers) {
                // Aydınlık Çevre yeteneği: ışığındaki diğer kuleler daha çok hasar verir
                let bonus = 0;
                for (const l of lights) {
                    if (l !== t && l.fx && l.fx.auraDmg && Math.hypot(l.x - t.x, l.y - t.y) <= this.lightRadius(l)) bonus += l.fx.auraDmg;
                }
                t.auraBonus = Math.min(0.2, bonus);
                t.dark = this.darkMul < 1 && !lights.some(l => Math.hypot(l.x - t.x, l.y - t.y) <= this.lightRadius(l));
                t.derive();
            }
        }

        // kuleyi yok eder (patron yutması, lav kayası); satış gibi para iadesi yoktur
        destroyTower(t, cause, by) {
            if (!this.towers.includes(t)) return;
            t.spot.tower = null;
            this.towers = this.towers.filter(x => x !== t);
            this.projectiles.forEach(p => { if (p.owner === t) p.active = false; });
            this.stats.lost = (this.stats.lost || 0) + 1;
            this.refreshLight();
            this.emit('towerDestroyed', { tower: t, cause, by: by || null });
        }

        // ---- kaydet / devam et
        // Oyunun anlık durumunu küçük bir nesneye çevirir (JSON'a yazılabilir). Uçuştaki mermiler, düşen kayalar ve
        // süren mekanik uyarıları kaydedilmez; devam edildiğinde bunlar sıfırlanır.
        serialize() {
            const r = v => Math.round(v * 1000) / 1000;
            return {
                v: 1,
                diff: this.diffKey,
                seed: this.seed,
                endless: this.endless,
                totalWaves: this.totalWaves,
                wave: this.wave,
                time: r(this.time),
                health: r(this.health),
                money: this.money,
                stats: Object.assign({}, this.stats),
                unclearedWaves: this.unclearedWaves.slice(),
                nextEnemyId: this.nextEnemyId,
                nextTowerId: this.nextTowerId,
                dealt: Object.assign({}, this.dealt),
                adapt: Object.assign({}, this.adapt),
                towers: this.towers.map(t => ({ id: t.id, type: t.type, x: t.spot.x, y: t.spot.y, level: t.level, mode: t.mode, invested: t.invested, lastFire: r(t.lastFire), stun: r(Math.max(0, t.stun)), perks: Object.assign({}, t.perks), shotCount: t.shotCount })),
                enemies: this.enemies.filter(e => e.health > 0).map(e => ({
                    id: e.id, type: e.type, lane: e.lane, kind: e.kind, mini: e.mini, waveNo: e.waveNo,
                    health: r(e.health), maxHealth: e.maxHealth, traveled: r(e.traveled), speed: r(e.speed), slowTime: r(Math.max(0, e.slowTime)),
                    stunTime: r(Math.max(0, e.stunTime)), didSplit: e.didSplit, furyCasts: e.furyCasts, furyTimer: r(e.furyTimer),
                })),
                queue: this.queue.map(it => Object.assign({}, it)),
                spawnTimer: r(this.spawnTimer),
                mech: this.mech.map(m => ({ phase: m.phase, timer: r(m.timer), guards: m.guards ? m.guards.map(g => r(g.timer)) : null })),
            };
        }

        // serialize() çıktısından oyunu yeniden kurar
        static restore(map, snap, opts = {}) {
            const w = new World(map, Object.assign({}, opts, { difficulty: snap.diff, seed: snap.seed }));
            w.endless = !!snap.endless;
            w.totalWaves = snap.totalWaves;
            w.wave = snap.wave;
            w.time = snap.time;
            w.health = snap.health;
            w.money = snap.money;
            w.stats = Object.assign({ kills: 0, leaks: 0, earned: 0 }, snap.stats);
            w.unclearedWaves = (snap.unclearedWaves || []).slice();
            w.nextEnemyId = snap.nextEnemyId;
            w.nextTowerId = snap.nextTowerId;
            w.dealt = Object.assign({}, snap.dealt);
            w.adapt = Object.assign({}, snap.adapt);
            w.rng = mulberry32((snap.seed ^ 0x5bd1e995 ^ Math.imul(snap.wave + 1, 977) ^ Math.floor(snap.time)) >>> 0);

            for (const st of snap.towers || []) {
                const spot = w.spots.find(sp => Math.hypot(sp.x - st.x, sp.y - st.y) < 4 && !sp.tower);
                if (!spot || !TOWER_TYPES[st.type]) continue;
                const t = new Tower(w, st.type, spot, st.id);
                t.level = st.level;
                t.mode = st.mode;
                t.invested = st.invested;
                t.lastFire = st.lastFire;
                t.stun = st.stun;
                t.perks = Object.assign({}, st.perks);
                t.shotCount = st.shotCount || 0;
                // eski kayıtlarda seçim yoksa ilk seçenek verilir
                for (const lv of [3, 5]) {
                    const opts = perkOptions(t.type, lv);
                    if (t.level >= lv && opts && !findPerk(t.type, lv, t.perks[lv])) t.perks[lv] = opts[0].id;
                }
                spot.tower = t;
                w.towers.push(t);
            }
            w.towers.forEach(t => t.derive());
            w.refreshLight();

            for (const se of snap.enemies || []) {
                const e = new Enemy(w, se.type, se.lane, se.id, se.waveNo, { mini: se.mini, kind: se.kind, hpMul: 1 });
                e.maxHealth = se.maxHealth;
                e.health = se.health;
                e.traveled = se.traveled;
                e.speed = se.speed;
                e.slowTime = se.slowTime;
                e.isSlowed = se.slowTime > 0;
                e.stunTime = se.stunTime;
                e.didSplit = se.didSplit;
                e.furyCasts = se.furyCasts;
                e.furyTimer = Math.max(se.furyTimer, 1.5);
                e.furyPhase = e.fury && e.furyCasts >= e.fury.casts ? 'done' : 'idle';
                e.update(0);
                w.enemies.push(e);
            }
            w.queue = (snap.queue || []).map(it => Object.assign({}, it));
            w.spawnTimer = snap.spawnTimer;
            w.mech.forEach((m, i) => {
                const sm = (snap.mech || [])[i];
                if (!sm) return;
                // süren uyarılar ve fırtına sıfırlanır; zamanlayıcılar kaldığı yerden devam eder
                m.phase = 'idle';
                m.timer = sm.phase === 'idle' ? sm.timer : (m.cfg.interval || 20) * 0.5;
                if (m.guards && sm.guards) m.guards.forEach((g, gi) => { g.timer = sm.guards[gi]; g.warned = false; });
            });
            w.rangeMul = 1;
            w.towers.forEach(t => t.derive());
            w.refreshLight();
            return w;
        }

        // ---- dalga yönetimi

        // kazandıktan sonra dalgalar bitmeden devam: patronlar döngüyle gelir, düşmanlar güçlenmeye devam eder
        goEndless() {
            if (this.result !== 'win') return false;
            this.endless = true;
            this.totalWaves = 9999;
            this.result = null;
            this.unclearedWaves = [];
            return true;
        }

        canStartWave() {
            return !this.result && this.wave < this.totalWaves && this.queue.length === 0;
        }

        startWave() {
            if (!this.canStartWave()) return false;
            this.wave++;
            this.updateAdaptation();
            const plan = this.planFor(this.wave);
            this.queue = plan.map(it => Object.assign({}, it));
            this.spawnTimer = 0.4;
            this.unclearedWaves.push(this.wave);
            this.emit('waveStart', { wave: this.wave, counts: summarizePlan(plan), total: plan.length });
            return true;
        }

        waveBonus(n) { return Math.round((22 + 7 * n) * this.diff.bonus); }

        // ---- ana döngü

        update(dt) {
            while (dt > 0 && !this.result) {
                const step = Math.min(dt, 1 / 30);
                this.step(step);
                dt -= step;
            }
        }

        step(dt) {
            this.time += dt;

            if (this.queue.length) {
                this.spawnTimer -= dt;
                if (this.spawnTimer <= 0) {
                    const it = this.queue.shift();
                    const e = new Enemy(this, it.type, it.lane || 0, this.nextEnemyId++, this.wave, it);
                    this.enemies.push(e);
                    this.emit('spawn', { enemy: e });
                    this.spawnTimer = this.queue.length ? this.queue[0].gap : 0;
                }
            }

            this.tickEffects(dt);

            for (const e of this.enemies) {
                if (e.health > 0 && e.update(dt)) {
                    e.reached = true;
                    this.health = Math.max(0, this.health - e.damage);
                    this.stats.leaks++;
                    e.health = 0;
                    this.emit('leak', { enemy: e });
                }
            }

            this.updateMechanics(dt);
            this.tickMeteors(dt);

            for (const e of this.enemies) {
                if (e.fury && e.health > 0) this.tickBoss(e, dt);
            }

            for (const t of this.towers) {
                if (t.stun > 0) { t.stun -= dt; t.target = null; continue; }
                t.lastFire += dt;
                t.target = t.pick(this.enemies);
                if (t.target && t.lastFire >= t.rate) {
                    t.lastFire = 0;
                    this.fire(t);
                }
            }

            for (const p of this.projectiles) this.moveProjectile(p, dt);
            this.projectiles = this.projectiles.filter(p => p.active);
            this.enemies = this.enemies.filter(e => e.health > 0);

            if (this.health <= 0) {
                this.result = 'lose';
                this.emit('end', { won: false });
                return;
            }

            if (this.queue.length === 0 && this.enemies.length === 0 && this.unclearedWaves.length) {
                let bonus = 0;
                this.unclearedWaves.forEach(n => { bonus += this.waveBonus(n); });
                const cleared = this.unclearedWaves.slice();
                this.unclearedWaves = [];
                if (this.wave >= this.totalWaves) {
                    this.result = 'win';
                    this.emit('end', { won: true });
                } else {
                    this.money += bonus;
                    this.stats.earned += bonus;
                    this.emit('waveClear', { waves: cleared, bonus });
                }
            }
        }

        fire(t) {
            this.emit('fire', { tower: t, target: t.target });
            t.firedAt = this.time;
            t.shotCount++;
            const fx = t.fx;
            const lob = !!TOWER_TYPES[t.type].lob;
            if (fx.pulse && t.shotCount % fx.pulse.every === 0) this.pulseSlow(t);
            if (t.aoe && !lob) {
                this.shockwave(t);       // anlık alan (yılan balığı)
                return;
            }
            if (lob) {
                // hedefin uçuş süresi boyunca ilerleyeceği yeri tahmin et
                const target = t.target;
                const dist = Math.hypot(target.x - t.x, target.y - t.y);
                const flight = dist / (TOWER_TYPES[t.type].projSpeed || 300);
                const ahead = pointAt(target.path, target.traveled + target.speed * flight);
                this.projectiles.push(new Projectile(t, target, ahead));
                return;
            }
            let targets = [t.target];
            if (fx.salvo && t.shotCount % fx.salvo.every === 0) {
                // Kılıç Yağmuru: menzildeki en güçlü düşmanlara birden
                const strong = this.enemies
                    .filter(e => e.health > 0 && t.canTarget(e) && Math.hypot(e.x - t.x, e.y - t.y) <= t.range)
                    .sort((a, b) => b.health - a.health)
                    .slice(0, fx.salvo.count);
                if (strong.length) targets = strong;
                this.emit('salvo', { tower: t, targets });
            }
            targets.forEach(e => this.projectiles.push(new Projectile(t, e)));
            if (t.shots > 1) {
                const used = targets.slice();
                for (let i = 1; i < t.shots; i++) {
                    const extra = this.extraTarget(t, used);
                    if (!extra) break;
                    used.push(extra);
                    this.projectiles.push(new Projectile(t, extra));
                }
            }
        }

        // Yılan Balığı'nın şoku: alandaki yer düşmanlarına vurur; Aşırı Yük, Zincir Şoku ve Elektrik Yanığı yetenekleri burada işler
        shockwave(t) {
            const fx = t.fx;
            const cx = t.target.x;
            const cy = t.target.y;
            const over = !!(fx.overload && t.shotCount % fx.overload.every === 0);
            this.emit('aoe', { x: cx, y: cy, radius: t.aoe, big: over });
            const hit = this.enemies.filter(e => e.health > 0 && !e.flying && Math.hypot(e.x - cx, e.y - cy) < t.aoe);
            for (const e of hit) {
                const res = this.strike(e, t, t.dmg, t.pierce, over ? fx.overload.mul : 1);
                if (over && !res.dead) e.stunTime = Math.max(e.stunTime, e.type === 'boss' ? fx.overload.stunBoss : fx.overload.stun);
                this.afterHit(e, t, res, false);
            }
            if (over) this.emit('overload', { x: cx, y: cy, radius: t.aoe });
            if (fx.chain) {
                const pool = this.enemies
                    .filter(e => e.health > 0 && !e.flying && !hit.includes(e) && Math.hypot(e.x - cx, e.y - cy) <= t.aoe + fx.chain.range)
                    .sort((a, b) => Math.hypot(a.x - cx, a.y - cy) - Math.hypot(b.x - cx, b.y - cy))
                    .slice(0, fx.chain.count);
                const pts = [{ x: cx, y: cy }];
                for (const e of pool) {
                    const res = this.strike(e, t, t.dmg, t.pierce, fx.chain.mul);
                    this.afterHit(e, t, res, false);
                    pts.push({ x: e.x, y: e.y });
                }
                if (pts.length > 1) this.emit('chain', { points: pts });
            }
        }

        // Deniz Anası'nın Derin Nabız yeteneği: menzildeki herkesi yavaşlatır
        pulseSlow(t) {
            const p = t.fx.pulse;
            const r = t.range * p.rangeMul;
            for (const e of this.enemies) {
                if (e.health > 0 && Math.hypot(e.x - t.x, e.y - t.y) <= r) e.slowDown(p.factor, p.time);
            }
            this.emit('pulse', { x: t.x, y: t.y, radius: r });
        }

        extraTarget(t, used) {
            let best = null;
            let bestProg = -1;
            for (const e of this.enemies) {
                if (used.includes(e) || e.health <= 0 || !t.canTarget(e)) continue;
                if (Math.hypot(e.x - t.x, e.y - t.y) > t.range) continue;
                if (e.progress > bestProg) { bestProg = e.progress; best = e; }
            }
            return best;
        }

        moveProjectile(p, dt) {
            if (p.lob) {
                const dx = p.tx - p.x;
                const dy = p.ty - p.y;
                const dist = Math.hypot(dx, dy);
                const stepLen = p.speed * dt;
                p.angle = Math.atan2(dy, dx);
                if (dist <= stepLen) {
                    p.active = false;
                    this.splash(p);
                    return;
                }
                p.x += (dx / dist) * stepLen;
                p.y += (dy / dist) * stepLen;
                return;
            }
            if (!p.target || p.target.health <= 0) { p.active = false; return; }
            const dx = p.target.x - p.x;
            const dy = p.target.y - p.y;
            const dist = Math.hypot(dx, dy);
            const stepLen = p.speed * dt;
            p.angle = Math.atan2(dy, dx);
            if (dist <= Math.max(stepLen, 14)) {
                p.active = false;
                const fx = p.owner.fx;
                const crit = !!(fx.crit && this.rng() < fx.crit.chance);
                const res = this.strike(p.target, p.owner, p.dmg, p.pierce, crit ? fx.crit.mul : 1);
                if (crit) this.emit('crit', { x: p.target.x, y: p.target.y, dmg: res.dmg });
                if (p.slow && !res.dead) p.target.slowDown(p.slow, p.slowTime);
                this.afterHit(p.target, p.owner, res, !!p.slow);
                return;
            }
            p.x += (dx / dist) * stepLen;
            p.y += (dy / dist) * stepLen;
        }

        // havan mermisi yere düştü: yarıçap içindeki yer düşmanlarına mesafeyle azalan hasar
        splash(p) {
            this.emit('splash', { x: p.tx, y: p.ty, radius: p.aoe });
            for (const e of this.enemies) {
                if (e.health <= 0 || e.flying) continue;
                const d = Math.hypot(e.x - p.tx, e.y - p.ty);
                if (d > p.aoe) continue;
                const falloff = 1 - 0.5 * (d / p.aoe);
                const res = this.strike(e, p.owner, p.dmg * falloff, p.pierce);
                if (p.slow && !res.dead) e.slowDown(p.slow, p.slowTime);
                this.afterHit(e, p.owner, res, !!p.slow);
            }
            const gas = p.owner.fx && p.owner.fx.gas;
            if (gas) {
                this.gas.push({ x: p.tx, y: p.ty, r: p.aoe * gas.radiusMul, t: gas.time, max: gas.time, dps: p.dmg * gas.dpsMul });
                if (this.gas.length > 14) this.gas.shift();
                this.emit('gas', { x: p.tx, y: p.ty, radius: p.aoe * gas.radiusMul, time: gas.time });
            }
        }

        // Bir kulenin düşmana vuruşu. tower bir Tower (yetenek ayarlarıyla) ya da tür adı olabilir.
        // Düşmanlar son dalgalarda en çok hasar veren türe alışır (adapt).
        strike(e, tower, dmg, pierce, extraMul) {
            const type = typeof tower === 'string' ? tower : tower.type;
            const opts = typeof tower === 'string' ? null : tower.strikeOpts;
            const mul = 1 - (this.adapt[type] || 0);
            const res = e.takeDamage(dmg * mul * (extraMul || 1), type, pierce, opts);
            this.dealt[type] = (this.dealt[type] || 0) + res.dmg / mul;
            return res;
        }

        // zamanla hasar (zehir, yanık, gaz): zırh saymaz, alışma uygulanır, öldürürse ödül verir
        dotDamage(e, amount, type) {
            if (e.health <= 0 || amount <= 0) return;
            const mul = 1 - (this.adapt[type] || 0);
            const dmg = amount * mul;
            e.health -= dmg;
            this.dealt[type] = (this.dealt[type] || 0) + dmg / mul;
            if (e.health <= 0) {
                e.health = 0;
                this.money += e.reward;
                this.stats.kills++;
                this.stats.earned += e.reward;
                this.emit('kill', { enemy: e, reward: e.reward, dot: true });
            }
        }

        // her adımda: işaret/zehir süreleri, gaz bulutları, ışık ağı yavaşlatması
        tickEffects(dt) {
            const lamps = this.towers.filter(t => t.fx && t.fx.auraSlow);
            for (const e of this.enemies) {
                if (e.health <= 0) continue;
                if (e.markT > 0) e.markT -= dt;
                if (e.dotT > 0) {
                    e.dotT -= dt;
                    this.dotDamage(e, e.dotDps * dt, e.dotType);
                }
                let m = 1;
                for (const l of lamps) {
                    if (Math.hypot(e.x - l.x, e.y - l.y) <= this.lightRadius(l)) m = Math.min(m, l.fx.auraSlow);
                }
                e.auraMul = m;
            }
            if (this.gas.length) {
                for (const g of this.gas) {
                    g.t -= dt;
                    for (const e of this.enemies) {
                        if (e.health > 0 && !e.flying && Math.hypot(e.x - g.x, e.y - g.y) <= g.r) this.dotDamage(e, g.dps * dt, 'puffer');
                    }
                }
                this.gas = this.gas.filter(g => g.t > 0);
            }
        }

        // Dalga başında: hangi tür hasarın büyük kısmını veriyor? Payı yarıdan fazlaysa düşmanlar o türe alışır.
        // Hasar belleği her dalgada yarıya iner, yani yaklaşık son iki dalga sayılır.
        updateAdaptation() {
            const types = Object.keys(this.dealt);
            const total = types.reduce((a, k) => a + this.dealt[k], 0);
            const before = JSON.stringify(this.adapt);
            const next = {};
            if (this.wave >= ADAPT_FROM_WAVE && total > 0) {
                for (const k of types) {
                    const share = this.dealt[k] / total;
                    const r = Math.max(0, Math.min(ADAPT_MAX, (share - ADAPT_FREE_SHARE) * 0.8));
                    if (r >= 0.02) next[k] = Math.round(r * 100) / 100;
                }
            }
            this.adapt = next;
            for (const k of types) this.dealt[k] *= 0.5;
            if (JSON.stringify(next) !== before) this.emit('adapt', { adapt: next });
        }

        // sıradaki dalgaya karşı hangi kuleler iyi? (arayüzdeki ipuçları)
        waveAdvice(n) {
            if (n > this.totalWaves && !this.endless) return [];
            const counts = summarizePlan(this.planFor(n));
            const has = t => this.available.includes(t);
            const name = t => (this.map.towerNames && this.map.towerNames[t]) || TOWER_TYPES[t].name;
            const list = types => types.filter(has).map(name).join(', ');
            const out = [];
            if (counts.armored >= 2) {
                const good = list(['eel', 'swordfish', 'angler']);
                const bad = has('octopus') ? ` ${name('octopus')} yarı hasar verir.` : '';
                out.push(`Zırhlı: ${good} zırhı deler.${bad}`);
            }
            if (counts.flying >= 2) {
                const no = list(['eel', 'puffer']);
                out.push(`Uçan: ${no ? no + ' vuramaz; ' : ''}${list(['octopus', 'angler', 'jellyfish', 'swordfish'])} kullan.`);
            }
            if (counts.swarm >= 5) out.push(`Sürü: ${list(['puffer', 'eel', 'jellyfish'])} alan hasarıyla temizler.`);
            if (counts.boss) {
                const fury = BOSS_KINDS[(this.planFor(n).find(i => i.type === 'boss') || {}).kind || 'shark'];
                out.push(`Patron: en yüksek seviyeli kuleni yer.${has('swordfish') ? ` ${name('swordfish')} +%50 vurur.` : ''}${fury && fury.flying ? ' Havadan gelir.' : ''}`);
            }
            return out;
        }

        afterHit(enemy, tower, res, slowed) {
            enemy.lastHit = this.time;
            this.emit('hit', { enemy, tower, dmg: res.dmg, slowed, dead: res.dead });
            if (res.dead) {
                this.money += enemy.reward;
                this.stats.kills++;
                this.stats.earned += enemy.reward;
                this.emit('kill', { enemy, reward: enemy.reward });
                return;
            }
            const fx = tower.fx;
            if (fx) {
                // yetenek etkileri: işaret, zehir, yanık, alan yavaşlatma
                if (fx.mark) { enemy.markT = fx.mark.time; enemy.markPct = Math.max(enemy.markPct, fx.mark.pct); }
                if (fx.poison) { enemy.dotT = fx.poison.time; enemy.dotDps = Math.max(enemy.dotDps, tower.dmg * fx.poison.dpsMul); enemy.dotType = tower.type; }
                if (fx.burn) {
                    enemy.dotT = fx.burn.time;
                    enemy.dotDps = Math.max(enemy.dotDps, enemy.maxHealth * (enemy.type === 'boss' ? fx.burn.bossPct : fx.burn.pct));
                    enemy.dotType = tower.type;
                }
                if (fx.slowArea && slowed) {
                    for (const o of this.enemies) {
                        if (o !== enemy && o.health > 0 && Math.hypot(o.x - enemy.x, o.y - enemy.y) <= fx.slowArea.radius) o.slowDown(tower.slow, tower.slowTime);
                    }
                }
            }
            if (enemy.splits && !enemy.didSplit && enemy.health <= enemy.maxHealth * 0.5) {
                this.spawnBrood(enemy);
            }
        }

        // Yavru Anası yarı canda yavru köpek balığı saçar
        spawnBrood(mother) {
            mother.didSplit = true;
            for (let i = 0; i < mother.splits; i++) {
                const e = new Enemy(this, 'swarm', mother.lane, this.nextEnemyId++, this.wave, { hpMul: 1 });
                e.traveled = Math.max(0, mother.traveled - 14 - i * 11);
                this.enemies.push(e);
            }
            this.emit('brood', { enemy: mother, count: mother.splits });
        }

        get finished() { return this.result !== null; }

        // arayüzün "sıradaki dalga" önizlemesi için
        previewNext() {
            const n = this.wave + 1;
            if (n > this.totalWaves) return null;
            return { wave: n, counts: summarizePlan(this.planFor(n)) };
        }
    }

    const Core = {
        SLOW_VULNERABILITY, ADAPT_FROM_WAVE, ADAPT_FREE_SHARE, ADAPT_MAX,
        ENEMY_TYPES, BOSS_KINDS, ENEMY_NAMES, TOWER_TYPES, DIFFICULTY, MAX_LEVEL, BUILD_SPOT_RADIUS, HIGH_GROUND_RANGE, TARGET_MODES,
        World, Enemy, Tower, Projectile,
        buildPath, generateSmoothPath, mapPaths, buildWavePlan, summarizePlan, totalWavesOf, waveHpScale, mulberry32,
        pointAt, describeDifficulty, PERKS, perkOptions, findPerk,
    };

    if (typeof module !== 'undefined' && module.exports) module.exports = Core;
    else root.Core = Core;
})(typeof window !== 'undefined' ? window : globalThis);
