import { describe, expect, it } from 'vitest';

import { createSeededPrng } from './prng';
import { createWorldState, resolveExpressedTraits, runTickSchedule, runTicks, stepWorld } from './engine';

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

function deriveForwardDelta(organism) {
  const speed = Number(organism?.traits?.speed ?? 1);
  if (!Number.isFinite(speed) || speed === 0) {
    return 0;
  }

  const synapses = Array.isArray(organism?.brain?.synapses) ? organism.brain.synapses : [];
  if (synapses.length === 0) {
    return 0;
  }

  let forwardSignal = 0;

  for (const synapse of synapses) {
    if (!synapse || !Number.isFinite(synapse.weight)) {
      continue;
    }

    if (
      synapse.targetId === 'out-forward' ||
      synapse.targetId === 'out-move-forward' ||
      synapse.targetId === 'out-move'
    ) {
      forwardSignal += synapse.weight;
    }
  }

  return Math.max(-1, Math.min(1, forwardSignal)) * speed;
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
    const direction = normalizeAngle((organism.direction ?? 0) + deriveRotationDelta(organism));
    const boundedForwardDelta = Math.max(
      -movementDelta,
      Math.min(movementDelta, deriveForwardDelta(organism))
    );
    const dx = Math.cos(direction) * boundedForwardDelta;
    const dy = Math.sin(direction) * boundedForwardDelta;
    const movementDistance = Math.hypot(dx, dy);
    const energySpent = metabolismPerTick + movementDistance * movementCostMultiplier;

    return {
      ...organism,
      x: organism.x + dx,
      y: organism.y + dy,
      age: (organism.age ?? 0) + 1,
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
    food: nextFood,
    obstacles: state.obstacles || [],
    dangerZones: state.dangerZones || []
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
        { id: 'org-a', x: 4.9, y: 4.9, energy: 10, age: 0, generation: 1, direction: 0, traits: { size: 1, speed: 1, visionRange: 1, turnRate: 1, metabolism: 0 } },
        { id: 'org-b', x: 5.1, y: 4.9, energy: 10, age: 0, generation: 1, direction: 0, traits: { size: 1, speed: 1, visionRange: 1, turnRate: 1, metabolism: 0 } },
        { id: 'org-c', x: 9.8, y: 4.9, energy: 10, age: 0, generation: 1, direction: 0, traits: { size: 1, speed: 1, visionRange: 1, turnRate: 1, metabolism: 0 } }
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

  it('keeps position and heading unchanged when movement outputs are absent', () => {
    const state = createWorldState({
      tick: 0,
      organisms: [
        {
          id: 'org-still',
          x: 11,
          y: 17,
          energy: 50,
          age: 0,
          generation: 1,
          direction: 0.75,
          traits: { size: 1, speed: 1.8, visionRange: 20, turnRate: 0.2, metabolism: 0.01 },
          brain: {
            neurons: [],
            synapses: [{ id: 'syn-noop', sourceId: 'in-energy', targetId: 'out-gamma', weight: 1 }]
          }
        }
      ],
      food: []
    });

    const next = runTicks(state, createSeededPrng('no-movement-outputs'), 5, {
      movementDelta: 2,
      metabolismPerTick: 0.01,
      movementCostMultiplier: 0.03,
      foodSpawnChance: 0
    });

    expect(next.organisms[0].x).toBeCloseTo(11, 10);
    expect(next.organisms[0].y).toBeCloseTo(17, 10);
    expect(next.organisms[0].direction).toBeCloseTo(0.75, 10);
  });

  it('rotates deterministically when rotate output synapses are present', () => {
    const state = createWorldState({
      tick: 0,
      organisms: [
        {
          id: 'org-rotate-right',
          x: 10,
          y: 10,
          energy: 100, // Full energy = input value of 1.0
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

    // Under the SNN update loop, the output neuron spikes on every other tick
    // for this setup, yielding 0.05 radians of rightward rotation over 3 ticks.
    expect(next.organisms[0].direction).toBeCloseTo(0.55, 3);
  });

  it('propagates spikes through hidden neurons within the deterministic SNN substeps', () => {
    const state = createWorldState({
      tick: 0,
      organisms: [
        {
          id: 'org-hidden-path',
          x: 0,
          y: 0,
          energy: 100,
          age: 0,
          generation: 1,
          direction: 0,
          traits: { size: 1, speed: 2, visionRange: 20, turnRate: 0.1, metabolism: 0 },
          brain: {
            neurons: [
              { id: 'in-energy', type: 'input' },
              { id: 'hidden-1', type: 'hidden', threshold: 1, decay: 0, potential: 0 },
              { id: 'out-forward', type: 'output', threshold: 1, decay: 0, potential: 0 }
            ],
            synapses: [
              { id: 'syn-input-hidden', sourceId: 'in-energy', targetId: 'hidden-1', weight: 1 },
              { id: 'syn-hidden-output', sourceId: 'hidden-1', targetId: 'out-forward', weight: 1 }
            ]
          }
        }
      ],
      food: []
    });

    const next = stepWorld(state, createSeededPrng('hidden-propagation'), {
      movementDelta: 10,
      metabolismPerTick: 0,
      movementCostMultiplier: 0,
      foodSpawnChance: 0
    });

    const organism = next.organisms[0];
    const hiddenNeuron = organism.brain.neurons.find((neuron) => neuron.id === 'hidden-1');
    const outputNeuron = organism.brain.neurons.find((neuron) => neuron.id === 'out-forward');

    expect(hiddenNeuron.activation).toBeGreaterThan(0);
    expect(outputNeuron.activation).toBeGreaterThan(0);
    expect(organism.x).toBeGreaterThan(0);
  });

  it('wires predator prey-sensing context through brain evaluation', () => {
    const state = createWorldState({
      tick: 0,
      organisms: [
        {
          id: 'pred-1',
          type: 'predator',
          x: 10,
          y: 10,
          energy: 100,
          age: 0,
          generation: 1,
          direction: 0,
          traits: { size: 1.4, speed: 2, visionRange: 40, turnRate: 0.05, metabolism: 0 },
          brain: {
            neurons: [
              { id: 'in-prey-detected', type: 'input' },
              { id: 'out-forward', type: 'output', threshold: 1, decay: 0, potential: 0 }
            ],
            synapses: [
              { id: 'syn-prey-forward', sourceId: 'in-prey-detected', targetId: 'out-forward', weight: 2 }
            ]
          }
        },
        {
          id: 'org-1',
          type: 'herbivore',
          x: 20,
          y: 10,
          energy: 20,
          age: 0,
          generation: 1,
          direction: 0,
          traits: { size: 1, speed: 1, visionRange: 10, turnRate: 0.05, metabolism: 0 },
          brain: { neurons: [], synapses: [] }
        }
      ],
      food: []
    });

    const next = stepWorld(state, createSeededPrng('predator-prey-sensor-ctx'), {
      movementDelta: 2,
      metabolismPerTick: 0,
      movementCostMultiplier: 0,
      foodSpawnChance: 0,
      predatorHuntRadius: 0
    });

    const predator = next.organisms.find((organism) => organism.id === 'pred-1');
    expect(predator.x).toBeGreaterThan(10);
  });

  it('applies deterministic per-organism metabolism-based energy loss', () => {
    // Two organisms with different metabolism traits should lose energy at different rates
    const state = createWorldState({
      tick: 0,
      organisms: [
        // High metabolism organism
        { id: 'org-high', x: 10, y: 10, energy: 100, age: 0, generation: 1, direction: 0, traits: { size: 1, speed: 1, visionRange: 10, turnRate: 0.05, metabolism: 0.2 } },
        // Low metabolism organism
        { id: 'org-low', x: 20, y: 20, energy: 100, age: 0, generation: 1, direction: 0, traits: { size: 1, speed: 1, visionRange: 10, turnRate: 0.05, metabolism: 0.02 } }
      ],
      food: []
    });

    // Use movementDelta: 0 to isolate metabolism cost from movement cost
    const params = {
      movementDelta: 0,
      metabolismPerTick: 0.1, // This should be overridden by organism's traits
      movementCostMultiplier: 0,
      foodSpawnChance: 0
    };

    const rng = createSeededPrng('metabolism-test');
    const result = runTicks(state, rng, 10, params);

    const highMetabolismOrg = result.organisms.find((o) => o.id === 'org-high');
    const lowMetabolismOrg = result.organisms.find((o) => o.id === 'org-low');

    // High metabolism (0.2) should lose ~2.0 energy over 10 ticks
    // Low metabolism (0.02) should lose ~0.2 energy over 10 ticks
    expect(highMetabolismOrg.energy).toBeLessThan(lowMetabolismOrg.energy);
    expect(highMetabolismOrg.energy).toBeCloseTo(98, 0); // 100 - (0.2 * 10) = 98
    expect(lowMetabolismOrg.energy).toBeCloseTo(99.8, 1); // 100 - (0.02 * 10) = 99.8
  });

  it('is deterministic: same metabolism produces identical energy loss across runs', () => {
    const state = createWorldState({
      tick: 0,
      organisms: [
        { id: 'org-1', x: 5, y: 5, energy: 50, age: 0, generation: 1, direction: 0, traits: { size: 1, speed: 1, visionRange: 10, turnRate: 0.05, metabolism: 0.075 } }
      ],
      food: []
    });

    const params = {
      movementDelta: 0,
      metabolismPerTick: 0.1,
      movementCostMultiplier: 0,
      foodSpawnChance: 0
    };

    const run1 = runTicks(state, createSeededPrng('det-metabolism-1'), 25, params);
    const run2 = runTicks(state, createSeededPrng('det-metabolism-1'), 25, params);

    expect(run1.organisms[0].energy).toEqual(run2.organisms[0].energy);
    // 50 - (0.075 * 25) = 48.125
    expect(run1.organisms[0].energy).toBeCloseTo(48.125, 3);
  });

  it('applies deterministic movement-based energy loss proportional to distance traveled', () => {
    // Test that movement-based energy loss is deterministic and proportional to distance
    const state = createWorldState({
      tick: 0,
      organisms: [
        {
          id: 'org-1',
          x: 50,
          y: 50,
          energy: 100,
          age: 0,
          generation: 1,
          direction: 0,
          traits: { size: 1, speed: 1, visionRange: 10, turnRate: 0.05, metabolism: 0 },
          brain: { synapses: [{ id: 'syn-forward', sourceId: 'in-energy', targetId: 'out-forward', weight: 1 }] }
        }
      ],
      food: []
    });

    const params = {
      movementDelta: 1,
      metabolismPerTick: 0,
      movementCostMultiplier: 0.1, // 0.1 energy per unit distance
      foodSpawnChance: 0
    };

    // Same seed should produce identical movement energy loss
    const run1 = runTicks(state, createSeededPrng('movement-energy-seed'), 5, params);
    const run2 = runTicks(state, createSeededPrng('movement-energy-seed'), 5, params);

    expect(run1.organisms[0].energy).toEqual(run2.organisms[0].energy);
    // Energy loss should be proportional to total movement distance from the seeded movement
    expect(run1.organisms[0].energy).toBeLessThan(100);
  });

  it('falls back to metabolismPerTick param when organism has no metabolism trait', () => {
    const state = createWorldState({
      tick: 0,
      organisms: [
        // No metabolism trait - should use fallback
        { id: 'org-fallback', x: 5, y: 5, energy: 50, age: 0, generation: 1, direction: 0, traits: { size: 1, speed: 1, visionRange: 10, turnRate: 0.05 } }
      ],
      food: []
    });

    const params = {
      movementDelta: 0,
      metabolismPerTick: 0.15, // Fallback value
      movementCostMultiplier: 0,
      foodSpawnChance: 0
    };

    const rng = createSeededPrng('fallback-test');
    const result = runTicks(state, rng, 10, params);

    // Should use the fallback 0.15 instead of undefined
    expect(result.organisms[0].energy).toBeCloseTo(48.5, 1); // 50 - (0.15 * 10) = 48.5
  });

  it('scales juvenile size, speed, and energy use until adolescence age', () => {
    const juvenile = {
      id: 'org-juvenile',
      x: 0,
      y: 0,
      energy: 20,
      age: 0,
      generation: 1,
      direction: 0,
      traits: {
        size: 2,
        speed: 4,
        visionRange: 10,
        turnRate: 0.05,
        metabolism: 1,
        adolescenceAge: 10
      },
      brain: { synapses: [{ targetId: 'out-forward', weight: 1 }] }
    };
    const adult = {
      ...juvenile,
      id: 'org-adult',
      age: 10
    };

    expect(resolveExpressedTraits(juvenile)).toMatchObject({
      size: 1.1,
      speed: 5,
      metabolism: 0.6
    });
    expect(resolveExpressedTraits(adult)).toMatchObject({
      size: 2,
      speed: 4,
      metabolism: 1
    });

    const result = stepWorld(createWorldState({
      tick: 0,
      organisms: [juvenile, adult],
      food: []
    }), createSeededPrng('adolescence-traits'), {
      movementDelta: 10,
      metabolismPerTick: 0,
      movementCostMultiplier: 1,
      foodSpawnChance: 0
    });

    const nextJuvenile = result.organisms.find((organism) => organism.id === 'org-juvenile');
    const nextAdult = result.organisms.find((organism) => organism.id === 'org-adult');

    expect(nextJuvenile.x).toBeCloseTo(5);
    expect(nextAdult.x).toBeCloseTo(4);
    expect(nextJuvenile.energy).toBeCloseTo(15.65);
    expect(nextAdult.energy).toBeCloseTo(15);
  });

  describe('deterministic reproduction', () => {
    it('reproduces when energy exceeds threshold', () => {
      const state = createWorldState({
        tick: 0,
        organisms: [
          { id: 'org-1', x: 50, y: 50, energy: 100, age: 0, generation: 1, direction: 0, traits: { size: 1, speed: 1, visionRange: 10, turnRate: 0.05, eggHatchTime: 0 }, brain: { synapses: [] } }
        ],
        food: []
      });

      const params = {
        reproductionThreshold: 80,
        reproductionCost: 30,
        offspringStartEnergy: 20,
        movementDelta: 0,
        metabolismPerTick: 0,
        movementCostMultiplier: 0,
        foodSpawnChance: 0
      };

      const rng = createSeededPrng('repro-test');
      const result = runTicks(state, rng, 1, params);

      // Should have parent + 1 offspring = 2 organisms
      expect(result.organisms).toHaveLength(2);

      // Parent should have energy = 100 - 30 = 70
      const parent = result.organisms.find(o => o.id === 'org-1');
      expect(parent.energy).toBe(70);

      // Offspring should have generation = 2 and energy = 20
      const offspring = result.organisms.find(o => o.id === 'org-2');
      expect(offspring.generation).toBe(2);
      expect(offspring.energy).toBe(20);
      expect(offspring.lifeStage).toBeUndefined();
    });

    it('lays eggs that hatch after the inherited hatch time', () => {
      const state = createWorldState({
        tick: 0,
        organisms: [
          {
            id: 'org-1',
            x: 50,
            y: 50,
            energy: 100,
            age: 10,
            generation: 1,
            direction: 0,
            traits: { size: 1, speed: 1, visionRange: 10, turnRate: 0.05, metabolism: 0, eggHatchTime: 2 },
            brain: { synapses: [] }
          }
        ],
        food: []
      });

      const params = {
        reproductionThreshold: 80,
        reproductionCost: 30,
        offspringStartEnergy: 20,
        reproductionMinimumAge: 0,
        movementDelta: 0,
        metabolismPerTick: 0,
        movementCostMultiplier: 0,
        foodSpawnChance: 0,
        traitMutationRate: 0
      };

      const afterLay = runTicks(state, createSeededPrng('egg-lay'), 1, params);
      const egg = afterLay.organisms.find((organism) => organism.id === 'org-2');
      expect(egg.lifeStage).toBe('egg');
      expect(egg.incubationAge).toBe(0);
      expect(afterLay.organisms.find((organism) => organism.id === 'org-1').energy).toBe(69);

      const afterOneMoreTick = runTicks(afterLay, createSeededPrng('egg-lay-hatch'), 1, {
        ...params,
        reproductionThreshold: Infinity
      });
      expect(afterOneMoreTick.organisms.find((organism) => organism.id === 'org-2').lifeStage).toBe('egg');
      expect(afterOneMoreTick.organisms.find((organism) => organism.id === 'org-2').incubationAge).toBe(1);

      const afterHatch = runTicks(afterOneMoreTick, createSeededPrng('egg-lay-hatch-2'), 1, {
        ...params,
        reproductionThreshold: Infinity
      });
      const hatchling = afterHatch.organisms.find((organism) => organism.id === 'org-2');
      expect(hatchling.lifeStage).toBeUndefined();
      expect(hatchling.incubationAge).toBeUndefined();
      expect(hatchling.age).toBe(0);
      expect(hatchling.energy).toBe(20);
    });

    it('charges more energy for longer egg incubation than live birth', () => {
      const baseOrganism = {
        id: 'org-1',
        x: 50,
        y: 50,
        energy: 100,
        age: 10,
        generation: 1,
        direction: 0,
        brain: { synapses: [] }
      };

      const params = {
        reproductionThreshold: 80,
        reproductionCost: 30,
        offspringStartEnergy: 20,
        movementDelta: 0,
        metabolismPerTick: 0,
        movementCostMultiplier: 0,
        foodSpawnChance: 0,
        traitMutationRate: 0
      };

      const liveBirth = runTicks(createWorldState({
        tick: 0,
        organisms: [
          {
            ...baseOrganism,
            traits: { size: 1, speed: 1, visionRange: 10, turnRate: 0.05, metabolism: 0, eggHatchTime: 0 }
          }
        ],
        food: []
      }), createSeededPrng('live-birth-cost'), 1, params);

      const eggBirth = runTicks(createWorldState({
        tick: 0,
        organisms: [
          {
            ...baseOrganism,
            traits: { size: 1, speed: 1, visionRange: 10, turnRate: 0.05, metabolism: 0, eggHatchTime: 4 }
          }
        ],
        food: []
      }), createSeededPrng('egg-birth-cost'), 1, params);

      expect(liveBirth.organisms.find((organism) => organism.id === 'org-1').energy).toBe(70);
      expect(eggBirth.organisms.find((organism) => organism.id === 'org-1').energy).toBe(68);
      expect(eggBirth.organisms.find((organism) => organism.id === 'org-2').lifeStage).toBe('egg');
    });

    it('does not reproduce when energy is below threshold', () => {
      const state = createWorldState({
        tick: 0,
        organisms: [
          { id: 'org-1', x: 50, y: 50, energy: 50, age: 0, generation: 1, direction: 0, traits: { size: 1, speed: 1, visionRange: 10, turnRate: 0.05 }, brain: { synapses: [] } }
        ],
        food: []
      });

      const params = {
        reproductionThreshold: 80,
        reproductionCost: 30,
        offspringStartEnergy: 20,
        movementDelta: 0,
        metabolismPerTick: 0,
        movementCostMultiplier: 0,
        foodSpawnChance: 0
      };

      const rng = createSeededPrng('no-repro-test');
      const result = runTicks(state, rng, 1, params);

      // Should still have only 1 organism
      expect(result.organisms).toHaveLength(1);
      expect(result.organisms[0].energy).toBe(50);
    });

    it('does not reproduce before the minimum reproduction age', () => {
      const state = createWorldState({
        tick: 0,
        organisms: [
          { id: 'org-1', x: 50, y: 50, energy: 100, age: 4, generation: 1, direction: 0, traits: { size: 1, speed: 1, visionRange: 10, turnRate: 0.05 }, brain: { synapses: [] } }
        ],
        food: []
      });

      const params = {
        reproductionThreshold: 80,
        reproductionCost: 30,
        offspringStartEnergy: 20,
        reproductionMinimumAge: 10,
        movementDelta: 0,
        metabolismPerTick: 0,
        movementCostMultiplier: 0,
        foodSpawnChance: 0
      };

      const result = runTicks(state, createSeededPrng('repro-age-gate'), 1, params);

      expect(result.organisms).toHaveLength(1);
      expect(result.organisms[0].age).toBe(5);
    });

    it('enforces a refractory period between reproduction events', () => {
      const state = createWorldState({
        tick: 0,
        organisms: [
          {
            id: 'org-1',
            x: 50,
            y: 50,
            energy: 100,
            age: 30,
            generation: 1,
            direction: 0,
            lastReproductionTick: 0,
            traits: { size: 1, speed: 1, visionRange: 10, turnRate: 0.05, metabolism: 0 },
            brain: { synapses: [] }
          }
        ],
        food: []
      });

      const params = {
        reproductionThreshold: 80,
        reproductionCost: 0,
        offspringStartEnergy: 20,
        reproductionMinimumAge: 10,
        reproductionRefractoryPeriod: 3,
        movementDelta: 0,
        metabolismPerTick: 0,
        movementCostMultiplier: 0,
        foodSpawnChance: 0
      };

      const result = runTicks(state, createSeededPrng('repro-refractory'), 2, params);

      expect(result.organisms).toHaveLength(1);

      const afterCooldown = runTicks(result, createSeededPrng('repro-refractory-2'), 1, params);
      expect(afterCooldown.organisms).toHaveLength(2);
      expect(afterCooldown.organisms.find((organism) => organism.id === 'org-1').lastReproductionTick).toBe(3);
    });

    it('removes organisms that exceed the maximum age before reproduction', () => {
      const state = createWorldState({
        tick: 0,
        organisms: [
          {
            id: 'org-1',
            x: 50,
            y: 50,
            energy: 100,
            age: 4,
            generation: 1,
            direction: 0,
            traits: { size: 1, speed: 1, visionRange: 10, turnRate: 0.05, metabolism: 0 },
            brain: { synapses: [] }
          }
        ],
        food: []
      });

      const params = {
        reproductionThreshold: 80,
        reproductionCost: 0,
        offspringStartEnergy: 20,
        maximumOrganismAge: 4,
        movementDelta: 0,
        metabolismPerTick: 0,
        movementCostMultiplier: 0,
        foodSpawnChance: 0
      };

      const result = runTicks(state, createSeededPrng('max-age-death'), 1, params);

      expect(result.organisms).toHaveLength(0);
    });

    it('produces deterministic reproduction with same seed', () => {
      const state = createWorldState({
        tick: 0,
        organisms: [
          { id: 'org-1', x: 50, y: 50, energy: 100, age: 0, generation: 1, direction: 0, traits: { size: 1, speed: 1, visionRange: 10, turnRate: 0.05 }, brain: { synapses: [] } }
        ],
        food: []
      });

      const params = {
        reproductionThreshold: 80,
        reproductionCost: 30,
        offspringStartEnergy: 20,
        movementDelta: 0,
        metabolismPerTick: 0,
        movementCostMultiplier: 0,
        foodSpawnChance: 0
      };

      // Run twice with same seed
      const result1 = runTicks(state, createSeededPrng('deterministic-repro'), 1, params);
      const result2 = runTicks(state, createSeededPrng('deterministic-repro'), 1, params);

      // Results should be identical
      expect(result1.organisms.length).toBe(result2.organisms.length);
      expect(result1.organisms[0].energy).toBe(result2.organisms[0].energy);
      expect(result1.organisms[1]?.energy).toBe(result2.organisms[1]?.energy);
    });

    it('inherits traits and brain from parent', () => {
      const state = createWorldState({
        tick: 0,
        organisms: [
          { 
            id: 'org-1', x: 50, y: 50, energy: 100, age: 0, generation: 1, direction: 0, color: '#3366cc',
            traits: { size: 2, speed: 3, visionRange: 15, turnRate: 0.1, metabolism: 0.2, eggHatchTime: 0 },
            brain: { synapses: [{ sourceId: 'in-energy', targetId: 'out-turn-left', weight: 0.5 }] } 
          }
        ],
        food: []
      });

      const params = {
        reproductionThreshold: 80,
        reproductionCost: 30,
        offspringStartEnergy: 20,
        movementDelta: 0,
        metabolismPerTick: 0,
        movementCostMultiplier: 0,
        foodSpawnChance: 0
      };

      const rng = createSeededPrng('inheritance-test');
      const result = runTicks(state, rng, 1, params);

      const offspring = result.organisms.find(o => o.id === 'org-2');
      
      // Traits should be inherited
      expect(offspring.traits.size).toBe(2);
      expect(offspring.traits.speed).toBe(3);
      expect(offspring.traits.eggHatchTime).toBe(0);
      expect(offspring.color).toBe('#3366cc');
      
      // Brain should be inherited
      expect(offspring.brain.synapses).toHaveLength(1);
      expect(offspring.brain.synapses[0].weight).toBe(0.5);
    });

    it('applies deterministic trait mutation with non-zero mutation rate', () => {
      const state = createWorldState({
        tick: 0,
        organisms: [
          { 
            id: 'org-1', x: 50, y: 50, energy: 100, age: 0, generation: 1, direction: 0, 
            traits: { size: 2, speed: 3, visionRange: 15, turnRate: 0.1, metabolism: 0.2, eggHatchTime: 3 },
            brain: { synapses: [] } 
          }
        ],
        food: []
      });

      const params = {
        reproductionThreshold: 80,
        reproductionCost: 30,
        offspringStartEnergy: 20,
        movementDelta: 0,
        metabolismPerTick: 0,
        movementCostMultiplier: 0,
        foodSpawnChance: 0,
        traitMutationRate: 1.0, // 100% chance to mutate each trait
        traitMutationMagnitude: 0.5
      };

      const rng = createSeededPrng('mutation-test');
      const result = runTicks(state, rng, 1, params);

      const offspring = result.organisms.find(o => o.id === 'org-2');
      
      // With 100% mutation rate and magnitude 0.5, traits should be different from parent
      // The mutation is (rng.nextFloat() * 2 - 1) * 0.5, so [-0.5, +0.5]
      // Original: size=2, speed=3, visionRange=15, turnRate=0.1, metabolism=0.2
      // Offspring traits should have changed (within bounds)
      expect(offspring.traits.size).toBeGreaterThanOrEqual(1.5);
      expect(offspring.traits.size).toBeLessThanOrEqual(2.5);
      expect(offspring.traits.speed).toBeGreaterThanOrEqual(2.5);
      expect(offspring.traits.speed).toBeLessThanOrEqual(3.5);
      expect(offspring.traits.eggHatchTime).toBeGreaterThanOrEqual(2.5);
      expect(offspring.traits.eggHatchTime).toBeLessThanOrEqual(3.5);
    });

    it('produces deterministic trait mutation with same seed', () => {
      const state = createWorldState({
        tick: 0,
        organisms: [
          { 
            id: 'org-1', x: 50, y: 50, energy: 100, age: 0, generation: 1, direction: 0, 
            traits: { size: 2, speed: 3, visionRange: 15, turnRate: 0.1, metabolism: 0.2, eggHatchTime: 3 },
            brain: { synapses: [] } 
          }
        ],
        food: []
      });

      const params = {
        reproductionThreshold: 80,
        reproductionCost: 30,
        offspringStartEnergy: 20,
        movementDelta: 0,
        metabolismPerTick: 0,
        movementCostMultiplier: 0,
        foodSpawnChance: 0,
        traitMutationRate: 1.0,
        traitMutationMagnitude: 0.5
      };

      // Run twice with same seed
      const result1 = runTicks(state, createSeededPrng('deterministic-mutation'), 1, params);
      const result2 = runTicks(state, createSeededPrng('deterministic-mutation'), 1, params);

      const offspring1 = result1.organisms.find(o => o.id === 'org-2');
      const offspring2 = result2.organisms.find(o => o.id === 'org-2');
      
      // Traits should be identical with same seed
      expect(offspring1.traits.size).toBe(offspring2.traits.size);
      expect(offspring1.traits.speed).toBe(offspring2.traits.speed);
      expect(offspring1.traits.visionRange).toBe(offspring2.traits.visionRange);
      expect(offspring1.traits.turnRate).toBe(offspring2.traits.turnRate);
      expect(offspring1.traits.metabolism).toBe(offspring2.traits.metabolism);
      expect(offspring1.traits.eggHatchTime).toBe(offspring2.traits.eggHatchTime);
    });

    it('can deterministically introduce hidden neurons during brain mutation', () => {
      const state = createWorldState({
        tick: 0,
        organisms: [
          {
            id: 'org-1',
            x: 0,
            y: 0,
            energy: 100,
            age: 0,
            generation: 1,
            direction: 0,
            traits: { size: 1, speed: 1, visionRange: 10, turnRate: 0.05, metabolism: 0, eggHatchTime: 0 },
            brain: {
              neurons: [
                { id: 'in-energy', type: 'input' },
                { id: 'out-forward', type: 'output' }
              ],
              synapses: [
                { id: 's1', sourceId: 'in-energy', targetId: 'out-forward', weight: 0.5 }
              ]
            }
          }
        ],
        food: []
      });

      const result = runTicks(state, createSeededPrng('hidden-seed'), 1, {
        reproductionThreshold: 80,
        reproductionCost: 0,
        offspringStartEnergy: 20,
        movementDelta: 0,
        metabolismPerTick: 0,
        movementCostMultiplier: 0,
        foodSpawnChance: 0,
        brainAddSynapseChance: 1,
        brainRemoveSynapseChance: 0,
        brainMutationRate: 1,
        brainMutationMagnitude: 0.5
      });

      const offspring = result.organisms.find((organism) => organism.id === 'org-2');

      expect(offspring.brain.neurons.some((neuron) => neuron.type === 'hidden')).toBe(true);
      expect(offspring.brain.synapses.some((synapse) => synapse.targetId.startsWith('hidden-'))).toBe(true);
    });

    it('scales food collection radius with organism visible size (deterministic)', () => {
      // Food at distance 3 from organism
      // Small organism (size=1) with base consumeRadius=2 cannot reach it
      // Large organism (size=4) can reach it
      const state = createWorldState({
        tick: 0,
        organisms: [
          { id: 'org-small', x: 0, y: 0, energy: 10, traits: { size: 1, speed: 1, visionRange: 1, turnRate: 1, metabolism: 0 } },
          { id: 'org-large', x: 0, y: 0, energy: 10, traits: { size: 4, speed: 1, visionRange: 1, turnRate: 1, metabolism: 0 } }
        ],
        food: [
          { id: 'food-1', x: 0, y: 3, energyValue: 5 }  // Distance 3 from organism
        ]
      });

      // Base consumeRadius is 2, so:
      // - org-small (size=1): effective radius = max(2, 1) = 2, cannot reach food at distance 3
      // - org-large (size=4): effective radius = max(2, 4) = 4, can reach food at distance 3
      const next = stepWorld(state, createSeededPrng('size-radius'), {
        movementDelta: 0,
        metabolismPerTick: 0,
        movementCostMultiplier: 0,
        agingCostMultiplier: 0,
        consumeRadius: 2,  // base radius
        foodSpawnChance: 0
      });

      const smallOrg = next.organisms.find(o => o.id === 'org-small');
      const largeOrg = next.organisms.find(o => o.id === 'org-large');

      // Small organism cannot reach food at distance 3 (effective radius = 2)
      expect(smallOrg.energy).toBe(10);
      // Large organism can reach food at distance 3 (effective radius = 4)
      expect(largeOrg.energy).toBe(15); // 10 + 5
      
      // Food should be consumed by large organism
      expect(next.food).toHaveLength(0);
    });

    it('uses visible size (traits.size) not total size for collection radius', () => {
      // Organism with explicit size trait
      const state = createWorldState({
        tick: 0,
        organisms: [
          { id: 'org-1', x: 0, y: 0, energy: 10, traits: { size: 3, speed: 1, visionRange: 1, turnRate: 1, metabolism: 0 } }
        ],
        food: [
          { id: 'food-1', x: 0, y: 2.5, energyValue: 5 }  // Distance 2.5
        ]
      });

      // With size=3, effective radius = max(2, 3) = 3, can reach food at distance 2.5
      const next = stepWorld(state, createSeededPrng('visible-size'), {
        movementDelta: 0,
        metabolismPerTick: 0,
        movementCostMultiplier: 0,
        agingCostMultiplier: 0,
        consumeRadius: 2,
        foodSpawnChance: 0
      });

      const org = next.organisms.find(o => o.id === 'org-1');
      expect(org.energy).toBe(15); // 10 + 5
      expect(next.food).toHaveLength(0);
    });
});

  describe('hazard interactions', () => {
    it('applies damage to organisms in danger zones', () => {
      const state = createWorldState({
        tick: 0,
        organisms: [
          { id: 'org-1', x: 50, y: 50, energy: 100, age: 0, generation: 1, direction: 0 }
        ],
        dangerZones: [
          { x: 50, y: 50, radius: 20, damagePerTick: 1 }
        ]
      });

      // Run several ticks and verify energy decreases
      let currentState = state;
      const rng = createSeededPrng('danger-zone-damage');
      
      for (let i = 0; i < 5; i++) {
        currentState = stepWorld(currentState, rng, {
          movementDelta: 0,
          metabolismPerTick: 0,
          movementCostMultiplier: 0
        });
      }

      const org = currentState.organisms.find(o => o.id === 'org-1');
      expect(org.energy).toBeLessThan(100);
    });

    it('blocks organisms from passing through obstacles', () => {
      const state = createWorldState({
        tick: 0,
        organisms: [
          { id: 'org-1', x: 10, y: 50, energy: 100, age: 0, generation: 1, direction: 0 }
        ],
        obstacles: [
          { x: 30, y: 40, width: 20, height: 20 }
        ]
      });

      // Try to move toward obstacle
      const next = stepWorld(state, createSeededPrng('obstacle-block'), {
        movementDelta: 50,
        metabolismPerTick: 0,
        movementCostMultiplier: 0
      });

      const org = next.organisms.find(o => o.id === 'org-1');
      // Organism should be pushed back or stopped by obstacle
      expect(org.x).toBeLessThan(30);
    });

    it('produces deterministic results with hazards', () => {
      const state = createWorldState({
        tick: 0,
        organisms: [
          { id: 'org-1', x: 50, y: 50, energy: 100, age: 0, generation: 1, direction: 0 }
        ],
        dangerZones: [
          { x: 50, y: 50, radius: 15, damagePerTick: 0.5 }
        ],
        obstacles: [
          { x: 70, y: 40, width: 10, height: 20 }
        ]
      });

      const rng1 = createSeededPrng('hazard-det-1');
      const rng2 = createSeededPrng('hazard-det-2');
      
      // Both should run same number of ticks with same seed sequence
      let s1 = state;
      let s2 = state;
      
      for (let i = 0; i < 10; i++) {
        s1 = stepWorld(s1, rng1, { movementDelta: 1, metabolismPerTick: 0.1 });
        s2 = stepWorld(s2, rng2, { movementDelta: 1, metabolismPerTick: 0.1 });
      }

      expect(s1.organisms).toEqual(s2.organisms);
      expect(s1.dangerZones).toEqual(s2.dangerZones);
      expect(s1.obstacles).toEqual(s2.obstacles);
    });

    it('includes hazard fields in snapshot output', () => {
      const state = createWorldState({
        tick: 0,
        organisms: [
          { id: 'org-1', x: 10, y: 20, energy: 100 }
        ],
        dangerZones: [
          { x: 50, y: 50, radius: 10, damagePerTick: 0.5 }
        ],
        obstacles: [
          { x: 30, y: 30, width: 5, height: 5 }
        ]
      });

      const next = stepWorld(state, createSeededPrng('hazard-fields'), {
        movementDelta: 0,
        metabolismPerTick: 0
      });

      expect(next).toHaveProperty('dangerZones');
      expect(next).toHaveProperty('obstacles');
      expect(Array.isArray(next.dangerZones)).toBe(true);
      expect(Array.isArray(next.obstacles)).toBe(true);
    });

    it('removes organisms when energy reaches zero from hazard damage', () => {
      const state = createWorldState({
        tick: 0,
        organisms: [
          { id: 'org-1', x: 50, y: 50, energy: 3, age: 0, generation: 1, direction: 0 }
        ],
        dangerZones: [
          { x: 50, y: 50, radius: 10, damagePerTick: 2 }
        ]
      });

      const rng = createSeededPrng('hazard-death-test');
      let currentState = state;

      // First tick: energy 3 - 2 = 1
      currentState = stepWorld(currentState, rng, {
        movementDelta: 0,
        metabolismPerTick: 0,
        movementCostMultiplier: 0
      });
      expect(currentState.organisms.length).toBe(1);
      expect(currentState.organisms[0].energy).toBe(1);

      // Second tick: energy 1 - 2 = -1, organism dies and is removed
      currentState = stepWorld(currentState, rng, {
        movementDelta: 0,
        metabolismPerTick: 0,
        movementCostMultiplier: 0
      });
      expect(currentState.organisms.length).toBe(0);
    });

    it('applies deterministic damage with same seed', () => {
      const createState = () => createWorldState({
        tick: 0,
        organisms: [
          { id: 'org-1', x: 50, y: 50, energy: 100, age: 0, generation: 1, direction: 0 }
        ],
        dangerZones: [
          { x: 50, y: 50, radius: 10, damagePerTick: 1 }
        ]
      });

      const rng1 = createSeededPrng('deterministic-hazard-seed');
      let result1 = createState();
      for (let i = 0; i < 10; i++) {
        result1 = stepWorld(result1, rng1, {
          movementDelta: 0,
          metabolismPerTick: 0,
          movementCostMultiplier: 0
        });
      }

      const rng2 = createSeededPrng('deterministic-hazard-seed');
      let result2 = createState();
      for (let i = 0; i < 10; i++) {
        result2 = stepWorld(result2, rng2, {
          movementDelta: 0,
          metabolismPerTick: 0,
          movementCostMultiplier: 0
        });
      }

      // Same seed + same params = identical results
      expect(result1.organisms[0].energy).toBe(result2.organisms[0].energy);
      expect(result1.organisms[0].energy).toBe(90); // 100 - (10 * 1)
    });
  });

  describe('terrain zone effects', () => {
    it('applies energy drain to organisms inside rocky terrain zones', () => {
      const state = createWorldState({
        tick: 0,
        organisms: [
          { id: 'org-1', x: 50, y: 50, energy: 100, age: 0, generation: 1, direction: 0, traits: { size: 1, speed: 1, visionRange: 10, turnRate: 0.05, metabolism: 0 } }
        ],
        terrainZones: [
          { id: 'zone-1', x: 30, y: 30, width: 50, height: 50, type: 'rock' }
        ]
      });

      const next = stepWorld(state, createSeededPrng('rocky-penalty'), {
        movementDelta: 0,
        metabolismPerTick: 0,
        movementCostMultiplier: 0,
        rockyTerrainPenalty: 0.5
      });

      const org = next.organisms.find(o => o.id === 'org-1');
      // Energy should be 100 - 0.5 (rocky penalty) = 99.5
      expect(org.energy).toBe(99.5);
    });

    it('does not apply rocky penalty to organisms outside rocky terrain zones', () => {
      const state = createWorldState({
        tick: 0,
        organisms: [
          { id: 'org-1', x: 10, y: 10, energy: 100, age: 0, generation: 1, direction: 0, traits: { size: 1, speed: 1, visionRange: 10, turnRate: 0.05, metabolism: 0 } }
        ],
        terrainZones: [
          { id: 'zone-1', x: 30, y: 30, width: 50, height: 50, type: 'rock' }
        ]
      });

      const next = stepWorld(state, createSeededPrng('rocky-no-penalty'), {
        movementDelta: 0,
        metabolismPerTick: 0,
        movementCostMultiplier: 0,
        rockyTerrainPenalty: 0.5
      });

      const org = next.organisms.find(o => o.id === 'org-1');
      // Energy should be unchanged (100 - 0) since organism is outside the rocky zone
      expect(org.energy).toBe(100);
    });

    it('does not apply rocky penalty when terrain zones have non-rocky types', () => {
      const state = createWorldState({
        tick: 0,
        organisms: [
          { id: 'org-1', x: 50, y: 50, energy: 100, age: 0, generation: 1, direction: 0, traits: { size: 1, speed: 1, visionRange: 10, turnRate: 0.05, metabolism: 0 } }
        ],
        terrainZones: [
          { id: 'zone-1', x: 30, y: 30, width: 50, height: 50, type: 'grass' }
        ]
      });

      const next = stepWorld(state, createSeededPrng('grass-zone'), {
        movementDelta: 0,
        metabolismPerTick: 0,
        movementCostMultiplier: 0,
        rockyTerrainPenalty: 0.5
      });

      const org = next.organisms.find(o => o.id === 'org-1');
      // Energy should be unchanged since zone is grass, not rock
      expect(org.energy).toBe(100);
    });

    it('does not apply rocky penalty when terrain zones are not provided', () => {
      const state = createWorldState({
        tick: 0,
        organisms: [
          { id: 'org-1', x: 50, y: 50, energy: 100, age: 0, generation: 1, direction: 0, traits: { size: 1, speed: 1, visionRange: 10, turnRate: 0.05, metabolism: 0 } }
        ]
      });

      const next = stepWorld(state, createSeededPrng('no-terrain'), {
        movementDelta: 0,
        metabolismPerTick: 0,
        movementCostMultiplier: 0,
        rockyTerrainPenalty: 0.5
      });

      const org = next.organisms.find(o => o.id === 'org-1');
      // Energy should be unchanged since no terrain zones exist
      expect(org.energy).toBe(100);
    });

    it('removes organisms when energy reaches zero from rocky terrain penalty', () => {
      const state = createWorldState({
        tick: 0,
        organisms: [
          { id: 'org-1', x: 50, y: 50, energy: 2, age: 0, generation: 1, direction: 0, traits: { size: 1, speed: 1, visionRange: 10, turnRate: 0.05, metabolism: 0 } }
        ],
        terrainZones: [
          { id: 'zone-1', x: 30, y: 30, width: 50, height: 50, type: 'rock' }
        ]
      });

      const rng = createSeededPrng('rocky-death');
      let currentState = state;

      // First tick: energy 2 - 1 = 1
      currentState = stepWorld(currentState, rng, {
        movementDelta: 0,
        metabolismPerTick: 0,
        movementCostMultiplier: 0,
        rockyTerrainPenalty: 1
      });
      expect(currentState.organisms.length).toBe(1);
      expect(currentState.organisms[0].energy).toBe(1);

      // Second tick: energy 1 - 1 = 0, organism dies and is removed
      currentState = stepWorld(currentState, rng, {
        movementDelta: 0,
        metabolismPerTick: 0,
        movementCostMultiplier: 0,
        rockyTerrainPenalty: 1
      });
      expect(currentState.organisms.length).toBe(0);
    });

    it('applies deterministic rocky terrain energy drain with same seed', () => {
      const createState = () => createWorldState({
        tick: 0,
        organisms: [
          { id: 'org-1', x: 50, y: 50, energy: 100, age: 0, generation: 1, direction: 0, traits: { size: 1, speed: 1, visionRange: 10, turnRate: 0.05, metabolism: 0 } }
        ],
        terrainZones: [
          { id: 'zone-1', x: 30, y: 30, width: 50, height: 50, type: 'rock' }
        ]
      });

      const rng1 = createSeededPrng('deterministic-rocky-seed');
      let result1 = createState();
      for (let i = 0; i < 10; i++) {
        result1 = stepWorld(result1, rng1, {
          movementDelta: 0,
          metabolismPerTick: 0,
          movementCostMultiplier: 0,
          rockyTerrainPenalty: 0.3
        });
      }

      const rng2 = createSeededPrng('deterministic-rocky-seed');
      let result2 = createState();
      for (let i = 0; i < 10; i++) {
        result2 = stepWorld(result2, rng2, {
          movementDelta: 0,
          metabolismPerTick: 0,
          movementCostMultiplier: 0,
          rockyTerrainPenalty: 0.3
        });
      }

      // Same seed + same params = identical results
      expect(result1.organisms[0].energy).toBe(result2.organisms[0].energy);
      // Energy: 100 - (10 * 0.3) = 97
      expect(result1.organisms[0].energy).toBeCloseTo(97, 5);
    });

    it('applies rocky penalty only when rockyTerrainPenalty > 0', () => {
      const state = createWorldState({
        tick: 0,
        organisms: [
          { id: 'org-1', x: 50, y: 50, energy: 100, age: 0, generation: 1, direction: 0, traits: { size: 1, speed: 1, visionRange: 10, turnRate: 0.05, metabolism: 0 } }
        ],
        terrainZones: [
          { id: 'zone-1', x: 30, y: 30, width: 50, height: 50, type: 'rock' }
        ]
      });

      // With rockyTerrainPenalty = 0, no penalty should be applied
      const next = stepWorld(state, createSeededPrng('zero-penalty'), {
        movementDelta: 0,
        metabolismPerTick: 0,
        movementCostMultiplier: 0,
        rockyTerrainPenalty: 0
      });

      const org = next.organisms.find(o => o.id === 'org-1');
      expect(org.energy).toBe(100);
    });

    it('matches behavior when terrain generation is disabled', () => {
      // With no terrain zones, behavior should match current non-terrain behavior
      const stateWithZones = createWorldState({
        tick: 0,
        organisms: [
          { id: 'org-1', x: 50, y: 50, energy: 100, age: 0, generation: 1, direction: 0, traits: { size: 1, speed: 1, visionRange: 10, turnRate: 0.05, metabolism: 0 } }
        ],
        terrainZones: []
      });

      const stateWithoutZones = createWorldState({
        tick: 0,
        organisms: [
          { id: 'org-1', x: 50, y: 50, energy: 100, age: 0, generation: 1, direction: 0, traits: { size: 1, speed: 1, visionRange: 10, turnRate: 0.05, metabolism: 0 } }
        ]
      });

      const rng1 = createSeededPrng('no-zones-seed');
      const result1 = stepWorld(stateWithZones, rng1, {
        movementDelta: 0,
        metabolismPerTick: 0,
        movementCostMultiplier: 0,
        rockyTerrainPenalty: 0
      });

      const rng2 = createSeededPrng('no-zones-seed');
      const result2 = stepWorld(stateWithoutZones, rng2, {
        movementDelta: 0,
        metabolismPerTick: 0,
        movementCostMultiplier: 0,
        rockyTerrainPenalty: 0
      });

      // Results should be identical
      expect(result1.organisms[0].energy).toBe(result2.organisms[0].energy);
    });

    it('combines rocky penalty with metabolism correctly', () => {
      const state = createWorldState({
        tick: 0,
        organisms: [
          { id: 'org-1', x: 50, y: 50, energy: 100, age: 0, generation: 1, direction: 0, traits: { size: 1, speed: 1, visionRange: 10, turnRate: 0.05, metabolism: 0.2 } }
        ],
        terrainZones: [
          { id: 'zone-1', x: 30, y: 30, width: 50, height: 50, type: 'rock' }
        ]
      });

      const next = stepWorld(state, createSeededPrng('combined-costs'), {
        movementDelta: 0,
        metabolismPerTick: 0,
        movementCostMultiplier: 0,
        rockyTerrainPenalty: 0.5
      });

      const org = next.organisms.find(o => o.id === 'org-1');
      // Energy: 100 - 0.2 (metabolism) - 0.5 (rocky penalty) = 99.3
      expect(org.energy).toBeCloseTo(99.3, 5);
    });
  });

});
