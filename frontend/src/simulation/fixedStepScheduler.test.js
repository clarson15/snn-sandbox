import { describe, expect, it } from 'vitest';

import {
  computeFixedStepBudget,
  DEFAULT_MAX_CATCH_UP_FRAMES,
  resolveMaxCatchUpTicksPerFrame
} from './fixedStepScheduler';

describe('fixedStepScheduler', () => {
  it('converts elapsed wall time into deterministic fixed ticks', () => {
    const tickMs = 1000 / 30;

    const budget = computeFixedStepBudget({
      carriedMs: 0,
      elapsedMs: tickMs * 3.5,
      tickMs,
      speedMultiplier: 2,
      maxCatchUpTicksPerFrame: 20
    });

    expect(budget.ticksToProcess).toBe(6);
    expect(budget.clamped).toBe(false);
    expect(budget.droppedTicks).toBe(0);
    expect(budget.carriedMs).toBeCloseTo(tickMs * 0.5, 6);
  });

  it('clamps catch-up work deterministically when a frame is slow', () => {
    const tickMs = 1000 / 30;

    const budget = computeFixedStepBudget({
      carriedMs: 0,
      elapsedMs: tickMs * 20,
      tickMs,
      speedMultiplier: 1,
      maxCatchUpTicksPerFrame: 4
    });

    expect(budget.ticksToProcess).toBe(4);
    expect(budget.clamped).toBe(true);
    expect(budget.droppedTicks).toBe(16);
  });

  it('derives max per-frame budget from speed multiplier', () => {
    expect(resolveMaxCatchUpTicksPerFrame(1)).toBe(DEFAULT_MAX_CATCH_UP_FRAMES);
    expect(resolveMaxCatchUpTicksPerFrame(5)).toBe(DEFAULT_MAX_CATCH_UP_FRAMES * 5);
  });
});
