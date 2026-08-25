package com.kule.savunma.model;

public class EelTower extends Tower {
    private double areaRadius = 50;

    public EelTower(int id) {
        super(id, "Yılan Balığı", 180, 20, 3.0, 75);
    }

    @Override
    public boolean canTarget(Enemy enemy) {
        return !enemy.canFly();
    }

    @Override
    public void attack(Enemy enemy) {
        if (canFire() && isInRange(enemy) && canTarget(enemy)) {
            enemy.takeDamage(getDamage(), getTowerType());
            resetFireTimer();
        }
    }

    @Override
    public String getTowerType() {
        return "eel";
    }

    public double getAreaRadius() {
        return areaRadius;
    }
}
