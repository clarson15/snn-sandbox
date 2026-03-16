import { describe, expect, it } from 'vitest';

import { buildDeterministicShareUrl, resolveDeterministicQueryPrefill } from './shareLink';

describe('shareLink helpers', () => {
  it('builds deterministic share URLs with stable parameter ordering', () => {
    const url = buildDeterministicShareUrl({
      origin: 'https://sandbox.example',
      pathname: '/run',
      seed: 'seed-42',
      parameters: {
        worldWidth: 1200,
        worldHeight: 720,
        initialPopulation: 40,
        minimumPopulation: 20,
        initialFoodCount: 50,
        foodSpawnChance: 0.05,
        foodEnergyValue: 9,
        maxFood: 300,
        // Legacy mutation fields
        mutationRate: 0.2,
        mutationStrength: 0.15,
        // New trait-specific mutation fields (SSN-254)
        physicalTraitsMutationRate: 0.2,
        physicalTraitsMutationStrength: 0.15,
        brainStructureMutationRate: 0.2,
        brainWeightMutationRate: 0.2,
        brainWeightMutationStrength: 0.15,
        reproductionThreshold: 60,
        reproductionCost: 20,
        offspringStartEnergy: 12,
        reproductionMinimumAge: 25,
        reproductionRefractoryPeriod: 80,
        maximumOrganismAge: 900,
        terrainZoneGeneration: {
          enabled: false,
          zoneCount: 4,
          minZoneWidthRatio: 0.15,
          maxZoneWidthRatio: 0.3,
          minZoneHeightRatio: 0.15,
          maxZoneHeightRatio: 0.3
        }
      }
    });

    expect(url).toBe('https://sandbox.example/run?seed=seed-42&worldWidth=1200&worldHeight=720&initialPopulation=40&minimumPopulation=20&initialFoodCount=50&foodSpawnChance=0.05&foodEnergyValue=9&maxFood=300&mutationRate=0.2&mutationStrength=0.15&reproductionThreshold=60&reproductionCost=20&offspringStartEnergy=12&reproductionMinimumAge=25&reproductionRefractoryPeriod=80&maximumOrganismAge=900&terrainZoneEnabled=0&terrainZoneCount=4&terrainZoneMinWidthRatio=0.15&terrainZoneMaxWidthRatio=0.3&terrainZoneMinHeightRatio=0.15&terrainZoneMaxHeightRatio=0.3');


  });

  it('parses query prefill and falls back to defaults with warning on invalid fields', () => {
    const { prefill, warningMessage } = resolveDeterministicQueryPrefill(
      '?seed=shared-seed&worldWidth=bad&worldHeight=1000&initialPopulation=50'
    );

    expect(prefill.seed).toBe('shared-seed');
    expect(prefill.worldWidth).toBe('1920');
    expect(prefill.worldHeight).toBe('1000');
    expect(prefill.initialPopulation).toBe('50');
    expect(prefill.maxFood).toBe('450');
    expect(prefill.reproductionMinimumAge).toBe('25');
    expect(warningMessage).toContain('worldWidth');
    expect(warningMessage).toContain('minimumPopulation');
    expect(warningMessage).toContain('reproductionThreshold');
  });

  it('maps terrain query fields to app form-safe values', () => {
    const { prefill } = resolveDeterministicQueryPrefill(
      '?terrainZoneEnabled=1&terrainZoneCount=6&terrainZoneMinWidthRatio=0.16&terrainZoneMaxWidthRatio=0.34&terrainZoneMinHeightRatio=0.17&terrainZoneMaxHeightRatio=0.31'
    );

    expect(prefill.terrainZoneEnabled).toBe('true');
    expect(prefill.terrainZoneCount).toBe('6');
    expect(prefill.terrainZoneMinWidthRatio).toBe('0.16');
    expect(prefill.terrainZoneMaxWidthRatio).toBe('0.34');
    expect(prefill.terrainZoneMinHeightRatio).toBe('0.17');
    expect(prefill.terrainZoneMaxHeightRatio).toBe('0.31');
  });
});
