/**
 * Deterministic simulation tick engine skeleton.
 *
 * Contract:
 * - Input: current world state + seeded RNG + optional parameters
 * - Output: next world state (no in-place mutation)
 * - No ambient randomness (Math.random / Date.now)
 */

/**
 * @typedef {object} WorldOrganism
 * @property {string} id
 * @property {number} x
 * @property {number} y
 * @property {number} energy
 */

/**
 * @typedef {object} WorldFood
 * @property {string} id
 * @property {number} x
 * @property {number} y
 * @property {number} energyValue
 */

/**
 * @typedef {object} WorldState
 * @property {number} tick
 * @property {WorldOrganism[]} organisms
 * @property {WorldFood[]} food
 */

/**
 * @typedef {object} StepRng
 * @property {() => number} nextFloat
 * @property {(min: number, maxExclusive: number) => number} nextInt
 */

/**
 * @typedef {object} StepParams
 * @property {number} [movementDelta=1] max absolute movement in one axis per tick
 * @property {number} [metabolismPerTick=0.1] energy spent per tick
 * @property {number} [foodSpawnChance=0.05] probability to spawn one food per tick
 * @property {number} [foodEnergyValue=5] energy value for spawned food
 * @property {number} [worldWidth=100] world width used for spawn bounds
 * @property {number} [worldHeight=100] world height used for spawn bounds
 * @property {number} [maxFood=Infinity] maximum food entities in world
 */

/**
 * @param {Partial<WorldState>} [initial]
 * @returns {WorldState}
 */
export function createWorldState(initial = {}) {
  return {
    tick: initial.tick ?? 0,
    organisms: initial.organisms ? initial.organisms.map((o) => ({ ...o })) : [],
    food: initial.food ? initial.food.map((f) => ({ ...f })) : []
  };
}

/**
 * Advance the simulation by one deterministic tick.
 *
 * @param {WorldState} state
 * @param {StepRng} rng
 * @param {StepParams} [params]
 * @returns {WorldState}
 */
export function stepWorld(state, rng, params = {}) {
  const movementDelta = params.movementDelta ?? 1;
  const metabolismPerTick = params.metabolismPerTick ?? 0.1;
  const foodSpawnChance = params.foodSpawnChance ?? 0.05;
  const foodEnergyValue = params.foodEnergyValue ?? 5;
  const worldWidth = params.worldWidth ?? 100;
  const worldHeight = params.worldHeight ?? 100;
  const maxFood = params.maxFood ?? Number.POSITIVE_INFINITY;

  const organisms = state.organisms.map((organism) => {
    const dx = (rng.nextFloat() * 2 - 1) * movementDelta;
    const dy = (rng.nextFloat() * 2 - 1) * movementDelta;

    return {
      ...organism,
      x: organism.x + dx,
      y: organism.y + dy,
      energy: Math.max(0, organism.energy - metabolismPerTick)
    };
  });

  const nextFood = state.food.map((item) => ({ ...item }));

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

/**
 * @param {WorldState} initialState
 * @param {StepRng} rng
 * @param {number} ticks
 * @param {StepParams} [params]
 * @returns {WorldState}
 */
export function runTicks(initialState, rng, ticks, params = {}) {
  let current = createWorldState(initialState);

  for (let i = 0; i < ticks; i += 1) {
    current = stepWorld(current, rng, params);
  }

  return current;
}
