// Ses motorunun JavaScript karşılığını (js/ses_dsp.js) Java'nın yazdığı WAV dosyalarıyla örnek örnek karşılaştırır.
//
//   node tools/ses_karsilastir.js            (önce `mvn compile` ile target/classes hazır olmalı)
//
// Java sesleri ve dört müzik durumunu geçici klasöre yazar, JS aynı sesleri üretir ve farkı ölçer. Fark 16 bit örnek
// biriminde (LSB) birkaç basamağın altında olmalıdır; aksi hâlde çıkış kodu 1 olur.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const D = require(path.join(__dirname, '..', 'src', 'main', 'resources', 'web', 'js', 'ses_dsp.js'));

const classes = path.join(__dirname, '..', 'target', 'classes');
if (!fs.existsSync(path.join(classes, 'com', 'kule', 'savunma', 'SoundBank.class'))) {
    console.log('target/classes yok: önce `mvn compile` çalıştırın. Karşılaştırma atlandı.');
    process.exit(process.env.CI ? 1 : 0);
}
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ses-'));
const run = cls => execFileSync('java', ['-cp', classes, 'com.kule.savunma.' + cls, path.join(tmp, cls)], { stdio: ['ignore', 'pipe', 'inherit'] });
run('SoundBank');
run('MusicEngine');

function readWav(file) {
    const buf = fs.readFileSync(file);
    let p = 12;
    while (p < buf.length) {
        const id = buf.toString('ascii', p, p + 4);
        const len = buf.readUInt32LE(p + 4);
        if (id === 'data') return new Int16Array(buf.buffer.slice(buf.byteOffset + p + 8, buf.byteOffset + p + 8 + len));
        p += 8 + len + (len % 2);
    }
    throw new Error('data parçası yok: ' + file);
}

const q = x => Math.max(-32768, Math.min(32767, Math.round(x * 32767)));
let fails = 0;
function compare(name, ref, got) {
    let maxd = 0, sum = 0, sref = 0;
    const n = Math.min(ref.length, got.length);
    for (let i = 0; i < n; i++) {
        const d = Math.abs(ref[i] - got[i]);
        maxd = Math.max(maxd, d);
        sum += d * d;
        sref += ref[i] * ref[i];
    }
    const rmsErr = Math.sqrt(sum / n);
    const snr = 10 * Math.log10(sref / Math.max(sum, 1e-9));
    const okLen = ref.length === got.length;
    const ok = okLen && maxd <= 24 && snr > 55;
    if (!ok) fails++;
    console.log(`${ok ? 'OK  ' : 'FAIL'} ${name.padEnd(16)} uzunluk ${okLen ? 'aynı' : ref.length + '/' + got.length}  en büyük fark ${String(maxd).padStart(3)} LSB  rms fark ${rmsErr.toFixed(2)}  SNR ${snr.toFixed(0)} dB`);
}

console.log('--- efekt sesleri');
for (const name of D.SFX_NAMES) {
    const ref = readWav(path.join(tmp, 'SoundBank', name + '.wav'));
    const b = D.buildSfx(name);
    const got = new Int16Array(b.length);
    for (let i = 0; i < b.length; i++) got[i] = q(b[i]);
    compare(name, ref, got);
}

console.log('--- müzik (dört durum, katmanlar karışmış)');
const layers = D.buildMusic();
const N = D.MUSIC_LENGTH;
const states = [['menu', 0], ['calm', 0], ['battle', 0.7], ['boss', 0.8]];
for (const [st, inten] of states) {
    const target = D.musicTargets(st, inten);
    const gain = Float32Array.from(target);          // MusicEngine.main: gain = target ile başlar
    const got = new Int16Array(N);
    for (let i = 0; i < N; i++) {
        let s = 0;
        for (let l = 0; l < D.LAYERS; l++) s += layers[l][i] * gain[l];
        got[i] = Math.max(-32768, Math.min(32767, Math.round(Math.tanh(s * 1.0 * 1.15) * 32000)));
    }
    const ref = readWav(path.join(tmp, 'MusicEngine', 'muzik_' + st + '.wav'));
    compare('muzik_' + st, ref, got);
}
fs.rmSync(tmp, { recursive: true, force: true });
console.log(fails ? `\n${fails} ses Java ile uyuşmuyor` : '\nTÜM SESLER JAVA İLE BİREBİR UYUŞUYOR');
process.exit(fails ? 1 : 0);
