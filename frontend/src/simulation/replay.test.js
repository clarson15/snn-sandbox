import { describe, expect, it } from 'vitest';

import { env } from 'node:process';

import { createInitialWorldFromConfig, normalizeSimulationConfig, toEngineStepParams } from './config';
import { runTicks, stepWorld } from './engine';
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

function roundForResumeParity(value, precision = 6) {
  if (!Number.isFinite(value)) {
    return value;
  }

  return Number(value.toFixed(precision));
}

function buildSaveResumeParitySnapshot({ worldState, rngState, resolvedSeed }) {
  const organisms = [...(worldState?.organisms ?? [])]
    .map((organism) => ({
      id: organism.id,
      x: roundForResumeParity(organism.x),
      y: roundForResumeParity(organism.y),
      direction: roundForResumeParity(organism.direction ?? 0),
      energy: roundForResumeParity(organism.energy),
      age: Number(organism.age ?? 0),
      generation: Number(organism.generation ?? 0)
    }))
    .sort((left, right) => left.id.localeCompare(right.id));

  const food = [...(worldState?.food ?? [])]
    .map((item) => ({
      id: item.id,
      x: roundForResumeParity(item.x),
      y: roundForResumeParity(item.y),
      energyValue: roundForResumeParity(item.energyValue)
    }))
    .sort((left, right) => left.id.localeCompare(right.id));

  return {
    tick: Number(worldState?.tick ?? 0),
    resolvedSeed: String(resolvedSeed ?? ''),
    rngState,
    organisms,
    food
  };
}

function collectParityDiffPaths(actual, expected, basePath = 'snapshot', acc = []) {
  if (actual === expected) {
    return acc;
  }

  const actualType = Object.prototype.toString.call(actual);
  const expectedType = Object.prototype.toString.call(expected);

  if (actualType !== expectedType) {
    acc.push(`${basePath} type mismatch: actual=${actualType} expected=${expectedType}`);
    return acc;
  }

  if (actual === null || expected === null || typeof actual !== 'object') {
    acc.push(`${basePath} value mismatch: actual=${JSON.stringify(actual)} expected=${JSON.stringify(expected)}`);
    return acc;
  }

  const keySet = new Set([...Object.keys(actual), ...Object.keys(expected)]);
  const keys = [...keySet].sort();

  for (const key of keys) {
    const childPath = Array.isArray(actual) ? `${basePath}[${key}]` : `${basePath}.${key}`;

    if (!(key in actual)) {
      acc.push(`${childPath} missing in actual`);
      continue;
    }

    if (!(key in expected)) {
      acc.push(`${childPath} missing in expected`);
      continue;
    }

    collectParityDiffPaths(actual[key], expected[key], childPath, acc);

    if (acc.length >= 12) {
      break;
    }
  }

  return acc;
}

function buildMinimumPopulationRecoveryParitySnapshot(worldState) {
  const organisms = [...(worldState?.organisms ?? [])]
    .map((organism) => ({
      id: organism.id,
      generation: Number(organism.generation ?? 0),
      traits: {
        size: roundForResumeParity(organism?.traits?.size),
        speed: roundForResumeParity(organism?.traits?.speed),
        visionRange: roundForResumeParity(organism?.traits?.visionRange),
        turnRate: roundForResumeParity(organism?.traits?.turnRate),
        metabolism: roundForResumeParity(organism?.traits?.metabolism)
      }
    }))
    .sort((left, right) => left.id.localeCompare(right.id));

  return {
    tick: Number(worldState?.tick ?? 0),
    populationCount: organisms.length,
    foodCount: Number(worldState?.food?.length ?? 0),
    organisms
  };
}

function collectMinimumPopulationRecoveryTimeline({ baseWorldState, seed, tickBudget, stepParams }) {
  const rng = createSeededPrng(seed);
  let worldState = JSON.parse(JSON.stringify(baseWorldState));
  const timeline = [];

  for (let tick = 0; tick < tickBudget; tick += 1) {
    worldState = stepWorld(worldState, rng, stepParams);
    timeline.push(buildMinimumPopulationRecoveryParitySnapshot(worldState));
  }

  return timeline;
}

function collectReplayMilestoneSnapshots({ baseWorldState, seed, stepParams, checkpointTicks }) {
  const checkpoints = [...new Set((checkpointTicks ?? []).filter((tick) => Number.isInteger(tick) && tick > 0))]
    .sort((left, right) => left - right);

  if (checkpoints.length === 0) {
    return {
      snapshots: [],
      finalWorldState: JSON.parse(JSON.stringify(baseWorldState))
    };
  }

  const maxTick = checkpoints[checkpoints.length - 1];
  const checkpointSet = new Set(checkpoints);
  const rng = createSeededPrng(seed);
  let worldState = JSON.parse(JSON.stringify(baseWorldState));
  const snapshots = [];

  for (let tick = 1; tick <= maxTick; tick += 1) {
    worldState = stepWorld(worldState, rng, stepParams);

    if (!checkpointSet.has(tick)) {
      continue;
    }

    snapshots.push({
      tick,
      worldState: JSON.parse(JSON.stringify(worldState)),
      fingerprint: buildReplayDeterminismFingerprint(worldState)
    });
  }

  return {
    snapshots,
    finalWorldState: JSON.parse(JSON.stringify(worldState))
  };
}

function withForbiddenAmbientRandomnessApisBlocked(work) {
  const originalMathRandom = Math.random;
  const originalDateNow = Date.now;

  Math.random = () => {
    throw new Error('Determinism violation: Math.random() was called during replay parity fixture execution.');
  };

  Date.now = () => {
    throw new Error('Determinism violation: Date.now() was called during replay parity fixture execution.');
  };

  try {
    return work();
  } finally {
    Math.random = originalMathRandom;
    Date.now = originalDateNow;
  }
}

describe('replaySnapshotToTick', () => {
  it('validates deterministic replay parity across a curated multi-fixture matrix', () => {
    const fixtureTimingsMs = [];
    const fixtureFailures = [];

    for (const fixture of REPLAY_PARITY_FIXTURES) {
      let fixtureFailure = null;

      const durationMs = measureReplayFixtureRuntimeMs(() => withForbiddenAmbientRandomnessApisBlocked(() => {
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

        const hasMilestoneCheckpoints = Array.isArray(fixture.checkpointTicks) && fixture.checkpointTicks.length > 0;

        let runA;
        let runB;
        let milestoneSnapshotsA = [];
        let milestoneSnapshotsB = [];

        if (hasMilestoneCheckpoints) {
          const milestonesAResult = collectReplayMilestoneSnapshots({
            baseWorldState,
            seed: config.resolvedSeed,
            stepParams,
            checkpointTicks: fixture.checkpointTicks
          });
          const milestonesBResult = collectReplayMilestoneSnapshots({
            baseWorldState,
            seed: config.resolvedSeed,
            stepParams,
            checkpointTicks: fixture.checkpointTicks
          });

          milestoneSnapshotsA = milestonesAResult.snapshots;
          milestoneSnapshotsB = milestonesBResult.snapshots;
          runA = milestonesAResult.finalWorldState;
          runB = milestonesBResult.finalWorldState;
        } else {
          runA = runTicks(baseWorldState, createSeededPrng(config.resolvedSeed), fixture.tickBudget, stepParams);
          runB = runTicks(baseWorldState, createSeededPrng(config.resolvedSeed), fixture.tickBudget, stepParams);
        }

        const fingerprintA = buildReplayDeterminismFingerprint(runA);
        const fingerprintB = buildReplayDeterminismFingerprint(runB);

        if (fingerprintA !== fingerprintB) {
          fixtureFailure = buildReplayFixtureFailureRecord({
            fixtureName: `${fixture.name} [phase=pre-save]`,
            seed: config.resolvedSeed,
            expectedWorldState: runB,
            actualWorldState: runA
          });
          return;
        }

        assertReplayDeterminismMatch({
          contextLabel: `fixture=${fixture.name} phase=pre-save`,
          seed: config.resolvedSeed,
          stepParams,
          actualWorldState: runA,
          expectedWorldState: runB,
          actualFingerprint: fingerprintA,
          expectedFingerprint: fingerprintB
        });
        expect(fingerprintA).toBe(fingerprintB);

        if (hasMilestoneCheckpoints) {
          for (let index = 0; index < milestoneSnapshotsA.length; index += 1) {
            const actualMilestone = milestoneSnapshotsA[index];
            const expectedMilestone = milestoneSnapshotsB[index];

            if (!actualMilestone || !expectedMilestone || actualMilestone.tick !== expectedMilestone.tick) {
              fixtureFailure = buildReplayFixtureFailureRecord({
                fixtureName: `${fixture.name} [phase=milestone-checkpoint]`,
                fixtureId: fixture.name,
                seed: config.resolvedSeed,
                milestoneTick: actualMilestone?.tick ?? expectedMilestone?.tick ?? null,
                expectedWorldState: expectedMilestone?.worldState ?? runB,
                actualWorldState: actualMilestone?.worldState ?? runA,
                expectedFingerprint: expectedMilestone?.fingerprint,
                actualFingerprint: actualMilestone?.fingerprint
              });
              return;
            }

            if (actualMilestone.fingerprint !== expectedMilestone.fingerprint) {
              fixtureFailure = buildReplayFixtureFailureRecord({
                fixtureName: `${fixture.name} [phase=milestone-checkpoint]`,
                fixtureId: fixture.name,
                seed: config.resolvedSeed,
                milestoneTick: actualMilestone.tick,
                expectedWorldState: expectedMilestone.worldState,
                actualWorldState: actualMilestone.worldState,
                expectedFingerprint: expectedMilestone.fingerprint,
                actualFingerprint: actualMilestone.fingerprint
              });
              return;
            }
          }
        }

        if (fixture.name === 'minimum-population-recovery') {
          const timelineA = collectMinimumPopulationRecoveryTimeline({
            baseWorldState,
            seed: config.resolvedSeed,
            tickBudget: fixture.tickBudget,
            stepParams
          });
          const timelineB = collectMinimumPopulationRecoveryTimeline({
            baseWorldState,
            seed: config.resolvedSeed,
            tickBudget: fixture.tickBudget,
            stepParams
          });

          expect(timelineA).toEqual(timelineB);

          const floorTriggered = timelineA.some((snapshot) => snapshot.populationCount === fixture.minimumPopulation);
          expect(floorTriggered).toBe(true);
        }

        if (Number.isInteger(fixture.saveTick) && Number.isInteger(fixture.resumeTickBudget) && fixture.saveTick > 0 && fixture.resumeTickBudget > 0) {
          const baselineRng = createSeededPrng(config.resolvedSeed);
          const baselineFinal = runTicks(baseWorldState, baselineRng, fixture.saveTick + fixture.resumeTickBudget, stepParams);

          const saveRng = createSeededPrng(config.resolvedSeed);
          const worldAtSave = runTicks(baseWorldState, saveRng, fixture.saveTick, stepParams);
          const persistedSnapshot = JSON.parse(JSON.stringify(worldAtSave));
          const persistedRngState = saveRng.getState();

          const resumedRng = createSeededPrng(config.resolvedSeed, persistedRngState);
          const resumedFinal = runTicks(persistedSnapshot, resumedRng, fixture.resumeTickBudget, stepParams);

          const resumedFingerprint = buildReplayDeterminismFingerprint(resumedFinal);
          const baselineFingerprint = buildReplayDeterminismFingerprint(baselineFinal);

          if (resumedFingerprint !== baselineFingerprint) {
            fixtureFailure = buildReplayFixtureFailureRecord({
              fixtureName: `${fixture.name} [phase=post-resume]`,
              seed: config.resolvedSeed,
              expectedWorldState: baselineFinal,
              actualWorldState: resumedFinal
            });
            return;
          }

          assertReplayDeterminismMatch({
            contextLabel: `fixture=${fixture.name} phase=post-resume saveTick=${fixture.saveTick} resumeTicks=${fixture.resumeTickBudget}`,
            seed: config.resolvedSeed,
            stepParams,
            actualWorldState: resumedFinal,
            expectedWorldState: baselineFinal,
            actualFingerprint: resumedFingerprint,
            expectedFingerprint: baselineFingerprint
          });
          expect(resumedFingerprint).toBe(baselineFingerprint);
        }
      }));

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

  it('preserves replay-equivalent state when resuming from a persisted save snapshot', () => {
    const config = normalizeSimulationConfig(
      {
        name: 'Save resume replay parity fixture',
        seed: 'save-resume-parity-seed',
        worldWidth: 800,
        worldHeight: 480,
        initialPopulation: 20,
        minimumPopulation: 10,
        initialFoodCount: 25,
        foodSpawnChance: 0.05,
        foodEnergyValue: 6,
        maxFood: 150,
        mutationRate: 0.08,
        mutationStrength: 0.12
      },
      'save-resume-parity-seed'
    );

    const stepParams = toEngineStepParams(config);
    const baseWorldState = createInitialWorldFromConfig(config);
    const saveTick = 60;
    const finalTick = 120;

    const uninterruptedRng = createSeededPrng(config.resolvedSeed);
    const uninterruptedFinalWorld = runTicks(baseWorldState, uninterruptedRng, finalTick, stepParams);

    const saveRunRng = createSeededPrng(config.resolvedSeed);
    const worldAtSave = runTicks(baseWorldState, saveRunRng, saveTick, stepParams);
    const persistedWorldSnapshot = JSON.parse(JSON.stringify(worldAtSave));
    const persistedRngState = saveRunRng.getState();

    const resumedRng = createSeededPrng(config.resolvedSeed, persistedRngState);
    const resumedFinalWorld = runTicks(
      persistedWorldSnapshot,
      resumedRng,
      finalTick - saveTick,
      stepParams
    );

    // Invariant: save/load resume must be replay-equivalent to uninterrupted deterministic execution.
    const actualSnapshot = buildSaveResumeParitySnapshot({
      worldState: resumedFinalWorld,
      rngState: resumedRng.getState(),
      resolvedSeed: config.resolvedSeed
    });
    const expectedSnapshot = buildSaveResumeParitySnapshot({
      worldState: uninterruptedFinalWorld,
      rngState: uninterruptedRng.getState(),
      resolvedSeed: config.resolvedSeed
    });

    const mismatchPaths = collectParityDiffPaths(actualSnapshot, expectedSnapshot);
    if (mismatchPaths.length > 0) {
      throw new Error(
        `Save/resume replay parity mismatch for seed ${config.resolvedSeed}. ` +
          `Differences:\n- ${mismatchPaths.join('\n- ')}`
      );
    }

    expect(actualSnapshot).toEqual(expectedSnapshot);
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
