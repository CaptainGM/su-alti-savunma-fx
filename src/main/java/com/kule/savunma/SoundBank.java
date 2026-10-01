package com.kule.savunma;

import java.io.ByteArrayInputStream;
import java.io.File;
import java.io.IOException;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Random;
import javax.sound.sampled.AudioFileFormat;
import javax.sound.sampled.AudioFormat;
import javax.sound.sampled.AudioInputStream;
import javax.sound.sampled.AudioSystem;

/**
 * Oyun seslerini kodla üretir (44.1 kHz, mono). Dışarıdan ses dosyası gerekmez.
 *
 * Her ses birkaç katmandan oluşur: alçak frekanslı "tok" vuruş (sinüs, hızla düşen perde),
 * filtrelenmiş gürültü patlaması ve gerekirse ton ya da yankı. Sesler üretildikten sonra
 * en yüksek değere göre normalize edilir ve {@link #LEVEL} tablosundaki seviyeyle çarpılır.
 *
 * Geliştirme sırasında tüm sesleri WAV olarak yazmak için:
 *   java -cp target/classes com.kule.savunma.SoundBank hedef-klasor
 */
public final class SoundBank {

    public static final int RATE = 44100;
    private static final double TWO_PI = 2 * Math.PI;

    /**
     * Her sesin hedef ses düzeyi (dBFS, insan kulağına göre A-ağırlıklı ortalama).
     * Tepe değeri yerine algıya göre normalize edilir; böylece alçak frekanslı sesler kulaklıkta da "kısık" kalmaz.
     * Dengeyi buradan ayarlayabilirsiniz (yüksek sayı = daha sesli, ör. -18 > -24).
     */
    private static final Map<String, Double> LEVEL = new LinkedHashMap<>();

    /** Tüm seslerin birlikte kısılması/açılması için (dB). Ayarlardaki ses çubuğu bunun üstüne uygulanır. */
    private static final double MASTER_DB = -5.5;

    static {
        LEVEL.put("fire_octopus", -22.0);
        LEVEL.put("fire_eel", -22.0);
        LEVEL.put("fire_jellyfish", -23.0);
        LEVEL.put("fire_swordfish", -19.5);
        LEVEL.put("fire_puffer", -20.0);
        LEVEL.put("fire_angler", -23.0);
        LEVEL.put("splash", -19.0);
        LEVEL.put("hit", -31.0);
        LEVEL.put("kill", -23.5);
        LEVEL.put("boss_kill", -16.0);
        LEVEL.put("leak", -17.5);
        LEVEL.put("build", -23.5);
        LEVEL.put("upgrade", -23.0);
        LEVEL.put("sell", -26.0);
        LEVEL.put("wave_start", -21.0);
        LEVEL.put("wave_clear", -22.0);
        LEVEL.put("boss_warn", -18.5);
        LEVEL.put("boss_warn_mini", -20.5);
        LEVEL.put("heartbeat", -27.0);
        LEVEL.put("roar", -17.0);
        LEVEL.put("win", -21.0);
        LEVEL.put("lose", -21.0);
        LEVEL.put("click", -33.0);
        LEVEL.put("gong", -21.0);
        LEVEL.put("rumble", -22.0);
        LEVEL.put("eruption", -16.0);
        LEVEL.put("wind", -23.0);
        LEVEL.put("zap_small", -27.0);
    }

    private static final Map<String, float[]> BANK = new LinkedHashMap<>();

    private SoundBank() {
    }

    public static synchronized void buildAll() {
        if (!BANK.isEmpty()) {
            return;
        }
        for (String name : LEVEL.keySet()) {
            BANK.put(name, build(name));
        }
    }

    public static synchronized float[] get(String name) {
        return BANK.get(name);
    }

    // ------------------------------------------------------------------ sesler

    private static float[] build(String name) {
        Random r = new Random(name.hashCode());
        float[] b;
        switch (name) {
            case "fire_octopus":
                // mürekkep topu: kısa, yumuşak "tok"
                b = new float[ms(260)];
                thump(b, 0, 240, 85, 0.14, 24, 1.0);
                thump(b, 0, 110, 66, 0.18, 18, 0.45);
                thump(b, 0, 520, 190, 0.05, 55, 0.55);
                noise(b, 0, 0.035, 2800, 250, 110, 0.55, r);
                tone(b, 0, 640, 0.05, 0.18, 0.001, 55, 2, 1.2);
                break;
            case "fire_eel":
                // elektrik: çatırdayan gürültü + düşen testere + alçak vuruş
                b = new float[ms(520)];
                noise(b, 0, 0.30, 7000, 900, 8, 0.7, r);
                amplitudeMod(b, 0, 0.30, 58, 0.75);
                sweep(b, 0, 2200, 150, 0.24, 0.30, true);
                thump(b, 0, 190, 72, 0.3, 11, 0.85);
                thump(b, 0, 480, 160, 0.06, 45, 0.45);
                tone(b, 0.02, 1200, 0.08, 0.12, 0.001, 30, 3, 0.8);
                break;
            case "fire_jellyfish":
                // su baloncuğu: yükselen "bloop" + alçak dolgu
                b = new float[ms(360)];
                sweep(b, 0, 300, 880, 0.15, 0.65, false);
                sweep(b, 0.0, 600, 1760, 0.15, 0.16, false);
                thump(b, 0, 200, 80, 0.16, 20, 0.65);
                noise(b, 0.13, 0.05, 4500, 1200, 60, 0.18, r);
                break;
            case "fire_swordfish":
                // keskin nişancı: çatlak + hışırtı + derin tepme
                b = new float[ms(620)];
                noise(b, 0, 0.012, 14000, 3000, 260, 1.0, r);
                noise(b, 0, 0.24, 9500, 1200, 11, 0.55, r);
                thump(b, 0, 230, 62, 0.34, 11, 1.0);
                thump(b, 0, 115, 50, 0.40, 9, 0.5);
                thump(b, 0, 640, 210, 0.06, 45, 0.6);
                sweep(b, 0.0, 3000, 420, 0.16, 0.22, false);
                echo(b, 0.11, 0.28, 2);
                break;
            case "fire_angler":
                // fener balığı: yumuşak çıngırak + tok vuruş
                b = new float[ms(380)];
                thump(b, 0, 220, 80, 0.13, 22, 0.9);
                thump(b, 0, 540, 190, 0.05, 55, 0.45);
                tone(b, 0.01, 987.8, 0.3, 0.32, 0.002, 12, 4, 1.4);
                tone(b, 0.01, 1480, 0.2, 0.14, 0.002, 16, 2, 1.3);
                break;
            case "fire_puffer":
                // havan: boğuk "pomf" + hava
                b = new float[ms(420)];
                thump(b, 0, 160, 52, 0.26, 14, 1.0);
                thump(b, 0.0, 78, 42, 0.3, 11, 0.55);
                thump(b, 0, 420, 150, 0.07, 35, 0.5);
                noise(b, 0, 0.14, 1000, 70, 22, 0.55, r);
                sweep(b, 0.02, 180, 420, 0.1, 0.18, false);
                break;
            case "splash":
                // havan patlaması: derin gümbürtü
                b = new float[ms(900)];
                thump(b, 0, 120, 34, 0.55, 7, 1.0);
                thump(b, 0.0, 66, 32, 0.6, 6, 0.6);
                thump(b, 0, 300, 90, 0.12, 22, 0.55);
                noise(b, 0, 0.5, 1500, 60, 6.5, 0.85, r);
                noise(b, 0.0, 0.03, 8000, 1500, 150, 0.5, r);
                echo(b, 0.09, 0.30, 2);
                break;
            case "hit":
                b = new float[ms(110)];
                thump(b, 0, 280, 120, 0.06, 55, 0.8);
                noise(b, 0, 0.025, 3200, 500, 150, 0.45, r);
                break;
            case "kill":
                b = new float[ms(300)];
                thump(b, 0, 230, 72, 0.18, 22, 1.0);
                thump(b, 0, 560, 200, 0.05, 55, 0.5);
                noise(b, 0, 0.09, 1900, 140, 38, 0.5, r);
                sweep(b, 0, 520, 180, 0.09, 0.22, false);
                break;
            case "boss_kill":
                // patronun çöküşü: büyük patlama, alçalan homurtu, yankı
                b = new float[ms(3200)];
                thump(b, 0, 150, 34, 1.1, 5, 1.0);
                thump(b, 0.05, 80, 32, 1.2, 4.5, 0.7);
                thump(b, 0, 380, 110, 0.18, 20, 0.6);
                noise(b, 0, 0.9, 900, 40, 3.8, 0.8, r);
                sweep(b, 0.05, 420, 38, 0.9, 0.38, true);
                noise(b, 0, 0.02, 9000, 2000, 120, 0.6, r);
                echo(b, 0.21, 0.42, 5);
                break;
            case "leak":
                // üs hasar aldı: ağır, tehditkâr darbe
                b = new float[ms(1100)];
                thump(b, 0, 170, 40, 0.7, 6, 1.0);
                thump(b, 0.0, 85, 36, 0.8, 5, 0.7);
                thump(b, 0, 420, 120, 0.14, 24, 0.6);
                sweep(b, 0, 320, 70, 0.55, 0.55, true);
                noise(b, 0, 0.26, 700, 40, 12, 0.7, r);
                echo(b, 0.14, 0.32, 3);
                break;
            case "build":
                // taş yerleştirme: "tok" + kısa tık
                b = new float[ms(300)];
                thump(b, 0, 250, 90, 0.12, 30, 0.9);
                noise(b, 0, 0.06, 2600, 350, 70, 0.55, r);
                tone(b, 0.015, 1320, 0.14, 0.16, 0.001, 26, 3, 1.1);
                break;
            case "upgrade":
                // yükselen üç nota
                b = new float[ms(700)];
                tone(b, 0.00, 523.25, 0.30, 0.45, 0.004, 9, 4, 1.4);
                tone(b, 0.07, 659.25, 0.30, 0.45, 0.004, 9, 4, 1.4);
                tone(b, 0.14, 783.99, 0.40, 0.50, 0.004, 8, 4, 1.4);
                thump(b, 0, 160, 70, 0.14, 24, 0.6);
                echo(b, 0.12, 0.25, 2);
                break;
            case "sell":
                b = new float[ms(380)];
                tone(b, 0, 1760, 0.22, 0.4, 0.001, 22, 2, 1.5);
                tone(b, 0.06, 2349, 0.26, 0.4, 0.001, 20, 2, 1.5);
                noise(b, 0, 0.02, 8000, 2500, 160, 0.3, r);
                thump(b, 0, 200, 110, 0.06, 40, 0.3);
                break;
            case "wave_start":
                // boru sesi: alçak ve geniş
                b = new float[ms(1700)];
                brass(b, 0.00, 98.0, 0.9, 0.9);
                brass(b, 0.20, 147.0, 0.85, 0.75);
                thump(b, 0, 110, 45, 0.3, 10, 0.8);
                echo(b, 0.18, 0.3, 3);
                break;
            case "wave_clear":
                b = new float[ms(1500)];
                tone(b, 0.00, 523.25, 0.5, 0.4, 0.006, 5, 5, 1.3);
                tone(b, 0.10, 659.25, 0.5, 0.4, 0.006, 5, 5, 1.3);
                tone(b, 0.20, 783.99, 0.5, 0.4, 0.006, 5, 5, 1.3);
                tone(b, 0.30, 1046.5, 0.8, 0.45, 0.006, 4, 5, 1.3);
                thump(b, 0, 130, 60, 0.2, 14, 0.55);
                echo(b, 0.16, 0.3, 3);
                break;
            case "boss_warn":
                b = bossWarning(r, 4.2, 5);
                break;
            case "boss_warn_mini":
                b = bossWarning(r, 2.4, 3);
                break;
            case "heartbeat":
                // gerilim: "lub-dub"
                b = new float[ms(520)];
                thump(b, 0.00, 112, 56, 0.2, 13, 1.0);
                thump(b, 0.00, 330, 120, 0.07, 40, 0.5);
                thump(b, 0.23, 98, 52, 0.18, 14, 0.75);
                thump(b, 0.23, 290, 110, 0.06, 40, 0.4);
                break;
            case "roar":
                b = new float[ms(1500)];
                roar(b, 0.0, 1.2, 0.9, r);
                thump(b, 0, 120, 40, 0.4, 8, 0.8);
                echo(b, 0.17, 0.3, 2);
                break;
            case "win":
                b = new float[ms(3000)];
                brass(b, 0.00, 261.6, 0.6, 0.6);
                brass(b, 0.18, 329.6, 0.6, 0.6);
                brass(b, 0.36, 392.0, 0.6, 0.6);
                brass(b, 0.60, 523.3, 1.6, 0.8);
                tone(b, 0.60, 1046.5, 1.2, 0.2, 0.01, 2.5, 3, 1.5);
                thump(b, 0.6, 120, 50, 0.3, 10, 0.7);
                echo(b, 0.24, 0.35, 4);
                break;
            case "lose":
                b = new float[ms(3000)];
                brass(b, 0.00, 220.0, 0.9, 0.7);
                brass(b, 0.45, 174.6, 0.9, 0.7);
                brass(b, 0.90, 130.8, 1.7, 0.8);
                sweep(b, 0.9, 140, 40, 1.4, 0.3, true);
                thump(b, 0.9, 100, 28, 0.9, 5, 0.9);
                echo(b, 0.27, 0.4, 4);
                break;
            case "click":
                b = new float[ms(80)];
                noise(b, 0, 0.01, 6000, 1500, 250, 0.5, r);
                tone(b, 0, 900, 0.04, 0.35, 0.001, 70, 2, 1.2);
                break;
            case "gong":
                // Atlantis koruyucusu: çınlayan tokmak
                b = new float[ms(2200)];
                double[] partials = {1.0, 2.0, 2.76, 4.07, 5.4};
                double[] amps = {1.0, 0.55, 0.45, 0.25, 0.15};
                for (int i = 0; i < partials.length; i++) {
                    tone(b, 0, 98 * partials[i], 2.0, 0.5 * amps[i], 0.003, 2.0 + i * 0.9, 1, 1.0);
                }
                thump(b, 0, 150, 60, 0.3, 10, 0.8);
                noise(b, 0, 0.04, 4000, 500, 80, 0.4, r);
                echo(b, 0.2, 0.3, 3);
                break;
            case "rumble":
                // yanardağ uyarısı: yükselen alçak gürültü
                b = new float[ms(1700)];
                noise(b, 0, 1.4, 260, 25, 0.0, 1.0, r);
                swell(b, 0, 1.4, 1.2, 1.5);
                thump(b, 0.0, 70, 52, 1.4, 1.5, 0.5);
                break;
            case "eruption":
                b = new float[ms(2600)];
                thump(b, 0, 140, 32, 0.9, 5, 1.0);
                thump(b, 0, 75, 30, 1.0, 4, 0.7);
                noise(b, 0, 1.2, 1700, 60, 3.2, 0.85, r);
                noise(b, 0, 0.5, 7000, 900, 5, 0.45, r);
                amplitudeMod(b, 0, 0.5, 31, 0.5);
                echo(b, 0.17, 0.4, 4);
                break;
            case "wind":
                // kar fırtınası: yükselip alçalan rüzgâr
                b = new float[ms(3600)];
                windNoise(b, 0, 3.4, r);
                break;
            case "zap_small":
                b = new float[ms(260)];
                noise(b, 0, 0.12, 6500, 1200, 16, 0.6, r);
                amplitudeMod(b, 0, 0.12, 70, 0.7);
                sweep(b, 0, 1400, 300, 0.1, 0.25, true);
                break;
            default:
                b = new float[ms(100)];
        }
        finish(b, LEVEL.getOrDefault(name, -24.0) + MASTER_DB);
        return b;
    }

    /** Patron uyarısı: alçak uğultu, hızlanan kalp atışı, kükreme ve son darbe. */
    private static float[] bossWarning(Random r, double len, int beats) {
        float[] b = new float[ms((len + 2.4) * 1000)];
        // sürekli alçak uğultu (iki perde arası vuruş yapar)
        int n = (int) (len * RATE);
        double ph1 = 0;
        double ph2 = 0;
        for (int i = 0; i < n; i++) {
            double t = (double) i / RATE;
            double swell = Math.pow(Math.min(1.0, t / (len * 0.8)), 1.6);
            ph1 += TWO_PI * 55.0 / RATE;
            ph2 += TWO_PI * 58.0 / RATE;
            b[i] += (float) ((Math.sin(ph1) + Math.sin(ph2) * 0.9 + Math.sin(ph1 * 2) * 0.55 + Math.sin(ph2 * 3) * 0.3) * swell * 0.55);
        }
        // yükselen gürültü
        noise(b, 0, len, 3200, 200, 0.0, 0.30, r);
        swell(b, 0, len, len * 0.9, 2.2);
        // hızlanan kalp atışı
        for (int k = 0; k < beats; k++) {
            double frac = (double) k / Math.max(1, beats - 1);
            double t = 0.15 + (len - 0.9) * Math.pow(frac, 0.85);
            double a = 0.55 + 0.45 * frac;
            thump(b, t, 110, 50, 0.2, 12, a);
            thump(b, t + 0.22 - 0.05 * frac, 96, 46, 0.18, 13, a * 0.75);
        }
        // kükreme
        roar(b, len * 0.34, len * 0.60, 1.0, r);
        // son darbe
        double hit = len - 0.15;
        thump(b, hit, 130, 32, 0.9, 5, 1.0);
        thump(b, hit, 70, 30, 1.0, 4, 0.7);
        thump(b, hit, 360, 100, 0.2, 18, 0.6);
        noise(b, hit, 0.6, 1100, 40, 5, 0.8, r);
        echo(b, 0.24, 0.45, 5);
        return b;
    }

    // ------------------------------------------------------------------ yapı taşları

    private static int ms(double ms) {
        return (int) (ms * RATE / 1000.0);
    }

    /** Düşen perdeli sinüs ("tok" vuruş). k: sönüm hızı (1/sn). */
    private static void thump(float[] b, double t0, double f0, double f1, double dur, double k, double amp) {
        int s = (int) (t0 * RATE);
        int n = (int) (dur * RATE);
        double ph = 0;
        double tau = dur * 0.22;
        for (int i = 0; i < n && s + i < b.length; i++) {
            double t = (double) i / RATE;
            double f = f1 + (f0 - f1) * Math.exp(-t / tau);
            ph += TWO_PI * f / RATE;
            double e = (1 - Math.exp(-t / 0.0012)) * Math.exp(-k * t);
            b[s + i] += (float) (Math.sin(ph) * e * amp);
        }
    }

    /** Bant sınırlı gürültü: lp üst, hp alt kesim frekansı. k=0 ise zarf yok (sabit). */
    private static void noise(float[] b, double t0, double dur, double lp, double hp, double k, double amp, Random r) {
        int s = (int) (t0 * RATE);
        int n = (int) (dur * RATE);
        double aLp = 1 - Math.exp(-TWO_PI * lp / RATE);
        double aHp = 1 - Math.exp(-TWO_PI * hp / RATE);
        double comp = Math.min(30.0, Math.sqrt((2 - aLp) / aLp));
        double yl = 0;
        double yh = 0;
        for (int i = 0; i < n && s + i < b.length; i++) {
            double t = (double) i / RATE;
            double x = r.nextGaussian() * 0.45;
            yl += aLp * (x - yl);
            yh += aHp * (yl - yh);
            double v = (yl - yh) * comp;
            double e = (1 - Math.exp(-t / 0.0008)) * (k > 0 ? Math.exp(-k * t) : 1.0);
            b[s + i] += (float) (v * e * amp);
        }
    }

    /** Harmonikli ton. tilt: üst harmoniklerin zayıflama hızı. */
    private static void tone(float[] b, double t0, double f, double dur, double amp, double attack, double k, int harmonics, double tilt) {
        int s = (int) (t0 * RATE);
        int n = (int) (dur * RATE);
        for (int i = 0; i < n && s + i < b.length; i++) {
            double t = (double) i / RATE;
            double e = (1 - Math.exp(-t / attack)) * Math.exp(-k * t);
            double v = 0;
            for (int h = 1; h <= harmonics; h++) {
                v += Math.sin(TWO_PI * f * h * t) / Math.pow(h, tilt);
            }
            b[s + i] += (float) (v * e * amp);
        }
    }

    /** Perde kaydıran ton (testere ya da sinüs). */
    private static void sweep(float[] b, double t0, double f0, double f1, double dur, double amp, boolean saw) {
        int s = (int) (t0 * RATE);
        int n = (int) (dur * RATE);
        double ph = 0;
        for (int i = 0; i < n && s + i < b.length; i++) {
            double t = (double) i / RATE;
            double p = t / dur;
            double f = f0 * Math.pow(f1 / f0, p);
            ph += f / RATE;
            double frac = ph - Math.floor(ph);
            double w = saw ? (2 * frac - 1) * 0.8 : Math.sin(TWO_PI * ph);
            double e = Math.min(1.0, t / 0.004) * Math.pow(1 - p, 1.4);
            b[s + i] += (float) (w * e * amp);
        }
    }

    /** Boru benzeri ton: çok harmonik, yavaş girişli. */
    private static void brass(float[] b, double t0, double f, double dur, double amp) {
        int s = (int) (t0 * RATE);
        int n = (int) (dur * RATE);
        for (int i = 0; i < n && s + i < b.length; i++) {
            double t = (double) i / RATE;
            double vib = 1 + 0.004 * Math.sin(TWO_PI * 5.2 * t);
            double e = (1 - Math.exp(-t / 0.05)) * Math.exp(-1.6 * t / dur * 2.2);
            double v = 0;
            for (int h = 1; h <= 9; h++) {
                v += Math.sin(TWO_PI * f * vib * h * t) / h;
            }
            b[s + i] += (float) (v * e * amp * 0.45);
        }
    }

    /** Kükreme: titreşimli testere + zamanla değişen alçak geçiren filtre + hırıltı. */
    private static void roar(float[] b, double t0, double dur, double amp, Random r) {
        int s = (int) (t0 * RATE);
        int n = (int) (dur * RATE);
        double ph = 0;
        double y1 = 0;
        double y2 = 0;
        for (int i = 0; i < n && s + i < b.length; i++) {
            double t = (double) i / RATE;
            double p = t / dur;
            double f = 58 + 22 * Math.sin(Math.PI * p) + 6 * Math.sin(TWO_PI * 17 * t);
            ph += f / RATE;
            double frac = ph - Math.floor(ph);
            double saw = 2 * frac - 1;
            double grit = r.nextGaussian() * 0.35 * (0.5 + 0.5 * Math.sin(TWO_PI * 31 * t));
            double x = saw + grit;
            double fc = 220 + 1500 * Math.sin(Math.PI * Math.pow(p, 0.8));
            double a = 1 - Math.exp(-TWO_PI * fc / RATE);
            y1 += a * (x - y1);
            y2 += a * (y1 - y2);
            double e = Math.min(1.0, t / 0.25) * Math.pow(1 - p, 0.7);
            b[s + i] += (float) (y2 * e * amp * 1.6);
        }
    }

    /** Rüzgâr: yavaş yükselip alçalan filtreli gürültü. */
    private static void windNoise(float[] b, double t0, double dur, Random r) {
        int s = (int) (t0 * RATE);
        int n = (int) (dur * RATE);
        double y1 = 0;
        double y2 = 0;
        double h1 = 0;
        for (int i = 0; i < n && s + i < b.length; i++) {
            double t = (double) i / RATE;
            double p = t / dur;
            double fc = 350 + 2300 * Math.pow(Math.sin(Math.PI * p), 1.5) * (0.8 + 0.2 * Math.sin(TWO_PI * 0.9 * t));
            double a = 1 - Math.exp(-TWO_PI * fc / RATE);
            double x = r.nextGaussian() * 0.5;
            y1 += a * (x - y1);
            y2 += a * (y1 - y2);
            h1 += 0.004 * (y2 - h1);
            double e = Math.pow(Math.sin(Math.PI * p), 1.3) * (0.75 + 0.25 * Math.sin(TWO_PI * 1.7 * t + 1));
            b[s + i] += (float) ((y2 - h1) * e * 3.0);
        }
    }

    /** Aralıktaki sesi yavaşça yükselen bir zarfla çarpar (uğultu için). */
    private static void swell(float[] b, double t0, double dur, double peakAt, double power) {
        int s = (int) (t0 * RATE);
        int n = (int) (dur * RATE);
        for (int i = 0; i < n && s + i < b.length; i++) {
            double t = (double) i / RATE;
            double e = t < peakAt ? Math.pow(t / peakAt, power) : Math.pow(Math.max(0, 1 - (t - peakAt) / Math.max(0.01, dur - peakAt)), 0.8);
            b[s + i] *= (float) e;
        }
    }

    /** Aralığı belirli bir hızla kare dalga biçiminde keser (elektrik çatırtısı). depth 0..1. */
    private static void amplitudeMod(float[] b, double t0, double dur, double hz, double depth) {
        int s = (int) (t0 * RATE);
        int n = (int) (dur * RATE);
        for (int i = 0; i < n && s + i < b.length; i++) {
            double t = (double) i / RATE;
            double m = Math.sin(TWO_PI * hz * t) > 0 ? 1.0 : 1.0 - depth;
            b[s + i] *= (float) m;
        }
    }

    /** Geri beslemeli yankı (yerinde). Tampon yankının sığacağı kadar uzun olmalı. */
    private static void echo(float[] b, double delay, double feedback, int taps) {
        int d = (int) (delay * RATE);
        float[] src = b.clone();
        double g = 1.0;
        for (int k = 1; k <= taps; k++) {
            g *= feedback;
            int off = d * k;
            for (int i = 0; i + off < b.length; i++) {
                b[i + off] += (float) (src[i] * g);
            }
        }
    }

    /**
     * Sesi A-ağırlıklı hedef düzeye getirir, uçlarını tıklama olmasın diye yumuşatır ve yumuşak doygunluk uygular.
     * Doygunluk üst harmonikler üretir; küçük hoparlör ve kulaklıkta alçak vuruşlar böylece duyulur kalır.
     */
    private static void finish(float[] b, double targetDb) {
        double mean = 0;
        for (float v : b) {
            mean += v;
        }
        mean /= b.length;
        for (int i = 0; i < b.length; i++) {
            b[i] -= (float) mean;
        }
        double ms = aWeightedMeanSquare(b);
        double gain = Math.sqrt(Math.pow(10, targetDb / 10) / Math.max(ms, 1e-12));
        int fadeIn = ms(1.0);
        int fadeOut = Math.min(b.length / 2, ms(14));
        for (int i = 0; i < b.length; i++) {
            double g = gain;
            if (i < fadeIn) {
                g *= (double) i / fadeIn;
            }
            int fromEnd = b.length - 1 - i;
            if (fromEnd < fadeOut) {
                g *= (double) fromEnd / fadeOut;
            }
            b[i] = (float) Math.tanh(b[i] * g);
        }
    }

    private static double aWeight(double f) {
        double f2 = f * f;
        double ra = (12194.0 * 12194.0 * f2 * f2)
                / ((f2 + 20.6 * 20.6) * Math.sqrt((f2 + 107.7 * 107.7) * (f2 + 737.9 * 737.9)) * (f2 + 12194.0 * 12194.0));
        double f1k = 1000.0 * 1000.0;
        double ref = (12194.0 * 12194.0 * f1k * f1k)
                / ((f1k + 20.6 * 20.6) * Math.sqrt((f1k + 107.7 * 107.7) * (f1k + 737.9 * 737.9)) * (f1k + 12194.0 * 12194.0));
        return ra / ref;
    }

    /** A-ağırlıklı ortalama kare; çok kısa sesler 0,35 sn'ye yayılarak ölçülür. */
    private static double aWeightedMeanSquare(float[] x) {
        int n = 1;
        while (n < x.length) {
            n <<= 1;
        }
        double[] re = new double[n];
        double[] im = new double[n];
        for (int i = 0; i < x.length; i++) {
            re[i] = x[i];
        }
        fft(re, im);
        double sum = 0;
        for (int k = 1; k < n / 2; k++) {
            double w = aWeight(k * (double) RATE / n);
            sum += 2 * (re[k] * re[k] + im[k] * im[k]) * w * w;
        }
        double energy = sum / n;
        return energy / Math.max(x.length, 0.35 * RATE);
    }

    private static void fft(double[] re, double[] im) {
        int n = re.length;
        for (int i = 1, j = 0; i < n; i++) {
            int bit = n >> 1;
            for (; (j & bit) != 0; bit >>= 1) {
                j ^= bit;
            }
            j ^= bit;
            if (i < j) {
                double t = re[i];
                re[i] = re[j];
                re[j] = t;
                t = im[i];
                im[i] = im[j];
                im[j] = t;
            }
        }
        for (int len = 2; len <= n; len <<= 1) {
            double ang = -2 * Math.PI / len;
            double wr = Math.cos(ang);
            double wi = Math.sin(ang);
            for (int i = 0; i < n; i += len) {
                double cr = 1;
                double ci = 0;
                for (int k = 0; k < len / 2; k++) {
                    int u = i + k;
                    int v = i + k + len / 2;
                    double xr = re[v] * cr - im[v] * ci;
                    double xi = re[v] * ci + im[v] * cr;
                    re[v] = re[u] - xr;
                    im[v] = im[u] - xi;
                    re[u] += xr;
                    im[u] += xi;
                    double ncr = cr * wr - ci * wi;
                    ci = cr * wi + ci * wr;
                    cr = ncr;
                }
            }
        }
    }

    // ------------------------------------------------------------------ geliştirme aracı

    public static void main(String[] args) throws IOException {
        File dir = new File(args.length > 0 ? args[0] : "sesler");
        dir.mkdirs();
        buildAll();
        AudioFormat fmt = new AudioFormat(RATE, 16, 1, true, false);
        for (Map.Entry<String, float[]> e : BANK.entrySet()) {
            float[] f = e.getValue();
            byte[] pcm = new byte[f.length * 2];
            double sum = 0;
            double peak = 0;
            for (int i = 0; i < f.length; i++) {
                short s = (short) Math.max(-32768, Math.min(32767, Math.round(f[i] * 32767)));
                pcm[2 * i] = (byte) (s & 0xFF);
                pcm[2 * i + 1] = (byte) ((s >> 8) & 0xFF);
                sum += f[i] * f[i];
                peak = Math.max(peak, Math.abs(f[i]));
            }
            double rms = Math.sqrt(sum / f.length);
            long hot = 0;
            for (float v : f) {
                if (Math.abs(v) > 0.9) {
                    hot++;
                }
            }
            AudioInputStream in = new AudioInputStream(new ByteArrayInputStream(pcm), fmt, f.length);
            AudioSystem.write(in, AudioFileFormat.Type.WAVE, new File(dir, e.getKey() + ".wav"));
            System.out.printf("%-16s %5.2f sn  tepe %.2f  rms %.1f dBFS  A-agirlikli %.1f dB  >0.9: %%%.2f%n", e.getKey(), f.length / (double) RATE,
                    peak, 20 * Math.log10(rms), 10 * Math.log10(aWeightedMeanSquare(f)), 100.0 * hot / f.length);
        }
    }
}
