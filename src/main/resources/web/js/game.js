// Çizim, efekt, ses ve arayüz. Oyun kuralları js/core.js içindedir, haritalar js/maps.js içinde.
'use strict';

// tuval boyutu haritadan gelir (varsayılan 1350x900 = 3:2)
let W = 1350;
let H = 900;
// kule, düşman ve mermi çizimleri tüm haritalarda ortaktır; haritaya özel olan arka plan ve kule listesidir
const SPRITE_FILES = {
    towers: {
        octopus: 'assets/tower_octopus.png', eel: 'assets/tower_eel.png', jellyfish: 'assets/jellyfish.png',
        swordfish: 'assets/tower_swordfish.png', swordfish_base: 'assets/tower_swordfish_base.png', swordfish_fish: 'assets/tower_swordfish_fish.png', angler: 'assets/tower_angler.png', puffer: 'assets/tower_puffer.png',
    },
    enemies: {
        standard: 'assets/enemy_shark.png', armored: 'assets/enemy_lobster.png', flying: 'assets/enemy_ray.png',
        swarm: 'assets/enemy_pup.png', boss_shark: 'assets/enemy_king.png', boss_crab: 'assets/enemy_king_crab.png',
        boss_manta: 'assets/enemy_king_manta.png', boss_brood: 'assets/enemy_king_brood.png',
    },
    projectiles: {
        octopus: 'assets/projectile_octopus.png', eel: 'assets/projectile_eel.png', jellyfish: 'assets/projectile_jellyfish.png',
        swordfish: 'assets/projectile_swordfish.png', puffer: 'assets/projectile_puffer.png',
    },
};
const towerOrder = () => currentMap.towers;
const MODE_LABEL = { first: 'İlk', last: 'Son', strong: 'En Güçlü', close: 'En Yakın' };

// ------------------------------------------------------------------ kayıtlar (js/settings.js)

let difficulty = Settings.difficulty();
if (!Core.DIFFICULTY[difficulty]) difficulty = 'normal';

function starsFor(health, maxHealth) {
    const f = health / maxHealth;
    return f >= 0.8 ? 3 : f >= 0.4 ? 2 : 1;
}
function recordKey(map) { return map.id + ':' + difficulty; }

// Java kayıtlı verileri yükleyince çağrılır
function refreshAfterLoad() {
    difficulty = Settings.difficulty();
    if (!Core.DIFFICULTY[difficulty]) difficulty = 'normal';
    if (!document.getElementById('mapSelectScreen').classList.contains('hidden')) renderMapSelectScreen();
}

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
    sprites = { bg: loadImage(map.bg), towers: {}, enemies: {}, projectiles: {} };
    Object.keys(SPRITE_FILES.towers).forEach(k => { sprites.towers[k] = loadImage(SPRITE_FILES.towers[k]); });
    Object.keys(SPRITE_FILES.enemies).forEach(k => { sprites.enemies[k] = loadImage(SPRITE_FILES.enemies[k]); });
    Object.keys(SPRITE_FILES.projectiles).forEach(k => { sprites.projectiles[k] = loadImage(SPRITE_FILES.projectiles[k]); });
    sprites.caustics = map.ambient && map.ambient.caustics ? loadImage('assets/fx/caustics.png') : null;
}
function enemyKey(type, kind) { return type === 'boss' ? 'boss_' + (kind || 'shark') : type; }
function enemySprite(e) { return sprites.enemies[enemyKey(e.type, e.kind)] || sprites.enemies.standard; }
// dalga özeti ve önizleme için tür adı
function typeName(type) {
    if (type === 'boss') return Core.BOSS_KINDS[currentMap.boss || 'shark'].name;
    return (currentMap.enemyNames && currentMap.enemyNames[type]) || Core.ENEMY_NAMES[type] || type;
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
let fx = { floaters: [], rings: [], bubbles: [], flash: 0, warns: [], sparks: [], guardGlow: [] };
let zoneBands = [];
let ambient = null;
let res = 1;

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// ------------------------------------------------------------------ Java köprüsü

// Sesler Java tarafında (SoundBank) üretilir; burada yalnızca adı ve sıklığı belirlenir.
const lastSfx = {};
function sfx(name, minGapMs = 0, gain = 1) {
    const st = Settings.get();
    if (st.mute || st.sfx <= 0) return;
    const now = performance.now();
    if (minGapMs && lastSfx[name] && now - lastSfx[name] < minGapMs) return;
    lastSfx[name] = now;
    try {
        if (window.javaBridge && window.javaBridge.playSfx) window.javaBridge.playSfx(name, st.sfx * gain);
    } catch (e) { /* ses köprüsü hazır değilse sessizce yok say */ }
}

// patron ayaktayken yükselen gerilim: kalp atışı
let heartTimer = 0;
function tensionTick(dt) {
    let boss = null;
    for (const e of world.enemies) {
        if (e.type === 'boss' && e.health > 0 && (!boss || e.progress > boss.progress)) boss = e;
    }
    if (!boss) { heartTimer = 0.6; return; }
    heartTimer -= dt;
    if (heartTimer <= 0) {
        sfx('heartbeat', 0, boss.mini ? 0.7 : 1);
        heartTimer = 1.3 - 0.65 * Math.min(1, boss.progress);
    }
    fx.tension = Math.max(fx.tension || 0, 0.25 + 0.5 * boss.progress);
}

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
        case 'hazardWarn':
            if (d.type === 'eruption') {
                sfx('rumble');
                d.points.forEach(p => fx.warns.push({ x: p.x, y: p.y, r: p.r, life: d.time, max: d.time }));
                addLog('Yanardağ homurdanıyor! Lav patlaması geliyor.');
                fx.alert = { text: 'LAV PATLAMASI', life: 1.8, max: 1.8 };
            } else if (d.type === 'blizzard') {
                sfx('wind');
                addLog('Kar fırtınası yaklaşıyor!');
            }
            break;
        case 'hazardStart':
            addLog(`Kar fırtınası başladı: kule menzilleri kısaldı (${d.time} sn).`);
            break;
        case 'hazardEnd':
            addLog('Kar fırtınası dindi, menziller geri geldi.');
            break;
        case 'eruption': {
            sfx('eruption');
            fx.shake = Math.max(fx.shake || 0, 0.9);
            fx.rings.push({ x: d.x, y: d.y, r: 10, max: d.r * 1.25, life: 0.7, maxLife: 0.7, color: '255,120,30', fill: true });
            fx.rings.push({ x: d.x, y: d.y, r: 10, max: d.r * 0.8, life: 0.45, maxLife: 0.45, color: '255,220,120', fill: true });
            for (let i = 0; i < 40; i++) {
                const a = Math.random() * 6.2832;
                const sp = 80 + Math.random() * 260;
                fx.sparks.push({ x: d.x, y: d.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 60, life: 0.7 + Math.random() * 0.8, max: 1.5, r: 2 + Math.random() * 3.5, c: Math.random() < 0.5 ? '255,160,40' : '255,90,30' });
            }
            break;
        }
        case 'towerStun':
            addLog(`${label(d.tower)} aşırı ısındı, ${d.time} sn ateş edemez.`);
            break;
        case 'guardianWarn': {
            const gi = nearestGuardian(d.x, d.y);
            if (gi >= 0) fx.guardGlow[gi] = 1.2;
            break;
        }
        case 'guardianPulse':
            sfx('gong');
            fx.shake = Math.max(fx.shake || 0, d.hits ? 0.35 : 0.15);
            fx.rings.push({ x: d.x, y: d.y, r: 20, max: d.r, life: 0.9, maxLife: 0.9, color: '120,255,230', fill: true });
            if (d.hits) addLog(`Koruyucu baş vurdu: ${d.hits} düşman hasar aldı ve sersemledi.`);
            break;
        case 'treasureOpen':
            sfx('upgrade', 0, 0.6);
            fx.rings.push({ x: d.x, y: d.y, r: 10, max: 70, life: 0.6, maxLife: 0.6, color: '255,215,80' });
            addLog('Batık sandık parlıyor! Tıklayıp altını topla.');
            break;
        case 'treasureTaken':
            sfx('sell');
            addFloater({ x: d.x, y: d.y - 30, text: '+' + d.reward, color: '#ffd84a', life: 1.4, maxLife: 1.4, big: true, important: true });
            addLog(`Hazine toplandı: +${d.reward} Enerji.`);
            break;
        case 'build':
            sfx('build');
            addLog(`Kullanıcı, (${Math.floor(d.tower.x)}, ${Math.floor(d.tower.y)}) konumuna '${d.tower.name}-ID${pad3(d.tower.id)}' inşa etti. Kalan Enerji: ${world.money}.`);
            fx.rings.push({ x: d.tower.x, y: d.tower.y, r: 20, max: 70, life: 0.5, maxLife: 0.5, color: '120,255,200' });
            break;
        case 'upgrade':
            sfx('upgrade');
            addLog(`'${d.tower.name}-ID${pad3(d.tower.id)}' Seviye ${d.tower.level}'e yükseltildi. Kalan Enerji: ${world.money}.`);
            fx.rings.push({ x: d.tower.x, y: d.tower.y, r: 25, max: 90, life: 0.6, maxLife: 0.6, color: '255,220,90' });
            break;
        case 'sell':
            sfx('sell');
            addLog(`'${d.tower.name}-ID${pad3(d.tower.id)}' satıldı. +${d.refund} Enerji. Kalan Enerji: ${world.money}.`);
            break;
        case 'waveStart': {
            const info = Object.entries(d.counts).map(([t, c]) => `${typeName(t)}: ${c}`).join(', ');
            addLog(`=== DALGA ${d.wave} BAŞLADI === (${info}, Toplam: ${d.total})`);
            sfx('wave_start');
            break;
        }
        case 'spawn':
            addLog(`${d.enemy.name} haritaya girdi.`);
            if (d.enemy.type === 'boss') {
                sfx(d.enemy.mini ? 'boss_warn_mini' : 'boss_warn');
                fx.alert = { text: d.enemy.mini ? 'ARA PATRON GELİYOR' : 'PATRON GELİYOR', life: d.enemy.mini ? 2.6 : 4.2, max: d.enemy.mini ? 2.6 : 4.2 };
                fx.tension = 1;
            }
            break;
        case 'fire':
            sfx('fire_' + d.tower.type, d.tower.type === 'octopus' ? 40 : 55);
            break;
        case 'aoe':
            fx.rings.push({ x: d.x, y: d.y, r: 10, max: d.radius * 1.15, life: 0.45, maxLife: 0.45, color: '255,230,80', aoeImg: true });
            break;
        case 'splash':
            sfx('splash', 50);
            fx.rings.push({ x: d.x, y: d.y, r: 8, max: d.radius, life: 0.5, maxLife: 0.5, color: '255,150,60', fill: true });
            spawnBubbles(d.x, d.y, 6);
            break;
        case 'brood':
            sfx('roar');
            fx.shake = Math.max(fx.shake || 0, 0.5);
            addLog(`${label(d.enemy)} yavrularını saçtı! (+${d.count} yavru köpek balığı)`);
            fx.rings.push({ x: d.enemy.x, y: d.enemy.y, r: 20, max: 110, life: 0.7, maxLife: 0.7, color: '255,120,120' });
            break;
        case 'hit': {
            sfx('hit', 38);
            const slowText = d.slowed ? `, Yavaşlatma %${Math.round(d.tower.slow * 100)} (${d.tower.slowTime} sn) uygulandı` : '';
            addLog(`${d.tower.type === 'eel' ? 'Şok alanı' : d.tower.type === 'puffer' ? 'Patlama' : 'Mermi'} isabet: ${label(d.enemy)} Net Hasar: ${d.dmg.toFixed(1)}${slowText}. Kalan Can: ${d.enemy.health.toFixed(0)}/${d.enemy.maxHealth}`);
            break;
        }
        case 'kill':
            addLog(`${label(d.enemy)} öldü. Ödül +${d.reward}. Toplam Enerji: ${world.money}.`);
            if (d.enemy.type === 'boss' && !d.enemy.mini) {
                sfx('boss_kill');
                fx.shake = 1;
                fx.tension = 0;
            } else {
                sfx('kill', 40);
            }
            spawnBubbles(d.enemy.x, d.enemy.y, d.enemy.type === 'boss' ? 26 : 8);
            addFloater({ x: d.enemy.x, y: d.enemy.y - 30, text: '+' + d.reward, color: '#ffd84a', life: 1.0, maxLife: 1.0 });
            break;
        case 'leak':
            addLog(`${label(d.enemy)} üsse ulaştı. Oyuncu Canı: ${Math.max(0, Math.round(world.health))} (-${d.enemy.damage}).`);
            sfx('leak', 140);
            fx.flash = 1;
            addFloater({ x: d.enemy.x, y: d.enemy.y - 20, text: '-' + d.enemy.damage, color: '#ff5a64', life: 1.2, maxLife: 1.2 });
            break;
        case 'waveClear':
            addLog(`Dalga temizlendi! Dalga bonusu: +${d.bonus} Enerji. Toplam Enerji: ${world.money}.`);
            sfx('wave_clear');
            addFloater({ x: W / 2, y: 120, text: `Dalga temizlendi  +${d.bonus}`, color: '#7dffb0', life: 2.0, maxLife: 2.0, big: true });
            break;
        case 'end':
            sfx(d.won ? 'win' : 'lose');
            endDelay = 0.9;
            break;
    }
}

function addFloater(f) {
    if (Settings.get().floaters || f.important) fx.floaters.push(f);
}

function nearestGuardian(x, y) {
    const list = currentMap.guardians || [];
    let best = -1;
    let bd = 1e9;
    list.forEach((g, i) => {
        const dd = Math.hypot(g.x - x, g.y - y);
        if (dd < bd) { bd = dd; best = i; }
    });
    return best;
}

// yavaşlatma (tangle) bölgelerinin yol üzerindeki çizgileri
function buildZoneBands() {
    zoneBands = [];
    (currentMap.mechanics || []).forEach(m => {
        if (m.type !== 'tangle') return;
        m.zones.forEach(z => {
            world.paths.forEach((path, lane) => {
                if (z.lane != null && z.lane !== lane) return;
                const pts = [];
                for (let d = z.from * path.length; d <= z.to * path.length; d += 10) pts.push(Core.pointAt(path, d));
                if (pts.length > 1) zoneBands.push({ pts, color: m.color || '40,120,50' });
            });
        });
    });
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
    const out = { motes: [], rays: [], bubbles: [] };
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

function selectMap(mapIndex) {
    currentMapIndex = mapIndex;
    currentMap = MAPS[mapIndex];
    W = (currentMap.size && currentMap.size.w) || 1350;
    H = (currentMap.size && currentMap.size.h) || 900;
    loadSprites(currentMap);
    document.getElementById('canvasBackdrop').style.backgroundImage =
        `linear-gradient(rgba(0,6,16,0.55), rgba(0,6,16,0.55)), url('${currentMap.thumb || currentMap.bg}')`;

    ['menuScreen', 'mapSelectScreen', 'winScreen', 'loseScreen', 'towerModal'].forEach(id =>
        document.getElementById(id).classList.add('hidden'));
    document.getElementById('gameScreen').classList.remove('hidden');

    logs = [];
    world = new Core.World(currentMap, { difficulty, seed: Date.now() & 0x7fffffff, onEvent: onWorldEvent });
    ambient = buildAmbient(currentMap);
    fx = { floaters: [], rings: [], bubbles: [], flash: 0, tension: 0, shake: 0, alert: null, warns: [], sparks: [], guardGlow: [] };
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
    buildZoneBands();
    canvas.style.transform = '';
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
    const rule = currentMap.rule ? `<div class="banner-rule">${currentMap.rule}</div>` : '';
    b.innerHTML = `<div class="banner-name">${currentMap.name}</div><div class="banner-sub">${world.totalWaves} dalga · ${Core.DIFFICULTY[difficulty].label}</div>${rule}`;
    document.getElementById('ruleLine').innerText = currentMap.rule || '';
    b.classList.remove('show');
    void b.offsetWidth;
    b.classList.add('show');
}

function fitCanvas() {
    const box = document.getElementById('canvasContainer');
    const cw = box.clientWidth || W;
    const ch = box.clientHeight || H;
    const scale = Math.min(cw / W, ch / H);
    // WebKit tuvali 2048 pikselin üstünde sorun çıkarabiliyor
    const maxRes = Math.min(2048 / W, 2048 / H);
    const q = { high: 1, medium: 0.75, low: 0.5 }[Settings.get().quality] || 1;
    res = Math.max(0.5, Math.min(maxRes, scale * (window.devicePixelRatio || 1) * q));
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
        tensionTick(dt);
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
    fx.warns.forEach(w => { w.life -= dt; });
    fx.warns = fx.warns.filter(w => w.life > 0);
    fx.sparks.forEach(p => { p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 260 * dt; p.vx *= 0.985; });
    fx.sparks = fx.sparks.filter(p => p.life > 0);
    for (let i = 0; i < fx.guardGlow.length; i++) fx.guardGlow[i] = Math.max(0, (fx.guardGlow[i] || 0) - dt * 1.1);
    fx.flash = Math.max(0, fx.flash - dt * 2.5);
    fx.tension = Math.max(0, (fx.tension || 0) - dt * 0.35);
    if (fx.alert) { fx.alert.life -= dt; if (fx.alert.life <= 0) fx.alert = null; }
    // ekran sarsıntısı: filtre değil, basit bir kaydırma
    fx.shake = Math.max(0, (fx.shake || 0) - dt * 1.6);
    const amp = fx.shake > 0 ? fx.shake * 9 : 0;
    canvas.style.transform = amp > 0.2 ? `translate(${((Math.random() - 0.5) * amp).toFixed(1)}px, ${((Math.random() - 0.5) * amp).toFixed(1)}px)` : '';
}

// ------------------------------------------------------------------ çizim

function draw() {
    ctx.setTransform(res, 0, 0, res, 0, 0);
    if (ready(sprites.bg)) {
        drawBackground();
    } else {
        ctx.fillStyle = '#001d3d';
        ctx.fillRect(0, 0, W, H);
    }

    const fancy = Settings.get().effects;
    if (fancy) drawAmbientBack();
    drawPath();
    drawZones();
    drawSpots();
    drawEntities();
    drawMechanics();
    if (fancy) drawAmbientFront();
    drawFx();
    drawHud();

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

// Büyük arka plan her karede küçültülmesin: tuval boyutunda bir kez çizilir, sonra birebir kopyalanır
let bgCache = null;
let bgCacheKey = '';
function drawBackground() {
    const key = `${sprites.bg.src}|${canvas.width}x${canvas.height}`;
    if (!bgCache || bgCacheKey !== key) {
        bgCache = document.createElement('canvas');
        bgCache.width = canvas.width;
        bgCache.height = canvas.height;
        bgCache.getContext('2d').drawImage(sprites.bg, 0, 0, bgCache.width, bgCache.height);
        bgCacheKey = key;
    }
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(bgCache, 0, 0);
    ctx.restore();
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

function drawAmbientFront() {
    const a = currentMap.ambient;
    if (!a) return;

    const down = a.moteDir === 'down';   // kar taneleri aşağı, kıvılcımlar yukarı
    ambient.motes.forEach(m => {
        m.y += (down ? 1 : -1) * m.sp * 0.016;
        m.x += Math.sin(animTime * 0.6 + m.ph) * (down ? 0.3 : 0.12);
        if (m.y < -4) { m.y = H + 4; m.x = Math.random() * W; }
        if (m.y > H + 4) { m.y = -4; m.x = Math.random() * W; }
        const tw = down ? 0.7 : 0.35 + 0.35 * Math.sin(animTime * 1.7 + m.ph);
        ctx.fillStyle = `rgba(${a.moteColor || '220,255,255'},${tw})`;
        ctx.beginPath();
        ctx.arc(m.x, m.y, m.r * (a.moteSize || 1), 0, 6.2832);
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
    // yalnızca 'rail' stili yol çizer; diğer haritalarda yol arka plana işlidir
    if (currentMap.pathStyle === 'rail') {
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
    }
}

// ------------------------------------------------------------------ haritaya özel kurallar

function drawZones() {
    if (!zoneBands.length) return;
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    zoneBands.forEach(b => {
        ctx.beginPath();
        ctx.moveTo(b.pts[0].x, b.pts[0].y);
        for (let i = 1; i < b.pts.length; i++) ctx.lineTo(b.pts[i].x, b.pts[i].y);
        ctx.strokeStyle = `rgba(${b.color},0.30)`;
        ctx.lineWidth = 78;
        ctx.stroke();
        ctx.setLineDash([3, 13]);
        ctx.lineDashOffset = -animTime * 12;
        ctx.strokeStyle = `rgba(${b.color},0.75)`;
        ctx.lineWidth = 5;
        ctx.stroke();
        ctx.setLineDash([]);
    });
    ctx.restore();
}

function drawMechanics() {
    const mech = currentMap.mechanics || [];

    // Atlantis koruyucuları: gözleri ve halesi
    (currentMap.guardians || []).forEach((g, i) => {
        const glow = fx.guardGlow[i] || 0;
        const pulse = 0.5 + 0.5 * Math.sin(animTime * 2 + i);
        const a = 0.18 + 0.12 * pulse + 0.6 * Math.min(1, glow);
        const grad = ctx.createRadialGradient(g.x, g.y, 4, g.x, g.y, 70);
        grad.addColorStop(0, `rgba(120,255,235,${a})`);
        grad.addColorStop(1, 'rgba(120,255,235,0)');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(g.x, g.y, 70, 0, 6.2832);
        ctx.fill();
        ctx.fillStyle = `rgba(170,255,245,${0.55 + 0.45 * Math.min(1, glow + pulse * 0.4)})`;
        [-14, 14].forEach(dx => {
            ctx.beginPath();
            ctx.ellipse(g.x + dx, g.y - 5, 6, 3.5, 0, 0, 6.2832);
            ctx.fill();
        });
    });

    // lav patlaması uyarıları
    fx.warns.forEach(w => {
        const k = 1 - w.life / w.max;
        const pulse = 0.5 + 0.5 * Math.sin(animTime * 14);
        ctx.fillStyle = `rgba(255,80,20,${0.14 + 0.16 * k + 0.08 * pulse})`;
        ctx.beginPath();
        ctx.arc(w.x, w.y, w.r, 0, 6.2832);
        ctx.fill();
        ctx.strokeStyle = `rgba(255,${Math.round(120 + 100 * pulse)},60,0.95)`;
        ctx.lineWidth = 3;
        ctx.setLineDash([10, 8]);
        ctx.lineDashOffset = -animTime * 40;
        ctx.beginPath();
        ctx.arc(w.x, w.y, w.r, 0, 6.2832);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.strokeStyle = 'rgba(255,230,160,0.85)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(w.x, w.y, w.r * (1 - k), 0, 6.2832);
        ctx.stroke();
    });

    // batık hazine
    const tr = world.treasure;
    if (tr) {
        const pulse = 1 + 0.12 * Math.sin(animTime * 7);
        const grad = ctx.createRadialGradient(tr.x, tr.y, 6, tr.x, tr.y, 80 * pulse);
        grad.addColorStop(0, 'rgba(255,225,110,0.75)');
        grad.addColorStop(1, 'rgba(255,200,60,0)');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(tr.x, tr.y, 80 * pulse, 0, 6.2832);
        ctx.fill();
        ctx.fillStyle = 'rgba(255,214,70,0.92)';
        ctx.strokeStyle = 'rgba(120,70,0,0.95)';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(tr.x, tr.y, 30 * pulse, 0, 6.2832);
        ctx.fill();
        ctx.stroke();
        ctx.strokeStyle = 'rgba(255,250,200,0.95)';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(tr.x, tr.y, 42, -Math.PI / 2, -Math.PI / 2 + 6.2832 * (tr.life / tr.max));
        ctx.stroke();
        for (let i = 0; i < 5; i++) {
            const a = animTime * 2 + i * 1.2566;
            const rr = 52 + 6 * Math.sin(animTime * 5 + i);
            ctx.fillStyle = 'rgba(255,250,210,0.9)';
            ctx.beginPath();
            ctx.arc(tr.x + Math.cos(a) * rr, tr.y + Math.sin(a) * rr, 2.5, 0, 6.2832);
            ctx.fill();
        }
        ctx.textAlign = 'center';
        ctx.font = 'bold 20px sans-serif';
        ctx.lineWidth = 4;
        ctx.strokeStyle = 'rgba(0,0,0,0.8)';
        ctx.strokeText(`TIKLA  +${tr.reward}`, tr.x, tr.y - 62);
        ctx.fillStyle = '#ffe58a';
        ctx.fillText(`TIKLA  +${tr.reward}`, tr.x, tr.y - 62);
        ctx.textAlign = 'left';
    }

    // karanlık: Fener Balığı ışığının dışı kararır
    if (mech.some(m => m.type === 'darkness')) {
        const lights = world.towers.filter(t => t.support);
        ctx.save();
        ctx.beginPath();
        ctx.rect(0, 0, W, H);
        lights.forEach(t => {
            const lr = world.lightRadius(t);
            ctx.moveTo(t.x + lr, t.y);
            ctx.arc(t.x, t.y, lr, 0, 6.2832, true);
        });
        ctx.clip('evenodd');
        ctx.fillStyle = 'rgba(1,4,14,0.40)';
        ctx.fillRect(0, 0, W, H);
        ctx.restore();
        lights.forEach(t => {
            const lr = world.lightRadius(t);
            const g = ctx.createRadialGradient(t.x, t.y, lr * 0.3, t.x, t.y, lr);
            g.addColorStop(0, 'rgba(255,240,170,0)');
            g.addColorStop(1, 'rgba(255,235,150,0.14)');
            ctx.fillStyle = g;
            ctx.beginPath();
            ctx.arc(t.x, t.y, lr, 0, 6.2832);
            ctx.fill();
            ctx.strokeStyle = 'rgba(255,236,150,0.40)';
            ctx.lineWidth = 2;
            ctx.setLineDash([8, 10]);
            ctx.lineDashOffset = -animTime * 12;
            ctx.beginPath();
            ctx.arc(t.x, t.y, lr, 0, 6.2832);
            ctx.stroke();
            ctx.setLineDash([]);
        });
    }

    // kar fırtınası
    if (world.stormActive) {
        ctx.fillStyle = 'rgba(205,228,248,0.20)';
        ctx.fillRect(0, 0, W, H);
        ctx.strokeStyle = 'rgba(255,255,255,0.75)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        for (let i = 0; i < 90; i++) {
            const x = W + 60 - ((i * 97 + animTime * 520) % (W + 160));
            const y = ((i * 53 + animTime * 300 + i * i * 7) % (H + 80)) - 40;
            ctx.moveTo(x, y);
            ctx.lineTo(x + 30, y - 9);
        }
        ctx.stroke();
    }
}

// ekranın üstünde kısa durum şeridi (kar fırtınası)
function drawHud() {
    const b = world.mech && world.mech.find(m => m.cfg.type === 'blizzard');
    if (!b || (b.phase !== 'warn' && b.phase !== 'storm')) return;
    const txt = b.phase === 'warn'
        ? `Kar fırtınası yaklaşıyor... ${Math.ceil(b.t)}`
        : `KAR FIRTINASI · kule menzili -%${Math.round((1 - b.cfg.rangeMul) * 100)} · ${Math.ceil(b.t)} sn`;
    ctx.save();
    ctx.font = 'bold 24px sans-serif';
    const w = ctx.measureText(txt).width + 44;
    ctx.fillStyle = b.phase === 'warn' ? 'rgba(20,50,90,0.78)' : 'rgba(40,90,150,0.85)';
    ctx.fillRect(W / 2 - w / 2, 14, w, 42);
    ctx.strokeStyle = 'rgba(190,225,255,0.9)';
    ctx.lineWidth = 2;
    ctx.strokeRect(W / 2 - w / 2, 14, w, 42);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#eaf6ff';
    ctx.fillText(txt, W / 2, 44);
    ctx.restore();
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

    const img = enemySprite(e);
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
    if (e.zoneMul < 0.95) {
        ctx.strokeStyle = 'rgba(120,200,90,0.85)';
        ctx.lineWidth = 3;
        ctx.setLineDash([5, 5]);
        ctx.beginPath();
        ctx.arc(e.x, e.y + bob, size * 0.5, 0, 6.2832);
        ctx.stroke();
        ctx.setLineDash([]);
    }
    if (e.stunTime > 0) {
        ctx.strokeStyle = 'rgba(120,255,235,0.95)';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(e.x, e.y - size * 0.62, 12, animTime * 6, animTime * 6 + 4.2);
        ctx.stroke();
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
    if (t.auraDmg > 0) {
        // destek kulesinden güç alıyor
        const pulse = 0.5 + 0.5 * Math.sin(animTime * 3 + t.id);
        ctx.strokeStyle = `rgba(255,236,130,${0.45 + pulse * 0.3})`;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.ellipse(t.x, t.y + 38, 40, 13, 0, 0, 6.2832);
        ctx.stroke();
    }
    drawShadow(t.x, t.y + 38, 36, 11, 0.28);

    if (selected || hoverTowerId === t.id) {
        ctx.beginPath();
        const sup = t.support;
        ctx.strokeStyle = sup ? (selected ? 'rgba(255,230,120,0.8)' : 'rgba(255,230,120,0.45)') : (selected ? 'rgba(255,255,255,0.55)' : 'rgba(255,255,255,0.28)');
        ctx.fillStyle = sup ? 'rgba(255,230,120,0.07)' : (selected ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.03)');
        ctx.lineWidth = 2;
        ctx.arc(t.x, t.y, t.range, 0, 6.2832);
        ctx.fill();
        ctx.stroke();
    }

    if (t.type === 'swordfish') {
        drawSwordfish(t, idle, since);
    } else {
        const img = sprites.towers[t.type];
        const s = 100 * recoil;
        if (ready(img)) ctx.drawImage(img, t.x - s / 2, t.y - s / 2 + idle, s, s);
        else {
            ctx.fillStyle = 'blue';
            ctx.fillRect(t.x - 25, t.y - 25, 50, 50);
        }
    }

    if (t.stun > 0) {
        ctx.fillStyle = 'rgba(30,6,0,0.40)';
        ctx.beginPath();
        ctx.arc(t.x, t.y, 46, 0, 6.2832);
        ctx.fill();
        for (let i = 0; i < 5; i++) {
            const a = animTime * 5 + i * 1.2566;
            ctx.fillStyle = 'rgba(255,150,50,0.95)';
            ctx.beginPath();
            ctx.arc(t.x + Math.cos(a) * 36, t.y + Math.sin(a) * 36, 3.2, 0, 6.2832);
            ctx.fill();
        }
    }

    const n = Core.MAX_LEVEL;
    for (let i = 0; i < n; i++) {
        ctx.fillStyle = i < t.level ? '#ffcc00' : 'rgba(0,0,0,0.45)';
        ctx.strokeStyle = 'rgba(0,0,0,0.7)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(t.x + (i - (n - 1) / 2) * 10.5, t.y + 58, 3.7, 0, 6.2832);
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

// Kılıç balığı: kaide sabit, balık hedefe doğru yumuşakça döner ve ateş edince geri tepme yapar
function drawSwordfish(t, idle, since) {
    const base = sprites.towers.swordfish_base;
    const fish = sprites.towers.swordfish_fish;
    if (!ready(base) || !ready(fish)) {
        const icon = sprites.towers.swordfish;
        if (ready(icon)) ctx.drawImage(icon, t.x - 50, t.y - 50 + idle, 100, 100);
        return;
    }
    ctx.drawImage(base, t.x - 50, t.y - 50, 100, 100);

    const dt = Math.min(0.05, animTime - (t.aimT === undefined ? animTime : t.aimT));
    t.aimT = animTime;
    if (t.aim === undefined) t.aim = -0.8;
    let goal = t.aim;
    if (t.target && t.target.health > 0) goal = Math.atan2(t.target.y - t.y, t.target.x - t.x);
    let diff = Math.atan2(Math.sin(goal - t.aim), Math.cos(goal - t.aim));
    t.aim += diff * Math.min(1, dt * 12);

    const recoil = since < 0.2 ? Math.sin((since / 0.2) * Math.PI) * 7 : 0;      // geriye doğru çekilir
    const px = t.x + 4 - Math.cos(t.aim) * recoil;
    const py = t.y + 10 + idle * 0.6 - Math.sin(t.aim) * recoil;
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(t.aim);
    if (Math.cos(t.aim) < 0) ctx.scale(1, -1);     // sola bakarken baş aşağı dönmesin
    ctx.drawImage(fish, -60, -60, 120, 120);
    ctx.restore();

    // ateş anında kılıç ucunda parlama
    if (since < 0.12) {
        const tx = px + Math.cos(t.aim) * 52;
        const ty = py + Math.sin(t.aim) * 52;
        const a = 1 - since / 0.12;
        const g = ctx.createRadialGradient(tx, ty, 2, tx, ty, 26);
        g.addColorStop(0, `rgba(235,252,255,${0.95 * a})`);
        g.addColorStop(1, 'rgba(180,235,255,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(tx, ty, 26, 0, 6.2832);
        ctx.fill();
    }
}

function drawProjectile(p) {
    const img = sprites.projectiles[p.type];
    if (p.lob) {
        // havan: yay çizerek uçar, yere yaklaştıkça küçülür
        const f = p.flight;
        const lift = Math.sin(Math.PI * f) * 70;
        drawShadow(p.x, p.y + 4, 9, 4, 0.3);
        ctx.save();
        ctx.translate(p.x, p.y - lift);
        ctx.rotate(animTime * 6);
        const sz = 30 + Math.sin(Math.PI * f) * 8;
        if (ready(img)) ctx.drawImage(img, -sz / 2, -sz / 2, sz, sz);
        else {
            ctx.fillStyle = '#f5a742';
            ctx.beginPath();
            ctx.arc(0, 0, 10, 0, 6.2832);
            ctx.fill();
        }
        ctx.restore();
        return;
    }
    if (p.type === 'swordfish') {
        // keskin nişancı: hızlı, uzun bir ışık oku
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.angle);
        const g = ctx.createLinearGradient(-46, 0, 10, 0);
        g.addColorStop(0, 'rgba(180,240,255,0)');
        g.addColorStop(1, 'rgba(230,252,255,0.95)');
        ctx.fillStyle = g;
        ctx.fillRect(-46, -2.5, 56, 5);
        if (ready(img)) ctx.drawImage(img, -22, -22, 56, 56);
        ctx.restore();
        return;
    }
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
    fx.sparks.forEach(p => {
        ctx.globalAlpha = Math.max(0, p.life / p.max);
        ctx.fillStyle = `rgb(${p.c})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, 6.2832);
        ctx.fill();
    });
    ctx.globalAlpha = 1;
    fx.rings.forEach(r => {
        const k = 1 - r.life / r.maxLife;
        const radius = r.r + (r.max - r.r) * k;
        ctx.globalAlpha = 1 - k;
        if (r.aoeImg && ready(sprites.projectiles.eel)) {
            ctx.drawImage(sprites.projectiles.eel, r.x - radius, r.y - radius, radius * 2, radius * 2);
        }
        if (r.fill) {
            ctx.fillStyle = `rgba(${r.color},0.22)`;
            ctx.beginPath();
            ctx.arc(r.x, r.y, radius, 0, 6.2832);
            ctx.fill();
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

    // patron gerilimi: kenarlar kalp atışıyla birlikte kararıp kızarır
    if (fx.tension > 0.02) {
        const beat = 0.65 + 0.35 * Math.max(0, Math.sin(animTime * (4.2 + 4 * fx.tension)));
        const g = ctx.createRadialGradient(W / 2, H / 2, H * 0.30, W / 2, H / 2, H * 0.95);
        g.addColorStop(0, 'rgba(40,0,8,0)');
        g.addColorStop(1, `rgba(60,0,10,${Math.min(0.55, fx.tension * 0.55) * beat})`);
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, W, H);
    }
    if (fx.alert) {
        const k = fx.alert.life / fx.alert.max;
        const fade = Math.min(1, k * 4, (1 - k) * 8);
        const pulse = 0.75 + 0.25 * Math.sin(animTime * 12);
        ctx.save();
        ctx.globalAlpha = Math.max(0, fade);
        ctx.fillStyle = 'rgba(30,0,6,0.55)';
        ctx.fillRect(0, H * 0.36, W, 96);
        ctx.textAlign = 'center';
        ctx.font = 'bold 54px sans-serif';
        ctx.lineWidth = 7;
        ctx.strokeStyle = 'rgba(0,0,0,0.85)';
        ctx.strokeText('⚠ ' + fx.alert.text + ' ⚠', W / 2, H * 0.36 + 66);
        ctx.fillStyle = `rgba(255,${Math.round(70 + 40 * pulse)},60,1)`;
        ctx.fillText('⚠ ' + fx.alert.text + ' ⚠', W / 2, H * 0.36 + 66);
        ctx.restore();
    }
}

// ------------------------------------------------------------------ kule market ve giriş

function renderTowerMarket() {
    const container = document.getElementById('towerMarketContainer');
    container.innerHTML = '';
    towerOrder().forEach((type, idx) => {
        const btn = document.createElement('div');
        btn.className = 'tower-button';
        btn.setAttribute('draggable', 'true');
        btn.setAttribute('data-tower', type);
        const def = Core.TOWER_TYPES[type];
        const name = (currentMap.towerNames && currentMap.towerNames[type]) || def.name;
        btn.innerHTML = `
            <div class="tower-icon-box"><img src="${SPRITE_FILES.towers[type]}" alt="${name}"></div>
            <div class="tower-info"><strong>${name} <span class="hotkey">${idx + 1}</span></strong>
                <div class="tower-cost"><span class="cost-val"></span> Enerji</div>
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
        btn.addEventListener('mouseenter', () => { document.getElementById('towerHint').innerText = `${name}: ${def.role}`; });
        btn.addEventListener('mouseleave', () => { document.getElementById('towerHint').innerText = 'Bir kulenin üzerine gel'; });
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
        addFloater({ x: spot.x, y: spot.y - 40, text: `${cost} Enerji gerek`, color: '#ff8a8a', life: 1.2, maxLife: 1.2, important: true });
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
    const overTreasure = world.treasure && Math.hypot(p.x - world.treasure.x, p.y - world.treasure.y) < 56;
    canvas.style.cursor = overTreasure ? 'pointer' : armedType ? (hoverSpot ? 'copy' : 'not-allowed') : (t ? 'pointer' : 'default');
});
canvas.addEventListener('mouseleave', () => { hoverSpot = null; hoverTowerId = null; });
canvas.addEventListener('click', (e) => {
    if (!world || world.result) return;
    const p = toLogical(e);
    if (world.treasure && Math.hypot(p.x - world.treasure.x, p.y - world.treasure.y) < 56) {
        world.collectTreasure();
        return;
    }
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
    if (!document.getElementById('settingsScreen').classList.contains('hidden')) {
        if (e.key === 'Escape') closeSettings();
        return;
    }
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
    else if (k >= '1' && k <= '9' && towerOrder()[+k - 1]) armTower(towerOrder()[+k - 1]);
});

// ------------------------------------------------------------------ kule penceresi

function statLine(t) {
    if (t.support) {
        return `Etki alanı: ${t.range}   Hasar: +%${Math.round(t.supDmg * 100)}   Atış hızı: +%${Math.round(t.supRate * 100)}`;
    }
    let line = `Hasar: ${t.dmg}   Menzil: ${t.range}   Atış Aralığı: ${t.rate.toFixed(2)} sn`;
    if (t.aoe) line += `   Alan: ${t.aoe}`;
    if (t.auraDmg > 0) line += `\nDestek bonusu: hasar +%${Math.round(t.auraDmg * 100)} · hız +%${Math.round(t.auraRate * 100)}`;
    return line;
}

function openTowerModal(tower) {
    selectedTower = tower;
    document.getElementById('towerModalName').innerText = `${tower.name} (Seviye ${tower.level}/${Core.MAX_LEVEL})`;

    let stats = statLine(tower);
    if (tower.level < Core.MAX_LEVEL) {
        const next = Object.assign(Object.create(Core.Tower.prototype), tower, { level: tower.level + 1 });
        next.derive();
        stats += tower.support
            ? `\nSonraki: Hasar +%${Math.round(next.supDmg * 100)} · Hız +%${Math.round(next.supRate * 100)} · Alan ${next.range}`
            : `\nSonraki: Hasar ${next.dmg} · Menzil ${next.range} · ${next.rate.toFixed(2)} sn`;
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
    setText('waveValue', world.endless ? `${world.wave} (sonsuz)` : `${world.wave}/${world.totalWaves}`);
    const bar = document.getElementById('healthBar');
    const pct = Math.round(100 * hp / world.maxHealth);
    if (uiCache.hpPct !== pct) {
        uiCache.hpPct = pct;
        bar.style.width = pct + '%';
        bar.style.background = pct > 50 ? '#3ddc6b' : pct > 25 ? '#f2c230' : '#ef4b4b';
    }

    const btn = document.getElementById('waveButton');
    const can = world.canStartWave();
    const text = world.wave >= world.totalWaves && !world.endless ? 'SON DALGA GELDİ' : `DALGA ${world.wave + 1} BAŞLAT`;
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
        const img = SPRITE_FILES.enemies[enemyKey(type, currentMap.boss)];
        const name = typeName(type);
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
    const records = Settings.records();
    const pills = document.getElementById('difficultyPills');
    pills.innerHTML = '';
    Object.entries(Core.DIFFICULTY).forEach(([key, d]) => {
        const b = document.createElement('button');
        b.className = 'pill' + (key === difficulty ? ' active' : '');
        b.innerText = d.label;
        b.onclick = () => {
            difficulty = key;
            Settings.setDifficulty(key);
            renderMapSelectScreen();
        };
        pills.appendChild(b);
    });
    document.getElementById('difficultyInfo').innerText = Core.describeDifficulty(Core.DIFFICULTY[difficulty]);

    const grid = document.getElementById('mapGrid');
    grid.innerHTML = '';
    MAPS.forEach((m, i) => {
        const rec = records[recordKey(m)];
        const earned = rec ? '★'.repeat(rec.stars) + '☆'.repeat(3 - rec.stars) : '☆☆☆';
        const card = document.createElement('button');
        card.className = 'map-card';
        card.style.backgroundImage = `url('${m.thumb || m.bg}')`;
        card.innerHTML = `
            <div class="map-card-shade"></div>
            <div class="map-card-earned ${rec ? 'done' : ''}">${earned}</div>
            <div class="map-card-text">
                <div class="map-card-name">${m.name}</div>
                <div class="map-card-desc">${m.desc}</div>
                <div class="map-card-meta">${(records[m.id + ':endless'] || {}).wave ? 'Sonsuz rekor: ' + records[m.id + ':endless'].wave + ' · ' : ''}Zorluk ${'●'.repeat(m.stars)}${'○'.repeat(5 - m.stars)} · ${Core.totalWavesOf(m)} dalga</div>
            </div>`;
        card.onclick = () => selectMap(i);
        grid.appendChild(card);
    });
}

function startEndless() {
    if (!world || !world.goEndless()) return;
    document.getElementById('winScreen').classList.add('hidden');
    endShown = false;
    endDelay = 0;
    addLog('Sonsuz mod başladı! Düşmanlar güçlenmeye devam edecek, her turda bir patron gelir.');
    uiCache = {};
    updateUI();
}

function showEnd() {
    document.getElementById('towerModal').classList.add('hidden');
    const s = world.stats;
    const statsText = `${s.kills} düşman yok edildi · ${world.towers.length} kule · ${Core.DIFFICULTY[difficulty].label}`;
    if (world.result === 'win') {
        const hp = Math.max(0, Math.ceil(world.health));
        const stars = starsFor(hp, world.maxHealth);
        const key = recordKey(currentMap);
        const old = Settings.records()[key];
        if (!old || old.stars < stars) Settings.setRecord(key, { stars, health: hp });
        document.getElementById('finalHealthWin').innerText = hp;
        document.getElementById('finalMoneyWin').innerText = world.money;
        document.getElementById('winStars').innerText = '★'.repeat(stars) + '☆'.repeat(3 - stars);
        document.getElementById('winStats').innerText = statsText;
        document.getElementById('winScreen').classList.remove('hidden');
        addLog(`TEBRİKLER! Oyunu kazandınız! Kalan Can: ${hp}`);
    } else {
        document.getElementById('finalWaveLose').innerText = world.endless ? `${world.wave} (sonsuz mod)` : `${world.wave}/${world.totalWaves}`;
        if (world.endless) {
            const key = currentMap.id + ':endless';
            const best = Settings.records()[key];
            if (!best || best.wave < world.wave) Settings.setRecord(key, { wave: world.wave });
        }
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
