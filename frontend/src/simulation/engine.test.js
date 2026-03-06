import { describe, expect, it } from 'vitest';

import { createSeededPrng } from './prng';
import { createWorldState, runTickSchedule, runTicks, stepWorld } from './engine';

const baseState = createWorldState({
  tick: 0,
  organisms: [
    { id: 'org-1', x: 10, y: 20, energy: 100 },
    { id: 'org-2', x: 30, y: 40, energy: 95 }
  ],
  food: [
    { id: 'food-a', x: 10.5, y: 20.5, energyValue: 5 },
    { id: 'food-b', x: 29.5, y: 40.5, energyValue: 8 }
  ]
});

describe('simulation engine skeleton', () => {
  it('advances tick and returns a new world state object', () => {
    const rng = createSeededPrng('tick-advance');
    const next = stepWorld(baseState, rng, {
      movementDelta: 0,
      consumeRadius: 2,
      foodSpawnChance: 0
    });

    expect(next).not.toBe(baseState);
    expect(next.tick).toBe(baseState.tick + 1);
    expect(next.organisms).toHaveLength(baseState.organisms.length);
    expect(next.food.length).toBeLessThan(baseState.food.length);
    expect(baseState.tick).toBe(0);
  });

  it('applies deterministic metabolism + movement costs and deterministic food consumption order', () => {
    const state = createWorldState({
      tick: 0,
      organisms: [
        { id: 'org-b', x: 5, y: 5, energy: 10 },
        { id: 'org-a', x: 5, y: 5, energy: 10 }
      ],
      food: [
        { id: 'food-1', x: 5, y: 5, energyValue: 2 },
        { id: 'food-2', x: 5, y: 5, energyValue: 3 }
      ]
    });

    const next = stepWorld(state, createSeededPrng('stable-order'), {
      movementDelta: 0,
      metabolismPerTick: 1,
      movementCostMultiplier: 0,
      consumeRadius: 1,
      foodSpawnChance: 0
    });

    // org-a consumes first due to stable lexical iteration ordering.
    const orgA = next.organisms.find((o) => o.id === 'org-a');
    const orgB = next.organisms.find((o) => o.id === 'org-b');

    expect(orgA.energy).toBe(11); // 10 - 1 + 2
    expect(orgB.energy).toBe(12); // 10 - 1 + 3
    expect(next.food).toHaveLength(0);
  });

  it('produces identical snapshots for same seed + params + initial state over 100 ticks', () => {
    const params = {
      movementDelta: 2,
      metabolismPerTick: 0.25,
      movementCostMultiplier: 0.1,
      consumeRadius: 2,
      foodSpawnChance: 0.2,
      foodEnergyValue: 7,
      maxFood: 200
    };

    const runA = runTicks(baseState, createSeededPrng('same-seed'), 100, params);
    const runB = runTicks(baseState, createSeededPrng('same-seed'), 100, params);

    expect(runA).toEqual(runB);
  });

  it('diverges for different seeds with same params + initial state', () => {
    const params = {
      movementDelta: 2,
      metabolismPerTick: 0.25,
      movementCostMultiplier: 0.1,
      consumeRadius: 2,
      foodSpawnChance: 0.2,
      foodEnergyValue: 7,
      maxFood: 200
    };

    const runA = runTicks(baseState, createSeededPrng('seed-a'), 100, params);
    const runB = runTicks(baseState, createSeededPrng('seed-b'), 100, params);

    expect(runA).not.toEqual(runB);
  });

  it('matches checkpoints for 1x and 5x scheduling with the same seed', () => {
    const params = {
      movementDelta: 2,
      metabolismPerTick: 0.25,
      movementCostMultiplier: 0.1,
      consumeRadius: 2,
      foodSpawnChance: 0.2,
      foodEnergyValue: 7,
      maxFood: 200
    };

    const run1x = runTickSchedule(baseState, createSeededPrng('same-seed-schedule'), new Array(100).fill(1), params);
    const run5x = runTickSchedule(baseState, createSeededPrng('same-seed-schedule'), new Array(20).fill(5), params);

    expect(run1x.tick).toBe(100);
    expect(run5x.tick).toBe(100);
    expect(run1x).toEqual(run5x);
  });
});
