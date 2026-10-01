package com.kule.savunma;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;

/**
 * Ayarları ve harita rekorlarını kullanıcı klasöründe (~/.su-alti-savunma/kayit.json) saklar.
 * İçerik JavaScript tarafında üretilen JSON metnidir, Java yalnızca dosyaya yazar ve okur.
 */
public class SaveStore {

    private final Path file = Paths.get(System.getProperty("user.home"), ".su-alti-savunma", "kayit.json");

    public String read() {
        try {
            if (Files.exists(file)) {
                return Files.readString(file, StandardCharsets.UTF_8);
            }
        } catch (IOException e) {
            System.out.println("Kayit okunamadi: " + e.getMessage());
        }
        return null;
    }

    public void write(String json) {
        try {
            Files.createDirectories(file.getParent());
            Files.writeString(file, json, StandardCharsets.UTF_8);
        } catch (IOException e) {
            System.out.println("Kayit yazilamadi: " + e.getMessage());
        }
    }
}
