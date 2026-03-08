import { describe, expect, it } from 'vitest';

import { deriveInspectorTrendSeries, reduceInspectorTrendState } from './inspectorTrend';

describe('reduceInspectorTrendState', () => {
  it('keeps only the configured fixed sample window and deduplicates same tick', () => {
    let state = { selectedOrganismId: null, samples: [] };

    for (let tick = 1; tick <= 5; tick += 1) {
      state = reduceInspectorTrendState(state, {
        selectedOrganismId: 'org-1',
        selectedOrganism: { id: 'org-1', energy: tick * 2, age: tick },
        tick,
        windowSize: 3
      });
    }

    expect(state.selectedOrganismId).toBe('org-1');
    expect(state.samples.map((sample) => sample.tick)).toEqual([3, 4, 5]);

    const updated = reduceInspectorTrendState(state, {
      selectedOrganismId: 'org-1',
      selectedOrganism: { id: 'org-1', energy: 123, age: 77 },
      tick: 5,
      windowSize: 3
    });

    expect(updated.samples).toHaveLength(3);
    expect(updated.samples[2]).toEqual({ tick: 5, energy: 123, age: 77 });
  });

  it('clears samples when selection is removed and resets when selection changes', () => {
    const first = reduceInspectorTrendState(undefined, {
      selectedOrganismId: 'org-1',
      selectedOrganism: { id: 'org-1', energy: 10, age: 2 },
      tick: 10,
      windowSize: 5
    });

    const switched = reduceInspectorTrendState(first, {
      selectedOrganismId: 'org-2',
      selectedOrganism: { id: 'org-2', energy: 7, age: 1 },
      tick: 11,
      windowSize: 5
    });

    expect(switched.selectedOrganismId).toBe('org-2');
    expect(switched.samples).toEqual([{ tick: 11, energy: 7, age: 1 }]);

    const cleared = reduceInspectorTrendState(switched, {
      selectedOrganismId: null,
      selectedOrganism: null,
      tick: 12,
      windowSize: 5
    });

    expect(cleared).toEqual({ selectedOrganismId: null, samples: [] });
  });
});

describe('deriveInspectorTrendSeries', () => {
  it('returns empty series for empty samples and normalized series for populated samples', () => {
    expect(deriveInspectorTrendSeries([])).toEqual({ energy: [], age: [] });

    const result = deriveInspectorTrendSeries([
      { tick: 1, energy: 5, age: 10 },
      { tick: 2, energy: 10, age: 20 },
      { tick: 3, energy: 15, age: 30 }
    ]);

    expect(result.energy.map((point) => point.normalized)).toEqual([0, 0.5, 1]);
    expect(result.age.map((point) => point.normalized)).toEqual([0, 0.5, 1]);
  });
});
