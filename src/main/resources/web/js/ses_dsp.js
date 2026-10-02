// Oyun seslerinin ve müziğin kodla üretimi (DOM'suz, saf hesaplama).
//
// Java'daki SoundBank.java ve MusicEngine.java'nın birebir JavaScript karşılığıdır: masaüstü uygulaması sesleri Java'da üretir,
// tarayıcı ve mobil sürüm aynı sesleri burada üretip Web Audio'ya verir. Java'nın rastgele sayı üreticisi (java.util.Random)
// de taşındığı için çıktı Java ile örnek örnek aynıdır (tools/ses_karsilastir.js bunu Java'nın yazdığı WAV'larla denetler).
// Hem tarayıcıda (Worker içinde importScripts ile) hem Node'da (testler) çalışır.
(function (root) {
    'use strict';

    const RATE = 44100;
    const TWO_PI = 2 * Math.PI;

    // ------------------------------------------------------------------ java.util.Random
    // 48 bitlik doğrusal eşlenik üretici; BigInt yerine iki 24 bitlik yarıyla çalışır (BigInt milyonlarca çağrıda çok yavaştır).
    const M_HI = 0x5DE;
    const M_LO = 0xECE66D;
    const P24 = 16777216;

    class JRandom {
        constructor(seed) {
            // seed ^ 0x5DEECE66D (mod 2^48); seed 32 bitlik işaretli tamsayıdır
            const s = BigInt.asUintN(48, BigInt(seed)) ^ 0x5DEECE66Dn;
            this.hi = Number(s >> 24n);
            this.lo = Number(s & 0xFFFFFFn);
            this.haveG = false;
            this.nextG = 0;
        }

        next(bits) {
            const loFull = this.lo * M_LO + 0xB;
            const carry = Math.floor(loFull / P24);
            const loNew = loFull - carry * P24;
            const hiFull = this.hi * M_LO + this.lo * M_HI + carry;
            const hiNew = hiFull - Math.floor(hiFull / P24) * P24;
            this.lo = loNew;
            this.hi = hiNew;
            const v = Math.floor((hiNew * P24 + loNew) / Math.pow(2, 48 - bits));
            return bits === 32 ? v | 0 : v;
        }

        nextDouble() {
            return (this.next(26) * 134217728 + this.next(27)) / 9007199254740992;
        }

        nextGaussian() {
            if (this.haveG) {
                this.haveG = false;
                return this.nextG;
            }
            let v1, v2, s;
            do {
                v1 = 2 * this.nextDouble() - 1;
                v2 = 2 * this.nextDouble() - 1;
                s = v1 * v1 + v2 * v2;
            } while (s >= 1 || s === 0);
            const mul = Math.sqrt(-2 * Math.log(s) / s);
            this.nextG = v2 * mul;
            this.haveG = true;
            return v1 * mul;
        }

        nextInt(bound) {
            if ((bound & -bound) === bound) return Math.floor((bound * this.next(31)) / 2147483648);
            let bits, val;
            do {
                bits = this.next(31);
                val = bits % bound;
            } while (bits - val + (bound - 1) > 2147483647);
            return val;
        }
    }

    function javaHash(str) {
        let h = 0;
        for (let i = 0; i < str.length; i++) h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
        return h;
    }

    // ------------------------------------------------------------------ SoundBank

    // Her sesin hedef ses düzeyi (dBFS, A-ağırlıklı ortalama) ve genel kısma (dB)
    const LEVEL = {
        fire_octopus: -22.0, fire_eel: -22.0, fire_jellyfish: -23.0, fire_swordfish: -19.5, fire_puffer: -20.0, fire_angler: -23.0,
        splash: -19.0, hit: -31.0, kill: -23.5, boss_kill: -16.0, leak: -17.5, build: -23.5, upgrade: -23.0, sell: -26.0,
        wave_start: -21.0, wave_clear: -22.0, boss_warn: -18.5, boss_warn_mini: -20.5, heartbeat: -27.0, roar: -17.0,
        win: -21.0, lose: -21.0, click: -33.0, gong: -21.0, rumble: -22.0, eruption: -16.0, wind: -23.0, zap_small: -27.0,
        chomp: -17.5, meteor: -24.0, heal: -26.0, shield_break: -21.0, vanish: -29.0, shock: -19.0,
    };
    const MASTER_DB = -5.5;
    const SFX_NAMES = Object.keys(LEVEL);

    const ms = v => Math.trunc(v * RATE / 1000.0);

    function thump(b, t0, f0, f1, dur, k, amp) {
        const s = Math.trunc(t0 * RATE);
        const n = Math.trunc(dur * RATE);
        let ph = 0;
        const tau = dur * 0.22;
        for (let i = 0; i < n && s + i < b.length; i++) {
            const t = i / RATE;
            const f = f1 + (f0 - f1) * Math.exp(-t / tau);
            ph += TWO_PI * f / RATE;
            const e = (1 - Math.exp(-t / 0.0012)) * Math.exp(-k * t);
            b[s + i] += Math.sin(ph) * e * amp;
        }
    }

    function noise(b, t0, dur, lp, hp, k, amp, r) {
        const s = Math.trunc(t0 * RATE);
        const n = Math.trunc(dur * RATE);
        const aLp = 1 - Math.exp(-TWO_PI * lp / RATE);
        const aHp = 1 - Math.exp(-TWO_PI * hp / RATE);
        const comp = Math.min(30.0, Math.sqrt((2 - aLp) / aLp));
        let yl = 0;
        let yh = 0;
        for (let i = 0; i < n && s + i < b.length; i++) {
            const t = i / RATE;
            const x = r.nextGaussian() * 0.45;
            yl += aLp * (x - yl);
            yh += aHp * (yl - yh);
            const v = (yl - yh) * comp;
            const e = (1 - Math.exp(-t / 0.0008)) * (k > 0 ? Math.exp(-k * t) : 1.0);
            b[s + i] += v * e * amp;
        }
    }

    function tone(b, t0, f, dur, amp, attack, k, harmonics, tilt) {
        const s = Math.trunc(t0 * RATE);
        const n = Math.trunc(dur * RATE);
        for (let i = 0; i < n && s + i < b.length; i++) {
            const t = i / RATE;
            const e = (1 - Math.exp(-t / attack)) * Math.exp(-k * t);
            let v = 0;
            for (let h = 1; h <= harmonics; h++) v += Math.sin(TWO_PI * f * h * t) / Math.pow(h, tilt);
            b[s + i] += v * e * amp;
        }
    }

    function sweep(b, t0, f0, f1, dur, amp, saw) {
        const s = Math.trunc(t0 * RATE);
        const n = Math.trunc(dur * RATE);
        let ph = 0;
        for (let i = 0; i < n && s + i < b.length; i++) {
            const t = i / RATE;
            const p = t / dur;
            const f = f0 * Math.pow(f1 / f0, p);
            ph += f / RATE;
            const frac = ph - Math.floor(ph);
            const w = saw ? (2 * frac - 1) * 0.8 : Math.sin(TWO_PI * ph);
            const e = Math.min(1.0, t / 0.004) * Math.pow(1 - p, 1.4);
            b[s + i] += w * e * amp;
        }
    }

    function brass(b, t0, f, dur, amp) {
        const s = Math.trunc(t0 * RATE);
        const n = Math.trunc(dur * RATE);
        for (let i = 0; i < n && s + i < b.length; i++) {
            const t = i / RATE;
            const vib = 1 + 0.004 * Math.sin(TWO_PI * 5.2 * t);
            const e = (1 - Math.exp(-t / 0.05)) * Math.exp(-1.6 * t / dur * 2.2);
            let v = 0;
            for (let h = 1; h <= 9; h++) v += Math.sin(TWO_PI * f * vib * h * t) / h;
            b[s + i] += v * e * amp * 0.45;
        }
    }

    function roar(b, t0, dur, amp, r) {
        const s = Math.trunc(t0 * RATE);
        const n = Math.trunc(dur * RATE);
        let ph = 0;
        let y1 = 0;
        let y2 = 0;
        for (let i = 0; i < n && s + i < b.length; i++) {
            const t = i / RATE;
            const p = t / dur;
            const f = 58 + 22 * Math.sin(Math.PI * p) + 6 * Math.sin(TWO_PI * 17 * t);
            ph += f / RATE;
            const frac = ph - Math.floor(ph);
            const saw = 2 * frac - 1;
            const grit = r.nextGaussian() * 0.35 * (0.5 + 0.5 * Math.sin(TWO_PI * 31 * t));
            const x = saw + grit;
            const fc = 220 + 1500 * Math.sin(Math.PI * Math.pow(p, 0.8));
            const a = 1 - Math.exp(-TWO_PI * fc / RATE);
            y1 += a * (x - y1);
            y2 += a * (y1 - y2);
            const e = Math.min(1.0, t / 0.25) * Math.pow(1 - p, 0.7);
            b[s + i] += y2 * e * amp * 1.6;
        }
    }

    function windNoise(b, t0, dur, r) {
        const s = Math.trunc(t0 * RATE);
        const n = Math.trunc(dur * RATE);
        let y1 = 0;
        let y2 = 0;
        let h1 = 0;
        for (let i = 0; i < n && s + i < b.length; i++) {
            const t = i / RATE;
            const p = t / dur;
            const fc = 350 + 2300 * Math.pow(Math.sin(Math.PI * p), 1.5) * (0.8 + 0.2 * Math.sin(TWO_PI * 0.9 * t));
            const a = 1 - Math.exp(-TWO_PI * fc / RATE);
            const x = r.nextGaussian() * 0.5;
            y1 += a * (x - y1);
            y2 += a * (y1 - y2);
            h1 += 0.004 * (y2 - h1);
            const e = Math.pow(Math.sin(Math.PI * p), 1.3) * (0.75 + 0.25 * Math.sin(TWO_PI * 1.7 * t + 1));
            b[s + i] += (y2 - h1) * e * 3.0;
        }
    }

    function swell(b, t0, dur, peakAt, power) {
        const s = Math.trunc(t0 * RATE);
        const n = Math.trunc(dur * RATE);
        for (let i = 0; i < n && s + i < b.length; i++) {
            const t = i / RATE;
            const e = t < peakAt ? Math.pow(t / peakAt, power) : Math.pow(Math.max(0, 1 - (t - peakAt) / Math.max(0.01, dur - peakAt)), 0.8);
            b[s + i] *= e;
        }
    }

    function amplitudeMod(b, t0, dur, hz, depth) {
        const s = Math.trunc(t0 * RATE);
        const n = Math.trunc(dur * RATE);
        for (let i = 0; i < n && s + i < b.length; i++) {
            const t = i / RATE;
            const m = Math.sin(TWO_PI * hz * t) > 0 ? 1.0 : 1.0 - depth;
            b[s + i] *= m;
        }
    }

    function echo(b, delay, feedback, taps) {
        const d = Math.trunc(delay * RATE);
        const src = Float32Array.from(b);
        let g = 1.0;
        for (let k = 1; k <= taps; k++) {
            g *= feedback;
            const off = d * k;
            for (let i = 0; i + off < b.length; i++) b[i + off] += src[i] * g;
        }
    }

    // ---- A-ağırlıklı düzey ölçümü

    function aWeight(f) {
        const f2 = f * f;
        const ra = (12194.0 * 12194.0 * f2 * f2) /
            ((f2 + 20.6 * 20.6) * Math.sqrt((f2 + 107.7 * 107.7) * (f2 + 737.9 * 737.9)) * (f2 + 12194.0 * 12194.0));
        const f1k = 1000.0 * 1000.0;
        const ref = (12194.0 * 12194.0 * f1k * f1k) /
            ((f1k + 20.6 * 20.6) * Math.sqrt((f1k + 107.7 * 107.7) * (f1k + 737.9 * 737.9)) * (f1k + 12194.0 * 12194.0));
        return ra / ref;
    }

    function fft(re, im) {
        const n = re.length;
        for (let i = 1, j = 0; i < n; i++) {
            let bit = n >> 1;
            for (; (j & bit) !== 0; bit >>= 1) j ^= bit;
            j ^= bit;
            if (i < j) {
                let t = re[i]; re[i] = re[j]; re[j] = t;
                t = im[i]; im[i] = im[j]; im[j] = t;
            }
        }
        for (let len = 2; len <= n; len <<= 1) {
            const ang = -2 * Math.PI / len;
            const wr = Math.cos(ang);
            const wi = Math.sin(ang);
            for (let i = 0; i < n; i += len) {
                let cr = 1;
                let ci = 0;
                for (let k = 0; k < len / 2; k++) {
                    const u = i + k;
                    const v = i + k + len / 2;
                    const xr = re[v] * cr - im[v] * ci;
                    const xi = re[v] * ci + im[v] * cr;
                    re[v] = re[u] - xr;
                    im[v] = im[u] - xi;
                    re[u] += xr;
                    im[u] += xi;
                    const ncr = cr * wr - ci * wi;
                    ci = cr * wi + ci * wr;
                    cr = ncr;
                }
            }
        }
    }

    function aWeightedMeanSquare(x) {
        let n = 1;
        while (n < x.length) n <<= 1;
        const re = new Float64Array(n);
        const im = new Float64Array(n);
        for (let i = 0; i < x.length; i++) re[i] = x[i];
        fft(re, im);
        let sum = 0;
        for (let k = 1; k < n / 2; k++) {
            const w = aWeight(k * RATE / n);
            sum += 2 * (re[k] * re[k] + im[k] * im[k]) * w * w;
        }
        const energy = sum / n;
        return energy / Math.max(x.length, 0.35 * RATE);
    }

    function finish(b, targetDb) {
        let mean = 0;
        for (let i = 0; i < b.length; i++) mean += b[i];
        mean /= b.length;
        for (let i = 0; i < b.length; i++) b[i] -= mean;
        const msq = aWeightedMeanSquare(b);
        const gain = Math.sqrt(Math.pow(10, targetDb / 10) / Math.max(msq, 1e-12));
        const fadeIn = ms(1.0);
        const fadeOut = Math.min(Math.trunc(b.length / 2), ms(14));
        for (let i = 0; i < b.length; i++) {
            let g = gain;
            if (i < fadeIn) g *= i / fadeIn;
            const fromEnd = b.length - 1 - i;
            if (fromEnd < fadeOut) g *= fromEnd / fadeOut;
            b[i] = Math.tanh(b[i] * g);
        }
    }

    function bossWarning(r, len, beats) {
        const b = new Float32Array(ms((len + 2.4) * 1000));
        const n = Math.trunc(len * RATE);
        let ph1 = 0;
        let ph2 = 0;
        for (let i = 0; i < n; i++) {
            const t = i / RATE;
            const sw = Math.pow(Math.min(1.0, t / (len * 0.8)), 1.6);
            ph1 += TWO_PI * 55.0 / RATE;
            ph2 += TWO_PI * 58.0 / RATE;
            b[i] += (Math.sin(ph1) + Math.sin(ph2) * 0.9 + Math.sin(ph1 * 2) * 0.55 + Math.sin(ph2 * 3) * 0.3) * sw * 0.55;
        }
        noise(b, 0, len, 3200, 200, 0.0, 0.30, r);
        swell(b, 0, len, len * 0.9, 2.2);
        for (let k = 0; k < beats; k++) {
            const frac = k / Math.max(1, beats - 1);
            const t = 0.15 + (len - 0.9) * Math.pow(frac, 0.85);
            const a = 0.55 + 0.45 * frac;
            thump(b, t, 110, 50, 0.2, 12, a);
            thump(b, t + 0.22 - 0.05 * frac, 96, 46, 0.18, 13, a * 0.75);
        }
        roar(b, len * 0.34, len * 0.60, 1.0, r);
        const hit = len - 0.15;
        thump(b, hit, 130, 32, 0.9, 5, 1.0);
        thump(b, hit, 70, 30, 1.0, 4, 0.7);
        thump(b, hit, 360, 100, 0.2, 18, 0.6);
        noise(b, hit, 0.6, 1100, 40, 5, 0.8, r);
        echo(b, 0.24, 0.45, 5);
        return b;
    }

    function buildSfx(name) {
        const r = new JRandom(javaHash(name));
        let b;
        switch (name) {
            case 'fire_octopus':
                b = new Float32Array(ms(260));
                thump(b, 0, 240, 85, 0.14, 24, 1.0);
                thump(b, 0, 110, 66, 0.18, 18, 0.45);
                thump(b, 0, 520, 190, 0.05, 55, 0.55);
                noise(b, 0, 0.035, 2800, 250, 110, 0.55, r);
                tone(b, 0, 640, 0.05, 0.18, 0.001, 55, 2, 1.2);
                break;
            case 'fire_eel':
                b = new Float32Array(ms(520));
                noise(b, 0, 0.30, 7000, 900, 8, 0.7, r);
                amplitudeMod(b, 0, 0.30, 58, 0.75);
                sweep(b, 0, 2200, 150, 0.24, 0.30, true);
                thump(b, 0, 190, 72, 0.3, 11, 0.85);
                thump(b, 0, 480, 160, 0.06, 45, 0.45);
                tone(b, 0.02, 1200, 0.08, 0.12, 0.001, 30, 3, 0.8);
                break;
            case 'fire_jellyfish':
                b = new Float32Array(ms(360));
                sweep(b, 0, 300, 880, 0.15, 0.65, false);
                sweep(b, 0.0, 600, 1760, 0.15, 0.16, false);
                thump(b, 0, 200, 80, 0.16, 20, 0.65);
                noise(b, 0.13, 0.05, 4500, 1200, 60, 0.18, r);
                break;
            case 'fire_swordfish':
                b = new Float32Array(ms(620));
                noise(b, 0, 0.012, 14000, 3000, 260, 1.0, r);
                noise(b, 0, 0.24, 9500, 1200, 11, 0.55, r);
                thump(b, 0, 230, 62, 0.34, 11, 1.0);
                thump(b, 0, 115, 50, 0.40, 9, 0.5);
                thump(b, 0, 640, 210, 0.06, 45, 0.6);
                sweep(b, 0.0, 3000, 420, 0.16, 0.22, false);
                echo(b, 0.11, 0.28, 2);
                break;
            case 'fire_angler':
                b = new Float32Array(ms(380));
                thump(b, 0, 220, 80, 0.13, 22, 0.9);
                thump(b, 0, 540, 190, 0.05, 55, 0.45);
                tone(b, 0.01, 987.8, 0.3, 0.32, 0.002, 12, 4, 1.4);
                tone(b, 0.01, 1480, 0.2, 0.14, 0.002, 16, 2, 1.3);
                break;
            case 'fire_puffer':
                b = new Float32Array(ms(420));
                thump(b, 0, 160, 52, 0.26, 14, 1.0);
                thump(b, 0.0, 78, 42, 0.3, 11, 0.55);
                thump(b, 0, 420, 150, 0.07, 35, 0.5);
                noise(b, 0, 0.14, 1000, 70, 22, 0.55, r);
                sweep(b, 0.02, 180, 420, 0.1, 0.18, false);
                break;
            case 'splash':
                b = new Float32Array(ms(900));
                thump(b, 0, 120, 34, 0.55, 7, 1.0);
                thump(b, 0.0, 66, 32, 0.6, 6, 0.6);
                thump(b, 0, 300, 90, 0.12, 22, 0.55);
                noise(b, 0, 0.5, 1500, 60, 6.5, 0.85, r);
                noise(b, 0.0, 0.03, 8000, 1500, 150, 0.5, r);
                echo(b, 0.09, 0.30, 2);
                break;
            case 'hit':
                b = new Float32Array(ms(110));
                thump(b, 0, 280, 120, 0.06, 55, 0.8);
                noise(b, 0, 0.025, 3200, 500, 150, 0.45, r);
                break;
            case 'kill':
                b = new Float32Array(ms(300));
                thump(b, 0, 230, 72, 0.18, 22, 1.0);
                thump(b, 0, 560, 200, 0.05, 55, 0.5);
                noise(b, 0, 0.09, 1900, 140, 38, 0.5, r);
                sweep(b, 0, 520, 180, 0.09, 0.22, false);
                break;
            case 'boss_kill':
                b = new Float32Array(ms(3200));
                thump(b, 0, 150, 34, 1.1, 5, 1.0);
                thump(b, 0.05, 80, 32, 1.2, 4.5, 0.7);
                thump(b, 0, 380, 110, 0.18, 20, 0.6);
                noise(b, 0, 0.9, 900, 40, 3.8, 0.8, r);
                sweep(b, 0.05, 420, 38, 0.9, 0.38, true);
                noise(b, 0, 0.02, 9000, 2000, 120, 0.6, r);
                echo(b, 0.21, 0.42, 5);
                break;
            case 'leak':
                b = new Float32Array(ms(1100));
                thump(b, 0, 170, 40, 0.7, 6, 1.0);
                thump(b, 0.0, 85, 36, 0.8, 5, 0.7);
                thump(b, 0, 420, 120, 0.14, 24, 0.6);
                sweep(b, 0, 320, 70, 0.55, 0.55, true);
                noise(b, 0, 0.26, 700, 40, 12, 0.7, r);
                echo(b, 0.14, 0.32, 3);
                break;
            case 'build':
                b = new Float32Array(ms(300));
                thump(b, 0, 250, 90, 0.12, 30, 0.9);
                noise(b, 0, 0.06, 2600, 350, 70, 0.55, r);
                tone(b, 0.015, 1320, 0.14, 0.16, 0.001, 26, 3, 1.1);
                break;
            case 'upgrade':
                b = new Float32Array(ms(700));
                tone(b, 0.00, 523.25, 0.30, 0.45, 0.004, 9, 4, 1.4);
                tone(b, 0.07, 659.25, 0.30, 0.45, 0.004, 9, 4, 1.4);
                tone(b, 0.14, 783.99, 0.40, 0.50, 0.004, 8, 4, 1.4);
                thump(b, 0, 160, 70, 0.14, 24, 0.6);
                echo(b, 0.12, 0.25, 2);
                break;
            case 'sell':
                b = new Float32Array(ms(380));
                tone(b, 0, 1760, 0.22, 0.4, 0.001, 22, 2, 1.5);
                tone(b, 0.06, 2349, 0.26, 0.4, 0.001, 20, 2, 1.5);
                noise(b, 0, 0.02, 8000, 2500, 160, 0.3, r);
                thump(b, 0, 200, 110, 0.06, 40, 0.3);
                break;
            case 'wave_start':
                b = new Float32Array(ms(1700));
                brass(b, 0.00, 98.0, 0.9, 0.9);
                brass(b, 0.20, 147.0, 0.85, 0.75);
                thump(b, 0, 110, 45, 0.3, 10, 0.8);
                echo(b, 0.18, 0.3, 3);
                break;
            case 'wave_clear':
                b = new Float32Array(ms(1500));
                tone(b, 0.00, 523.25, 0.5, 0.4, 0.006, 5, 5, 1.3);
                tone(b, 0.10, 659.25, 0.5, 0.4, 0.006, 5, 5, 1.3);
                tone(b, 0.20, 783.99, 0.5, 0.4, 0.006, 5, 5, 1.3);
                tone(b, 0.30, 1046.5, 0.8, 0.45, 0.006, 4, 5, 1.3);
                thump(b, 0, 130, 60, 0.2, 14, 0.55);
                echo(b, 0.16, 0.3, 3);
                break;
            case 'boss_warn':
                b = bossWarning(r, 4.2, 5);
                break;
            case 'boss_warn_mini':
                b = bossWarning(r, 2.4, 3);
                break;
            case 'heartbeat':
                b = new Float32Array(ms(520));
                thump(b, 0.00, 112, 56, 0.2, 13, 1.0);
                thump(b, 0.00, 330, 120, 0.07, 40, 0.5);
                thump(b, 0.23, 98, 52, 0.18, 14, 0.75);
                thump(b, 0.23, 290, 110, 0.06, 40, 0.4);
                break;
            case 'roar':
                b = new Float32Array(ms(1500));
                roar(b, 0.0, 1.2, 0.9, r);
                thump(b, 0, 120, 40, 0.4, 8, 0.8);
                echo(b, 0.17, 0.3, 2);
                break;
            case 'win':
                b = new Float32Array(ms(3000));
                brass(b, 0.00, 261.6, 0.6, 0.6);
                brass(b, 0.18, 329.6, 0.6, 0.6);
                brass(b, 0.36, 392.0, 0.6, 0.6);
                brass(b, 0.60, 523.3, 1.6, 0.8);
                tone(b, 0.60, 1046.5, 1.2, 0.2, 0.01, 2.5, 3, 1.5);
                thump(b, 0.6, 120, 50, 0.3, 10, 0.7);
                echo(b, 0.24, 0.35, 4);
                break;
            case 'lose':
                b = new Float32Array(ms(3000));
                brass(b, 0.00, 220.0, 0.9, 0.7);
                brass(b, 0.45, 174.6, 0.9, 0.7);
                brass(b, 0.90, 130.8, 1.7, 0.8);
                sweep(b, 0.9, 140, 40, 1.4, 0.3, true);
                thump(b, 0.9, 100, 28, 0.9, 5, 0.9);
                echo(b, 0.27, 0.4, 4);
                break;
            case 'click':
                b = new Float32Array(ms(80));
                noise(b, 0, 0.01, 6000, 1500, 250, 0.5, r);
                tone(b, 0, 900, 0.04, 0.35, 0.001, 70, 2, 1.2);
                break;
            case 'gong': {
                b = new Float32Array(ms(2200));
                const partials = [1.0, 2.0, 2.76, 4.07, 5.4];
                const amps = [1.0, 0.55, 0.45, 0.25, 0.15];
                for (let i = 0; i < partials.length; i++) tone(b, 0, 98 * partials[i], 2.0, 0.5 * amps[i], 0.003, 2.0 + i * 0.9, 1, 1.0);
                thump(b, 0, 150, 60, 0.3, 10, 0.8);
                noise(b, 0, 0.04, 4000, 500, 80, 0.4, r);
                echo(b, 0.2, 0.3, 3);
                break;
            }
            case 'rumble':
                b = new Float32Array(ms(1700));
                noise(b, 0, 1.4, 260, 25, 0.0, 1.0, r);
                swell(b, 0, 1.4, 1.2, 1.5);
                thump(b, 0.0, 70, 52, 1.4, 1.5, 0.5);
                break;
            case 'eruption':
                b = new Float32Array(ms(2600));
                thump(b, 0, 140, 32, 0.9, 5, 1.0);
                thump(b, 0, 75, 30, 1.0, 4, 0.7);
                noise(b, 0, 1.2, 1700, 60, 3.2, 0.85, r);
                noise(b, 0, 0.5, 7000, 900, 5, 0.45, r);
                amplitudeMod(b, 0, 0.5, 31, 0.5);
                echo(b, 0.17, 0.4, 4);
                break;
            case 'wind':
                b = new Float32Array(ms(3600));
                windNoise(b, 0, 3.4, r);
                break;
            case 'chomp':
                b = new Float32Array(ms(1100));
                thump(b, 0, 190, 45, 0.5, 7, 1.0);
                thump(b, 0.0, 95, 36, 0.6, 6, 0.8);
                thump(b, 0.07, 340, 110, 0.12, 26, 0.7);
                noise(b, 0, 0.05, 6500, 1200, 70, 0.8, r);
                noise(b, 0.06, 0.09, 3200, 300, 38, 0.7, r);
                noise(b, 0.15, 0.25, 1200, 80, 12, 0.5, r);
                sweep(b, 0, 640, 120, 0.14, 0.3, true);
                echo(b, 0.11, 0.3, 2);
                break;
            case 'heal':
                b = new Float32Array(ms(900));
                tone(b, 0.00, 659.3, 0.45, 0.45, 0.004, 5, 3, 1.2);
                tone(b, 0.10, 784.0, 0.45, 0.45, 0.004, 5, 3, 1.2);
                tone(b, 0.20, 987.8, 0.60, 0.45, 0.004, 4, 3, 1.2);
                echo(b, 0.13, 0.35, 3);
                break;
            case 'shield_break':
                b = new Float32Array(ms(700));
                noise(b, 0, 0.12, 9500, 2800, 45, 0.9, r);
                sweep(b, 0, 3200, 900, 0.16, 0.28, false);
                thump(b, 0, 260, 90, 0.12, 30, 0.6);
                for (let i = 0; i < 6; i++) tone(b, 0.04 + i * 0.045, 1800 + r.nextInt(1800), 0.12, 0.14, 0.001, 30, 2, 1.0);
                echo(b, 0.09, 0.25, 2);
                break;
            case 'vanish':
                b = new Float32Array(ms(600));
                noise(b, 0, 0.45, 1500, 200, 0.0, 0.7, r);
                sweep(b, 0, 260, 900, 0.4, 0.2, false);
                swell(b, 0, 0.45, 0.2, 1.6);
                break;
            case 'shock':
                b = new Float32Array(ms(800));
                sweep(b, 0, 2400, 160, 0.3, 0.45, true);
                noise(b, 0, 0.35, 7000, 800, 6, 0.9, r);
                amplitudeMod(b, 0, 0.3, 85, 0.7);
                thump(b, 0, 150, 48, 0.4, 9, 0.9);
                echo(b, 0.1, 0.3, 2);
                break;
            case 'meteor':
                b = new Float32Array(ms(900));
                sweep(b, 0, 1500, 260, 0.8, 0.3, false);
                noise(b, 0, 0.8, 3800, 400, 0.0, 0.55, r);
                swell(b, 0, 0.8, 0.8, 2.2);
                break;
            case 'zap_small':
                b = new Float32Array(ms(260));
                noise(b, 0, 0.12, 6500, 1200, 16, 0.6, r);
                amplitudeMod(b, 0, 0.12, 70, 0.7);
                sweep(b, 0, 1400, 300, 0.1, 0.25, true);
                break;
            default:
                b = new Float32Array(ms(100));
        }
        const lvl = Object.prototype.hasOwnProperty.call(LEVEL, name) ? LEVEL[name] : -24.0;
        finish(b, lvl + MASTER_DB);
        return b;
    }

    // ------------------------------------------------------------------ MusicEngine

    const BEAT = 27000;                       // 98 BPM, tam sayı örnek
    const BAR = BEAT * 4;
    const BARS = 16;
    const N = BAR * BARS;
    const PAD = 0, PLUCK = 1, BASS = 2, KICK = 3, HATS = 4, LEAD = 5, DRONE = 6, STAB = 7, DRIVE = 8;
    const LAYERS = 9;
    const BAND_RMS = [0.026, 0.034, 0.022, 0.040, 0.036, 0.034, 0.022, 0.070, 0.062];
    const MAX_PEAK = [0.30, 0.34, 0.36, 0.50, 0.34, 0.32, 0.26, 0.46, 0.42];
    const ROOT = [45, 41, 48, 43, 45, 41, 38, 40];
    const PAD_NOTES = [
        [57, 60, 64, 67, 71], [53, 57, 60, 64], [52, 55, 59, 64, 67], [55, 59, 62, 64, 69],
        [57, 60, 64, 67, 71], [53, 57, 60, 64], [53, 57, 60, 64, 67], [52, 56, 59, 62, 64]];
    const ARP = [
        [69, 72, 76, 79], [65, 69, 72, 76], [72, 76, 79, 83], [67, 71, 74, 79],
        [69, 72, 76, 79], [65, 69, 72, 76], [62, 65, 69, 72], [64, 68, 71, 74]];

    const hz = midi => 440.0 * Math.pow(2, (midi - 69) / 12.0);

    function bandRms(a) {
        let hpState = 0;
        let lpState = 0;
        const ah = Math.exp(-2 * Math.PI * 250 / RATE);
        const al = 1 - Math.exp(-2 * Math.PI * 5000 / RATE);
        let sum = 0;
        for (let i = 0; i < a.length; i++) {
            const v = a[i];
            hpState = ah * hpState + (1 - ah) * v;
            lpState += al * ((v - hpState) - lpState);
            sum += lpState * lpState;
        }
        return Math.sqrt(sum / a.length);
    }

    function normalize(a, bandTarget, maxPeak) {
        const r = Math.max(1e-9, bandRms(a));
        let mx = 1e-9;
        for (let i = 0; i < a.length; i++) mx = Math.max(mx, Math.abs(a[i]));
        const g = Math.fround(Math.min(bandTarget / r, maxPeak / mx));
        for (let i = 0; i < a.length; i++) a[i] *= g;
    }

    function loopEcho(a, delay, feedback, taps) {
        const src = Float32Array.from(a);
        let amp = 1;
        for (let t = 1; t <= taps; t++) {
            amp = Math.fround(amp * feedback);
            const d = delay * t;
            for (let i = 0; i < N; i++) a[(i + d) % N] += src[i] * amp;
        }
    }

    function buildPad(chords, amp) {
        const out = new Float32Array(N);
        const seg = BAR * 2;
        const tail = BEAT * 3;
        for (let c = 0; c < 8; c++) {
            const start = c * seg;
            const len = seg + tail;
            for (const note of chords[c]) {
                for (let v = 0; v < 2; v++) {
                    const f = hz(note) * (v === 0 ? 0.9968 : 1.0032);
                    let ph = ((note * 0.37) + v * 0.5) % 1.0;
                    let lp = 0;
                    for (let i = 0; i < len; i++) {
                        const t = i / RATE;
                        const env = Math.min(1, t / 1.1) * (i < seg ? 1 : Math.max(0, 1 - (i - seg) / tail));
                        ph += f / RATE;
                        if (ph >= 1) ph -= 1;
                        const saw = 2 * ph - 1;
                        const a = 0.045 + 0.03 * Math.sin(2 * Math.PI * (start + i) / (BAR * 2));
                        lp += a * (saw - lp);
                        out[(start + i) % N] += lp * env * amp;
                    }
                }
            }
        }
        return out;
    }

    function buildPluck() {
        const out = new Float32Array(N);
        for (let bar = 0; bar < BARS; bar++) {
            const a = ARP[Math.trunc(bar / 2)];
            const pat = bar % 2 === 0 ? [0, 1, 2, 3, 2, 1, 2, 3] : [3, 2, 1, 0, 1, 2, 3, 2];
            for (let e = 0; e < 8; e++) {
                const start = bar * BAR + e * (BEAT / 2);
                const f = hz(a[pat[e]]);
                const amp = Math.fround(e === 0 ? 1.1 : (e % 2 === 0 ? 0.85 : 0.6));
                const len = Math.trunc(RATE * 0.9);
                for (let i = 0; i < len; i++) {
                    const t = i / RATE;
                    const env = Math.exp(-t * 5.5) * (1 - Math.exp(-t / 0.003));
                    const v = Math.sin(2 * Math.PI * f * t) + 0.35 * Math.sin(4 * Math.PI * f * t) * Math.exp(-t * 9);
                    out[(start + i) % N] += v * env * amp;
                }
            }
        }
        loopEcho(out, Math.trunc(BEAT * 0.75), Math.fround(0.38), 3);
        return out;
    }

    function buildBass() {
        const out = new Float32Array(N);
        const mult = [1, 1, 2, 1, 1, 2, 1.5, 1];
        for (let bar = 0; bar < BARS; bar++) {
            const f0 = hz(ROOT[Math.trunc(bar / 2)]);
            for (let e = 0; e < 8; e++) {
                const start = bar * BAR + e * (BEAT / 2);
                const f = f0 * mult[e];
                const len = Math.trunc(RATE * 0.45);
                let ph = 0;
                let lp = 0;
                for (let i = 0; i < len; i++) {
                    const t = i / RATE;
                    ph += f / RATE;
                    if (ph >= 1) ph -= 1;
                    const saw = 2 * ph - 1;
                    lp += (0.05 + 0.20 * Math.exp(-t * 9)) * (saw - lp);
                    const v = Math.tanh((lp * 1.6 + Math.sin(2 * Math.PI * f * t) * 0.9) * 1.3);
                    const env = Math.exp(-t * 5.2) * (1 - Math.exp(-t / 0.004));
                    out[(start + i) % N] += v * env * (e % 2 === 0 ? 1.0 : 0.78);
                }
            }
        }
        return out;
    }

    function buildKick() {
        const out = new Float32Array(N);
        const r = new JRandom(5);
        for (let beat = 0; beat < BARS * 4; beat++) {
            const start = beat * BEAT;
            const amp = Math.fround(beat % 4 === 0 ? 1.0 : 0.88);
            const len = Math.trunc(RATE * 0.30);
            let ph = 0;
            let ph2 = 0;
            for (let i = 0; i < len; i++) {
                const t = i / RATE;
                ph += 2 * Math.PI * (48 + 150 * Math.exp(-t * 28)) / RATE;
                ph2 += 2 * Math.PI * (210 + 520 * Math.exp(-t * 55)) / RATE;
                const env = Math.exp(-t * 9) * (1 - Math.exp(-t / 0.001));
                const body = Math.tanh(Math.sin(ph) * 1.6) * env;
                const knock = Math.sin(ph2) * Math.exp(-t * 38) * 0.75;
                const click = i < 220 ? (r.nextDouble() * 2 - 1) * (1 - i / 220.0) * 0.55 : 0;
                out[(start + i) % N] += (body + knock + click) * amp;
            }
        }
        return out;
    }

    function buildHats() {
        const out = new Float32Array(N);
        const r = new JRandom(11);
        for (let e = 0; e < BARS * 8; e++) {
            const start = e * (BEAT / 2);
            const off = e % 2 === 1;
            const len = Math.trunc(RATE * (off ? 0.09 : 0.05));
            let prev = 0;
            for (let i = 0; i < len; i++) {
                const t = i / RATE;
                const n = r.nextDouble() * 2 - 1;
                const hp = n - prev;
                prev = n;
                out[(start + i) % N] += hp * Math.exp(-t * (off ? 40 : 70)) * (off ? 0.7 : 0.45);
            }
        }
        for (let beat = 0; beat < BARS * 4; beat++) {
            if (beat % 2 === 0) continue;
            const start = beat * BEAT;
            const len = Math.trunc(RATE * 0.22);
            let lp = 0;
            for (let i = 0; i < len; i++) {
                const t = i / RATE;
                const n = r.nextDouble() * 2 - 1;
                lp += 0.45 * (n - lp);
                const tn = Math.sin(2 * Math.PI * 190 * t) * Math.exp(-t * 22);
                out[(start + i) % N] += (lp * Math.exp(-t * 17) * 0.9 + tn * 0.6) * 1.3;
            }
        }
        return out;
    }

    function buildLead() {
        const out = new Float32Array(N);
        const pat = [0, 1, 2, 3, 2, 1, 0, 1, 2, 3, 2, 1, 0, 1, 2, 3];
        for (let bar = 0; bar < BARS; bar++) {
            const a = ARP[Math.trunc(bar / 2)];
            for (let s = 0; s < 16; s++) {
                const start = bar * BAR + s * (BEAT / 4);
                const f = hz(a[pat[s]] + (s >= 8 ? 12 : 0));
                const len = Math.trunc(RATE * 0.16);
                let ph = 0;
                let lp = 0;
                for (let i = 0; i < len; i++) {
                    const t = i / RATE;
                    ph += f / RATE;
                    if (ph >= 1) ph -= 1;
                    const saw = 2 * ph - 1;
                    const sq = ph < 0.5 ? 1 : -1;
                    lp += 0.28 * ((saw * 0.6 + sq * 0.4) - lp);
                    const env = Math.exp(-t * 15) * (1 - Math.exp(-t / 0.002));
                    out[(start + i) % N] += lp * env * (s % 4 === 0 ? 1.0 : 0.72);
                }
            }
        }
        loopEcho(out, Math.trunc(BEAT * 0.375), Math.fround(0.30), 2);
        return out;
    }

    function buildStab() {
        const out = new Float32Array(N);
        for (let bar = 0; bar < BARS; bar++) {
            const chord = PAD_NOTES[Math.trunc(bar / 2)];
            for (let hit = 0; hit < 4; hit++) {
                const start = bar * BAR + (2 * hit + 1) * (BEAT / 2);
                const accent = Math.fround(hit === 3 ? 1.0 : 0.8);
                const len = Math.trunc(RATE * 0.17);
                for (const note of chord) {
                    const f = hz(note + (note < 55 ? 12 : 0));
                    let ph = (note * 0.13) % 1.0;
                    let lp = 0;
                    for (let i = 0; i < len; i++) {
                        const t = i / RATE;
                        ph += f / RATE;
                        if (ph >= 1) ph -= 1;
                        const saw = 2 * ph - 1;
                        const sq = ph < 0.5 ? 1 : -1;
                        lp += (0.10 + 0.30 * Math.exp(-t * 20)) * ((saw + sq * 0.5) - lp);
                        const env = Math.exp(-t * 17) * (1 - Math.exp(-t / 0.002));
                        out[(start + i) % N] += lp * env * accent;
                    }
                }
            }
        }
        loopEcho(out, Math.trunc(BEAT * 0.75), Math.fround(0.25), 2);
        return out;
    }

    function buildDrive() {
        const out = new Float32Array(N);
        const pats = [[0, 2, 1, 3, 0, 2, 1, 3], [3, 1, 2, 0, 3, 1, 2, 0]];
        for (let bar = 0; bar < BARS; bar++) {
            const a = ARP[Math.trunc(bar / 2)];
            const pat = pats[bar % 2];
            for (let e = 0; e < 8; e++) {
                const start = bar * BAR + e * (BEAT / 2);
                const f = hz(a[pat[e]] - 12);
                const len = Math.trunc(RATE * 0.22);
                let ph = 0;
                let lp = 0;
                for (let i = 0; i < len; i++) {
                    const t = i / RATE;
                    ph += f / RATE;
                    if (ph >= 1) ph -= 1;
                    lp += (0.06 + 0.34 * Math.exp(-t * 14)) * ((2 * ph - 1) - lp);
                    const env = Math.exp(-t * 11) * (1 - Math.exp(-t / 0.002));
                    out[(start + i) % N] += lp * env * (e % 2 === 0 ? 1.0 : 0.7);
                }
            }
        }
        loopEcho(out, Math.trunc(BEAT * 0.375), Math.fround(0.28), 2);
        return out;
    }

    function buildDrone() {
        const out = new Float32Array(N);
        const seg = BAR * 2;
        const tail = BEAT * 2;
        for (let c = 0; c < 8; c++) {
            const start = c * seg;
            const len = seg + tail;
            const fs = [hz(ROOT[c]) * 0.996, hz(ROOT[c]) * 1.004, hz(ROOT[c] + 7) * 0.5];
            const ph = [0.1, 0.4, 0.7];
            let lp = 0;
            for (let i = 0; i < len; i++) {
                const t = i / RATE;
                const env = Math.min(1, t / 0.6) * (i < seg ? 1 : Math.max(0, 1 - (i - seg) / tail));
                let s = 0;
                for (let v = 0; v < 3; v++) {
                    ph[v] += fs[v] / RATE;
                    if (ph[v] >= 1) ph[v] -= 1;
                    s += 2 * ph[v] - 1;
                }
                lp += 0.025 * (s - lp);
                const trem = 0.72 + 0.28 * Math.sin(2 * Math.PI * 3.1 * (start + i) / RATE);
                out[(start + i) % N] += lp * env * trem;
            }
        }
        for (let beat = 0; beat < BARS * 4; beat++) {
            for (let k = 0; k < 2; k++) {
                const start = beat * BEAT + (k === 0 ? 0 : Math.trunc(BEAT * 0.3));
                const len = Math.trunc(RATE * 0.25);
                for (let i = 0; i < len; i++) {
                    const t = i / RATE;
                    const env = Math.exp(-t * 14) * (1 - Math.exp(-t / 0.004));
                    out[(start + i) % N] += Math.sin(2 * Math.PI * (54 - 8 * t) * t) * env * (k === 0 ? 0.9 : 0.6);
                }
            }
        }
        return out;
    }

    // Tek bir katmanı üretip normalize eder (0 pad, 1 çan, 2 bas, 3 davul, 4 tıkırtı, 5 lead, 6 drone, 7 stab, 8 drive)
    function buildMusicLayer(l) {
        const builders = [() => buildPad(PAD_NOTES, 0.2), buildPluck, buildBass, buildKick, buildHats, buildLead, buildDrone, buildStab, buildDrive];
        const a = builders[l]();
        normalize(a, BAND_RMS[l], MAX_PEAK[l]);
        return a;
    }

    // Tüm katmanları üretir. each(katman, dizi) her katman bitince çağrılır (ilerleme göstermek için).
    function buildMusic(each) {
        const out = [];
        for (let l = 0; l < LAYERS; l++) {
            const a = buildMusicLayer(l);
            out.push(a);
            if (each) each(l, a);
        }
        return out;
    }

    // Durum -> katman hedef düzeyleri (MusicEngine.setState ile aynı)
    function musicTargets(state, intensity) {
        const i = Math.max(0, Math.min(1, intensity));
        switch (state) {
            case 'menu': return [0.90, 0.70, 0, 0, 0, 0, 0, 0, 0];
            case 'calm': return [1.00, 0.60, 0.15, 0, 0, 0, 0, 0, 0];
            case 'battle':
                return [0.30, 0.06, 0.85, 0.55 + 0.30 * i, 0.55 + 0.35 * i, i > 0.55 ? 0.55 * (i - 0.55) / 0.45 : 0, 0, 0.60 + 0.30 * i, 0.40 + 0.55 * i];
            case 'boss':
                return [0.35, 0, 1.00, 1.00, 1.00, 0.60 + 0.35 * i, 0.30 + 0.60 * i, 0.85, 0.85 + 0.15 * i];
            default: return new Array(LAYERS).fill(0);
        }
    }

    const SesDSP = {
        RATE, SFX_NAMES, LEVEL, LAYERS, MUSIC_LENGTH: N, MUSIC_TAU: 0.7,
        JRandom, javaHash, buildSfx, buildMusic, buildMusicLayer, musicTargets, aWeightedMeanSquare,
    };

    if (typeof module !== 'undefined' && module.exports) module.exports = SesDSP;
    else root.SesDSP = SesDSP;
})(typeof self !== 'undefined' ? self : globalThis);
