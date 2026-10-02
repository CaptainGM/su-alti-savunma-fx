// Web Audio ses motoru: tarayıcı, PWA ve Android sürümünün sesi.
//
// Masaüstü uygulamasında sesi Java çalar (SoundPlayer); orada bu dosya hiçbir şey yapmaz. Diğer ortamlarda efektler ve
// müzik js/ses_dsp.js ile (Java'nın üretimiyle örnek örnek aynı) bir Worker içinde üretilir, Web Audio ile çalınır:
//   - efektler: üretilir üretilmez AudioBuffer olur, çalınırken kendi kazancıyla karışır (en fazla 28 ses, en eskisi kesilir)
//   - müzik: dokuz katman bir döngüde aynı anda başlar; durum (menu | calm | battle | boss) katman kazançlarını
//     0,7 sn'lik zaman sabitiyle yumuşakça değiştirir (Java MusicEngine ile aynı)
//   - çıkış: toplam yumuşak sınırlayıcıdan geçer (tanh), böylece üst üste binen sesler bozulmaz
//   - pencere arka plana geçince (sekme gizlenince, uygulama duraklayınca) ses kısılır ve bağlam askıya alınır
// Oyun kodu sesi `window.javaBridge` üzerinden ister (playSfx, setMusic, setMusicVolume); platform.js bu çağrıları buraya bağlar.
'use strict';

const GameAudio = (function () {
    const AC = window.AudioContext || window.webkitAudioContext;
    const SUPPORTED = !!AC;
    const RATE = 44100;
    const MAX_VOICES = 28;
    const LAYERS = 9;
    const OUT_GAIN = 32000 / 32768;

    // önce her an gereken sesler üretilsin (kısa olanlar), uzun ve nadir olanlar sonra
    const ORDER = ['click', 'build', 'upgrade', 'sell', 'fire_octopus', 'fire_jellyfish', 'fire_eel', 'fire_swordfish', 'fire_puffer', 'fire_angler',
        'hit', 'kill', 'wave_start', 'leak', 'wave_clear', 'heartbeat', 'zap_small', 'shock', 'heal', 'shield_break', 'vanish', 'splash', 'chomp',
        'boss_warn_mini', 'boss_warn', 'roar', 'boss_kill', 'win', 'lose', 'gong', 'rumble', 'eruption', 'meteor', 'wind'];

    let ctx = null;
    let worker = null;
    let inMix = null;          // sfx + müzik toplanır
    let sfxBus = null;
    let musicBus = null;
    let outGain = null;
    const sfx = {};            // ad -> AudioBuffer
    let sfxTotal = 0;
    const layerData = new Array(LAYERS).fill(null);
    let layerGains = null;
    let musicStarted = false;
    let state = 'off';
    let intensity = 0;
    let musicVol = 0.4;
    let active = true;
    let unlocked = false;
    let suspendTimer = 0;
    let voices = [];
    let onReady = null;
    const info = { sfxDone: false, musicDone: false, error: '', genMs: 0 };

    function curve() {
        const n = 8193;
        const c = new Float32Array(n);
        for (let i = 0; i < n; i++) c[i] = Math.tanh(3 * (2 * i / (n - 1) - 1));
        return c;
    }

    function ensureContext() {
        if (ctx || !SUPPORTED) return ctx;
        try {
            ctx = new AC({ latencyHint: 'interactive' });
        } catch (e) {
            info.error = 'AudioContext açılamadı: ' + e;
            return null;
        }
        inMix = ctx.createGain();
        inMix.gain.value = 1.15 / 3;                 // Java: tanh(1.15 * toplam); eğri girdisi -1..1 arası olduğundan 3'e bölünüp eğride açılır
        const shaper = ctx.createWaveShaper();
        shaper.curve = curve();
        shaper.oversample = '2x';
        outGain = ctx.createGain();
        outGain.gain.value = active ? OUT_GAIN : 0;
        sfxBus = ctx.createGain();
        musicBus = ctx.createGain();
        musicBus.gain.value = musicVol;
        sfxBus.connect(inMix);
        musicBus.connect(inMix);
        inMix.connect(shaper);
        shaper.connect(outGain);
        outGain.connect(ctx.destination);
        ctx.onstatechange = () => { if (ctx.state === 'interrupted' && active) tryResume(); };
        return ctx;
    }

    // ------------------------------------------------------------------ üretim

    function toBuffer(data) {
        const b = ctx.createBuffer(1, data.length, RATE);
        b.copyToChannel(data, 0);
        return b;
    }

    function acceptSfx(name, data) {
        sfx[name] = toBuffer(data);
    }

    function acceptLayer(l, data) {
        layerData[l] = toBuffer(data);
        if (layerData.every(Boolean)) startMusic();
    }

    function startWorker() {
        if (!ensureContext()) return;
        info.t0 = performance.now();
        const names = ORDER;
        sfxTotal = names.length;
        try {
            worker = new Worker('js/ses_isci.js');
        } catch (e) {
            worker = null;
        }
        if (worker) {
            worker.onmessage = e => {
                const m = e.data;
                if (m.type === 'sfx') acceptSfx(m.name, m.data);
                else if (m.type === 'sfxDone') { info.sfxDone = true; worker.postMessage({ cmd: 'music' }); }
                else if (m.type === 'layer') acceptLayer(m.layer, m.data);
                else if (m.type === 'musicDone') { info.musicDone = true; info.genMs = Math.round(performance.now() - info.t0); worker.terminate(); worker = null; if (onReady) onReady(); }
            };
            worker.onerror = e => { info.error = 'ses işçisi hata verdi: ' + (e && e.message); fallbackGenerate(); };
            worker.postMessage({ cmd: 'sfx', names });
        } else {
            fallbackGenerate();
        }
    }

    // Worker açılamazsa (ör. bazı file:// ortamlarında) aynı hesap ana iş parçacığında, parça parça yapılır
    function fallbackGenerate() {
        if (worker) { try { worker.terminate(); } catch (e) { /* yoksay */ } worker = null; }
        const run = () => {
            const D = window.SesDSP;
            const todo = ORDER.filter(n => !sfx[n]);
            const step = () => {
                const n = todo.shift();
                if (n) { acceptSfx(n, D.buildSfx(n)); setTimeout(step, 0); return; }
                info.sfxDone = true;
                let l = 0;
                const nextLayer = () => {
                    if (l >= LAYERS) { info.musicDone = true; if (onReady) onReady(); return; }
                    acceptLayer(l, D.buildMusicLayer(l));
                    l++;
                    setTimeout(nextLayer, 0);
                };
                nextLayer();
            };
            step();
        };
        if (window.SesDSP) { run(); return; }
        const s = document.createElement('script');
        s.src = 'js/ses_dsp.js';
        s.onload = run;
        s.onerror = () => { info.error = 'ses_dsp.js yüklenemedi'; };
        document.head.appendChild(s);
    }

    // ------------------------------------------------------------------ müzik

    function targets() {
        const i = Math.max(0, Math.min(1, intensity));
        switch (state) {
            case 'menu': return [0.90, 0.70, 0, 0, 0, 0, 0, 0, 0];
            case 'calm': return [1.00, 0.60, 0.15, 0, 0, 0, 0, 0, 0];
            case 'battle': return [0.30, 0.06, 0.85, 0.55 + 0.30 * i, 0.55 + 0.35 * i, i > 0.55 ? 0.55 * (i - 0.55) / 0.45 : 0, 0, 0.60 + 0.30 * i, 0.40 + 0.55 * i];
            case 'boss': return [0.35, 0, 1.00, 1.00, 1.00, 0.60 + 0.35 * i, 0.30 + 0.60 * i, 0.85, 0.85 + 0.15 * i];
            default: return new Array(LAYERS).fill(0);
        }
    }

    function applyTargets() {
        if (!layerGains) return;
        const t = targets();
        const now = ctx.currentTime;
        for (let l = 0; l < LAYERS; l++) {
            layerGains[l].gain.cancelScheduledValues(now);
            layerGains[l].gain.setTargetAtTime(t[l], now, 0.7);
        }
    }

    function startMusic() {
        if (musicStarted || !ctx) return;
        musicStarted = true;
        layerGains = [];
        const t0 = ctx.currentTime + 0.1;
        for (let l = 0; l < LAYERS; l++) {
            const src = ctx.createBufferSource();
            src.buffer = layerData[l];
            src.loop = true;
            const g = ctx.createGain();
            g.gain.value = 0;
            src.connect(g);
            g.connect(musicBus);
            src.start(t0);
            layerGains.push(g);
        }
        applyTargets();
    }

    // ------------------------------------------------------------------ dışarıya açılan kısım

    function tryResume() {
        if (!ctx || !active) return;
        try {
            const p = ctx.resume();
            if (p && p.catch) p.catch(() => { /* kullanıcı etkileşimi yok */ });
        } catch (e) { /* yoksay */ }
    }

    // Tarayıcılar sesi ilk dokunuş/tıklamadan önce açmaz: ilk etkileşimde bağlam açılır
    function unlock() {
        if (unlocked || !ensureContext()) return;
        unlocked = true;
        tryResume();
        try {
            const s = ctx.createBufferSource();           // iOS için sessiz bir ses çalıp bağlamı uyandırır
            s.buffer = ctx.createBuffer(1, 1, RATE);
            s.connect(ctx.destination);
            s.start(0);
        } catch (e) { /* yoksay */ }
    }

    function playSfx(name, volume) {
        if (!SUPPORTED || !active || !(volume > 0)) return;
        if (!ctx || ctx.state !== 'running') return;
        const buf = sfx[name];
        if (!buf) return;
        const src = ctx.createBufferSource();
        src.buffer = buf;
        const g = ctx.createGain();
        g.gain.value = volume;
        src.connect(g);
        g.connect(sfxBus);
        if (voices.length >= MAX_VOICES) {
            const old = voices.shift();
            try { old.src.stop(); } catch (e) { /* bitmiş olabilir */ }
        }
        const v = { src };
        voices.push(v);
        src.onended = () => { const k = voices.indexOf(v); if (k >= 0) voices.splice(k, 1); try { g.disconnect(); } catch (e) { /* yoksay */ } };
        src.start();
    }

    function setMusic(newState, newIntensity) {
        state = newState || 'off';
        intensity = +newIntensity || 0;
        applyTargets();
    }

    function setMusicVolume(v) {
        musicVol = Math.max(0, Math.min(1, +v || 0));
        if (musicBus) musicBus.gain.setTargetAtTime(musicVol, ctx.currentTime, 0.03);
    }

    // Pencere öndeyken true: arka plana geçince ses kısılır, bağlam askıya alınır (müzik kaldığı yerden devam eder)
    function setActive(on) {
        on = !!on;
        if (active === on) return;
        active = on;
        clearTimeout(suspendTimer);
        if (!ctx) return;
        const now = ctx.currentTime;
        outGain.gain.cancelScheduledValues(now);
        if (on) {
            tryResume();
            outGain.gain.setTargetAtTime(OUT_GAIN, now, 0.05);
        } else {
            outGain.gain.setTargetAtTime(0, now, 0.04);
            suspendTimer = setTimeout(() => { if (!active && ctx.state === 'running') ctx.suspend().catch(() => { /* yoksay */ }); }, 350);
        }
    }

    function status() {
        return {
            supported: SUPPORTED,
            state: ctx ? ctx.state : 'yok',
            active,
            sfx: Object.keys(sfx).length,
            sfxTotal,
            layers: layerData.filter(Boolean).length,
            musicPlaying: musicStarted,
            musicState: state,
            targets: layerGains ? layerGains.map(g => +g.gain.value.toFixed(3)) : [],
            sfxDone: info.sfxDone,
            musicDone: info.musicDone,
            genMs: info.genMs,
            voices: voices.length,
            error: info.error,
        };
    }

    function init() {
        if (!SUPPORTED || (typeof Platform !== 'undefined' && Platform.java)) return;
        startWorker();
        ['pointerdown', 'touchend', 'keydown', 'mousedown'].forEach(ev => window.addEventListener(ev, unlock, { capture: true, passive: true }));
        document.addEventListener('visibilitychange', () => setActive(!document.hidden));
        window.addEventListener('pagehide', () => setActive(false));
        window.addEventListener('pageshow', () => setActive(!document.hidden));
        if (document.hidden) setActive(false);
    }

    return { init, unlock, playSfx, setMusic, setMusicVolume, setActive, status, supported: SUPPORTED, whenReady: fn => { onReady = fn; } };
})();
