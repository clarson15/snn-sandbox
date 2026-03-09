import { beforeEach, describe, expect, it } from 'vitest';

import { runTicks } from './engine';
import {
  createInitialWorldFromConfig,
  loadSimulationConfig,
  normalizeSimulationConfig,
  resolveSeed,
  SEED_FALLBACK_COUNTER_KEY,
  STORAGE_KEY,
  toEngineStepParams,
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
      resolvedSeed: undefined
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
      resolvedSeed: undefined
    });
  });
});
