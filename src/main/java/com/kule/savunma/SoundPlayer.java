package com.kule.savunma;

import javax.sound.sampled.AudioFormat;
import javax.sound.sampled.AudioSystem;
import javax.sound.sampled.SourceDataLine;
import java.util.Map;
import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.TimeUnit;

public class SoundPlayer {
    private static final int SAMPLE_RATE = 44100;

    // Aynı anda en fazla 3 ses çalar, kuyruk dolarsa yeni sesler atlanır.
    // (Her atışta yeni thread açmak çok kuleli oyunlarda ses kartını boğuyordu.)
    private static final ExecutorService POOL = new ThreadPoolExecutor(
            3, 3, 0L, TimeUnit.MILLISECONDS,
            new ArrayBlockingQueue<>(6),
            r -> {
                Thread t = new Thread(r, "ses");
                t.setDaemon(true);
                return t;
            },
            new ThreadPoolExecutor.DiscardPolicy());

    // Aynı parametreli sesler tekrar tekrar üretilmesin
    private static final Map<String, byte[]> CACHE = new ConcurrentHashMap<>();

    public static void play(double freqStart, double freqEnd, int durationMs, String waveType, double volume) {
        POOL.execute(() -> {
            try {
                String key = freqStart + "|" + freqEnd + "|" + durationMs + "|" + waveType + "|" + volume;
                byte[] buffer = CACHE.computeIfAbsent(key,
                        k -> generate(freqStart, freqEnd, durationMs, waveType, volume));

                AudioFormat format = new AudioFormat(SAMPLE_RATE, 16, 1, true, false);
                try (SourceDataLine line = AudioSystem.getSourceDataLine(format)) {
                    line.open(format);
                    line.start();
                    line.write(buffer, 0, buffer.length);
                    line.drain();
                }
            } catch (Exception e) {
                System.out.println("Ses calma hatasi: " + e.getMessage());
            }
        });
    }

    private static byte[] generate(double freqStart, double freqEnd, int durationMs, String waveType, double volume) {
        double durationSec = durationMs / 1000.0;
        int numSamples = (int) (SAMPLE_RATE * durationSec);
        byte[] buffer = new byte[numSamples * 2];

        for (int i = 0; i < numSamples; i++) {
            double t = i / (double) SAMPLE_RATE;
            double progress = t / durationSec;
            double freq = freqStart * Math.pow(freqEnd / freqStart, progress);
            double envelope = Math.exp(-3.0 * progress);
            double sample = wave(waveType, freq, t) * volume * envelope;

            short pcm = (short) (Math.max(-1.0, Math.min(1.0, sample)) * Short.MAX_VALUE);
            buffer[2 * i] = (byte) (pcm & 0xFF);
            buffer[2 * i + 1] = (byte) ((pcm >> 8) & 0xFF);
        }
        return buffer;
    }

    private static double wave(String type, double freq, double t) {
        double phase = freq * t;
        double frac = phase - Math.floor(phase + 0.5);

        switch (type) {
            case "square":
                return Math.signum(Math.sin(2 * Math.PI * phase));
            case "sawtooth":
                return 2 * frac;
            case "triangle":
                return 4 * Math.abs(frac) - 1;
            default:
                return Math.sin(2 * Math.PI * phase);
        }
    }
}
