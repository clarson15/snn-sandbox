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

function squaredDistance(organism, food) {
  const dx = organism.x - food.x;
  const dy = organism.y - food.y;
  return dx * dx + dy * dy;
}

function deterministicChecksum(worldState) {
  return JSON.stringify(worldState);
}

function normalizeAngle(angle) {
  const fullTurn = Math.PI * 2;
  const normalized = angle % fullTurn;
  return normalized < 0 ? normalized + fullTurn : normalized;
}

function deriveRotationDelta(organism) {
  const turnRate = Number(organism?.traits?.turnRate ?? 0);
  if (!Number.isFinite(turnRate) || turnRate === 0) {
    return 0;
  }

  const synapses = Array.isArray(organism?.brain?.synapses) ? organism.brain.synapses : [];
  if (synapses.length === 0) {
    return 0;
  }

  let leftSignal = 0;
  let rightSignal = 0;

  for (const synapse of synapses) {
    if (!synapse || !Number.isFinite(synapse.weight)) {
      continue;
    }

    if (synapse.targetId === 'out-turn-left') {
      leftSignal += synapse.weight;
    } else if (synapse.targetId === 'out-turn-right') {
      rightSignal += synapse.weight;
    }
  }

  return (rightSignal - leftSignal) * turnRate;
}

function stepWorldWithLegacyFoodLookup(state, rng, params = {}) {
  const movementDelta = params.movementDelta ?? 1;
  const metabolismPerTick = params.metabolismPerTick ?? 0.1;
  const movementCostMultiplier = params.movementCostMultiplier ?? 0.05;
  const consumeRadius = params.consumeRadius ?? 2;
  const foodSpawnChance = params.foodSpawnChance ?? 0.05;
  const foodEnergyValue = params.foodEnergyValue ?? 5;
  const worldWidth = params.worldWidth ?? 100;
  const worldHeight = params.worldHeight ?? 100;
  const maxFood = params.maxFood ?? Number.POSITIVE_INFINITY;

  const movedOrganisms = state.organisms.map((organism) => {
    const dx = (rng.nextFloat() * 2 - 1) * movementDelta;
    const dy = (rng.nextFloat() * 2 - 1) * movementDelta;
    const movementDistance = Math.hypot(dx, dy);
    const energySpent = metabolismPerTick + movementDistance * movementCostMultiplier;
    const direction = normalizeAngle((organism.direction ?? 0) + deriveRotationDelta(organism));

    return {
      ...organism,
      x: organism.x + dx,
      y: organism.y + dy,
      age: organism.age + 1,
      direction,
      energy: Math.max(0, organism.energy - energySpent)
    };
  });

  const foodById = new Map(state.food.map((item) => [item.id, { ...item }]));
  const consumeRadiusSquared = consumeRadius * consumeRadius;
  const consumedEnergyByOrganismId = new Map();
  const organismsByStableOrder = [...movedOrganisms].sort((a, b) => a.id.localeCompare(b.id));

  for (const organism of organismsByStableOrder) {
    if (foodById.size === 0) {
      break;
    }

    let chosenFoodId = null;
    let chosenDistance = Number.POSITIVE_INFINITY;

    for (const [foodId, food] of foodById.entries()) {
      const distance = squaredDistance(organism, food);
      if (distance > consumeRadiusSquared) {
        continue;
      }

      if (distance < chosenDistance || (distance === chosenDistance && (chosenFoodId === null || foodId < chosenFoodId))) {
        chosenDistance = distance;
        chosenFoodId = foodId;
      }
    }

    if (chosenFoodId !== null) {
      const food = foodById.get(chosenFoodId);
      consumedEnergyByOrganismId.set(organism.id, (consumedEnergyByOrganismId.get(organism.id) ?? 0) + food.energyValue);
      foodById.delete(chosenFoodId);
    }
  }

  const organisms = movedOrganisms
    .map((organism) => ({
      ...organism,
      energy: organism.energy + (consumedEnergyByOrganismId.get(organism.id) ?? 0)
    }))
    .filter((organism) => organism.energy > 0);

  const nextFood = Array.from(foodById.values()).sort((a, b) => a.id.localeCompare(b.id));

  if (nextFood.length < maxFood && rng.nextFloat() < foodSpawnChance) {
    nextFood.push({
      id: `food-${state.tick + 1}-${nextFood.length}`,
      x: rng.nextFloat() * worldWidth,
      y: rng.nextFloat() * worldHeight,
      energyValue: foodEnergyValue
    });
  }

  return {
    tick: state.tick + 1,
    organisms,
    food: nextFood
  };
}

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

  it('matches tick-by-tick world state checkpoints for repeated runs with same seed + params', () => {
    const params = {
      movementDelta: 2,
      metabolismPerTick: 0.25,
      movementCostMultiplier: 0.1,
      consumeRadius: 2,
      foodSpawnChance: 0.2,
      foodEnergyValue: 7,
      maxFood: 200
    };

    const rngA = createSeededPrng('same-seed-checkpoints');
    const rngB = createSeededPrng('same-seed-checkpoints');
    let stateA = baseState;
    let stateB = baseState;

    for (let tick = 0; tick < 40; tick += 1) {
      stateA = stepWorld(stateA, rngA, params);
      stateB = stepWorld(stateB, rngB, params);
      expect(stateA).toEqual(stateB);
      expect(stateA.tick).toBe(tick + 1);
    }
  });

  it('preserves seeded fixed-tick snapshots compared with the legacy O(n*m) food lookup implementation', () => {
    const params = {
      movementDelta: 2,
      metabolismPerTick: 0.25,
      movementCostMultiplier: 0.1,
      consumeRadius: 2,
      foodSpawnChance: 0.2,
      foodEnergyValue: 7,
      maxFood: 200
    };

    let optimizedState = baseState;
    let legacyState = baseState;
    const optimizedRng = createSeededPrng('legacy-parity');
    const legacyRng = createSeededPrng('legacy-parity');
    const checkpoints = new Set([1, 5, 25, 50, 100]);

    for (let tick = 1; tick <= 100; tick += 1) {
      optimizedState = stepWorld(optimizedState, optimizedRng, params);
      legacyState = stepWorldWithLegacyFoodLookup(legacyState, legacyRng, params);

      if (checkpoints.has(tick)) {
        expect(optimizedState).toEqual(legacyState);
      }
    }
  });

  it('matches deterministic checkpoints between spatial and legacy organism interaction lookups', () => {
    const params = {
      movementDelta: 1.5,
      metabolismPerTick: 0.2,
      movementCostMultiplier: 0.05,
      consumeRadius: 2,
      foodSpawnChance: 0.1,
      foodEnergyValue: 7,
      maxFood: 300,
      interactionRadius: 5,
      interactionCostPerNeighbor: 0.03
    };

    const checkpoints = new Set([1, 5, 20, 50]);
    let spatialState = createWorldState({
      tick: 0,
      organisms: Array.from({ length: 60 }, (_, index) => ({
        id: `org-${index + 1}`,
        x: (index % 12) * 3,
        y: Math.floor(index / 12) * 3,
        energy: 25,
        age: 0,
        generation: 1,
        direction: 0,
        traits: { size: 1, speed: 1, visionRange: 10, turnRate: 0.05, metabolism: 0.05 }
      })),
      food: []
    });
    let legacyState = createWorldState(spatialState);

    const spatialRng = createSeededPrng('interaction-lookup-parity');
    const legacyRng = createSeededPrng('interaction-lookup-parity');

    for (let tick = 1; tick <= 50; tick += 1) {
      spatialState = stepWorld(spatialState, spatialRng, {
        ...params,
        interactionLookupMode: 'spatial'
      });
      legacyState = stepWorld(legacyState, legacyRng, {
        ...params,
        interactionLookupMode: 'legacy'
      });

      if (checkpoints.has(tick)) {
        expect(spatialState).toEqual(legacyState);
      }
    }
  });

  it('counts interaction neighbors deterministically across partition boundaries', () => {
    const state = createWorldState({
      tick: 0,
      organisms: [
        { id: 'org-a', x: 4.9, y: 4.9, energy: 10, age: 0, generation: 1, direction: 0, traits: { size: 1, speed: 1, visionRange: 1, turnRate: 1, metabolism: 1 } },
        { id: 'org-b', x: 5.1, y: 4.9, energy: 10, age: 0, generation: 1, direction: 0, traits: { size: 1, speed: 1, visionRange: 1, turnRate: 1, metabolism: 1 } },
        { id: 'org-c', x: 9.8, y: 4.9, energy: 10, age: 0, generation: 1, direction: 0, traits: { size: 1, speed: 1, visionRange: 1, turnRate: 1, metabolism: 1 } }
      ],
      food: []
    });

    const next = stepWorld(state, createSeededPrng('boundary-neighbors'), {
      movementDelta: 0,
      metabolismPerTick: 0,
      movementCostMultiplier: 0,
      consumeRadius: 1,
      foodSpawnChance: 0,
      interactionRadius: 0.4,
      interactionCostPerNeighbor: 1,
      interactionLookupMode: 'spatial'
    });

    const byId = new Map(next.organisms.map((organism) => [organism.id, organism]));

    expect(byId.get('org-a').energy).toBe(9);
    expect(byId.get('org-b').energy).toBe(9);
    expect(byId.get('org-c').energy).toBe(10);
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

  it('produces identical deterministic end-state checksum with and without render-skipping-aligned schedules', () => {
    const params = {
      movementDelta: 2,
      metabolismPerTick: 0.25,
      movementCostMultiplier: 0.1,
      consumeRadius: 2,
      foodSpawnChance: 0.2,
      foodEnergyValue: 7,
      maxFood: 200
    };

    const totalTicks = 120;
    const baselineSchedule = new Array(totalTicks).fill(1);
    // Approximate a high-speed render cadence where visual frames are skipped but ticks still run.
    const renderSkippingAlignedSchedule = new Array(30).fill(4);

    const baseline = runTickSchedule(baseState, createSeededPrng('render-cadence-seed'), baselineSchedule, params);
    const renderSkippingAligned = runTickSchedule(baseState, createSeededPrng('render-cadence-seed'), renderSkippingAlignedSchedule, params);

    expect(deterministicChecksum(renderSkippingAligned)).toBe(deterministicChecksum(baseline));
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

  it('keeps heading unchanged when rotate outputs have no effective input signal', () => {
    const state = createWorldState({
      tick: 0,
      organisms: [
        {
          id: 'org-no-rotate-signal',
          x: 10,
          y: 10,
          energy: 20,
          age: 0,
          generation: 1,
          direction: 1.234,
          traits: { size: 1, speed: 1, visionRange: 20, turnRate: 0.07, metabolism: 0.05 },
          brain: {
            neurons: [],
            synapses: [{ id: 'syn-forward', sourceId: 'in-energy', targetId: 'out-forward', weight: 0.9 }]
          }
        }
      ],
      food: []
    });

    const next = runTicks(state, createSeededPrng('no-rotate-signal'), 5, {
      movementDelta: 1.5,
      metabolismPerTick: 0.05,
      movementCostMultiplier: 0.03,
      foodSpawnChance: 0
    });

    expect(next.organisms[0].direction).toBeCloseTo(1.234, 10);
  });

  it('rotates deterministically when rotate output synapses are present', () => {
    const state = createWorldState({
      tick: 0,
      organisms: [
        {
          id: 'org-rotate-right',
          x: 10,
          y: 10,
          energy: 20,
          age: 0,
          generation: 1,
          direction: 0.5,
          traits: { size: 1, speed: 1, visionRange: 20, turnRate: 0.1, metabolism: 0.05 },
          brain: {
            neurons: [],
            synapses: [{ id: 'syn-right', sourceId: 'in-energy', targetId: 'out-turn-right', weight: 0.4 }]
          }
        }
      ],
      food: []
    });

    const next = runTicks(state, createSeededPrng('rotate-right-signal'), 3, {
      movementDelta: 0,
      metabolismPerTick: 0,
      movementCostMultiplier: 0,
      foodSpawnChance: 0
    });

    expect(next.organisms[0].direction).toBeCloseTo(0.62, 10);
  });
});
