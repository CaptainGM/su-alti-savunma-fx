package com.kule.savunma;

import java.io.ByteArrayInputStream;
import java.io.File;
import java.util.Random;
import javax.sound.sampled.AudioFileFormat;
import javax.sound.sampled.AudioFormat;
import javax.sound.sampled.AudioInputStream;
import javax.sound.sampled.AudioSystem;

/**
 * Oyun müziği: kodla üretilen, 39 saniyelik, kusursuz döngü yapan yedi katman.
 *
 * Hepsi aynı tempoda (98 BPM) ve aynı akor dizisindedir (La minör: Am9 - Fmaj7 - Cmaj7 - G6/9 - Am9 - Fmaj7 - Dm9 - E7),
 * bu yüzden katmanlar istenen oranda karıştırılabilir:
 *   pad      geniş, yavaş açılan su altı pedi              (her zaman)
 *   çan      yankılı, yumuşak arpej                         (sakin anlar)
 *   bas      sekizlik vuruşlu alçak bas                     (savaş)
 *   kick     dörtte dört bas davul                          (savaş, patron)
 *   hat/snare tıkırtılı vurmalılar                          (savaş, patron)
 *   lead     onaltılık hızlı arpej (Geometry Dash tadı)      (patron)
 *   drone    gerilimli alçak uğultu ve kalp atışı           (patron)
 *   stab     eksik vuruşlara düşen parlak akor vuruşları     (savaş, patron)
 *   drive    sekizlik testere dişi arpej                     (savaş, patron)
 *
 * Katman düzeyleri tepe değerine göre değil, küçük (laptop) hoparlörlerin çalabildiği 250-5000 Hz bandındaki
 * ses gücüne göre ayarlanır. Bas ve davul alçak olduğu için tek başına küçük hoparlörde fark yaratmaz; savaşın
 * "farklı" duyulması stab ve drive katmanlarının orta-tiz aralığından gelir.
 *
 * {@link #setState(String, double)} ile durum ("menu", "calm", "battle", "boss", "off") ve yoğunluk (0..1) verilir;
 * katmanların sesleri yaklaşık bir saniyede yumuşakça geçiş yapar. SoundPlayer her 10 ms'de {@link #mixInto} çağırır.
 */
public final class MusicEngine {

    private static final int RATE = SoundBank.RATE;
    private static final int BEAT = 27000;               // 98 BPM, tam sayı örnek
    private static final int BAR = BEAT * 4;
    private static final int BARS = 16;
    private static final int N = BAR * BARS;

    static final int PAD = 0, PLUCK = 1, BASS = 2, KICK = 3, HATS = 4, LEAD = 5, DRONE = 6, STAB = 7, DRIVE = 8, LAYERS = 9;
    /** Her katmanın 250-5000 Hz bandındaki hedef ses gücü (RMS) ve izin verilen en yüksek örnek değeri. */
    private static final double[] BAND_RMS = {0.026, 0.034, 0.022, 0.040, 0.036, 0.034, 0.022, 0.070, 0.062};
    private static final double[] MAX_PEAK = {0.30, 0.34, 0.36, 0.50, 0.34, 0.32, 0.26, 0.46, 0.42};

    private static final int[] ROOT = {45, 41, 48, 43, 45, 41, 38, 40};
    private static final int[][] PAD_NOTES = {
        {57, 60, 64, 67, 71}, {53, 57, 60, 64}, {52, 55, 59, 64, 67}, {55, 59, 62, 64, 69},
        {57, 60, 64, 67, 71}, {53, 57, 60, 64}, {53, 57, 60, 64, 67}, {52, 56, 59, 62, 64}};
    private static final int[][] ARP = {
        {69, 72, 76, 79}, {65, 69, 72, 76}, {72, 76, 79, 83}, {67, 71, 74, 79},
        {69, 72, 76, 79}, {65, 69, 72, 76}, {62, 65, 69, 72}, {64, 68, 71, 74}};

    private static volatile float[][] layers;
    private static volatile float volume = 0.4f;
    private static final float[] gain = new float[LAYERS];
    private static final float[] target = new float[LAYERS];
    private static int pos;
    private static boolean building;

    private MusicEngine() { }

    // ---------------------------------------------------------------- dışarıya açılan kısım

    /** Müziği arka planda üretmeye başlar (bir kez). Üretim bitene kadar sessiz kalır. */
    public static synchronized void init() {
        if (building) {
            return;
        }
        building = true;
        Thread t = new Thread(() -> layers = buildAll(), "muzik-uretici");
        t.setDaemon(true);
        t.setPriority(Thread.NORM_PRIORITY - 1);
        t.start();
    }

    /** 0..1 arası genel müzik düzeyi (ayarlardaki Müzik çubuğu ve sessiz mod). */
    public static void setVolume(double v) {
        volume = (float) Math.max(0, Math.min(1, v));
    }

    /** state: off | menu | calm | battle | boss. intensity: 0..1 (dalga ilerlemesi, patron yakınlığı, can durumu). */
    public static void setState(String state, double intensity) {
        float i = (float) Math.max(0, Math.min(1, intensity));
        float[] t;
        switch (state) {
            case "menu":
                t = new float[] {0.90f, 0.70f, 0f, 0f, 0f, 0f, 0f, 0f, 0f};
                break;
            case "calm":
                t = new float[] {1.00f, 0.60f, 0.15f, 0f, 0f, 0f, 0f, 0f, 0f};
                break;
            case "battle":
                // pad ve çan geri çekilir; ritim (stab, drive, davul, tıkırtı) öne çıkar, yoğunlukla artar
                t = new float[] {0.30f, 0.06f, 0.85f, 0.55f + 0.30f * i, 0.55f + 0.35f * i, i > 0.55f ? 0.55f * (i - 0.55f) / 0.45f : 0f, 0f,
                    0.60f + 0.30f * i, 0.40f + 0.55f * i};
                break;
            case "boss":
                t = new float[] {0.35f, 0f, 1.00f, 1.00f, 1.00f, 0.60f + 0.35f * i, 0.30f + 0.60f * i, 0.85f, 0.85f + 0.15f * i};
                break;
            default:
                t = new float[LAYERS];
        }
        System.arraycopy(t, 0, target, 0, LAYERS);
    }

    /** Ses hattının karıştırıcısı çağırır: müziği mix tamponuna ekler. */
    static void mixInto(float[] mix, int frames) {
        float[][] L = layers;
        if (L == null) {
            return;
        }
        float vol = volume;
        float k = (float) (1 - Math.exp(-1.0 / (RATE * 0.7)));
        for (int i = 0; i < frames; i++) {
            float s = 0;
            for (int l = 0; l < LAYERS; l++) {
                gain[l] += (target[l] - gain[l]) * k;
                s += L[l][pos] * gain[l];
            }
            mix[i] += s * vol;
            if (++pos >= N) {
                pos = 0;
            }
        }
    }

    // ---------------------------------------------------------------- üretim

    private static float[][] buildAll() {
        float[][] out = new float[LAYERS][];
        out[PAD] = buildPad(PAD_NOTES, 0.2);
        out[PLUCK] = buildPluck();
        out[BASS] = buildBass();
        out[KICK] = buildKick();
        out[HATS] = buildHats();
        out[LEAD] = buildLead();
        out[DRONE] = buildDrone();
        out[STAB] = buildStab();
        out[DRIVE] = buildDrive();
        for (int l = 0; l < LAYERS; l++) {
            normalize(out[l], BAND_RMS[l], MAX_PEAK[l]);
        }
        return out;
    }

    private static double hz(double midi) {
        return 440.0 * Math.pow(2, (midi - 69) / 12.0);
    }

    /** 250-5000 Hz bandındaki ses gücü: tek kutuplu yüksek geçiren (250 Hz) + alçak geçiren (5 kHz). */
    private static double bandRms(float[] a) {
        double hpState = 0;
        double lpState = 0;
        double ah = Math.exp(-2 * Math.PI * 250 / RATE);
        double al = 1 - Math.exp(-2 * Math.PI * 5000 / RATE);
        double sum = 0;
        for (float v : a) {
            hpState = ah * hpState + (1 - ah) * v;
            lpState += al * ((v - hpState) - lpState);
            sum += lpState * lpState;
        }
        return Math.sqrt(sum / a.length);
    }

    /** Katmanı laptop bandındaki gücüne göre ölçekler; tepe değeri maxPeak'i aşarsa orada sınırlar. */
    private static void normalize(float[] a, double bandTarget, double maxPeak) {
        double r = Math.max(1e-9, bandRms(a));
        double mx = 1e-9;
        for (float v : a) {
            mx = Math.max(mx, Math.abs(v));
        }
        float g = (float) Math.min(bandTarget / r, maxPeak / mx);
        for (int i = 0; i < a.length; i++) {
            a[i] *= g;
        }
    }

    /** Döngüsel tampona yankı ekler (dönüşte kesinti olmaz). */
    private static void echo(float[] a, int delay, float feedback, int taps) {
        float[] src = a.clone();
        float amp = 1;
        for (int t = 1; t <= taps; t++) {
            amp *= feedback;
            int d = delay * t;
            for (int i = 0; i < N; i++) {
                a[(i + d) % N] += src[i] * amp;
            }
        }
    }

    /** Yavaş açılan geniş ped: her akor iki ölçü sürer, sonraki akora doğru söner (döngüsel). */
    private static float[] buildPad(int[][] chords, double amp) {
        float[] out = new float[N];
        int seg = BAR * 2;
        int tail = BEAT * 3;
        for (int c = 0; c < 8; c++) {
            int start = c * seg;
            int len = seg + tail;
            for (int note : chords[c]) {
                for (int v = 0; v < 2; v++) {
                    double f = hz(note) * (v == 0 ? 0.9968 : 1.0032);
                    double ph = ((note * 0.37) + v * 0.5) % 1.0;
                    double lp = 0;
                    for (int i = 0; i < len; i++) {
                        double t = i / (double) RATE;
                        double env = Math.min(1, t / 1.1) * (i < seg ? 1 : Math.max(0, 1 - (i - seg) / (double) tail));
                        ph += f / RATE;
                        if (ph >= 1) {
                            ph -= 1;
                        }
                        double saw = 2 * ph - 1;
                        double a = 0.045 + 0.03 * Math.sin(2 * Math.PI * (start + i) / (double) (BAR * 2));
                        lp += a * (saw - lp);
                        out[(start + i) % N] += (float) (lp * env * amp);
                    }
                }
            }
        }
        return out;
    }

    private static float[] buildPluck() {
        float[] out = new float[N];
        for (int bar = 0; bar < BARS; bar++) {
            int[] a = ARP[bar / 2];
            int[] pat = bar % 2 == 0 ? new int[] {0, 1, 2, 3, 2, 1, 2, 3} : new int[] {3, 2, 1, 0, 1, 2, 3, 2};
            for (int e = 0; e < 8; e++) {
                int start = bar * BAR + e * (BEAT / 2);
                double f = hz(a[pat[e]]);
                float amp = e == 0 ? 1.1f : (e % 2 == 0 ? 0.85f : 0.6f);
                int len = (int) (RATE * 0.9);
                for (int i = 0; i < len; i++) {
                    double t = i / (double) RATE;
                    double env = Math.exp(-t * 5.5) * (1 - Math.exp(-t / 0.003));
                    double v = Math.sin(2 * Math.PI * f * t) + 0.35 * Math.sin(4 * Math.PI * f * t) * Math.exp(-t * 9);
                    out[(start + i) % N] += (float) (v * env * amp);
                }
            }
        }
        echo(out, (int) (BEAT * 0.75), 0.38f, 3);
        return out;
    }

    private static float[] buildBass() {
        float[] out = new float[N];
        double[] mult = {1, 1, 2, 1, 1, 2, 1.5, 1};
        for (int bar = 0; bar < BARS; bar++) {
            double f0 = hz(ROOT[bar / 2]);
            for (int e = 0; e < 8; e++) {
                int start = bar * BAR + e * (BEAT / 2);
                double f = f0 * mult[e];
                int len = (int) (RATE * 0.45);
                double ph = 0;
                double lp = 0;
                for (int i = 0; i < len; i++) {
                    double t = i / (double) RATE;
                    ph += f / RATE;
                    if (ph >= 1) {
                        ph -= 1;
                    }
                    // testere dişi + sinüs; süzgeç açıklığı notayla birlikte kapanır: orta aralıkta da duyulan "dişli" bas
                    double saw = 2 * ph - 1;
                    lp += (0.05 + 0.20 * Math.exp(-t * 9)) * (saw - lp);
                    double v = Math.tanh((lp * 1.6 + Math.sin(2 * Math.PI * f * t) * 0.9) * 1.3);
                    double env = Math.exp(-t * 5.2) * (1 - Math.exp(-t / 0.004));
                    out[(start + i) % N] += (float) (v * env * (e % 2 == 0 ? 1.0 : 0.78));
                }
            }
        }
        return out;
    }

    private static float[] buildKick() {
        float[] out = new float[N];
        Random r = new Random(5);
        for (int beat = 0; beat < BARS * 4; beat++) {
            int start = beat * BEAT;
            float amp = beat % 4 == 0 ? 1.0f : 0.88f;
            int len = (int) (RATE * 0.30);
            double ph = 0;
            double ph2 = 0;
            for (int i = 0; i < len; i++) {
                double t = i / (double) RATE;
                ph += 2 * Math.PI * (48 + 150 * Math.exp(-t * 28)) / RATE;
                ph2 += 2 * Math.PI * (210 + 520 * Math.exp(-t * 55)) / RATE;        // "toc": orta aralıkta da duyulan gövde
                double env = Math.exp(-t * 9) * (1 - Math.exp(-t / 0.001));
                double body = Math.tanh(Math.sin(ph) * 1.6) * env;
                double knock = Math.sin(ph2) * Math.exp(-t * 38) * 0.75;
                double click = i < 220 ? (r.nextDouble() * 2 - 1) * (1 - i / 220.0) * 0.55 : 0;
                out[(start + i) % N] += (float) ((body + knock + click) * amp);
            }
        }
        return out;
    }

    private static float[] buildHats() {
        float[] out = new float[N];
        Random r = new Random(11);
        for (int e = 0; e < BARS * 8; e++) {
            int start = e * (BEAT / 2);
            boolean off = e % 2 == 1;
            int len = (int) (RATE * (off ? 0.09 : 0.05));
            double prev = 0;
            for (int i = 0; i < len; i++) {
                double t = i / (double) RATE;
                double n = r.nextDouble() * 2 - 1;
                double hp = n - prev;                      // basit yüksek geçiren: tiz tıkırtı
                prev = n;
                out[(start + i) % N] += (float) (hp * Math.exp(-t * (off ? 40 : 70)) * (off ? 0.7 : 0.45));
            }
        }
        // zil/snare: 2. ve 4. vuruş
        for (int beat = 0; beat < BARS * 4; beat++) {
            if (beat % 2 == 0) {
                continue;
            }
            int start = beat * BEAT;
            int len = (int) (RATE * 0.22);
            double lp = 0;
            for (int i = 0; i < len; i++) {
                double t = i / (double) RATE;
                double n = r.nextDouble() * 2 - 1;
                lp += 0.45 * (n - lp);
                double tone = Math.sin(2 * Math.PI * 190 * t) * Math.exp(-t * 22);
                out[(start + i) % N] += (float) ((lp * Math.exp(-t * 17) * 0.9 + tone * 0.6) * 1.3);
            }
        }
        return out;
    }

    private static float[] buildLead() {
        float[] out = new float[N];
        int[] pat = {0, 1, 2, 3, 2, 1, 0, 1, 2, 3, 2, 1, 0, 1, 2, 3};
        for (int bar = 0; bar < BARS; bar++) {
            int[] a = ARP[bar / 2];
            for (int s = 0; s < 16; s++) {
                int start = bar * BAR + s * (BEAT / 4);
                double f = hz(a[pat[s]] + (s >= 8 ? 12 : 0));
                int len = (int) (RATE * 0.16);
                double ph = 0;
                double lp = 0;
                for (int i = 0; i < len; i++) {
                    double t = i / (double) RATE;
                    ph += f / RATE;
                    if (ph >= 1) {
                        ph -= 1;
                    }
                    double saw = 2 * ph - 1;
                    double sq = ph < 0.5 ? 1 : -1;
                    lp += 0.28 * ((saw * 0.6 + sq * 0.4) - lp);
                    double env = Math.exp(-t * 15) * (1 - Math.exp(-t / 0.002));
                    out[(start + i) % N] += (float) (lp * env * (s % 4 == 0 ? 1.0 : 0.72));
                }
            }
        }
        echo(out, (int) (BEAT * 0.375), 0.30f, 2);
        return out;
    }

    /** Eksik vuruşlara düşen parlak akor vuruşları ("skank"): savaşın ritmini orta aralıkta taşır. */
    private static float[] buildStab() {
        float[] out = new float[N];
        for (int bar = 0; bar < BARS; bar++) {
            int[] chord = PAD_NOTES[bar / 2];
            for (int hit = 0; hit < 4; hit++) {
                int start = bar * BAR + (2 * hit + 1) * (BEAT / 2);
                float accent = hit == 3 ? 1.0f : 0.8f;
                int len = (int) (RATE * 0.17);
                for (int note : chord) {
                    double f = hz(note + (note < 55 ? 12 : 0));
                    double ph = (note * 0.13) % 1.0;
                    double lp = 0;
                    for (int i = 0; i < len; i++) {
                        double t = i / (double) RATE;
                        ph += f / RATE;
                        if (ph >= 1) {
                            ph -= 1;
                        }
                        double saw = 2 * ph - 1;
                        double sq = ph < 0.5 ? 1 : -1;
                        lp += (0.10 + 0.30 * Math.exp(-t * 20)) * ((saw + sq * 0.5) - lp);
                        double env = Math.exp(-t * 17) * (1 - Math.exp(-t / 0.002));
                        out[(start + i) % N] += (float) (lp * env * accent);
                    }
                }
            }
        }
        echo(out, (int) (BEAT * 0.75), 0.25f, 2);
        return out;
    }

    /** Sekizlik testere dişi arpej: savaşa ilerleme ve aciliyet katar. */
    private static float[] buildDrive() {
        float[] out = new float[N];
        int[][] pats = {{0, 2, 1, 3, 0, 2, 1, 3}, {3, 1, 2, 0, 3, 1, 2, 0}};
        for (int bar = 0; bar < BARS; bar++) {
            int[] a = ARP[bar / 2];
            int[] pat = pats[bar % 2];
            for (int e = 0; e < 8; e++) {
                int start = bar * BAR + e * (BEAT / 2);
                double f = hz(a[pat[e]] - 12);
                int len = (int) (RATE * 0.22);
                double ph = 0;
                double lp = 0;
                for (int i = 0; i < len; i++) {
                    double t = i / (double) RATE;
                    ph += f / RATE;
                    if (ph >= 1) {
                        ph -= 1;
                    }
                    lp += (0.06 + 0.34 * Math.exp(-t * 14)) * ((2 * ph - 1) - lp);
                    double env = Math.exp(-t * 11) * (1 - Math.exp(-t / 0.002));
                    out[(start + i) % N] += (float) (lp * env * (e % 2 == 0 ? 1.0 : 0.7));
                }
            }
        }
        echo(out, (int) (BEAT * 0.375), 0.28f, 2);
        return out;
    }

    private static float[] buildDrone() {
        float[] out = new float[N];
        int seg = BAR * 2;
        int tail = BEAT * 2;
        for (int c = 0; c < 8; c++) {
            int start = c * seg;
            int len = seg + tail;
            double[] fs = {hz(ROOT[c]) * 0.996, hz(ROOT[c]) * 1.004, hz(ROOT[c] + 7) * 0.5};
            double[] ph = {0.1, 0.4, 0.7};
            double lp = 0;
            for (int i = 0; i < len; i++) {
                double t = i / (double) RATE;
                double env = Math.min(1, t / 0.6) * (i < seg ? 1 : Math.max(0, 1 - (i - seg) / (double) tail));
                double s = 0;
                for (int v = 0; v < 3; v++) {
                    ph[v] += fs[v] / RATE;
                    if (ph[v] >= 1) {
                        ph[v] -= 1;
                    }
                    s += 2 * ph[v] - 1;
                }
                lp += 0.025 * (s - lp);
                double trem = 0.72 + 0.28 * Math.sin(2 * Math.PI * 3.1 * (start + i) / RATE);
                out[(start + i) % N] += (float) (lp * env * trem);
            }
        }
        // kalp atışı: her vuruşta "lub-dub"
        for (int beat = 0; beat < BARS * 4; beat++) {
            for (int k = 0; k < 2; k++) {
                int start = beat * BEAT + (k == 0 ? 0 : (int) (BEAT * 0.3));
                int len = (int) (RATE * 0.25);
                for (int i = 0; i < len; i++) {
                    double t = i / (double) RATE;
                    double env = Math.exp(-t * 14) * (1 - Math.exp(-t / 0.004));
                    out[(start + i) % N] += (float) (Math.sin(2 * Math.PI * (54 - 8 * t) * t) * env * (k == 0 ? 0.9 : 0.6));
                }
            }
        }
        return out;
    }

    // ---------------------------------------------------------------- geliştirme aracı

    /**
     * Dinlemek ve düzeyleri görmek için durumları WAV olarak yazar:
     *   java -cp target/classes com.kule.savunma.MusicEngine muzik
     */
    public static void main(String[] args) throws Exception {
        File dir = new File(args.length > 0 ? args[0] : "muzik");
        dir.mkdirs();
        float[][] L = buildAll();
        layers = L;
        String[] names = {"menu", "calm", "battle", "boss"};
        double[] inten = {0, 0, 0.7, 0.8};
        for (int s = 0; s < names.length; s++) {
            pos = 0;
            java.util.Arrays.fill(gain, 0f);
            setState(names[s], inten[s]);
            System.arraycopy(target, 0, gain, 0, LAYERS);
            setVolume(1.0);
            byte[] pcm = new byte[N * 2];
            float[] mix = new float[441];
            double peak = 0;
            double sum = 0;
            for (int i = 0; i < N; i += 441) {
                int n = Math.min(441, N - i);
                java.util.Arrays.fill(mix, 0f);
                mixInto(mix, n);
                for (int k = 0; k < n; k++) {
                    double x = Math.tanh(mix[k] * 1.15);
                    peak = Math.max(peak, Math.abs(x));
                    sum += x * x;
                    short p = (short) Math.round(x * 32000);
                    pcm[2 * (i + k)] = (byte) (p & 0xFF);
                    pcm[2 * (i + k) + 1] = (byte) ((p >> 8) & 0xFF);
                }
            }
            System.out.printf("%-7s tepe %.2f  rms %.3f%n", names[s], peak, Math.sqrt(sum / N));
            AudioFormat f = new AudioFormat(RATE, 16, 1, true, false);
            AudioInputStream ais = new AudioInputStream(new ByteArrayInputStream(pcm), f, N);
            AudioSystem.write(ais, AudioFileFormat.Type.WAVE, new File(dir, "muzik_" + names[s] + ".wav"));
        }
    }
}
