import { describe, expect, it } from 'vitest';

import {
  DEFAULT_SAVED_SIMULATION_LIST_VIEW_STATE,
  deriveSavedSimulationListView
} from './savedSimulationListView';

const FIXTURES = [
  { id: 'sim-b', name: 'Beta', updatedAt: '2026-03-06T12:00:01.000Z' },
  { id: 'sim-a', name: 'alpha', updatedAt: '2026-03-06T12:00:01.000Z' },
  { id: 'sim-c', name: 'Gamma', updatedAt: '2026-03-06T12:00:00.000Z' }
];

describe('deriveSavedSimulationListView', () => {
  it('uses deterministic tie-breakers for updated sort and preserves stable ordering', () => {
    const view = deriveSavedSimulationListView(FIXTURES, {
      ...DEFAULT_SAVED_SIMULATION_LIST_VIEW_STATE,
      sortKey: 'updated-desc'
    });

    expect(view.visibleItems.map((item) => item.id)).toEqual(['sim-a', 'sim-b', 'sim-c']);
  });

  it('supports deterministic name filter without mutating source data', () => {
    const source = [...FIXTURES];
    const view = deriveSavedSimulationListView(source, {
      ...DEFAULT_SAVED_SIMULATION_LIST_VIEW_STATE,
      nameFilter: 'ga'
    });

    expect(view.visibleItems.map((item) => item.id)).toEqual(['sim-c']);
    expect(source).toEqual(FIXTURES);
  });

  it('keeps selection when still visible after sort/filter changes', () => {
    const initial = deriveSavedSimulationListView(FIXTURES, {
      ...DEFAULT_SAVED_SIMULATION_LIST_VIEW_STATE,
      selectedSnapshotId: 'sim-b'
    });

    const updated = deriveSavedSimulationListView(FIXTURES, {
      ...initial,
      sortKey: 'name-asc',
      nameFilter: 'b'
    });

    expect(updated.selectedSnapshotId).toBe('sim-b');
    expect(updated.visibleItems.map((item) => item.id)).toEqual(['sim-b']);
  });

  it('falls back to first visible deterministic item when selection is hidden by filter', () => {
    const view = deriveSavedSimulationListView(FIXTURES, {
      ...DEFAULT_SAVED_SIMULATION_LIST_VIEW_STATE,
      selectedSnapshotId: 'sim-b',
      nameFilter: 'ga'
    });

    expect(view.selectedSnapshotId).toBe('sim-c');
  });
});
