package com.kule.savunma.model;

public abstract class Enemy {
    private int id;
    private String name;
    private double x, y;
    private double health;
    private double maxHealth;
    private double speed;
    private double originalSpeed;
    private int armor;
    private int reward;
    private int damage;
    private boolean isSlowed;
    private double slowTime;
    private double distanceTraveled;

    public Enemy(int id, String name, double maxHealth, double speed, int armor, int reward, int damage) {
        this.id = id;
        this.name = name;
        this.maxHealth = maxHealth;
        this.health = maxHealth;
        this.speed = speed;
        this.originalSpeed = speed;
        this.armor = armor;
        this.reward = reward;
        this.damage = damage;
        this.isSlowed = false;
        this.slowTime = 0;
        this.distanceTraveled = 0;
    }

    public abstract boolean canFly();

    public abstract String getEnemyType();

    public double calculateDamageReceived(double baseDamage, String towerType) {
        double dmg = baseDamage;
        double armorReduction = armor / (armor + 100.0);
        dmg = dmg * (1 - armorReduction);
        return dmg;
    }

    public boolean takeDamage(double damage, String towerType) {
        double actualDamage = calculateDamageReceived(damage, towerType);
        this.health -= actualDamage;
        return this.health <= 0;
    }

    public void applySlowEffect(double factor, double duration) {
        this.speed = this.originalSpeed * factor;
        this.slowTime = duration;
        this.isSlowed = true;
    }

    public void update(double deltaTime) {
        if (slowTime > 0) {
            slowTime -= deltaTime;
            if (slowTime <= 0) {
                speed = originalSpeed;
                isSlowed = false;
            }
        }
        distanceTraveled += speed * deltaTime;
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

    public double getHealth() {
        return health;
    }

    public double getMaxHealth() {
        return maxHealth;
    }

    public double getSpeed() {
        return speed;
    }

    public int getArmor() {
        return armor;
    }

    public int getReward() {
        return reward;
    }

    public int getDamage() {
        return damage;
    }

    public boolean isSlowed() {
        return isSlowed;
    }

    public double getDistanceTraveled() {
        return distanceTraveled;
    }

    public boolean isDead() {
        return health <= 0;
    }

    @Override
    public String toString() {
        return String.format("%s-ID%03d (Can: %.0f/%.0f, Zırh: %d)", name, id, health, maxHealth, armor);
    }
}
