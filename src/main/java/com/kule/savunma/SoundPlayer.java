package com.kule.savunma;

import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.ConcurrentLinkedQueue;
import javax.sound.sampled.AudioFormat;
import javax.sound.sampled.AudioSystem;
import javax.sound.sampled.SourceDataLine;

/**
 * Tek bir ses hattı üzerinde çalışan yazılımsal mikser.
 *
 * Eskiden her ses için ayrı hat açılıyordu; çok sesli savaşlarda hem gecikme hem kısık/kesik ses sorunu vardı.
 * Şimdi hat bir kez açılır, çalan tüm sesler 10 ms'lik parçalar hâlinde toplanır ve yumuşak sınırlayıcıdan geçirilir.
 */
public class SoundPlayer {

    private static final int RATE = SoundBank.RATE;
    private static final int CHUNK = 441;            // 10 ms
    private static final int MAX_VOICES = 28;

    private static final class Voice {
        final float[] data;
        final float gain;
        int pos;

        Voice(float[] data, float gain) {
            this.data = data;
            this.gain = gain;
        }
    }

    private static final ConcurrentLinkedQueue<Voice> PENDING = new ConcurrentLinkedQueue<>();
    private static volatile boolean started;
    private static volatile boolean broken;
    private static volatile boolean windowActive = true;   // pencere öndeyse ve küçültülmemişse true

    /** Hattı ve ses bankasını arka planda hazırlar. Açılışta bir kez çağrılır. */
    public static synchronized void init() {
        if (started) {
            return;
        }
        started = true;
        Thread t = new Thread(SoundPlayer::run, "ses-mikseri");
        t.setDaemon(true);
        t.setPriority(Thread.MAX_PRIORITY - 1);
        t.start();
    }

    /**
     * Pencere öndeyken true, küçültülünce ya da başka pencereye geçilince false verilir: oyun arka plandayken ne müzik ne
     * efekt çalar. Ses kısa bir geçişle kısılır, müzik kaldığı yerden devam eder.
     */
    public static void setWindowActive(boolean on) {
        windowActive = on;
        if (!on) {
            PENDING.clear();
        }
    }

    /** Hazır bir sesi çalar. volume: 0..~1.5 (ayarlardaki ses düzeyi). */
    public static void playSfx(String name, double volume) {
        if (broken || volume <= 0 || !windowActive) {
            return;
        }
        init();
        float[] data = SoundBank.get(name);
        if (data == null) {
            return;
        }
        PENDING.add(new Voice(data, (float) volume));
    }

    /** Eski arayüz: tek bir ton çalar (artık oyun kullanmıyor, geriye dönük uyumluluk için duruyor). */
    public static void play(double freqStart, double freqEnd, int durationMs, String waveType, double volume) {
        init();
        int n = (int) (RATE * durationMs / 1000.0);
        float[] d = new float[n];
        double dur = durationMs / 1000.0;
        for (int i = 0; i < n; i++) {
            double t = i / (double) RATE;
            double progress = t / dur;
            double freq = freqStart * Math.pow(freqEnd / freqStart, progress);
            double ph = freq * t;
            double frac = ph - Math.floor(ph + 0.5);
            double w;
            switch (waveType) {
                case "square":
                    w = Math.signum(Math.sin(2 * Math.PI * ph));
                    break;
                case "sawtooth":
                    w = 2 * frac;
                    break;
                case "triangle":
                    w = 4 * Math.abs(frac) - 1;
                    break;
                default:
                    w = Math.sin(2 * Math.PI * ph);
            }
            d[i] = (float) (w * Math.exp(-3.0 * progress));
        }
        PENDING.add(new Voice(d, (float) Math.min(1.0, volume * 4)));
    }

    private static void run() {
        SoundBank.buildAll();
        MusicEngine.init();                 // müzik arka planda üretilir, hazır olunca karışıma girer
        AudioFormat format = new AudioFormat(RATE, 16, 1, true, false);
        SourceDataLine line;
        try {
            line = AudioSystem.getSourceDataLine(format);
            line.open(format, CHUNK * 2 * 8);
            line.start();
        } catch (Exception e) {
            System.out.println("Ses cihazi acilamadi, oyun sessiz calisacak: " + e.getMessage());
            broken = true;
            return;
        }

        List<Voice> active = new ArrayList<>();
        float[] mix = new float[CHUNK];
        byte[] out = new byte[CHUNK * 2];
        byte[] silence = new byte[CHUNK * 2];
        float master = 1f;                  // pencere arka plana geçince 0'a iner, öne gelince 1'e çıkar

        while (true) {
            float goal = windowActive ? 1f : 0f;
            if (master == 0f && goal == 0f) {
                // arka plan: hiçbir şey çalmaz, müzik de ilerlemez; hat sessizlikle beslenir
                PENDING.clear();
                active.clear();
                line.write(silence, 0, silence.length);
                continue;
            }
            float from = master;
            master += Math.max(-1f / 15f, Math.min(1f / 15f, goal - master));   // ~150 ms'lik geçiş
            Voice v;
            while ((v = PENDING.poll()) != null) {
                if (active.size() >= MAX_VOICES) {
                    active.remove(0);    // en eskisini kes
                }
                active.add(v);
            }

            java.util.Arrays.fill(mix, 0f);
            for (int k = active.size() - 1; k >= 0; k--) {
                Voice a = active.get(k);
                int len = Math.min(CHUNK, a.data.length - a.pos);
                for (int i = 0; i < len; i++) {
                    mix[i] += a.data[a.pos + i] * a.gain;
                }
                a.pos += len;
                if (a.pos >= a.data.length) {
                    active.remove(k);
                }
            }

            MusicEngine.mixInto(mix, CHUNK);

            for (int i = 0; i < CHUNK; i++) {
                // yumuşak sınırlayıcı: üst üste binen sesler bozulmadan toplanır
                double s = Math.tanh(mix[i] * 1.15 * (from + (master - from) * i / CHUNK));
                short pcm = (short) Math.round(s * 32000);
                out[2 * i] = (byte) (pcm & 0xFF);
                out[2 * i + 1] = (byte) ((pcm >> 8) & 0xFF);
            }
            line.write(out, 0, out.length);
        }
    }
}
