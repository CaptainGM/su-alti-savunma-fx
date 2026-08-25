package com.kule.savunma.model;

import java.util.ArrayList;
import java.util.List;

public class GameState {
    private int health;
    private int money;
    private int currentWave;
    private int totalWaves;
    private boolean gameActive;
    private List<Enemy> enemies;
    private List<Tower> towers;
    private List<String> logs;

    public GameState() {
        this.health = 100;
        this.money = 200;
        this.currentWave = 0;
        this.totalWaves = 5;
        this.gameActive = false;
        this.enemies = new ArrayList<>();
        this.towers = new ArrayList<>();
        this.logs = new ArrayList<>();
    }

    public void startGame() {
        this.gameActive = true;
        addLog("Oyun başladı!");
    }

    public void nextWave() {
        if (currentWave < totalWaves) {
            currentWave++;
            addLog("Dalga " + currentWave + " başladı!");
        }
    }

    public void addEnemy(Enemy enemy) {
        enemies.add(enemy);
    }

    public void removeEnemy(Enemy enemy) {
        enemies.remove(enemy);
    }

    public void addTower(Tower tower) {
        towers.add(tower);
        money -= tower.getCost();
    }

    public void enemyReachedBase(Enemy enemy) {
        health -= enemy.getDamage();
        removeEnemy(enemy);
        if (health <= 0) {
            gameOver(false);
        }
    }

    public void enemyKilled(Enemy enemy) {
        money += enemy.getReward();
        removeEnemy(enemy);
    }

    public void addLog(String message) {
        logs.add(message);
    }

    public void gameOver(boolean won) {
        gameActive = false;
        if (won) {
            addLog("TEBRİKLER! Oyunu kazandınız!");
        } else {
            addLog("Oyunu kaybettiniz!");
        }
    }

    public boolean isGameWon() {
        return currentWave >= totalWaves && enemies.isEmpty() && gameActive;
    }

    public int getHealth() {
        return health;
    }

    public int getMoney() {
        return money;
    }

    public int getCurrentWave() {
        return currentWave;
    }

    public int getTotalWaves() {
        return totalWaves;
    }

    public boolean isGameActive() {
        return gameActive;
    }

    public List<Enemy> getEnemies() {
        return new ArrayList<>(enemies);
    }

    public List<Tower> getTowers() {
        return new ArrayList<>(towers);
    }

    public List<String> getLogs() {
        return new ArrayList<>(logs);
    }
}
