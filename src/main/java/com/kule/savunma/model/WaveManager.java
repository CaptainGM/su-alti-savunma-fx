package com.kule.savunma.model;

import java.util.ArrayList;
import java.util.List;

public class WaveManager {
    private int currentWave;
    private int maxWaves;
    private List<Enemy> waveEnemies;
    private boolean waveInProgress;

    private static final int[] ENEMIES_PER_WAVE = { 5, 10, 15, 20, 25 };

    public WaveManager(int maxWaves) {
        this.maxWaves = maxWaves;
        this.currentWave = 0;
        this.waveEnemies = new ArrayList<>();
        this.waveInProgress = false;
    }

    public boolean startNextWave() {
        if (currentWave >= maxWaves || waveInProgress) {
            return false;
        }

        currentWave++;
        waveInProgress = true;
        waveEnemies.clear();
        createWaveEnemies();

        return true;
    }

    private void createWaveEnemies() {
        int enemyCount = getEnemyCountForWave(currentWave);

        for (int i = 0; i < enemyCount; i++) {
            Enemy enemy;

            if (i % 5 == 4 && currentWave >= 2) {
                enemy = EnemyFactory.createEnemy("flying");
            } else if (i % 3 == 2) {
                enemy = EnemyFactory.createEnemy("armored");
            } else {
                enemy = EnemyFactory.createEnemy("standard");
            }

            waveEnemies.add(enemy);
        }
    }

    private int getEnemyCountForWave(int wave) {
        if (wave > 0 && wave <= ENEMIES_PER_WAVE.length) {
            return ENEMIES_PER_WAVE[wave - 1];
        }
        return ENEMIES_PER_WAVE[ENEMIES_PER_WAVE.length - 1];
    }

    public boolean isWaveComplete() {
        return waveEnemies.stream().allMatch(Enemy::isDead);
    }

    public void endWave() {
        waveInProgress = false;
    }

    public int getCurrentWave() {
        return currentWave;
    }

    public int getMaxWaves() {
        return maxWaves;
    }

    public List<Enemy> getWaveEnemies() {
        return new ArrayList<>(waveEnemies);
    }

    public boolean isWaveInProgress() {
        return waveInProgress;
    }

    public boolean isGameComplete() {
        return currentWave >= maxWaves && !waveInProgress;
    }

    public void reset() {
        currentWave = 0;
        waveEnemies.clear();
        waveInProgress = false;
        EnemyFactory.resetIdCounter();
    }
}
