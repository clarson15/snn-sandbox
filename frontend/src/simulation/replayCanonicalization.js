const DEFAULT_NUMBER_PRECISION = 12;

function normalizeCanonicalNumber(value, precision = DEFAULT_NUMBER_PRECISION) {
  if (!Number.isFinite(value)) {
    return null;
  }

  if (Object.is(value, -0)) {
    return 0;
  }

  if (Number.isInteger(value)) {
    return value;
  }

  return Number(value.toFixed(precision));
}

export function canonicalizeReplayFixturePayload(value, options = {}) {
  const precision = Number.isInteger(options.numberPrecision) ? options.numberPrecision : DEFAULT_NUMBER_PRECISION;

  if (value === null || typeof value !== 'object') {
    return typeof value === 'number' ? normalizeCanonicalNumber(value, precision) : value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => canonicalizeReplayFixturePayload(item, { numberPrecision: precision }));
  }

  return Object.keys(value)
    .sort((left, right) => left.localeCompare(right))
    .reduce((accumulator, key) => {
      accumulator[key] = canonicalizeReplayFixturePayload(value[key], { numberPrecision: precision });
      return accumulator;
    }, {});
}

export function stableCanonicalStringify(value, options = {}) {
  return JSON.stringify(canonicalizeReplayFixturePayload(value, options));
}

export function hashStableCanonicalValue(value, options = {}) {
  const input = stableCanonicalStringify(value, options);
  let hash = 2166136261;

  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }

  return (hash >>> 0).toString(16).padStart(8, '0');
}
