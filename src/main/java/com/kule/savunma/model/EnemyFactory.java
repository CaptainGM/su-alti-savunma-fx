package com.kule.savunma.model;

public class EnemyFactory {
    private static int nextId = 1;

    public static Enemy createEnemy(String type) {
        int id = nextId++;

        switch (type.toLowerCase()) {
            case "standard":
                return new StandardEnemy(id);
            case "armored":
                return new ArmoredEnemy(id);
            case "flying":
                return new FlyingEnemy(id);
            default:
                throw new IllegalArgumentException("Bilinmeyen düşman türü: " + type);
        }
    }

    public static void resetIdCounter() {
        nextId = 1;
    }
}
