/**
 * Deterministic simulation PRNG.
 *
 * Use this for all simulation randomness so runs are reproducible for the same
 * seed + simulation parameters + initial world state.
 */

const FNV_OFFSET_BASIS = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

/**
 * Converts a string/number seed into a reproducible 32-bit unsigned integer.
 *
 * @param {string | number} seed
 * @returns {number}
 */
export function normalizeSeed(seed) {
  if (typeof seed === 'number' && Number.isFinite(seed)) {
    return seed >>> 0;
  }

  const text = String(seed);
  let hash = FNV_OFFSET_BASIS;

  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, FNV_PRIME);
  }

  return hash >>> 0;
}

/**
 * Creates a deterministic PRNG with helper sampling APIs.
 *
 * @param {string | number} seed
 */
export function createSeededPrng(seed) {
  let state = normalizeSeed(seed);

  // Avoid an all-zero state lock by nudging with a constant.
  if (state === 0) {
    state = 0x9e3779b9;
  }

  const nextUint32 = () => {
    state = (state + 0x6d2b79f5) >>> 0;

    let z = state;
    z = Math.imul(z ^ (z >>> 15), z | 1);
    z ^= z + Math.imul(z ^ (z >>> 7), z | 61);

    return (z ^ (z >>> 14)) >>> 0;
  };

  return {
    /** Returns a float in [0, 1). */
    nextFloat() {
      return nextUint32() / 4294967296;
    },

    /** Returns an integer in [min, maxExclusive). */
    nextInt(min, maxExclusive) {
      if (!Number.isInteger(min) || !Number.isInteger(maxExclusive)) {
        throw new TypeError('nextInt(min, maxExclusive) requires integer bounds.');
      }

      if (maxExclusive <= min) {
        throw new RangeError('nextInt(min, maxExclusive) requires maxExclusive > min.');
      }

      const span = maxExclusive - min;
      return min + Math.floor(this.nextFloat() * span);
    }
  };
}
