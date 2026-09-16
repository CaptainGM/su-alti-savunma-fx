package com.kule.savunma;

import java.io.File;
import java.io.FileNotFoundException;
import java.io.PrintWriter;
import java.nio.file.Paths;

public class LogWriter {

    public void saveLog(String logContent) {
        System.out.println("=== LOGWRITER ÇALIŞIYOR ===");

        String currentDir = System.getProperty("user.dir");
        System.out.println("📁 Mevcut dizin: " + currentDir);

        String projectRoot = Paths.get("").toAbsolutePath().toString();
        System.out.println("📁 Proje kökü: " + projectRoot);

        String fileName = "savunma_gunlugu.txt";
        File outputFile = new File(projectRoot, fileName);

        System.out.println("📄 Hedef dosya: " + outputFile.getAbsolutePath());
        System.out.println("📊 Log uzunluğu: " + logContent.length() + " karakter");

        File parentDir = outputFile.getParentFile();
        System.out.println("📁 Klasör mevcut mu: " + parentDir.exists());
        System.out.println("📁 Klasör yazılabilir mi: " + parentDir.canWrite());

        try (PrintWriter out = new PrintWriter(outputFile)) {
            out.println(logContent);
            System.out.println("✅ DOSYA BAŞARIYLA KAYDEDİLDİ!");
            System.out.println("📍 Tam yol: " + outputFile.getAbsolutePath());

            if (outputFile.exists()) {
                System.out.println("✅ DOSYA OLUŞTU: " + outputFile.length() + " byte");
            } else {
                System.out.println("❌ DOSYA OLUŞMADI!");
            }

        } catch (FileNotFoundException e) {
            System.err.println("❌ HATA: " + e.getMessage());
            e.printStackTrace();

            try {
                File fallbackFile = new File(fileName);
                PrintWriter fallbackOut = new PrintWriter(fallbackFile);
                fallbackOut.println(logContent);
                fallbackOut.close();
                System.out.println("✅ Yedek kayıt başarılı: " + fallbackFile.getAbsolutePath());
            } catch (FileNotFoundException e2) {
                System.err.println("❌ Yedek kayıt da başarısız: " + e2.getMessage());
            }
        }
        System.out.println("=== LOGWRITER TAMAMLANDI ===\n");
    }
}