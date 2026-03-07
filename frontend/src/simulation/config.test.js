import { describe, expect, it } from 'vitest';

import { runTicks } from './engine';
import {
  createInitialWorldFromConfig,
  normalizeSimulationConfig,
  toEngineStepParams,
  validateSimulationConfig
} from './config';
import { createSeededPrng } from './prng';

describe('simulation config helpers', () => {
  it('produces identical first N ticks with same resolved config', () => {
    const config = normalizeSimulationConfig(
      {
        name: 'Deterministic Replay',
        seed: 'abc123',
        worldWidth: '640',
        worldHeight: '360',
        initialPopulation: '8',
        minimumPopulation: '8',
        initialFoodCount: '12',
        foodSpawnChance: '0.1',
        foodEnergyValue: '4',
        maxFood: '100'
      },
      'abc123'
    );

    const initialA = createInitialWorldFromConfig(config);
    const initialB = createInitialWorldFromConfig(config);

    const runA = runTicks(initialA, createSeededPrng(config.resolvedSeed), 25, toEngineStepParams(config));
    const runB = runTicks(initialB, createSeededPrng(config.resolvedSeed), 25, toEngineStepParams(config));

    expect(runA).toEqual(runB);
  });

  it('validates invalid numeric ranges', () => {
    const errors = validateSimulationConfig({
      name: '',
      worldWidth: 50,
      worldHeight: 20,
      initialPopulation: 0,
      minimumPopulation: 0,
      initialFoodCount: -1,
      foodSpawnChance: 4,
      foodEnergyValue: 0,
      maxFood: 0
    });

    expect(errors).toMatchObject({
      name: expect.any(String),
      worldWidth: expect.any(String),
      worldHeight: expect.any(String),
      initialPopulation: expect.any(String),
      minimumPopulation: expect.any(String),
      initialFoodCount: expect.any(String),
      foodSpawnChance: expect.any(String),
      foodEnergyValue: expect.any(String),
      maxFood: expect.any(String)
    });
  });
});
