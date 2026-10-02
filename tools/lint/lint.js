// Statik denetim: web betiklerinde tanımsız değişken, yinelenen tanım, erişilemeyen kod gibi hataları arar.
//
//   cd tools/lint && npm install && node lint.js
//
// Betikler tarayıcıda aynı genel alanı paylaşır (game.js, core.js içindeki Core'u görür...). Bu yüzden sayfadaki yükleme sırasıyla
// tek bir program gibi denetlenir; böylece dosyalar arası ad hataları (yazım yanlışı, silinmiş bir işlevi çağırmak) bulunur.
// Worker betikleri ve Node'da çalışan çekirdek ayrı ayrı denetlenir.
const fs = require('fs');
const path = require('path');
const { Linter } = require('eslint');

const WEB = path.join(__dirname, '..', '..', 'src', 'main', 'resources', 'web');
const okuma = f => fs.readFileSync(path.join(WEB, f), 'utf8').replace(/\r\n/g, '\n');
const linter = new Linter();

const TARAYICI = ['window', 'document', 'navigator', 'location', 'localStorage', 'performance', 'requestAnimationFrame', 'cancelAnimationFrame', 'setTimeout', 'clearTimeout',
    'setInterval', 'clearInterval', 'Image', 'Worker', 'AudioContext', 'webkitAudioContext', 'KeyboardEvent', 'URLSearchParams', 'alert', 'console', 'screen', 'matchMedia',
    'devicePixelRatio', 'innerWidth', 'innerHeight', 'fetch', 'caches', 'Float32Array', 'Float64Array', 'Int16Array', 'Uint8Array', 'Map', 'Set', 'Promise', 'JSON', 'Math',
    'Date', 'Object', 'Array', 'String', 'Number', 'Boolean', 'Error', 'BigInt', 'globalThis', 'module', 'self'];

function denetle(ad, kod, ekstraGlobal = {}) {
    const globals = {};
    TARAYICI.forEach(g => { globals[g] = 'readonly'; });
    Object.assign(globals, ekstraGlobal);
    const mesajlar = linter.verify(kod, [{
        files: ['**/*.js'],
        languageOptions: { ecmaVersion: 2022, sourceType: 'script', globals },
        linterOptions: { reportUnusedDisableDirectives: false },
        rules: {
            'no-undef': 'error',
            'no-redeclare': 'error',
            'no-dupe-keys': 'error',
            'no-dupe-args': 'error',
            'no-dupe-else-if': 'error',
            'no-duplicate-case': 'error',
            'no-unreachable': 'error',
            'no-const-assign': 'error',
            'no-func-assign': 'error',
            'no-self-assign': 'error',
            'no-unsafe-negation': 'error',
            'no-unsafe-finally': 'error',
            'no-cond-assign': 'error',
            'no-empty-pattern': 'error',
            'no-sparse-arrays': 'error',
            'no-this-before-super': 'error',
            'use-isnan': 'error',
            'valid-typeof': 'error',
            'no-loss-of-precision': 'error',
            'no-unused-labels': 'error',
            'no-shadow-restricted-names': 'error',
            'no-delete-var': 'error',
            'getter-return': 'error',
            'no-async-promise-executor': 'error',
            'no-compare-neg-zero': 'error',
            'no-constant-binary-expression': 'error',
            'no-setter-return': 'error',
        },
    }], ad + '.js');
    return mesajlar;
}

let hata = 0;
function rapor(ad, mesajlar, satirDosya) {
    if (!mesajlar.length) { console.log(`OK   ${ad}`); return; }
    hata += mesajlar.length;
    console.log(`FAIL ${ad}: ${mesajlar.length} sorun`);
    mesajlar.slice(0, 40).forEach(m => console.log(`     ${satirDosya ? satirDosya(m.line) : ''}satır ${m.line}: ${m.message} (${m.ruleId})`));
}

// sayfadaki sıra (index.html): platform, core, settings, maps, audio, game, rehber
const sira = ['js/platform.js', 'js/core.js', 'js/settings.js', 'js/maps.js', 'js/audio.js', 'js/game.js', 'js/rehber.js'];
const parcalar = sira.map(f => ({ f, kod: okuma(f) }));
// Her dosya kendi 'use strict' bildirimini taşır; birleştirirken dosya sınırları satır eşlemesi için tutulur
let birlesik = '';
const sinirlar = [];
for (const p of parcalar) {
    sinirlar.push({ f: p.f, bas: birlesik.split('\n').length });
    birlesik += p.kod.replace(/^'use strict';\n/m, '') + '\n';
}
const hangi = satir => { let s = sinirlar[0]; for (const x of sinirlar) if (satir >= x.bas) s = x; return `${s.f}:`; };
// çekirdek ve haritalar Node uyumlu (module.exports) ve sayfada global olarak da tanımlanır; Java köprüsünün enjekte ettikleri de genel alandadır
const ekstra = { Core: 'writable', MAPS: 'writable', SesDSP: 'writable' };
rapor('sayfa betikleri (platform, core, settings, maps, audio, game, rehber) birlikte', denetle('sayfa', birlesik, ekstra), satir => { const b = sinirlar.slice().reverse().find(x => satir >= x.bas) || sinirlar[0]; return `${b.f}:${satir - b.bas + 1} `; });

const isci = { importScripts: 'readonly', postMessage: 'readonly', onmessage: 'writable', SesDSP: 'writable' };
rapor('js/ses_dsp.js', denetle('ses_dsp', okuma('js/ses_dsp.js'), isci));
rapor('js/ses_isci.js', denetle('ses_isci', okuma('js/ses_isci.js'), isci));
rapor('sw.js', denetle('sw', okuma('sw.js'), { caches: 'readonly', clients: 'readonly', skipWaiting: 'readonly', Response: 'readonly', URL: 'readonly', Request: 'readonly' }));

console.log(hata ? `\n${hata} sorun bulundu` : '\nTEMİZ');
process.exit(hata ? 1 : 0);
