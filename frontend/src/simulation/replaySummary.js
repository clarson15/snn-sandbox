const FALLBACKS = {
  seed: 'Unknown seed',
  simulationName: 'Unknown simulation',
  simulationId: 'Unknown simulation ID',
  tick: 'Unknown tick',
  duration: 'Unknown duration'
};

const CONTEXT_LABELS = {
  seed: 'seed',
  replayStartTick: 'replayStartTick',
  simulationParameters: 'simulationParameters'
};

function toNonEmptyString(value) {
  const normalized = String(value ?? '').trim();
  return normalized.length > 0 ? normalized : null;
}

function toTick(value) {
  return Number.isInteger(value) && value >= 0 ? value : null;
}

export function deriveSimulationParametersSignature(parameters) {
  if (!parameters || typeof parameters !== 'object') {
    return null;
  }

  return JSON.stringify({
    worldWidth: Number(parameters.worldWidth),
    worldHeight: Number(parameters.worldHeight),
    initialPopulation: Number(parameters.initialPopulation),
    initialFoodCount: Number(parameters.initialFoodCount),
    foodSpawnChance: Number(parameters.foodSpawnChance),
    foodEnergyValue: Number(parameters.foodEnergyValue),
    maxFood: Number(parameters.maxFood)
  });
}

function deriveReplayContextIndicator({ replaySnapshotMetadata, currentReplayContext }) {
  const differences = [];

  const replaySeed = toNonEmptyString(replaySnapshotMetadata?.seed);
  const currentSeed = toNonEmptyString(currentReplayContext?.seed);
  if (replaySeed !== currentSeed) {
    differences.push(CONTEXT_LABELS.seed);
  }

  const replayStartTick = toTick(replaySnapshotMetadata?.replayStartTick ?? replaySnapshotMetadata?.tickCount);
  const currentStartTick = toTick(currentReplayContext?.replayStartTick);
  if (replayStartTick !== currentStartTick) {
    differences.push(CONTEXT_LABELS.replayStartTick);
  }

  const replayParametersSignature = toNonEmptyString(replaySnapshotMetadata?.simulationParametersSignature);
  const currentParametersSignature = toNonEmptyString(currentReplayContext?.simulationParametersSignature);
  if (replayParametersSignature !== currentParametersSignature) {
    differences.push(CONTEXT_LABELS.simulationParameters);
  }

  return {
    contextLabel: differences.length === 0 ? 'Context Match' : 'Context Mismatch',
    contextDifferences: differences
  };
}

function deriveFirstMismatchTick(replaySnapshotMetadata, startTick) {
  const directTick = toTick(replaySnapshotMetadata?.firstMismatchTick);
  const comparisonTick = toTick(replaySnapshotMetadata?.comparison?.firstMismatchTick);
  const resolvedTick = directTick ?? comparisonTick;

  if (resolvedTick === null) {
    return null;
  }

  if (startTick !== null && resolvedTick < startTick) {
    return null;
  }

  return resolvedTick;
}

function toMismatchPath(mismatchPayload) {
  const directPath = toNonEmptyString(mismatchPayload?.path);
  const directKey = toNonEmptyString(mismatchPayload?.key);
  const comparedPath = toNonEmptyString(mismatchPayload?.comparedPath);
  const comparedKey = toNonEmptyString(mismatchPayload?.comparedKey);
  return directPath ?? directKey ?? comparedPath ?? comparedKey;
}

function toMismatchValue(value) {
  return value === undefined ? null : value;
}

function toMismatchDetails(replaySnapshotMetadata, firstMismatchTick, mismatchDetected) {
  const mismatchPayload = replaySnapshotMetadata?.comparison?.firstMismatch ?? replaySnapshotMetadata?.firstMismatch ?? null;
  const mismatchPath =
    toMismatchPath(mismatchPayload) ??
    toNonEmptyString(replaySnapshotMetadata?.comparison?.firstMismatchPath) ??
    toNonEmptyString(replaySnapshotMetadata?.comparison?.firstMismatchKey) ??
    toNonEmptyString(replaySnapshotMetadata?.firstMismatchPath) ??
    toNonEmptyString(replaySnapshotMetadata?.firstMismatchKey);

  const baselineValue =
    toMismatchValue(mismatchPayload?.baselineValue) ??
    toMismatchValue(replaySnapshotMetadata?.comparison?.baselineValue) ??
    toMismatchValue(replaySnapshotMetadata?.baselineValue);

  const comparisonValue =
    toMismatchValue(mismatchPayload?.comparisonValue) ??
    toMismatchValue(mismatchPayload?.currentValue) ??
    toMismatchValue(replaySnapshotMetadata?.comparison?.comparisonValue) ??
    toMismatchValue(replaySnapshotMetadata?.comparison?.currentValue) ??
    toMismatchValue(replaySnapshotMetadata?.comparisonValue) ??
    toMismatchValue(replaySnapshotMetadata?.currentValue);

  const entityId =
    toNonEmptyString(mismatchPayload?.entityId) ??
    toNonEmptyString(replaySnapshotMetadata?.comparison?.firstMismatchEntityId) ??
    toNonEmptyString(replaySnapshotMetadata?.firstMismatchEntityId);

  const hasMismatchContext = mismatchDetected && firstMismatchTick !== null && mismatchPath !== null && baselineValue !== null && comparisonValue !== null;
  if (!hasMismatchContext) {
    return null;
  }

  const numericBaseline = typeof baselineValue === 'number' && Number.isFinite(baselineValue) ? baselineValue : null;
  const numericComparison = typeof comparisonValue === 'number' && Number.isFinite(comparisonValue) ? comparisonValue : null;

  return {
    tick: firstMismatchTick,
    path: mismatchPath,
    entityId,
    baselineValue,
    comparisonValue,
    absoluteDelta:
      numericBaseline !== null && numericComparison !== null
        ? Math.abs(numericComparison - numericBaseline)
        : null
  };
}

export function formatMismatchDisplayValue(value) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Number.isInteger(value) ? String(value) : value.toFixed(3);
  }

  if (typeof value === 'string') {
    return value;
  }

  return JSON.stringify(value);
}

export function deriveReplaySummaryStrip({ replaySnapshotMetadata, replayTick, currentReplayContext }) {
  const startTick = toTick(replaySnapshotMetadata?.tickCount);
  const endTick = toTick(replayTick);

  const normalizedEndTick = endTick ?? startTick;
  const contextIndicator = deriveReplayContextIndicator({ replaySnapshotMetadata, currentReplayContext });
  const firstMismatchTick = deriveFirstMismatchTick(replaySnapshotMetadata, startTick);
  const mismatchDetected =
    contextIndicator.contextDifferences.length > 0 ||
    replaySnapshotMetadata?.mismatchDetected === true ||
    replaySnapshotMetadata?.comparison?.mismatchDetected === true ||
    firstMismatchTick !== null;
  const mismatchDetails = toMismatchDetails(replaySnapshotMetadata, firstMismatchTick, mismatchDetected);

  return {
    seed: toNonEmptyString(replaySnapshotMetadata?.seed) ?? FALLBACKS.seed,
    simulationName: toNonEmptyString(replaySnapshotMetadata?.name) ?? FALLBACKS.simulationName,
    simulationId: toNonEmptyString(replaySnapshotMetadata?.id) ?? FALLBACKS.simulationId,
    startTick: startTick ?? FALLBACKS.tick,
    endTick: normalizedEndTick ?? FALLBACKS.tick,
    durationTicks:
      startTick !== null && normalizedEndTick !== null
        ? Math.max(0, normalizedEndTick - startTick)
        : FALLBACKS.duration,
    firstMismatchTick,
    mismatchDetected,
    mismatchDetails,
    canJumpToFirstMismatch: mismatchDetected && firstMismatchTick !== null,
    ...contextIndicator
  };
}
