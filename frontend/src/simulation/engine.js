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
 * @typedef {object} WorldObstacle
 * @property {string} id
 * @property {number} x
 * @property {number} y
 * @property {number} width
 * @property {number} height
 */

/**
 * @typedef {object} WorldDangerZone
 * @property {string} id
 * @property {number} x
 * @property {number} y
 * @property {number} radius
 * @property {number} damagePerTick
 * @property {'lava' | 'acid' | 'radiation'} [type] - hazard type for visual differentiation
 */

/**
 * @typedef {object} WorldState
 * @property {number} tick
 * @property {WorldOrganism[]} organisms
 * @property {WorldFood[]} food
 * @property {WorldObstacle[]} [obstacles]
 * @property {WorldDangerZone[]} [dangerZones]
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
 * @property {WorldObstacle[]} [obstacles] obstacles in the world
 * @property {WorldDangerZone[]} [dangerZones] danger zones in the world
 */

/**
 * @param {Partial<WorldState>} [initial]
 * @returns {WorldState}
 */
export function createWorldState(initial = {}) {
  return {
    tick: initial.tick ?? 0,
    organisms: initial.organisms ? initial.organisms.map((o) => ({ ...o })) : [],
    food: initial.food ? initial.food.map((f) => ({ ...f })) : [],
    obstacles: initial.obstacles ? initial.obstacles.map((o) => ({ ...o })) : [],
    dangerZones: initial.dangerZones ? initial.dangerZones.map((d) => ({ ...d })) : []
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
 * Check if an organism collides with an obstacle (axis-aligned bounding box)
 * @param {WorldOrganism} organism
 * @param {WorldObstacle} obstacle
 * @returns {boolean}
 */
function isCollidingWithObstacle(organism, obstacle) {
  const organismRadius = (organism.traits?.size ?? 1) * 3; // Approximate radius
  // Check if organism's bounding circle overlaps with obstacle rectangle
  const closestX = Math.max(obstacle.x, Math.min(organism.x, obstacle.x + obstacle.width));
  const closestY = Math.max(obstacle.y, Math.min(organism.y, obstacle.y + obstacle.height));
  const dx = organism.x - closestX;
  const dy = organism.y - closestY;
  return (dx * dx + dy * dy) < (organismRadius * organismRadius);
}

/**
 * Check if an organism is inside a danger zone
 * @param {WorldOrganism} organism
 * @param {WorldDangerZone} dangerZone
 * @returns {boolean}
 */
function isInDangerZone(organism, dangerZone) {
  const dx = organism.x - dangerZone.x;
  const dy = organism.y - dangerZone.y;
  return (dx * dx + dy * dy) < (dangerZone.radius * dangerZone.radius);
}

/**
 * Apply danger zone damage to organisms
 * @param {WorldOrganism[]} organisms
 * @param {WorldDangerZone[]} dangerZones
 * @returns {WorldOrganism[]}
 */
function applyDangerZoneDamage(organisms, dangerZones) {
  if (!dangerZones || dangerZones.length === 0) {
    return organisms;
  }

  // Optimized: inline distance check to avoid function call overhead
  return organisms.map((organism) => {
    let totalDamage = 0;
    const orgX = organism.x;
    const orgY = organism.y;

    for (const zone of dangerZones) {
      const dx = orgX - zone.x;
      const dy = orgY - zone.y;
      // Inline squared distance check (avoids function call to isInDangerZone)
      if (dx * dx + dy * dy < zone.radius * zone.radius) {
        totalDamage += zone.damagePerTick;
      }
    }

    if (totalDamage > 0) {
      return {
        ...organism,
        energy: Math.max(0, organism.energy - totalDamage)
      };
    }
    return organism;
  });
}

/**
 * Handle obstacle collisions - push organisms out of obstacles
 * @param {WorldOrganism[]} organisms
 * @param {WorldObstacle[]} obstacles
 * @param {number} worldWidth
 * @param {number} worldHeight
 * @returns {WorldOrganism[]}
 */
function handleObstacleCollisions(organisms, obstacles, worldWidth, worldHeight) {
  if (!obstacles || obstacles.length === 0) {
    return organisms;
  }

  return organisms.map((organism) => {
    const organismRadius = (organism.traits?.size ?? 1) * 3;
    let newX = organism.x;
    let newY = organism.y;
    let collided = false;

    for (const obstacle of obstacles) {
      if (isCollidingWithObstacle({ ...organism, x: newX, y: newY }, obstacle)) {
        collided = true;
        // Push organism out of obstacle - find closest edge
        const centerX = obstacle.x + obstacle.width / 2;
        const centerY = obstacle.y + obstacle.height / 2;
        const dx = newX - centerX;
        const dy = newY - centerY;

        // Normalize and push to nearest edge
        const dist = Math.hypot(dx, dy);
        if (dist > 0) {
          const pushDist = organismRadius + 1;
          newX = centerX + (dx / dist) * (obstacle.width / 2 + pushDist);
          newY = centerY + (dy / dist) * (obstacle.height / 2 + pushDist);
        } else {
          // Center is inside - push up by default
          newY = obstacle.y - organismRadius - 1;
        }

        // Clamp to world bounds
        newX = Math.max(organismRadius, Math.min(worldWidth - organismRadius, newX));
        newY = Math.max(organismRadius, Math.min(worldHeight - organismRadius, newY));
      }
    }

    if (collided) {
      return { ...organism, x: newX, y: newY };
    }
    return organism;
  });
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
    const possibleTargets = ['out-turn-left', 'out-turn-right', 'out-forward'];
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
  const foodRadius = params.foodRadius ?? 3;
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
    const baseDirection = organism.direction ?? 0;
    const rotationDelta = deriveRotationDelta(organism);
    const direction = normalizeAngle(baseDirection + rotationDelta);
    const forwardDelta = deriveForwardDelta(organism);
    const boundedForwardDelta = Math.max(-movementDelta, Math.min(movementDelta, forwardDelta));
    const dx = Math.cos(direction) * boundedForwardDelta;
    const dy = Math.sin(direction) * boundedForwardDelta;

    return moveAndSpendEnergy({ ...organism, direction: baseDirection }, dx, dy, metabolismPerTick, movementCostMultiplier);
  });

  // Stable iteration ordering for deterministic food consumption.
  // Organisms consume in lexical id order; each organism can consume at most one food per tick.
  // Optimization: skip sort if already sorted (common case with incrementing IDs)
  const foodById = new Map(state.food.map((item) => [item.id, { ...item }]));
  const baseConsumeRadius = params.consumeRadius ?? 2;
  const consumedEnergyByOrganismId = new Map();

  let organismsByStableOrder = movedOrganisms;
  const needsSort = movedOrganisms.length > 1 &&
    movedOrganisms.some((org, i) => i > 0 && org.id.localeCompare(movedOrganisms[i - 1].id) < 0);
  if (needsSort) {
    organismsByStableOrder = [...movedOrganisms].sort((a, b) => a.id.localeCompare(b.id));
  }

  // Pre-compute effective consume radii for all organisms and find max for spatial index.
  // Food collection radius scales with organism's visible size (traits.size).
  // Uses visible size (not total size) - larger organisms can reach food from further away.
  // Formula: effectiveRadius = max(baseConsumeRadius, organism.traits.size + foodRadius)
  // This ensures minimum reachability while scaling proportionally with size.
  // Adding foodRadius ensures that when organisms visually overlap food, they collect it.
  const organismConsumeRadii = new Map();
  let maxConsumeRadius = baseConsumeRadius;
  for (const organism of organismsByStableOrder) {
    const organismSize = organism.traits?.size ?? 1;
    const effectiveRadius = Math.max(baseConsumeRadius, organismSize + foodRadius);
    organismConsumeRadii.set(organism.id, effectiveRadius);
    if (effectiveRadius > maxConsumeRadius) {
      maxConsumeRadius = effectiveRadius;
    }
  }

  // Build spatial index with max radius to ensure all organisms can find nearby food
  const indexCellSize = Math.max(maxConsumeRadius, 1);
  const { cells: foodCellsByKey, foodIdToCellKey } = buildFoodSpatialIndex(foodById.values(), indexCellSize);

  for (const organism of organismsByStableOrder) {
    if (foodById.size === 0) {
      break;
    }

    const consumeRadius = organismConsumeRadii.get(organism.id);
    const consumeRadiusSquared = consumeRadius * consumeRadius;

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
  // Optimization: skip sort if already sorted
  const offspringOrganisms = [];
  let nextOrganismNumericId = deriveNextOrganismNumericId(organisms);

  let organismsForReproduction = organisms;
  const needsReproSort = organisms.length > 1 &&
    organisms.some((org, i) => i > 0 && org.id.localeCompare(organisms[i - 1].id) < 0);
  if (needsReproSort) {
    organismsForReproduction = [...organisms].sort((a, b) => a.id.localeCompare(b.id));
  }

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

  // Apply hazard effects
  const hazards = params;
  const obstacles = hazards.obstacles ?? state.obstacles ?? [];
  const dangerZones = hazards.dangerZones ?? state.dangerZones ?? [];

  // Apply danger zone damage
  let finalOrganisms = applyDangerZoneDamage(organisms, dangerZones);

  // Filter out organisms that died from hazard damage
  finalOrganisms = finalOrganisms.filter((organism) => organism.energy > 0);

  // Handle obstacle collisions
  finalOrganisms = handleObstacleCollisions(finalOrganisms, obstacles, worldWidth, worldHeight);

  // Build return state - only include hazards if they exist
  const returnState = {
    tick: state.tick + 1,
    organisms: finalOrganisms,
    food: nextFood
  };

  // Always include hazards for deterministic replay parity
  returnState.obstacles = obstacles || [];
  returnState.dangerZones = dangerZones || [];

  return returnState;
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

// ============================================================
// Species Detection - Cluster organisms by genetic similarity
// ============================================================

/**
 * Calculate genetic distance between two organisms based on traits and brain.
 * Uses normalized Euclidean distance for traits and Jaccard similarity for brain synapses.
 * @param {WorldOrganism} a
 * @param {WorldOrganism} b
 * @returns {number} distance (0 = identical, higher = more different)
 */
function calculateGeneticDistance(a, b) {
  // Trait distance (normalized)
  const traitNames = ['size', 'speed', 'visionRange', 'turnRate', 'metabolism'];
  let traitDistance = 0;

  for (const trait of traitNames) {
    const aVal = Number(a?.traits?.[trait] ?? 0);
    const bVal = Number(b?.traits?.[trait] ?? 0);
    // Normalize by typical range for each trait
    const maxVals = { size: 5, speed: 5, visionRange: 50, turnRate: 1, metabolism: 1 };
    const normalizedDiff = (aVal - bVal) / (maxVals[trait] || 1);
    traitDistance += normalizedDiff * normalizedDiff;
  }
  traitDistance = Math.sqrt(traitDistance);

  // Brain distance (Jaccard-based)
  const synapsesA = a?.brain?.synapses ?? [];
  const synapsesB = b?.brain?.synapses ?? [];

  if (synapsesA.length === 0 && synapsesB.length === 0) {
    return traitDistance; // Only trait distance if both have no brain
  }

  // Create signature sets for brain comparison
  const sigA = new Set(synapsesAsignature(a.brain));
  const sigB = new Set(synapsesAsignature(b.brain));

  if (sigA.size === 0 && sigB.size === 0) {
    return traitDistance;
  }

  // Jaccard distance: 1 - (intersection / union)
  let intersection = 0;
  for (const s of sigA) {
    if (sigB.has(s)) intersection += 1;
  }
  const union = sigA.size + sigB.size - intersection;
  const brainDistance = union > 0 ? 1 - (intersection / union) : 0;

  // Combine distances (equal weight)
  return traitDistance + brainDistance;
}

/**
 * Create a signature string for each synapse (source -> target)
 * @param {object} brain
 * @returns {string[]}
 */
function synapsesAsignature(brain) {
  const synapses = brain?.synapses ?? [];
  return synapses.map(s => `${s.sourceNeuronId ?? s.source}_${s.targetNeuronId ?? s.target}`);
}

/**
 * Predefined species colors for visual distinction
 */
const SPECIES_COLORS = [
  '#38bdf8', // blue (default)
  '#f472b6', // pink
  '#a78bfa', // purple
  '#34d399', // emerald
  '#fbbf24', // amber
  '#fb7185', // rose
  '#22d3ee', // cyan
  '#a3e635', // lime
  '#f97316', // orange
  '#c084fc'  // violet
];

const GENERATION_COLORS = [
  '#22d3ee', // cyan - generation 0 (founder)
  '#34d399', // emerald - gen 1
  '#a3e635', // lime - gen 2
  '#fbbf24', // amber - gen 3
  '#fb923c', // orange - gen 4
  '#f97316', // deep orange - gen 5
  '#fb7185', // rose - gen 6
  '#f472b6', // pink - gen 7
  '#a78bfa', // purple - gen 8
  '#c084fc'  // violet - gen 9+
];

/**
 * Detect species in a population using agglomerative clustering.
 * Organisms with genetic distance below threshold are grouped into the same species.
 *
 * @param {WorldOrganism[]} organisms
 * @param {number} [similarityThreshold=0.5] max distance to be considered same species
 * @param {Map<string, string>} [previousSpeciesAssignments] optional previous species map to preserve stable IDs
 * @returns {Map<string, string>} Map of organism ID -> species ID
 */
export function detectSpecies(organisms, similarityThreshold = 0.5, previousSpeciesAssignments = null) {
  if (!organisms || organisms.length === 0) {
    return new Map();
  }

  // Find the next available species ID number to avoid collisions
  let nextSpeciesIdNum = 0;
  if (previousSpeciesAssignments) {
    for (const speciesId of previousSpeciesAssignments.values()) {
      const match = speciesId.match(/species-(\d+)/);
      if (match) {
        const num = parseInt(match[1], 10);
        if (num >= nextSpeciesIdNum) {
          nextSpeciesIdNum = num + 1;
        }
      }
    }
  }

  // Each organism starts as its own species
  // Preserve species IDs from previous assignments for existing organisms
  const speciesAssignments = new Map();
  const speciesRepresentatives = [];
  let newIdCounter = nextSpeciesIdNum;

  for (let i = 0; i < organisms.length; i++) {
    const o = organisms[i];
    let speciesId;

    // Use previous species assignment if available
    if (previousSpeciesAssignments && previousSpeciesAssignments.has(o.id)) {
      speciesId = previousSpeciesAssignments.get(o.id);
    } else {
      // New organism gets a new unique species ID
      speciesId = `species-${newIdCounter++}`;
    }

    speciesAssignments.set(o.id, speciesId);
    speciesRepresentatives.push({ organism: o, speciesId });
  }

  // Agglomerative clustering: merge closest species
  let hasMerged = true;
  while (hasMerged && speciesRepresentatives.length > 1) {
    hasMerged = false;

    let minDistance = Infinity;
    let mergePair = null;

    // Find closest pair of species representatives
    for (let i = 0; i < speciesRepresentatives.length; i++) {
      for (let j = i + 1; j < speciesRepresentatives.length; j++) {
        const repA = speciesRepresentatives[i];
        const repB = speciesRepresentatives[j];

        // Skip if already same species
        if (speciesAssignments.get(repA.organism.id) === speciesAssignments.get(repB.organism.id)) {
          continue;
        }

        const dist = calculateGeneticDistance(repA.organism, repB.organism);
        if (dist < minDistance) {
          minDistance = dist;
          mergePair = [i, j];
        }
      }
    }

    // Merge if below threshold
    if (mergePair && minDistance <= similarityThreshold) {
      hasMerged = true;
      const [idxA, idxB] = mergePair;
      const speciesIdA = speciesAssignments.get(speciesRepresentatives[idxA].organism.id);
      const speciesIdB = speciesAssignments.get(speciesRepresentatives[idxB].organism.id);

      // Merge all organisms from species B into species A
      for (const rep of speciesRepresentatives) {
        if (speciesAssignments.get(rep.organism.id) === speciesIdB) {
          speciesAssignments.set(rep.organism.id, speciesIdA);
        }
      }

      // Update representative to the one with lower ID (deterministic)
      if (speciesIdA.localeCompare(speciesIdB) > 0) {
        speciesRepresentatives[idxA] = speciesRepresentatives[idxB];
      }
      speciesRepresentatives.splice(idxB, 1);
    }
  }

  return speciesAssignments;
}

/**
 * Get a deterministic color for a species based on its ID.
 * @param {string} speciesId
 * @returns {string} hex color
 */
export function getSpeciesColor(speciesId) {
  if (!speciesId) return SPECIES_COLORS[0];

  // Extract numeric suffix from species ID (e.g., "species-5" -> 5)
  const match = speciesId.match(/species-(\d+)/);
  const index = match ? parseInt(match[1], 10) : 0;

  return SPECIES_COLORS[index % SPECIES_COLORS.length];
}

/**
 * Get color for an organism based on its generation.
 * Creates a visual gradient from cool (young) to warm (old) generations.
 * @param {number} generation - organism generation (0 = founder)
 * @returns {string} hex color
 */
export function getGenerationColor(generation) {
  const gen = Number.isFinite(generation) && generation >= 0 ? Math.floor(generation) : 0;
  return GENERATION_COLORS[gen % GENERATION_COLORS.length];
}

/**
 * Serialize a world state to JSON for storage/replay.
 * Creates a deep copy suitable for storage.
 * @param {WorldState} state
 * @returns {string} JSON string representation
 */
export function serializeWorldState(state) {
  const snapshot = createWorldState(state);
  return JSON.stringify(snapshot);
}

/**
 * Deserialize a world state from JSON.
 * @param {string} json
 * @returns {WorldState}
 */
export function deserializeWorldState(json) {
  return JSON.parse(json);
}

/**
 * Create a tick snapshot for replay recording.
 * Includes world state and metadata needed for deterministic replay.
 * @param {WorldState} state
 * @param {StepParams} [params] simulation parameters for replay configuration
 * @returns {object} snapshot object
 */
export function createTickSnapshot(state, params = {}) {
  return {
    tick: state.tick,
    organisms: state.organisms.map((o) => ({
      id: o.id,
      x: o.x,
      y: o.y,
      energy: o.energy,
      age: o.age,
      generation: o.generation,
      direction: o.direction,
      traits: { ...o.traits },
      genome: o.genome ? { ...o.genome } : undefined,
      brain: o.brain ? { ...o.brain } : undefined
    })),
    food: state.food.map((f) => ({
      id: f.id,
      x: f.x,
      y: f.y,
      energyValue: f.energyValue
    })),
    obstacles: state.obstacles,
    dangerZones: state.dangerZones,
    // Include params hash for replay verification
    paramsHash: hashParams(params)
  };
}

/**
 * Simple hash of params for verification (not cryptographic).
 * @param {StepParams} params
 * @returns {string}
 */
function hashParams(params) {
  const keys = Object.keys(params).sort();
  const parts = keys.map((k) => `${k}:${JSON.stringify(params[k])}`);
  return btoa(parts.join('|')).slice(0, 16);
}

/**
 * Create a replay recording containing all snapshots from start to end.
 * @param {WorldState[]} snapshots array of world states (one per tick)
 * @param {StepParams} params simulation parameters used
 * @param {string} [seed] optional seed for deterministic replay
 * @returns {object} complete replay data
 */
export function createReplayRecording(snapshots, params, seed = undefined) {
  return {
    version: 1,
    seed,
    params,
    startTick: snapshots.length > 0 ? snapshots[0].tick : 0,
    endTick: snapshots.length > 0 ? snapshots[snapshots.length - 1].tick : 0,
    snapshotCount: snapshots.length,
    snapshots: snapshots.map((s) => createTickSnapshot(s, params))
  };
}
