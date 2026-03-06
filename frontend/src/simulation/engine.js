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
 * @property {number} [metabolismPerTick=0.1] base energy spent per tick
 * @property {number} [movementCostMultiplier=0.05] movement energy cost multiplier per Euclidean distance
 * @property {number} [consumeRadius=2] max distance from organism to food for deterministic consumption
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
 * @param {WorldOrganism} organism
 * @param {number} dx
 * @param {number} dy
 * @param {number} metabolismPerTick
 * @param {number} movementCostMultiplier
 * @returns {WorldOrganism}
 */
function moveAndSpendEnergy(organism, dx, dy, metabolismPerTick, movementCostMultiplier) {
  const movementDistance = Math.hypot(dx, dy);
  const energySpent = metabolismPerTick + movementDistance * movementCostMultiplier;

  return {
    ...organism,
    x: organism.x + dx,
    y: organism.y + dy,
    energy: Math.max(0, organism.energy - energySpent)
  };
}

/**
 * @param {WorldOrganism} organism
 * @param {WorldFood} food
 * @returns {number}
 */
function squaredDistance(organism, food) {
  const dx = organism.x - food.x;
  const dy = organism.y - food.y;
  return dx * dx + dy * dy;
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

    return moveAndSpendEnergy(organism, dx, dy, metabolismPerTick, movementCostMultiplier);
  });

  // Stable iteration ordering for deterministic food consumption.
  // Organisms consume in lexical id order; each organism can consume at most one food per tick.
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
      consumedEnergyByOrganismId.set(
        organism.id,
        (consumedEnergyByOrganismId.get(organism.id) ?? 0) + food.energyValue
      );
      foodById.delete(chosenFoodId);
    }
  }

  const organisms = movedOrganisms.map((organism) => ({
    ...organism,
    energy: organism.energy + (consumedEnergyByOrganismId.get(organism.id) ?? 0)
  }));

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

/**
 * Run deterministic ticks according to a scheduling profile where each
 * entry represents how many discrete simulation ticks should be processed.
 * A value of 0 represents a paused scheduler frame.
 *
 * @param {WorldState} initialState
 * @param {StepRng} rng
 * @param {number[]} schedule
 * @param {StepParams} [params]
 * @returns {WorldState}
 */
export function runTickSchedule(initialState, rng, schedule, params = {}) {
  let current = createWorldState(initialState);

  for (const ticksThisFrame of schedule) {
    for (let i = 0; i < ticksThisFrame; i += 1) {
      current = stepWorld(current, rng, params);
    }
  }

  return current;
}
