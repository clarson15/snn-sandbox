import { createWorldState } from './engine';
import { createSeededPrng } from './prng';

export const STORAGE_KEY = 'snn-sandbox.latest-simulation-config';

export const DEFAULT_CONFIG = {
  name: 'New Simulation',
  seed: '',
  worldWidth: 800,
  worldHeight: 480,
  initialPopulation: 12,
  initialFoodCount: 30,
  foodSpawnChance: 0.04,
  foodEnergyValue: 5,
  maxFood: 120
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

  return `seed-${Math.floor(Math.random() * Number.MAX_SAFE_INTEGER)}`;
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
    ['initialFoodCount', 0, 1000, 'Initial food count must be between 0 and 1000.'],
    ['foodSpawnChance', 0, 1, 'Food spawn chance must be between 0 and 1.'],
    ['foodEnergyValue', 1, 100, 'Food energy value must be between 1 and 100.'],
    ['maxFood', 1, 2000, 'Max food must be between 1 and 2000.']
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
    worldWidth: Number(input.worldWidth),
    worldHeight: Number(input.worldHeight),
    initialPopulation: Number(input.initialPopulation),
    initialFoodCount: Number(input.initialFoodCount),
    foodSpawnChance: Number(input.foodSpawnChance),
    foodEnergyValue: Number(input.foodEnergyValue),
    maxFood: Number(input.maxFood)
  };
}

export function createInitialWorldFromConfig(config) {
  const rng = createSeededPrng(`${config.resolvedSeed}:initial-world`);

  const organisms = Array.from({ length: config.initialPopulation }, (_, index) => ({
    id: `org-${index + 1}`,
    x: rng.nextFloat() * config.worldWidth,
    y: rng.nextFloat() * config.worldHeight,
    energy: 20
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
    maxFood: config.maxFood
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
    return {
      ...DEFAULT_CONFIG,
      ...parsed,
      seed: parsed.seed ?? parsed.resolvedSeed ?? ''
    };
  } catch {
    return null;
  }
}
