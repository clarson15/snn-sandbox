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
        },
        // Biome food spawn bias (SSN-285)
        biomeFoodSpawnBias: {
          plains: 1.0,
          forest: 2.0,
          wetland: 0.5,
          rocky: 1.0
        }
      }
    });

    expect(url).toBe('https://sandbox.example/run?seed=seed-42&worldWidth=1200&worldHeight=720&initialPopulation=40&minimumPopulation=20&initialFoodCount=50&foodSpawnChance=0.05&foodEnergyValue=9&maxFood=300&mutationRate=0.2&mutationStrength=0.15&reproductionThreshold=60&reproductionCost=20&offspringStartEnergy=12&reproductionMinimumAge=25&reproductionRefractoryPeriod=80&maximumOrganismAge=900&terrainZoneEnabled=0&terrainZoneCount=4&terrainZoneMinWidthRatio=0.15&terrainZoneMaxWidthRatio=0.3&terrainZoneMinHeightRatio=0.15&terrainZoneMaxHeightRatio=0.3&biomeFoodSpawnBiasPlains=1&biomeFoodSpawnBiasForest=2&biomeFoodSpawnBiasWetland=0.5&biomeFoodSpawnBiasRocky=1&terrainEffectForestVisionMultiplier=0.5&terrainEffectWetlandSpeedMultiplier=0.5&terrainEffectWetlandTurnMultiplier=0.5&terrainEffectRockyEnergyDrain=0.2');


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

  it('maps biome food spawn bias query fields to nested config (SSN-285)', () => {
    const { prefill } = resolveDeterministicQueryPrefill(
      '?biomeFoodSpawnBiasPlains=0.5&biomeFoodSpawnBiasForest=2.0&biomeFoodSpawnBiasWetland=1.5&biomeFoodSpawnBiasRocky=0.0'
    );

    expect(prefill.biomeFoodSpawnBiasPlains).toBe('0.5');
    expect(prefill.biomeFoodSpawnBiasForest).toBe('2'); // toCanonicalNumberString converts 2.0 to "2"
    expect(prefill.biomeFoodSpawnBiasWetland).toBe('1.5');
    expect(prefill.biomeFoodSpawnBiasRocky).toBe('0');
    // Should also have nested biomeFoodSpawnBias
    expect(prefill.biomeFoodSpawnBias).toEqual({
      plains: 0.5,
      forest: 2.0,
      wetland: 1.5,
      rocky: 0.0
    });
  });

  it('uses default biome food spawn bias when not in query string (backward compatibility)', () => {
    const { prefill } = resolveDeterministicQueryPrefill('?seed=test-seed');

    // Should have default values
    expect(prefill.biomeFoodSpawnBiasPlains).toBe('1');
    expect(prefill.biomeFoodSpawnBiasForest).toBe('1');
    expect(prefill.biomeFoodSpawnBiasWetland).toBe('1');
    expect(prefill.biomeFoodSpawnBiasRocky).toBe('1');
    // Nested config should also have defaults
    expect(prefill.biomeFoodSpawnBias).toEqual({
      plains: 1.0,
      forest: 1.0,
      wetland: 1.0,
      rocky: 1.0
    });
  });

  it('produces deterministic share URL with custom biome bias values (SSN-285)', () => {
    const url = buildDeterministicShareUrl({
      origin: 'https://sandbox.example',
      pathname: '/run',
      seed: 'biome-test-seed',
      parameters: {
        worldWidth: 800,
        worldHeight: 480,
        initialPopulation: 10,
        minimumPopulation: 10,
        initialFoodCount: 20,
        foodSpawnChance: 0.05,
        foodEnergyValue: 5,
        maxFood: 100,
        mutationRate: 0.05,
        mutationStrength: 0.1,
        terrainZoneGeneration: {
          enabled: true,
          zoneCount: 4,
          minZoneWidthRatio: 0.15,
          maxZoneWidthRatio: 0.3,
          minZoneHeightRatio: 0.15,
          maxZoneHeightRatio: 0.3
        },
        biomeFoodSpawnBias: {
          plains: 0.2,
          forest: 3.0,
          wetland: 1.5,
          rocky: 0.5
        }
      }
    });

    // URL should include the custom biome bias values
    expect(url).toContain('biomeFoodSpawnBiasPlains=0.2');
    expect(url).toContain('biomeFoodSpawnBiasForest=3');
    expect(url).toContain('biomeFoodSpawnBiasWetland=1.5');
    expect(url).toContain('biomeFoodSpawnBiasRocky=0.5');
  });

  it('maps terrain effect strength query fields to nested config (SSN-290)', () => {
    const { prefill } = resolveDeterministicQueryPrefill(
      '?terrainEffectForestVisionMultiplier=0.3&terrainEffectWetlandSpeedMultiplier=0.8&terrainEffectWetlandTurnMultiplier=0.6&terrainEffectRockyEnergyDrain=1.5'
    );

    // Flat values should be parsed correctly
    expect(prefill.terrainEffectForestVisionMultiplier).toBe('0.3');
    expect(prefill.terrainEffectWetlandSpeedMultiplier).toBe('0.8');
    expect(prefill.terrainEffectWetlandTurnMultiplier).toBe('0.6');
    expect(prefill.terrainEffectRockyEnergyDrain).toBe('1.5');
    // Nested config should also be populated
    expect(prefill.terrainEffectStrengths).toEqual({
      forestVisionMultiplier: 0.3,
      wetlandSpeedMultiplier: 0.8,
      wetlandTurnMultiplier: 0.6,
      rockyEnergyDrain: 1.5
    });
  });

  it('uses default terrain effect strengths when not in query string (backward compatibility)', () => {
    const { prefill } = resolveDeterministicQueryPrefill('?seed=test-seed');

    // Should have default values
    expect(prefill.terrainEffectForestVisionMultiplier).toBe('0.5');
    expect(prefill.terrainEffectWetlandSpeedMultiplier).toBe('0.5');
    expect(prefill.terrainEffectWetlandTurnMultiplier).toBe('0.5');
    expect(prefill.terrainEffectRockyEnergyDrain).toBe('0.2');
    // Nested config should also have defaults
    expect(prefill.terrainEffectStrengths).toEqual({
      forestVisionMultiplier: 0.5,
      wetlandSpeedMultiplier: 0.5,
      wetlandTurnMultiplier: 0.5,
      rockyEnergyDrain: 0.2
    });
  });

  it('produces deterministic share URL with custom terrain effect strength values (SSN-290)', () => {
    const url = buildDeterministicShareUrl({
      origin: 'https://sandbox.example',
      pathname: '/run',
      seed: 'terrain-effect-test-seed',
      parameters: {
        worldWidth: 800,
        worldHeight: 480,
        initialPopulation: 10,
        minimumPopulation: 10,
        initialFoodCount: 20,
        foodSpawnChance: 0.05,
        foodEnergyValue: 5,
        maxFood: 100,
        mutationRate: 0.05,
        mutationStrength: 0.1,
        terrainZoneGeneration: {
          enabled: true,
          zoneCount: 4,
          minZoneWidthRatio: 0.15,
          maxZoneWidthRatio: 0.3,
          minZoneHeightRatio: 0.15,
          maxZoneHeightRatio: 0.3
        },
        biomeFoodSpawnBias: {
          plains: 1.0,
          forest: 1.0,
          wetland: 1.0,
          rocky: 1.0
        },
        // Custom terrain effect strengths (SSN-290)
        terrainEffectStrengths: {
          forestVisionMultiplier: 0.25,
          wetlandSpeedMultiplier: 0.75,
          wetlandTurnMultiplier: 0.4,
          rockyEnergyDrain: 1.0
        }
      }
    });

    // URL should include the custom terrain effect strength values
    expect(url).toContain('terrainEffectForestVisionMultiplier=0.25');
    expect(url).toContain('terrainEffectWetlandSpeedMultiplier=0.75');
    expect(url).toContain('terrainEffectWetlandTurnMultiplier=0.4');
    expect(url).toContain('terrainEffectRockyEnergyDrain=1');
  });
});
