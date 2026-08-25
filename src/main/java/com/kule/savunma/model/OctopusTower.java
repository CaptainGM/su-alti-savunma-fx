package com.kule.savunma.model;

public class OctopusTower extends Tower {

    public OctopusTower(int id) {
        super(id, "Ahtapot", 220, 10, 1.0, 50);
    }

    @Override
    public boolean canTarget(Enemy enemy) {
        return true;
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
        return "octopus";
    }
}
