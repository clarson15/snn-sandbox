import { performance } from 'node:perf_hooks';
import { createInitialWorldFromConfig, DEFAULT_CONFIG, normalizeSimulationConfig, toEngineStepParams } from '../src/simulation/config.js';
import { createSeededPrng } from '../src/simulation/prng.js';
import { stepWorld } from '../src/simulation/engine.js';

const BENCHMARK_TICKS = 300;

const SCENARIOS = [
  {
    name: 'population-500',
    seed: 'benchmark-seed-500',
    initialPopulation: 500,
    minimumPopulation: 100,
    initialFoodCount: 500,
    maxFood: 1500
  },
  {
    name: 'population-1000',
    seed: 'benchmark-seed-1000',
    initialPopulation: 1000,
    minimumPopulation: 200,
    initialFoodCount: 700,
    maxFood: 1800
  },
  {
    name: 'population-2000',
    seed: 'benchmark-seed-2000',
    initialPopulation: 2000,
    minimumPopulation: 400,
    initialFoodCount: 900,
    maxFood: 2000
  }
];

function toStableJson(value) {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((entry) => toStableJson(entry)).join(',')}]`;
  }

  const entries = Object.entries(value).sort(([left], [right]) => left.localeCompare(right));
  return `{${entries.map(([key, nested]) => `${JSON.stringify(key)}:${toStableJson(nested)}`).join(',')}}`;
}

function checksum(value) {
  const input = toStableJson(value);
  let hash = 2166136261;

  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return (hash >>> 0).toString(16).padStart(8, '0');
}

function buildScenarioConfig(scenario) {
  return normalizeSimulationConfig(
    {
      ...DEFAULT_CONFIG,
      name: `Deterministic benchmark ${scenario.name}`,
      seed: scenario.seed,
      initialPopulation: scenario.initialPopulation,
      minimumPopulation: scenario.minimumPopulation,
      initialFoodCount: scenario.initialFoodCount,
      maxFood: scenario.maxFood,
      worldWidth: 1600,
      worldHeight: 900,
      foodSpawnChance: 0.05,
      mutationRate: 0.05,
      mutationStrength: 0.1
    },
    scenario.seed
  );
}

function executeScenarioRun(scenario, interactionLookupMode) {
  const config = buildScenarioConfig(scenario);
  const stepParams = {
    ...toEngineStepParams(config),
    interactionRadius: 32,
    interactionCostPerNeighbor: 0.005,
    interactionLookupMode
  };
  const rng = createSeededPrng(config.resolvedSeed);
  let world = createInitialWorldFromConfig(config);

  const startedAt = performance.now();
  for (let tick = 0; tick < BENCHMARK_TICKS; tick += 1) {
    world = stepWorld(world, rng, stepParams);
  }
  const elapsedMs = performance.now() - startedAt;

  return {
    elapsedMs,
    averageTickMs: elapsedMs / BENCHMARK_TICKS,
    checksum: checksum({ world, rngState: rng.state })
  };
}

function formatMs(value) {
  return `${value.toFixed(3)}ms`;
}

function runBenchmarks() {
  console.log(`Running deterministic benchmark scenarios (${BENCHMARK_TICKS} ticks each)\n`);

  let hasMismatch = false;

  for (const scenario of SCENARIOS) {
    const spatialRunA = executeScenarioRun(scenario, 'spatial');
    const spatialRunB = executeScenarioRun(scenario, 'spatial');
    const legacyRun = executeScenarioRun(scenario, 'legacy');

    const deterministicMatch = spatialRunA.checksum === spatialRunB.checksum;
    const modeParity = spatialRunA.checksum === legacyRun.checksum;
    hasMismatch = hasMismatch || !deterministicMatch || !modeParity;

    const speedupPercent = ((legacyRun.averageTickMs - spatialRunA.averageTickMs) / legacyRun.averageTickMs) * 100;

    console.log(`Scenario: ${scenario.name}`);
    console.log(`  Seed: ${scenario.seed}`);
    console.log(`  Population: ${scenario.initialPopulation}`);
    console.log(`  Spatial run #1 total: ${formatMs(spatialRunA.elapsedMs)} | avg/tick: ${formatMs(spatialRunA.averageTickMs)} | ticks/sec: ${(1000 / spatialRunA.averageTickMs).toFixed(2)}`);
    console.log(`  Spatial run #2 total: ${formatMs(spatialRunB.elapsedMs)} | avg/tick: ${formatMs(spatialRunB.averageTickMs)} | ticks/sec: ${(1000 / spatialRunB.averageTickMs).toFixed(2)}`);
    console.log(`  Legacy lookup total: ${formatMs(legacyRun.elapsedMs)} | avg/tick: ${formatMs(legacyRun.averageTickMs)} | ticks/sec: ${(1000 / legacyRun.averageTickMs).toFixed(2)}`);
    console.log(`  Spatial deterministic checksum run #1: ${spatialRunA.checksum}`);
    console.log(`  Spatial deterministic checksum run #2: ${spatialRunB.checksum}`);
    console.log(`  Legacy deterministic checksum: ${legacyRun.checksum}`);
    console.log(`  Spatial deterministic match: ${deterministicMatch ? 'YES' : 'NO'}`);
    console.log(`  Spatial/legacy parity: ${modeParity ? 'YES' : 'NO'}`);
    console.log(`  Spatial lookup speedup vs legacy: ${speedupPercent.toFixed(2)}%`);
    console.log('');
  }

  if (hasMismatch) {
    console.error('Deterministic benchmark failed: checksum mismatch detected between repeated spatial runs or spatial/legacy parity.');
    process.exitCode = 1;
    return;
  }

  console.log('Deterministic benchmark complete: all scenario checksums matched.');
}

runBenchmarks();
