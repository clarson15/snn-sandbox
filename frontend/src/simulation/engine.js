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
 * @property {number} age
 * @property {number} generation
 * @property {string} [parentId] id of parent organism (set on reproduction)
 * @property {number} [direction] heading in radians
 * @property {{size:number,speed:number,visionRange:number,turnRate:number,metabolism:number}} traits
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
 * @property {number} [minimumPopulation=0] minimum number of organisms to maintain
 * @property {(id: string, rng: StepRng) => WorldOrganism} [createFloorSpawnOrganism] factory for floor-spawn organisms
 * @property {number} [interactionRadius=0] radius used for organism-to-organism proximity checks
 * @property {number} [interactionCostPerNeighbor=0] deterministic energy cost per nearby organism
 * @property {'spatial'|'legacy'} [interactionLookupMode='spatial'] query strategy used for organism proximity checks
 * @property {number} [reproductionThreshold=Infinity] minimum energy required for organism to reproduce
 * @property {number} [reproductionCost=0] energy deducted from parent on reproduction
 * @property {number} [offspringStartEnergy=0] energy given to offspring on creation
 * @property {number} [traitMutationRate=0.1] probability of mutating each trait (0-1)
 * @property {number} [traitMutationMagnitude=0.2] max absolute change to trait values
 * @property {number} [brainMutationRate=0.1] probability of mutating each synapse weight (0-1)
 * @property {number} [brainMutationMagnitude=0.2] max absolute change to synapse weights
 * @property {number} [brainAddSynapseChance=0.05] probability of adding a new synapse (0-1)
 * @property {number} [brainRemoveSynapseChance=0.05] probability of removing a synapse (0-1)
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

function moveAndSpendEnergy(organism, dx, dy, metabolismPerTick, movementCostMultiplier) {
  // Use organism's metabolism trait for deterministic energy loss, fallback to param for backward compatibility
  const organismMetabolism = Number.isFinite(organism?.traits?.metabolism)
    ? organism.traits.metabolism
    : metabolismPerTick;
  const movementDistance = Math.hypot(dx, dy);
  const energySpent = organismMetabolism + movementDistance * movementCostMultiplier;
  const baseDirection = organism.direction ?? 0;
  const rotationDelta = deriveRotationDelta(organism);
  const direction = normalizeAngle(baseDirection + rotationDelta);

  return {
    ...organism,
    x: organism.x + dx,
    y: organism.y + dy,
    age: organism.age + 1,
    direction,
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

function deriveNextOrganismNumericId(organisms) {
  const maxNumericId = organisms.reduce((max, organism) => {
    const match = /^org-(\d+)$/.exec(String(organism.id));
    if (!match) {
      return max;
    }

    const numericId = Number.parseInt(match[1], 10);
    return Number.isInteger(numericId) ? Math.max(max, numericId) : max;
  }, 0);

  return maxNumericId + 1;
}

function toCellIndex(value, cellSize) {
  return Math.floor(value / cellSize);
}

function toCellKey(cellX, cellY) {
  return `${cellX},${cellY}`;
}

function buildFoodSpatialIndex(foodItems, cellSize) {
  const foodIdToCellKey = new Map();
  const cells = new Map();

  for (const food of foodItems) {
    const cellX = toCellIndex(food.x, cellSize);
    const cellY = toCellIndex(food.y, cellSize);
    const key = toCellKey(cellX, cellY);

    if (!cells.has(key)) {
      cells.set(key, new Set());
    }

    cells.get(key).add(food.id);
    foodIdToCellKey.set(food.id, key);
  }

  return { cells, foodIdToCellKey };
}

function buildOrganismSpatialIndex(organisms, cellSize) {
  const cells = new Map();

  for (const organism of organisms) {
    const cellX = toCellIndex(organism.x, cellSize);
    const cellY = toCellIndex(organism.y, cellSize);
    const key = toCellKey(cellX, cellY);

    if (!cells.has(key)) {
      cells.set(key, []);
    }

    cells.get(key).push(organism);
  }

  for (const [, cellOrganisms] of cells) {
    cellOrganisms.sort((a, b) => a.id.localeCompare(b.id));
  }

  return cells;
}

function countNeighborsWithSpatialLookup(organism, cellsByKey, radius, radiusSquared, cellSize) {
  let neighborCount = 0;
  const minCellX = toCellIndex(organism.x - radius, cellSize);
  const maxCellX = toCellIndex(organism.x + radius, cellSize);
  const minCellY = toCellIndex(organism.y - radius, cellSize);
  const maxCellY = toCellIndex(organism.y + radius, cellSize);

  for (let cellX = minCellX; cellX <= maxCellX; cellX += 1) {
    for (let cellY = minCellY; cellY <= maxCellY; cellY += 1) {
      const cellOrganisms = cellsByKey.get(toCellKey(cellX, cellY));
      if (!cellOrganisms || cellOrganisms.length === 0) {
        continue;
      }

      for (const candidate of cellOrganisms) {
        if (candidate.id === organism.id) {
          continue;
        }

        const dx = organism.x - candidate.x;
        const dy = organism.y - candidate.y;
        const distanceSquared = dx * dx + dy * dy;

        if (distanceSquared <= radiusSquared) {
          neighborCount += 1;
        }
      }
    }
  }

  return neighborCount;
}

function countNeighborsWithLegacyLookup(organism, organismsByStableOrder, radiusSquared) {
  let neighborCount = 0;

  for (const candidate of organismsByStableOrder) {
    if (candidate.id === organism.id) {
      continue;
    }

    const dx = organism.x - candidate.x;
    const dy = organism.y - candidate.y;
    const distanceSquared = dx * dx + dy * dy;

    if (distanceSquared <= radiusSquared) {
      neighborCount += 1;
    }
  }

  return neighborCount;
}

/**
 * Apply deterministic mutations to offspring traits.
 * @param {object} parentTraits - traits object from parent organism
 * @param {StepRng} rng - seeded random number generator
 * @param {number} mutationRate - probability of mutating each trait
 * @param {number} mutationMagnitude - max absolute change to trait values
 * @returns {object} mutated traits
 */
function mutateTraits(parentTraits, rng, mutationRate, mutationMagnitude) {
  const mutatedTraits = { ...parentTraits };
  for (const traitName of Object.keys(mutatedTraits)) {
    if (rng.nextFloat() < mutationRate) {
      // Apply random mutation within [-mutationMagnitude, +mutationMagnitude]
      const mutation = (rng.nextFloat() * 2 - 1) * mutationMagnitude;
      mutatedTraits[traitName] = Math.max(0, mutatedTraits[traitName] + mutation);
    }
  }
  return mutatedTraits;
}

/**
 * Apply deterministic mutations to offspring brain (synapses).
 * @param {object} parentBrain - brain object from parent organism
 * @param {StepRng} rng - seeded random number generator
 * @param {number} mutationRate - probability of mutating each synapse weight
 * @param {number} mutationMagnitude - max absolute change to synapse weights
 * @param {number} addSynapseChance - probability of adding a new synapse
 * @param {number} removeSynapseChance - probability of removing a synapse
 * @returns {object} mutated brain
 */
function mutateBrain(parentBrain, rng, mutationRate, mutationMagnitude, addSynapseChance, removeSynapseChance) {
  if (!parentBrain || !parentBrain.synapses) {
    // Create empty brain with possibility of adding initial synapses
    const brain = { synapses: [] };
    // Chance to add initial synapse
    if (rng.nextFloat() < addSynapseChance * 3) {
      brain.synapses.push({
        sourceId: 'in-energy',
        targetId: 'out-turn-left',
        weight: (rng.nextFloat() * 2 - 1) * mutationMagnitude
      });
    }
    return brain;
  }

  // Copy synapses
  let synapses = parentBrain.synapses.map((s) => ({ ...s }));

  // Remove synapses with probability
  if (removeSynapseChance > 0 && synapses.length > 0) {
    synapses = synapses.filter(() => rng.nextFloat() >= removeSynapseChance);
  }

  // Mutate existing synapse weights
  for (const synapse of synapses) {
    if (rng.nextFloat() < mutationRate) {
      const weightMutation = (rng.nextFloat() * 2 - 1) * mutationMagnitude;
      synapse.weight += weightMutation;
    }
  }

  // Add new synapses with probability
  if (rng.nextFloat() < addSynapseChance) {
    // Add a new synapse with random source/target
    const possibleSources = ['in-energy', 'in-age', 'in-x', 'in-y', 'in-direction', 'in-size', 'in-speed'];
    const possibleTargets = ['out-turn-left', 'out-turn-right', 'out-move', 'out-gamma'];
    const sourceId = possibleSources[Math.floor(rng.nextFloat() * possibleSources.length)];
    const targetId = possibleTargets[Math.floor(rng.nextFloat() * possibleTargets.length)];
    synapses.push({
      sourceId,
      targetId,
      weight: (rng.nextFloat() * 2 - 1) * mutationMagnitude
    });
  }

  return { ...parentBrain, synapses };
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
  const minimumPopulation = params.minimumPopulation ?? 0;
  const createFloorSpawnOrganism = params.createFloorSpawnOrganism;
  const interactionRadius = params.interactionRadius ?? 0;
  const interactionCostPerNeighbor = params.interactionCostPerNeighbor ?? 0;
  const interactionLookupMode = params.interactionLookupMode ?? 'spatial';
  const reproductionThreshold = params.reproductionThreshold ?? Number.POSITIVE_INFINITY;
  const reproductionCost = params.reproductionCost ?? 0;
  const offspringStartEnergy = params.offspringStartEnergy ?? 0;
  const traitMutationRate = params.traitMutationRate ?? 0.1;
  const traitMutationMagnitude = params.traitMutationMagnitude ?? 0.2;
  const brainMutationRate = params.brainMutationRate ?? 0.1;
  const brainMutationMagnitude = params.brainMutationMagnitude ?? 0.2;
  const brainAddSynapseChance = params.brainAddSynapseChance ?? 0.05;
  const brainRemoveSynapseChance = params.brainRemoveSynapseChance ?? 0.05;

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
  const indexCellSize = Math.max(consumeRadius, 1);
  const { cells: foodCellsByKey, foodIdToCellKey } = buildFoodSpatialIndex(foodById.values(), indexCellSize);

  const organismsByStableOrder = [...movedOrganisms].sort((a, b) => a.id.localeCompare(b.id));

  for (const organism of organismsByStableOrder) {
    if (foodById.size === 0) {
      break;
    }

    let chosenFoodId = null;
    let chosenDistance = Number.POSITIVE_INFINITY;

    const minCellX = toCellIndex(organism.x - consumeRadius, indexCellSize);
    const maxCellX = toCellIndex(organism.x + consumeRadius, indexCellSize);
    const minCellY = toCellIndex(organism.y - consumeRadius, indexCellSize);
    const maxCellY = toCellIndex(organism.y + consumeRadius, indexCellSize);

    for (let cellX = minCellX; cellX <= maxCellX; cellX += 1) {
      for (let cellY = minCellY; cellY <= maxCellY; cellY += 1) {
        const cellFoodIds = foodCellsByKey.get(toCellKey(cellX, cellY));
        if (!cellFoodIds || cellFoodIds.size === 0) {
          continue;
        }

        for (const foodId of cellFoodIds) {
          const food = foodById.get(foodId);
          if (!food) {
            continue;
          }

          const distance = squaredDistance(organism, food);

          if (distance > consumeRadiusSquared) {
            continue;
          }

          if (
            distance < chosenDistance ||
            (distance === chosenDistance && (chosenFoodId === null || foodId < chosenFoodId))
          ) {
            chosenDistance = distance;
            chosenFoodId = foodId;
          }
        }
      }
    }

    if (chosenFoodId !== null) {
      const food = foodById.get(chosenFoodId);
      consumedEnergyByOrganismId.set(
        organism.id,
        (consumedEnergyByOrganismId.get(organism.id) ?? 0) + food.energyValue
      );
      foodById.delete(chosenFoodId);

      const consumedFoodCellKey = foodIdToCellKey.get(chosenFoodId);
      if (consumedFoodCellKey) {
        const cellFoodIds = foodCellsByKey.get(consumedFoodCellKey);
        if (cellFoodIds) {
          cellFoodIds.delete(chosenFoodId);
          if (cellFoodIds.size === 0) {
            foodCellsByKey.delete(consumedFoodCellKey);
          }
        }
        foodIdToCellKey.delete(chosenFoodId);
      }
    }
  }

  const shouldApplyInteractionCost = interactionRadius > 0 && interactionCostPerNeighbor > 0;
  const interactionRadiusSquared = interactionRadius * interactionRadius;
  const interactionCellSize = Math.max(interactionRadius, 1);
  const organismInteractionCells = shouldApplyInteractionCost && interactionLookupMode === 'spatial'
    ? buildOrganismSpatialIndex(movedOrganisms, interactionCellSize)
    : null;

  let organisms = movedOrganisms
    .map((organism) => ({
      ...organism,
      energy: organism.energy + (consumedEnergyByOrganismId.get(organism.id) ?? 0)
    }))
    .map((organism) => {
      if (!shouldApplyInteractionCost) {
        return organism;
      }

      const neighborCount = interactionLookupMode === 'legacy'
        ? countNeighborsWithLegacyLookup(organism, organismsByStableOrder, interactionRadiusSquared)
        : countNeighborsWithSpatialLookup(
          organism,
          organismInteractionCells,
          interactionRadius,
          interactionRadiusSquared,
          interactionCellSize
        );

      if (neighborCount === 0) {
        return organism;
      }

      const interactionCost = neighborCount * interactionCostPerNeighbor;
      return {
        ...organism,
        energy: Math.max(0, organism.energy - interactionCost)
      };
    })
    .filter((organism) => organism.energy > 0);

  // Deterministic reproduction: organisms with energy >= threshold reproduce
  // Organisms are processed in stable id order for reproducibility
  const offspringOrganisms = [];
  let nextOrganismNumericId = deriveNextOrganismNumericId(organisms);

  const organismsForReproduction = [...organisms].sort((a, b) => a.id.localeCompare(b.id));

  for (const organism of organismsForReproduction) {
    if (organism.energy >= reproductionThreshold) {
      // Create offspring
      const offspringId = `org-${nextOrganismNumericId}`;
      nextOrganismNumericId += 1;

      // Offspring spawns at parent's position (with small random offset using seeded RNG)
      const offsetRange = 2;
      const offspringX = organism.x + (rng.nextFloat() * 2 - 1) * offsetRange;
      const offspringY = organism.y + (rng.nextFloat() * 2 - 1) * offsetRange;

      // Apply deterministic mutations to traits and brain
      const mutatedTraits = mutateTraits(organism.traits, rng, traitMutationRate, traitMutationMagnitude);
      const mutatedBrain = mutateBrain(organism.brain, rng, brainMutationRate, brainMutationMagnitude, brainAddSynapseChance, brainRemoveSynapseChance);

      offspringOrganisms.push({
        id: offspringId,
        x: Math.max(0, Math.min(worldWidth, offspringX)),
        y: Math.max(0, Math.min(worldHeight, offspringY)),
        energy: offspringStartEnergy,
        age: 0,
        generation: organism.generation + 1,
        parentId: organism.id,
        direction: organism.direction,
        traits: mutatedTraits,
        brain: mutatedBrain
      });

      // Deduct energy from parent
      organism.energy -= reproductionCost;
    }
  }

  // Add offspring to organisms array
  if (offspringOrganisms.length > 0) {
    organisms = organisms.concat(offspringOrganisms);
  }

  if (minimumPopulation > 0 && organisms.length < minimumPopulation && typeof createFloorSpawnOrganism === 'function') {
    const organismsToSpawn = minimumPopulation - organisms.length;
    let nextNumericId = deriveNextOrganismNumericId(organisms);

    const spawned = Array.from({ length: organismsToSpawn }, () => {
      const organism = createFloorSpawnOrganism(`org-${nextNumericId}`, rng);
      nextNumericId += 1;
      return organism;
    });

    organisms = organisms.concat(spawned);
  }

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
