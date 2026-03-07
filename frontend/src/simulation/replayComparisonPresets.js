const STORAGE_KEY = 'snnSandbox.replayComparisonPresets.v1';

const DETERMINISTIC_PARAMETER_KEYS = [
  'worldWidth',
  'worldHeight',
  'initialPopulation',
  'initialFoodCount',
  'foodSpawnChance',
  'foodEnergyValue',
  'maxFood'
];

function toPositiveNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
}

function toProbability(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric >= 0 && numeric <= 1 ? numeric : null;
}

function normalizeParameters(parameters) {
  if (!parameters || typeof parameters !== 'object') {
    return null;
  }

  const normalized = {
    worldWidth: toPositiveNumber(parameters.worldWidth),
    worldHeight: toPositiveNumber(parameters.worldHeight),
    initialPopulation: toPositiveNumber(parameters.initialPopulation),
    initialFoodCount: toPositiveNumber(parameters.initialFoodCount),
    foodSpawnChance: toProbability(parameters.foodSpawnChance),
    foodEnergyValue: toPositiveNumber(parameters.foodEnergyValue),
    maxFood: toPositiveNumber(parameters.maxFood)
  };

  return Object.values(normalized).some((value) => value === null) ? null : normalized;
}

export function validateReplayComparisonPreset(payload) {
  if (!payload || typeof payload !== 'object') {
    return null;
  }

  const name = String(payload.name ?? '').trim();
  const seed = String(payload.seed ?? '').trim();
  const parameters = normalizeParameters(payload.parameters);

  if (!name || !seed || !parameters) {
    return null;
  }

  return {
    name,
    seed,
    parameters
  };
}

function orderPresetPayload(preset) {
  return {
    name: preset.name,
    seed: preset.seed,
    parameters: DETERMINISTIC_PARAMETER_KEYS.reduce((acc, key) => {
      acc[key] = preset.parameters[key];
      return acc;
    }, {})
  };
}

function serializePresets(presets) {
  return JSON.stringify(
    presets.map((preset) => orderPresetPayload(preset))
  );
}

export function loadReplayComparisonPresets(storage = globalThis.localStorage) {
  if (!storage || typeof storage.getItem !== 'function') {
    return [];
  }

  const serialized = storage.getItem(STORAGE_KEY);
  if (!serialized) {
    return [];
  }

  try {
    const parsed = JSON.parse(serialized);
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .map((payload) => validateReplayComparisonPreset(payload))
      .filter(Boolean);
  } catch {
    return [];
  }
}

export function saveReplayComparisonPresets(presets, storage = globalThis.localStorage) {
  if (!storage || typeof storage.setItem !== 'function') {
    return;
  }

  storage.setItem(STORAGE_KEY, serializePresets(presets));
}
