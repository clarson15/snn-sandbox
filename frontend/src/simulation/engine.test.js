import { describe, expect, it } from 'vitest';

import { createSeededPrng } from './prng';
import { createWorldState, runTicks, stepWorld } from './engine';

const baseState = createWorldState({
  tick: 0,
  organisms: [
    { id: 'org-1', x: 10, y: 20, energy: 100 },
    { id: 'org-2', x: 30, y: 40, energy: 95 }
  ],
  food: [{ id: 'food-0-0', x: 50, y: 50, energyValue: 5 }]
});

describe('simulation engine skeleton', () => {
  it('advances tick and returns a new world state object', () => {
    const rng = createSeededPrng('tick-advance');
    const next = stepWorld(baseState, rng);

    expect(next).not.toBe(baseState);
    expect(next.tick).toBe(baseState.tick + 1);
    expect(next.organisms).toHaveLength(baseState.organisms.length);
    expect(next.food.length).toBeGreaterThanOrEqual(baseState.food.length);
    expect(baseState.tick).toBe(0);
  });

  it('produces identical snapshots for same seed + params + initial state', () => {
    const params = {
      movementDelta: 2,
      metabolismPerTick: 0.25,
      foodSpawnChance: 0.2,
      foodEnergyValue: 7
    };

    const runA = runTicks(baseState, createSeededPrng('same-seed'), 25, params);
    const runB = runTicks(baseState, createSeededPrng('same-seed'), 25, params);

    expect(runA).toEqual(runB);
  });

  it('diverges for different seeds with same params + initial state', () => {
    const params = {
      movementDelta: 2,
      metabolismPerTick: 0.25,
      foodSpawnChance: 0.2,
      foodEnergyValue: 7
    };

    const runA = runTicks(baseState, createSeededPrng('seed-a'), 25, params);
    const runB = runTicks(baseState, createSeededPrng('seed-b'), 25, params);

    expect(runA).not.toEqual(runB);
  });
});
