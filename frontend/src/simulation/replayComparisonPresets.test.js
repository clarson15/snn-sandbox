import { describe, expect, it, vi } from 'vitest';

import {
  loadReplayComparisonPresets,
  saveReplayComparisonPresets,
  validateReplayComparisonPreset
} from './replayComparisonPresets';

describe('replayComparisonPresets', () => {
  const validPayload = {
    name: 'Regression seed A',
    seed: '1234',
    parameters: {
      worldWidth: 320,
      worldHeight: 180,
      initialPopulation: 20,
      minimumPopulation: 15,
      initialFoodCount: 40,
      foodSpawnChance: 0.04,
      foodEnergyValue: 18,
      maxFood: 120,
      reproductionThreshold: 42,
      reproductionCost: 20,
      offspringStartEnergy: 15,
      reproductionMinimumAge: 25,
      reproductionRefractoryPeriod: 120,
      maximumOrganismAge: 1000
    }
  };

  it('validates deterministic replay preset payloads', () => {
    expect(validateReplayComparisonPreset(validPayload)).toEqual(validPayload);
    expect(validateReplayComparisonPreset({ ...validPayload, seed: '' })).toBeNull();
    expect(validateReplayComparisonPreset({ ...validPayload, parameters: { ...validPayload.parameters, foodSpawnChance: 1.5 } })).toBeNull();
  });

  it('saves presets with stable key ordering', () => {
    const storage = {
      value: null,
      setItem: vi.fn((_, value) => {
        storage.value = value;
      })
    };

    saveReplayComparisonPresets([validPayload], storage);

    expect(storage.setItem).toHaveBeenCalledTimes(1);
    expect(storage.value).toBe(
      '[{"name":"Regression seed A","seed":"1234","parameters":{"worldWidth":320,"worldHeight":180,"initialPopulation":20,"minimumPopulation":15,"initialFoodCount":40,"foodSpawnChance":0.04,"foodEnergyValue":18,"maxFood":120,"reproductionThreshold":42,"reproductionCost":20,"offspringStartEnergy":15,"reproductionMinimumAge":25,"reproductionRefractoryPeriod":120,"maximumOrganismAge":1000}}]'
    );
  });

  it('loads only valid presets', () => {
    const storage = {
      getItem: vi.fn(() =>
        JSON.stringify([
          validPayload,
          { ...validPayload, name: 'Invalid', parameters: { ...validPayload.parameters, worldHeight: 0 } }
        ])
      )
    };

    expect(loadReplayComparisonPresets(storage)).toEqual([validPayload]);
  });
});
