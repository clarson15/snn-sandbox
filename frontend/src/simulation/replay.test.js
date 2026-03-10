import { describe, expect, it } from 'vitest';

import { env } from 'node:process';

import { createInitialWorldFromConfig, normalizeSimulationConfig, toEngineStepParams } from './config';
import { runTicks } from './engine';
import { createSeededPrng } from './prng';
import { replaySnapshotToTick } from './replay';
import { assertReplayDeterminismMatch, buildReplayDeterminismFingerprint } from './replayDeterminismDiagnostics';
import { REPLAY_PARITY_FIXTURES } from './replayParityFixtures';
import {
  assertReplayRuntimeBudgetWithinThreshold,
  readReplayRuntimeBudgetMs,
  measureReplayFixtureRuntimeMs
} from './replayRuntimeBudget';
import {
  buildReplayFixtureFailureRecord,
  formatReplayParityFailureSummary,
  writeReplayParityFailureSummary
} from './replayParityFailureSummary';

function hash(value) {
  return JSON.stringify(value);
}

describe('replaySnapshotToTick', () => {
  it('validates deterministic replay parity across a curated multi-fixture matrix', () => {
    const fixtureTimingsMs = [];
    const fixtureFailures = [];

    for (const fixture of REPLAY_PARITY_FIXTURES) {
      let fixtureFailure = null;

      const durationMs = measureReplayFixtureRuntimeMs(() => {
        const config = normalizeSimulationConfig(
          {
            name: `Determinism fixture: ${fixture.name}`,
            seed: fixture.seed,
            worldWidth: fixture.worldWidth,
            worldHeight: fixture.worldHeight,
            initialPopulation: fixture.initialPopulation,
            minimumPopulation: fixture.minimumPopulation,
            initialFoodCount: fixture.initialFoodCount,
            foodSpawnChance: fixture.foodSpawnChance,
            foodEnergyValue: fixture.foodEnergyValue,
            maxFood: fixture.maxFood,
            mutationRate: fixture.mutationRate,
            mutationStrength: fixture.mutationStrength
          },
          fixture.seed
        );

        const stepParams = toEngineStepParams(config);
        const baseWorldState = createInitialWorldFromConfig(config);

        const runA = runTicks(baseWorldState, createSeededPrng(config.resolvedSeed), fixture.tickBudget, stepParams);
        const runB = runTicks(baseWorldState, createSeededPrng(config.resolvedSeed), fixture.tickBudget, stepParams);

        const fingerprintA = buildReplayDeterminismFingerprint(runA);
        const fingerprintB = buildReplayDeterminismFingerprint(runB);

        if (fingerprintA !== fingerprintB) {
          fixtureFailure = buildReplayFixtureFailureRecord({
            fixtureName: fixture.name,
            seed: config.resolvedSeed,
            expectedWorldState: runB,
            actualWorldState: runA
          });
          return;
        }

        assertReplayDeterminismMatch({
          contextLabel: `fixture=${fixture.name}`,
          seed: config.resolvedSeed,
          stepParams,
          actualWorldState: runA,
          expectedWorldState: runB,
          actualFingerprint: fingerprintA,
          expectedFingerprint: fingerprintB
        });
        expect(fingerprintA).toBe(fingerprintB);
      });

      if (fixtureFailure) {
        fixtureFailures.push(fixtureFailure);
      }

      fixtureTimingsMs.push({ name: fixture.name, durationMs });
    }

    const budgetMs = readReplayRuntimeBudgetMs();
    const summary = assertReplayRuntimeBudgetWithinThreshold({ fixtureTimingsMs, budgetMs });

    if (fixtureFailures.length > 0) {
      const failureSummary = formatReplayParityFailureSummary(fixtureFailures);
      const outputPath = env.REPLAY_PARITY_FAILURE_SUMMARY_PATH ?? 'frontend/test-results/replay-parity-failure-summary.md';
      const resolvedPath = writeReplayParityFailureSummary(failureSummary, outputPath);
      throw new Error(`Replay parity fixture mismatches detected. Summary written to ${resolvedPath}\n${failureSummary}`);
    }

    // Stable output ordering comes from manifest order; values are fixed precision.
    console.info(summary.report);
  });

  it('smoke-tests same-seed replay determinism using a stable world snapshot contract', () => {
    const config = normalizeSimulationConfig(
      {
        name: 'Determinism smoke fixture',
        seed: 'same-seed-replay-smoke',
        worldWidth: 800,
        worldHeight: 480,
        initialPopulation: 24,
        minimumPopulation: 12,
        initialFoodCount: 35,
        foodSpawnChance: 0.05,
        foodEnergyValue: 6,
        maxFood: 140,
        mutationRate: 0.08,
        mutationStrength: 0.12
      },
      'same-seed-replay-smoke'
    );

    const stepParams = toEngineStepParams(config);
    const baseWorldState = createInitialWorldFromConfig(config);
    const fixedTickBudget = 120;

    const runA = runTicks(baseWorldState, createSeededPrng(config.resolvedSeed), fixedTickBudget, stepParams);
    const runB = runTicks(baseWorldState, createSeededPrng(config.resolvedSeed), fixedTickBudget, stepParams);

    // Snapshot contract (keep stable for CI smoke checks):
    // - populationCount and foodCount
    // - per-organism id + position + energy
    // - deterministic ordering by organism id before equality comparison
    // - precision-bounded numeric values for stable cross-platform diagnostics
    // Any non-deterministic source in the update path should change this snapshot and fail the test.
    const fingerprintA = buildReplayDeterminismFingerprint(runA);
    const fingerprintB = buildReplayDeterminismFingerprint(runB);

    assertReplayDeterminismMatch({
      contextLabel: 'same-seed replay smoke',
      seed: config.resolvedSeed,
      stepParams,
      actualWorldState: runA,
      expectedWorldState: runB,
      actualFingerprint: fingerprintA,
      expectedFingerprint: fingerprintB
    });
    expect(fingerprintA).toBe(fingerprintB);
  });

  it('diverges fingerprint output for different seeds in the replay smoke fixture', () => {
    const configA = normalizeSimulationConfig(
      {
        name: 'Determinism divergence fixture A',
        seed: 'same-seed-replay-smoke-A',
        worldWidth: 800,
        worldHeight: 480,
        initialPopulation: 24,
        minimumPopulation: 12,
        initialFoodCount: 35,
        foodSpawnChance: 0.05,
        foodEnergyValue: 6,
        maxFood: 140,
        mutationRate: 0.08,
        mutationStrength: 0.12
      },
      'same-seed-replay-smoke-A'
    );

    const configB = normalizeSimulationConfig(
      {
        ...configA,
        seed: 'same-seed-replay-smoke-B'
      },
      'same-seed-replay-smoke-B'
    );

    const fixedTickBudget = 120;
    const runA = runTicks(
      createInitialWorldFromConfig(configA),
      createSeededPrng(configA.resolvedSeed),
      fixedTickBudget,
      toEngineStepParams(configA)
    );
    const runB = runTicks(
      createInitialWorldFromConfig(configB),
      createSeededPrng(configB.resolvedSeed),
      fixedTickBudget,
      toEngineStepParams(configB)
    );

    const fingerprintA = buildReplayDeterminismFingerprint(runA);
    const fingerprintB = buildReplayDeterminismFingerprint(runB);

    expect(fingerprintA).not.toBe(fingerprintB);
  });

  it('replays deterministically to the same tick for identical seed + params + base snapshot', () => {
    const config = normalizeSimulationConfig(
      {
        name: 'Replay fixture',
        seed: 'replay-seed',
        worldWidth: 800,
        worldHeight: 480,
        initialPopulation: 12,
        initialFoodCount: 30,
        foodSpawnChance: 0.04,
        foodEnergyValue: 5,
        maxFood: 120
      },
      'replay-seed'
    );

    const stepParams = toEngineStepParams(config);
    const baseWorldState = createInitialWorldFromConfig(config);

    const baselineRng = createSeededPrng(config.resolvedSeed, 1234);
    const baselineWorldAt75 = runTicks(baseWorldState, baselineRng, 75, stepParams);

    const replayed = replaySnapshotToTick({
      baseWorldState,
      baseRngState: 1234,
      resolvedSeed: config.resolvedSeed,
      stepParams,
      targetTick: 75
    });

    expect(replayed.tick).toBe(75);
    expect(hash(replayed.worldState)).toEqual(hash(baselineWorldAt75));
  });

  it('clamps target ticks below the loaded snapshot tick', () => {
    const config = normalizeSimulationConfig(
      {
        name: 'Replay clamp fixture',
        seed: 'replay-clamp-seed',
        worldWidth: 800,
        worldHeight: 480,
        initialPopulation: 12,
        initialFoodCount: 30,
        foodSpawnChance: 0.04,
        foodEnergyValue: 5,
        maxFood: 120
      },
      'replay-clamp-seed'
    );

    const stepParams = toEngineStepParams(config);
    const startingWorld = createInitialWorldFromConfig(config);
    const warmupRng = createSeededPrng(config.resolvedSeed, 4567);
    const baseWorldState = runTicks(startingWorld, warmupRng, 20, stepParams);
    const baseRngState = warmupRng.getState();

    const replayed = replaySnapshotToTick({
      baseWorldState,
      baseRngState,
      resolvedSeed: config.resolvedSeed,
      stepParams,
      targetTick: 5
    });

    expect(replayed.clamped).toBe(true);
    expect(replayed.tick).toBe(20);
    expect(hash(replayed.worldState)).toEqual(hash(baseWorldState));
  });
});
