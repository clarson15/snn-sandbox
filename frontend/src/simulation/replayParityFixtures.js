import { canonicalizeReplayFixturePayload } from './replayCanonicalization';

const RAW_REPLAY_PARITY_FIXTURES = [
  {
    name: 'baseline-smoke',
    purpose: 'Balanced baseline fixture for deterministic replay smoke coverage.',
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
    purpose: 'Stress abundant-food dynamics with conservative mutation pressure.',
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
    name: 'tight-world-high-mutation',
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
  }
];

export const REPLAY_PARITY_FIXTURES = RAW_REPLAY_PARITY_FIXTURES.map((fixture) => canonicalizeReplayFixturePayload(fixture));
