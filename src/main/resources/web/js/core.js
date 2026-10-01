// Oyun mantığı. DOM'a dokunmaz, bu yüzden hem oyunda hem Node'da (tools/balans.js) çalışır.
// Çizim, ses ve arayüz js/game.js içinde; buradan gelen olaylara (onEvent) tepki verir.
(function (root) {
    'use strict';

    const ENEMY_TYPES = {
        standard: { speed: 50, hp: 50, reward: 10, damage: 5, armor: 0, flying: false, size: 80 },
        armored: { speed: 25, hp: 75, reward: 20, damage: 10, armor: 75, flying: false, size: 80 },
        flying: { speed: 75, hp: 50, reward: 15, damage: 5, armor: 0, flying: true, size: 80 },
        swarm: { speed: 92, hp: 22, reward: 5, damage: 3, armor: 0, flying: false, size: 56 },
        boss: { speed: 19, hp: 700, reward: 110, damage: 40, armor: 45, flying: false, size: 150 },
    };

    // Patron çeşitleri: her harita birini seçer (map.boss)
    const BOSS_KINDS = {
        shark: { name: 'Kral Köpek Balığı', hp: 1.0, speed: 1.0, armor: 45, flying: false, heavy: false, note: 'dengeli patron' },
        crab: { name: 'Dev Kral Yengeç', hp: 1.35, speed: 0.72, armor: 80, flying: false, heavy: true, note: 'çok zırhlı ve yavaş' },
        manta: { name: 'Manta İmparatoru', hp: 0.85, speed: 1.35, armor: 20, flying: true, heavy: false, note: 'havadan gelir' },
        brood: { name: 'Yavru Anası', hp: 1.0, speed: 0.95, armor: 30, flying: false, heavy: false, splits: 8, note: 'yarı canda yavru saçar' },
    };

    const ENEMY_NAMES = {
        standard: 'Köpek Balığı', armored: 'Istakoz', flying: 'Vatoz',
        swarm: 'Yavru Köpek Balığı', boss: 'Patron',
    };

    // role: markette görünen kısa açıklama
    const TOWER_TYPES = {
        octopus: { name: 'Ahtapot', cost: 50, range: 210, dmg: 9, rate: 0.9, projSpeed: 520, role: 'Hızlı · havayı da vurur · zırha zayıf' },
        eel: { name: 'Yılan Balığı', cost: 80, range: 180, dmg: 28, rate: 2.6, aoe: 62, groundOnly: true, pierce: 0.5, role: 'Alan şoku · zırh deler · havayı vuramaz' },
        jellyfish: { name: 'Deniz Anası', cost: 70, range: 200, dmg: 12, rate: 1.7, slow: 0.5, slowTime: 3, projSpeed: 480, role: 'Yavaşlatır · destek vuruşu' },
        swordfish: { name: 'Kılıç Balığı', cost: 130, range: 380, dmg: 50, rate: 3.6, projSpeed: 1100, pierce: 0.3, defaultMode: 'strong', role: 'Keskin nişancı · çok uzun menzil · patronlara ölümcül' },
        angler: { name: 'Fener Balığı', cost: 100, range: 190, dmg: 0, rate: 99, support: true, role: 'Destek · yakındaki kulelere hasar ve hız verir' },
        puffer: { name: 'Balon Balığı', cost: 110, range: 270, dmg: 38, rate: 3.0, aoe: 78, lob: true, groundOnly: true, projSpeed: 300, role: 'Havan topu · kümelere alan hasarı · havayı vuramaz' },
    };

    const MAX_LEVEL = 5;
    const BUILD_SPOT_RADIUS = 55;
    const HIGH_GROUND_RANGE = 1.2;
    const TARGET_MODES = ['first', 'last', 'strong', 'close'];

    // Zorluk: oyunu gerçekten değiştiren altı ayar (arayüzde de gösterilir)
    const DIFFICULTY = {
        easy: { label: 'Kolay', hp: 0.8, speed: 0.95, money: 1.3, reward: 1.1, bonus: 1.2, refund: 0.6, health: 130 },
        normal: { label: 'Normal', hp: 1.0, speed: 1.0, money: 1.0, reward: 1.0, bonus: 1.0, refund: 0.5, health: 100 },
        hard: { label: 'Zor', hp: 1.12, speed: 1.04, money: 0.92, reward: 0.95, bonus: 0.9, refund: 0.4, health: 85 },
    };

    function describeDifficulty(d) {
        const pct = (v, label) => (Math.abs(v - 1) < 0.005 ? null : `${label} ${v > 1 ? '+' : ''}${Math.round((v - 1) * 100)}%`);
        const parts = [pct(d.hp, 'düşman canı'), pct(d.speed, 'düşman hızı'), pct(d.money, 'başlangıç enerjisi'), pct(d.reward, 'öldürme ödülü'), pct(d.bonus, 'dalga bonusu')].filter(Boolean);
        const head = parts.length ? parts.join(' · ') : 'Standart ayarlar';
        return `${head} · üs canı ${d.health} · satış iadesi %${Math.round(d.refund * 100)}`;
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
                items.push({ type: 'boss', kind, gap: 3, hpMul: 0.45, mini: true });
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
            this.damage = st.damage;
            this.slowTime = 0;
            this.isSlowed = false;
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
            this.traveled += this.speed * this.zoneMul * dt;
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

        takeDamage(amount, towerType, pierce) {
            if (towerType === 'octopus' && this.heavy) amount *= 0.5;
            if (towerType === 'swordfish' && this.type === 'boss') amount *= 1.5;
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
            this.support = !!TOWER_TYPES[type].support;
            this.level = 1;
            this.lastFire = 0;
            this.target = null;
            this.mode = TOWER_TYPES[type].defaultMode || 'first';
            this.invested = 0;
            this.firedAt = -10;
            // destek kulelerinden gelen çarpanlar (World.refreshAuras doldurur)
            this.auraDmg = 0;
            this.auraRate = 0;
            this.auraRange = 0;
            this.stun = 0;        // lav patlaması gibi olaylarla geçici susturma (sn)
            this.dark = false;    // karanlık haritada ışık dışında kalma
            this.derive();
        }

        // seviyeye, zemine ve destek kulelerine göre güncel değerler
        derive() {
            const st = TOWER_TYPES[this.type];
            const L = this.level - 1;
            const lv3 = this.level >= 3;
            const lv5 = this.level >= 5;
            const high = this.spot.kind === 'high' ? HIGH_GROUND_RANGE : 1;
            this.dmg = Math.round(st.dmg * (1 + 0.35 * L) * (1 + this.auraDmg));
            const w = this.world;
            const envMul = (w ? w.rangeMul : 1) * (this.dark && w ? w.darkMul : 1);
            this.range = Math.round(st.range * (1 + 0.07 * L) * high * (1 + this.auraRange) * envMul);
            this.rate = +(st.rate * (1 - 0.11 * L) / (1 + this.auraRate)).toFixed(2);
            const aoeMul = this.type === 'puffer' ? (lv5 ? 1.5 : lv3 ? 1.25 : 1) : (lv5 ? 1.8 : lv3 ? 1.4 : 1);
            this.aoe = st.aoe ? Math.round(st.aoe * aoeMul) : 0;
            this.slow = st.slow ? (lv5 ? 0.3 : lv3 ? 0.4 : st.slow) : 0;
            this.slowTime = st.slowTime ? (lv5 ? 5 : lv3 ? 4 : st.slowTime) : 0;
            this.shots = this.type === 'octopus' ? (lv5 ? 3 : lv3 ? 2 : 1) : 1;
            this.pierce = (st.pierce || 0) + (this.type === 'swordfish' && lv3 ? 0.2 : 0);
            if (this.type === 'puffer' && lv5) { this.slow = 0.7; this.slowTime = 2; }
            if (this.support) {
                // destek: menzil = etki alanı yarıçapı
                this.supDmg = 0.18 + 0.07 * L;
                this.supRate = 0.08 + 0.04 * L;
                this.supRange = lv5 ? 0.2 : lv3 ? 0.1 : 0;
            }
        }

        perk() {
            switch (this.type) {
                case 'octopus': return 'Sv 3: iki hedefe birden · Sv 5: üç hedefe birden mürekkep fırlatır';
                case 'eel': return 'Sv 3: şok alanı %40 genişler · Sv 5: alan %80 genişler';
                case 'jellyfish': return 'Sv 3: yavaşlatma %60, 4 sn · Sv 5: yavaşlatma %70, 5 sn';
                case 'swordfish': return 'Patronlara %50 fazla hasar · Sv 3: zırhın büyük kısmını deler';
                case 'angler': return 'Yakındaki kulelere hasar ve atış hızı verir · Sv 3: +%10, Sv 5: +%20 menzil';
                case 'puffer': return 'Sv 3: patlama %25 büyür · Sv 5: %50 büyür ve düşmanı yavaşlatır';
                default: return '';
            }
        }

        upgradeCost() {
            if (this.level >= MAX_LEVEL) return null;
            const base = TOWER_TYPES[this.type].cost;
            return Math.round(base * [0.8, 1.3, 2.0, 3.0][this.level - 1]);
        }

        sellValue(refund) { return Math.round(this.invested * (refund != null ? refund : 0.5)); }

        canTarget(enemy) {
            if (this.support) return false;
            return !(TOWER_TYPES[this.type].groundOnly && enemy.flying);
        }

        pick(enemies) {
            if (this.support) return null;
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
            this.money = Math.round((map.startMoney || 200) * this.diff.money);
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
            return t.range * (d && d.lightMul ? d.lightMul : 1);
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
                m.phase = 'idle';
                m.timer = c.interval;
            }
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
            const raw = TOWER_TYPES[type].cost * (1 + 0.12 * owned);
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
            this.refreshAuras();
            this.emit('build', { tower, cost });
            return { ok: true, tower, cost };
        }

        upgradeTower(tower) {
            const cost = tower.upgradeCost();
            if (cost === null || this.money < cost) return false;
            this.money -= cost;
            tower.level++;
            tower.invested += cost;
            tower.derive();
            this.refreshAuras();
            this.emit('upgrade', { tower, cost });
            return true;
        }

        sellTower(tower) {
            const refund = tower.sellValue(this.diff.refund);
            this.money += refund;
            tower.spot.tower = null;
            this.towers = this.towers.filter(t => t !== tower);
            this.projectiles.forEach(p => { if (p.owner === tower) p.active = false; });
            this.refreshAuras();
            this.emit('sell', { tower, refund });
            return refund;
        }

        // Fener Balığı gibi destek kulelerinin etkisini komşu kulelere dağıtır (toplam bonus sınırlı)
        refreshAuras() {
            const supports = this.towers.filter(t => t.support);
            for (const t of this.towers) {
                let d = 0;
                let r = 0;
                let g = 0;
                if (!t.support) {
                    for (const s of supports) {
                        if (Math.hypot(s.x - t.x, s.y - t.y) <= s.range) {
                            d += s.supDmg;
                            r += s.supRate;
                            g += s.supRange;
                        }
                    }
                }
                t.dark = !t.support && this.darkMul < 1 && !supports.some(s => Math.hypot(s.x - t.x, s.y - t.y) <= this.lightRadius(s));
                t.auraDmg = Math.min(0.6, d);
                t.auraRate = Math.min(0.4, r);
                t.auraRange = Math.min(0.25, g);
                t.derive();
            }
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

            for (const t of this.towers) {
                if (t.support) continue;
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
            const lob = !!TOWER_TYPES[t.type].lob;
            if (t.aoe && !lob) {
                // anlık alan (yılan balığı)
                const cx = t.target.x;
                const cy = t.target.y;
                this.emit('aoe', { x: cx, y: cy, radius: t.aoe });
                for (const e of this.enemies) {
                    if (e.health > 0 && !e.flying && Math.hypot(e.x - cx, e.y - cy) < t.aoe) {
                        const res = e.takeDamage(t.dmg, t.type, t.pierce);
                        this.afterHit(e, t, res, false);
                    }
                }
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
            this.projectiles.push(new Projectile(t, t.target));
            if (t.shots > 1) {
                const used = [t.target];
                for (let i = 1; i < t.shots; i++) {
                    const extra = this.extraTarget(t, used);
                    if (!extra) break;
                    used.push(extra);
                    this.projectiles.push(new Projectile(t, extra));
                }
            }
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
                const res = p.target.takeDamage(p.dmg, p.type, p.pierce);
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
                const res = e.takeDamage(p.dmg * falloff, p.type, p.pierce);
                if (p.slow && !res.dead) e.slowDown(p.slow, p.slowTime);
                this.afterHit(e, p.owner, res, !!p.slow);
            }
        }

        afterHit(enemy, tower, res, slowed) {
            enemy.lastHit = this.time;
            this.emit('hit', { enemy, tower, dmg: res.dmg, slowed, dead: res.dead });
            if (res.dead) {
                this.money += enemy.reward;
                this.stats.kills++;
                this.stats.earned += enemy.reward;
                this.emit('kill', { enemy, reward: enemy.reward });
            } else if (enemy.splits && !enemy.didSplit && enemy.health <= enemy.maxHealth * 0.5) {
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
        ENEMY_TYPES, BOSS_KINDS, ENEMY_NAMES, TOWER_TYPES, DIFFICULTY, MAX_LEVEL, BUILD_SPOT_RADIUS, HIGH_GROUND_RANGE, TARGET_MODES,
        World, Enemy, Tower, Projectile,
        buildPath, generateSmoothPath, mapPaths, buildWavePlan, summarizePlan, totalWavesOf, waveHpScale, mulberry32,
        pointAt, describeDifficulty,
    };

    if (typeof module !== 'undefined' && module.exports) module.exports = Core;
    else root.Core = Core;
})(typeof window !== 'undefined' ? window : globalThis);
