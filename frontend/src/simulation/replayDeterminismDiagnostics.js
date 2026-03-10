import { hashStableCanonicalValue, stableCanonicalStringify } from './replayCanonicalization';

function roundForFingerprint(value, precision = 6) {
  if (!Number.isFinite(value)) {
    return value;
  }

  return Number(value.toFixed(precision));
}

export function buildReplayDeterminismSnapshot(worldState) {
  const organisms = [...(worldState?.organisms ?? [])]
    .map((organism) => ({
      id: organism.id,
      x: roundForFingerprint(organism.x),
      y: roundForFingerprint(organism.y),
      energy: roundForFingerprint(organism.energy)
    }))
    .sort((left, right) => left.id.localeCompare(right.id));

  return {
    tick: Number(worldState?.tick ?? 0),
    populationCount: organisms.length,
    foodCount: worldState?.food?.length ?? 0,
    organisms
  };
}

export function buildReplayDeterminismFingerprint(worldState) {
  return stableCanonicalStringify(buildReplayDeterminismSnapshot(worldState));
}

function toFingerprintSegments(fingerprint, segmentLength = 48) {
  const normalized = String(fingerprint ?? '');
  return {
    length: normalized.length,
    head: normalized.slice(0, segmentLength),
    tail: normalized.slice(Math.max(normalized.length - segmentLength, 0))
  };
}

export function formatReplayDeterminismMismatchContext({
  contextLabel,
  seed,
  stepParams,
  actualWorldState,
  expectedWorldState,
  actualFingerprint,
  expectedFingerprint
}) {
  const actualSnapshot = buildReplayDeterminismSnapshot(actualWorldState);
  const expectedSnapshot = buildReplayDeterminismSnapshot(expectedWorldState);
  const actualSegments = toFingerprintSegments(actualFingerprint);
  const expectedSegments = toFingerprintSegments(expectedFingerprint);

  const payload = {
    contextLabel: String(contextLabel ?? ''),
    seed: String(seed ?? ''),
    paramsHash: hashStableCanonicalValue(stepParams ?? null),
    actual: {
      tick: actualSnapshot.tick,
      populationCount: actualSnapshot.populationCount,
      foodCount: actualSnapshot.foodCount,
      fingerprintLength: actualSegments.length,
      fingerprintHead: actualSegments.head,
      fingerprintTail: actualSegments.tail
    },
    expected: {
      tick: expectedSnapshot.tick,
      populationCount: expectedSnapshot.populationCount,
      foodCount: expectedSnapshot.foodCount,
      fingerprintLength: expectedSegments.length,
      fingerprintHead: expectedSegments.head,
      fingerprintTail: expectedSegments.tail
    }
  };

  return stableCanonicalStringify(payload);
}

function buildTickSequence(maxTick, checkpointInterval) {
  const normalizedMaxTick = Number.isInteger(maxTick) ? maxTick : Number.parseInt(maxTick ?? 0, 10);
  const normalizedInterval = Number.isInteger(checkpointInterval) && checkpointInterval > 0 ? checkpointInterval : 25;

  if (normalizedMaxTick <= 0) {
    return [];
  }

  const ticks = [];
  for (let tick = normalizedInterval; tick < normalizedMaxTick; tick += normalizedInterval) {
    ticks.push(tick);
  }

  ticks.push(normalizedMaxTick);
  return ticks;
}

export function locateFirstDivergenceTick({
  maxTick,
  checkpointInterval = 25,
  getExpectedWorldStateAtTick,
  getActualWorldStateAtTick
}) {
  if (typeof getExpectedWorldStateAtTick !== 'function' || typeof getActualWorldStateAtTick !== 'function') {
    throw new Error('locateFirstDivergenceTick requires getExpectedWorldStateAtTick and getActualWorldStateAtTick callbacks.');
  }

  const checkpoints = buildTickSequence(maxTick, checkpointInterval);
  if (checkpoints.length === 0) {
    return null;
  }

  const comparisonCache = new Map();
  const compareTick = (tick) => {
    if (comparisonCache.has(tick)) {
      return comparisonCache.get(tick);
    }

    const expectedFingerprint = buildReplayDeterminismFingerprint(getExpectedWorldStateAtTick(tick));
    const actualFingerprint = buildReplayDeterminismFingerprint(getActualWorldStateAtTick(tick));
    const matches = expectedFingerprint === actualFingerprint;
    comparisonCache.set(tick, matches);
    return matches;
  };

  let lowerBound = 1;
  let upperBound = null;

  for (const checkpointTick of checkpoints) {
    if (compareTick(checkpointTick)) {
      lowerBound = checkpointTick + 1;
      continue;
    }

    upperBound = checkpointTick;
    break;
  }

  if (upperBound === null) {
    return null;
  }

  let left = lowerBound;
  let right = upperBound;
  while (left < right) {
    const midpoint = Math.floor((left + right) / 2);
    if (compareTick(midpoint)) {
      left = midpoint + 1;
    } else {
      right = midpoint;
    }
  }

  return left;
}

export function assertReplayDeterminismMatch({
  contextLabel,
  seed,
  stepParams,
  actualWorldState,
  expectedWorldState,
  actualFingerprint,
  expectedFingerprint
}) {
  if (actualFingerprint === expectedFingerprint) {
    return;
  }

  const context = formatReplayDeterminismMismatchContext({
    contextLabel,
    seed,
    stepParams,
    actualWorldState,
    expectedWorldState,
    actualFingerprint,
    expectedFingerprint
  });

  throw new Error(`Determinism fingerprint mismatch\n${context}`);
}
