import { describe, expect, it } from 'vitest';

import { createSeededPrng, normalizeSeed } from './prng';

describe('normalizeSeed', () => {
  it('normalizes number seeds into uint32 values', () => {
    expect(normalizeSeed(42)).toBe(42);
    expect(normalizeSeed(-1)).toBe(0xffffffff);
  });

  it('normalizes string seeds deterministically', () => {
    expect(normalizeSeed('alpha-seed')).toBe(normalizeSeed('alpha-seed'));
    expect(normalizeSeed('alpha-seed')).not.toBe(normalizeSeed('beta-seed'));
  });
});

describe('createSeededPrng', () => {
  it('produces identical float sequences for the same seed', () => {
    const a = createSeededPrng('same-seed');
    const b = createSeededPrng('same-seed');

    const seqA = Array.from({ length: 12 }, () => a.nextFloat());
    const seqB = Array.from({ length: 12 }, () => b.nextFloat());

    expect(seqA).toEqual(seqB);
  });

  it('produces different sequences for different seeds', () => {
    const a = createSeededPrng('seed-a');
    const b = createSeededPrng('seed-b');

    const seqA = Array.from({ length: 12 }, () => a.nextFloat());
    const seqB = Array.from({ length: 12 }, () => b.nextFloat());

    expect(seqA).not.toEqual(seqB);
  });

  it('nextFloat returns values in [0, 1)', () => {
    const prng = createSeededPrng('float-range');

    for (let i = 0; i < 200; i += 1) {
      const value = prng.nextFloat();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  it('nextInt returns integers in [min, maxExclusive)', () => {
    const prng = createSeededPrng('int-range');

    for (let i = 0; i < 200; i += 1) {
      const value = prng.nextInt(-5, 7);
      expect(Number.isInteger(value)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(-5);
      expect(value).toBeLessThan(7);
    }
  });

  it('nextInt throws for invalid bounds', () => {
    const prng = createSeededPrng('invalid-bounds');

    expect(() => prng.nextInt(5, 5)).toThrow(RangeError);
    expect(() => prng.nextInt(0.1, 5)).toThrow(TypeError);
  });

  it('restores sequence continuity from persisted internal state', () => {
    const baseline = createSeededPrng('resume-seed');
    const prefix = Array.from({ length: 25 }, () => baseline.nextFloat());
    const persistedState = baseline.getState();
    const nextFromBaseline = Array.from({ length: 20 }, () => baseline.nextFloat());

    const resumed = createSeededPrng('resume-seed', persistedState);
    const nextFromResumed = Array.from({ length: 20 }, () => resumed.nextFloat());

    expect(prefix.length).toBe(25);
    expect(nextFromResumed).toEqual(nextFromBaseline);
  });
});
