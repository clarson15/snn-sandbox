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

  it('preserves deterministic state when switching between pause/1x/2x/5x/10x and returning to 1x', () => {
    const params = {
      movementDelta: 2,
      metabolismPerTick: 0.25,
      movementCostMultiplier: 0.1,
      consumeRadius: 2,
      foodSpawnChance: 0.2,
      foodEnergyValue: 7,
      maxFood: 200
    };

    // 0 represents Pause; others represent ticks processed in that scheduler frame.
    const mixedSchedule = [1, 2, 5, 0, 10, 1, 0, 2, 5, 1, 1, 10, 0, 1];
    const totalTicks = mixedSchedule.reduce((sum, value) => sum + value, 0);

    const baseline1x = runTicks(baseState, createSeededPrng('speed-switch-seed'), totalTicks, params);
    const switched = runTickSchedule(baseState, createSeededPrng('speed-switch-seed'), mixedSchedule, params);

    expect(switched.tick).toBe(totalTicks);
    expect(switched).toEqual(baseline1x);
  });

  it('yields identical world state for identical single-step sequences with the same seed', () => {
    const params = {
      movementDelta: 2,
      metabolismPerTick: 0.25,
      movementCostMultiplier: 0.1,
      consumeRadius: 2,
      foodSpawnChance: 0.2,
      foodEnergyValue: 7,
      maxFood: 200
    };

    const stepSequence = [1, 1, 0, 1, 0, 1, 1, 0, 1];

    const runSingleStepSequence = () => {
      let state = baseState;
      const rng = createSeededPrng('single-step-seed');

      for (const stepAction of stepSequence) {
        if (stepAction === 1) {
          state = stepWorld(state, rng, params);
        }
      }

      return state;
    };

    expect(runSingleStepSequence()).toEqual(runSingleStepSequence());
  });

  it('maintains deterministic continuity after save/load from persisted world + rng state', () => {
    const params = {
      movementDelta: 2,
      metabolismPerTick: 0.25,
      movementCostMultiplier: 0.1,
      consumeRadius: 2,
      foodSpawnChance: 0.2,
      foodEnergyValue: 7,
      maxFood: 200
    };

    const baselineRng = createSeededPrng('save-load-seed');
    const baselineAt40 = runTicks(baseState, baselineRng, 40, params);
    const persistedRngState = baselineRng.getState();
    const baselineNext60 = runTicks(baselineAt40, baselineRng, 60, params);

    const resumedRng = createSeededPrng('save-load-seed', persistedRngState);
    const resumedNext60 = runTicks(baselineAt40, resumedRng, 60, params);

    const hash = (state) => JSON.stringify(state);
    expect(hash(resumedNext60)).toEqual(hash(baselineNext60));
  });

  it('spawns exactly enough organisms to reach minimum population when below threshold', () => {
    const state = createWorldState({
      tick: 5,
      organisms: [{ id: 'org-9', x: 1, y: 1, energy: 5 }],
      food: []
    });

    const next = stepWorld(state, createSeededPrng('floor-spawn'), {
      movementDelta: 0,
      metabolismPerTick: 0,
      foodSpawnChance: 0,
      minimumPopulation: 4,
      createFloorSpawnOrganism: (id, rng) => ({
        id,
        x: Number((rng.nextFloat() * 10).toFixed(4)),
        y: Number((rng.nextFloat() * 10).toFixed(4)),
        energy: 20,
        age: 0,
        generation: 1,
        traits: { size: 1, speed: 1, visionRange: 25, turnRate: 0.05, metabolism: 0.05 },
        brain: { neurons: [], synapses: [] }
      })
    });

    expect(next.organisms).toHaveLength(4);
    expect(next.organisms.map((organism) => organism.id)).toEqual(['org-9', 'org-10', 'org-11', 'org-12']);
  });

  it('does not spawn floor organisms when population meets or exceeds minimum', () => {
    const state = createWorldState({
      tick: 2,
      organisms: [
        { id: 'org-1', x: 0, y: 0, energy: 10 },
        { id: 'org-2', x: 0, y: 0, energy: 10 }
      ],
      food: []
    });

    const next = stepWorld(state, createSeededPrng('floor-spawn-none'), {
      movementDelta: 0,
      metabolismPerTick: 0,
      foodSpawnChance: 0,
      minimumPopulation: 2,
      createFloorSpawnOrganism: () => {
        throw new Error('Should not be called when at floor');
      }
    });

    expect(next.organisms).toHaveLength(2);
  });

  it('produces identical floor-spawn outputs for identical seed + params + state', () => {
    const state = createWorldState({
      tick: 0,
      organisms: [{ id: 'org-4', x: 4, y: 4, energy: 2 }],
      food: []
    });

    const params = {
      movementDelta: 0,
      metabolismPerTick: 0,
      foodSpawnChance: 0,
      minimumPopulation: 3,
      createFloorSpawnOrganism: (id, rng) => ({
        id,
        x: Number((rng.nextFloat() * 100).toFixed(3)),
        y: Number((rng.nextFloat() * 100).toFixed(3)),
        energy: 20,
        age: 0,
        generation: 1,
        traits: { size: 1, speed: 1, visionRange: 1, turnRate: 1, metabolism: 1 },
        brain: { neurons: [], synapses: [] }
      })
    };

    const runA = runTicks(state, createSeededPrng('floor-deterministic'), 3, params);
    const runB = runTicks(state, createSeededPrng('floor-deterministic'), 3, params);

    expect(runA).toEqual(runB);
  });
});
