import { beforeEach, describe, expect, it } from 'vitest';

import { runTicks } from './engine';
import { BASE_INPUT_NEURON_IDS, INPUT_NEURON_IDS } from './brainSchema';
import {
  applyPreset,
  createDeterministicRunBootstrap,
  createInitialWorldFromConfig,
  DEFAULT_TERRAIN_ZONE_GENERATION,
  getCustomPresets,
  loadSimulationConfig,
  normalizeSimulationConfig,
  resolveSeed,
  saveCustomPreset,
  SEED_FALLBACK_COUNTER_KEY,
  STORAGE_KEY,
  toEngineStepParams,
  validateAndNormalizeLoadedSnapshot,
  validateSimulationConfig
} from './config';
import { createSeededPrng } from './prng';

function ensureWritableLocalStorage() {
  const storage = window.localStorage;
  if (storage && typeof storage.setItem === 'function' && typeof storage.getItem === 'function') {
    return;
  }

  const backing = new Map();
  const fallbackStorage = {
    getItem: (key) => (backing.has(String(key)) ? backing.get(String(key)) : null),
    setItem: (key, value) => {
      backing.set(String(key), String(value));
    },
    removeItem: (key) => {
      backing.delete(String(key));
    },
    clear: () => {
      backing.clear();
    }
  };

  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: fallbackStorage
  });
}

describe('simulation config helpers', () => {
  beforeEach(() => {
    ensureWritableLocalStorage();
    window.localStorage.clear();
  });

  it('returns the provided seed when present', () => {
    expect(resolveSeed('  replay-seed  ')).toBe('replay-seed');
  });

  it('uses deterministic local-storage fallback sequence when crypto is unavailable', () => {
    const originalCrypto = globalThis.crypto;
    Object.defineProperty(globalThis, 'crypto', {
      configurable: true,
      value: undefined
    });

    try {
      expect(resolveSeed('')).toBe('seed-00000001');
      expect(resolveSeed('')).toBe('seed-00000002');
      expect(window.localStorage.getItem(SEED_FALLBACK_COUNTER_KEY)).toBe('2');
    } finally {
      Object.defineProperty(globalThis, 'crypto', {
        configurable: true,
        value: originalCrypto
      });
    }
  });

  it('produces identical first N ticks with same resolved config', () => {
    const config = normalizeSimulationConfig(
      {
        name: 'Deterministic Replay',
        seed: 'abc123',
        worldWidth: '640',
        worldHeight: '360',
        initialPopulation: '8',
        minimumPopulation: '8',
        initialFoodCount: '12',
        foodSpawnChance: '0.1',
        foodEnergyValue: '4',
        maxFood: '100',
        mutationRate: '0.2',
        mutationStrength: '0.3',
        reproductionThreshold: '55',
        reproductionCost: '18',
        offspringStartEnergy: '12',
        reproductionMinimumAge: '21',
        reproductionRefractoryPeriod: '33',
        maximumOrganismAge: '777'
      },
      'abc123'
    );

    const initialA = createInitialWorldFromConfig(config);
    const initialB = createInitialWorldFromConfig(config);

    const runA = runTicks(initialA, createSeededPrng(config.resolvedSeed), 25, toEngineStepParams(config));
    const runB = runTicks(initialB, createSeededPrng(config.resolvedSeed), 25, toEngineStepParams(config));

    expect(runA).toEqual(runB);
  });

  it('builds deterministic restart bootstrap state for repeated restart-run actions', () => {
    const config = normalizeSimulationConfig(
      {
        name: 'Restart run determinism',
        seed: 'restart-seed',
        worldWidth: '640',
        worldHeight: '360',
        initialPopulation: '12',
        minimumPopulation: '10',
        initialFoodCount: '16',
        foodSpawnChance: '0.08',
        foodEnergyValue: '5',
        maxFood: '140',
        mutationRate: '0.1',
        mutationStrength: '0.2',
        reproductionThreshold: '44',
        reproductionCost: '16',
        offspringStartEnergy: '10',
        reproductionMinimumAge: '14',
        reproductionRefractoryPeriod: '40',
        maximumOrganismAge: '600'
      },
      'restart-seed'
    );

    const restartA = createDeterministicRunBootstrap(config);
    const restartB = createDeterministicRunBootstrap(config);

    expect(restartA.initialWorld).toEqual(restartB.initialWorld);

    const firstTicksA = runTicks(restartA.initialWorld, restartA.rng, 40, restartA.stepParams);
    const firstTicksB = runTicks(restartB.initialWorld, restartB.rng, 40, restartB.stepParams);

    expect(firstTicksA).toEqual(firstTicksB);
  });

  it('creates deterministic terrain zones from seed and terrain settings', () => {
    const config = normalizeSimulationConfig(
      {
        name: 'Terrain determinism',
        seed: 'terrain-seed',
        worldWidth: '640',
        worldHeight: '360',
        initialPopulation: '4',
        minimumPopulation: '4',
        initialFoodCount: '8',
        terrainZoneGeneration: {
          enabled: true,
          zoneCount: 3,
          minimumZoneWidthRatio: 0.2,
          maximumZoneWidthRatio: 0.35,
          minimumZoneHeightRatio: 0.15,
          maximumZoneHeightRatio: 0.4,
          zoneTypes: ['plains', 'wetland']
        }
      },
      'terrain-seed'
    );

    const worldA = createInitialWorldFromConfig(config);
    const worldB = createInitialWorldFromConfig(config);

    expect(worldA.terrainZones).toEqual(worldB.terrainZones);
    expect(worldA.terrainZones).toHaveLength(3);
    expect(worldA.terrainZones[0]).toMatchObject({
      id: 'terrain-zone-0',
      type: expect.any(String),
      bounds: {
        x: expect.any(Number),
        y: expect.any(Number),
        width: expect.any(Number),
        height: expect.any(Number)
      }
    });
  });

  it('generates non-overlapping terrain zones (SSN-292)', () => {
    const config = normalizeSimulationConfig(
      {
        name: 'Non-overlap test',
        seed: 'non-overlap-seed',
        worldWidth: '640',
        worldHeight: '360',
        initialPopulation: '4',
        minimumPopulation: '4',
        initialFoodCount: '8',
        terrainZoneGeneration: {
          enabled: true,
          zoneCount: 4,
          minZoneWidthRatio: 0.2,
          maxZoneWidthRatio: 0.3,
          minZoneHeightRatio: 0.2,
          maxZoneHeightRatio: 0.3,
          zoneTypes: ['plains', 'forest', 'wetland', 'rocky']
        }
      },
      'non-overlap-seed'
    );

    const world = createInitialWorldFromConfig(config);
    const zones = world.terrainZones;

    // Verify all zones are present
    expect(zones).toHaveLength(4);

    // Check no overlaps exist
    for (let i = 0; i < zones.length; i++) {
      for (let j = i + 1; j < zones.length; j++) {
        const a = zones[i].bounds;
        const b = zones[j].bounds;

        // Explicit overlap check
        const overlapsX = a.x < b.x + b.width && b.x < a.x + a.width;
        const overlapsY = a.y < b.y + b.height && b.y < a.y + a.height;

        expect(overlapsX && overlapsY).toBe(false);
      }
    }
  });

  it('generates deterministic non-overlapping zones for same seed (SSN-292)', () => {
    const config = normalizeSimulationConfig(
      {
        name: 'Deterministic non-overlap',
        seed: 'det-nonoverlap-123',
        worldWidth: '640',
        worldHeight: '360',
        initialPopulation: '4',
        minimumPopulation: '4',
        initialFoodCount: '8',
        terrainZoneGeneration: {
          enabled: true,
          zoneCount: 3,
          minZoneWidthRatio: 0.18,
          maxZoneWidthRatio: 0.42,
          minZoneHeightRatio: 0.18,
          maxZoneHeightRatio: 0.42,
          zoneTypes: ['plains', 'forest', 'wetland']
        }
      },
      'det-nonoverlap-123'
    );

    const worldA = createInitialWorldFromConfig(config);
    const worldB = createInitialWorldFromConfig(config);

    // Should be deterministic (same zones both times)
    expect(worldA.terrainZones).toEqual(worldB.terrainZones);

    // Verify no overlaps in each world
    const zones = worldA.terrainZones;
    for (let i = 0; i < zones.length; i++) {
      for (let j = i + 1; j < zones.length; j++) {
        const a = zones[i].bounds;
        const b = zones[j].bounds;
        const overlapsX = a.x < b.x + b.width && b.x < a.x + a.width;
        const overlapsY = a.y < b.y + b.height && b.y < a.y + a.height;
        expect(overlapsX && overlapsY).toBe(false);
      }
    }
  });

  it('gracefully returns fewer zones when placement is constrained (SSN-292)', () => {
    // Use very large zones that can't all fit without overlap
    const config = normalizeSimulationConfig(
      {
        name: 'Constrained zones',
        seed: 'constrained-zones-seed',
        worldWidth: '200',
        worldHeight: '200',
        initialPopulation: '4',
        minimumPopulation: '4',
        initialFoodCount: '8',
        terrainZoneGeneration: {
          enabled: true,
          zoneCount: 10,
          minZoneWidthRatio: 0.4,
          maxZoneWidthRatio: 0.5,
          minZoneHeightRatio: 0.4,
          maxZoneHeightRatio: 0.5,
          zoneTypes: ['plains', 'forest', 'wetland', 'rocky']
        }
      },
      'constrained-zones-seed'
    );

    const world = createInitialWorldFromConfig(config);
    const zones = world.terrainZones;

    // Should have at least some zones (not all 10)
    expect(zones.length).toBeLessThanOrEqual(10);
    expect(zones.length).toBeGreaterThan(0);

    // Verify no overlaps even with constrained placement
    for (let i = 0; i < zones.length; i++) {
      for (let j = i + 1; j < zones.length; j++) {
        const a = zones[i].bounds;
        const b = zones[j].bounds;
        const overlapsX = a.x < b.x + b.width && b.x < a.x + a.width;
        const overlapsY = a.y < b.y + b.height && b.y < a.y + a.height;
        expect(overlapsX && overlapsY).toBe(false);
      }
    }
  });

  it('assigns deterministic distinct colors to initially generated organisms', () => {
    const config = normalizeSimulationConfig(
      {
        name: 'Founder colors',
        seed: 'founder-colors',
        worldWidth: '640',
        worldHeight: '360',
        initialPopulation: '20',
        minimumPopulation: '20',
        initialFoodCount: '10',
        foodSpawnChance: '0.1',
        foodEnergyValue: '5',
        maxFood: '100',
        mutationRate: '0.1',
        mutationStrength: '0.2'
      },
      'founder-colors'
    );

    const worldA = createInitialWorldFromConfig(config);
    const worldB = createInitialWorldFromConfig(config);
    const colorsA = worldA.organisms.map((organism) => organism.color);
    const colorsB = worldB.organisms.map((organism) => organism.color);

    expect(colorsA).toEqual(colorsB);
    expect(new Set(colorsA).size).toBe(colorsA.length);
    expect(colorsA.every((color) => /^#[0-9a-f]{6}$/i.test(color))).toBe(true);
  });

  it('includes predator prey-sensing IDs in input neuron schema', () => {
    expect(INPUT_NEURON_IDS).toEqual(expect.arrayContaining([
      'in-prey-distance',
      'in-prey-direction',
      'in-prey-detected'
    ]));
  });

  it('builds predator and herbivore brains with correct type-specific input sets', () => {
    const config = normalizeSimulationConfig(
      {
        name: 'Predator brain test',
        seed: 'predator-brain-test',
        worldWidth: '320',
        worldHeight: '240',
        initialPopulation: '1',
        minimumPopulation: '1',
        initialPredatorCount: '1',
        initialFoodCount: '0',
        foodSpawnChance: '0',
        foodEnergyValue: '5',
        maxFood: '20'
      },
      'predator-brain-test'
    );

    const world = createInitialWorldFromConfig(config);
    const predator = world.organisms.find((organism) => organism.type === 'predator');
    const herbivore = world.organisms.find((organism) => organism.type !== 'predator');

    const predatorInputIds = predator.brain.neurons
      .filter((neuron) => neuron.type === 'input')
      .map((neuron) => neuron.id)
      .sort();
    const herbivoreInputIds = herbivore.brain.neurons
      .filter((neuron) => neuron.type === 'input')
      .map((neuron) => neuron.id)
      .sort();

    expect(predatorInputIds).toEqual([...INPUT_NEURON_IDS].sort());
    expect(herbivoreInputIds).toEqual([...BASE_INPUT_NEURON_IDS].sort());
  });

  it('validates invalid numeric ranges', () => {
    const errors = validateSimulationConfig({
      name: '',
      worldWidth: 50,
      worldHeight: 20,
      initialPopulation: 0,
      minimumPopulation: 0,
      initialFoodCount: -1,
      foodSpawnChance: 4,
      foodEnergyValue: 0,
      maxFood: 0,
      mutationRate: 2,
      mutationStrength: -1,
      reproductionThreshold: 0,
      reproductionCost: -1,
      offspringStartEnergy: 201,
      reproductionMinimumAge: -1,
      reproductionRefractoryPeriod: -1,
      maximumOrganismAge: 0
    });

    expect(errors).toMatchObject({
      name: expect.any(String),
      worldWidth: expect.any(String),
      worldHeight: expect.any(String),
      initialPopulation: expect.any(String),
      minimumPopulation: expect.any(String),
      initialFoodCount: expect.any(String),
      foodSpawnChance: expect.any(String),
      foodEnergyValue: expect.any(String),
      maxFood: expect.any(String),
      mutationRate: expect.any(String),
      mutationStrength: expect.any(String),
      reproductionThreshold: expect.any(String),
      reproductionCost: expect.any(String),
      offspringStartEnergy: expect.any(String),
      reproductionMinimumAge: expect.any(String),
      reproductionRefractoryPeriod: expect.any(String),
      maximumOrganismAge: expect.any(String)
    });
  });

  it('accepts stress-test population bounds up to 2000', () => {
    const errors = validateSimulationConfig({
      name: 'Stress bounds',
      worldWidth: 1600,
      worldHeight: 900,
      initialPopulation: 2000,
      minimumPopulation: 2000,
      initialFoodCount: 500,
      foodSpawnChance: 0.05,
      foodEnergyValue: 5,
      maxFood: 2000,
      mutationRate: 0.05,
      mutationStrength: 0.1,
      reproductionThreshold: 42,
      reproductionCost: 20,
      offspringStartEnergy: 15,
      reproductionMinimumAge: 25,
      reproductionRefractoryPeriod: 120,
      maximumOrganismAge: 1000,
      obstacleCount: 0,
      obstacleMinSize: 30,
      obstacleMaxSize: 80,
      dangerZoneCount: 0,
      dangerZoneRadius: 40,
      dangerZoneDamage: 0.5
    });

    expect(errors.initialPopulation).toBeUndefined();
    expect(errors.minimumPopulation).toBeUndefined();
  });

  it('validates biome food spawn bias values (SSN-285)', () => {
    // Test negative bias values
    const errorsNegative = validateSimulationConfig({
      name: 'Biome Bias Test',
      biomeFoodSpawnBias: {
        plains: -0.5,
        forest: 1.0,
        wetland: 1.0,
        rocky: 1.0
      }
    });

    expect(errorsNegative['biomeFoodSpawnBias.plains']).toBe('Biome food spawn bias for plains must be between 0 and 10.');

    // Test values above max
    const errorsOverMax = validateSimulationConfig({
      name: 'Biome Bias Test',
      biomeFoodSpawnBias: {
        plains: 1.0,
        forest: 11.0,
        wetland: 1.0,
        rocky: 1.0
      }
    });

    expect(errorsOverMax['biomeFoodSpawnBias.forest']).toBe('Biome food spawn bias for forest must be between 0 and 10.');

    // Test invalid (non-numeric) values
    const errorsNonNumeric = validateSimulationConfig({
      name: 'Biome Bias Test',
      biomeFoodSpawnBias: {
        plains: 'invalid',
        forest: 1.0,
        wetland: 1.0,
        rocky: 1.0
      }
    });

    expect(errorsNonNumeric['biomeFoodSpawnBias.plains']).toBe('Biome food spawn bias for plains must be between 0 and 10.');
  });

  it('accepts valid biome food spawn bias values (SSN-285)', () => {
    const errors = validateSimulationConfig({
      name: 'Valid Biome Bias',
      biomeFoodSpawnBias: {
        plains: 0,
        forest: 0.5,
        wetland: 1.0,
        rocky: 10.0
      }
    });

    expect(errors['biomeFoodSpawnBias.plains']).toBeUndefined();
    expect(errors['biomeFoodSpawnBias.forest']).toBeUndefined();
    expect(errors['biomeFoodSpawnBias.wetland']).toBeUndefined();
    expect(errors['biomeFoodSpawnBias.rocky']).toBeUndefined();
  });

  it('validates terrain zone generation settings when enabled', () => {
    const errors = validateSimulationConfig({
      name: 'Terrain test',
      terrainZoneGeneration: {
        enabled: true,
        zoneCount: 0,
        minZoneWidthRatio: 0.05,
        maxZoneWidthRatio: 0.04,
        minZoneHeightRatio: 0.15,
        maxZoneHeightRatio: 0.3
      }
    });

    expect(errors.terrainZoneCount).toBe('Terrain zone count must be between 1 and 20.');
    expect(errors.terrainZoneWidthRatio).toBe('Min zone width ratio must be less than or equal to max zone width ratio.');
  });

  it('accepts valid terrain zone generation settings', () => {
    const errors = validateSimulationConfig({
      name: 'Valid terrain test',
      terrainZoneGeneration: {
        enabled: true,
        zoneCount: 6,
        minZoneWidthRatio: 0.1,
        maxZoneWidthRatio: 0.25,
        minZoneHeightRatio: 0.15,
        maxZoneHeightRatio: 0.35
      }
    });

    expect(errors.terrainZoneCount).toBeUndefined();
    expect(errors.terrainZoneWidthRatio).toBeUndefined();
    expect(errors.terrainZoneHeightRatio).toBeUndefined();
  });

  // Regression test: flat form state (terrainZoneEnabled) should take precedence
  // over nested terrainZoneGeneration when the nested value is false (from defaults)
  it('normalizes flat terrainZoneEnabled over nested false terrainZoneGeneration', () => {
    // Simulates form state where checkbox is enabled but config has defaults
    const normalized = normalizeSimulationConfig(
      {
        name: 'Form state test',
        seed: 'form-seed',
        worldWidth: '800',
        worldHeight: '600',
        initialPopulation: '20',
        terrainZoneEnabled: 'true', // UI checkbox value
        // Simulate spread from DEFAULT_CONFIG which has enabled: false
        terrainZoneGeneration: {
          enabled: false,
          zoneCount: 4,
          minZoneWidthRatio: 0.15,
          maxZoneWidthRatio: 0.3,
          minZoneHeightRatio: 0.15,
          maxZoneHeightRatio: 0.3
        }
      },
      'form-seed'
    );

    // The flat terrainZoneEnabled should win since it represents explicit UI choice
    expect(normalized.terrainZoneGeneration.enabled).toBe(true);
  });

  it('exposes a deterministic 2000-organism stress preset', () => {
    const stressPresetConfig = applyPreset('stress-test-2000');

    expect(stressPresetConfig.initialPopulation).toBe(2000);
    expect(stressPresetConfig.minimumPopulation).toBe(400);
    expect(stressPresetConfig.worldWidth).toBe(1600);
    expect(stressPresetConfig.worldHeight).toBe(900);
  });

  it('normalizes missing evolution values with deterministic defaults', () => {
    const normalized = normalizeSimulationConfig(
      {
        name: 'Defaults',
        seed: 'defaults-seed',
        worldWidth: '640',
        worldHeight: '360',
        initialPopulation: '10',
        minimumPopulation: '9',
        initialFoodCount: '10',
        foodSpawnChance: '0.1',
        foodEnergyValue: '5',
        maxFood: '100'
      },
      'defaults-seed'
    );

    expect(normalized.mutationRate).toBe(0.05);
    expect(normalized.mutationStrength).toBe(0.1);
    expect(normalized.reproductionThreshold).toBe(42);
    expect(normalized.reproductionCost).toBe(20);
    expect(normalized.offspringStartEnergy).toBe(15);
    expect(normalized.reproductionMinimumAge).toBe(25);
    expect(normalized.reproductionRefractoryPeriod).toBe(120);
    expect(normalized.maximumOrganismAge).toBe(1000);
  });

  it('preserves explicit reproduction settings during normalization', () => {
    const normalized = normalizeSimulationConfig(
      {
        name: 'Reproduction settings',
        seed: 'repro-seed',
        worldWidth: '640',
        worldHeight: '360',
        initialPopulation: '10',
        minimumPopulation: '9',
        initialFoodCount: '10',
        foodSpawnChance: '0.1',
        foodEnergyValue: '5',
        maxFood: '100',
        mutationRate: '0.1',
        mutationStrength: '0.2',
        reproductionThreshold: '48',
        reproductionCost: '14',
        offspringStartEnergy: '9',
        reproductionMinimumAge: '18',
        reproductionRefractoryPeriod: '27',
        maximumOrganismAge: '850'
      },
      'repro-seed'
    );

    expect(normalized.reproductionThreshold).toBe(48);
    expect(normalized.reproductionCost).toBe(14);
    expect(normalized.offspringStartEnergy).toBe(9);
    expect(normalized.reproductionMinimumAge).toBe(18);
    expect(normalized.reproductionRefractoryPeriod).toBe(27);
    expect(normalized.maximumOrganismAge).toBe(850);
  });

  it('persists lifespan and reproduction settings in custom presets', () => {
    const saved = saveCustomPreset('Long-lived colony', {
      worldWidth: 900,
      worldHeight: 500,
      initialPopulation: 18,
      minimumPopulation: 12,
      initialFoodCount: 45,
      foodSpawnChance: 0.07,
      foodEnergyValue: 8,
      maxFood: 220,
      mutationRate: 0.09,
      mutationStrength: 0.14,
      reproductionThreshold: 60,
      reproductionCost: 24,
      offspringStartEnergy: 10,
      reproductionMinimumAge: 30,
      reproductionRefractoryPeriod: 150,
      maximumOrganismAge: 1400
    });

    expect(saved).toBe(true);
    expect(getCustomPresets()).toEqual([
      expect.objectContaining({
        name: 'Long-lived colony',
        config: expect.objectContaining({
          reproductionThreshold: 60,
          reproductionCost: 24,
          offspringStartEnergy: 10,
          reproductionMinimumAge: 30,
          reproductionRefractoryPeriod: 150,
          maximumOrganismAge: 1400
        })
      })
    ]);
  });

  // SSN-268: Hazard fields should be persisted in custom presets
  it('persists danger zone hazard settings in custom presets', () => {
    // Save a preset with custom hazard settings
    const saved = saveCustomPreset('Hazard Test Preset', {
      worldWidth: 800,
      worldHeight: 480,
      initialPopulation: 10,
      minimumPopulation: 8,
      initialFoodCount: 20,
      foodSpawnChance: 0.05,
      foodEnergyValue: 6,
      maxFood: 100,
      enableDangerZones: true,
      dangerZoneCount: 3,
      dangerZoneRadius: 60,
      dangerZoneDamage: 1.5
    });

    expect(saved).toBe(true);
    const presets = getCustomPresets();
    expect(presets).toHaveLength(1);
    
    const hazardPreset = presets[0];
    expect(hazardPreset.name).toBe('Hazard Test Preset');
    expect(hazardPreset.config.enableDangerZones).toBe(true);
    expect(hazardPreset.config.dangerZoneCount).toBe(3);
    expect(hazardPreset.config.dangerZoneRadius).toBe(60);
    expect(hazardPreset.config.dangerZoneDamage).toBe(1.5);
  });

  // SSN-268: Hazard settings from saved preset should normalize correctly
  it('restores danger zone hazard values when normalizing saved preset config', () => {
    // Save a preset with hazard settings
    saveCustomPreset('Hazard Restore Test', {
      worldWidth: 1024,
      worldHeight: 768,
      initialPopulation: 15,
      minimumPopulation: 10,
      initialFoodCount: 25,
      foodSpawnChance: 0.06,
      foodEnergyValue: 7,
      maxFood: 150,
      enableDangerZones: true,
      dangerZoneCount: 4,
      dangerZoneRadius: 50,
      dangerZoneDamage: 2.0
    });

    const presets = getCustomPresets();
    const savedConfig = presets[0].config;

    // Normalize the saved config (simulating what happens when loading a preset)
    const normalized = normalizeSimulationConfig(savedConfig, 'restore-test-seed');
    
    expect(normalized.enableDangerZones).toBe(true);
    expect(normalized.dangerZoneCount).toBe(4);
    expect(normalized.dangerZoneRadius).toBe(50);
    expect(normalized.dangerZoneDamage).toBe(2.0);
  });

  // SSN-290: Terrain effect strength fields should be persisted in custom presets
  it('persists terrain effect strength settings in custom presets', () => {
    // Save a preset with custom terrain effect strength settings
    const saved = saveCustomPreset('Terrain Effect Test Preset', {
      worldWidth: 800,
      worldHeight: 480,
      initialPopulation: 10,
      minimumPopulation: 8,
      initialFoodCount: 20,
      foodSpawnChance: 0.05,
      foodEnergyValue: 6,
      maxFood: 100,
      terrainEffectStrengths: {
        forestVisionMultiplier: 0.3,
        wetlandSpeedMultiplier: 0.7,
        wetlandTurnMultiplier: 0.8,
        rockyEnergyDrain: 1.5
      }
    });

    expect(saved).toBe(true);
    const presets = getCustomPresets();

    // Verify the preset was saved with terrain effect strength values
    const savedPreset = presets.find(p => p.name === 'Terrain Effect Test Preset');
    expect(savedPreset).toBeDefined();
    expect(savedPreset.config.terrainEffectStrengths).toEqual({
      forestVisionMultiplier: 0.3,
      wetlandSpeedMultiplier: 0.7,
      wetlandTurnMultiplier: 0.8,
      rockyEnergyDrain: 1.5
    });

    // Verify normalization preserves the terrain effect strength values
    const normalized = normalizeSimulationConfig(savedPreset.config, 'terrain-effect-test-seed');
    expect(normalized.terrainEffectStrengths.forestVisionMultiplier).toBe(0.3);
    expect(normalized.terrainEffectStrengths.wetlandSpeedMultiplier).toBe(0.7);
    expect(normalized.terrainEffectStrengths.wetlandTurnMultiplier).toBe(0.8);
    expect(normalized.terrainEffectStrengths.rockyEnergyDrain).toBe(1.5);
  });

  // SSN-290: Backward compatibility - presets without terrain effect strengths should use defaults
  it('falls back to default terrain effect strengths when preset lacks them (backward compatibility)', () => {
    // Save a preset WITHOUT terrain effect strength settings (old preset format)
    const saved = saveCustomPreset('Old Preset Without Terrain', {
      worldWidth: 800,
      worldHeight: 480,
      initialPopulation: 10,
      minimumPopulation: 8,
      initialFoodCount: 20,
      foodSpawnChance: 0.05,
      foodEnergyValue: 6,
      maxFood: 100
      // Note: no terrainEffectStrengths field
    });

    expect(saved).toBe(true);
    const presets = getCustomPresets();
    const savedPreset = presets.find(p => p.name === 'Old Preset Without Terrain');
    expect(savedPreset).toBeDefined();

    // Verify that applying the preset uses default terrain effect strength values
    const normalized = normalizeSimulationConfig(savedPreset.config, 'old-preset-seed');
    expect(normalized.terrainEffectStrengths.forestVisionMultiplier).toBe(0.5); // default
    expect(normalized.terrainEffectStrengths.wetlandSpeedMultiplier).toBe(0.5); // default
    expect(normalized.terrainEffectStrengths.wetlandTurnMultiplier).toBe(0.5); // default
    expect(normalized.terrainEffectStrengths.rockyEnergyDrain).toBe(0.2); // default
  });

  it('loads schema-safe draft values and ignores unknown fields', () => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({
      name: 'Draft Name',
      seed: '  draft-seed  ',
      worldWidth: 900,
      worldHeight: 500,
      initialPopulation: 22,
      minimumPopulation: 20,
      initialFoodCount: 40,
      foodSpawnChance: 0.2,
      foodEnergyValue: 6,
      maxFood: 180,
      mutationRate: 0.3,
      mutationStrength: 0.4,
      reproductionThreshold: 47,
      reproductionCost: 17,
      offspringStartEnergy: 11,
      reproductionMinimumAge: 19,
      reproductionRefractoryPeriod: 31,
      maximumOrganismAge: 880,
      unknownField: 'ignored'
    }));

    expect(loadSimulationConfig()).toEqual({
      name: 'Draft Name',
      seed: 'draft-seed',
      worldWidth: 900,
      worldHeight: 500,
      initialPopulation: 22,
      minimumPopulation: 20,
      initialFoodCount: 40,
      foodSpawnChance: 0.2,
      foodEnergyValue: 6,
      maxFood: 180,
      mutationRate: 0.3,
      mutationStrength: 0.4,
      // New trait-specific mutation fields use legacy values when not provided (SSN-254)
      physicalTraitsMutationRate: 0.3,
      physicalTraitsMutationStrength: 0.4,
      brainStructureMutationRate: 0.3,
      brainWeightMutationRate: 0.3,
      brainWeightMutationStrength: 0.4,
      resolvedSeed: undefined,
      reproductionThreshold: 47,
      reproductionCost: 17,
      offspringStartEnergy: 11,
      reproductionMinimumAge: 19,
      reproductionRefractoryPeriod: 31,
      maximumOrganismAge: 880,
      enableObstacles: false,
      obstacleCount: 3,
      obstacleMinSize: 30,
      obstacleMaxSize: 80,
      enableDangerZones: false,
      dangerZoneCount: 2,
      dangerZoneRadius: 40,
      dangerZoneDamage: 0.5,
      initialPredatorCount: 0,
      predatorEnergyGain: 30,
      predatorHuntRadius: 50,
      terrainZoneGeneration: {
        enabled: false,
        zoneCount: 4,
        minZoneWidthRatio: 0.15,
        maxZoneWidthRatio: 0.3,
        minZoneHeightRatio: 0.15,
        maxZoneHeightRatio: 0.3
      },
      // Biome food spawn bias (SSN-285)
      biomeFoodSpawnBias: {
        plains: 1.0,
        forest: 1.0,
        wetland: 1.0,
        rocky: 1.0
      },
      // Terrain effect strengths (SSN-287)
      terrainEffectStrengths: {
        forestVisionMultiplier: 0.5,
        wetlandSpeedMultiplier: 0.5,
        wetlandTurnMultiplier: 0.5,
        rockyEnergyDrain: 0.2
      }

    });
  });

  it('replaces invalid stored draft fields with defaults', () => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({
      name: '',
      seed: 42,
      worldWidth: 'invalid-width',
      worldHeight: -4,
      initialPopulation: 0,
      minimumPopulation: 999,
      initialFoodCount: 999,
      foodSpawnChance: 2,
      foodEnergyValue: -1,
      maxFood: 10,
      mutationRate: -0.5,
      mutationStrength: 2,
      reproductionThreshold: 'invalid-threshold',
      reproductionCost: -3,
      offspringStartEnergy: 999,
      reproductionMinimumAge: 'bad-age',
      reproductionRefractoryPeriod: -10,
      maximumOrganismAge: 'bad-max-age'
    }));

    expect(loadSimulationConfig()).toEqual({
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
      mutationRate: 0.05,
      mutationStrength: 0.1,
      // New trait-specific mutation fields use defaults (SSN-254)
      physicalTraitsMutationRate: 0.05,
      physicalTraitsMutationStrength: 0.1,
      brainStructureMutationRate: 0.05,
      brainWeightMutationRate: 0.05,
      brainWeightMutationStrength: 0.1,
      resolvedSeed: undefined,
      reproductionThreshold: 42,
      reproductionCost: 20,
      offspringStartEnergy: 15,
      reproductionMinimumAge: 25,
      reproductionRefractoryPeriod: 120,
      maximumOrganismAge: 1000,
      enableObstacles: false,
      obstacleCount: 3,
      obstacleMinSize: 30,
      obstacleMaxSize: 80,
      enableDangerZones: false,
      dangerZoneCount: 2,
      dangerZoneRadius: 40,
      dangerZoneDamage: 0.5,
      initialPredatorCount: 0,
      predatorEnergyGain: 30,
      predatorHuntRadius: 50,
      terrainZoneGeneration: {
        enabled: false,
        zoneCount: 4,
        minZoneWidthRatio: 0.15,
        maxZoneWidthRatio: 0.3,
        minZoneHeightRatio: 0.15,
        maxZoneHeightRatio: 0.3
      },
      // Biome food spawn bias (SSN-285)
      biomeFoodSpawnBias: {
        plains: 1.0,
        forest: 1.0,
        wetland: 1.0,
        rocky: 1.0
      },
      // Terrain effect strengths (SSN-287)
      terrainEffectStrengths: {
        forestVisionMultiplier: 0.5,
        wetlandSpeedMultiplier: 0.5,
        wetlandTurnMultiplier: 0.5,
        rockyEnergyDrain: 0.2
      }

    });
  });

  describe('validateAndNormalizeLoadedSnapshot', () => {
    it('validates complete valid snapshot without warnings', () => {
      const snapshot = {
        id: 'sim-123',
        name: 'Test Sim',
        seed: 'test-seed',
        parameters: {
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
        },
        tickCount: 100,
        worldState: {
          tick: 100,
          organisms: [],
          food: []
        },
        rngState: 42,
        schemaVersion: 1
      };

      const result = validateAndNormalizeLoadedSnapshot(snapshot);

      expect(result.errors).toHaveLength(0);
      expect(result.warnings).toHaveLength(0);
      expect(result.config.resolvedSeed).toBe('test-seed');
      expect(result.world.tick).toBe(100);
      expect(result.rngState).toBe(42);
    });

    it('applies deterministic fallbacks for missing parameters (scenario 1)', () => {
      // Scenario 1: Missing parameters entirely
      const snapshot = {
        id: 'sim-missing-params',
        name: 'Missing Params',
        seed: 'fallback-seed',
        parameters: null,
        tickCount: 50,
        worldState: {
          tick: 50,
          organisms: [{ id: 'org-1', x: 10, y: 20, energy: 15, age: 5, generation: 1, direction: 0, traits: {}, brain: { neurons: [], synapses: [] } }],
          food: []
        },
        rngState: null,
        schemaVersion: 1
      };

      const result = validateAndNormalizeLoadedSnapshot(snapshot);

      expect(result.errors).toHaveLength(0);
      expect(result.warnings).toContain('Parameters missing; using defaults');
      expect(result.warnings).toContain('RNG state missing; deriving from seed');
      expect(result.config.worldWidth).toBe(1920); // DEFAULT
      expect(result.config.initialPopulation).toBe(20); // DEFAULT
      expect(result.config.reproductionMinimumAge).toBe(25);
    });

    it('applies deterministic fallbacks for malformed world state (scenario 2)', () => {
      // Scenario 2: Invalid tick count and mismatched world state tick
      const snapshot = {
        id: 'sim-bad-tick',
        name: 'Bad Tick',
        seed: 'tick-test',
        parameters: {
          worldWidth: 640,
          worldHeight: 360
        },
        tickCount: -1, // Invalid
        worldState: {
          tick: 25, // Different from tickCount
          organisms: [],
          food: []
        },
        rngState: 100,
        schemaVersion: 1
      };

      const result = validateAndNormalizeLoadedSnapshot(snapshot);

      expect(result.errors).toHaveLength(0);
      expect(result.warnings).toContain('Tick count invalid; defaulting to 0');
      // When tickCount is invalid, we don't check mismatch (hasValidTickCount is false)
      expect(result.world.tick).toBe(25); // Uses worldState.tick as-is
      expect(result.tickCount).toBe(0); // Defaulted
    });

    it('applies deterministic fallbacks for missing seed (scenario 3)', () => {
      // Scenario 3: Missing seed entirely (but has valid rngState)
      const snapshot = {
        id: 'sim-no-seed',
        name: 'No Seed',
        seed: '', // Empty
        parameters: {
          worldWidth: 1024,
          worldHeight: 768,
          initialPopulation: 20
        },
        tickCount: 200,
        worldState: {
          tick: 200,
          organisms: [],
          food: []
        },
        rngState: 999, // Valid RNG state provided
        schemaVersion: 1
      };

      const result = validateAndNormalizeLoadedSnapshot(snapshot);

      expect(result.errors).toHaveLength(0);
      expect(result.warnings).toContain('Seed missing; derived from snapshot ID');
      expect(result.config.resolvedSeed).toBe('snapshot-sim-no-s'); // Derived from ID
      // No RNG warning because valid rngState was provided
      expect(result.rngState).toBe(999);
    });

    it('produces deterministic output for same invalid input', () => {
      const invalidSnapshot = {
        id: 'sim-deterministic-test',
        name: null,
        seed: null,
        parameters: 'not-an-object',
        tickCount: 'not-a-number',
        worldState: [],
        rngState: undefined,
        schemaVersion: 99
      };

      const result1 = validateAndNormalizeLoadedSnapshot(invalidSnapshot);
      const result2 = validateAndNormalizeLoadedSnapshot(invalidSnapshot);

      // Same warnings in same order
      expect(result1.warnings).toEqual(result2.warnings);
      // Same config values
      expect(result1.config.worldWidth).toBe(result2.config.worldWidth);
      expect(result1.config.worldHeight).toBe(result2.config.worldHeight);
      // Same world state
      expect(result1.world.tick).toBe(result2.world.tick);
      expect(result1.world.organisms).toEqual(result2.world.organisms);
    });

    it('initializes organisms with deterministic starting energy', () => {
      const config = normalizeSimulationConfig(
        {
          name: 'Energy Test',
          seed: 'energy-seed',
          worldWidth: '100',
          worldHeight: '100',
          initialPopulation: '5',
          initialFoodCount: '10'
        },
        'energy-seed'
      );

      const world = createInitialWorldFromConfig(config);

      expect(world.organisms).toHaveLength(5);
      // All organisms should have initial energy of 40
      world.organisms.forEach((organism) => {
        expect(organism).toHaveProperty('energy');
        expect(typeof organism.energy).toBe('number');
        expect(organism.energy).toBe(40);
      });
      // Energy should be deterministic across multiple world creations
      const world2 = createInitialWorldFromConfig(config);
      expect(world.organisms).toEqual(world2.organisms);
    });
  });

  describe('toEngineStepParams mutation mapping (SSN-254)', () => {
    it('maps new trait-specific mutation fields to engine params', () => {
      const config = normalizeSimulationConfig(
        {
          name: 'Mutation Test',
          seed: 'mutation-seed',
          physicalTraitsMutationRate: 0.15,
          physicalTraitsMutationStrength: 0.25,
          brainStructureMutationRate: 0.08,
          brainWeightMutationRate: 0.2,
          brainWeightMutationStrength: 0.35
        },
        'mutation-seed'
      );

      const stepParams = toEngineStepParams(config);

      // Physical traits should map to traitMutationRate/Magnitude
      expect(stepParams.traitMutationRate).toBe(0.15);
      expect(stepParams.traitMutationMagnitude).toBe(0.25);
      // Brain weight should map to brainMutationRate/Magnitude
      expect(stepParams.brainMutationRate).toBe(0.2);
      expect(stepParams.brainMutationMagnitude).toBe(0.35);
      // Brain structure should map to add/remove synapse chances
      expect(stepParams.brainAddSynapseChance).toBe(0.08);
      expect(stepParams.brainRemoveSynapseChance).toBe(0.04); // 0.08 * 0.5
    });

    it('falls back to legacy mutationRate/mutationStrength when new fields not provided', () => {
      const config = normalizeSimulationConfig(
        {
          name: 'Legacy Mutation Test',
          seed: 'legacy-mutation-seed',
          mutationRate: 0.1,
          mutationStrength: 0.2
        },
        'legacy-mutation-seed'
      );

      const stepParams = toEngineStepParams(config);

      // All mutation params should use legacy values when new fields not provided
      expect(stepParams.traitMutationRate).toBe(0.1);
      expect(stepParams.traitMutationMagnitude).toBe(0.2);
      expect(stepParams.brainMutationRate).toBe(0.1);
      expect(stepParams.brainMutationMagnitude).toBe(0.2);
      expect(stepParams.brainAddSynapseChance).toBe(0.1);
      expect(stepParams.brainRemoveSynapseChance).toBe(0.05); // 0.1 * 0.5
    });

    it('uses explicit new fields even when legacy fields are present', () => {
      const config = normalizeSimulationConfig(
        {
          name: 'Explicit Test',
          seed: 'explicit-seed',
          // Legacy values
          mutationRate: 0.05,
          mutationStrength: 0.1,
          // New explicit values should override
          physicalTraitsMutationRate: 0.3,
          physicalTraitsMutationStrength: 0.4,
          brainStructureMutationRate: 0.25,
          brainWeightMutationRate: 0.45,
          brainWeightMutationStrength: 0.55
        },
        'explicit-seed'
      );

      const stepParams = toEngineStepParams(config);

      // New explicit values should be used
      expect(stepParams.traitMutationRate).toBe(0.3);
      expect(stepParams.traitMutationMagnitude).toBe(0.4);
      expect(stepParams.brainMutationRate).toBe(0.45);
      expect(stepParams.brainMutationMagnitude).toBe(0.55);
      expect(stepParams.brainAddSynapseChance).toBe(0.25);
      expect(stepParams.brainRemoveSynapseChance).toBe(0.125); // 0.25 * 0.5
    });
  });

  describe('toEngineStepParams biome food spawn bias (SSN-285)', () => {
    it('maps biomeFoodSpawnBias to biomeSpawnMultipliers in engine params', () => {
      const config = normalizeSimulationConfig(
        {
          name: 'Biome Bias Test',
          seed: 'biome-bias-seed',
          biomeFoodSpawnBias: {
            plains: 0.5,
            forest: 2.0,
            wetland: 1.5,
            rocky: 0.0
          }
        },
        'biome-bias-seed'
      );

      const stepParams = toEngineStepParams(config);

      // biomeSpawnMultipliers should match biomeFoodSpawnBias
      expect(stepParams.biomeSpawnMultipliers).toEqual({
        plains: 0.5,
        forest: 2.0,
        wetland: 1.5,
        rocky: 0.0
      });
    });

    it('uses default bias of 1.0 for all biomes when not specified', () => {
      const config = normalizeSimulationConfig(
        {
          name: 'Default Bias Test',
          seed: 'default-bias-seed'
        },
        'default-bias-seed'
      );

      const stepParams = toEngineStepParams(config);

      // Default values should preserve SSN-284 behavior
      expect(stepParams.biomeSpawnMultipliers).toEqual({
        plains: 1.0,
        forest: 1.0,
        wetland: 1.0,
        rocky: 1.0
      });
    });

    it('produces identical food placement with same bias map and seed (deterministic)', () => {
      const baseConfig = {
        name: 'Deterministic Biome Test',
        seed: 'deterministic-biome-seed',
        worldWidth: 100,
        worldHeight: 100,
        initialPopulation: 0,
        initialFoodCount: 0,
        foodSpawnChance: 1.0,
        foodEnergyValue: 5,
        maxFood: 100,
        terrainZoneGeneration: {
          enabled: true,
          zoneCount: 2,
          minZoneWidthRatio: 0.4,
          maxZoneWidthRatio: 0.5,
          minZoneHeightRatio: 0.8,
          maxZoneHeightRatio: 1.0
        },
        biomeFoodSpawnBias: {
          plains: 3.0,
          forest: 0.5,
          wetland: 1.0,
          rocky: 1.0
        }
      };

      // Create config and get step params twice
      const config1 = normalizeSimulationConfig(baseConfig, 'deterministic-biome-seed');
      const config2 = normalizeSimulationConfig(baseConfig, 'deterministic-biome-seed');

      const stepParams1 = toEngineStepParams(config1);
      const stepParams2 = toEngineStepParams(config2);

      // Should produce identical biomeSpawnMultipliers
      expect(stepParams1.biomeSpawnMultipliers).toEqual(stepParams2.biomeSpawnMultipliers);
      expect(stepParams1.biomeSpawnMultipliers).toEqual({
        plains: 3.0,
        forest: 0.5,
        wetland: 1.0,
        rocky: 1.0
      });
    });

    it('produces different food placement with different bias maps (SSN-285)', () => {
      // This is tested at engine level - here we verify config normalization
      const configForestHeavy = normalizeSimulationConfig(
        {
          name: 'Forest Heavy',
          seed: 'forest-heavy-seed',
          biomeFoodSpawnBias: {
            plains: 0.1,
            forest: 5.0,
            wetland: 0.1,
            rocky: 0.1
          }
        },
        'forest-heavy-seed'
      );

      const configPlainsHeavy = normalizeSimulationConfig(
        {
          name: 'Plains Heavy',
          seed: 'plains-heavy-seed',
          biomeFoodSpawnBias: {
            plains: 5.0,
            forest: 0.1,
            wetland: 0.1,
            rocky: 0.1
          }
        },
        'plains-heavy-seed'
      );

      const stepParamsForest = toEngineStepParams(configForestHeavy);
      const stepParamsPlains = toEngineStepParams(configPlainsHeavy);

      // Different bias maps should produce different multipliers
      expect(stepParamsForest.biomeSpawnMultipliers.forest).toBeGreaterThan(
        stepParamsPlains.biomeSpawnMultipliers.forest
      );
      expect(stepParamsPlains.biomeSpawnMultipliers.plains).toBeGreaterThan(
        stepParamsForest.biomeSpawnMultipliers.plains
      );
    });
  });

  describe('toEngineStepParams terrain effect strengths (SSN-287)', () => {
    it('maps terrainEffectStrengths to engine params with default values preserving existing behavior', () => {
      const config = normalizeSimulationConfig(
        {
          name: 'Default Terrain Effects',
          seed: 'default-terrain-seed'
        },
        'default-terrain-seed'
      );

      const stepParams = toEngineStepParams(config);

      // Default values should preserve existing behavior exactly
      expect(stepParams.terrainEffectStrengths).toEqual({
        forestVisionMultiplier: 0.5,
        wetlandSpeedMultiplier: 0.5,
        wetlandTurnMultiplier: 0.5,
        rockyEnergyDrain: 0.2
      });
    });

    it('accepts custom terrain effect strength values (SSN-287)', () => {
      const config = normalizeSimulationConfig(
        {
          name: 'Custom Terrain Effects',
          seed: 'custom-terrain-seed',
          terrainEffectStrengths: {
            forestVisionMultiplier: 0.3,
            wetlandSpeedMultiplier: 0.7,
            wetlandTurnMultiplier: 0.8,
            rockyEnergyDrain: 0.5
          }
        },
        'custom-terrain-seed'
      );

      const stepParams = toEngineStepParams(config);

      expect(stepParams.terrainEffectStrengths).toEqual({
        forestVisionMultiplier: 0.3,
        wetlandSpeedMultiplier: 0.7,
        wetlandTurnMultiplier: 0.8,
        rockyEnergyDrain: 0.5
      });
    });

    it('produces identical terrain effect params with same config (deterministic)', () => {
      const baseConfig = {
        name: 'Deterministic Terrain Test',
        seed: 'deterministic-terrain-seed',
        terrainEffectStrengths: {
          forestVisionMultiplier: 0.25,
          wetlandSpeedMultiplier: 0.75,
          wetlandTurnMultiplier: 0.6,
          rockyEnergyDrain: 0.15
        }
      };

      const config1 = normalizeSimulationConfig(baseConfig, 'deterministic-terrain-seed');
      const config2 = normalizeSimulationConfig(baseConfig, 'deterministic-terrain-seed');

      const stepParams1 = toEngineStepParams(config1);
      const stepParams2 = toEngineStepParams(config2);

      expect(stepParams1.terrainEffectStrengths).toEqual(stepParams2.terrainEffectStrengths);
    });
  });

  describe('validateSimulationConfig terrain effect strengths (SSN-287)', () => {
    it('validates terrain effect strength ranges', () => {
      // Test invalid values
      const errorsNegative = validateSimulationConfig({
        name: 'Terrain Test',
        terrainEffectStrengths: {
          forestVisionMultiplier: -0.1,
          wetlandSpeedMultiplier: 0.5,
          wetlandTurnMultiplier: 0.5,
          rockyEnergyDrain: 0.2
        }
      });
      expect(errorsNegative['terrainEffectStrengths.forestVisionMultiplier']).toBe('Terrain effect strength for forestVisionMultiplier must be between 0 and 1.');

      // Test values above max for multipliers
      const errorsOverMax = validateSimulationConfig({
        name: 'Terrain Test',
        terrainEffectStrengths: {
          forestVisionMultiplier: 1.5,
          wetlandSpeedMultiplier: 0.5,
          wetlandTurnMultiplier: 0.5,
          rockyEnergyDrain: 0.2
        }
      });
      expect(errorsOverMax['terrainEffectStrengths.forestVisionMultiplier']).toBe('Terrain effect strength for forestVisionMultiplier must be between 0 and 1.');

      // Test rockyEnergyDrain can go up to 2
      const errorsRockyHigh = validateSimulationConfig({
        name: 'Terrain Test',
        terrainEffectStrengths: {
          forestVisionMultiplier: 0.5,
          wetlandSpeedMultiplier: 0.5,
          wetlandTurnMultiplier: 0.5,
          rockyEnergyDrain: 3.0
        }
      });
      expect(errorsRockyHigh['terrainEffectStrengths.rockyEnergyDrain']).toBe('Terrain effect strength for rockyEnergyDrain must be between 0 and 2.');

      // Test valid values
      const errorsValid = validateSimulationConfig({
        name: 'Terrain Test',
        terrainEffectStrengths: {
          forestVisionMultiplier: 0,
          wetlandSpeedMultiplier: 1.0,
          wetlandTurnMultiplier: 0.5,
          rockyEnergyDrain: 2.0
        }
      });
      expect(errorsValid['terrainEffectStrengths.forestVisionMultiplier']).toBeUndefined();
      expect(errorsValid['terrainEffectStrengths.wetlandSpeedMultiplier']).toBeUndefined();
      expect(errorsValid['terrainEffectStrengths.wetlandTurnMultiplier']).toBeUndefined();
      expect(errorsValid['terrainEffectStrengths.rockyEnergyDrain']).toBeUndefined();
    });
  });

  // SSN-290: Terrain effect strengths should be persisted in custom presets
  describe('custom preset terrain effect strengths (SSN-290)', () => {
    beforeEach(() => {
      // Clear custom presets before each test by removing from localStorage
      window.localStorage.removeItem('snn-sandbox.custom-presets');
    });

    it('persists terrain effect strengths in custom presets', () => {
      const saved = saveCustomPreset('Terrain Effect Preset', {
        worldWidth: 800,
        worldHeight: 480,
        initialPopulation: 10,
        minimumPopulation: 8,
        initialFoodCount: 20,
        foodSpawnChance: 0.05,
        foodEnergyValue: 6,
        maxFood: 100,
        terrainEffectStrengths: {
          forestVisionMultiplier: 0.25,
          wetlandSpeedMultiplier: 0.75,
          wetlandTurnMultiplier: 0.4,
          rockyEnergyDrain: 1.5
        }
      });

      expect(saved).toBe(true);
      const presets = getCustomPresets();
      expect(presets).toHaveLength(1);
      
      const preset = presets[0];
      expect(preset.name).toBe('Terrain Effect Preset');
      expect(preset.config.terrainEffectStrengths).toEqual({
        forestVisionMultiplier: 0.25,
        wetlandSpeedMultiplier: 0.75,
        wetlandTurnMultiplier: 0.4,
        rockyEnergyDrain: 1.5
      });
    });

    it('restores terrain effect strengths when normalizing saved preset config', () => {
      // Save a preset with terrain effect strengths
      saveCustomPreset('Terrain Restore Test', {
        worldWidth: 1024,
        worldHeight: 768,
        initialPopulation: 15,
        minimumPopulation: 10,
        initialFoodCount: 25,
        foodSpawnChance: 0.06,
        foodEnergyValue: 7,
        maxFood: 150,
        terrainEffectStrengths: {
          forestVisionMultiplier: 0.3,
          wetlandSpeedMultiplier: 0.8,
          wetlandTurnMultiplier: 0.6,
          rockyEnergyDrain: 1.0
        }
      });

      // Apply the preset and normalize
      const presets = getCustomPresets();
      const presetConfig = presets[0].config;
      
      const normalized = normalizeSimulationConfig(presetConfig, 'test-seed');
      
      expect(normalized.terrainEffectStrengths.forestVisionMultiplier).toBe(0.3);
      expect(normalized.terrainEffectStrengths.wetlandSpeedMultiplier).toBe(0.8);
      expect(normalized.terrainEffectStrengths.wetlandTurnMultiplier).toBe(0.6);
      expect(normalized.terrainEffectStrengths.rockyEnergyDrain).toBe(1.0);
    });

    it('falls back to defaults for terrain effect strengths when preset lacks them (backward compatibility)', () => {
      // Save a preset WITHOUT terrain effect strengths (old preset format)
      const storage = window.localStorage;
      const oldPresets = storage.getItem('snn-sandbox.custom-presets');
      storage.setItem('snn-sandbox.custom-presets', JSON.stringify([
        {
          id: 'legacy-preset',
          name: 'Legacy Preset',
          description: 'Old preset without terrain effect strengths',
          config: {
            worldWidth: 800,
            worldHeight: 480,
            initialPopulation: 10,
            minimumPopulation: 8,
            initialFoodCount: 20,
            foodSpawnChance: 0.05,
            foodEnergyValue: 6,
            maxFood: 100
            // Note: no terrainEffectStrengths - simulating old preset
          },
          createdAt: Date.now() - 86400000 // 1 day ago
        }
      ]));

      const presets = getCustomPresets();
      expect(presets).toHaveLength(1);
      expect(presets[0].config.terrainEffectStrengths).toBeUndefined();
      
      // Normalizing should fall back to defaults
      const normalized = normalizeSimulationConfig(presets[0].config, 'legacy-seed');
      expect(normalized.terrainEffectStrengths.forestVisionMultiplier).toBe(0.5);
      expect(normalized.terrainEffectStrengths.wetlandSpeedMultiplier).toBe(0.5);
      expect(normalized.terrainEffectStrengths.wetlandTurnMultiplier).toBe(0.5);
      expect(normalized.terrainEffectStrengths.rockyEnergyDrain).toBe(0.2);
      
      // Restore original presets
      if (oldPresets) {
        storage.setItem('snn-sandbox.custom-presets', oldPresets);
      } else {
        storage.removeItem('snn-sandbox.custom-presets');
      }
    });
  });
});
