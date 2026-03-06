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

export function deriveReplaySummaryStrip({ replaySnapshotMetadata, replayTick, currentReplayContext }) {
  const startTick = toTick(replaySnapshotMetadata?.tickCount);
  const endTick = toTick(replayTick);

  const normalizedEndTick = endTick ?? startTick;
  const contextIndicator = deriveReplayContextIndicator({ replaySnapshotMetadata, currentReplayContext });

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
    ...contextIndicator
  };
}
