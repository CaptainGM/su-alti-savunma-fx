// Ayarlar ve kalıcı veriler (rekorlar, zorluk). Java köprüsü varsa ~/.su-alti-savunma/kayit.json'a yazılır,
// yoksa (tarayıcıda test) localStorage kullanılır.
'use strict';

const Settings = (function () {
    const DEFAULTS = { sfx: 1.0, mute: false, fullscreen: false, size: 'auto', quality: 'high', effects: true, floaters: true, fps: 120, showFps: false };
    const state = { settings: Object.assign({}, DEFAULTS), records: {}, difficulty: 'normal' };
    let listeners = [];

    function persist() {
        const json = JSON.stringify(state);
        try {
            if (window.javaBridge && window.javaBridge.saveData) window.javaBridge.saveData(json);
        } catch (e) { /* köprü hazır değil */ }
        try { window.localStorage.setItem('sas.data', json); } catch (e) { /* localStorage kapalı olabilir */ }
    }

    function merge(obj) {
        if (!obj || typeof obj !== 'object') return;
        if (obj.settings) Object.keys(DEFAULTS).forEach(k => { if (obj.settings[k] !== undefined) state.settings[k] = obj.settings[k]; });
        if (obj.records) Object.assign(state.records, obj.records);
        if (obj.difficulty) state.difficulty = obj.difficulty;
    }

    function load() {
        try {
            const raw = window.localStorage.getItem('sas.data');
            if (raw) merge(JSON.parse(raw));
        } catch (e) { /* yoksay */ }
    }

    // Java başlangıçta kayıt dosyasının içeriğini buraya yollar
    window.loadSavedData = function (json) {
        try { merge(JSON.parse(json)); } catch (e) { return; }
        listeners.forEach(fn => fn());
        if (typeof applyWindowSettings === 'function') applyWindowSettings();
        if (typeof refreshAfterLoad === 'function') refreshAfterLoad();
    };

    load();

    return {
        get: () => state.settings,
        set(key, value) { state.settings[key] = value; persist(); listeners.forEach(fn => fn()); },
        reset() { state.settings = Object.assign({}, DEFAULTS); persist(); listeners.forEach(fn => fn()); },
        records: () => state.records,
        setRecord(key, rec) { state.records[key] = rec; persist(); },
        difficulty: () => state.difficulty,
        setDifficulty(d) { state.difficulty = d; persist(); },
        onChange(fn) { listeners.push(fn); },
    };
})();

// ------------------------------------------------------------------ ayar penceresi

let settingsWasPaused = false;

function bridgeCall(name, ...args) {
    try {
        if (window.javaBridge && window.javaBridge[name]) window.javaBridge[name](...args);
    } catch (e) { /* tarayıcıda köprü yok */ }
}

function applyWindowSettings() {
    const s = Settings.get();
    bridgeCall('setFullscreen', !!s.fullscreen);
    if (!s.fullscreen && s.size !== 'auto') {
        const [w, h] = s.size.split('x').map(Number);
        bridgeCall('setWindowSize', w, h);
    }
}

function syncSettingsForm() {
    const s = Settings.get();
    document.getElementById('setSfx').value = Math.round(s.sfx * 100);
    document.getElementById('setSfxVal').innerText = Math.round(s.sfx * 100) + '%';
    document.getElementById('setMute').checked = s.mute;
    document.getElementById('setFullscreen').checked = s.fullscreen;
    document.getElementById('setSize').value = s.size;
    document.getElementById('setSize').disabled = s.fullscreen;
    document.getElementById('setQuality').value = s.quality;
    document.getElementById('setEffects').checked = s.effects;
    document.getElementById('setFloaters').checked = s.floaters;
    document.getElementById('setFps').value = String(s.fps);
    document.getElementById('setShowFps').checked = s.showFps;
}

function openSettings() {
    syncSettingsForm();
    const inGame = typeof world !== 'undefined' && world && !document.getElementById('gameScreen').classList.contains('hidden');
    settingsWasPaused = typeof paused !== 'undefined' ? paused : false;
    if (inGame && !settingsWasPaused) togglePause();
    document.getElementById('settingsScreen').classList.remove('hidden');
}

function closeSettings() {
    document.getElementById('settingsScreen').classList.add('hidden');
    const inGame = typeof world !== 'undefined' && world && !document.getElementById('gameScreen').classList.contains('hidden');
    if (inGame && !settingsWasPaused && paused) togglePause();
}

function resetSettings() {
    Settings.reset();
    syncSettingsForm();
    applyWindowSettings();
    if (typeof fitCanvas === 'function' && typeof world !== 'undefined' && world) fitCanvas();
}

function bindSettingsForm() {
    const on = (id, ev, fn) => document.getElementById(id).addEventListener(ev, fn);
    on('setSfx', 'input', e => {
        Settings.set('sfx', e.target.value / 100);
        document.getElementById('setSfxVal').innerText = e.target.value + '%';
    });
    on('setSfx', 'change', () => { if (typeof sfx === 'function') sfx('fire_swordfish'); });
    on('setMute', 'change', e => Settings.set('mute', e.target.checked));
    on('setFullscreen', 'change', e => {
        Settings.set('fullscreen', e.target.checked);
        document.getElementById('setSize').disabled = e.target.checked;
        applyWindowSettings();
    });
    on('setSize', 'change', e => { Settings.set('size', e.target.value); applyWindowSettings(); });
    on('setQuality', 'change', e => {
        Settings.set('quality', e.target.value);
        if (typeof fitCanvas === 'function' && typeof world !== 'undefined' && world) fitCanvas();
    });
    on('setEffects', 'change', e => Settings.set('effects', e.target.checked));
    on('setFloaters', 'change', e => Settings.set('floaters', e.target.checked));
    on('setFps', 'change', e => Settings.set('fps', +e.target.value));
    on('setShowFps', 'change', e => Settings.set('showFps', e.target.checked));
}

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !document.getElementById('settingsScreen').classList.contains('hidden')) {
        closeSettings();
        return;
    }
    if (e.key === 'F11') {
        e.preventDefault();
        Settings.set('fullscreen', !Settings.get().fullscreen);
        applyWindowSettings();
        if (!document.getElementById('settingsScreen').classList.contains('hidden')) syncSettingsForm();
    }
});

// Java kayıtlı ayarları yükleyince pencere durumunu uygula
Settings.onChange(() => { if (document.getElementById('settingsScreen')) syncSettingsForm(); });
window.addEventListener('load', () => {
    bindSettingsForm();
    syncSettingsForm();
});
