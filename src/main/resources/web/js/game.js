// Çizim, efekt, ses ve arayüz. Oyun kuralları js/core.js içindedir, haritalar js/maps.js içinde.
'use strict';

const W = 1100;
const H = 900;
const TOWER_ORDER = ['octopus', 'eel', 'jellyfish'];
const TOWER_ROLE = {
    octopus: 'Hızlı · havayı da vurur · zırha zayıf',
    eel: 'Alan şoku · zırh deler · havayı vuramaz',
    jellyfish: 'Yavaşlatır · destek kulesi',
};
const MODE_LABEL = { first: 'İlk', last: 'Son', strong: 'En Güçlü', close: 'En Yakın' };

// ------------------------------------------------------------------ kayıtlar

const memoryStore = {};
function loadRecords() {
    try {
        const raw = window.localStorage.getItem('sas.records');
        if (raw) return JSON.parse(raw);
    } catch (e) { /* WebView'da localStorage kapalı olabilir */ }
    return Object.assign({}, memoryStore);
}
function saveRecords(rec) {
    Object.assign(memoryStore, rec);
    try { window.localStorage.setItem('sas.records', JSON.stringify(rec)); } catch (e) { /* yoksay */ }
}
let records = loadRecords();
let difficulty = 'normal';
try { difficulty = window.localStorage.getItem('sas.difficulty') || 'normal'; } catch (e) { /* yoksay */ }
if (!Core.DIFFICULTY[difficulty]) difficulty = 'normal';

function starsFor(health, maxHealth) {
    const f = health / maxHealth;
    return f >= 0.8 ? 3 : f >= 0.4 ? 2 : 1;
}
function recordKey(map) { return map.id + ':' + difficulty; }

// ------------------------------------------------------------------ görseller

const imageCache = {};
function loadImage(src) {
    if (!src) return null;
    if (!imageCache[src]) {
        const img = new Image();
        img.src = src;
        imageCache[src] = img;
    }
    return imageCache[src];
}
const ready = img => img && img.complete && img.naturalWidth > 0;

let sprites = null;
function loadSprites(map) {
    const a = map.assets;
    sprites = { bg: loadImage(a.bg), towers: {}, enemies: {}, projectiles: {} };
    Object.keys(a.towers).forEach(k => { sprites.towers[k] = loadImage(a.towers[k]); });
    Object.keys(a.enemies).forEach(k => { sprites.enemies[k] = loadImage(a.enemies[k]); });
    Object.keys(a.projectiles).forEach(k => { sprites.projectiles[k] = loadImage(a.projectiles[k]); });
    sprites.caustics = map.ambient && map.ambient.caustics ? loadImage('assets/fx/caustics.png') : null;
}
function enemySprite(type) {
    return sprites.enemies[type] || (type === 'boss' ? sprites.enemies.armored : sprites.enemies.standard);
}

// ------------------------------------------------------------------ durum

let currentMapIndex = 0;
let currentMap = MAPS[0];
let world = null;
let logs = [];
let paused = false;
let speedMultiplier = 1;
let selectedTower = null;
let hoverSpot = null;
let armedType = null;
let draggedType = null;
let animTime = 0;
let lastFrame = 0;
let rafId = 0;
let endDelay = 0;
let endShown = false;
let fx = { floaters: [], rings: [], bubbles: [], flash: 0 };
let ambient = null;
let pathSamples = [];
let res = 1;

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// ------------------------------------------------------------------ Java köprüsü

function playTone(freq, duration, waveType, volume, freqEnd) {
    try {
        if (window.javaBridge && window.javaBridge.playTone) {
            const durationMs = Math.round(duration * 1000);
            window.javaBridge.playTone(freq, freqEnd || freq, durationMs, waveType || 'sine', volume || 0.12);
        }
    } catch (e) { /* ses köprüsü hazır değilse sessizce yok say */ }
}

const lastSfx = {};
function sfx(name, minGapMs, play) {
    const now = performance.now();
    if (lastSfx[name] && now - lastSfx[name] < minGapMs) return;
    lastSfx[name] = now;
    play();
}
function playTowerFireSound(type) {
    sfx('fire' + type, 70, () => {
        if (type === 'octopus') playTone(320, 0.12, 'sine', 0.10, 200);
        else if (type === 'eel') playTone(160, 0.28, 'sawtooth', 0.09, 55);
        else if (type === 'jellyfish') playTone(500, 0.16, 'triangle', 0.09, 750);
    });
}
function playEnemyDeathSound() { sfx('death', 60, () => playTone(140, 0.18, 'square', 0.07, 45)); }
function playBaseHitSound() { sfx('base', 120, () => playTone(220, 0.35, 'sawtooth', 0.14, 90)); }
function playWaveClearSound() {
    playTone(523, 0.14, 'triangle', 0.10, 523);
    setTimeout(() => playTone(784, 0.22, 'triangle', 0.10, 784), 140);
}
function playBossSound() { playTone(70, 0.7, 'sawtooth', 0.16, 40); }

// ------------------------------------------------------------------ günlük

const pad3 = id => String(id).padStart(3, '0');
const label = o => `'${o.name}-ID${pad3(o.id)}'`;

function addLog(msg) {
    const stamp = `[${new Date().toLocaleTimeString()}] ${msg}`;
    logs.push(stamp);
    const box = document.getElementById('gameLog');
    const div = document.createElement('div');
    div.className = 'log-entry';
    div.innerText = stamp;
    box.prepend(div);
    while (box.childElementCount > 150) box.removeChild(box.lastChild);
    box.scrollTop = 0;
}

// ------------------------------------------------------------------ dünya olayları

function onWorldEvent(type, d) {
    switch (type) {
        case 'build':
            addLog(`Kullanıcı, (${Math.floor(d.tower.x)}, ${Math.floor(d.tower.y)}) konumuna '${d.tower.name}-ID${pad3(d.tower.id)}' inşa etti. Kalan Enerji: ${world.money}.`);
            fx.rings.push({ x: d.tower.x, y: d.tower.y, r: 20, max: 70, life: 0.5, maxLife: 0.5, color: '120,255,200' });
            break;
        case 'upgrade':
            addLog(`'${d.tower.name}-ID${pad3(d.tower.id)}' Seviye ${d.tower.level}'e yükseltildi. Kalan Enerji: ${world.money}.`);
            fx.rings.push({ x: d.tower.x, y: d.tower.y, r: 25, max: 90, life: 0.6, maxLife: 0.6, color: '255,220,90' });
            break;
        case 'sell':
            addLog(`'${d.tower.name}-ID${pad3(d.tower.id)}' satıldı. +${d.refund} Enerji. Kalan Enerji: ${world.money}.`);
            break;
        case 'waveStart': {
            const info = Object.entries(d.counts).map(([t, c]) => `${currentMap.enemyNames[t] || t}: ${c}`).join(', ');
            addLog(`=== DALGA ${d.wave} BAŞLADI === (${info}, Toplam: ${d.total})`);
            if (d.counts.boss) playBossSound();
            break;
        }
        case 'spawn':
            addLog(`${d.enemy.name} haritaya girdi.`);
            break;
        case 'fire':
            playTowerFireSound(d.tower.type);
            break;
        case 'aoe':
            fx.rings.push({ x: d.x, y: d.y, r: 10, max: d.radius * 1.15, life: 0.45, maxLife: 0.45, color: '255,230,80', aoeImg: true });
            break;
        case 'hit': {
            const slowText = d.slowed ? `, Yavaşlatma %${Math.round(d.tower.slow * 100)} (${d.tower.slowTime} sn) uygulandı` : '';
            addLog(`${d.tower.aoe ? 'Şok alanı' : 'Mermi'} isabet: ${label(d.enemy)} Net Hasar: ${d.dmg.toFixed(1)}${slowText}. Kalan Can: ${d.enemy.health.toFixed(0)}/${d.enemy.maxHealth}`);
            break;
        }
        case 'kill':
            addLog(`${label(d.enemy)} öldü. Ödül +${d.reward}. Toplam Enerji: ${world.money}.`);
            playEnemyDeathSound();
            spawnBubbles(d.enemy.x, d.enemy.y, d.enemy.type === 'boss' ? 26 : 8);
            fx.floaters.push({ x: d.enemy.x, y: d.enemy.y - 30, text: '+' + d.reward, color: '#ffd84a', life: 1.0, maxLife: 1.0 });
            break;
        case 'leak':
            addLog(`${label(d.enemy)} üsse ulaştı. Oyuncu Canı: ${Math.max(0, Math.round(world.health))} (-${d.enemy.damage}).`);
            playBaseHitSound();
            fx.flash = 1;
            fx.floaters.push({ x: d.enemy.x, y: d.enemy.y - 20, text: '-' + d.enemy.damage, color: '#ff5a64', life: 1.2, maxLife: 1.2 });
            break;
        case 'waveClear':
            addLog(`Dalga temizlendi! Dalga bonusu: +${d.bonus} Enerji. Toplam Enerji: ${world.money}.`);
            playWaveClearSound();
            fx.floaters.push({ x: W / 2, y: 120, text: `Dalga temizlendi  +${d.bonus}`, color: '#7dffb0', life: 2.0, maxLife: 2.0, big: true });
            break;
        case 'end':
            endDelay = 0.9;
            break;
    }
}

function spawnBubbles(x, y, n) {
    for (let i = 0; i < n; i++) {
        fx.bubbles.push({
            x: x + (Math.random() - 0.5) * 30, y: y + (Math.random() - 0.5) * 20,
            vx: (Math.random() - 0.5) * 30, vy: -30 - Math.random() * 50,
            r: 2 + Math.random() * 4, life: 0.7 + Math.random() * 0.5, maxLife: 1.2,
        });
    }
}

// ------------------------------------------------------------------ harita ve oyun başlatma

function buildAmbient(map) {
    const a = map.ambient || {};
    const out = { motes: [], rays: [], bubbles: [], fish: [] };
    if (a.fish) {
        const schools = a.fish.schools || 2;
        for (let sIdx = 0; sIdx < schools; sIdx++) {
            const dir = Math.random() < 0.5 ? 1 : -1;
            const y0 = 80 + Math.random() * (H - 160);
            const x0 = Math.random() * W;
            const col = a.fish.colors[sIdx % a.fish.colors.length];
            const n = 5 + Math.floor(Math.random() * 4);
            for (let i = 0; i < n; i++) {
                out.fish.push({
                    x: x0 - dir * i * (14 + Math.random() * 16), y: y0 + (Math.random() - 0.5) * 60,
                    dir, sp: 38 + Math.random() * 14 + sIdx * 6, size: 9 + Math.random() * 5, ph: Math.random() * 6.28, col,
                });
            }
        }
    }
    for (let i = 0; i < (a.motes || 0); i++) {
        out.motes.push({ x: Math.random() * W, y: Math.random() * H, r: 0.8 + Math.random() * 1.8, ph: Math.random() * 6.28, sp: 6 + Math.random() * 14 });
    }
    for (let i = 0; i < (a.bubbles || 0); i++) {
        out.bubbles.push({ x: Math.random() * W, y: Math.random() * H, r: 2 + Math.random() * 5, sp: 18 + Math.random() * 30, ph: Math.random() * 6.28 });
    }
    for (let i = 0; i < ((a.rays && a.rays.count) || 0); i++) {
        out.rays.push({ x: (i + 0.5) / a.rays.count * W * 1.3 - 120, w: 70 + Math.random() * 110, ph: Math.random() * 6.28, sp: 0.15 + Math.random() * 0.2 });
    }
    return out;
}

function buildPathSamples(w) {
    pathSamples = w.paths.map(p => {
        const pts = [];
        for (let d = 0; d <= p.length; d += 46) pts.push(d);
        return { path: p, ds: pts };
    });
}
function pointAtDistance(path, d) {
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
    return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, angle: Math.atan2(b.y - a.y, b.x - a.x) };
}

function selectMap(mapIndex) {
    currentMapIndex = mapIndex;
    currentMap = MAPS[mapIndex];
    loadSprites(currentMap);

    ['menuScreen', 'mapSelectScreen', 'winScreen', 'loseScreen', 'towerModal'].forEach(id =>
        document.getElementById(id).classList.add('hidden'));
    document.getElementById('gameScreen').classList.remove('hidden');

    logs = [];
    world = new Core.World(currentMap, { difficulty, seed: Date.now() & 0x7fffffff, onEvent: onWorldEvent });
    buildPathSamples(world);
    ambient = buildAmbient(currentMap);
    fx = { floaters: [], rings: [], bubbles: [], flash: 0 };
    paused = false;
    speedMultiplier = 1;
    selectedTower = null;
    hoverSpot = null;
    armedType = null;
    draggedType = null;
    endShown = false;
    endDelay = 0;

    document.getElementById('gameLog').innerHTML = '';
    document.getElementById('pauseButton').innerText = 'DURAKLAT';
    document.getElementById('speedButton').innerText = 'HIZ: 1x';

    renderTowerMarket();
    fitCanvas();
    showBanner();
    addLog(`Oyun başladı! (${currentMap.name} · ${Core.DIFFICULTY[difficulty].label}) Kulelerinizi yeşil alanlara yerleştirin ve dalgayı başlatın.`);
    uiCache = {};
    updateUI();
    renderTowerList();

    cancelAnimationFrame(rafId);
    lastFrame = 0;
    rafId = requestAnimationFrame(gameLoop);
}

function showBanner() {
    const b = document.getElementById('mapBanner');
    b.innerHTML = `<div class="banner-name">${currentMap.name}</div><div class="banner-sub">${world.totalWaves} dalga · ${Core.DIFFICULTY[difficulty].label}</div>`;
    b.classList.remove('show');
    void b.offsetWidth;
    b.classList.add('show');
}

function fitCanvas() {
    const box = document.getElementById('canvasContainer');
    const cw = box.clientWidth || W;
    const ch = box.clientHeight || H;
    const scale = Math.min(cw / W, ch / H);
    res = Math.max(0.75, Math.min(1.6, scale * (window.devicePixelRatio || 1)));
    canvas.width = Math.round(W * res);
    canvas.height = Math.round(H * res);
    ctx.setTransform(res, 0, 0, res, 0, 0);
}
window.addEventListener('resize', () => { if (world) fitCanvas(); });

// ------------------------------------------------------------------ ana döngü

function gameLoop(ts) {
    if (!world) return;
    if (!lastFrame) lastFrame = ts;
    let dt = (ts - lastFrame) / 1000;
    lastFrame = ts;
    if (dt > 0.1) dt = 0.1;
    animTime += dt;

    if (!paused) {
        world.update(dt * speedMultiplier);
        updateFx(dt * speedMultiplier);
    }
    if (world.result && !endShown) {
        endDelay -= dt;
        if (endDelay <= 0) { endShown = true; showEnd(); }
    }
    draw();
    updateUI();
    rafId = requestAnimationFrame(gameLoop);
}

function updateFx(dt) {
    fx.floaters.forEach(f => { f.life -= dt; f.y -= 28 * dt; });
    fx.floaters = fx.floaters.filter(f => f.life > 0);
    fx.rings.forEach(r => { r.life -= dt; });
    fx.rings = fx.rings.filter(r => r.life > 0);
    fx.bubbles.forEach(b => { b.life -= dt; b.x += b.vx * dt; b.y += b.vy * dt; });
    fx.bubbles = fx.bubbles.filter(b => b.life > 0);
    fx.flash = Math.max(0, fx.flash - dt * 2.5);
}

// ------------------------------------------------------------------ çizim

function draw() {
    ctx.setTransform(res, 0, 0, res, 0, 0);
    if (ready(sprites.bg)) {
        ctx.drawImage(sprites.bg, 0, 0, W, H);
    } else {
        ctx.fillStyle = '#001d3d';
        ctx.fillRect(0, 0, W, H);
    }

    drawAmbientBack();
    drawPath();
    drawSpots();
    drawEntities();
    drawAmbientFront();
    drawFx();

    if (paused) {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
        ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 60px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('DURAKLANDI', W / 2, H / 2);
        ctx.textAlign = 'left';
    }
}

function drawAmbientBack() {
    const a = currentMap.ambient;
    if (!a) return;

    if (a.rays && ambient.rays.length) {
        // not: JavaFX WebKit'te globalCompositeOperation = 'lighter' tuvali siliyor, bu yüzden normal alfa kullanılır
        ctx.save();
        ambient.rays.forEach(r => {
            const sway = Math.sin(animTime * r.sp + r.ph);
            const x0 = r.x + sway * 40;
            const g = ctx.createLinearGradient(x0, 0, x0 + 260, H);
            g.addColorStop(0, `rgba(${a.rays.color},${a.rays.alpha * (0.7 + 0.3 * sway)})`);
            g.addColorStop(1, `rgba(${a.rays.color},0)`);
            ctx.fillStyle = g;
            ctx.beginPath();
            ctx.moveTo(x0, 0);
            ctx.lineTo(x0 + r.w, 0);
            ctx.lineTo(x0 + r.w + 300, H);
            ctx.lineTo(x0 + 220, H);
            ctx.closePath();
            ctx.fill();
        });
        ctx.restore();
    }

    if (out_fish_guard()) drawFish(a);

    if (a.caustics && ready(sprites.caustics)) {
        if (!sprites.causticsPattern) sprites.causticsPattern = ctx.createPattern(sprites.caustics, 'repeat');
        ctx.save();
        const layers = [{ s: 1.0, ox: 14, oy: 9, al: a.caustics }, { s: 1.6, ox: -9, oy: 12, al: a.caustics * 0.8 }];
        layers.forEach(l => {
            ctx.globalAlpha = l.al;
            ctx.save();
            ctx.scale(l.s, l.s);
            ctx.translate((animTime * l.ox) % 512, (animTime * l.oy) % 512);
            ctx.fillStyle = sprites.causticsPattern;
            ctx.fillRect(-512, -512, W / l.s + 1024, H / l.s + 1024);
            ctx.restore();
        });
        ctx.restore();
    }
}

function out_fish_guard() {
    return ambient && ambient.fish && ambient.fish.length > 0;
}

function drawFish(a) {
    ambient.fish.forEach(f => {
        f.x += f.dir * f.sp * 0.016;
        if (f.dir > 0 && f.x > W + 40) f.x = -40;
        if (f.dir < 0 && f.x < -40) f.x = W + 40;
        const wob = Math.sin(animTime * 5 + f.ph);
        const y = f.y + Math.sin(animTime * 0.9 + f.ph) * 10;
        ctx.save();
        ctx.translate(f.x, y);
        ctx.scale(f.dir, 1);
        ctx.globalAlpha = a.fish.alpha || 0.8;
        ctx.fillStyle = f.col;
        ctx.beginPath();
        ctx.ellipse(0, 0, f.size, f.size * 0.5, 0, 0, 6.2832);
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(-f.size * 0.8, 0);
        ctx.lineTo(-f.size * 1.6, -f.size * 0.55 + wob * 2);
        ctx.lineTo(-f.size * 1.6, f.size * 0.55 + wob * 2);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.85)';
        ctx.beginPath();
        ctx.arc(f.size * 0.5, -f.size * 0.1, f.size * 0.13, 0, 6.2832);
        ctx.fill();
        ctx.restore();
    });
}

function drawAmbientFront() {
    const a = currentMap.ambient;
    if (!a) return;

    ambient.motes.forEach(m => {
        m.y -= m.sp * 0.016;
        m.x += Math.sin(animTime * 0.6 + m.ph) * 0.12;
        if (m.y < -4) { m.y = H + 4; m.x = Math.random() * W; }
        const tw = 0.35 + 0.35 * Math.sin(animTime * 1.7 + m.ph);
        ctx.fillStyle = `rgba(${a.moteColor || '220,255,255'},${tw})`;
        ctx.beginPath();
        ctx.arc(m.x, m.y, m.r, 0, 6.2832);
        ctx.fill();
    });

    ctx.lineWidth = 1.2;
    ambient.bubbles.forEach(b => {
        b.y -= b.sp * 0.016;
        const x = b.x + Math.sin(animTime * 1.2 + b.ph) * 8;
        if (b.y < -10) { b.y = H + 10; b.x = Math.random() * W; }
        ctx.strokeStyle = 'rgba(220,250,255,0.45)';
        ctx.fillStyle = 'rgba(200,240,255,0.10)';
        ctx.beginPath();
        ctx.arc(x, b.y, b.r, 0, 6.2832);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = 'rgba(255,255,255,0.6)';
        ctx.beginPath();
        ctx.arc(x - b.r * 0.35, b.y - b.r * 0.35, b.r * 0.22, 0, 6.2832);
        ctx.fill();
    });

    if (a.vignette) {
        const g = ctx.createRadialGradient(W / 2, H / 2, H * 0.45, W / 2, H / 2, H * 0.95);
        g.addColorStop(0, 'rgba(0,0,0,0)');
        g.addColorStop(1, `rgba(${a.vignetteColor || '0,10,25'},${a.vignette})`);
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, W, H);
    }
}

function drawPath() {
    const style = currentMap.pathStyle || 'flow';
    if (style === 'none') return;

    if (style === 'rail') {
        world.paths.forEach(p => {
            ctx.beginPath();
            ctx.moveTo(p.points[0].x, p.points[0].y);
            for (let i = 1; i < p.points.length; i++) ctx.lineTo(p.points[i].x, p.points[i].y);
            ctx.strokeStyle = 'rgba(0, 0, 0, 0.55)';
            ctx.lineWidth = 11;
            ctx.stroke();
            ctx.strokeStyle = 'rgba(255, 210, 100, 0.95)';
            ctx.lineWidth = 5;
            ctx.setLineDash([12, 6]);
            ctx.stroke();
            ctx.setLineDash([]);
        });
        return;
    }

    // 'flow': yolun üstünde akan küçük oklar, çıkışta (üs) parlayan kapı
    const col = currentMap.flowColor || '255,236,170';
    pathSamples.forEach(ps => {
        const off = (animTime * 34) % 46;
        for (let d = off; d < ps.path.length - 20; d += 46) {
            const pt = pointAtDistance(ps.path, d);
            const fade = Math.min(1, d / 80, (ps.path.length - d) / 80);
            ctx.save();
            ctx.translate(pt.x, pt.y);
            ctx.rotate(pt.angle);
            ctx.fillStyle = `rgba(${col},${0.34 * fade})`;
            ctx.beginPath();
            ctx.moveTo(7, 0);
            ctx.lineTo(-4, -6);
            ctx.lineTo(-1, 0);
            ctx.lineTo(-4, 6);
            ctx.closePath();
            ctx.fill();
            ctx.restore();
        }
        const end = ps.path.points[ps.path.points.length - 1];
        const pulse = 0.5 + 0.5 * Math.sin(animTime * 2.4);
        const g = ctx.createRadialGradient(end.x, end.y, 4, end.x, end.y, 46 + pulse * 8);
        g.addColorStop(0, 'rgba(255,90,100,0.55)');
        g.addColorStop(1, 'rgba(255,90,100,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(end.x, end.y, 54, 0, 6.2832);
        ctx.fill();
    });
}

function drawSpots() {
    const pulse = 0.5 + 0.5 * Math.sin(animTime * 2.2);
    for (const spot of world.spots) {
        if (spot.tower) continue;
        const hovered = hoverSpot === spot;
        const high = spot.kind === 'high';
        const rgb = high ? '255,205,70' : '0,255,136';

        ctx.fillStyle = `rgba(${rgb},${hovered ? 0.5 : 0.18 + pulse * 0.05})`;
        ctx.strokeStyle = hovered ? `rgb(${rgb})` : `rgba(${rgb},0.6)`;
        ctx.lineWidth = hovered ? 3 : 2;
        ctx.beginPath();
        ctx.arc(spot.x, spot.y, Core.BUILD_SPOT_RADIUS, 0, 6.2832);
        ctx.fill();
        ctx.stroke();

        if (!hovered) {
            ctx.strokeStyle = `rgba(${rgb},0.4)`;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(spot.x - 15, spot.y);
            ctx.lineTo(spot.x + 15, spot.y);
            ctx.moveTo(spot.x, spot.y - 15);
            ctx.lineTo(spot.x, spot.y + 15);
            ctx.stroke();
        }
        if (high) {
            ctx.strokeStyle = `rgba(255,215,90,${0.35 + pulse * 0.25})`;
            ctx.lineWidth = 2;
            ctx.setLineDash([5, 7]);
            ctx.beginPath();
            ctx.arc(spot.x, spot.y, Core.BUILD_SPOT_RADIUS + 6, 0, 6.2832);
            ctx.stroke();
            ctx.setLineDash([]);
        }
        if (hovered && (draggedType || armedType)) {
            const type = draggedType || armedType;
            const range = Core.TOWER_TYPES[type].range * (high ? Core.HIGH_GROUND_RANGE : 1);
            ctx.strokeStyle = 'rgba(255,255,255,0.45)';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(spot.x, spot.y, range, 0, 6.2832);
            ctx.stroke();
        }
    }
}

function drawEntities() {
    // üstteki nesneler altakileri örtsün diye y'ye göre sırala
    const items = [];
    world.towers.forEach(t => items.push({ y: t.y, draw: () => drawTower(t) }));
    world.enemies.forEach(e => items.push({ y: e.y, draw: () => drawEnemy(e) }));
    items.sort((a, b) => a.y - b.y);
    items.forEach(i => i.draw());
    world.projectiles.forEach(drawProjectile);
}

function drawShadow(x, y, w, h, alpha) {
    ctx.fillStyle = `rgba(0,15,30,${alpha})`;
    ctx.beginPath();
    ctx.ellipse(x, y, w, h, 0, 0, 6.2832);
    ctx.fill();
}

function drawEnemy(e) {
    const bob = Math.sin(animTime * 4.2 + e.id * 1.7) * (e.type === 'boss' ? 2 : 3);
    const sinceHit = animTime - (e.hitAnim || -10);
    if (e.lastHit !== e.hitSeen) { e.hitSeen = e.lastHit; e.hitAnim = animTime; }
    const pulse = sinceHit < 0.12 ? 1 + (0.12 - sinceHit) * 0.7 : 1;
    const size = e.size * pulse;

    if (e.type === 'boss' || e.mini) {
        const g = ctx.createRadialGradient(e.x, e.y, size * 0.2, e.x, e.y, size * 0.85);
        g.addColorStop(0, 'rgba(255,60,60,0.35)');
        g.addColorStop(1, 'rgba(255,60,60,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(e.x, e.y, size * 0.85, 0, 6.2832);
        ctx.fill();
    }
    drawShadow(e.x, e.y + size * 0.36, size * 0.34, size * 0.1, 0.22);

    const img = enemySprite(e.type);
    ctx.save();
    ctx.translate(e.x, e.y + bob);
    if (currentMap.flipSprites && e.dirX > 0) ctx.scale(-1, 1);
    if (ready(img)) {
        ctx.drawImage(img, -size / 2, -size / 2, size, size);
    } else {
        ctx.fillStyle = '#c33';
        ctx.beginPath();
        ctx.arc(0, 0, size * 0.35, 0, 6.2832);
        ctx.fill();
    }
    ctx.restore();

    if (e.health < e.maxHealth || e.type === 'boss') {
        const bw = e.type === 'boss' ? 90 : e.size * 0.75;
        const by = e.y - e.size * 0.58;
        const pct = Math.max(0, e.health / e.maxHealth);
        ctx.fillStyle = 'rgba(0,0,0,0.75)';
        ctx.fillRect(e.x - bw / 2 - 1, by - 1, bw + 2, 8);
        ctx.fillStyle = pct > 0.5 ? '#3ddc6b' : pct > 0.25 ? '#f2c230' : '#ef4b4b';
        ctx.fillRect(e.x - bw / 2, by, bw * pct, 6);
    }
    if (e.isSlowed) {
        ctx.strokeStyle = 'rgba(80,170,255,0.9)';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(e.x, e.y + bob, size * 0.46, 0, 6.2832);
        ctx.stroke();
        ctx.fillStyle = 'rgba(80,170,255,0.18)';
        ctx.fill();
    }
}

function drawTower(t) {
    const idle = Math.sin(animTime * 2 + t.id) * 1.6;
    const since = world.time - t.firedAt;
    const recoil = since < 0.16 ? 1 + (0.16 - since) * 0.9 : 1;
    const selected = selectedTower === t;

    if (t.spot.kind === 'high') {
        ctx.strokeStyle = 'rgba(255,215,90,0.75)';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.ellipse(t.x, t.y + 34, 46, 15, 0, 0, 6.2832);
        ctx.stroke();
    }
    drawShadow(t.x, t.y + 38, 36, 11, 0.28);

    if (selected || hoverTowerId === t.id) {
        ctx.beginPath();
        ctx.strokeStyle = selected ? 'rgba(255,255,255,0.55)' : 'rgba(255,255,255,0.28)';
        ctx.fillStyle = selected ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.03)';
        ctx.lineWidth = 2;
        ctx.arc(t.x, t.y, t.range, 0, 6.2832);
        ctx.fill();
        ctx.stroke();
    }

    const img = sprites.towers[t.type];
    const s = 100 * recoil;
    if (ready(img)) ctx.drawImage(img, t.x - s / 2, t.y - s / 2 + idle, s, s);
    else {
        ctx.fillStyle = 'blue';
        ctx.fillRect(t.x - 25, t.y - 25, 50, 50);
    }

    for (let i = 0; i < 3; i++) {
        ctx.fillStyle = i < t.level ? '#ffcc00' : 'rgba(0,0,0,0.45)';
        ctx.strokeStyle = 'rgba(0,0,0,0.7)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(t.x - 12 + i * 12, t.y + 58, 4.2, 0, 6.2832);
        ctx.fill();
        ctx.stroke();
    }

    if (selected) {
        ctx.beginPath();
        ctx.strokeStyle = '#00ff88';
        ctx.lineWidth = 3;
        ctx.arc(t.x, t.y, 55, 0, 6.2832);
        ctx.stroke();
    }
}

function drawProjectile(p) {
    const img = sprites.projectiles[p.type];
    if (ready(img)) {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(animTime * 9);
        ctx.globalAlpha = 0.28;
        ctx.drawImage(img, -12 - Math.cos(p.angle) * 12, -12 - Math.sin(p.angle) * 12, 24, 24);
        ctx.globalAlpha = 1;
        ctx.drawImage(img, -15, -15, 30, 30);
        ctx.restore();
    } else {
        ctx.fillStyle = 'yellow';
        ctx.beginPath();
        ctx.arc(p.x, p.y, 8, 0, 6.2832);
        ctx.fill();
    }
}

function drawFx() {
    fx.rings.forEach(r => {
        const k = 1 - r.life / r.maxLife;
        const radius = r.r + (r.max - r.r) * k;
        ctx.globalAlpha = 1 - k;
        if (r.aoeImg && ready(sprites.projectiles.eel)) {
            ctx.drawImage(sprites.projectiles.eel, r.x - radius, r.y - radius, radius * 2, radius * 2);
        }
        ctx.strokeStyle = `rgba(${r.color},0.9)`;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(r.x, r.y, radius, 0, 6.2832);
        ctx.stroke();
        ctx.globalAlpha = 1;
    });

    fx.bubbles.forEach(b => {
        ctx.globalAlpha = Math.max(0, b.life / b.maxLife);
        ctx.strokeStyle = 'rgba(230,250,255,0.9)';
        ctx.fillStyle = 'rgba(200,240,255,0.25)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.r, 0, 6.2832);
        ctx.fill();
        ctx.stroke();
        ctx.globalAlpha = 1;
    });

    ctx.textAlign = 'center';
    fx.floaters.forEach(f => {
        ctx.globalAlpha = Math.min(1, f.life / (f.maxLife * 0.5));
        ctx.font = f.big ? 'bold 34px sans-serif' : 'bold 20px sans-serif';
        ctx.lineWidth = 4;
        ctx.strokeStyle = 'rgba(0,0,0,0.7)';
        ctx.strokeText(f.text, f.x, f.y);
        ctx.fillStyle = f.color;
        ctx.fillText(f.text, f.x, f.y);
    });
    ctx.globalAlpha = 1;
    ctx.textAlign = 'left';

    if (fx.flash > 0) {
        const g = ctx.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, H * 0.9);
        g.addColorStop(0, 'rgba(255,40,50,0)');
        g.addColorStop(1, `rgba(255,40,50,${0.5 * fx.flash})`);
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, W, H);
    }
}

// ------------------------------------------------------------------ kule market ve giriş

function renderTowerMarket() {
    const container = document.getElementById('towerMarketContainer');
    container.innerHTML = '';
    TOWER_ORDER.forEach((type, idx) => {
        const btn = document.createElement('div');
        btn.className = 'tower-button';
        btn.setAttribute('draggable', 'true');
        btn.setAttribute('data-tower', type);
        const name = currentMap.towerNames[type];
        btn.innerHTML = `
            <div class="tower-icon-box"><img src="${currentMap.assets.towers[type]}" alt="${name}"></div>
            <div class="tower-info"><strong>${name} <span class="hotkey">${idx + 1}</span></strong>
                <div class="tower-cost"><span class="cost-val"></span> Enerji</div>
                <div class="tower-role">${TOWER_ROLE[type]}</div>
            </div>`;
        btn.addEventListener('dragstart', () => {
            draggedType = type;
            armedType = null;
            btn.classList.add('dragging');
        });
        btn.addEventListener('dragend', () => {
            btn.classList.remove('dragging');
            hoverSpot = null;
            draggedType = null;
        });
        btn.addEventListener('click', () => armTower(type));
        container.appendChild(btn);
    });
}

function armTower(type) {
    armedType = armedType === type ? null : type;
    document.querySelectorAll('.tower-button').forEach(b =>
        b.classList.toggle('armed', b.getAttribute('data-tower') === armedType));
}

function toLogical(e) {
    const rect = canvas.getBoundingClientRect();
    const scale = Math.min(rect.width / W, rect.height / H);
    const ox = (rect.width - W * scale) / 2;
    const oy = (rect.height - H * scale) / 2;
    return { x: (e.clientX - rect.left - ox) / scale, y: (e.clientY - rect.top - oy) / scale };
}

function spotAt(p) {
    for (const spot of world.spots) {
        if (!spot.tower && Math.hypot(p.x - spot.x, p.y - spot.y) < Core.BUILD_SPOT_RADIUS) return spot;
    }
    return null;
}

function towerAt(p) {
    let best = null;
    let bestDist = 60;
    for (const t of world.towers) {
        const d = Math.hypot(t.x - p.x, t.y - p.y);
        if (d < bestDist) { bestDist = d; best = t; }
    }
    return best;
}

function tryBuild(type, spot) {
    const cost = world.towerCost(type);
    if (!spot) {
        addLog('Kule sadece yeşil alanlara yerleştirilebilir!');
        return false;
    }
    if (world.money < cost) {
        addLog('Yetersiz enerji!');
        fx.floaters.push({ x: spot.x, y: spot.y - 40, text: `${cost} Enerji gerek`, color: '#ff8a8a', life: 1.2, maxLife: 1.2 });
        return false;
    }
    world.placeTower(type, spot);
    updateUI();
    renderTowerList();
    return true;
}

let hoverTowerId = null;

canvas.addEventListener('dragover', (e) => {
    e.preventDefault();
    hoverSpot = world ? spotAt(toLogical(e)) : null;
});
canvas.addEventListener('dragleave', () => { hoverSpot = null; });
canvas.addEventListener('drop', (e) => {
    e.preventDefault();
    if (!world || !draggedType) return;
    tryBuild(draggedType, spotAt(toLogical(e)));
    hoverSpot = null;
    draggedType = null;
});
canvas.addEventListener('mousemove', (e) => {
    if (!world) return;
    const p = toLogical(e);
    hoverSpot = armedType ? spotAt(p) : null;
    const t = towerAt(p);
    hoverTowerId = t ? t.id : null;
    canvas.style.cursor = armedType ? (hoverSpot ? 'copy' : 'not-allowed') : (t ? 'pointer' : 'default');
});
canvas.addEventListener('mouseleave', () => { hoverSpot = null; hoverTowerId = null; });
canvas.addEventListener('click', (e) => {
    if (!world || world.result) return;
    const p = toLogical(e);
    if (armedType) {
        const spot = spotAt(p);
        if (spot) { tryBuild(armedType, spot); return; }
    }
    const t = towerAt(p);
    if (t) {
        armedType = null;
        document.querySelectorAll('.tower-button').forEach(b => b.classList.remove('armed'));
        openTowerModal(t);
    } else if (!armedType) {
        closeTowerModal();
    }
});

document.addEventListener('keydown', (e) => {
    if (!world || document.getElementById('gameScreen').classList.contains('hidden')) return;
    const k = e.key.toLowerCase();
    if (k === 'escape') {
        if (armedType) { armTower(armedType); }
        else if (selectedTower) closeTowerModal();
        else quitToMapSelect();
    } else if (k === ' ') {
        e.preventDefault();
        startNextWave();
    } else if (k === 'p') togglePause();
    else if (k === 'f') toggleSpeed();
    else if (k >= '1' && k <= '3') armTower(TOWER_ORDER[+k - 1]);
});

// ------------------------------------------------------------------ kule penceresi

function statLine(t) {
    return `Hasar: ${t.dmg}   Menzil: ${t.range}   Atış Aralığı: ${t.rate.toFixed(2)} sn`;
}

function openTowerModal(tower) {
    selectedTower = tower;
    document.getElementById('towerModalName').innerText = `${tower.name} (Seviye ${tower.level}/${Core.MAX_LEVEL})`;

    let stats = statLine(tower);
    if (tower.level < Core.MAX_LEVEL) {
        const next = Object.assign(Object.create(Core.Tower.prototype), tower, { level: tower.level + 1 });
        next.derive();
        stats += `\nSonraki: Hasar ${next.dmg} · Menzil ${next.range} · ${next.rate.toFixed(2)} sn`;
    }
    document.getElementById('towerModalStats').innerText = stats;
    document.getElementById('towerModalPerk').innerText = tower.perk();
    document.getElementById('modeBtn').innerText = 'Hedef: ' + MODE_LABEL[tower.mode];

    const cost = tower.upgradeCost();
    const upgradeBtn = document.getElementById('upgradeBtn');
    if (cost === null) {
        upgradeBtn.innerText = 'MAKSİMUM SEVİYE';
        upgradeBtn.disabled = true;
    } else {
        upgradeBtn.innerText = `YÜKSELT (${cost} Enerji)`;
        upgradeBtn.disabled = world.money < cost;
    }
    document.getElementById('sellBtn').innerText = `SAT (+${tower.sellValue()} Enerji)`;
    document.getElementById('towerModal').classList.remove('hidden');
    renderTowerList();
}

function closeTowerModal() {
    selectedTower = null;
    document.getElementById('towerModal').classList.add('hidden');
    if (world) renderTowerList();
}

function cycleTargetMode() {
    if (!selectedTower) return;
    const modes = Core.TARGET_MODES;
    selectedTower.mode = modes[(modes.indexOf(selectedTower.mode) + 1) % modes.length];
    document.getElementById('modeBtn').innerText = 'Hedef: ' + MODE_LABEL[selectedTower.mode];
}

function upgradeSelectedTower() {
    if (!selectedTower) return;
    if (world.upgradeTower(selectedTower)) {
        updateUI();
        openTowerModal(selectedTower);
    }
}

function sellSelectedTower() {
    if (!selectedTower) return;
    world.sellTower(selectedTower);
    closeTowerModal();
    updateUI();
}

function renderTowerList() {
    const container = document.getElementById('towerList');
    if (world.towers.length === 0) {
        container.innerHTML = '<p style="color:#888; font-size:0.95em;">Henüz kule yerleştirilmedi.</p>';
        return;
    }
    container.innerHTML = '';
    world.towers.forEach(t => {
        const row = document.createElement('div');
        row.className = 'tower-list-row' + (selectedTower === t ? ' selected' : '');
        row.innerText = `${t.name} · Lv${t.level}/${Core.MAX_LEVEL} (ID${pad3(t.id)})`;
        row.onclick = () => openTowerModal(t);
        container.appendChild(row);
    });
}

// ------------------------------------------------------------------ yan panel

let uiCache = {};

function setText(id, value) {
    if (uiCache[id] === value) return;
    uiCache[id] = value;
    document.getElementById(id).innerText = value;
}

function updateUI() {
    if (!world) return;
    const hp = Math.max(0, Math.ceil(world.health));
    setText('healthValue', hp);
    setText('moneyValue', world.money);
    setText('waveValue', `${world.wave}/${world.totalWaves}`);
    const bar = document.getElementById('healthBar');
    const pct = Math.round(100 * hp / world.maxHealth);
    if (uiCache.hpPct !== pct) {
        uiCache.hpPct = pct;
        bar.style.width = pct + '%';
        bar.style.background = pct > 50 ? '#3ddc6b' : pct > 25 ? '#f2c230' : '#ef4b4b';
    }

    const btn = document.getElementById('waveButton');
    const can = world.canStartWave();
    const text = world.wave >= world.totalWaves ? 'SON DALGA GELDİ' : `DALGA ${world.wave + 1} BAŞLAT`;
    if (uiCache.waveBtn !== text + can) {
        uiCache.waveBtn = text + can;
        btn.innerText = text;
        btn.disabled = !can;
    }

    const key = world.wave + ':' + world.towers.length;
    if (uiCache.preview !== key) {
        uiCache.preview = key;
        renderWavePreview();
    }

    document.querySelectorAll('.tower-button').forEach(b => {
        const type = b.getAttribute('data-tower');
        const cost = world.towerCost(type);
        const cv = b.querySelector('.cost-val');
        if (cv.innerText !== String(cost)) cv.innerText = cost;
        const afford = world.money >= cost;
        b.classList.toggle('unaffordable', !afford);
    });

    if (selectedTower && world.towers.includes(selectedTower)) {
        const cost = selectedTower.upgradeCost();
        if (cost !== null) document.getElementById('upgradeBtn').disabled = world.money < cost;
    }
}

function renderWavePreview() {
    const box = document.getElementById('wavePreview');
    const next = world.previewNext();
    if (!next) {
        box.innerHTML = '<div class="preview-title">Tüm dalgalar başladı</div>';
        return;
    }
    const chips = Object.entries(next.counts).map(([type, count]) => {
        const img = currentMap.assets.enemies[type] || (type === 'boss' ? currentMap.assets.enemies.armored : currentMap.assets.enemies.standard);
        const name = currentMap.enemyNames[type] || type;
        return `<span class="chip" title="${name}"><img src="${img}" alt="">×${count}</span>`;
    }).join('');
    box.innerHTML = `<div class="preview-title">Sıradaki: Dalga ${next.wave}</div><div class="chips">${chips}</div>`;
}

function togglePause() {
    if (!world) return;
    paused = !paused;
    document.getElementById('pauseButton').innerText = paused ? 'DEVAM ET' : 'DURAKLAT';
}

function toggleSpeed() {
    if (!world) return;
    speedMultiplier = speedMultiplier === 1 ? 2 : 1;
    document.getElementById('speedButton').innerText = `HIZ: ${speedMultiplier}x`;
}

function startNextWave() {
    if (!world) return;
    if (world.result) return;
    if (world.wave >= world.totalWaves) {
        addLog('Tüm dalgalar başladı!');
        return;
    }
    if (!world.startWave()) addLog('Önceki dalganın düşmanları hâlâ doğuyor, biraz bekleyin.');
    updateUI();
}

// ------------------------------------------------------------------ ekranlar

function showMapSelect() {
    document.getElementById('menuScreen').classList.add('hidden');
    document.getElementById('mapSelectScreen').classList.remove('hidden');
    renderMapSelectScreen();
}

function backToMenuFromMapSelect() {
    document.getElementById('mapSelectScreen').classList.add('hidden');
    document.getElementById('menuScreen').classList.remove('hidden');
}

function stopGame() {
    cancelAnimationFrame(rafId);
    world = null;
    document.getElementById('towerModal').classList.add('hidden');
    document.getElementById('gameScreen').classList.add('hidden');
}

function quitToMapSelect() {
    if (world) addLog('Oyundan çıkıldı, harita seçimine dönüldü.');
    stopGame();
    showMapSelect();
}

function toMapSelect() {
    document.getElementById('winScreen').classList.add('hidden');
    document.getElementById('loseScreen').classList.add('hidden');
    stopGame();
    showMapSelect();
}

function renderMapSelectScreen() {
    records = loadRecords();
    const pills = document.getElementById('difficultyPills');
    pills.innerHTML = '';
    Object.entries(Core.DIFFICULTY).forEach(([key, d]) => {
        const b = document.createElement('button');
        b.className = 'pill' + (key === difficulty ? ' active' : '');
        b.innerText = d.label;
        b.onclick = () => {
            difficulty = key;
            try { window.localStorage.setItem('sas.difficulty', key); } catch (e) { /* yoksay */ }
            renderMapSelectScreen();
        };
        pills.appendChild(b);
    });

    const grid = document.getElementById('mapGrid');
    grid.innerHTML = '';
    MAPS.forEach((m, i) => {
        const rec = records[recordKey(m)];
        const earned = rec ? '★'.repeat(rec.stars) + '☆'.repeat(3 - rec.stars) : '☆☆☆';
        const card = document.createElement('button');
        card.className = 'map-card';
        card.style.backgroundImage = `url('${m.assets.bg}')`;
        card.innerHTML = `
            <div class="map-card-shade"></div>
            <div class="map-card-earned ${rec ? 'done' : ''}">${earned}</div>
            <div class="map-card-text">
                <div class="map-card-name">${m.name}</div>
                <div class="map-card-desc">${m.desc}</div>
                <div class="map-card-meta">Zorluk ${'●'.repeat(m.stars)}${'○'.repeat(5 - m.stars)} · ${Core.totalWavesOf(m)} dalga</div>
            </div>`;
        card.onclick = () => selectMap(i);
        grid.appendChild(card);
    });
}

function showEnd() {
    document.getElementById('towerModal').classList.add('hidden');
    const s = world.stats;
    const statsText = `${s.kills} düşman yok edildi · ${world.towers.length} kule · ${Core.DIFFICULTY[difficulty].label}`;
    if (world.result === 'win') {
        const hp = Math.max(0, Math.ceil(world.health));
        const stars = starsFor(hp, world.maxHealth);
        const key = recordKey(currentMap);
        if (!records[key] || records[key].stars < stars) {
            records[key] = { stars, health: hp };
            saveRecords(records);
        }
        document.getElementById('finalHealthWin').innerText = hp;
        document.getElementById('finalMoneyWin').innerText = world.money;
        document.getElementById('winStars').innerText = '★'.repeat(stars) + '☆'.repeat(3 - stars);
        document.getElementById('winStats').innerText = statsText;
        document.getElementById('winScreen').classList.remove('hidden');
        addLog(`TEBRİKLER! Oyunu kazandınız! Kalan Can: ${hp}`);
    } else {
        document.getElementById('finalWaveLose').innerText = `${world.wave}/${world.totalWaves}`;
        document.getElementById('finalMoneyLose').innerText = world.money;
        document.getElementById('loseStats').innerText = statsText;
        document.getElementById('loseScreen').classList.remove('hidden');
        addLog('Oyunu kaybettiniz!');
    }
}

function downloadLog() {
    try {
        let txt = '=== SU ALTI SAVUNMA - SİMÜLASYON GÜNLÜĞÜ ===\n';
        txt += `Simülasyon Başladı. Harita: '${currentMap.name}' (${Core.DIFFICULTY[difficulty].label}). Başlangıç Can: ${world ? world.maxHealth : '-'}.\n`;
        txt += '================================================\n\n';
        txt += logs.join('\n');
        txt += '\n\n================================================\n';
        txt += 'SON DURUM RAPORU\n';
        txt += '================================================\n';
        if (world) {
            txt += `Kalan Can: ${Math.max(0, Math.ceil(world.health))}\n`;
            txt += `Kalan Enerji: ${world.money}\n`;
            txt += `Ulaşılan Dalga: ${world.wave}/${world.totalWaves}\n`;
            txt += `Toplam Kule: ${world.towers.length}\n`;
            txt += `Yok Edilen Düşman: ${world.stats.kills}\n`;
            txt += `Tarih: ${new Date().toLocaleString()}\n`;
            if (world.result === 'win') txt += '\nSON: Tüm dalgalar temizlendi. OYUN KAZANILDI!\n';
            else if (world.result === 'lose') txt += '\nSON: Üs düştü. OYUN KAYBEDİLDİ!\n';
        }

        if (window.javaBridge && window.javaBridge.saveLog) {
            window.javaBridge.saveLog(txt);
        } else {
            console.error('JavaBridge bulunamadı!');
            alert('Java bağlantısı kurulamadı! Log kaydedilemedi.');
        }
    } catch (error) {
        console.error('İndirme hatası:', error);
        if (world) addLog('Günlük kaydedilemedi! Hata: ' + error.message);
    }
}

function toggleInfo() {
    document.getElementById('infoModal').classList.toggle('hidden');
}

function exitGame() {
    alert('JAVA_EXIT_APP');
}

function restartGame() {
    selectMap(currentMapIndex);
}

window.onload = function () {
    document.getElementById('menuScreen').classList.remove('hidden');
    renderMapSelectScreen();
    // geliştirme kısayolu: index.html#map=2&diff=hard haritayı doğrudan açar
    const m = /map=(\d+)/.exec(location.hash);
    const d = /diff=(\w+)/.exec(location.hash);
    if (d && Core.DIFFICULTY[d[1]]) difficulty = d[1];
    if (m && MAPS[+m[1]]) selectMap(+m[1]);
};
