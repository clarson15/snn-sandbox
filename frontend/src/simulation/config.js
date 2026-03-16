import { createWorldState } from './engine.js';
import {
  createNeuronDefinition,
  getInputNeuronIdsForOrganismType,
  OUTPUT_NEURON_IDS
} from './brainSchema.js';
import { createSeededPrng } from './prng.js';

export const STORAGE_KEY = 'snn-sandbox.latest-simulation-config';
export const SEED_FALLBACK_COUNTER_KEY = 'snn-sandbox.seed-fallback-counter';
export const CUSTOM_PRESETS_KEY = 'snn-sandbox.custom-presets';

export const DEFAULT_TERRAIN_ZONE_GENERATION = {
  enabled: true,
  zoneCount: 4,
  minimumZoneWidthRatio: 0.18,
  maximumZoneWidthRatio: 0.42,
  minimumZoneHeightRatio: 0.18,
  maximumZoneHeightRatio: 0.42,
  zoneTypes: ['plains', 'forest', 'wetland', 'rocky']
};

/**
 * Get all custom presets from localStorage
 * @returns {Array} Array of custom preset objects
 */
export function getCustomPresets() {
  const storage = getStorage();
  if (!storage) {
    return [];
  }

  try {
    const raw = storage.getItem(CUSTOM_PRESETS_KEY);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * Save a custom preset to localStorage
 * @param {string} name - Preset name
 * @param {object} config - Configuration object
 * @returns {boolean} Success status
 */
export function saveCustomPreset(name, config) {
  const storage = getStorage();
  if (!storage) {
    return false;
  }

  const presets = getCustomPresets();
  const now = Date.now();
  
  // Create preset object with required fields
  const preset = {
    id: `custom-${now}`,
    name: name.trim(),
    description: `Custom preset: ${name}`,
    config: {
      worldWidth: config.worldWidth,
      worldHeight: config.worldHeight,
      initialPopulation: config.initialPopulation,
      minimumPopulation: config.minimumPopulation,
      initialFoodCount: config.initialFoodCount,
      foodSpawnChance: config.foodSpawnChance,
      foodEnergyValue: config.foodEnergyValue,
      maxFood: config.maxFood,
      // Legacy mutation fields (for backward compatibility)
      mutationRate: config.mutationRate,
      mutationStrength: config.mutationStrength,
      // Trait-specific mutation controls (SSN-254)
      physicalTraitsMutationRate: config.physicalTraitsMutationRate,
      physicalTraitsMutationStrength: config.physicalTraitsMutationStrength,
      brainStructureMutationRate: config.brainStructureMutationRate,
      brainWeightMutationRate: config.brainWeightMutationRate,
      brainWeightMutationStrength: config.brainWeightMutationStrength,
      reproductionThreshold: config.reproductionThreshold,
      reproductionCost: config.reproductionCost,
      offspringStartEnergy: config.offspringStartEnergy,
      reproductionMinimumAge: config.reproductionMinimumAge,
      reproductionRefractoryPeriod: config.reproductionRefractoryPeriod,
      maximumOrganismAge: config.maximumOrganismAge,
      initialPredatorCount: config.initialPredatorCount,
      predatorEnergyGain: config.predatorEnergyGain,
      predatorHuntRadius: config.predatorHuntRadius,
      terrainZoneGeneration: config.terrainZoneGeneration

    },
    createdAt: now
  };

  presets.push(preset);
  
  try {
    storage.setItem(CUSTOM_PRESETS_KEY, JSON.stringify(presets));
    return true;
  } catch {
    return false;
  }
}

/**
 * Delete a custom preset by ID
 * @param {string} presetId - ID of preset to delete
 * @returns {boolean} Success status
 */
export function deleteCustomPreset(presetId) {
  const storage = getStorage();
  if (!storage) {
    return false;
  }

  const presets = getCustomPresets();
  const filtered = presets.filter(p => p.id !== presetId);
  
  try {
    storage.setItem(CUSTOM_PRESETS_KEY, JSON.stringify(filtered));
    return true;
  } catch {
    return false;
  }
}

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
      // Legacy mutation fields (for backward compatibility)
      mutationRate: 0.05,
      mutationStrength: 0.1,
      // Trait-specific mutation controls (SSN-254)
      physicalTraitsMutationRate: 0.05,
      physicalTraitsMutationStrength: 0.1,
      brainStructureMutationRate: 0.05,
      brainWeightMutationRate: 0.05,
      brainWeightMutationStrength: 0.1
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
      // Legacy mutation fields (for backward compatibility)
      mutationRate: 0.03,
      mutationStrength: 0.05,
      // Trait-specific mutation controls (SSN-254)
      physicalTraitsMutationRate: 0.03,
      physicalTraitsMutationStrength: 0.05,
      brainStructureMutationRate: 0.03,
      brainWeightMutationRate: 0.03,
      brainWeightMutationStrength: 0.05
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
      // Legacy mutation fields (for backward compatibility)
      mutationRate: 0.2,
      mutationStrength: 0.3,
      // Trait-specific mutation controls (SSN-254)
      physicalTraitsMutationRate: 0.2,
      physicalTraitsMutationStrength: 0.3,
      brainStructureMutationRate: 0.2,
      brainWeightMutationRate: 0.2,
      brainWeightMutationStrength: 0.3
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
      // Legacy mutation fields (for backward compatibility)
      mutationRate: 0.1,
      mutationStrength: 0.15,
      // Trait-specific mutation controls (SSN-254)
      physicalTraitsMutationRate: 0.1,
      physicalTraitsMutationStrength: 0.15,
      brainStructureMutationRate: 0.1,
      brainWeightMutationRate: 0.1,
      brainWeightMutationStrength: 0.15
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
      // Legacy mutation fields (for backward compatibility)
      mutationRate: 0.05,
      mutationStrength: 0.1,
      // Trait-specific mutation controls (SSN-254)
      physicalTraitsMutationRate: 0.05,
      physicalTraitsMutationStrength: 0.1,
      brainStructureMutationRate: 0.05,
      brainWeightMutationRate: 0.05,
      brainWeightMutationStrength: 0.1
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
  worldWidth: 1920,
  worldHeight: 1080,
  initialPopulation: 20,
  minimumPopulation: 20,
  initialFoodCount: 30,
  foodSpawnChance: 0.1,
  foodEnergyValue: 10,
  maxFood: 450,
  // Legacy mutation controls (fallback for backward compatibility)
  mutationRate: 0.05,
  mutationStrength: 0.1,
  // Trait-specific mutation controls (SSN-254)
  physicalTraitsMutationRate: 0.05,
  physicalTraitsMutationStrength: 0.1,
  brainStructureMutationRate: 0.05,
  brainWeightMutationRate: 0.05,
  brainWeightMutationStrength: 0.1,
  // Reproduction settings
  reproductionThreshold: 42,
  reproductionCost: 20,
  offspringStartEnergy: 15,
  reproductionMinimumAge: 25,
  reproductionRefractoryPeriod: 120,
  maximumOrganismAge: 1000,
  // Environmental hazards
  enableObstacles: false,
  obstacleCount: 3,
  obstacleMinSize: 30,
  obstacleMaxSize: 80,
  enableDangerZones: false,
  dangerZoneCount: 2,
  dangerZoneRadius: 40,
  dangerZoneDamage: 0.5,
  // Predator settings
  initialPredatorCount: 0,
  predatorEnergyGain: 30,
  predatorHuntRadius: 50,
  // Terrain zone generation settings
  terrainZoneGeneration: {
    enabled: false,
    zoneCount: 4,
    minZoneWidthRatio: 0.15,
    maxZoneWidthRatio: 0.3,
    minZoneHeightRatio: 0.15,
    maxZoneHeightRatio: 0.3
  }

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
    // Legacy mutation fields (backward compatibility)
    ['mutationRate', 0, 1, 'Mutation rate must be between 0 and 1.'],
    ['mutationStrength', 0, 1, 'Mutation strength must be between 0 and 1.'],
    // Trait-specific mutation controls (SSN-254)
    ['physicalTraitsMutationRate', 0, 1, 'Physical traits mutation rate must be between 0 and 1.'],
    ['physicalTraitsMutationStrength', 0, 1, 'Physical traits mutation strength must be between 0 and 1.'],
    ['brainStructureMutationRate', 0, 1, 'Brain structure mutation rate must be between 0 and 1.'],
    ['brainWeightMutationRate', 0, 1, 'Brain weight mutation rate must be between 0 and 1.'],
    ['brainWeightMutationStrength', 0, 1, 'Brain weight mutation strength must be between 0 and 1.'],
    ['reproductionThreshold', 1, 200, 'Reproduction threshold must be between 1 and 200.'],
    ['reproductionCost', 0, 200, 'Reproduction cost must be between 0 and 200.'],
    ['offspringStartEnergy', 0, 200, 'Offspring start energy must be between 0 and 200.'],
    ['reproductionMinimumAge', 0, 5000, 'Reproduction age must be between 0 and 5000.'],
    ['reproductionRefractoryPeriod', 0, 5000, 'Reproduction refractory period must be between 0 and 5000.'],
    ['maximumOrganismAge', 1, 10000, 'Maximum organism age must be between 1 and 10000.'],
    ['initialPredatorCount', 0, 500, 'Initial predator count must be between 0 and 500.'],
    ['predatorEnergyGain', 1, 200, 'Predator energy gain must be between 1 and 200.'],
    ['predatorHuntRadius', 1, 500, 'Predator hunt radius must be between 1 and 500.'],
    // Hazard validation
    ['obstacleCount', 0, 20, 'Obstacle count must be between 0 and 20.'],
    ['obstacleMinSize', 10, 200, 'Obstacle min size must be between 10 and 200.'],
    ['obstacleMaxSize', 10, 200, 'Obstacle max size must be between 10 and 200.'],
    ['dangerZoneCount', 0, 10, 'Danger zone count must be between 0 and 10.'],
    ['dangerZoneRadius', 10, 200, 'Danger zone radius must be between 10 and 200.'],
    ['dangerZoneDamage', 0, 5, 'Danger zone damage must be between 0 and 5.'],
    ['terrainZoneGeneration.zoneCount', 0, 24, 'Terrain zone count must be between 0 and 24.'],
    ['terrainZoneGeneration.minZoneWidthRatio', 0.05, 1, 'Terrain minimum width ratio must be between 0.05 and 1.'],
    ['terrainZoneGeneration.maxZoneWidthRatio', 0.05, 1, 'Terrain maximum width ratio must be between 0.05 and 1.'],
    ['terrainZoneGeneration.minZoneHeightRatio', 0.05, 1, 'Terrain minimum height ratio must be between 0.05 and 1.'],
    ['terrainZoneGeneration.maxZoneHeightRatio', 0.05, 1, 'Terrain maximum height ratio must be between 0.05 and 1.']
  ];

  // Terrain zone generation validation
  const tzInput = input.terrainZoneGeneration ?? {};
  const tzEnabled = Boolean(tzInput.enabled ?? DEFAULT_CONFIG.terrainZoneGeneration.enabled);
  const tzZoneCount = Number(tzInput.zoneCount ?? DEFAULT_CONFIG.terrainZoneGeneration.zoneCount);
  const tzMinWidthRatio = Number(tzInput.minZoneWidthRatio ?? DEFAULT_CONFIG.terrainZoneGeneration.minZoneWidthRatio);
  const tzMaxWidthRatio = Number(tzInput.maxZoneWidthRatio ?? DEFAULT_CONFIG.terrainZoneGeneration.maxZoneWidthRatio);
  const tzMinHeightRatio = Number(tzInput.minZoneHeightRatio ?? DEFAULT_CONFIG.terrainZoneGeneration.minZoneHeightRatio);
  const tzMaxHeightRatio = Number(tzInput.maxZoneHeightRatio ?? DEFAULT_CONFIG.terrainZoneGeneration.maxZoneHeightRatio);

  if (tzEnabled) {
    if (!Number.isFinite(tzZoneCount) || tzZoneCount < 1 || tzZoneCount > 20) {
      errors.terrainZoneCount = 'Terrain zone count must be between 1 and 20.';
    }
    if (!Number.isFinite(tzMinWidthRatio) || tzMinWidthRatio < 0.05 || tzMinWidthRatio > 0.5) {
      errors.terrainZoneMinWidthRatio = 'Min zone width ratio must be between 0.05 and 0.5.';
    }
    if (!Number.isFinite(tzMaxWidthRatio) || tzMaxWidthRatio < 0.05 || tzMaxWidthRatio > 0.5) {
      errors.terrainZoneMaxWidthRatio = 'Max zone width ratio must be between 0.05 and 0.5.';
    }
    if (!Number.isFinite(tzMinHeightRatio) || tzMinHeightRatio < 0.05 || tzMinHeightRatio > 0.5) {
      errors.terrainZoneMinHeightRatio = 'Min zone height ratio must be between 0.05 and 0.5.';
    }
    if (!Number.isFinite(tzMaxHeightRatio) || tzMaxHeightRatio < 0.05 || tzMaxHeightRatio > 0.5) {
      errors.terrainZoneMaxHeightRatio = 'Max zone height ratio must be between 0.05 and 0.5.';
    }
    // Validate ratios are in correct order
    if (Number.isFinite(tzMinWidthRatio) && Number.isFinite(tzMaxWidthRatio) && tzMinWidthRatio > tzMaxWidthRatio) {
      errors.terrainZoneWidthRatio = 'Min zone width ratio must be less than or equal to max zone width ratio.';
    }
    if (Number.isFinite(tzMinHeightRatio) && Number.isFinite(tzMaxHeightRatio) && tzMinHeightRatio > tzMaxHeightRatio) {
      errors.terrainZoneHeightRatio = 'Min zone height ratio must be less than or equal to max zone height ratio.';
    }
  }

  for (const [field, min, max, message] of numericChecks) {
    const sourceValue = field.includes('.')
      ? field.split('.').reduce((acc, key) => acc?.[key], input)
      : input[field];
    const defaultValue = field.includes('.')
      ? field.split('.').reduce((acc, key) => acc?.[key], DEFAULT_CONFIG)
      : DEFAULT_CONFIG[field];
    const value = Number(sourceValue ?? defaultValue);

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
  const terrainZoneGeneration = {
    ...DEFAULT_TERRAIN_ZONE_GENERATION,
    ...(input.terrainZoneGeneration ?? {})
  };

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
    // Legacy mutation fields (for backward compatibility)
    mutationRate: Number(input.mutationRate ?? DEFAULT_CONFIG.mutationRate),
    mutationStrength: Number(input.mutationStrength ?? DEFAULT_CONFIG.mutationStrength),
    // Trait-specific mutation controls (SSN-254)
    // Use legacy values as fallback if new fields are not provided
    physicalTraitsMutationRate: Number(input.physicalTraitsMutationRate ?? input.mutationRate ?? DEFAULT_CONFIG.physicalTraitsMutationRate),
    physicalTraitsMutationStrength: Number(input.physicalTraitsMutationStrength ?? input.mutationStrength ?? DEFAULT_CONFIG.physicalTraitsMutationStrength),
    brainStructureMutationRate: Number(input.brainStructureMutationRate ?? input.mutationRate ?? DEFAULT_CONFIG.brainStructureMutationRate),
    brainWeightMutationRate: Number(input.brainWeightMutationRate ?? input.mutationRate ?? DEFAULT_CONFIG.brainWeightMutationRate),
    brainWeightMutationStrength: Number(input.brainWeightMutationStrength ?? input.mutationStrength ?? DEFAULT_CONFIG.brainWeightMutationStrength),
    reproductionThreshold: Number(input.reproductionThreshold ?? DEFAULT_CONFIG.reproductionThreshold),
    reproductionCost: Number(input.reproductionCost ?? DEFAULT_CONFIG.reproductionCost),
    offspringStartEnergy: Number(input.offspringStartEnergy ?? DEFAULT_CONFIG.offspringStartEnergy),
    reproductionMinimumAge: Number(input.reproductionMinimumAge ?? DEFAULT_CONFIG.reproductionMinimumAge),
    reproductionRefractoryPeriod: Number(input.reproductionRefractoryPeriod ?? DEFAULT_CONFIG.reproductionRefractoryPeriod),
    maximumOrganismAge: Number(input.maximumOrganismAge ?? DEFAULT_CONFIG.maximumOrganismAge),
    // Environmental hazards
    enableObstacles: Boolean(input.enableObstacles ?? DEFAULT_CONFIG.enableObstacles),
    obstacleCount: Number(input.obstacleCount ?? DEFAULT_CONFIG.obstacleCount),
    obstacleMinSize: Number(input.obstacleMinSize ?? DEFAULT_CONFIG.obstacleMinSize),
    obstacleMaxSize: Number(input.obstacleMaxSize ?? DEFAULT_CONFIG.obstacleMaxSize),
    enableDangerZones: Boolean(input.enableDangerZones ?? DEFAULT_CONFIG.enableDangerZones),
    dangerZoneCount: Number(input.dangerZoneCount ?? DEFAULT_CONFIG.dangerZoneCount),
    dangerZoneRadius: Number(input.dangerZoneRadius ?? DEFAULT_CONFIG.dangerZoneRadius),
    dangerZoneDamage: Number(input.dangerZoneDamage ?? DEFAULT_CONFIG.dangerZoneDamage),
    initialPredatorCount: Number(input.initialPredatorCount ?? DEFAULT_CONFIG.initialPredatorCount),
    predatorEnergyGain: Number(input.predatorEnergyGain ?? DEFAULT_CONFIG.predatorEnergyGain),
    predatorHuntRadius: Number(input.predatorHuntRadius ?? DEFAULT_CONFIG.predatorHuntRadius),
    // Terrain zone generation
    terrainZoneGeneration: {
      enabled: Boolean(input.terrainZoneGeneration?.enabled ?? DEFAULT_CONFIG.terrainZoneGeneration.enabled),
      zoneCount: Number(input.terrainZoneGeneration?.zoneCount ?? DEFAULT_CONFIG.terrainZoneGeneration.zoneCount),
      minZoneWidthRatio: Number(input.terrainZoneGeneration?.minZoneWidthRatio ?? DEFAULT_CONFIG.terrainZoneGeneration.minZoneWidthRatio),
      maxZoneWidthRatio: Number(input.terrainZoneGeneration?.maxZoneWidthRatio ?? DEFAULT_CONFIG.terrainZoneGeneration.maxZoneWidthRatio),
      minZoneHeightRatio: Number(input.terrainZoneGeneration?.minZoneHeightRatio ?? DEFAULT_CONFIG.terrainZoneGeneration.minZoneHeightRatio),
      maxZoneHeightRatio: Number(input.terrainZoneGeneration?.maxZoneHeightRatio ?? DEFAULT_CONFIG.terrainZoneGeneration.maxZoneHeightRatio)

    }
  };
}

function generateTerrainZonesFromConfig(config, rng) {
  const generation = {
    ...DEFAULT_TERRAIN_ZONE_GENERATION,
    ...(config.terrainZoneGeneration ?? {})
  };

  if (!generation.enabled || generation.zoneCount <= 0) {
    return [];
  }

  const zoneTypes = Array.isArray(generation.zoneTypes) && generation.zoneTypes.length > 0
    ? generation.zoneTypes
    : DEFAULT_TERRAIN_ZONE_GENERATION.zoneTypes;

  const minWidth = config.worldWidth * generation.minimumZoneWidthRatio;
  const maxWidth = config.worldWidth * generation.maximumZoneWidthRatio;
  const minHeight = config.worldHeight * generation.minimumZoneHeightRatio;
  const maxHeight = config.worldHeight * generation.maximumZoneHeightRatio;

  return Array.from({ length: generation.zoneCount }, (_, index) => {
    const width = minWidth + (rng.nextFloat() * Math.max(0, maxWidth - minWidth));
    const height = minHeight + (rng.nextFloat() * Math.max(0, maxHeight - minHeight));
    const x = rng.nextFloat() * Math.max(0, config.worldWidth - width);
    const y = rng.nextFloat() * Math.max(0, config.worldHeight - height);

    return {
      id: `terrain-zone-${index}`,
      type: zoneTypes[index % zoneTypes.length],
      bounds: {
        x: Number(x.toFixed(3)),
        y: Number(y.toFixed(3)),
        width: Number(width.toFixed(3)),
        height: Number(height.toFixed(3))
      }
    };
  });
}

function createInitialBrain(rng, organismType = 'herbivore') {
  const hiddenCount = rng.nextInt(0, 3);
  const hiddenNeurons = Array.from({ length: hiddenCount }, (_, index) => createNeuronDefinition(
    `hidden-${index + 1}`,
    'hidden',
    {
      threshold: Number((0.7 + (rng.nextFloat() * 0.8)).toFixed(3)),
      decay: Number((0.65 + (rng.nextFloat() * 0.25)).toFixed(3))
    }
  ));

  const inputNeuronIds = getInputNeuronIdsForOrganismType(organismType);
  const neurons = [
    ...inputNeuronIds.map((id) => createNeuronDefinition(id, 'input')),
    ...hiddenNeurons,
    ...OUTPUT_NEURON_IDS.map((id) => createNeuronDefinition(id, 'output'))
  ];

  const inputIds = inputNeuronIds;
  const hiddenIds = hiddenNeurons.map((neuron) => neuron.id);
  const targetIds = hiddenIds.length > 0 ? [...hiddenIds, ...OUTPUT_NEURON_IDS] : [...OUTPUT_NEURON_IDS];
  const candidateSources = hiddenIds.length > 0 ? [...inputIds, ...hiddenIds] : [...inputIds];
  const synapseCount = 2 + rng.nextInt(0, 5);
  const synapses = [];
  const usedPairs = new Set();

  while (synapses.length < synapseCount) {
    const sourceId = candidateSources[rng.nextInt(0, candidateSources.length)];
    const targetId = targetIds[rng.nextInt(0, targetIds.length)];
    if (sourceId === targetId) {
      continue;
    }
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
    schemaVersion: 2,
    signalSubsteps: 2,
    neurons,
    synapses
  };
}

function colorToRgb(color) {
  const normalized = String(color ?? '').trim();
  const match = /^#?([0-9a-f]{6})$/i.exec(normalized);
  if (!match) {
    return null;
  }

  const hex = match[1];
  return {
    r: Number.parseInt(hex.slice(0, 2), 16),
    g: Number.parseInt(hex.slice(2, 4), 16),
    b: Number.parseInt(hex.slice(4, 6), 16)
  };
}

function rgbDistance(colorA, colorB) {
  const rgbA = colorToRgb(colorA);
  const rgbB = colorToRgb(colorB);
  if (!rgbA || !rgbB) {
    return Number.POSITIVE_INFINITY;
  }

  const dr = rgbA.r - rgbB.r;
  const dg = rgbA.g - rgbB.g;
  const db = rgbA.b - rgbB.b;
  return Math.sqrt((dr * dr) + (dg * dg) + (db * db));
}

function hslToHex(hue, saturation, lightness) {
  const normalizedHue = ((hue % 360) + 360) % 360;
  const s = Math.max(0, Math.min(1, saturation));
  const l = Math.max(0, Math.min(1, lightness));
  const chroma = (1 - Math.abs((2 * l) - 1)) * s;
  const segment = normalizedHue / 60;
  const x = chroma * (1 - Math.abs((segment % 2) - 1));

  let r1 = 0;
  let g1 = 0;
  let b1 = 0;

  if (segment >= 0 && segment < 1) {
    r1 = chroma;
    g1 = x;
  } else if (segment < 2) {
    r1 = x;
    g1 = chroma;
  } else if (segment < 3) {
    g1 = chroma;
    b1 = x;
  } else if (segment < 4) {
    g1 = x;
    b1 = chroma;
  } else if (segment < 5) {
    r1 = x;
    b1 = chroma;
  } else {
    r1 = chroma;
    b1 = x;
  }

  const matchLightness = l - (chroma / 2);
  const toHexChannel = (value) => Math.round((value + matchLightness) * 255).toString(16).padStart(2, '0');
  return `#${toHexChannel(r1)}${toHexChannel(g1)}${toHexChannel(b1)}`;
}

function createDistinctColorGenerator(seedOffset = 0, initialColors = []) {
  const assignedColors = [...initialColors];
  let sequenceIndex = 0;
  const goldenAngle = 137.50776405003785;
  const minDistance = 90;

  return () => {
    for (let attempt = 0; attempt < 256; attempt += 1) {
      const hue = (seedOffset + ((sequenceIndex + attempt) * goldenAngle)) % 360;
      const saturation = 0.68 + (((sequenceIndex + attempt) % 4) * 0.06);
      const lightness = 0.48 + (((sequenceIndex + attempt) % 3) * 0.08);
      const candidate = hslToHex(hue, Math.min(saturation, 0.9), Math.min(lightness, 0.72));
      const isDistinct = assignedColors.every((existingColor) => rgbDistance(existingColor, candidate) >= minDistance);
      if (!isDistinct) {
        continue;
      }

      sequenceIndex += attempt + 1;
      assignedColors.push(candidate);
      return candidate;
    }

    const fallback = hslToHex((seedOffset + (sequenceIndex * goldenAngle)) % 360, 0.75, 0.58);
    sequenceIndex += 1;
    assignedColors.push(fallback);
    return fallback;
  };
}

function createRandomizedOrganism({ id, rng, worldWidth, worldHeight, color, type = 'herbivore' }) {
  return {
    id,
    x: rng.nextFloat() * worldWidth,
    y: rng.nextFloat() * worldHeight,
    color,
    energy: 40,
    age: 0,
    generation: 1,
    type,
    direction: Number((rng.nextFloat() * Math.PI * 2).toFixed(6)),
    traits: {
      size: Number((0.8 + rng.nextFloat() * 0.8).toFixed(3)),
      speed: Number((0.8 + rng.nextFloat() * 1.6).toFixed(3)),
      visionRange: Number((25 + rng.nextFloat() * 90).toFixed(3)),
      turnRate: Number((0.03 + rng.nextFloat() * 0.09).toFixed(3)),
      metabolism: Number((0.02 + rng.nextFloat() * 0.1).toFixed(3)),
      adolescenceAge: Number((20 + rng.nextFloat() * 180).toFixed(3)),
      eggHatchTime: rng.nextFloat() < 0.25
        ? 0
        : Number((1 + rng.nextFloat() * 7).toFixed(3))
    },
    brain: createInitialBrain(rng, type)
  };
}

function createPredator({ id, rng, worldWidth, worldHeight, color }) {
  // Predators are larger, faster, but have higher metabolism
  return {
    id,
    x: rng.nextFloat() * worldWidth,
    y: rng.nextFloat() * worldHeight,
    color,
    energy: 60,
    age: 0,
    generation: 1,
    type: 'predator',
    direction: Number((rng.nextFloat() * Math.PI * 2).toFixed(6)),
    traits: {
      size: Number((1.2 + rng.nextFloat() * 1.0).toFixed(3)),
      speed: Number((1.2 + rng.nextFloat() * 2.0).toFixed(3)),
      visionRange: Number((40 + rng.nextFloat() * 100).toFixed(3)),
      turnRate: Number((0.04 + rng.nextFloat() * 0.1).toFixed(3)),
      metabolism: Number((0.05 + rng.nextFloat() * 0.15).toFixed(3))
    },
    brain: createInitialBrain(rng, 'predator')
  };
}

export function createInitialWorldFromConfig(config) {
  const rng = createSeededPrng(`${config.resolvedSeed}:initial-world`);
  const founderColorOffset = rng.nextFloat() * 360;
  const nextFounderColor = createDistinctColorGenerator(founderColorOffset);

  // Create herbivore organisms
  const herbivores = Array.from({ length: config.initialPopulation }, (_, index) => createRandomizedOrganism({
    id: `org-${index + 1}`,
    rng,
    worldWidth: config.worldWidth,
    worldHeight: config.worldHeight,
    color: nextFounderColor(),
    type: 'herbivore'
  }));

  // Create predator organisms if configured
  const predators = Array.from({ length: config.initialPredatorCount || 0 }, (_, index) => createPredator({
    id: `pred-${index + 1}`,
    rng,
    worldWidth: config.worldWidth,
    worldHeight: config.worldHeight,
    color: nextFounderColor()
  }));

  // Combine herbivores and predators
  const organisms = [...herbivores, ...predators];

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
  const hazardTypes = ['lava', 'acid', 'radiation'];
  if (config.enableDangerZones && config.dangerZoneCount > 0) {
    for (let i = 0; i < config.dangerZoneCount; i++) {
      const x = config.dangerZoneRadius + rng.nextFloat() * (config.worldWidth - 2 * config.dangerZoneRadius);
      const y = config.dangerZoneRadius + rng.nextFloat() * (config.worldHeight - 2 * config.dangerZoneRadius);
      // Rotate through hazard types for visual variety
      const type = hazardTypes[i % hazardTypes.length];
      dangerZones.push({
        id: `dangerzone-${i}`,
        x,
        y,
        radius: config.dangerZoneRadius,
        damagePerTick: config.dangerZoneDamage,
        type
      });
    }
  }

  // Store hazards and terrain zones in the world state for rendering and engine access
  const terrainZones = generateTerrainZonesFromConfig(config, rng);

  return createWorldState({
    tick: 0,
    organisms,
    food,
    obstacles,
    dangerZones,
    terrainZones
  });
}

export function toEngineStepParams(config, options = {}) {
  const initialColors = Array.isArray(options.initialColors) ? options.initialColors : [];
  const floorSpawnSeed = createSeededPrng(`${config.resolvedSeed}:floor-spawn-colors`);
  const nextFloorSpawnColor = createDistinctColorGenerator(
    floorSpawnSeed.nextFloat() * 360,
    initialColors
  );

  // Map config mutation values to engine step params (SSN-254)
  // Physical traits: size, speed, visionRange, turnRate, metabolism, adolescenceAge, eggHatchTime
  // Brain structure: add/remove neurons and synapses
  // Brain weight: synapse weight changes
  const traitMutationRate = config.physicalTraitsMutationRate ?? config.mutationRate ?? 0.1;
  const traitMutationMagnitude = config.physicalTraitsMutationStrength ?? config.mutationStrength ?? 0.2;
  const brainMutationRate = config.brainWeightMutationRate ?? config.mutationRate ?? 0.1;
  const brainMutationMagnitude = config.brainWeightMutationStrength ?? config.mutationStrength ?? 0.2;
  const brainStructureMutationRate = config.brainStructureMutationRate ?? config.mutationRate ?? 0.05;

  return {
    movementDelta: 1.5,
    metabolismPerTick: 0.05,
    foodSpawnChance: config.foodSpawnChance,
    foodEnergyValue: config.foodEnergyValue,
    worldWidth: config.worldWidth,
    worldHeight: config.worldHeight,
    maxFood: config.maxFood,
    minimumPopulation: config.minimumPopulation,
    // Legacy mutation params (for backward compatibility)
    mutationRate: config.mutationRate,
    mutationStrength: config.mutationStrength,
    // Trait-specific mutation params (SSN-254)
    traitMutationRate,
    traitMutationMagnitude,
    brainMutationRate,
    brainMutationMagnitude,
    brainAddSynapseChance: brainStructureMutationRate,
    brainRemoveSynapseChance: brainStructureMutationRate * 0.5,
    reproductionThreshold: config.reproductionThreshold,
    reproductionCost: config.reproductionCost,
    offspringStartEnergy: config.offspringStartEnergy,
    reproductionMinimumAge: config.reproductionMinimumAge,
    reproductionRefractoryPeriod: config.reproductionRefractoryPeriod,
    maximumOrganismAge: config.maximumOrganismAge,
    predatorEnergyGain: config.predatorEnergyGain,
    predatorHuntRadius: config.predatorHuntRadius,
    createFloorSpawnOrganism: (id, rng) => createRandomizedOrganism({
      id,
      rng,
      worldWidth: config.worldWidth,
      worldHeight: config.worldHeight,
      color: nextFloorSpawnColor(),
      type: 'herbivore'
    })
  };
}

export function createDeterministicRunBootstrap(config) {
  const initialWorld = createInitialWorldFromConfig(config);
  return {
    initialWorld,
    rng: createSeededPrng(config.resolvedSeed),
    stepParams: toEngineStepParams(config, {
      initialColors: initialWorld.organisms.map((organism) => organism.color).filter(Boolean)
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
    // Legacy mutation fields (backward compatibility)
    mutationRate: [0, 1],
    mutationStrength: [0, 1],
    // Trait-specific mutation controls (SSN-254)
    physicalTraitsMutationRate: [0, 1],
    physicalTraitsMutationStrength: [0, 1],
    brainStructureMutationRate: [0, 1],
    brainWeightMutationRate: [0, 1],
    brainWeightMutationStrength: [0, 1],
    reproductionThreshold: [1, 200],
    reproductionCost: [0, 200],
    offspringStartEnergy: [0, 200],
    reproductionMinimumAge: [0, 5000],
    reproductionRefractoryPeriod: [0, 5000],
    maximumOrganismAge: [1, 10000],
    initialPredatorCount: [0, 500],
    predatorEnergyGain: [1, 200],
    predatorHuntRadius: [1, 500]
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

  // Legacy mutation fallback: hydrate trait-specific controls from legacy mutation
  // values when trait-specific values are absent/invalid in stored drafts.
  const legacyMutationRate = Number(source.mutationRate);
  const legacyMutationStrength = Number(source.mutationStrength);
  if (isFiniteInRange(legacyMutationRate, 0, 1)) {
    for (const field of ['physicalTraitsMutationRate', 'brainStructureMutationRate', 'brainWeightMutationRate']) {
      const candidate = Number(source[field]);
      if (!isFiniteInRange(candidate, 0, 1)) {
        sanitized[field] = legacyMutationRate;
      }
    }
  }

  if (isFiniteInRange(legacyMutationStrength, 0, 1)) {
    for (const field of ['physicalTraitsMutationStrength', 'brainWeightMutationStrength']) {
      const candidate = Number(source[field]);
      if (!isFiniteInRange(candidate, 0, 1)) {
        sanitized[field] = legacyMutationStrength;
      }
    }
  }

  if (sanitized.maxFood < sanitized.initialFoodCount) {
    sanitized.initialFoodCount = DEFAULT_CONFIG.initialFoodCount;
    sanitized.maxFood = DEFAULT_CONFIG.maxFood;
  }

  // Handle terrain zone generation (nested config)
  const tzSource = source.terrainZoneGeneration ?? {};
  sanitized.terrainZoneGeneration = {
    enabled: Boolean(tzSource.enabled ?? DEFAULT_CONFIG.terrainZoneGeneration.enabled),
    zoneCount: isFiniteInRange(Number(tzSource.zoneCount), 1, 20) ? Number(tzSource.zoneCount) : DEFAULT_CONFIG.terrainZoneGeneration.zoneCount,
    minZoneWidthRatio: isFiniteInRange(Number(tzSource.minZoneWidthRatio), 0.05, 0.5) ? Number(tzSource.minZoneWidthRatio) : DEFAULT_CONFIG.terrainZoneGeneration.minZoneWidthRatio,
    maxZoneWidthRatio: isFiniteInRange(Number(tzSource.maxZoneWidthRatio), 0.05, 0.5) ? Number(tzSource.maxZoneWidthRatio) : DEFAULT_CONFIG.terrainZoneGeneration.maxZoneWidthRatio,
    minZoneHeightRatio: isFiniteInRange(Number(tzSource.minZoneHeightRatio), 0.05, 0.5) ? Number(tzSource.minZoneHeightRatio) : DEFAULT_CONFIG.terrainZoneGeneration.minZoneHeightRatio,
    maxZoneHeightRatio: isFiniteInRange(Number(tzSource.maxZoneHeightRatio), 0.05, 0.5) ? Number(tzSource.maxZoneHeightRatio) : DEFAULT_CONFIG.terrainZoneGeneration.maxZoneHeightRatio

  };

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
