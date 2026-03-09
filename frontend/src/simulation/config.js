import { createWorldState } from './engine.js';
import { createSeededPrng } from './prng.js';

export const STORAGE_KEY = 'snn-sandbox.latest-simulation-config';
export const SEED_FALLBACK_COUNTER_KEY = 'snn-sandbox.seed-fallback-counter';

export const DEFAULT_CONFIG = {
  name: 'New Simulation',
  seed: '',
  worldWidth: 800,
  worldHeight: 480,
  initialPopulation: 12,
  minimumPopulation: 12,
  initialFoodCount: 30,
  foodSpawnChance: 0.04,
  foodEnergyValue: 5,
  maxFood: 120,
  mutationRate: 0.05,
  mutationStrength: 0.1
};

export function resolveSeed(seedInput) {
  const trimmed = String(seedInput ?? '').trim();
  if (trimmed.length > 0) {
    return trimmed;
  }

  if (globalThis.crypto?.getRandomValues) {
    const bytes = new Uint32Array(1);
    globalThis.crypto.getRandomValues(bytes);
    return bytes[0].toString(16);
  }

  const storage = getStorage();
  if (storage) {
    const priorCount = Number.parseInt(storage.getItem(SEED_FALLBACK_COUNTER_KEY) ?? '0', 10);
    const nextCount = Number.isFinite(priorCount) && priorCount >= 0 ? priorCount + 1 : 1;
    storage.setItem(SEED_FALLBACK_COUNTER_KEY, String(nextCount));
    return `seed-${nextCount.toString(16).padStart(8, '0')}`;
  }

  return 'seed-00000001';
}

export function validateSimulationConfig(input) {
  const errors = {};

  if (!String(input.name ?? '').trim()) {
    errors.name = 'Simulation name is required.';
  }

  const numericChecks = [
    ['worldWidth', 100, 3000, 'World width must be between 100 and 3000.'],
    ['worldHeight', 100, 3000, 'World height must be between 100 and 3000.'],
    ['initialPopulation', 1, 500, 'Initial population must be between 1 and 500.'],
    ['minimumPopulation', 1, 500, 'Minimum population must be between 1 and 500.'],
    ['initialFoodCount', 0, 1000, 'Initial food count must be between 0 and 1000.'],
    ['foodSpawnChance', 0, 1, 'Food spawn chance must be between 0 and 1.'],
    ['foodEnergyValue', 1, 100, 'Food energy value must be between 1 and 100.'],
    ['maxFood', 1, 2000, 'Max food must be between 1 and 2000.'],
    ['mutationRate', 0, 1, 'Mutation rate must be between 0 and 1.'],
    ['mutationStrength', 0, 1, 'Mutation strength must be between 0 and 1.']
  ];

  for (const [field, min, max, message] of numericChecks) {
    const value = Number(input[field]);
    if (!Number.isFinite(value) || value < min || value > max) {
      errors[field] = message;
    }
  }

  if (
    Number.isFinite(Number(input.maxFood))
    && Number.isFinite(Number(input.initialFoodCount))
    && Number(input.maxFood) < Number(input.initialFoodCount)
  ) {
    errors.maxFood = 'Max food must be greater than or equal to initial food count.';
  }

  return errors;
}

export function normalizeSimulationConfig(input, resolvedSeed) {
  return {
    name: String(input.name).trim(),
    seed: String(input.seed ?? '').trim(),
    resolvedSeed,
    worldWidth: Number(input.worldWidth ?? DEFAULT_CONFIG.worldWidth),
    worldHeight: Number(input.worldHeight ?? DEFAULT_CONFIG.worldHeight),
    initialPopulation: Number(input.initialPopulation ?? DEFAULT_CONFIG.initialPopulation),
    minimumPopulation: Number(input.minimumPopulation ?? input.initialPopulation ?? DEFAULT_CONFIG.minimumPopulation),
    initialFoodCount: Number(input.initialFoodCount ?? DEFAULT_CONFIG.initialFoodCount),
    foodSpawnChance: Number(input.foodSpawnChance ?? DEFAULT_CONFIG.foodSpawnChance),
    foodEnergyValue: Number(input.foodEnergyValue ?? DEFAULT_CONFIG.foodEnergyValue),
    maxFood: Number(input.maxFood ?? DEFAULT_CONFIG.maxFood),
    mutationRate: Number(input.mutationRate ?? DEFAULT_CONFIG.mutationRate),
    mutationStrength: Number(input.mutationStrength ?? DEFAULT_CONFIG.mutationStrength)
  };
}

function createInitialBrain(rng) {
  const neurons = [
    { id: 'in-energy', type: 'input' },
    { id: 'in-food-distance', type: 'input' },
    { id: 'in-food-direction', type: 'input' },
    { id: 'in-speed', type: 'input' },
    { id: 'out-forward', type: 'output' },
    { id: 'out-turn-left', type: 'output' },
    { id: 'out-turn-right', type: 'output' }
  ];

  const inputIds = neurons.filter((neuron) => neuron.type === 'input').map((neuron) => neuron.id);
  const outputIds = neurons.filter((neuron) => neuron.type === 'output').map((neuron) => neuron.id);

  const synapseCount = 1 + rng.nextInt(0, 3);
  const synapses = [];
  const usedPairs = new Set();

  while (synapses.length < synapseCount) {
    const sourceId = inputIds[rng.nextInt(0, inputIds.length)];
    const targetId = outputIds[rng.nextInt(0, outputIds.length)];
    const pairKey = `${sourceId}->${targetId}`;

    if (usedPairs.has(pairKey)) {
      continue;
    }

    usedPairs.add(pairKey);
    synapses.push({
      id: `syn-${synapses.length + 1}`,
      sourceId,
      targetId,
      weight: Number(((rng.nextFloat() * 2) - 1).toFixed(3))
    });
  }

  return {
    neurons,
    synapses
  };
}

function createRandomizedOrganism({ id, rng, worldWidth, worldHeight }) {
  return {
    id,
    x: rng.nextFloat() * worldWidth,
    y: rng.nextFloat() * worldHeight,
    energy: 20,
    age: 0,
    generation: 1,
    direction: Number((rng.nextFloat() * Math.PI * 2).toFixed(6)),
    traits: {
      size: Number((0.8 + rng.nextFloat() * 0.8).toFixed(3)),
      speed: Number((0.8 + rng.nextFloat() * 1.6).toFixed(3)),
      visionRange: Number((25 + rng.nextFloat() * 90).toFixed(3)),
      turnRate: Number((0.03 + rng.nextFloat() * 0.09).toFixed(3)),
      metabolism: Number((0.02 + rng.nextFloat() * 0.1).toFixed(3))
    },
    brain: createInitialBrain(rng)
  };
}

export function createInitialWorldFromConfig(config) {
  const rng = createSeededPrng(`${config.resolvedSeed}:initial-world`);

  const organisms = Array.from({ length: config.initialPopulation }, (_, index) => createRandomizedOrganism({
    id: `org-${index + 1}`,
    rng,
    worldWidth: config.worldWidth,
    worldHeight: config.worldHeight
  }));

  const food = Array.from({ length: config.initialFoodCount }, (_, index) => ({
    id: `food-0-${index}`,
    x: rng.nextFloat() * config.worldWidth,
    y: rng.nextFloat() * config.worldHeight,
    energyValue: config.foodEnergyValue
  }));

  return createWorldState({
    tick: 0,
    organisms,
    food
  });
}

export function toEngineStepParams(config) {
  return {
    movementDelta: 1.5,
    metabolismPerTick: 0.05,
    foodSpawnChance: config.foodSpawnChance,
    foodEnergyValue: config.foodEnergyValue,
    worldWidth: config.worldWidth,
    worldHeight: config.worldHeight,
    maxFood: config.maxFood,
    minimumPopulation: config.minimumPopulation,
    mutationRate: config.mutationRate,
    mutationStrength: config.mutationStrength,
    createFloorSpawnOrganism: (id, rng) => createRandomizedOrganism({
      id,
      rng,
      worldWidth: config.worldWidth,
      worldHeight: config.worldHeight
    })
  };
}

function getStorage() {
  const storage = globalThis?.window?.localStorage;

  if (!storage) {
    return null;
  }

  if (
    typeof storage.getItem !== 'function'
    || typeof storage.setItem !== 'function'
  ) {
    return null;
  }

  return storage;
}

function isFiniteInRange(value, min, max) {
  return Number.isFinite(value) && value >= min && value <= max;
}

function sanitizeLoadedConfigDraft(parsed) {
  const source = parsed && typeof parsed === 'object' ? parsed : {};

  const numericConstraints = {
    worldWidth: [100, 3000],
    worldHeight: [100, 3000],
    initialPopulation: [1, 500],
    minimumPopulation: [1, 500],
    initialFoodCount: [0, 1000],
    foodSpawnChance: [0, 1],
    foodEnergyValue: [1, 100],
    maxFood: [1, 2000],
    mutationRate: [0, 1],
    mutationStrength: [0, 1]
  };

  const resolvedSeed = typeof source.resolvedSeed === 'string' ? source.resolvedSeed.trim() : '';

  const sanitized = {
    ...DEFAULT_CONFIG,
    name: String(source.name ?? '').trim() || DEFAULT_CONFIG.name,
    seed: typeof source.seed === 'string'
      ? source.seed.trim()
      : resolvedSeed || DEFAULT_CONFIG.seed,
    resolvedSeed: resolvedSeed || undefined
  };

  for (const [field, [min, max]] of Object.entries(numericConstraints)) {
    const candidate = Number(source[field]);
    sanitized[field] = isFiniteInRange(candidate, min, max) ? candidate : DEFAULT_CONFIG[field];
  }

  if (sanitized.maxFood < sanitized.initialFoodCount) {
    sanitized.initialFoodCount = DEFAULT_CONFIG.initialFoodCount;
    sanitized.maxFood = DEFAULT_CONFIG.maxFood;
  }

  return sanitized;
}

export function saveSimulationConfig(config) {
  const storage = getStorage();
  if (!storage) {
    return;
  }

  storage.setItem(STORAGE_KEY, JSON.stringify(config));
}

export function loadSimulationConfig() {
  const storage = getStorage();
  if (!storage) {
    return null;
  }

  const raw = storage.getItem(STORAGE_KEY);
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw);
    return sanitizeLoadedConfigDraft(parsed);
  } catch {
    return null;
  }
}
