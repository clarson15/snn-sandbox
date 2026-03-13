import { describe, expect, it } from 'vitest';

import { buildDeterministicShareUrl, resolveDeterministicQueryPrefill } from './shareLink';

describe('shareLink helpers', () => {
  it('builds deterministic share URLs with stable parameter ordering', () => {
    const url = buildDeterministicShareUrl({
      origin: 'https://sandbox.example',
      pathname: '/run',
      seed: 'seed-42',
      parameters: {
        worldWidth: 1200,
        worldHeight: 720,
        initialPopulation: 40,
        minimumPopulation: 20,
        initialFoodCount: 50,
        foodSpawnChance: 0.05,
        foodEnergyValue: 9,
        maxFood: 300,
        mutationRate: 0.2,
        mutationStrength: 0.15
      }
    });

    expect(url).toBe('https://sandbox.example/run?seed=seed-42&worldWidth=1200&worldHeight=720&initialPopulation=40&minimumPopulation=20&initialFoodCount=50&foodSpawnChance=0.05&foodEnergyValue=9&maxFood=300&mutationRate=0.2&mutationStrength=0.15');
  });

  it('parses query prefill and falls back to defaults with warning on invalid fields', () => {
    const { prefill, warningMessage } = resolveDeterministicQueryPrefill(
      '?seed=shared-seed&worldWidth=bad&worldHeight=1000&initialPopulation=50'
    );

    expect(prefill.seed).toBe('shared-seed');
    expect(prefill.worldWidth).toBe('1920');
    expect(prefill.worldHeight).toBe('1000');
    expect(prefill.initialPopulation).toBe('50');
    expect(prefill.maxFood).toBe('450');
    expect(warningMessage).toContain('worldWidth');
    expect(warningMessage).toContain('minimumPopulation');
  });
});
