const FALLBACKS = {
  seed: 'Unknown seed',
  simulationName: 'Unknown simulation',
  simulationId: 'Unknown simulation ID',
  tick: 'Unknown tick',
  duration: 'Unknown duration'
};

function toNonEmptyString(value) {
  const normalized = String(value ?? '').trim();
  return normalized.length > 0 ? normalized : null;
}

function toTick(value) {
  return Number.isInteger(value) && value >= 0 ? value : null;
}

export function deriveReplaySummaryStrip({ replaySnapshotMetadata, replayTick }) {
  const startTick = toTick(replaySnapshotMetadata?.tickCount);
  const endTick = toTick(replayTick);

  const normalizedEndTick = endTick ?? startTick;

  return {
    seed: toNonEmptyString(replaySnapshotMetadata?.seed) ?? FALLBACKS.seed,
    simulationName: toNonEmptyString(replaySnapshotMetadata?.name) ?? FALLBACKS.simulationName,
    simulationId: toNonEmptyString(replaySnapshotMetadata?.id) ?? FALLBACKS.simulationId,
    startTick: startTick ?? FALLBACKS.tick,
    endTick: normalizedEndTick ?? FALLBACKS.tick,
    durationTicks:
      startTick !== null && normalizedEndTick !== null
        ? Math.max(0, normalizedEndTick - startTick)
        : FALLBACKS.duration
  };
}
