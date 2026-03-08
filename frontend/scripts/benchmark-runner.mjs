import { performance } from 'node:perf_hooks';
import { createInitialWorldFromConfig, DEFAULT_CONFIG, normalizeSimulationConfig, toEngineStepParams } from '../src/simulation/config.js';
import { createSeededPrng } from '../src/simulation/prng.js';
import { stepWorld } from '../src/simulation/engine.js';

export const DEFAULT_BENCHMARK_TICKS = 300;

export const DEFAULT_SCENARIOS = [
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

function executeScenarioRun(scenario, interactionLookupMode, ticks) {
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
  for (let tick = 0; tick < ticks; tick += 1) {
    world = stepWorld(world, rng, stepParams);
  }
  const elapsedMs = performance.now() - startedAt;

  return {
    elapsedMs,
    averageTickMs: elapsedMs / ticks,
    ticksPerSecond: 1000 / (elapsedMs / ticks),
    checksum: checksum({ world, rngState: rng.state })
  };
}

export function runBenchmarkSuite({ ticks = DEFAULT_BENCHMARK_TICKS, scenarios = DEFAULT_SCENARIOS } = {}) {
  const scenarioResults = scenarios.map((scenario) => {
    const candidateRunA = executeScenarioRun(scenario, 'spatial', ticks);
    const candidateRunB = executeScenarioRun(scenario, 'spatial', ticks);
    const baselineRun = executeScenarioRun(scenario, 'legacy', ticks);

    const deterministicMatch = candidateRunA.checksum === candidateRunB.checksum;
    const modeParity = candidateRunA.checksum === baselineRun.checksum;
    const speedupPercent = ((baselineRun.averageTickMs - candidateRunA.averageTickMs) / baselineRun.averageTickMs) * 100;

    return {
      scenario: {
        name: scenario.name,
        seed: scenario.seed,
        initialPopulation: scenario.initialPopulation
      },
      candidate: {
        runA: candidateRunA,
        runB: candidateRunB
      },
      baseline: {
        run: baselineRun
      },
      deterministicMatch,
      modeParity,
      speedupPercent
    };
  });

  const hasMismatch = scenarioResults.some((result) => !result.deterministicMatch || !result.modeParity);

  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    ticks,
    summary: {
      scenarioCount: scenarioResults.length,
      hasMismatch
    },
    scenarios: scenarioResults
  };
}

export function createComparisonReport({ baselineReport, candidateReport, regressionThresholdPercent = 10 } = {}) {
  const baselineByName = new Map((baselineReport?.scenarios ?? []).map((scenario) => [scenario.scenario.name, scenario]));

  const scenarios = candidateReport.scenarios.map((candidateScenario) => {
    const baselineScenario = baselineByName.get(candidateScenario.scenario.name);
    const candidateAvgTickMs = candidateScenario.candidate.runA.averageTickMs;
    const baselineAvgTickMs = baselineScenario?.candidate?.runA?.averageTickMs ?? null;

    const deltaAvgTickMs = baselineAvgTickMs == null ? null : candidateAvgTickMs - baselineAvgTickMs;
    const deltaPercent = baselineAvgTickMs == null ? null : (deltaAvgTickMs / baselineAvgTickMs) * 100;
    const isRegression = deltaPercent != null && deltaPercent > regressionThresholdPercent;

    return {
      ...candidateScenario,
      comparison: {
        baselineAvgTickMs,
        candidateAvgTickMs,
        candidateTicksPerSecond: candidateScenario.candidate.runA.ticksPerSecond,
        deltaAvgTickMs,
        deltaPercent,
        regressionThresholdPercent,
        isRegression
      }
    };
  });

  return {
    schemaVersion: 1,
    generatedAt: candidateReport.generatedAt,
    ticks: candidateReport.ticks,
    summary: {
      scenarioCount: scenarios.length,
      hasMismatch: candidateReport.summary.hasMismatch,
      regressionCount: scenarios.filter((scenario) => scenario.comparison.isRegression).length
    },
    scenarios
  };
}

function createEmptyBudgetEvaluation() {
  return {
    isWithinBudget: true,
    configured: false,
    maxAverageTickMs: null,
    minTicksPerSecond: null,
    violations: []
  };
}

function evaluateScenarioBudget(scenarioName, candidateRun, budgetConfig) {
  const scenarioBudget = budgetConfig?.scenarios?.[scenarioName];
  if (!scenarioBudget) {
    return createEmptyBudgetEvaluation();
  }

  const violations = [];
  if (typeof scenarioBudget.maxAverageTickMs === 'number' && candidateRun.averageTickMs > scenarioBudget.maxAverageTickMs) {
    violations.push(`avg/tick ${candidateRun.averageTickMs.toFixed(3)}ms > max ${scenarioBudget.maxAverageTickMs.toFixed(3)}ms`);
  }

  if (typeof scenarioBudget.minTicksPerSecond === 'number' && candidateRun.ticksPerSecond < scenarioBudget.minTicksPerSecond) {
    violations.push(`ticks/sec ${candidateRun.ticksPerSecond.toFixed(2)} < min ${scenarioBudget.minTicksPerSecond.toFixed(2)}`);
  }

  return {
    isWithinBudget: violations.length === 0,
    configured: true,
    maxAverageTickMs: typeof scenarioBudget.maxAverageTickMs === 'number' ? scenarioBudget.maxAverageTickMs : null,
    minTicksPerSecond: typeof scenarioBudget.minTicksPerSecond === 'number' ? scenarioBudget.minTicksPerSecond : null,
    violations
  };
}

export function applyPerformanceBudgets(report, budgetConfig) {
  const scenarios = report.scenarios.map((scenarioEntry) => {
    const budget = evaluateScenarioBudget(scenarioEntry.scenario.name, scenarioEntry.candidate.runA, budgetConfig);
    return {
      ...scenarioEntry,
      comparison: {
        ...scenarioEntry.comparison,
        budget
      }
    };
  });

  return {
    ...report,
    budgetConfig: budgetConfig
      ? {
          schemaVersion: budgetConfig.schemaVersion,
          name: budgetConfig.name ?? null,
          ticks: budgetConfig.ticks ?? null
        }
      : null,
    summary: {
      ...report.summary,
      budgetFailureCount: scenarios.filter((scenario) => !scenario.comparison.budget.isWithinBudget).length
    },
    scenarios
  };
}
