package com.kule.savunma.model;

public class TowerFactory {
    private static int nextId = 1;

    public static Tower createTower(String type) {
        int id = nextId++;

        switch (type.toLowerCase()) {
            case "octopus":
                return new OctopusTower(id);
            case "eel":
                return new EelTower(id);
            case "jellyfish":
                return new JellyfishTower(id);
            default:
                throw new IllegalArgumentException("Bilinmeyen kule türü: " + type);
        }
    }

    public static void resetIdCounter() {
        nextId = 1;
    }
}
