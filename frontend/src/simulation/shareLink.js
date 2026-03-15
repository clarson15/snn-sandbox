import { DEFAULT_CONFIG } from './config';

const DETERMINISTIC_PARAM_RULES = [
  ['worldWidth', 100, 3000],
  ['worldHeight', 100, 3000],
  ['initialPopulation', 1, 2000],
  ['minimumPopulation', 1, 2000],
  ['initialFoodCount', 0, 1000],
  ['foodSpawnChance', 0, 1],
  ['foodEnergyValue', 1, 100],
  ['maxFood', 1, 2000],
  ['mutationRate', 0, 1],
  ['mutationStrength', 0, 1],
  ['reproductionThreshold', 1, 200],
  ['reproductionCost', 0, 200],
  ['offspringStartEnergy', 0, 200],
  ['reproductionMinimumAge', 0, 5000],
  ['reproductionRefractoryPeriod', 0, 5000],
  ['maximumOrganismAge', 1, 10000]
];

export const SHARE_QUERY_PARAM_ORDER = ['seed', ...DETERMINISTIC_PARAM_RULES.map(([key]) => key)];

function toCanonicalNumberString(value) {
  return `${Number(value)}`;
}

export function buildDeterministicShareUrl({ origin, pathname, seed, parameters }) {
  const params = new URLSearchParams();
  params.set('seed', String(seed ?? '').trim());

  for (const [field] of DETERMINISTIC_PARAM_RULES) {
    params.set(field, toCanonicalNumberString(parameters?.[field] ?? DEFAULT_CONFIG[field]));
  }

  return `${origin}${pathname}?${params.toString()}`;
}

export function resolveDeterministicQueryPrefill(search) {
  const params = new URLSearchParams(search);
  const hasDeterministicParams = DETERMINISTIC_PARAM_RULES.some(([field]) => params.has(field));

  const prefill = {
    seed: '',
    ...Object.fromEntries(DETERMINISTIC_PARAM_RULES.map(([field]) => [field, String(DEFAULT_CONFIG[field])]))
  };

  const warnings = [];

  const seedParam = params.get('seed');
  if (typeof seedParam === 'string') {
    const trimmedSeed = seedParam.trim();
    if (trimmedSeed.length > 0) {
      prefill.seed = trimmedSeed;
    } else if (hasDeterministicParams) {
      warnings.push('seed');
    }
  }

  for (const [field, min, max] of DETERMINISTIC_PARAM_RULES) {
    const raw = params.get(field);
    if (raw === null) {
      if (hasDeterministicParams) {
        warnings.push(field);
      }
      continue;
    }

    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || parsed < min || parsed > max) {
      warnings.push(field);
      continue;
    }

    prefill[field] = toCanonicalNumberString(parsed);
  }

  return {
    prefill,
    warningMessage: warnings.length > 0
      ? 'Some shared link values were missing or invalid. Defaults were applied for: ' + warnings.join(', ')
      : ''
  };
}
