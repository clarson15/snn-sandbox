function stableStringify(value) {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  }

  const keys = Object.keys(value).sort();
  const entries = keys.map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`);
  return `{${entries.join(',')}}`;
}

function hashStableValue(value) {
  const input = stableStringify(value);
  let hash = 2166136261;

  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }

  return (hash >>> 0).toString(16).padStart(8, '0');
}

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
  return stableStringify(buildReplayDeterminismSnapshot(worldState));
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
    paramsHash: hashStableValue(stepParams ?? null),
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

  return stableStringify(payload);
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
