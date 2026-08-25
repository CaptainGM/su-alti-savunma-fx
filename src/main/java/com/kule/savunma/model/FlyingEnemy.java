package com.kule.savunma.model;

public class FlyingEnemy extends Enemy {

    public FlyingEnemy(int id) {
        super(id, "Vatoz", 50, 75, 0, 15, 5);
    }

    @Override
    public boolean canFly() {
        return true;
    }

    @Override
    public String getEnemyType() {
        return "flying";
    }
}
