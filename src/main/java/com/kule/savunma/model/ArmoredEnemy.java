package com.kule.savunma.model;

public class ArmoredEnemy extends Enemy {

    public ArmoredEnemy(int id) {
        super(id, "Istakoz", 75, 25, 75, 20, 10);
    }

    @Override
    public boolean canFly() {
        return false;
    }

    @Override
    public String getEnemyType() {
        return "armored";
    }

    @Override
    public double calculateDamageReceived(double baseDamage, String towerType) {
        double dmg = baseDamage;
        if ("octopus".equals(towerType)) {
            dmg *= 0.5;
        }
        double armorReduction = getArmor() / (getArmor() + 100.0);
        return dmg * (1 - armorReduction);
    }
}
