import { canonicalizeReplayFixturePayload } from './replayCanonicalization';

// Core deterministic replay profile matrix.
// Each profile maps to a distinct gameplay regime and determinism risk envelope.
export const REPLAY_PROFILE_MATRIX = Object.freeze({
  sparseFood: Object.freeze({
    id: 'sparse-food',
    risk: 'Starvation pressure can amplify floor-spawn and iteration-order drift.'
  }),
  denseFood: Object.freeze({
    id: 'dense-food',
    risk: 'Abundant resources increase collision/churn and tie-break ordering pressure.'
  }),
  reproductionPressure: Object.freeze({
    id: 'high-reproduction-pressure',
    risk: 'High mutation + reproduction cadence can reveal long-horizon replay drift.'
  })
});

const RAW_REPLAY_PARITY_FIXTURES = [
  {
    name: 'baseline-smoke',
    profile: REPLAY_PROFILE_MATRIX.sparseFood.id,
    purpose: 'Balanced sparse-food baseline for deterministic replay smoke coverage and starvation-edge drift detection.',
    seed: 'fixture-baseline-smoke',
    worldWidth: 800,
    worldHeight: 480,
    initialPopulation: 24,
    minimumPopulation: 12,
    initialFoodCount: 35,
    foodSpawnChance: 0.05,
    foodEnergyValue: 6,
    maxFood: 140,
    mutationRate: 0.08,
    mutationStrength: 0.12,
    tickBudget: 120
  },
  {
    name: 'high-food-low-mutation',
    profile: REPLAY_PROFILE_MATRIX.denseFood.id,
    purpose: 'Dense-food profile that stresses abundant-resource contention while mutation remains conservative.',
    seed: 'fixture-high-food-low-mutation',
    worldWidth: 920,
    worldHeight: 520,
    initialPopulation: 30,
    minimumPopulation: 16,
    initialFoodCount: 48,
    foodSpawnChance: 0.08,
    foodEnergyValue: 7,
    maxFood: 180,
    mutationRate: 0.03,
    mutationStrength: 0.06,
    tickBudget: 140
  },
  {
    name: 'high-mutation-reproduction-churn',
    profile: REPLAY_PROFILE_MATRIX.reproductionPressure.id,
    purpose: 'High reproduction-pressure profile that catches deterministic drift under rapid mutation/reproduction churn.',
    seed: 'fixture-high-mutation-reproduction-churn',
    worldWidth: 760,
    worldHeight: 420,
    initialPopulation: 36,
    minimumPopulation: 18,
    initialFoodCount: 80,
    foodSpawnChance: 0.11,
    foodEnergyValue: 8,
    maxFood: 220,
    mutationRate: 0.2,
    mutationStrength: 0.24,
    tickBudget: 100
  },
  {
    name: 'tight-world-high-mutation',
    profile: REPLAY_PROFILE_MATRIX.denseFood.id,
    purpose: 'Exercise dense-world collision pressure with aggressive mutation variance.',
    seed: 'fixture-tight-world-high-mutation',
    worldWidth: 640,
    worldHeight: 360,
    initialPopulation: 20,
    minimumPopulation: 10,
    initialFoodCount: 24,
    foodSpawnChance: 0.03,
    foodEnergyValue: 5,
    maxFood: 110,
    mutationRate: 0.12,
    mutationStrength: 0.18,
    tickBudget: 130
  },
  {
    name: 'minimum-population-recovery',
    profile: REPLAY_PROFILE_MATRIX.sparseFood.id,
    purpose: 'Force deterministic minimum-population floor recovery under starvation pressure and verify canonical timeline parity.',
    seed: 'fixture-minimum-population-recovery',
    worldWidth: 700,
    worldHeight: 420,
    initialPopulation: 8,
    minimumPopulation: 14,
    initialFoodCount: 0,
    foodSpawnChance: 0,
    foodEnergyValue: 5,
    maxFood: 0,
    mutationRate: 0.1,
    mutationStrength: 0.14,
    tickBudget: 90
  },
  {
    name: 'cross-session-resume-drift',
    profile: REPLAY_PROFILE_MATRIX.reproductionPressure.id,
    purpose: 'Validate deterministic parity before and after persisted save/resume across a two-phase replay path.',
    seed: 'fixture-cross-session-resume-drift',
    worldWidth: 840,
    worldHeight: 500,
    initialPopulation: 28,
    minimumPopulation: 14,
    initialFoodCount: 42,
    foodSpawnChance: 0.06,
    foodEnergyValue: 7,
    maxFood: 165,
    mutationRate: 0.1,
    mutationStrength: 0.16,
    tickBudget: 150,
    saveTick: 70,
    resumeTickBudget: 80
  },
  {
    name: 'long-horizon-parity-checkpoints',
    profile: REPLAY_PROFILE_MATRIX.reproductionPressure.id,
    purpose: 'Catch deterministic replay drift that emerges after extended mutation/reproduction cycles using early/mid/late checkpoint parity.',
    seed: 'fixture-long-horizon-parity-checkpoints',
    worldWidth: 640,
    worldHeight: 360,
    initialPopulation: 10,
    minimumPopulation: 5,
    initialFoodCount: 12,
    foodSpawnChance: 0.02,
    foodEnergyValue: 6,
    maxFood: 36,
    mutationRate: 0.1,
    mutationStrength: 0.15,
    tickBudget: 360,
    checkpointTicks: [120, 240, 360]
  },
  {
    name: 'chunked-tick-execution-equivalence',
    profile: REPLAY_PROFILE_MATRIX.sparseFood.id,
    purpose: 'Prove deterministic replay parity between continuous execution and segmented stop/resume cadence boundaries.',
    seed: 'fixture-chunked-tick-execution-equivalence',
    worldWidth: 760,
    worldHeight: 420,
    initialPopulation: 22,
    minimumPopulation: 12,
    initialFoodCount: 32,
    foodSpawnChance: 0.045,
    foodEnergyValue: 6,
    maxFood: 130,
    mutationRate: 0.09,
    mutationStrength: 0.13,
    tickBudget: 180,
    checkpointTicks: [90, 180],
    cadencePlans: [
      { id: 'continuous', segments: [180] },
      { id: 'segmented-resume', segments: [37, 41, 29, 73] }
    ]
  },
  {
    name: 'boundary-wrap-and-heading-pressure',
    profile: REPLAY_PROFILE_MATRIX.denseFood.id,
    purpose: 'Force repeated edge-touching movement with dense boundary traffic to detect deterministic drift in world wrapping/clamping behavior.',
    // Rationale: this fixture intentionally packs agents into a narrow world so many organisms
    // repeatedly interact with the same boundary regions across ticks.
    // That pressure helps catch floating-point accumulation and iteration-order edge-case drift
    // in deterministic replay checks.
    seed: 'fixture-boundary-wrap-and-heading-pressure',
    worldWidth: 220,
    worldHeight: 140,
    initialPopulation: 34,
    minimumPopulation: 16,
    initialFoodCount: 18,
    foodSpawnChance: 0.09,
    foodEnergyValue: 7,
    maxFood: 64,
    mutationRate: 0.11,
    mutationStrength: 0.17,
    tickBudget: 110,
    workBudget: {
      enabled: true,
      maxWorkUnits: 3740
    }
  },
  {
    name: 'dense-collision-tie-break-ordering',
    profile: REPLAY_PROFILE_MATRIX.denseFood.id,
    purpose: 'Stress dense same-tick collisions and adjacency churn while asserting stable per-tick tie-break ordering summaries.',
    // Runtime guardrails:
    // - deterministic work budget keeps fixture complexity stable in CI (tickBudget * initialPopulation)
    // - wall-clock budget is enforced by REPLAY_PARITY_BUDGET_MS in replay.test.js
    seed: 'fixture-dense-collision-tie-break-ordering',
    worldWidth: 320,
    worldHeight: 200,
    initialPopulation: 36,
    minimumPopulation: 18,
    initialFoodCount: 14,
    foodSpawnChance: 0.12,
    foodEnergyValue: 8,
    maxFood: 56,
    mutationRate: 0.16,
    mutationStrength: 0.2,
    tickBudget: 70,
    workBudget: {
      enabled: true,
      maxWorkUnits: 2520
    },
    assertDeterministicTieBreakOrdering: true,
    tieBreakExpectations: [
      'Food consumption candidate selection is resolved by nearest distance, then lexical food id when distances tie.',
      'Reproduction iteration order is lexical organism id for all organisms meeting threshold in the same tick.',
      'Organism and food arrays are serialized in lexical id order before parity comparisons.'
    ]
  }
];

export const REPLAY_PARITY_FIXTURES = RAW_REPLAY_PARITY_FIXTURES.map((fixture) => canonicalizeReplayFixturePayload(fixture));

// Guidance for local focused runs:
// - REPLAY_PARITY_FIXTURE_NAMES="baseline-smoke,dense-collision-tie-break-ordering" npm run test -- src/simulation/replay.test.js
// - REPLAY_PARITY_FIXTURE_PROFILES="sparse-food" npm run test -- src/simulation/replay.test.js
export function resolveReplayParityFixtures({ fixtureNames, profileIds } = {}) {
  const selectedNames = new Set((fixtureNames ?? []).map((value) => String(value).trim()).filter(Boolean));
  const selectedProfiles = new Set((profileIds ?? []).map((value) => String(value).trim()).filter(Boolean));

  if (selectedNames.size === 0 && selectedProfiles.size === 0) {
    return REPLAY_PARITY_FIXTURES;
  }

  return REPLAY_PARITY_FIXTURES.filter((fixture) => {
    if (selectedNames.size > 0 && selectedNames.has(fixture.name)) {
      return true;
    }

    return selectedProfiles.size > 0 && selectedProfiles.has(fixture.profile);
  });
}
