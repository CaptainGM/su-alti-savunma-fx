package com.kule.savunma.model;

public class StandardEnemy extends Enemy {

    public StandardEnemy(int id) {
        super(id, "Köpek Balığı", 50, 50, 0, 10, 5);
    }

    @Override
    public boolean canFly() {
        return false;
    }

    @Override
    public String getEnemyType() {
        return "standard";
    }
}
