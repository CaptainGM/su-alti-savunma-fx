package com.kule.savunma;

import java.io.IOException;
import java.nio.file.AtomicMoveNotSupportedException;
import java.nio.file.StandardCopyOption;
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

    /** Önce geçici dosyaya yazılıp yerine taşınır: yazma sırasında kapanma ayarları bozmaz. */
    public synchronized void write(String json) {
        try {
            Files.createDirectories(file.getParent());
            Path tmp = file.resolveSibling(file.getFileName() + ".tmp");
            Files.writeString(tmp, json, StandardCharsets.UTF_8);
            try {
                Files.move(tmp, file, StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE);
            } catch (AtomicMoveNotSupportedException e) {
                Files.move(tmp, file, StandardCopyOption.REPLACE_EXISTING);
            }
        } catch (IOException e) {
            System.out.println("Kayit yazilamadi: " + e.getMessage());
        }
    }
}
