package com.kule.savunma.model;

public abstract class Tower {
    private int id;
    private String name;
    private double x, y;
    private double range;
    private double damage;
    private double fireRate;
    private int cost;
    private double lastFireTime;
    private Enemy target;

    public Tower(int id, String name, double range, double damage, double fireRate, int cost) {
        this.id = id;
        this.name = name;
        this.range = range;
        this.damage = damage;
        this.fireRate = fireRate;
        this.cost = cost;
        this.lastFireTime = 0;
        this.target = null;
    }

    public abstract boolean canTarget(Enemy enemy);

    public abstract void attack(Enemy enemy);

    public abstract String getTowerType();

    public boolean isInRange(Enemy enemy) {
        double dx = this.x - enemy.getX();
        double dy = this.y - enemy.getY();
        double distance = Math.sqrt(dx * dx + dy * dy);
        return distance <= range;
    }

    public void update(double deltaTime) {
        lastFireTime += deltaTime;
    }

    public boolean canFire() {
        return lastFireTime >= fireRate;
    }

    public void resetFireTimer() {
        lastFireTime = 0;
    }

    public int getId() {
        return id;
    }

    public String getName() {
        return name;
    }

    public double getX() {
        return x;
    }

    public void setX(double x) {
        this.x = x;
    }

    public double getY() {
        return y;
    }

    public void setY(double y) {
        this.y = y;
    }

    public double getRange() {
        return range;
    }

    public double getDamage() {
        return damage;
    }

    public double getFireRate() {
        return fireRate;
    }

    public int getCost() {
        return cost;
    }

    public Enemy getTarget() {
        return target;
    }

    public void setTarget(Enemy target) {
        this.target = target;
    }

    @Override
    public String toString() {
        return String.format("%s-ID%03d (Menzil: %.0f, Hasar: %.0f)", name, id, range, damage);
    }
}
