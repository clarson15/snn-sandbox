/**
 * Deterministic simulation tick engine skeleton.
 *
 * Contract:
 * - Input: current world state + seeded RNG + optional parameters
 * - Output: next world state (no in-place mutation)
 * - No ambient randomness (Math.random / Date.now)
 */

import {
  createNeuronDefinition,
  getInputNeuronIdsForOrganismType,
  isInputNeuronId,
  isOutputNeuronId,
  OUTPUT_NEURON_IDS
} from './brainSchema.js';

/**
 * @typedef {object} WorldOrganism
 * @property {string} id
 * @property {number} x
 * @property {number} y
 * @property {string} [color]
 * @property {number} energy
 * @property {number} age
 * @property {number} generation
 * @property {string} [parentId] id of parent organism (set on reproduction)
 * @property {number} [lastReproductionTick] most recent tick when organism reproduced
 * @property {number} [direction] heading in radians
 * @property {'egg'} [lifeStage]
 * @property {number} [incubationAge]
 * @property {{size:number,speed:number,visionRange:number,turnRate:number,metabolism:number,adolescenceAge?:number,eggHatchTime?:number}} traits
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
 * @typedef {object} WorldTerrainZone
 * @property {string} id
 * @property {string} type
 * @property {{x:number,y:number,width:number,height:number}} bounds
 */

/**
 * @typedef {object} WorldState
 * @property {number} tick
 * @property {WorldOrganism[]} organisms
 * @property {WorldFood[]} food
 * @property {WorldObstacle[]} [obstacles]
 * @property {WorldDangerZone[]} [dangerZones]
 * @property {WorldTerrainZone[]} [terrainZones]
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
 * @property {number} [reproductionMinimumAge=0] minimum organism age required before reproduction
 * @property {number} [reproductionRefractoryPeriod=0] minimum ticks between reproduction events
 * @property {number} [maximumOrganismAge=Infinity] organisms older than this age die before reproduction
 * @property {number} [traitMutationRate=0.1] probability of mutating each trait (0-1)
 * @property {number} [traitMutationMagnitude=0.2] max absolute change to trait values
 * @property {number} [brainMutationRate=0.1] probability of mutating each synapse weight (0-1)
 * @property {number} [brainMutationMagnitude=0.2] max absolute change to synapse weights
 * @property {number} [brainAddSynapseChance=0.05] probability of adding a new synapse (0-1)
 * @property {number} [brainRemoveSynapseChance=0.05] probability of removing a synapse (0-1)
 * @property {WorldObstacle[]} [obstacles] obstacles in the world
 * @property {WorldDangerZone[]} [dangerZones] danger zones in the world
 * @property {WorldTerrainZone[]} [terrainZones] deterministic terrain zones in the world
 * @property {Object} [biomeSpawnMultipliers] map of terrain type to food spawn weight multiplier
 * @property {Object} [terrainEffectStrengths] terrain effect multipliers and drains (SSN-287)
 * @property {number} [terrainEffectStrengths.forestVisionMultiplier] multiplier for vision in forest (default 0.5)
 * @property {number} [terrainEffectStrengths.wetlandSpeedMultiplier] multiplier for speed in wetland (default 0.5)
 * @property {number} [terrainEffectStrengths.wetlandTurnMultiplier] multiplier for turn rate in wetland (default 0.5)
 * @property {number} [terrainEffectStrengths.rockyEnergyDrain] energy drain per tick in rocky terrain (default 0.2)
 */

/**
 * @param {Partial<WorldState>} [initial]
 * @returns {WorldState}
 */
export function createWorldState(initial = {}) {
  return {
    tick: initial.tick ?? 0,
    organisms: initial.organisms ? initial.organisms.map((o) => ({
      ...o,
      traits: o?.traits ? { ...o.traits } : undefined,
      genome: o?.genome ? { ...o.genome } : undefined,
      brain: cloneBrain(o?.brain)
    })) : [],
    food: initial.food ? initial.food.map((f) => ({ ...f })) : [],
    obstacles: initial.obstacles ? initial.obstacles.map((o) => ({ ...o })) : [],
    dangerZones: initial.dangerZones ? initial.dangerZones.map((d) => ({ ...d })) : [],
    terrainZones: initial.terrainZones
      ? initial.terrainZones.map((zone) => ({
        ...zone,
        bounds: zone?.bounds ? { ...zone.bounds } : undefined
      }))
      : []
  };
}

const BRAIN_LAYER_ORDER = ['input', 'hidden', 'output'];
const BRAIN_SIGNAL_SUBSTEPS = 2;
const BRAIN_POTENTIAL_MIN = -4;
const BRAIN_POTENTIAL_MAX = 4;
const ROCKY_TERRAIN_ENERGY_DRAIN_PER_TICK = 0.2;
const FOREST_TERRAIN_VISION_PENALTY_MULTIPLIER = 0.5; // 50% vision range in forest zones
const WETLAND_TERRAIN_SPEED_PENALTY_MULTIPLIER = 0.5; // 50% speed in wetland zones
const WETLAND_TERRAIN_TURN_PENALTY_MULTIPLIER = 0.5; // 50% turn rate in wetland zones
const LEGACY_CONSTANT_INPUT_ID = 'in-constant';
const NORMALIZED_BRAIN_VERSION = 2;
const INCOMING_SYNAPSE_CACHE = new WeakMap();

function cloneBrain(brain) {
  if (!brain || typeof brain !== 'object') {
    return brain;
  }

  return {
    ...brain,
    neurons: Array.isArray(brain.neurons) ? brain.neurons.map((neuron) => ({ ...neuron })) : [],
    synapses: Array.isArray(brain.synapses) ? brain.synapses.map((synapse) => ({ ...synapse })) : []
  };
}

function layerRank(type) {
  const rank = BRAIN_LAYER_ORDER.indexOf(type);
  return rank === -1 ? BRAIN_LAYER_ORDER.length : rank;
}

function compareNeurons(left, right) {
  const rankDelta = layerRank(left.type) - layerRank(right.type);
  if (rankDelta !== 0) {
    return rankDelta;
  }

  return left.id.localeCompare(right.id);
}

function clampBrainPotential(value) {
  return clamp(value, BRAIN_POTENTIAL_MIN, BRAIN_POTENTIAL_MAX);
}

function normalizeNeuronType(id, explicitType) {
  if (explicitType === 'input' || explicitType === 'hidden' || explicitType === 'output') {
    return explicitType;
  }

  if (id === LEGACY_CONSTANT_INPUT_ID) {
    return 'input';
  }

  if (isInputNeuronId(id)) {
    return 'input';
  }

  if (isOutputNeuronId(id)) {
    return 'output';
  }

  return 'hidden';
}

function createNormalizedNeuron(source = {}) {
  const id = String(source.id ?? '').trim();
  const type = normalizeNeuronType(id, typeof source.type === 'string' ? source.type : undefined);
  const base = createNeuronDefinition(id, type);
  const threshold = Number(source.threshold);
  const decay = Number(source.decay);
  const resetPotential = Number(source.resetPotential);
  const bias = Number(source.bias);
  const potentialCandidate = Number(source.potential ?? source.value ?? source.state ?? 0);
  const activationCandidate = Number(source.activation ?? source.signal ?? 0);
  const explicitSpiked = source.spiked ?? source.isSpiking ?? source.fired;

  return {
    ...base,
    ...source,
    id,
    type,
    threshold: Number.isFinite(threshold) ? threshold : base.threshold,
    decay: Number.isFinite(decay) ? decay : base.decay,
    resetPotential: Number.isFinite(resetPotential) ? resetPotential : base.resetPotential,
    bias: Number.isFinite(bias) ? bias : base.bias,
    potential: Number.isFinite(potentialCandidate) ? clampBrainPotential(potentialCandidate) : 0,
    value: Number.isFinite(potentialCandidate) ? clampBrainPotential(potentialCandidate) : 0,
    activation: Number.isFinite(activationCandidate) ? activationCandidate : 0,
    signal: Number.isFinite(activationCandidate) ? activationCandidate : 0,
    spiked: typeof explicitSpiked === 'boolean' ? explicitSpiked : false
  };
}

function normalizeBrain(organismBrain, organismType = 'herbivore') {
  if (
    organismBrain?.schemaVersion === NORMALIZED_BRAIN_VERSION
    && Array.isArray(organismBrain.neurons)
    && Array.isArray(organismBrain.synapses)
  ) {
    return organismBrain;
  }

  const brain = organismBrain && typeof organismBrain === 'object' ? organismBrain : {};
  const neurons = Array.isArray(brain.neurons) ? brain.neurons : [];
  const synapses = Array.isArray(brain.synapses) ? brain.synapses : [];
  const neuronById = new Map();
  const inputNeuronIds = getInputNeuronIdsForOrganismType(organismType);

  for (const inputId of inputNeuronIds) {
    neuronById.set(inputId, createNeuronDefinition(inputId, 'input'));
  }

  for (const outputId of OUTPUT_NEURON_IDS) {
    neuronById.set(outputId, createNeuronDefinition(outputId, 'output'));
  }

  for (const neuron of neurons) {
    if (!neuron || typeof neuron.id !== 'string' || neuron.id.trim().length === 0) {
      continue;
    }
    neuronById.set(neuron.id, createNormalizedNeuron(neuron));
  }

  for (const synapse of synapses) {
    const sourceId = typeof synapse?.sourceId === 'string' && synapse.sourceId.length > 0 ? synapse.sourceId : LEGACY_CONSTANT_INPUT_ID;
    const targetId = typeof synapse?.targetId === 'string' ? synapse.targetId : null;
    if (!targetId) {
      continue;
    }

    if (!neuronById.has(sourceId)) {
      neuronById.set(sourceId, createNeuronDefinition(sourceId, normalizeNeuronType(sourceId)));
    }
    if (!neuronById.has(targetId)) {
      neuronById.set(targetId, createNeuronDefinition(targetId, normalizeNeuronType(targetId)));
    }
  }

  const normalizedNeurons = [...neuronById.values()].sort(compareNeurons);
  const normalizedSynapses = synapses
    .filter((synapse) => synapse && typeof synapse.targetId === 'string')
    .map((synapse, index) => ({
      ...synapse,
      sourceId: typeof synapse.sourceId === 'string' && synapse.sourceId.length > 0 ? synapse.sourceId : LEGACY_CONSTANT_INPUT_ID,
      id: typeof synapse.id === 'string' && synapse.id.length > 0 ? synapse.id : `synapse-${index + 1}`,
      weight: Number.isFinite(Number(synapse.weight)) ? Number(synapse.weight) : 0
    }))
    .filter((synapse) => neuronById.has(synapse.sourceId) && neuronById.has(synapse.targetId))
    .sort((left, right) => left.id.localeCompare(right.id));

  return {
    ...brain,
    schemaVersion: NORMALIZED_BRAIN_VERSION,
    signalSubsteps: Number.isInteger(brain.signalSubsteps) && brain.signalSubsteps > 0 ? brain.signalSubsteps : BRAIN_SIGNAL_SUBSTEPS,
    neurons: normalizedNeurons,
    synapses: normalizedSynapses
  };
}

function buildIncomingSynapseMap(synapses) {
  if (INCOMING_SYNAPSE_CACHE.has(synapses)) {
    return INCOMING_SYNAPSE_CACHE.get(synapses);
  }

  const incoming = new Map();

  for (const synapse of synapses) {
    if (!incoming.has(synapse.targetId)) {
      incoming.set(synapse.targetId, []);
    }
    incoming.get(synapse.targetId).push(synapse);
  }

  INCOMING_SYNAPSE_CACHE.set(synapses, incoming);
  return incoming;
}

function evaluateBrain(organism, food, worldWidth, worldHeight, organismContext = {}, terrainZones = null, forestVisionMultiplier = FOREST_TERRAIN_VISION_PENALTY_MULTIPLIER) {
  const normalizedBrain = normalizeBrain(organism?.brain, organism?.type);
  const inputValues = computeInputNeuronValues(organism, food, worldWidth, worldHeight, organismContext, terrainZones, forestVisionMultiplier);
  const incomingSynapses = buildIncomingSynapseMap(normalizedBrain.synapses);
  const dynamicNeurons = normalizedBrain.neurons.filter((neuron) => neuron.type !== 'input');
  const nextNeuronById = new Map();
  const dynamicSpikeState = new Map();
  const outputSignals = new Map();
  const spikeCounts = new Map();

  for (const neuron of normalizedBrain.neurons) {
    const inputValue = inputValues.get(neuron.id);
    if (neuron.type === 'input') {
      const resolvedInput = neuron.id === LEGACY_CONSTANT_INPUT_ID
        ? 1
        : Number.isFinite(inputValue) ? inputValue : 0;
      nextNeuronById.set(neuron.id, {
        ...neuron,
        potential: resolvedInput,
        value: resolvedInput,
        activation: resolvedInput,
        signal: resolvedInput,
        spiked: resolvedInput >= neuron.threshold
      });
    } else {
      nextNeuronById.set(neuron.id, {
        ...neuron,
        activation: 0,
        signal: 0
      });
      dynamicSpikeState.set(neuron.id, neuron.spiked ? 1 : 0);
      spikeCounts.set(neuron.id, 0);
    }
  }

  for (const outputId of OUTPUT_NEURON_IDS) {
    outputSignals.set(outputId, 0);
  }

  for (let substep = 0; substep < normalizedBrain.signalSubsteps; substep += 1) {
    const sourceSignals = new Map();
    for (const neuron of normalizedBrain.neurons) {
      if (neuron.type === 'input') {
        sourceSignals.set(neuron.id, nextNeuronById.get(neuron.id)?.signal ?? 0);
        continue;
      }

      sourceSignals.set(neuron.id, dynamicSpikeState.get(neuron.id) ?? 0);
    }

    const nextSpikeState = new Map();
    for (const neuron of dynamicNeurons) {
      const currentNeuron = nextNeuronById.get(neuron.id);
      const synapseInputs = incomingSynapses.get(neuron.id) ?? [];
      const incomingCurrent = synapseInputs.reduce((sum, synapse) => {
        return sum + (sourceSignals.get(synapse.sourceId) ?? 0) * synapse.weight;
      }, 0);
      const integratedPotential = clampBrainPotential(
        (currentNeuron.potential * currentNeuron.decay) + currentNeuron.bias + incomingCurrent
      );
      const didSpike = integratedPotential >= currentNeuron.threshold;
      const nextPotential = didSpike ? currentNeuron.resetPotential : integratedPotential;
      const count = (spikeCounts.get(neuron.id) ?? 0) + (didSpike ? 1 : 0);

      spikeCounts.set(neuron.id, count);
      nextSpikeState.set(neuron.id, didSpike ? 1 : 0);
      nextNeuronById.set(neuron.id, {
        ...currentNeuron,
        potential: nextPotential,
        value: nextPotential,
        spiked: didSpike
      });
    }

    for (const [neuronId, spikeValue] of nextSpikeState.entries()) {
      dynamicSpikeState.set(neuronId, spikeValue);
    }
  }

  for (const neuron of dynamicNeurons) {
    const currentNeuron = nextNeuronById.get(neuron.id);
    const activation = (spikeCounts.get(neuron.id) ?? 0) / normalizedBrain.signalSubsteps;
    const nextNeuron = {
      ...currentNeuron,
      activation,
      signal: activation
    };
    nextNeuronById.set(neuron.id, nextNeuron);

    if (neuron.type === 'output') {
      outputSignals.set(neuron.id, activation);
    }
  }

  return {
    brain: {
      ...normalizedBrain,
      schemaVersion: NORMALIZED_BRAIN_VERSION,
      neurons: normalizedBrain.neurons.map((neuron) => nextNeuronById.get(neuron.id))
    },
    outputs: outputSignals,
    inputs: inputValues
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

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function isEggStage(organism) {
  return organism?.lifeStage === 'egg';
}

function resolveEggHatchTime(traits) {
  const rawHatchTime = Number(traits?.eggHatchTime ?? 0);
  if (!Number.isFinite(rawHatchTime)) {
    return 0;
  }

  return Math.max(0, rawHatchTime);
}

function calculateEggLayCost(hatchTime) {
  return resolveEggHatchTime({ eggHatchTime: hatchTime }) * 0.5;
}

function resolveGrowthProgress(organism) {
  const adolescenceAge = Number(organism?.traits?.adolescenceAge ?? 0);
  if (!Number.isFinite(adolescenceAge) || adolescenceAge <= 0) {
    return 1;
  }

  const age = Number(organism?.age ?? 0);
  if (!Number.isFinite(age) || age <= 0) {
    return 0;
  }

  return clamp(age / adolescenceAge, 0, 1);
}

function interpolateByGrowth(progress, juvenileValue, adultValue) {
  return juvenileValue + ((adultValue - juvenileValue) * progress);
}

export function resolveExpressedTraits(organism) {
  const traits = organism?.traits ?? {};
  if (isEggStage(organism)) {
    return {
      ...traits,
      size: (Number.isFinite(traits.size) ? traits.size : 1) * 0.45,
      speed: 0,
      metabolism: 0,
      movementCostScale: 0,
      adulthoodProgress: 0
    };
  }

  const progress = resolveGrowthProgress(organism);
  const adultSize = Number.isFinite(traits.size) ? traits.size : 1;
  const adultSpeed = Number.isFinite(traits.speed) ? traits.speed : 1;
  const hasExplicitMetabolism = Number.isFinite(traits.metabolism);
  const adultMetabolism = hasExplicitMetabolism ? traits.metabolism : undefined;

  return {
    ...traits,
    size: interpolateByGrowth(progress, adultSize * 0.55, adultSize),
    speed: interpolateByGrowth(progress, adultSpeed * 1.25, adultSpeed),
    metabolism: hasExplicitMetabolism
      ? interpolateByGrowth(progress, adultMetabolism * 0.6, adultMetabolism)
      : undefined,
    movementCostScale: interpolateByGrowth(progress, 0.75, 1),
    adulthoodProgress: progress
  };
}

/**
 * Build spatial index for prey organisms (non-predators) for efficient predator sensing.
 * @param {WorldOrganism[]} organisms - all organisms
 * @param {number} cellSize - spatial cell size (use max vision range)
 * @returns {{cellsByKey: Map<string, Set<string>>, preyById: Map<string, WorldOrganism>, cellSize: number}}
 */
function buildPreySpatialIndex(organisms, cellSize) {
  const cellsByKey = new Map();
  const preyById = new Map();

  for (const organism of organisms) {
    // Skip predators - they are the hunters, not prey
    if (organism.type === 'predator') {
      continue;
    }

    preyById.set(organism.id, organism);

    const cellX = toCellIndex(organism.x, cellSize);
    const cellY = toCellIndex(organism.y, cellSize);
    const key = toCellKey(cellX, cellY);

    if (!cellsByKey.has(key)) {
      cellsByKey.set(key, new Set());
    }
    cellsByKey.get(key).add(organism.id);
  }

  return { cellsByKey, preyById, cellSize };
}

/**
 * Compute input neuron values based on organism state and environment.
 * @param {WorldOrganism} organism
 * @param {WorldFood[]} food - all food items in the world
 * @param {number} worldWidth
 * @param {number} worldHeight
 * @param {Object} [organismContext] - context for predator prey detection
 * @param {WorldOrganism[]} [organismContext.organisms] - all organisms in the world
 * @param {{cellsByKey: Map<string, Set<string>>, preyById: Map<string, WorldOrganism>, cellSize: number}} [organismContext.preyIndex] - pre-built spatial index for prey
 * @param {WorldTerrainZone[]} [terrainZones] - terrain zones for forest vision penalty
 * @returns {Map<string, number>} Map of input neuron ID -> value (typically 0-1 range)
 */
function computeInputNeuronValues(organism, food, worldWidth, worldHeight, organismContext = null, terrainZones = null, forestVisionMultiplier = FOREST_TERRAIN_VISION_PENALTY_MULTIPLIER) {
  const inputs = new Map();
  const expressedTraits = resolveExpressedTraits(organism);

  // Energy: normalized to reasonable range (0-1 where 1 = 100 energy)
  inputs.set('in-energy', Math.min(1, (organism.energy ?? 0) / 100));

  // Age: normalized (treating 500 as "old")
  inputs.set('in-age', Math.min(1, (organism.age ?? 0) / 500));

  // Position: normalized to world bounds
  inputs.set('in-x', (organism.x ?? 0) / worldWidth);
  inputs.set('in-y', (organism.y ?? 0) / worldHeight);

  // Direction: encode as sin/cos for smooth transitions
  const direction = organism.direction ?? 0;
  inputs.set('in-direction', Math.sin(direction)); // -1 to 1
  inputs.set('in-direction-cos', Math.cos(direction)); // -1 to 1

  // Traits: normalized
  inputs.set('in-size', Math.min(1, (expressedTraits.size ?? 1) / 5));
  inputs.set('in-speed', Math.min(1, (expressedTraits.speed ?? 1) / 5));
  inputs.set('in-vision-range', Math.min(1, (expressedTraits.visionRange ?? 25) / 100));

  // Food sensors: find nearest food within vision range
  // Apply forest terrain vision penalty if organism is in a forest zone
  const visionRange = getEffectiveVisionRange(organism, terrainZones, forestVisionMultiplier);
  const visionRangeSquared = visionRange * visionRange;

  let nearestFoodDist = Infinity;
  let nearestFoodDx = 0;
  let nearestFoodDy = 0;

  for (const f of food) {
    const dx = f.x - organism.x;
    const dy = f.y - organism.y;
    const distSquared = dx * dx + dy * dy;

    if (distSquared < visionRangeSquared && distSquared < nearestFoodDist) {
      nearestFoodDist = distSquared;
      nearestFoodDx = dx;
      nearestFoodDy = dy;
    }
  }

  if (nearestFoodDist === Infinity) {
    // No food in vision range
    inputs.set('in-food-distance', 1); // "far away" = 1
    inputs.set('in-food-direction', 0);
    inputs.set('in-food-detected', 0);
  } else {
    const dist = Math.sqrt(nearestFoodDist);
    // Distance: normalized (0 = directly on top, 1 = at vision edge)
    inputs.set('in-food-distance', dist / visionRange);

    // Direction to food relative to current heading
    const foodAngle = Math.atan2(nearestFoodDy, nearestFoodDx);
    const relativeAngle = normalizeAngle(foodAngle - direction);
    // Convert to -1 to 1 range: 0 = ahead, PI = behind, negative = left, positive = right
    // Actually let's make it clearer: -1 = left 180, 0 = ahead, 1 = right 180
    inputs.set('in-food-direction', (relativeAngle - Math.PI) / Math.PI);

    inputs.set('in-food-detected', 1);
  }

  // Predator-specific prey sensors
  if (organism.type === 'predator') {
    const preyIndex = organismContext?.preyIndex ?? null;
    const organisms = organismContext?.organisms ?? [];
    // Apply forest terrain vision penalty for prey detection
    const visionRange = getEffectiveVisionRange(organism, terrainZones, forestVisionMultiplier);
    const visionRangeSquared = visionRange * visionRange;

    // Use spatial index if available, otherwise fall back to full scan (for backward compatibility)
    let nearestPreyDist = Infinity;
    let nearestPreyDx = 0;
    let nearestPreyDy = 0;

    if (preyIndex && preyIndex.cellsByKey && preyIndex.preyById) {
      // Use spatial index for O(1) average lookup per cell instead of O(n) full scan
      const { cellsByKey, preyById, cellSize } = preyIndex;

      const minCellX = toCellIndex(organism.x - visionRange, cellSize);
      const maxCellX = toCellIndex(organism.x + visionRange, cellSize);
      const minCellY = toCellIndex(organism.y - visionRange, cellSize);
      const maxCellY = toCellIndex(organism.y + visionRange, cellSize);

      for (let cellX = minCellX; cellX <= maxCellX; cellX += 1) {
        for (let cellY = minCellY; cellY <= maxCellY; cellY += 1) {
          const cellPreyIds = cellsByKey.get(toCellKey(cellX, cellY));
          if (!cellPreyIds || cellPreyIds.size === 0) {
            continue;
          }

          for (const preyId of cellPreyIds) {
            // Skip self
            if (preyId === organism.id) {
              continue;
            }

            const prey = preyById.get(preyId);
            if (!prey) {
              continue;
            }

            const dx = prey.x - organism.x;
            const dy = prey.y - organism.y;
            const distSquared = dx * dx + dy * dy;

            if (distSquared < visionRangeSquared && distSquared < nearestPreyDist) {
              nearestPreyDist = distSquared;
              nearestPreyDx = dx;
              nearestPreyDy = dy;
            }
          }
        }
      }
    } else {
      // Fallback: full scan (slower, for backward compatibility)
      for (const prey of organisms) {
        // Skip self and other predators
        if (prey.id === organism.id || prey.type === 'predator') {
          continue;
        }

        const dx = prey.x - organism.x;
        const dy = prey.y - organism.y;
        const distSquared = dx * dx + dy * dy;

        if (distSquared < visionRangeSquared && distSquared < nearestPreyDist) {
          nearestPreyDist = distSquared;
          nearestPreyDx = dx;
          nearestPreyDy = dy;
        }
      }
    }

    if (nearestPreyDist === Infinity) {
      // No prey in vision range
      inputs.set('in-prey-distance', 1);
      inputs.set('in-prey-direction', 0);
      inputs.set('in-prey-detected', 0);
    } else {
      const dist = Math.sqrt(nearestPreyDist);
      // Distance: normalized (0 = directly on top, 1 = at vision edge)
      inputs.set('in-prey-distance', dist / visionRange);

      // Direction to prey relative to current heading
      const preyAngle = Math.atan2(nearestPreyDy, nearestPreyDx);
      const relativeAngle = normalizeAngle(preyAngle - direction);
      inputs.set('in-prey-direction', (relativeAngle - Math.PI) / Math.PI);

      inputs.set('in-prey-detected', 1);
    }
  }

  return inputs;
}

function deriveRotationDelta(organism, outputSignals = null, inputValues = null, terrainZones = null, wetlandTurnMultiplier = WETLAND_TERRAIN_TURN_PENALTY_MULTIPLIER) {
  // Apply wetland terrain turn rate penalty
  const turnRate = getEffectiveTurnRate(organism, terrainZones, wetlandTurnMultiplier);
  if (!Number.isFinite(turnRate) || turnRate === 0) {
    return 0;
  }

  if (outputSignals instanceof Map) {
    const leftSignal = Number(outputSignals.get('out-turn-left') ?? 0);
    const rightSignal = Number(outputSignals.get('out-turn-right') ?? 0);
    return (rightSignal - leftSignal) * turnRate;
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

    // Get input value: use precomputed inputValues if available,
    // otherwise fall back to legacy behavior (weight only, for backward compatibility)
    let inputValue = 1;
    if (inputValues && synapse.sourceId) {
      inputValue = inputValues.get(synapse.sourceId) ?? 1;
    }

    const weightedInput = inputValue * synapse.weight;

    if (synapse.targetId === 'out-turn-left') {
      leftSignal += weightedInput;
    } else if (synapse.targetId === 'out-turn-right') {
      rightSignal += weightedInput;
    }
  }

  return (rightSignal - leftSignal) * turnRate;
}

function deriveForwardDelta(organism, outputSignals = null, inputValues = null, terrainZones = null, wetlandSpeedMultiplier = WETLAND_TERRAIN_SPEED_PENALTY_MULTIPLIER) {
  // Apply wetland terrain speed penalty
  const speed = getEffectiveSpeed(organism, terrainZones, wetlandSpeedMultiplier);
  if (!Number.isFinite(speed) || speed === 0) {
    return 0;
  }

  if (outputSignals instanceof Map) {
    const forwardSignal = Number(
      outputSignals.get('out-forward')
      ?? outputSignals.get('out-move-forward')
      ?? outputSignals.get('out-move')
      ?? 0
    );
    return Math.max(0, Math.min(1, forwardSignal)) * speed;
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

    // Get input value: use precomputed inputValues if available,
    // otherwise fall back to legacy behavior (weight only, for backward compatibility)
    let inputValue = 1;
    if (inputValues && synapse.sourceId) {
      inputValue = inputValues.get(synapse.sourceId) ?? 1;
    }

    if (
      synapse.targetId === 'out-forward' ||
      synapse.targetId === 'out-move-forward' ||
      synapse.targetId === 'out-move'
    ) {
      forwardSignal += inputValue * synapse.weight;
    }
  }

  return Math.max(-1, Math.min(1, forwardSignal)) * speed;
}

function moveAndSpendEnergy(organism, dx, dy, metabolismPerTick, movementCostMultiplier, outputSignals = null, inputValues = null, terrainZones = null, wetlandTurnMultiplier = WETLAND_TERRAIN_TURN_PENALTY_MULTIPLIER) {
  const expressedTraits = resolveExpressedTraits(organism);
  // Use organism's metabolism trait for deterministic energy loss, fallback to param for backward compatibility
  const organismMetabolism = Number.isFinite(expressedTraits.metabolism)
    ? expressedTraits.metabolism
    : metabolismPerTick;
  const movementDistance = Math.hypot(dx, dy);
  const movementCostScale = Number.isFinite(expressedTraits.movementCostScale) ? expressedTraits.movementCostScale : 1;
  const energySpent = organismMetabolism + movementDistance * movementCostMultiplier * movementCostScale;
  const baseDirection = organism.direction ?? 0;
  const rotationDelta = deriveRotationDelta(organism, outputSignals, inputValues, terrainZones, wetlandTurnMultiplier);
  const direction = normalizeAngle(baseDirection + rotationDelta);

  return {
    ...organism,
    x: organism.x + dx,
    y: organism.y + dy,
    age: (organism.age ?? 0) + 1,
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
  const organismRadius = (resolveExpressedTraits(organism).size ?? 1) * 3; // Approximate radius
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
 * Check if an organism center is inside a terrain-zone bounds rectangle.
 * @param {WorldOrganism} organism
 * @param {WorldTerrainZone} terrainZone
 * @returns {boolean}
 */
function isInTerrainZoneBounds(organism, terrainZone) {
  const bounds = terrainZone?.bounds;
  if (!bounds) {
    return false;
  }

  return organism.x >= bounds.x
    && organism.x <= bounds.x + bounds.width
    && organism.y >= bounds.y
    && organism.y <= bounds.y + bounds.height;
}

/**
 * Apply fixed passive energy drain for organisms in rocky terrain zones.
 * @param {WorldOrganism[]} organisms
 * @param {WorldTerrainZone[]} terrainZones
 * @param {number} rockyEnergyDrain - energy drain per tick in rocky terrain
 * @returns {WorldOrganism[]}
 */
function applyRockyTerrainEnergyDrain(organisms, terrainZones, rockyEnergyDrain = ROCKY_TERRAIN_ENERGY_DRAIN_PER_TICK) {
  if (!terrainZones || terrainZones.length === 0) {
    return organisms;
  }

  const rockyZones = terrainZones.filter((terrainZone) => terrainZone?.type === 'rocky');
  if (rockyZones.length === 0) {
    return organisms;
  }

  return organisms.map((organism) => {
    const inRockyZone = rockyZones.some((terrainZone) => isInTerrainZoneBounds(organism, terrainZone));
    if (!inRockyZone) {
      return organism;
    }

    return {
      ...organism,
      energy: Math.max(0, organism.energy - rockyEnergyDrain)
    };
  });
}

/**
 * Check if an organism is inside any forest terrain zone.
 * @param {WorldOrganism} organism
 * @param {WorldTerrainZone[]} terrainZones
 * @returns {boolean}
 */
function isInForestZone(organism, terrainZones) {
  if (!terrainZones || terrainZones.length === 0) {
    return false;
  }
  const forestZones = terrainZones.filter((zone) => zone?.type === 'forest');
  if (forestZones.length === 0) {
    return false;
  }
  return forestZones.some((zone) => isInTerrainZoneBounds(organism, zone));
}

/**
 * Check if an organism is inside any wetland terrain zone.
 * @param {WorldOrganism} organism
 * @param {WorldTerrainZone[]} terrainZones
 * @returns {boolean}
 */
function isInWetlandZone(organism, terrainZones) {
  if (!terrainZones || terrainZones.length === 0) {
    return false;
  }
  const wetlandZones = terrainZones.filter((zone) => zone?.type === 'wetland');
  if (wetlandZones.length === 0) {
    return false;
  }
  return wetlandZones.some((zone) => isInTerrainZoneBounds(organism, zone));
}

/**
 * Compute effective vision range accounting for forest terrain penalty.
 * Returns the base vision range if organism is not in a forest zone,
 * otherwise returns reduced vision range (deterministic, no randomness).
 * Uses resolveExpressedTraits to get the expressed trait values (including juvenile growth scaling).
 * @param {WorldOrganism} organism
 * @param {WorldTerrainZone[]} terrainZones
 * @param {number} [forestVisionMultiplier] - multiplier for vision in forest zones (default: 0.5)
 * @returns {number} effective vision range
 */
function getEffectiveVisionRange(organism, terrainZones, forestVisionMultiplier = FOREST_TERRAIN_VISION_PENALTY_MULTIPLIER) {
  const expressedTraits = resolveExpressedTraits(organism);
  const baseVisionRange = expressedTraits.visionRange ?? 25;
  if (!isInForestZone(organism, terrainZones)) {
    return baseVisionRange;
  }
  return baseVisionRange * forestVisionMultiplier;
}

/**
 * Compute effective speed accounting for wetland terrain penalty.
 * Returns the base speed if organism is not in a wetland zone,
 * otherwise returns reduced speed (deterministic, no randomness).
 * Uses resolveExpressedTraits to get the expressed trait values (including juvenile growth scaling).
 * @param {WorldOrganism} organism
 * @param {WorldTerrainZone[]} terrainZones
 * @param {number} [wetlandSpeedMultiplier] - multiplier for speed in wetland zones (default: 0.5)
 * @returns {number} effective speed
 */
function getEffectiveSpeed(organism, terrainZones, wetlandSpeedMultiplier = WETLAND_TERRAIN_SPEED_PENALTY_MULTIPLIER) {
  const expressedTraits = resolveExpressedTraits(organism);
  const baseSpeed = expressedTraits.speed ?? 1;
  if (!isInWetlandZone(organism, terrainZones)) {
    return baseSpeed;
  }
  return baseSpeed * wetlandSpeedMultiplier;
}

/**
 * Compute effective turn rate accounting for wetland terrain penalty.
 * Returns the base turn rate if organism is not in a wetland zone,
 * otherwise returns reduced turn rate (deterministic, no randomness).
 * @param {WorldOrganism} organism
 * @param {WorldTerrainZone[]} terrainZones
 * @param {number} [wetlandTurnMultiplier] - multiplier for turn rate in wetland zones (default: 0.5)
 * @returns {number} effective turn rate
 */
function getEffectiveTurnRate(organism, terrainZones, wetlandTurnMultiplier = WETLAND_TERRAIN_TURN_PENALTY_MULTIPLIER) {
  const baseTurnRate = organism.traits?.turnRate ?? 0;
  if (!isInWetlandZone(organism, terrainZones)) {
    return baseTurnRate;
  }
  return baseTurnRate * wetlandTurnMultiplier;
}

/**
 * Find the terrain zone that contains a given point, if any.
 * @param {number} x - x coordinate
 * @param {number} y - y coordinate
 * @param {WorldTerrainZone[]} terrainZones
 * @returns {WorldTerrainZone|null}
 */
function findZoneAtPoint(x, y, terrainZones) {
  if (!terrainZones || terrainZones.length === 0) {
    return null;
  }

  for (const zone of terrainZones) {
    const bounds = zone?.bounds;
    if (!bounds) {
      continue;
    }

    if (x >= bounds.x && x <= bounds.x + bounds.width &&
        y >= bounds.y && y <= bounds.y + bounds.height) {
      return zone;
    }
  }

  return null;
}

/**
 * Compute weighted zone selection for biome-biased food spawning.
 * Returns an array of zones with their computed weights (zone area * biome multiplier).
 * @param {WorldTerrainZone[]} terrainZones
 * @param {Object} biomeSpawnMultipliers - map of terrain type to spawn weight multiplier
 * @returns {Array<{zone: WorldTerrainZone, weight: number}>}
 */
function computeZoneWeights(terrainZones, biomeSpawnMultipliers = {}) {
  if (!terrainZones || terrainZones.length === 0) {
    return [];
  }

  return terrainZones.map((zone) => {
    const bounds = zone?.bounds;
    const area = bounds ? bounds.width * bounds.height : 0;
    const multiplier = biomeSpawnMultipliers[zone.type] ?? 1.0;
    return {
      zone,
      weight: area * multiplier
    };
  });
}

/**
 * Select a terrain zone based on weighted random selection.
 * Uses deterministic random number for reproducible results.
 * @param {Array<{zone: WorldTerrainZone, weight: number}>} zoneWeights
 * @param {StepRng} rng
 * @returns {WorldTerrainZone|null}
 */
function selectWeightedZone(zoneWeights, rng) {
  if (!zoneWeights || zoneWeights.length === 0) {
    return null;
  }

  const totalWeight = zoneWeights.reduce((sum, zw) => sum + zw.weight, 0);
  if (totalWeight <= 0) {
    return null;
  }

  const randomValue = rng.nextFloat() * totalWeight;
  let cumulative = 0;

  for (const zw of zoneWeights) {
    cumulative += zw.weight;
    if (randomValue <= cumulative) {
      return zw.zone;
    }
  }

  // Fallback to last zone due to floating point rounding
  return zoneWeights[zoneWeights.length - 1].zone;
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
    const organismRadius = (resolveExpressedTraits(organism).size ?? 1) * 3;
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

function createBrainSynapseId(synapses) {
  let nextId = synapses.length + 1;
  let candidate = `syn-${nextId}`;

  while (synapses.some((synapse) => synapse.id === candidate)) {
    nextId += 1;
    candidate = `syn-${nextId}`;
  }

  return candidate;
}

function createHiddenNeuronId(neurons) {
  let nextId = 1;
  const usedIds = new Set(neurons.map((neuron) => neuron.id));
  let candidate = `hidden-${nextId}`;

  while (usedIds.has(candidate)) {
    nextId += 1;
    candidate = `hidden-${nextId}`;
  }

  return candidate;
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
function mutateBrain(parentBrain, organismType, rng, mutationRate, mutationMagnitude, addSynapseChance, removeSynapseChance) {
  const baseBrain = normalizeBrain(parentBrain, organismType);
  const neurons = baseBrain.neurons.map((neuron) => ({ ...neuron }));
  let synapses = baseBrain.synapses.map((synapse) => ({ ...synapse }));

  const hiddenNeurons = () => neurons.filter((neuron) => neuron.type === 'hidden');

  for (const neuron of neurons) {
    if (neuron.type === 'input') {
      continue;
    }

    if (rng.nextFloat() < mutationRate) {
      neuron.threshold = Math.max(0.2, Number((neuron.threshold + ((rng.nextFloat() * 2 - 1) * mutationMagnitude)).toFixed(3)));
    }
    if (rng.nextFloat() < mutationRate) {
      neuron.decay = clamp(Number((neuron.decay + ((rng.nextFloat() * 2 - 1) * mutationMagnitude * 0.5)).toFixed(3)), 0, 0.99);
    }
    if (rng.nextFloat() < mutationRate) {
      neuron.bias = clampBrainPotential(Number((neuron.bias + ((rng.nextFloat() * 2 - 1) * mutationMagnitude * 0.35)).toFixed(3)));
    }
  }

  const addHiddenChance = Math.min(1, addSynapseChance * 0.8);
  if (rng.nextFloat() < addHiddenChance) {
    const hiddenId = createHiddenNeuronId(neurons);
    const hiddenNeuron = createNeuronDefinition(hiddenId, 'hidden', {
      threshold: Number((0.6 + (rng.nextFloat() * 0.9)).toFixed(3)),
      decay: Number((0.55 + (rng.nextFloat() * 0.35)).toFixed(3))
    });
    neurons.push(hiddenNeuron);

    const sourceCandidates = neurons
      .filter((neuron) => neuron.id !== hiddenId && neuron.type !== 'output')
      .map((neuron) => neuron.id);
    const targetCandidates = neurons
      .filter((neuron) => neuron.id !== hiddenId && neuron.type !== 'input')
      .map((neuron) => neuron.id);

    if (sourceCandidates.length > 0) {
      synapses.push({
        id: createBrainSynapseId(synapses),
        sourceId: sourceCandidates[rng.nextInt(0, sourceCandidates.length)],
        targetId: hiddenId,
        weight: Number((((rng.nextFloat() * 2) - 1) * Math.max(0.25, mutationMagnitude)).toFixed(3))
      });
    }

    if (targetCandidates.length > 0) {
      synapses.push({
        id: createBrainSynapseId(synapses),
        sourceId: hiddenId,
        targetId: targetCandidates[rng.nextInt(0, targetCandidates.length)],
        weight: Number((((rng.nextFloat() * 2) - 1) * Math.max(0.25, mutationMagnitude)).toFixed(3))
      });
    }
  }

  const removableHiddenNeurons = hiddenNeurons();
  const removeHiddenChance = Math.min(1, removeSynapseChance * 0.6);
  if (removableHiddenNeurons.length > 0 && rng.nextFloat() < removeHiddenChance) {
    const neuronToRemove = removableHiddenNeurons[rng.nextInt(0, removableHiddenNeurons.length)];
    const neuronIndex = neurons.findIndex((neuron) => neuron.id === neuronToRemove.id);
    if (neuronIndex >= 0) {
      neurons.splice(neuronIndex, 1);
      synapses = synapses.filter((synapse) => synapse.sourceId !== neuronToRemove.id && synapse.targetId !== neuronToRemove.id);
    }
  }

  if (removeSynapseChance > 0 && synapses.length > 0) {
    synapses = synapses.filter(() => rng.nextFloat() >= removeSynapseChance);
  }

  for (const synapse of synapses) {
    if (rng.nextFloat() < mutationRate) {
      const weightMutation = (rng.nextFloat() * 2 - 1) * mutationMagnitude;
      synapse.weight = Number((synapse.weight + weightMutation).toFixed(3));
    }
  }

  if (rng.nextFloat() < addSynapseChance) {
    const possibleSources = neurons.filter((neuron) => neuron.type !== 'output').map((neuron) => neuron.id);
    const possibleTargets = neurons.filter((neuron) => neuron.type !== 'input').map((neuron) => neuron.id);
    if (possibleSources.length > 0 && possibleTargets.length > 0) {
      let attempts = 0;
      while (attempts < 12) {
        const sourceId = possibleSources[rng.nextInt(0, possibleSources.length)];
        const targetId = possibleTargets[rng.nextInt(0, possibleTargets.length)];
        const pairExists = synapses.some((synapse) => synapse.sourceId === sourceId && synapse.targetId === targetId);
        attempts += 1;

        if (sourceId === targetId || pairExists) {
          continue;
        }

        synapses.push({
          id: createBrainSynapseId(synapses),
          sourceId,
          targetId,
          weight: Number((((rng.nextFloat() * 2) - 1) * Math.max(0.25, mutationMagnitude)).toFixed(3))
        });
        break;
      }
    }
  }

  const nextBrain = normalizeBrain({
    ...baseBrain,
    signalSubsteps: baseBrain.signalSubsteps,
    neurons,
    synapses
  }, organismType);

  return nextBrain;
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
  const reproductionMinimumAge = params.reproductionMinimumAge ?? 0;
  const reproductionRefractoryPeriod = params.reproductionRefractoryPeriod ?? 0;
  const maximumOrganismAge = params.maximumOrganismAge ?? Number.POSITIVE_INFINITY;
  const traitMutationRate = params.traitMutationRate ?? 0.1;
  const traitMutationMagnitude = params.traitMutationMagnitude ?? 0.2;
  const brainMutationRate = params.brainMutationRate ?? 0.1;
  const brainMutationMagnitude = params.brainMutationMagnitude ?? 0.2;
  const brainAddSynapseChance = params.brainAddSynapseChance ?? 0.05;
  const brainRemoveSynapseChance = params.brainRemoveSynapseChance ?? 0.05;
  const terrainZones = params.terrainZones ?? state.terrainZones ?? [];
  const biomeSpawnMultipliers = params.biomeSpawnMultipliers ?? {};
  // Terrain effect strengths (SSN-287) - use config values or fall back to defaults
  const terrainEffectStrengths = params.terrainEffectStrengths ?? {};
  const forestVisionMultiplier = terrainEffectStrengths.forestVisionMultiplier ?? FOREST_TERRAIN_VISION_PENALTY_MULTIPLIER;
  const wetlandSpeedMultiplier = terrainEffectStrengths.wetlandSpeedMultiplier ?? WETLAND_TERRAIN_SPEED_PENALTY_MULTIPLIER;
  const wetlandTurnMultiplier = terrainEffectStrengths.wetlandTurnMultiplier ?? WETLAND_TERRAIN_TURN_PENALTY_MULTIPLIER;
  const rockyEnergyDrain = terrainEffectStrengths.rockyEnergyDrain ?? ROCKY_TERRAIN_ENERGY_DRAIN_PER_TICK;
  const currentTick = state.tick + 1;

  const eggs = [];
  const activeOrganisms = [];
  for (const organism of state.organisms) {
    if (isEggStage(organism)) {
      eggs.push(organism);
    } else {
      activeOrganisms.push(organism);
    }
  }

  let predatorCount = 0;
  for (const organism of activeOrganisms) {
    if (organism.type === 'predator') {
      predatorCount += 1;
    }
  }

  const hasPredators = predatorCount > 0;
  let organismContext = null;
  if (hasPredators) {
    const shouldBuildPredatorPreyIndex = activeOrganisms.length >= 48 && predatorCount >= 4;
    const maxVisionRange = shouldBuildPredatorPreyIndex
      ? activeOrganisms.reduce((max, organism) => {
        const visionRange = organism.traits?.visionRange ?? 25;
        return visionRange > max ? visionRange : max;
      }, 25)
      : null;

    organismContext = {
      organisms: activeOrganisms,
      preyIndex: shouldBuildPredatorPreyIndex
        ? buildPreySpatialIndex(activeOrganisms, maxVisionRange)
        : null
    };
  }

  const movedOrganisms = activeOrganisms.map((organism) => {
    if (!organism?.brain) {
      return moveAndSpendEnergy(
        { ...organism, direction: organism.direction ?? 0 },
        0,
        0,
        metabolismPerTick,
        movementCostMultiplier,
        null,
        null,
        terrainZones,
        wetlandTurnMultiplier
      );
    }

    const brainEvaluation = evaluateBrain(organism, state.food, worldWidth, worldHeight, organismContext, terrainZones, forestVisionMultiplier);
    const baseDirection = organism.direction ?? 0;
    const rotationDelta = deriveRotationDelta(organism, brainEvaluation.outputs, brainEvaluation.inputs, terrainZones, wetlandTurnMultiplier);
    const direction = normalizeAngle(baseDirection + rotationDelta);
    const forwardDelta = deriveForwardDelta(organism, brainEvaluation.outputs, brainEvaluation.inputs, terrainZones, wetlandSpeedMultiplier);
    const boundedForwardDelta = Math.max(-movementDelta, Math.min(movementDelta, forwardDelta));
    const dx = Math.cos(direction) * boundedForwardDelta;
    const dy = Math.sin(direction) * boundedForwardDelta;

    return moveAndSpendEnergy(
      {
        ...organism,
        brain: brainEvaluation.brain,
        direction: baseDirection
      },
      dx,
      dy,
      metabolismPerTick,
      movementCostMultiplier,
      brainEvaluation.outputs,
      brainEvaluation.inputs,
      terrainZones,
      wetlandTurnMultiplier
    );
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
    const organismSize = resolveExpressedTraits(organism).size ?? 1;
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
    }));

  const predatorEnergyGain = params.predatorEnergyGain ?? 30;
  const predatorHuntRadius = params.predatorHuntRadius ?? 50;
  const predatorHuntRadiusSquared = predatorHuntRadius * predatorHuntRadius;

  const predators = hasPredators ? [] : null;

  if (predators) {
    const preyCandidates = [];
    for (const organism of organisms) {
      if (organism.type === 'predator') {
        predators.push(organism);
      } else {
        preyCandidates.push(organism);
      }
    }

    if (preyCandidates.length > 0) {
      const consumedPreyIds = new Set();
      const predatorEnergyGains = new Map();

      let predatorsByStableOrder = predators;
      const predatorsNeedSort = predators.length > 1
        && predators.some((predator, index) => index > 0 && predator.id.localeCompare(predators[index - 1].id) < 0);
      if (predatorsNeedSort) {
        predatorsByStableOrder = [...predators].sort((a, b) => a.id.localeCompare(b.id));
      }

      const shouldUseSpatialPredatorHuntLookup = predatorsByStableOrder.length >= 4 && preyCandidates.length >= 48;

      if (shouldUseSpatialPredatorHuntLookup) {
        const preyById = new Map(preyCandidates.map((prey) => [prey.id, prey]));
        const preyCellSize = Math.max(predatorHuntRadius, 1);
        const { cells: preyCellsByKey } = buildFoodSpatialIndex(preyCandidates, preyCellSize);

        for (const predator of predatorsByStableOrder) {
          let chosenPreyId = null;
          let chosenDistance = Number.POSITIVE_INFINITY;
          const minCellX = toCellIndex(predator.x - predatorHuntRadius, preyCellSize);
          const maxCellX = toCellIndex(predator.x + predatorHuntRadius, preyCellSize);
          const minCellY = toCellIndex(predator.y - predatorHuntRadius, preyCellSize);
          const maxCellY = toCellIndex(predator.y + predatorHuntRadius, preyCellSize);

          for (let cellX = minCellX; cellX <= maxCellX; cellX += 1) {
            for (let cellY = minCellY; cellY <= maxCellY; cellY += 1) {
              const cellPreyIds = preyCellsByKey.get(toCellKey(cellX, cellY));
              if (!cellPreyIds || cellPreyIds.size === 0) {
                continue;
              }

              for (const preyId of cellPreyIds) {
                if (consumedPreyIds.has(preyId)) {
                  continue;
                }

                const prey = preyById.get(preyId);
                if (!prey) {
                  continue;
                }

                const distance = squaredDistance(predator, prey);
                if (distance > predatorHuntRadiusSquared) {
                  continue;
                }

                if (distance < chosenDistance || (distance === chosenDistance && (chosenPreyId === null || preyId < chosenPreyId))) {
                  chosenDistance = distance;
                  chosenPreyId = preyId;
                }
              }
            }
          }

          if (chosenPreyId !== null) {
            consumedPreyIds.add(chosenPreyId);
            predatorEnergyGains.set(predator.id, (predatorEnergyGains.get(predator.id) ?? 0) + predatorEnergyGain);
          }
        }
      } else {
        for (const predator of predatorsByStableOrder) {
          let chosenPreyId = null;
          let chosenDistance = Number.POSITIVE_INFINITY;

          for (const prey of preyCandidates) {
            if (consumedPreyIds.has(prey.id)) {
              continue;
            }

            const distance = squaredDistance(predator, prey);
            if (distance > predatorHuntRadiusSquared) {
              continue;
            }

            if (distance < chosenDistance || (distance === chosenDistance && (chosenPreyId === null || prey.id < chosenPreyId))) {
              chosenDistance = distance;
              chosenPreyId = prey.id;
            }
          }

          if (chosenPreyId !== null) {
            consumedPreyIds.add(chosenPreyId);
            predatorEnergyGains.set(predator.id, (predatorEnergyGains.get(predator.id) ?? 0) + predatorEnergyGain);
          }
        }
      }

      organisms = organisms
        .filter((organism) => !consumedPreyIds.has(organism.id))
        .map((organism) => organism.type === 'predator'
          ? { ...organism, energy: organism.energy + (predatorEnergyGains.get(organism.id) ?? 0) }
          : organism);
    }
  }

  organisms = organisms.map((organism) => {
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
    .filter((organism) => organism.energy > 0 && (organism.age ?? 0) <= maximumOrganismAge);

  // Deterministic reproduction: organisms with energy >= threshold reproduce
  // Organisms are processed in stable id order for reproducibility
  // Optimization: skip sort if already sorted
  const offspringOrganisms = [];
  let nextOrganismNumericId = deriveNextOrganismNumericId(state.organisms);

  let organismsForReproduction = organisms;
  const needsReproSort = organisms.length > 1 &&
    organisms.some((org, i) => i > 0 && org.id.localeCompare(organisms[i - 1].id) < 0);
  if (needsReproSort) {
    organismsForReproduction = [...organisms].sort((a, b) => a.id.localeCompare(b.id));
  }

  for (const organism of organismsForReproduction) {
    const lastReproductionTick = Number.isFinite(organism.lastReproductionTick)
      ? organism.lastReproductionTick
      : Number.NEGATIVE_INFINITY;
    const organismAge = organism.age ?? 0;
    const canReproduce = organism.energy >= reproductionThreshold
      && organismAge >= reproductionMinimumAge
      && (currentTick - lastReproductionTick) >= reproductionRefractoryPeriod;

    if (canReproduce) {
      const eggHatchTime = resolveEggHatchTime(organism.traits);
      const eggLayCost = calculateEggLayCost(eggHatchTime);

      const offspringId = `org-${nextOrganismNumericId}`;
      nextOrganismNumericId += 1;

      // Offspring spawns at parent's position (with small random offset using seeded RNG)
      const offsetRange = 2;
      const offspringX = organism.x + (rng.nextFloat() * 2 - 1) * offsetRange;
      const offspringY = organism.y + (rng.nextFloat() * 2 - 1) * offsetRange;

      // Apply deterministic mutations to traits and brain
      const mutatedTraits = mutateTraits(organism.traits, rng, traitMutationRate, traitMutationMagnitude);
      const mutatedBrain = mutateBrain(
        organism.brain,
        organism.type,
        rng,
        brainMutationRate,
        brainMutationMagnitude,
        brainAddSynapseChance,
        brainRemoveSynapseChance
      );

      const offspringBase = {
        id: offspringId,
        x: Math.max(0, Math.min(worldWidth, offspringX)),
        y: Math.max(0, Math.min(worldHeight, offspringY)),
        color: organism.color,
        energy: offspringStartEnergy,
        age: 0,
        generation: organism.generation + 1,
        parentId: organism.id,
        lastReproductionTick: undefined,
        direction: organism.direction,
        traits: mutatedTraits,
        brain: mutatedBrain
      };

      offspringOrganisms.push(eggHatchTime > 0
        ? {
          ...offspringBase,
          lifeStage: 'egg',
          incubationAge: 0
        }
        : offspringBase);

      // Deduct energy from parent
      organism.energy -= reproductionCost + eggLayCost;
      organism.lastReproductionTick = currentTick;
    }
  }

  const incubatingEggs = [];
  const hatchedOrganisms = [];
  for (const egg of eggs) {
    const nextIncubationAge = Number(egg.incubationAge ?? 0) + 1;
    const hatchTime = resolveEggHatchTime(egg.traits);

    if (nextIncubationAge >= hatchTime && hatchTime > 0) {
      hatchedOrganisms.push({
        ...egg,
        age: 0,
        lifeStage: undefined,
        incubationAge: undefined
      });
      continue;
    }

    incubatingEggs.push({
      ...egg,
      incubationAge: nextIncubationAge
    });
  }

  if (offspringOrganisms.length > 0 || incubatingEggs.length > 0 || hatchedOrganisms.length > 0) {
    organisms = organisms.concat(incubatingEggs, hatchedOrganisms, offspringOrganisms);
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
    let spawnX;
    let spawnY;

    // Use biome-weighted zone selection if terrain zones exist and multipliers are provided
    if (terrainZones.length > 0 && Object.keys(biomeSpawnMultipliers).length > 0) {
      // Calculate total zone coverage to determine non-zone spawn probability (SSN-288)
      // This ensures food can spawn in non-zone areas when terrain zones don't cover the full world
      const totalZoneArea = terrainZones.reduce((sum, zone) => {
        const bounds = zone?.bounds;
        return sum + (bounds ? bounds.width * bounds.height : 0);
      }, 0);
      const worldArea = worldWidth * worldHeight;
      const zoneCoverageFraction = Math.min(1, totalZoneArea / worldArea);
      const nonZoneSpawnProbability = 1 - zoneCoverageFraction;

      // Determine if we should spawn outside zones (proportional to uncovered area)
      const shouldSpawnOutsideZones = rng.nextFloat() < nonZoneSpawnProbability;

      if (shouldSpawnOutsideZones) {
        // Spawn anywhere in the world (including non-zone areas)
        spawnX = rng.nextFloat() * worldWidth;
        spawnY = rng.nextFloat() * worldHeight;
      } else {
        // Spawn in a weighted zone
        const zoneWeights = computeZoneWeights(terrainZones, biomeSpawnMultipliers);
        const selectedZone = selectWeightedZone(zoneWeights, rng);

        if (selectedZone && selectedZone.bounds) {
          const bounds = selectedZone.bounds;
          spawnX = bounds.x + rng.nextFloat() * bounds.width;
          spawnY = bounds.y + rng.nextFloat() * bounds.height;
        } else {
          // Fallback if zone has no bounds or selection fails
          spawnX = rng.nextFloat() * worldWidth;
          spawnY = rng.nextFloat() * worldHeight;
        }
      }
    } else {
      // Default: uniform random spawn across entire world
      spawnX = rng.nextFloat() * worldWidth;
      spawnY = rng.nextFloat() * worldHeight;
    }

    nextFood.push({
      id: `food-${state.tick + 1}-${nextFood.length}`,
      x: spawnX,
      y: spawnY,
      energyValue: foodEnergyValue
    });
  }

  // Apply hazard effects
  const hazards = params;
  const obstacles = hazards.obstacles ?? state.obstacles ?? [];
  const dangerZones = hazards.dangerZones ?? state.dangerZones ?? [];
  // Note: terrainZones is extracted earlier in the function for use in movement calculations

  // Apply danger-zone damage first, then rocky passive drain.
  let finalOrganisms = applyDangerZoneDamage(organisms, dangerZones);
  finalOrganisms = applyRockyTerrainEnergyDrain(finalOrganisms, terrainZones, rockyEnergyDrain);

  // Filter out organisms that died from hazard effects
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
  returnState.terrainZones = terrainZones || [];

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
  const traitNames = ['size', 'speed', 'visionRange', 'turnRate', 'metabolism', 'adolescenceAge', 'eggHatchTime'];
  let traitDistance = 0;

  for (const trait of traitNames) {
    const aVal = Number(a?.traits?.[trait] ?? 0);
    const bVal = Number(b?.traits?.[trait] ?? 0);
    // Normalize by typical range for each trait
    const maxVals = { size: 5, speed: 5, visionRange: 50, turnRate: 1, metabolism: 1, adolescenceAge: 500, eggHatchTime: 10 };
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
      color: o.color,
      energy: o.energy,
      age: o.age,
      generation: o.generation,
      parentId: o.parentId,
      lastReproductionTick: o.lastReproductionTick,
      direction: o.direction,
      lifeStage: o.lifeStage,
      incubationAge: o.incubationAge,
      traits: { ...o.traits },
      genome: o.genome ? { ...o.genome } : undefined,
      brain: cloneBrain(o.brain)
    })),
    food: state.food.map((f) => ({
      id: f.id,
      x: f.x,
      y: f.y,
      energyValue: f.energyValue
    })),
    obstacles: state.obstacles,
    dangerZones: state.dangerZones,
    terrainZones: state.terrainZones,
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
