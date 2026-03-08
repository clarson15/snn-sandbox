export const INSPECTOR_TREND_WINDOW_TICKS = 90;

function toFiniteNumber(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

export function reduceInspectorTrendState(previousState, { selectedOrganismId, selectedOrganism, tick, windowSize = INSPECTOR_TREND_WINDOW_TICKS }) {
  const previous = previousState ?? { selectedOrganismId: null, samples: [] };

  if (!selectedOrganismId) {
    if (!previous.selectedOrganismId && previous.samples.length === 0) {
      return previous;
    }

    return { selectedOrganismId: null, samples: [] };
  }

  const nextState = previous.selectedOrganismId === selectedOrganismId
    ? previous
    : { selectedOrganismId, samples: [] };

  if (!selectedOrganism || selectedOrganism.id !== selectedOrganismId) {
    return nextState;
  }

  const normalizedTick = Math.max(0, Math.floor(toFiniteNumber(tick, 0)));
  const nextSample = {
    tick: normalizedTick,
    energy: toFiniteNumber(selectedOrganism.energy),
    age: Math.max(0, Math.floor(toFiniteNumber(selectedOrganism.age, 0)))
  };

  const existingSamples = nextState.samples;
  const lastSample = existingSamples[existingSamples.length - 1];
  if (
    lastSample
    && lastSample.tick === nextSample.tick
    && lastSample.energy === nextSample.energy
    && lastSample.age === nextSample.age
  ) {
    return nextState;
  }

  const nextSamples = [...existingSamples];
  if (nextSamples.length > 0 && nextSamples[nextSamples.length - 1].tick === nextSample.tick) {
    nextSamples[nextSamples.length - 1] = nextSample;
  } else {
    nextSamples.push(nextSample);
  }

  const effectiveWindow = Math.max(1, Math.floor(toFiniteNumber(windowSize, INSPECTOR_TREND_WINDOW_TICKS)));
  if (nextSamples.length > effectiveWindow) {
    nextSamples.splice(0, nextSamples.length - effectiveWindow);
  }

  return {
    selectedOrganismId,
    samples: nextSamples
  };
}

function normalizeSeries(samples, key) {
  if (!samples.length) {
    return [];
  }

  const values = samples.map((sample) => sample[key]);
  const minValue = Math.min(...values);
  const maxValue = Math.max(...values);
  const range = maxValue - minValue;

  return samples.map((sample, index) => ({
    index,
    value: sample[key],
    normalized: range === 0 ? 0.5 : (sample[key] - minValue) / range
  }));
}

export function deriveInspectorTrendSeries(samples) {
  const safeSamples = Array.isArray(samples) ? samples : [];
  return {
    energy: normalizeSeries(safeSamples, 'energy'),
    age: normalizeSeries(safeSamples, 'age')
  };
}

export function formatTrendPolyline(series, width, height) {
  if (!Array.isArray(series) || series.length === 0) {
    return '';
  }

  const clampedWidth = Math.max(1, Number(width) || 1);
  const clampedHeight = Math.max(1, Number(height) || 1);
  const step = series.length > 1 ? clampedWidth / (series.length - 1) : 0;

  return series
    .map((point, index) => {
      const x = Number((index * step).toFixed(3));
      const y = Number((clampedHeight - (point.normalized * clampedHeight)).toFixed(3));
      return `${x},${y}`;
    })
    .join(' ');
}
