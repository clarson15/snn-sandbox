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
  // Legacy mutation fields (backward compatibility)
  ['mutationRate', 0, 1],
  ['mutationStrength', 0, 1],
  // Trait-specific mutation controls (SSN-254)
  ['physicalTraitsMutationRate', 0, 1],
  ['physicalTraitsMutationStrength', 0, 1],
  ['brainStructureMutationRate', 0, 1],
  ['brainWeightMutationRate', 0, 1],
  ['brainWeightMutationStrength', 0, 1],
  ['reproductionThreshold', 1, 200],
  ['reproductionCost', 0, 200],
  ['offspringStartEnergy', 0, 200],
  ['reproductionMinimumAge', 0, 5000],
  ['reproductionRefractoryPeriod', 0, 5000],
  ['maximumOrganismAge', 1, 10000],
  // Terrain zone generation (flattened for share links)
  ['terrainZoneEnabled', 0, 1],
  ['terrainZoneCount', 1, 20],
  ['terrainZoneMinWidthRatio', 0.05, 0.5],
  ['terrainZoneMaxWidthRatio', 0.05, 0.5],
  ['terrainZoneMinHeightRatio', 0.05, 0.5],
  ['terrainZoneMaxHeightRatio', 0.05, 0.5]
];

export const SHARE_QUERY_PARAM_ORDER = ['seed', ...DETERMINISTIC_PARAM_RULES.map(([key]) => key)];

function toCanonicalNumberString(value) {
  return `${Number(value)}`;
}

export function buildDeterministicShareUrl({ origin, pathname, seed, parameters }) {
  const params = new URLSearchParams();
  params.set('seed', String(seed ?? '').trim());

  for (const [field] of DETERMINISTIC_PARAM_RULES) {
    let value;
    // Handle flattened terrain zone generation fields
    if (field.startsWith('terrainZone')) {
      const tz = parameters?.terrainZoneGeneration ?? DEFAULT_CONFIG.terrainZoneGeneration;
      switch (field) {
        case 'terrainZoneEnabled':
          value = tz.enabled ? 1 : 0;
          break;
        case 'terrainZoneCount':
          value = tz.zoneCount;
          break;
        case 'terrainZoneMinWidthRatio':
          value = tz.minZoneWidthRatio;
          break;
        case 'terrainZoneMaxWidthRatio':
          value = tz.maxZoneWidthRatio;
          break;
        case 'terrainZoneMinHeightRatio':
          value = tz.minZoneHeightRatio;
          break;
        case 'terrainZoneMaxHeightRatio':
          value = tz.maxZoneHeightRatio;
          break;
        default:
          value = DEFAULT_CONFIG[field];
      }
    } else {
      value = parameters?.[field] ?? DEFAULT_CONFIG[field];
    }
    params.set(field, toCanonicalNumberString(value));
  }

  return `${origin}${pathname}?${params.toString()}`;
}

export function resolveDeterministicQueryPrefill(search) {
  const params = new URLSearchParams(search);
  const hasDeterministicParams = DETERMINISTIC_PARAM_RULES.some(([field]) => params.has(field));

  const tzDefaults = DEFAULT_CONFIG.terrainZoneGeneration;
  const prefill = {
    seed: '',
    ...Object.fromEntries(DETERMINISTIC_PARAM_RULES.map(([field]) => {
      if (field.startsWith('terrainZone')) {
        switch (field) {
          case 'terrainZoneEnabled':
            return [field, String(tzDefaults.enabled ? 1 : 0)];
          case 'terrainZoneCount':
            return [field, String(tzDefaults.zoneCount)];
          case 'terrainZoneMinWidthRatio':
            return [field, String(tzDefaults.minZoneWidthRatio)];
          case 'terrainZoneMaxWidthRatio':
            return [field, String(tzDefaults.maxZoneWidthRatio)];
          case 'terrainZoneMinHeightRatio':
            return [field, String(tzDefaults.minZoneHeightRatio)];
          case 'terrainZoneMaxHeightRatio':
            return [field, String(tzDefaults.maxZoneHeightRatio)];
          default:
            return [field, String(DEFAULT_CONFIG[field])];
        }
      }
      return [field, String(DEFAULT_CONFIG[field])];
    }))
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

  // Track terrain zone values for nested config reconstruction
  const tzValues = {
    enabled: tzDefaults.enabled,
    zoneCount: tzDefaults.zoneCount,
    minZoneWidthRatio: tzDefaults.minZoneWidthRatio,
    maxZoneWidthRatio: tzDefaults.maxZoneWidthRatio,
    minZoneHeightRatio: tzDefaults.minZoneHeightRatio,
    maxZoneHeightRatio: tzDefaults.maxZoneHeightRatio
  };

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

    // Handle terrain zone fields - store for nested config
    if (field.startsWith('terrainZone')) {
      switch (field) {
        case 'terrainZoneEnabled':
          tzValues.enabled = parsed === 1;
          break;
        case 'terrainZoneCount':
          tzValues.zoneCount = parsed;
          break;
        case 'terrainZoneMinWidthRatio':
          tzValues.minZoneWidthRatio = parsed;
          break;
        case 'terrainZoneMaxWidthRatio':
          tzValues.maxZoneWidthRatio = parsed;
          break;
        case 'terrainZoneMinHeightRatio':
          tzValues.minZoneHeightRatio = parsed;
          break;
        case 'terrainZoneMaxHeightRatio':
          tzValues.maxZoneHeightRatio = parsed;
          break;
        default:
          break;
      }
      // Also set flat value for backward compatibility
      prefill[field] = toCanonicalNumberString(parsed);
    } else {
      prefill[field] = toCanonicalNumberString(parsed);
    }
  }

  // Add nested terrainZoneGeneration to prefill
  prefill.terrainZoneGeneration = {
    enabled: tzValues.enabled,
    zoneCount: tzValues.zoneCount,
    minZoneWidthRatio: tzValues.minZoneWidthRatio,
    maxZoneWidthRatio: tzValues.maxZoneWidthRatio,
    minZoneHeightRatio: tzValues.minZoneHeightRatio,
    maxZoneHeightRatio: tzValues.maxZoneHeightRatio
  };

  return {
    prefill,
    warningMessage: warnings.length > 0
      ? 'Some shared link values were missing or invalid. Defaults were applied for: ' + warnings.join(', ')
      : ''
  };
}
