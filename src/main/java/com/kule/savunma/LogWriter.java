package com.kule.savunma;

import java.io.BufferedWriter;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.StandardOpenOption;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;

/**
 * Oyun günlüğünü loglar/ klasörüne yazar. Her oyun için ayrı bir dosya açılır:
 * loglar/Mercan-Kanali_2026-10-01_18-45-49.txt gibi (harita adı + başlangıç tarihi).
 * Oyun boyunca satırlar bu dosyaya akar; arayüzde gösterilmez.
 */
public class LogWriter {

    private static final DateTimeFormatter STAMP = DateTimeFormatter.ofPattern("yyyy-MM-dd_HH-mm-ss");

    private final Path dir = Paths.get(System.getProperty("user.dir"), "loglar");
    private BufferedWriter out;

    /** Yeni bir oyun günlüğü başlatır; öncekinin açık kalmış dosyası varsa kapatır. */
    public synchronized void start(String title) {
        close();
        try {
            Files.createDirectories(dir);
            Path file = dir.resolve(safeName(title) + "_" + LocalDateTime.now().format(STAMP) + ".txt");
            out = Files.newBufferedWriter(file, StandardCharsets.UTF_8, StandardOpenOption.CREATE, StandardOpenOption.APPEND);
            out.write("=== SU ALTI SAVUNMA - OYUN GÜNLÜĞÜ ===");
            out.newLine();
            out.write(title);
            out.newLine();
            out.write("======================================");
            out.newLine();
            out.flush();
            System.out.println("Gunluk dosyasi: " + file);
        } catch (IOException e) {
            System.err.println("Gunluk dosyasi acilamadi: " + e.getMessage());
            out = null;
        }
    }

    /** Günlüğe bir ya da birden çok satır ekler. */
    public synchronized void append(String text) {
        if (out == null) {
            return;
        }
        try {
            out.write(text);
            out.newLine();
            out.flush();
        } catch (IOException e) {
            System.err.println("Gunluge yazilamadi: " + e.getMessage());
        }
    }

    public synchronized void close() {
        if (out == null) {
            return;
        }
        try {
            out.close();
        } catch (IOException e) {
            // kapanırken oluşan hata önemsiz
        }
        out = null;
    }

    /** Dosya adı için Türkçe harfleri sadeleştirir, geçersiz karakterleri atar. */
    static String safeName(String title) {
        String s = title.replaceAll("\\(.*?\\)", "").trim()
                .replace('ç', 'c').replace('Ç', 'C').replace('ğ', 'g').replace('Ğ', 'G')
                .replace('ı', 'i').replace('İ', 'I').replace('ö', 'o').replace('Ö', 'O')
                .replace('ş', 's').replace('Ş', 'S').replace('ü', 'u').replace('Ü', 'U');
        s = s.replaceAll("[^A-Za-z0-9]+", "-").replaceAll("^-+|-+$", "");
        return s.isEmpty() ? "oyun" : s;
    }
}
