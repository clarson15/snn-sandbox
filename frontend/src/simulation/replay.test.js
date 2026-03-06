import { describe, expect, it } from 'vitest';

import { createInitialWorldFromConfig, normalizeSimulationConfig, toEngineStepParams } from './config';
import { runTicks } from './engine';
import { createSeededPrng } from './prng';
import { replaySnapshotToTick } from './replay';

function hash(value) {
  return JSON.stringify(value);
}

describe('replaySnapshotToTick', () => {
  it('replays deterministically to the same tick for identical seed + params + base snapshot', () => {
    const config = normalizeSimulationConfig(
      {
        name: 'Replay fixture',
        seed: 'replay-seed',
        worldWidth: 800,
        worldHeight: 480,
        initialPopulation: 12,
        initialFoodCount: 30,
        foodSpawnChance: 0.04,
        foodEnergyValue: 5,
        maxFood: 120
      },
      'replay-seed'
    );

    const stepParams = toEngineStepParams(config);
    const baseWorldState = createInitialWorldFromConfig(config);

    const baselineRng = createSeededPrng(config.resolvedSeed, 1234);
    const baselineWorldAt75 = runTicks(baseWorldState, baselineRng, 75, stepParams);

    const replayed = replaySnapshotToTick({
      baseWorldState,
      baseRngState: 1234,
      resolvedSeed: config.resolvedSeed,
      stepParams,
      targetTick: 75
    });

    expect(replayed.tick).toBe(75);
    expect(hash(replayed.worldState)).toEqual(hash(baselineWorldAt75));
  });

  it('clamps target ticks below the loaded snapshot tick', () => {
    const config = normalizeSimulationConfig(
      {
        name: 'Replay clamp fixture',
        seed: 'replay-clamp-seed',
        worldWidth: 800,
        worldHeight: 480,
        initialPopulation: 12,
        initialFoodCount: 30,
        foodSpawnChance: 0.04,
        foodEnergyValue: 5,
        maxFood: 120
      },
      'replay-clamp-seed'
    );

    const stepParams = toEngineStepParams(config);
    const startingWorld = createInitialWorldFromConfig(config);
    const warmupRng = createSeededPrng(config.resolvedSeed, 4567);
    const baseWorldState = runTicks(startingWorld, warmupRng, 20, stepParams);
    const baseRngState = warmupRng.getState();

    const replayed = replaySnapshotToTick({
      baseWorldState,
      baseRngState,
      resolvedSeed: config.resolvedSeed,
      stepParams,
      targetTick: 5
    });

    expect(replayed.clamped).toBe(true);
    expect(replayed.tick).toBe(20);
    expect(hash(replayed.worldState)).toEqual(hash(baseWorldState));
  });
});
