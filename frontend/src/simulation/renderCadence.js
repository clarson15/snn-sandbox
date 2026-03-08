const RENDER_CADENCE_BY_SPEED = [
  { minSpeed: 10, frameInterval: 4 },
  { minSpeed: 5, frameInterval: 3 },
  { minSpeed: 2, frameInterval: 2 }
];

export function resolveRenderFrameInterval(speedMultiplier) {
  if (!Number.isFinite(speedMultiplier) || speedMultiplier <= 1) {
    return 1;
  }

  for (const policy of RENDER_CADENCE_BY_SPEED) {
    if (speedMultiplier >= policy.minSpeed) {
      return policy.frameInterval;
    }
  }

  return 1;
}

export function shouldRenderFrame(frameNumber, frameInterval) {
  if (!Number.isInteger(frameNumber) || frameNumber < 0) {
    return true;
  }

  if (!Number.isInteger(frameInterval) || frameInterval <= 1) {
    return true;
  }

  return frameNumber % frameInterval === 0;
}
