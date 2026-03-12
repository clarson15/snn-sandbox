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
 * @property {HazardObstacle[]} [obstacles]
 * @property {HazardDangerZone[]} [dangerZones]
 */

/**
 * @typedef {object} StepRng
 * @property {() => number} nextFloat
 * @property {(min: number, maxExclusive: number) => number} nextInt
 */

/**
 * @typedef {object} HazardObstacle
 * @property {string} id
 * @property {number} x
 * @property {number} y
 * @property {number} width
 * @property {number} height
 */

/**
 * @typedef {object} HazardDangerZone
 * @property {string} id
 * @property {number} x
 * @property {number} y
 * @property {number} radius
 * @property {number} damagePerTick
 * @property {string} [type] hazard type: 'water' | 'fire' | 'radiation' | 'acid'
 */

/**
 * @typedef {object} StepParams
 * @property {number} [movementDelta=1] max absolute movement in one axis per tick
 * @property {number} [metabolismPerTick=0.1] base energy spent per tick
 * @property {number} [movementCostMultiplier=0.05] movement energy cost multiplier per Euclidean distance
 * @property {number} [agingCostMultiplier=0] additional energy cost per tick per age unit (scales with organism age)
 * @property {number} [consumeRadius=2] max distance from organism to food for deterministic consumption
 * @property {number} [foodSpawnChance=0.05] probability to spawn one food per tick
 * @property {HazardObstacle[]} [obstacles] static obstacles that block organism movement
 * @property {HazardDangerZone[]} [dangerZones] zones that damage organisms
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

/**
 * Derive forward/backward movement from brain output.
 * @param {WorldOrganism} organism
 * @returns {number} forward signal (-1 to 1 range, negative = backward)
 */
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

    if (synapse.targetId === 'out-move-forward') {
      forwardSignal += synapse.weight;
    }
  }

  // Clamp to [-1, 1] range and scale by speed trait
  return Math.max(-1, Math.min(1, forwardSignal)) * speed;
}

function moveAndSpendEnergy(organism, dx, dy, metabolismPerTick, movementCostMultiplier, agingCostMultiplier) {
  // Use organism's metabolism trait for deterministic energy loss, fallback to param for backward compatibility
  const organismMetabolism = Number.isFinite(organism?.traits?.metabolism)
    ? organism.traits.metabolism
    : metabolismPerTick;
  const movementDistance = Math.hypot(dx, dy);
  // Age-based energy loss scales with current age: older organisms burn more energy
  const age = organism.age ?? 0;
  const agingCost = age * agingCostMultiplier;
  const energySpent = organismMetabolism + movementDistance * movementCostMultiplier + agingCost;
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
 * Check if a point collides with any obstacle.
 * @param {number} x
 * @param {number} y
 * @param {HazardObstacle[]} obstacles
 * @returns {boolean}
 */
function isPointInObstacle(x, y, obstacles) {
  if (!obstacles || obstacles.length === 0) {
    return false;
  }

  for (const obs of obstacles) {
    if (
      x >= obs.x &&
      x <= obs.x + obs.width &&
      y >= obs.y &&
      y <= obs.y + obs.height
    ) {
      return true;
    }
  }
  return false;
}

/**
 * Check if organism size overlaps with any obstacle.
 * @param {WorldOrganism} organism
 * @param {HazardObstacle[]} obstacles
 * @returns {boolean}
 */
function isOrganismInObstacle(organism, obstacles) {
  if (!obstacles || obstacles.length === 0) {
    return false;
  }

  const size = organism.traits?.size ?? 1;
  const radius = size / 2;

  // Check all four corners of the organism's bounding box
  return (
    isPointInObstacle(organism.x - radius, organism.y - radius, obstacles) ||
    isPointInObstacle(organism.x + radius, organism.y - radius, obstacles) ||
    isPointInObstacle(organism.x - radius, organism.y + radius, obstacles) ||
    isPointInObstacle(organism.x + radius, organism.y + radius, obstacles)
  );
}

/**
 * Calculate total danger zone damage for an organism.
 * @param {WorldOrganism} organism
 * @param {HazardDangerZone[]} dangerZones
 * @returns {number}
 */
function calculateDangerZoneDamage(organism, dangerZones) {
  if (!dangerZones || dangerZones.length === 0) {
    return 0;
  }

  // Optimized: use simple loop (fast path for typical 1-2 danger zones)
  let totalDamage = 0;
  const orgX = organism.x;
  const orgY = organism.y;

  for (const zone of dangerZones) {
    const dx = orgX - zone.x;
    const dy = orgY - zone.y;
    // Inline squared distance check (avoids Math.hypot call)
    if (dx * dx + dy * dy <= zone.radius * zone.radius) {
      totalDamage += zone.damagePerTick;
    }
  }

  return totalDamage;
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
  const agingCostMultiplier = params.agingCostMultiplier ?? 0;
  const reproductionThreshold = params.reproductionThreshold ?? Number.POSITIVE_INFINITY;
  const reproductionCost = params.reproductionCost ?? 0;
  const offspringStartEnergy = params.offspringStartEnergy ?? 0;
  // Hazards are stored in world state (created at initialization)
  const obstacles = state.obstacles ?? [];
  const dangerZones = state.dangerZones ?? [];

  const movedOrganisms = state.organisms.map((organism) => {
    // Get forward/backward movement from brain output
    const forwardSignal = deriveForwardDelta(organism);
    // Movement distance based on brain output (positive = forward, negative = backward)
    const movementDistance = forwardSignal * movementDelta;
    // Calculate direction-aware movement (along organism's facing direction)
    const direction = organism.direction ?? 0;
    const dx = Math.cos(direction) * movementDistance;
    const dy = Math.sin(direction) * movementDistance;

    // Calculate new position
    const newX = organism.x + dx;
    const newY = organism.y + dy;

    // Check if new position would be inside an obstacle or out of bounds
    const size = organism.traits?.size ?? 1;
    const radius = size / 2;
    const inObstacle = isPointInObstacle(newX, newY, obstacles);
    const outOfBounds = newX < radius || newX > worldWidth - radius || newY < radius || newY > worldHeight - radius;

    // Block movement if hitting obstacle or bounds
    let finalDx = dx;
    let finalDy = dy;
    if (inObstacle || outOfBounds) {
      finalDx = 0;
      finalDy = 0;
    }

    return moveAndSpendEnergy(organism, finalDx, finalDy, metabolismPerTick, movementCostMultiplier, agingCostMultiplier);
  });

  // Apply danger zone damage after movement
  const organismsWithHazardDamage = movedOrganisms.map((organism) => {
    const damage = calculateDangerZoneDamage(organism, dangerZones);
    if (damage > 0) {
      return {
        ...organism,
        energy: Math.max(0, organism.energy - damage)
      };
    }
    return organism;
  });

  // Stable iteration ordering for deterministic food consumption.
  // Organisms consume in lexical id order; each organism can consume at most one food per tick.
  // Optimization: skip sort if already sorted (common case with incrementing IDs)
  const foodById = new Map(state.food.map((item) => [item.id, { ...item }]));
  const baseConsumeRadius = params.consumeRadius ?? 2;
  const consumedEnergyByOrganismId = new Map();

  let organismsByStableOrder = organismsWithHazardDamage;
  // Quick check if sorting needed: only sort if array is not already in ID order
  const needsSort = organismsWithHazardDamage.length > 1 &&
    organismsWithHazardDamage.some((org, i) => i > 0 && org.id.localeCompare(organismsWithHazardDamage[i - 1].id) < 0);
  if (needsSort) {
    organismsByStableOrder = [...organismsWithHazardDamage].sort((a, b) => a.id.localeCompare(b.id));
  }

  // Pre-compute effective consume radii for all organisms and find max for spatial index.
  // Food collection radius scales with organism's visible size (traits.size).
  // Uses visible size (not total size) - larger organisms can reach food from further away.
  // Formula: effectiveRadius = max(baseConsumeRadius, organism.traits.size)
  // This ensures minimum reachability while scaling proportionally with size.
  const organismConsumeRadii = new Map();
  let maxConsumeRadius = baseConsumeRadius;
  for (const organism of organismsByStableOrder) {
    const organismSize = organism.traits?.size ?? 1;
    const effectiveRadius = Math.max(baseConsumeRadius, organismSize);
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
    ? buildOrganismSpatialIndex(organismsWithHazardDamage, interactionCellSize)
    : null;

  let organisms = organismsWithHazardDamage
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
  const reproducingOrganisms = [];
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
      reproducingOrganisms.push(organism);

      // Create offspring
      const offspringId = `org-${nextOrganismNumericId}`;
      nextOrganismNumericId += 1;

      // Offspring spawns at parent's position (with small random offset using seeded RNG)
      const offsetRange = 2;
      const offspringX = organism.x + (rng.nextFloat() * 2 - 1) * offsetRange;
      const offspringY = organism.y + (rng.nextFloat() * 2 - 1) * offsetRange;

      offspringOrganisms.push({
        id: offspringId,
        x: Math.max(0, Math.min(worldWidth, offspringX)),
        y: Math.max(0, Math.min(worldHeight, offspringY)),
        energy: offspringStartEnergy,
        age: 0,
        generation: organism.generation + 1,
        direction: organism.direction,
        traits: { ...organism.traits },
        brain: organism.brain ? { ...organism.brain, synapses: [...(organism.brain.synapses || [])] } : { synapses: [] }
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
