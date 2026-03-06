import { createWorldState, runTicks } from './engine';
import { createSeededPrng } from './prng';

export function clampReplayTick(targetTick, minimumTick) {
  const parsed = Number.parseInt(String(targetTick), 10);
  if (!Number.isFinite(parsed)) {
    return minimumTick;
  }

  return Math.max(minimumTick, parsed);
}

export function replaySnapshotToTick({ baseWorldState, baseRngState, resolvedSeed, stepParams, targetTick }) {
  const baseTick = baseWorldState.tick;
  const clampedTick = clampReplayTick(targetTick, baseTick);
  const ticksToAdvance = clampedTick - baseTick;

  const world = createWorldState(baseWorldState);
  const rng = createSeededPrng(resolvedSeed, baseRngState);
  const replayedWorld = ticksToAdvance > 0 ? runTicks(world, rng, ticksToAdvance, stepParams) : world;

  return {
    worldState: replayedWorld,
    rngState: rng.getState(),
    tick: replayedWorld.tick,
    clamped: clampedTick !== targetTick
  };
}
