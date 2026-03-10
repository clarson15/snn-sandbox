import { performance } from 'node:perf_hooks';
import { createInitialWorldFromConfig, DEFAULT_CONFIG, normalizeSimulationConfig, toEngineStepParams } from '../src/simulation/config.js';
import { createSeededPrng } from '../src/simulation/prng.js';
import { stepWorld } from '../src/simulation/engine.js';

const DEFAULT_TICKS = 18_000; // 10 minutes of simulation time at 30 ticks/sec
const DEFAULT_SAMPLE_INTERVAL = 300; // every 10 seconds at 30 ticks/sec

function parseArgs(argv) {
  const flags = new Map();
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) {
      continue;
    }

    const key = token.slice(2);
    const value = argv[index + 1] && !argv[index + 1].startsWith('--') ? argv[index + 1] : 'true';
    flags.set(key, value);
    if (value !== 'true') {
      index += 1;
    }
  }
  return flags;
}

function toInt(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function toNumber(value, fallback) {
  const parsed = Number(String(value ?? ''));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function formatMb(bytes) {
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

const args = parseArgs(process.argv.slice(2));
const ticks = toInt(args.get('ticks'), DEFAULT_TICKS);
const sampleInterval = toInt(args.get('sample-interval'), DEFAULT_SAMPLE_INTERVAL);
const growthBudgetMb = toNumber(args.get('max-growth-mb'), 64);
const seed = String(args.get('seed') ?? 'benchmark-soak-seed-2000');

const config = normalizeSimulationConfig(
  {
    ...DEFAULT_CONFIG,
    name: 'Deterministic 2000 organism soak test',
    seed,
    initialPopulation: 2000,
    minimumPopulation: 400,
    initialFoodCount: 900,
    maxFood: 2000,
    worldWidth: 1600,
    worldHeight: 900,
    foodSpawnChance: 0.05,
    mutationRate: 0.05,
    mutationStrength: 0.1
  },
  seed
);

const stepParams = {
  ...toEngineStepParams(config),
  interactionRadius: 32,
  interactionCostPerNeighbor: 0.005,
  interactionLookupMode: 'spatial'
};

const rng = createSeededPrng(config.resolvedSeed);
let world = createInitialWorldFromConfig(config);
const startedAt = performance.now();
const heapSamples = [];

for (let tick = 1; tick <= ticks; tick += 1) {
  world = stepWorld(world, rng, stepParams);

  if (tick % sampleInterval === 0 || tick === ticks) {
    heapSamples.push({
      tick,
      heapUsed: process.memoryUsage().heapUsed,
      population: world.organisms.length,
      food: world.food.length
    });
  }
}

const elapsedMs = performance.now() - startedAt;
const avgTickMs = elapsedMs / ticks;
const ticksPerSecond = 1000 / avgTickMs;

const firstHeap = heapSamples[0]?.heapUsed ?? process.memoryUsage().heapUsed;
const lastHeap = heapSamples[heapSamples.length - 1]?.heapUsed ?? process.memoryUsage().heapUsed;
const heapGrowthMb = (lastHeap - firstHeap) / (1024 * 1024);

console.log(`2000-organism soak benchmark complete`);
console.log(`  Seed: ${seed}`);
console.log(`  Ticks: ${ticks}`);
console.log(`  Runtime: ${elapsedMs.toFixed(2)}ms`);
console.log(`  Avg/tick: ${avgTickMs.toFixed(3)}ms`);
console.log(`  Ticks/sec: ${ticksPerSecond.toFixed(2)}`);
console.log(`  Heap start: ${formatMb(firstHeap)}`);
console.log(`  Heap end: ${formatMb(lastHeap)}`);
console.log(`  Heap growth: ${heapGrowthMb.toFixed(2)} MB`);

for (const sample of heapSamples) {
  console.log(
    `  Sample @ tick ${sample.tick}: heap=${formatMb(sample.heapUsed)} population=${sample.population} food=${sample.food}`
  );
}

if (heapGrowthMb > growthBudgetMb) {
  console.error(`\nFAIL: heap growth ${heapGrowthMb.toFixed(2)} MB exceeded budget ${growthBudgetMb.toFixed(2)} MB`);
  process.exit(1);
}

if (ticksPerSecond < 30) {
  console.error(`\nFAIL: throughput ${ticksPerSecond.toFixed(2)} ticks/sec is below 30 ticks/sec target`);
  process.exit(1);
}

console.log('\nPASS: throughput and heap growth remained within configured limits.');
