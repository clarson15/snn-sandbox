export const DEFAULT_MAX_CATCH_UP_FRAMES = 30;

export function resolveMaxCatchUpTicksPerFrame(speedMultiplier, maxCatchUpFrames = DEFAULT_MAX_CATCH_UP_FRAMES) {
  const normalizedSpeed = Number.isInteger(speedMultiplier) && speedMultiplier > 0 ? speedMultiplier : 1;
  const normalizedFrames = Number.isInteger(maxCatchUpFrames) && maxCatchUpFrames > 0 ? maxCatchUpFrames : DEFAULT_MAX_CATCH_UP_FRAMES;

  return normalizedSpeed * normalizedFrames;
}

export function computeFixedStepBudget({
  carriedMs = 0,
  elapsedMs,
  tickMs,
  speedMultiplier,
  maxCatchUpTicksPerFrame
}) {
  if (!Number.isFinite(elapsedMs) || elapsedMs <= 0 || !Number.isFinite(tickMs) || tickMs <= 0) {
    return {
      ticksToProcess: 0,
      carriedMs: Number.isFinite(carriedMs) && carriedMs > 0 ? carriedMs : 0,
      clamped: false,
      droppedTicks: 0
    };
  }

  const normalizedCarry = Number.isFinite(carriedMs) && carriedMs > 0 ? carriedMs : 0;
  const dueMs = normalizedCarry + elapsedMs;
  const baseSteps = Math.floor(dueMs / tickMs);
  const nextCarry = dueMs - (baseSteps * tickMs);
  const ticksDue = baseSteps * (Number.isInteger(speedMultiplier) && speedMultiplier > 0 ? speedMultiplier : 1);
  const maxTicks = Number.isInteger(maxCatchUpTicksPerFrame) && maxCatchUpTicksPerFrame > 0 ? maxCatchUpTicksPerFrame : ticksDue;
  const ticksToProcess = Math.min(ticksDue, maxTicks);
  const clamped = ticksDue > ticksToProcess;

  return {
    ticksToProcess,
    carriedMs: nextCarry,
    clamped,
    droppedTicks: clamped ? ticksDue - ticksToProcess : 0
  };
}
