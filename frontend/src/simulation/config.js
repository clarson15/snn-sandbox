import { createWorldState } from './engine.js';
import { createSeededPrng } from './prng.js';

export const STORAGE_KEY = 'snn-sandbox.latest-simulation-config';
export const SEED_FALLBACK_COUNTER_KEY = 'snn-sandbox.seed-fallback-counter';

// Simulation quick-start presets
export const SIMULATION_PRESETS = [
  {
    id: 'balanced',
    name: 'Balanced',
    description: 'Default settings for a stable, balanced ecosystem',
    config: {
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
    }
  },
  {
    id: 'dense-colony',
    name: 'Dense Colony',
    description: 'High population with abundant food resources',
    config: {
      worldWidth: 1200,
      worldHeight: 720,
      initialPopulation: 50,
      minimumPopulation: 30,
      initialFoodCount: 100,
      foodSpawnChance: 0.08,
      foodEnergyValue: 5,
      maxFood: 400,
      mutationRate: 0.03,
      mutationStrength: 0.05
    }
  },
  {
    id: 'rapid-evolution',
    name: 'Rapid Evolution',
    description: 'High mutation rate for fast evolutionary changes',
    config: {
      worldWidth: 800,
      worldHeight: 480,
      initialPopulation: 20,
      minimumPopulation: 10,
      initialFoodCount: 40,
      foodSpawnChance: 0.05,
      foodEnergyValue: 5,
      maxFood: 150,
      mutationRate: 0.2,
      mutationStrength: 0.3
    }
  },
  {
    id: 'sparse-survival',
    name: 'Sparse Survival',
    description: 'Low population with scarce resources - survival of the fittest',
    config: {
      worldWidth: 1600,
      worldHeight: 960,
      initialPopulation: 6,
      minimumPopulation: 4,
      initialFoodCount: 15,
      foodSpawnChance: 0.02,
      foodEnergyValue: 8,
      maxFood: 60,
      mutationRate: 0.1,
      mutationStrength: 0.15
    }
  },
  {
    id: 'stress-test-2000',
    name: 'Stress Test (2000)',
    description: 'Performance validation preset targeting 2000 organisms at deterministic settings',
    config: {
      worldWidth: 1600,
      worldHeight: 900,
      initialPopulation: 2000,
      minimumPopulation: 400,
      initialFoodCount: 900,
      foodSpawnChance: 0.05,
      foodEnergyValue: 5,
      maxFood: 2000,
      mutationRate: 0.05,
      mutationStrength: 0.1
    }
  }
];

/**
 * Get a preset by its ID
 * @param {string} presetId - The preset ID to look up
 * @returns {object|null} The preset object or null if not found
 */
export function getPresetById(presetId) {
  return SIMULATION_PRESETS.find((p) => p.id === presetId) || null;
}

/**
 * Apply a preset's configuration values to a base config object
 * @param {string} presetId - The preset ID to apply
 * @param {object} baseConfig - Base config to merge preset values into
 * @returns {object} Config with preset values applied
 */
export function applyPreset(presetId, baseConfig = {}) {
  const preset = getPresetById(presetId);
  if (!preset) {
    return { ...DEFAULT_CONFIG, ...baseConfig };
  }

  return {
    ...DEFAULT_CONFIG,
    ...baseConfig,
    ...preset.config
  };
}

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
  mutationStrength: 0.1,
  // Environmental hazards
  enableObstacles: false,
  obstacleCount: 3,
  obstacleMinSize: 30,
  obstacleMaxSize: 80,
  enableDangerZones: false,
  dangerZoneCount: 2,
  dangerZoneRadius: 40,
  dangerZoneDamage: 0.5
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
    ['initialPopulation', 1, 2000, 'Initial population must be between 1 and 2000.'],
    ['minimumPopulation', 1, 2000, 'Minimum population must be between 1 and 2000.'],
    ['initialFoodCount', 0, 1000, 'Initial food count must be between 0 and 1000.'],
    ['foodSpawnChance', 0, 1, 'Food spawn chance must be between 0 and 1.'],
    ['foodEnergyValue', 1, 100, 'Food energy value must be between 1 and 100.'],
    ['maxFood', 1, 2000, 'Max food must be between 1 and 2000.'],
    ['mutationRate', 0, 1, 'Mutation rate must be between 0 and 1.'],
    ['mutationStrength', 0, 1, 'Mutation strength must be between 0 and 1.'],
    // Hazard validation
    ['obstacleCount', 0, 20, 'Obstacle count must be between 0 and 20.'],
    ['obstacleMinSize', 10, 200, 'Obstacle min size must be between 10 and 200.'],
    ['obstacleMaxSize', 10, 200, 'Obstacle max size must be between 10 and 200.'],
    ['dangerZoneCount', 0, 10, 'Danger zone count must be between 0 and 10.'],
    ['dangerZoneRadius', 10, 200, 'Danger zone radius must be between 10 and 200.'],
    ['dangerZoneDamage', 0, 5, 'Danger zone damage must be between 0 and 5.']
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
    mutationStrength: Number(input.mutationStrength ?? DEFAULT_CONFIG.mutationStrength),
    // Environmental hazards
    enableObstacles: Boolean(input.enableObstacles ?? DEFAULT_CONFIG.enableObstacles),
    obstacleCount: Number(input.obstacleCount ?? DEFAULT_CONFIG.obstacleCount),
    obstacleMinSize: Number(input.obstacleMinSize ?? DEFAULT_CONFIG.obstacleMinSize),
    obstacleMaxSize: Number(input.obstacleMaxSize ?? DEFAULT_CONFIG.obstacleMaxSize),
    enableDangerZones: Boolean(input.enableDangerZones ?? DEFAULT_CONFIG.enableDangerZones),
    dangerZoneCount: Number(input.dangerZoneCount ?? DEFAULT_CONFIG.dangerZoneCount),
    dangerZoneRadius: Number(input.dangerZoneRadius ?? DEFAULT_CONFIG.dangerZoneRadius),
    dangerZoneDamage: Number(input.dangerZoneDamage ?? DEFAULT_CONFIG.dangerZoneDamage)
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

  // Generate obstacles if enabled
  const obstacles = [];
  if (config.enableObstacles && config.obstacleCount > 0) {
    for (let i = 0; i < config.obstacleCount; i++) {
      const width = config.obstacleMinSize + rng.nextFloat() * (config.obstacleMaxSize - config.obstacleMinSize);
      const height = config.obstacleMinSize + rng.nextFloat() * (config.obstacleMaxSize - config.obstacleMinSize);
      const x = rng.nextFloat() * (config.worldWidth - width);
      const y = rng.nextFloat() * (config.worldHeight - height);
      obstacles.push({
        id: `obstacle-${i}`,
        x,
        y,
        width,
        height
      });
    }
  }

  // Generate danger zones if enabled
  const dangerZones = [];
  if (config.enableDangerZones && config.dangerZoneCount > 0) {
    for (let i = 0; i < config.dangerZoneCount; i++) {
      const x = config.dangerZoneRadius + rng.nextFloat() * (config.worldWidth - 2 * config.dangerZoneRadius);
      const y = config.dangerZoneRadius + rng.nextFloat() * (config.worldHeight - 2 * config.dangerZoneRadius);
      dangerZones.push({
        id: `dangerzone-${i}`,
        x,
        y,
        radius: config.dangerZoneRadius,
        damagePerTick: config.dangerZoneDamage
      });
    }
  }

  // Store hazards in the world state for rendering and engine access
  return createWorldState({
    tick: 0,
    organisms,
    food,
    obstacles,
    dangerZones
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

export function createDeterministicRunBootstrap(config) {
  return {
    initialWorld: createInitialWorldFromConfig(config),
    rng: createSeededPrng(config.resolvedSeed),
    stepParams: toEngineStepParams(config)
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

/**
 * Validates and normalizes a loaded simulation snapshot with deterministic fallback rules.
 * Returns normalized data plus any warnings for missing/invalid fields.
 * 
 * Fallback rules are deterministic:
 * - Missing/invalid seed → derive from snapshot ID (stable per-snapshot) or 'snapshot-resume-seed'
 * - Missing/invalid parameters → use DEFAULT_CONFIG values
 * - Missing/invalid worldState → create empty world at tick 0
 * - Invalid tick → default to 0
 * - Missing/invalid rngState → derive from seed (reproducible)
 * 
 * @param {object} snapshot - Raw snapshot from API
 * @returns {{ config: object, world: object, rngState: number|null, warnings: string[], errors: string[] }}
 */
export function validateAndNormalizeLoadedSnapshot(snapshot) {
  const warnings = [];
  const errors = [];
  
  // Validate required top-level fields with deterministic fallbacks
  const hasValidParameters = snapshot?.parameters && typeof snapshot.parameters === 'object';
  const hasValidWorldState = snapshot?.worldState && typeof snapshot.worldState === 'object';
  const hasValidTickCount = Number.isInteger(snapshot?.tickCount) && snapshot.tickCount >= 0;
  
  // Seed: derive deterministically from snapshot ID or use fallback
  let seed;
  if (typeof snapshot?.seed === 'string' && snapshot.seed.trim().length > 0) {
    seed = snapshot.seed.trim();
  } else if (typeof snapshot?.id === 'string' && snapshot.id.length > 0) {
    // Derive deterministic seed from snapshot ID - same ID always produces same seed
    seed = `snapshot-${snapshot.id.slice(0, 8)}`;
    warnings.push('Seed missing; derived from snapshot ID');
  } else {
    seed = 'snapshot-resume-seed';
    warnings.push('Seed missing; using fallback seed');
  }
  
  // Parameters: use DEFAULT_CONFIG with fallbacks
  let config;
  if (hasValidParameters) {
    config = normalizeSimulationConfig(snapshot.parameters, seed);
    // Check for individual field issues
    if (!Number.isFinite(config.worldWidth)) {
      warnings.push('Parameters.worldWidth invalid; using default');
    }
    if (!Number.isFinite(config.worldHeight)) {
      warnings.push('Parameters.worldHeight invalid; using default');
    }
  } else {
    config = normalizeSimulationConfig(DEFAULT_CONFIG, seed);
    warnings.push('Parameters missing; using defaults');
  }
  
  // World state: validate or create empty
  let world;
  if (hasValidWorldState) {
    const worldTick = snapshot.worldState?.tick;
    if (!Number.isInteger(worldTick) || worldTick < 0) {
      warnings.push('WorldState.tick invalid; defaulting to 0');
      world = createWorldState({ tick: 0 });
    } else if (hasValidTickCount && worldTick !== snapshot.tickCount) {
      warnings.push('WorldState.tick does not match tickCount; using worldState.tick');
      world = createWorldState({ ...snapshot.worldState, tick: worldTick });
    } else {
      world = createWorldState(snapshot.worldState);
    }
  } else {
    world = createWorldState({ tick: hasValidTickCount ? snapshot.tickCount : 0 });
    warnings.push('WorldState missing; created empty world');
  }
  
  // RngState: derive from seed if missing (deterministic)
  let rngState = null;
  if (typeof snapshot?.rngState === 'number' && Number.isFinite(snapshot.rngState)) {
    rngState = snapshot.rngState;
  } else {
    warnings.push('RNG state missing; deriving from seed');
  }
  
  // Tick count validation
  const tickCount = hasValidTickCount ? snapshot.tickCount : 0;
  if (!hasValidTickCount) {
    warnings.push('Tick count invalid; defaulting to 0');
  }
  
  // Schema version warning (if present)
  if (snapshot?.schemaVersion !== undefined && snapshot.schemaVersion !== 1) {
    warnings.push(`Schema version ${snapshot.schemaVersion} may not be compatible`);
  }
  
  return {
    config,
    world,
    rngState,
    tickCount,
    warnings,
    errors
  };
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
