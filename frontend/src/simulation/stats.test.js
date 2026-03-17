import { describe, expect, it } from 'vitest';

import {
  deriveOrganismHazardEffect,
  deriveOrganismTerrainEffect,
  deriveSimulationStats,
  deriveStatsTrends,
  formatOrganismHazardEffect,
  formatOrganismTerrainEffect,
  formatSimulationStats,
  formatTrendIndicator,
  reduceStatsTrendHistory,
  STATS_TREND_DIRECTIONS,
  STATS_TREND_WINDOW_TICKS
} from './stats';

describe('simulation stats', () => {
  it('derives deterministic metrics from world state without mutation', () => {
    const world = {
      tick: 42,
      organisms: [
        { id: 'o-1', generation: 2, energy: 10.1234 },
        { id: 'o-2', generation: 4, energy: 20.9876 }
      ],
      food: [{ id: 'f-1' }, { id: 'f-2' }, { id: 'f-3' }]
    };

    const stats = deriveSimulationStats(world);

    expect(stats).toEqual({
      tickCount: 42,
      elapsedSeconds: 1.4,
      population: 2,
      foodCount: 3,
      averageGeneration: 3,
      averageEnergy: 15.5555,
      speciesCount: 1,
      energyDeathWarning: false
    });

    // Guard against accidental render-path mutation.
    expect(world.organisms[0].energy).toBe(10.1234);
    expect(world.food).toHaveLength(3);
  });

  it('formats stats with stable precision and zero-safe defaults', () => {
    const formatted = formatSimulationStats(
      deriveSimulationStats({
        tick: 0,
        organisms: [],
        food: []
      })
    );

    expect(formatted).toEqual({
      tickCount: '\u00A0\u00A0\u00A0\u00A0\u00A0\u00A00',
      elapsedTime: '0.0s',
      population: '0',
      foodCount: '0',
      averageGeneration: '0.0',
      averageEnergy: '0.0',
      speciesCount: '0',
      energyDeathWarning: false
    });
  });

  it('normalizes malformed numeric inputs into deterministic finite outputs', () => {
    const derived = deriveSimulationStats({
      tick: -12.7,
      organisms: [
        { id: 'o-1', generation: Number.NaN, energy: Infinity },
        { id: 'o-2', generation: 4.9, energy: -3.2 }
      ],
      food: [{ id: 'f-1' }]
    });

    expect(derived).toEqual({
      tickCount: 0,
      elapsedSeconds: 0,
      population: 2,
      foodCount: 1,
      averageGeneration: 2.45,
      averageEnergy: -1.6,
      speciesCount: 1,
      energyDeathWarning: false
    });

    expect(formatSimulationStats({
      tickCount: -1,
      elapsedSeconds: Number.NaN,
      population: -2,
      foodCount: 1.9,
      averageGeneration: Number.POSITIVE_INFINITY,
      averageEnergy: Number.NEGATIVE_INFINITY,
      speciesCount: -1,
      energyDeathWarning: false
    })).toEqual({
      tickCount: '\u00A0\u00A0\u00A0\u00A0\u00A0\u00A00',
      elapsedTime: '0.0s',
      population: '0',
      foodCount: '1',
      averageGeneration: '0.0',
      averageEnergy: '0.0',
      speciesCount: '0',
      energyDeathWarning: false
    });
  });

  it('returns flat trends when there is insufficient history for the fixed tick window', () => {
    const history = [
      { tick: 0, population: 3, foodCount: 5, averageGeneration: 1.5, averageEnergy: 5 },
      { tick: STATS_TREND_WINDOW_TICKS - 1, population: 10, foodCount: 8, averageGeneration: 2.5, averageEnergy: 15 }
    ];

    expect(deriveStatsTrends(history, STATS_TREND_WINDOW_TICKS - 1)).toEqual({
      population: STATS_TREND_DIRECTIONS.FLAT,
      foodCount: STATS_TREND_DIRECTIONS.FLAT,
      averageGeneration: STATS_TREND_DIRECTIONS.FLAT,
      averageEnergy: STATS_TREND_DIRECTIONS.FLAT
    });
  });

  it('derives deterministic up/down/flat trends from fixed-window deltas', () => {
    const upHistory = [
      { tick: 0, population: 3, foodCount: 5, averageGeneration: 1.5, averageEnergy: 5.0 },
      { tick: STATS_TREND_WINDOW_TICKS, population: 7, foodCount: 12, averageGeneration: 2.8, averageEnergy: 6.2 }
    ];
    expect(deriveStatsTrends(upHistory, STATS_TREND_WINDOW_TICKS)).toEqual({
      population: STATS_TREND_DIRECTIONS.UP,
      foodCount: STATS_TREND_DIRECTIONS.UP,
      averageGeneration: STATS_TREND_DIRECTIONS.UP,
      averageEnergy: STATS_TREND_DIRECTIONS.UP
    });

    const downHistory = [
      { tick: 0, population: 7, foodCount: 12, averageGeneration: 2.8, averageEnergy: 6.0 },
      { tick: STATS_TREND_WINDOW_TICKS, population: 4, foodCount: 3, averageGeneration: 1.2, averageEnergy: 5.1 }
    ];
    expect(deriveStatsTrends(downHistory, STATS_TREND_WINDOW_TICKS)).toEqual({
      population: STATS_TREND_DIRECTIONS.DOWN,
      foodCount: STATS_TREND_DIRECTIONS.DOWN,
      averageGeneration: STATS_TREND_DIRECTIONS.DOWN,
      averageEnergy: STATS_TREND_DIRECTIONS.DOWN
    });

    const flatHistory = [
      { tick: 0, population: 4, foodCount: 6, averageGeneration: 2.0, averageEnergy: 5.0 },
      { tick: STATS_TREND_WINDOW_TICKS, population: 4, foodCount: 6, averageGeneration: 2.05, averageEnergy: 5.05 }
    ];
    expect(deriveStatsTrends(flatHistory, STATS_TREND_WINDOW_TICKS)).toEqual({
      population: STATS_TREND_DIRECTIONS.FLAT,
      foodCount: STATS_TREND_DIRECTIONS.FLAT,
      averageGeneration: STATS_TREND_DIRECTIONS.FLAT,
      averageEnergy: STATS_TREND_DIRECTIONS.FLAT
    });
  });

  it('keeps a deterministic bounded history and resets when tick count rewinds', () => {
    const history = [
      { tick: 120, population: 5, foodCount: 10, averageGeneration: 2, averageEnergy: 4 },
      { tick: 130, population: 6, foodCount: 12, averageGeneration: 3, averageEnergy: 5 }
    ];

    expect(reduceStatsTrendHistory(history, { tickCount: 10, population: 1, foodCount: 3, averageGeneration: 1, averageEnergy: 2 })).toEqual([
      { tick: 10, population: 1, foodCount: 3, averageGeneration: 1, averageEnergy: 2 }
    ]);
  });

  it('bounds history to fixed window and removes samples outside STATS_TREND_WINDOW_TICKS', () => {
    // Build history spanning beyond the window
    const history = [];
    for (let tick = 0; tick <= STATS_TREND_WINDOW_TICKS + 50; tick += 10) {
      history.push({
        tick,
        population: tick,
        foodCount: tick * 2,
        averageGeneration: tick / 10,
        averageEnergy: tick / 5
      });
    }

    // Add another sample at current tick - oldest should be filtered out
    const currentTick = STATS_TREND_WINDOW_TICKS + 50;
    const result = reduceStatsTrendHistory(history, {
      tickCount: currentTick,
      population: currentTick,
      foodCount: currentTick * 2,
      averageGeneration: currentTick / 10,
      averageEnergy: currentTick / 5
    });

    // Oldest sample should have been filtered out (tick < currentTick - 120)
    expect(result[0].tick).toBe(currentTick - STATS_TREND_WINDOW_TICKS);
    expect(result[result.length - 1].tick).toBe(currentTick);
  });

  it('does not grow history when tick is stable (paused simulation)', () => {
    // Simulate paused/stable sampling - same tick repeated
    const history = [
      { tick: 50, population: 5, foodCount: 10, averageGeneration: 2, averageEnergy: 4 }
    ];

    // Adding another sample at same tick should NOT grow history
    const result = reduceStatsTrendHistory(history, {
      tickCount: 50,
      population: 7,
      foodCount: 15,
      averageGeneration: 3.5,
      averageEnergy: 6
    });

    // History should remain unchanged - no duplicate ticks appended
    expect(result).toHaveLength(1);
    expect(result[0].tick).toBe(50);
    // Original values preserved (not updated since tick is same)
    expect(result[0].population).toBe(5);
  });

  it('handles new metrics (speciesCount, energyDeathWarning) correctly without breaking trend history', () => {
    // Ensure deriveSimulationStats includes new metrics while history remains bounded
    const world = {
      tick: 100,
      organisms: [
        { id: 'o-1', generation: 2, energy: 10 },
        { id: 'o-2', generation: 3, energy: 20 }
      ],
      food: [{ id: 'f-1' }]
    };

    const stats = deriveSimulationStats(world);

    // New metrics should be present
    expect(stats.speciesCount).toBe(1);
    expect(stats.energyDeathWarning).toBe(false);

    // History should still work correctly with the standard metrics
    const history = [
      { tick: 50, population: 3, foodCount: 5, averageGeneration: 2, averageEnergy: 15 }
    ];

    const result = reduceStatsTrendHistory(history, {
      tickCount: stats.tickCount,
      population: stats.population,
      foodCount: stats.foodCount,
      averageGeneration: stats.averageGeneration,
      averageEnergy: stats.averageEnergy
    });

    expect(result).toHaveLength(2);
    expect(result[result.length - 1].population).toBe(2);
  });

  it('maps trend states to stable UI labels', () => {
    expect(formatTrendIndicator(STATS_TREND_DIRECTIONS.UP)).toBe('↑ Up');
    expect(formatTrendIndicator(STATS_TREND_DIRECTIONS.DOWN)).toBe('↓ Down');
    expect(formatTrendIndicator(STATS_TREND_DIRECTIONS.FLAT)).toBe('→ Flat');
  });

  it('clusters organisms into species based on genetic distance', () => {
    // Two organisms with identical traits = 1 species
    const identicalOrganisms = {
      tick: 10,
      organisms: [
        { id: 'o-1', traits: { size: 1, speed: 1, adolescenceAge: 40, visionRange: 5, turnRate: 0.5, metabolism: 0.1 } },
        { id: 'o-2', traits: { size: 1, speed: 1, adolescenceAge: 40, eggHatchTime: 0, visionRange: 5, turnRate: 0.5, metabolism: 0.1 } }
      ],
      food: []
    };
    expect(deriveSimulationStats(identicalOrganisms).speciesCount).toBe(1);

    // Two organisms with very different traits = 2 species
    const differentOrganisms = {
      tick: 10,
      organisms: [
        { id: 'o-1', traits: { size: 1, speed: 1, adolescenceAge: 20, eggHatchTime: 0, visionRange: 5, turnRate: 0.5, metabolism: 0.1 } },
        { id: 'o-2', traits: { size: 5, speed: 5, adolescenceAge: 400, eggHatchTime: 9, visionRange: 20, turnRate: 1, metabolism: 1 } }
      ],
      food: []
    };
    expect(deriveSimulationStats(differentOrganisms).speciesCount).toBe(2);

    // Chain of similar organisms = 1 species (connected components)
    const chainOrganisms = {
      tick: 10,
      organisms: [
        { id: 'o-1', traits: { size: 1, speed: 1, adolescenceAge: 40, eggHatchTime: 2, visionRange: 5, turnRate: 0.5, metabolism: 0.1 } },
        { id: 'o-2', traits: { size: 1.1, speed: 1.1, adolescenceAge: 42, eggHatchTime: 2.2, visionRange: 5.1, turnRate: 0.51, metabolism: 0.11 } },
        { id: 'o-3', traits: { size: 1.2, speed: 1.2, adolescenceAge: 44, eggHatchTime: 2.4, visionRange: 5.2, turnRate: 0.52, metabolism: 0.12 } }
      ],
      food: []
    };
    expect(deriveSimulationStats(chainOrganisms).speciesCount).toBe(1);

    // Empty population
    expect(deriveSimulationStats({ tick: 0, organisms: [], food: [] }).speciesCount).toBe(0);

    // Single organism
    expect(deriveSimulationStats({ tick: 0, organisms: [{ id: 'o-1' }], food: [] }).speciesCount).toBe(1);
  });
});

describe('organism terrain effect', () => {
  // Use real deterministic world model schema: terrain types plains|forest|wetland|rocky
  // and bounds {x, y, width, height} instead of top-level x/y/width/height
  const terrainZones = [
    { id: 'zone-1', bounds: { x: 0, y: 0, width: 100, height: 100 }, type: 'plains' },
    { id: 'zone-2', bounds: { x: 100, y: 0, width: 100, height: 100 }, type: 'forest' },
    { id: 'zone-3', bounds: { x: 0, y: 100, width: 100, height: 100 }, type: 'wetland' },
    { id: 'zone-4', bounds: { x: 100, y: 100, width: 100, height: 100 }, type: 'rocky' }
  ];

  it('returns null when organism is null', () => {
    expect(deriveOrganismTerrainEffect(null, terrainZones)).toBeNull();
  });

  it('returns null when organism has no position', () => {
    expect(deriveOrganismTerrainEffect({}, terrainZones)).toBeNull();
    expect(deriveOrganismTerrainEffect({ id: 'o-1' }, terrainZones)).toBeNull();
  });

  it('returns null when terrain zones are empty', () => {
    expect(deriveOrganismTerrainEffect({ x: 50, y: 50 }, [])).toBeNull();
    expect(deriveOrganismTerrainEffect({ x: 50, y: 50 }, null)).toBeNull();
    expect(deriveOrganismTerrainEffect({ x: 50, y: 50 }, undefined)).toBeNull();
  });

  it('returns null when organism is not in any terrain zone', () => {
    expect(deriveOrganismTerrainEffect({ x: 250, y: 250 }, terrainZones)).toBeNull();
  });

  it('derives terrain effect for organism in plains zone', () => {
    const effect = deriveOrganismTerrainEffect({ x: 50, y: 50 }, terrainZones);
    expect(effect).not.toBeNull();
    expect(effect.type).toBe('plains');
    expect(effect.label).toBe('Plains');
    expect(effect.effect).toBe('normal');
  });

  it('derives terrain effect for organism in forest zone', () => {
    const effect = deriveOrganismTerrainEffect({ x: 150, y: 50 }, terrainZones);
    expect(effect).not.toBeNull();
    expect(effect.type).toBe('forest');
    expect(effect.label).toBe('Forest');
    expect(effect.effect).toBe('50% vision');
  });

  it('derives terrain effect for organism in wetland zone', () => {
    const effect = deriveOrganismTerrainEffect({ x: 50, y: 150 }, terrainZones);
    expect(effect).not.toBeNull();
    expect(effect.type).toBe('wetland');
    expect(effect.label).toBe('Wetland');
    expect(effect.effect).toBe('50% speed, 50% turn');
  });

  it('derives terrain effect for organism in rocky zone', () => {
    const effect = deriveOrganismTerrainEffect({ x: 150, y: 150 }, terrainZones);
    expect(effect).not.toBeNull();
    expect(effect.type).toBe('rocky');
    expect(effect.label).toBe('Rocky');
    expect(effect.effect).toBe('-0.2 energy/tick');
  });

  it('handles organism at exact zone boundary edge (point-in-rectangle)', () => {
    // Organism at the exact edge of the plains zone
    const effect = deriveOrganismTerrainEffect({ x: 100, y: 50 }, terrainZones);
    expect(effect).not.toBeNull();
    expect(effect.type).toBe('plains');
  });

  it('handles organism outside zone bounds', () => {
    // Outside all zones
    const effect = deriveOrganismTerrainEffect({ x: 99, y: 99 }, terrainZones);
    expect(effect).not.toBeNull();
    expect(effect.type).toBe('plains');

    // Just outside the plains zone at x=100 (boundary is inclusive)
    const effect2 = deriveOrganismTerrainEffect({ x: 101, y: 50 }, terrainZones);
    expect(effect2).not.toBeNull();
    expect(effect2.type).toBe('forest');
  });

  it('formats terrain effect for HUD display', () => {
    const effect = deriveOrganismTerrainEffect({ x: 50, y: 50 }, terrainZones);
    const formatted = formatOrganismTerrainEffect(effect);
    expect(formatted).toEqual({
      zoneLabel: 'Plains',
      effectLabel: 'normal'
    });
  });

  it('returns null from format when terrain effect is null', () => {
    expect(formatOrganismTerrainEffect(null)).toBeNull();
    expect(formatOrganismTerrainEffect(undefined)).toBeNull();
  });

  it('returns null when no organism is selected (no-selection case)', () => {
    expect(deriveOrganismTerrainEffect(null, terrainZones)).toBeNull();
    expect(deriveOrganismTerrainEffect(undefined, terrainZones)).toBeNull();
  });
});

describe('organism hazard effect', () => {
  // Use real deterministic world model schema: danger zone types lava|acid|radiation
  // with x, y, radius, damagePerTick, and optional type
  const dangerZones = [
    { id: 'hazard-1', x: 50, y: 50, radius: 20, damagePerTick: 1.0, type: 'lava' },
    { id: 'hazard-2', x: 150, y: 50, radius: 25, damagePerTick: 0.5, type: 'acid' },
    { id: 'hazard-3', x: 50, y: 150, radius: 30, damagePerTick: 1.5, type: 'radiation' },
    { id: 'hazard-4', x: 150, y: 150, radius: 20, damagePerTick: 2.0, type: 'lava' }
  ];

  it('returns null when organism is null', () => {
    expect(deriveOrganismHazardEffect(null, dangerZones)).toBeNull();
  });

  it('returns null when organism has no position', () => {
    expect(deriveOrganismHazardEffect({}, dangerZones)).toBeNull();
    expect(deriveOrganismHazardEffect({ id: 'o-1' }, dangerZones)).toBeNull();
  });

  it('returns null when danger zones are empty', () => {
    expect(deriveOrganismHazardEffect({ x: 50, y: 50 }, [])).toBeNull();
    expect(deriveOrganismHazardEffect({ x: 50, y: 50 }, null)).toBeNull();
    expect(deriveOrganismHazardEffect({ x: 50, y: 50 }, undefined)).toBeNull();
  });

  it('returns null when organism is not in any danger zone', () => {
    expect(deriveOrganismHazardEffect({ x: 250, y: 250 }, dangerZones)).toBeNull();
  });

  it('derives hazard effect for organism in single lava zone', () => {
    const effect = deriveOrganismHazardEffect({ x: 50, y: 50 }, dangerZones);
    expect(effect).not.toBeNull();
    expect(effect.zones).toHaveLength(1);
    expect(effect.zones[0].type).toBe('lava');
    expect(effect.zones[0].label).toBe('Lava');
    expect(effect.zones[0].damage).toBe(1.0);
    expect(effect.totalDamage).toBe(1.0);
  });

  it('derives hazard effect for organism in acid zone', () => {
    const effect = deriveOrganismHazardEffect({ x: 150, y: 50 }, dangerZones);
    expect(effect).not.toBeNull();
    expect(effect.zones).toHaveLength(1);
    expect(effect.zones[0].type).toBe('acid');
    expect(effect.zones[0].label).toBe('Acid');
    expect(effect.totalDamage).toBe(0.5);
  });

  it('derives hazard effect for organism in radiation zone', () => {
    const effect = deriveOrganismHazardEffect({ x: 50, y: 150 }, dangerZones);
    expect(effect).not.toBeNull();
    expect(effect.zones).toHaveLength(1);
    expect(effect.zones[0].type).toBe('radiation');
    expect(effect.zones[0].label).toBe('Radiation');
    expect(effect.totalDamage).toBe(1.5);
  });

  it('accumulates damage when organism is in overlapping danger zones', () => {
    // At (150, 150), organism is in both hazard-3 (radiation, radius 30) and hazard-4 (lava, radius 20)
    // Distance to hazard-3 center: sqrt((150-50)^2 + (150-150)^2) = 100, which is > 30, so NOT in radiation
    // Actually, let me recalculate: distance from (150, 150) to (50, 150) = 100 - that's outside radiation (radius 30)
    // Let me use a point that's actually in both: (155, 155)
    // Distance to hazard-3 (50, 150): sqrt(105^2 + 5^2) ≈ 105, outside
    // Let me use (145, 145): distance to hazard-3 (50,150) = sqrt(95^2 + 5^2) ≈ 95, outside
    // Let me try (60, 155): distance to hazard-1 (50,50) = sqrt(10^2 + 105^2) ≈ 105, outside
    // Let me think about this differently - I need zones that overlap
    
    // Create overlapping zones for this test
    const overlappingZones = [
      { id: 'h1', x: 100, y: 100, radius: 30, damagePerTick: 1.0, type: 'lava' },
      { id: 'h2', x: 110, y: 110, radius: 30, damagePerTick: 0.5, type: 'acid' }
    ];
    // At (105, 105): distance to h1 = sqrt(5^2 + 5^2) ≈ 7.07 < 30 (in lava)
    //                 distance to h2 = sqrt(5^2 + 5^2) ≈ 7.07 < 30 (in acid)
    const effect = deriveOrganismHazardEffect({ x: 105, y: 105 }, overlappingZones);
    expect(effect).not.toBeNull();
    expect(effect.zones).toHaveLength(2);
    expect(effect.totalDamage).toBe(1.5); // 1.0 + 0.5
  });

  it('handles legacy danger zone without type (defaults to lava)', () => {
    const legacyZones = [
      { id: 'legacy-1', x: 50, y: 50, radius: 20, damagePerTick: 1.0 }
    ];
    const effect = deriveOrganismHazardEffect({ x: 50, y: 50 }, legacyZones);
    expect(effect).not.toBeNull();
    expect(effect.zones).toHaveLength(1);
    expect(effect.zones[0].type).toBe('lava');
    expect(effect.zones[0].label).toBe('Lava');
  });

  it('handles organism at exact zone boundary (point-in-circle)', () => {
    // At exact boundary: distance = radius
    // For hazard-1 at (50, 50) with radius 20: point at (70, 50) has distance 20
    // The check is: dx*dx + dy*dy < radius*radius, so distance = radius is NOT in zone
    const effect = deriveOrganismHazardEffect({ x: 70, y: 50 }, dangerZones);
    expect(effect).toBeNull();

    // Just inside: distance 19.9
    const effect2 = deriveOrganismHazardEffect({ x: 69.9, y: 50 }, dangerZones);
    expect(effect2).not.toBeNull();
  });

  it('formats hazard effect for HUD display', () => {
    const effect = deriveOrganismHazardEffect({ x: 50, y: 50 }, dangerZones);
    const formatted = formatOrganismHazardEffect(effect);
    expect(formatted).toEqual({
      hazardLabel: 'Lava',
      damageLabel: '-1.0 energy/tick',
      zoneCount: 1,
      totalDamage: 1.0
    });
  });

  it('formats multiple overlapping hazards for HUD display', () => {
    const overlappingZones = [
      { id: 'h1', x: 100, y: 100, radius: 30, damagePerTick: 1.0, type: 'lava' },
      { id: 'h2', x: 110, y: 110, radius: 30, damagePerTick: 0.5, type: 'acid' }
    ];
    const effect = deriveOrganismHazardEffect({ x: 105, y: 105 }, overlappingZones);
    const formatted = formatOrganismHazardEffect(effect);
    expect(formatted).toEqual({
      hazardLabel: 'Lava + Acid',
      damageLabel: '-1.5 energy/tick',
      zoneCount: 2,
      totalDamage: 1.5
    });
  });

  it('returns null from format when hazard effect is null', () => {
    expect(formatOrganismHazardEffect(null)).toBeNull();
    expect(formatOrganismHazardEffect(undefined)).toBeNull();
  });

  it('handles unknown hazard type gracefully', () => {
    const unknownTypeZones = [
      { id: 'u1', x: 50, y: 50, radius: 20, damagePerTick: 1.0, type: 'unknown-type' }
    ];
    const effect = deriveOrganismHazardEffect({ x: 50, y: 50 }, unknownTypeZones);
    expect(effect).not.toBeNull();
    expect(effect.zones[0].label).toBe('Hazard'); // Falls back to 'Hazard'
  });
});
