package com.kule.savunma.model;

public class JellyfishTower extends Tower {
    private double slowFactor = 0.5;
    private double slowDuration = 3.0;

    public JellyfishTower(int id) {
        super(id, "Deniz Anası", 200, 15, 2.0, 70);
    }

    @Override
    public boolean canTarget(Enemy enemy) {
        return true;
    }

    @Override
    public void attack(Enemy enemy) {
        if (canFire() && isInRange(enemy) && canTarget(enemy)) {
            enemy.takeDamage(getDamage(), getTowerType());
            enemy.applySlowEffect(slowFactor, slowDuration);
            resetFireTimer();
        }
    }

    @Override
    public String getTowerType() {
        return "jellyfish";
    }

    public double getSlowFactor() {
        return slowFactor;
    }

    public double getSlowDuration() {
        return slowDuration;
    }
}
