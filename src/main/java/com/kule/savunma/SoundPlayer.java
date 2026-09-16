package com.kule.savunma;

import javax.sound.sampled.AudioFormat;
import javax.sound.sampled.AudioSystem;
import javax.sound.sampled.SourceDataLine;

public class SoundPlayer {
    private static final int SAMPLE_RATE = 44100;

    public static void play(double freqStart, double freqEnd, int durationMs, String waveType, double volume) {
        new Thread(() -> {
            try {
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
        }).start();
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
