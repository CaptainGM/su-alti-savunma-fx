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

    const TOWER_TYPES = {
        octopus: { cost: 50, range: 210, dmg: 9, rate: 0.9, projSpeed: 520 },
        eel: { cost: 80, range: 180, dmg: 28, rate: 2.6, aoe: 62, groundOnly: true, pierce: 0.5 },
        jellyfish: { cost: 70, range: 200, dmg: 12, rate: 1.7, slow: 0.5, slowTime: 3, projSpeed: 480 },
    };

    const MAX_LEVEL = 5;
    const BUILD_SPOT_RADIUS = 55;
    const HIGH_GROUND_RANGE = 1.2;
    const TARGET_MODES = ['first', 'last', 'strong', 'close'];

    const DIFFICULTY = {
        easy: { label: 'Kolay', hp: 0.85, money: 1.2, reward: 1.05, health: 120 },
        normal: { label: 'Normal', hp: 1.25, money: 1.0, reward: 0.95, health: 100 },
        hard: { label: 'Zor', hp: 1.25, money: 0.92, reward: 0.92, health: 90 },
    };

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
        return 1 + 0.30 * (n - 1) + 0.035 * (n - 1) * (n - 1);
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
            if (n === total) {
                items.push({ type: 'boss', gap: 3, hpMul: 1 });
            } else if (total >= 8 && n === Math.floor(total / 2)) {
                items.push({ type: 'boss', gap: 3, hpMul: 0.45, mini: true });
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

    class Enemy {
        constructor(world, type, lane, id, waveNo, spawn) {
            const st = ENEMY_TYPES[type];
            const diff = world.diff;
            const hpMul = (spawn && spawn.hpMul) || 1;
            this.id = id;
            this.type = type;
            this.lane = lane;
            this.mini = !!(spawn && spawn.mini);
            this.name = world.map.enemyNames[type] || (this.mini ? 'Ara Patron' : type);
            this.flying = st.flying;
            this.armor = st.armor;
            this.size = st.size * (this.mini ? 0.75 : 1);
            // hpScale ilk dalgada 1'dir, son dalgada haritanın değerine ulaşır: erken oyun herkes için yumuşak kalır
            const mapRamp = 1 + ((world.map.hpScale || 1) - 1) * (waveNo - 1) / Math.max(1, world.totalWaves - 1);
            this.maxHealth = Math.round(st.hp * hpMul * waveHpScale(waveNo) * diff.hp * mapRamp);
            this.health = this.maxHealth;
            this.speed = st.speed * (world.map.speedScale || 1) * (1 + 0.012 * (waveNo - 1));
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
            this.traveled += this.speed * dt;
            if (this.traveled >= this.path.length) return true;

            const d = this.path.dist;
            while (this.segment < d.length - 2 && this.traveled > d[this.segment + 1]) this.segment++;
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
            if (towerType === 'octopus' && this.type === 'armored') amount *= 0.5;
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
            this.id = id;
            this.type = type;
            this.spot = spot;
            this.x = spot.x;
            this.y = spot.y;
            this.name = world.map.towerNames[type];
            this.level = 1;
            this.lastFire = 0;
            this.target = null;
            this.mode = 'first';
            this.invested = 0;
            this.firedAt = -10;
            this.derive();
        }

        // seviyeye ve zemine göre güncel değerler
        derive() {
            const st = TOWER_TYPES[this.type];
            const L = this.level - 1;
            const lv3 = this.level >= 3;
            const lv5 = this.level >= 5;
            this.dmg = Math.round(st.dmg * (1 + 0.35 * L));
            this.range = Math.round(st.range * (1 + 0.07 * L) * (this.spot.kind === 'high' ? HIGH_GROUND_RANGE : 1));
            this.rate = +(st.rate * (1 - 0.11 * L)).toFixed(2);
            this.aoe = st.aoe ? Math.round(st.aoe * (lv5 ? 1.8 : lv3 ? 1.4 : 1)) : 0;
            this.slow = st.slow ? (lv5 ? 0.3 : lv3 ? 0.4 : st.slow) : 0;
            this.slowTime = st.slowTime ? (lv5 ? 5 : lv3 ? 4 : st.slowTime) : 0;
            this.shots = this.type === 'octopus' ? (lv5 ? 3 : lv3 ? 2 : 1) : 1;
        }

        perk() {
            if (this.type === 'octopus') return 'Sv 3: iki hedefe birden · Sv 5: üç hedefe birden mürekkep fırlatır';
            if (this.type === 'eel') return 'Sv 3: şok alanı %40 genişler · Sv 5: alan %80 genişler';
            return 'Sv 3: yavaşlatma %60, 4 sn · Sv 5: yavaşlatma %70, 5 sn';
        }

        upgradeCost() {
            if (this.level >= MAX_LEVEL) return null;
            const base = TOWER_TYPES[this.type].cost;
            return Math.round(base * [0.8, 1.3, 2.0, 3.0][this.level - 1]);
        }

        sellValue() { return Math.round(this.invested * 0.5); }

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
        constructor(tower, target) {
            this.x = tower.x;
            this.y = tower.y;
            this.target = target;
            this.owner = tower;
            this.type = tower.type;
            this.dmg = tower.dmg;
            this.slow = tower.slow;
            this.slowTime = tower.slowTime;
            this.speed = TOWER_TYPES[tower.type].projSpeed || 500;
            this.active = true;
            this.angle = 0;
        }
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

        // ---- kule işlemleri

        towerCost(type) {
            const owned = this.towers.filter(t => t.type === type).length;
            const raw = TOWER_TYPES[type].cost * (1 + 0.12 * owned);
            return Math.round(raw / 5) * 5;
        }

        placeTower(type, spot) {
            if (this.result) return { ok: false, reason: 'over' };
            if (!spot || spot.tower) return { ok: false, reason: 'occupied' };
            const cost = this.towerCost(type);
            if (this.money < cost) return { ok: false, reason: 'money', cost };
            this.money -= cost;
            const tower = new Tower(this, type, spot, this.nextTowerId++);
            tower.invested = cost;
            spot.tower = tower;
            this.towers.push(tower);
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
            this.emit('upgrade', { tower, cost });
            return true;
        }

        sellTower(tower) {
            const refund = tower.sellValue();
            this.money += refund;
            tower.spot.tower = null;
            this.towers = this.towers.filter(t => t !== tower);
            this.projectiles.forEach(p => { if (p.owner === tower) p.active = false; });
            this.emit('sell', { tower, refund });
            return refund;
        }

        // ---- dalga yönetimi

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

        waveBonus(n) { return Math.round((22 + 7 * n) * this.diff.reward); }

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

            for (const t of this.towers) {
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
            if (t.aoe) {
                const cx = t.target.x;
                const cy = t.target.y;
                this.emit('aoe', { x: cx, y: cy, radius: t.aoe });
                const pierce = TOWER_TYPES[t.type].pierce;
                for (const e of this.enemies) {
                    if (e.health > 0 && !e.flying && Math.hypot(e.x - cx, e.y - cy) < t.aoe) {
                        const res = e.takeDamage(t.dmg, t.type, pierce);
                        this.afterHit(e, t, res, false);
                    }
                }
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
            if (!p.target || p.target.health <= 0) { p.active = false; return; }
            const dx = p.target.x - p.x;
            const dy = p.target.y - p.y;
            const dist = Math.hypot(dx, dy);
            const stepLen = p.speed * dt;
            p.angle = Math.atan2(dy, dx);
            if (dist <= Math.max(stepLen, 14)) {
                p.active = false;
                const res = p.target.takeDamage(p.dmg, p.type, 0);
                if (p.slow && !res.dead) p.target.slowDown(p.slow, p.slowTime);
                this.afterHit(p.target, p.owner, res, !!p.slow);
                return;
            }
            p.x += (dx / dist) * stepLen;
            p.y += (dy / dist) * stepLen;
        }

        afterHit(enemy, tower, res, slowed) {
            enemy.lastHit = this.time;
            this.emit('hit', { enemy, tower, dmg: res.dmg, slowed, dead: res.dead });
            if (res.dead) {
                this.money += enemy.reward;
                this.stats.kills++;
                this.stats.earned += enemy.reward;
                this.emit('kill', { enemy, reward: enemy.reward });
            }
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
        ENEMY_TYPES, TOWER_TYPES, DIFFICULTY, MAX_LEVEL, BUILD_SPOT_RADIUS, HIGH_GROUND_RANGE, TARGET_MODES,
        World, Enemy, Tower, Projectile,
        buildPath, generateSmoothPath, mapPaths, buildWavePlan, summarizePlan, totalWavesOf, waveHpScale, mulberry32,
    };

    if (typeof module !== 'undefined' && module.exports) module.exports = Core;
    else root.Core = Core;
})(typeof window !== 'undefined' ? window : globalThis);
