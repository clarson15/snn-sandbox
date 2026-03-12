import { beforeEach, describe, expect, it } from 'vitest';

import { runTicks } from './engine';
import {
  applyPreset,
  createDeterministicRunBootstrap,
  createInitialWorldFromConfig,
  loadSimulationConfig,
  normalizeSimulationConfig,
  resolveSeed,
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
        mutationStrength: '0.3'
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
        mutationStrength: '0.2'
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
      mutationStrength: -1
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
      mutationStrength: expect.any(String)
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
      resolvedSeed: undefined,
      reproductionThreshold: 60,
      reproductionCost: 20,
      offspringStartEnergy: 15,
      enableObstacles: false,
      obstacleCount: 3,
      obstacleMinSize: 30,
      obstacleMaxSize: 80,
      enableDangerZones: false,
      dangerZoneCount: 2,
      dangerZoneRadius: 40,
      dangerZoneDamage: 0.5
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
      mutationStrength: 2
    }));

    expect(loadSimulationConfig()).toEqual({
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
      resolvedSeed: undefined,
      reproductionThreshold: 60,
      reproductionCost: 20,
      offspringStartEnergy: 15,
      enableObstacles: false,
      obstacleCount: 3,
      obstacleMinSize: 30,
      obstacleMaxSize: 80,
      enableDangerZones: false,
      dangerZoneCount: 2,
      dangerZoneRadius: 40,
      dangerZoneDamage: 0.5
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
      expect(result.config.worldWidth).toBe(800); // DEFAULT
      expect(result.config.initialPopulation).toBe(12); // DEFAULT
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
});
