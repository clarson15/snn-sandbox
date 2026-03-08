import { describe, expect, it } from 'vitest';

import {
  deriveDeterministicOrganismIds,
  resolveAdjacentSelectionId,
  resolveDeadSelectionFallback
} from './inspectorSelection';

describe('inspectorSelection helpers', () => {
  it('returns ids sorted by deterministic lexical order', () => {
    const ids = deriveDeterministicOrganismIds([
      { id: 'org-10' },
      { id: 'org-2' },
      { id: 'org-1' }
    ]);

    expect(ids).toEqual(['org-1', 'org-10', 'org-2']);
  });

  it('falls back to the next id when selected organism dies', () => {
    expect(resolveDeadSelectionFallback(['org-1', 'org-4', 'org-7'], 'org-4')).toBe('org-7');
  });

  it('falls back to previous id when no higher id exists', () => {
    expect(resolveDeadSelectionFallback(['org-1', 'org-4', 'org-7'], 'org-9')).toBe('org-7');
  });

  it('returns null when no alive organisms remain', () => {
    expect(resolveDeadSelectionFallback([], 'org-3')).toBeNull();
  });

  it('selects adjacent id using deterministic wraparound when current selection is alive', () => {
    const ids = ['org-1', 'org-4', 'org-7'];

    expect(resolveAdjacentSelectionId(ids, 'org-4', 1)).toBe('org-7');
    expect(resolveAdjacentSelectionId(ids, 'org-4', -1)).toBe('org-1');
    expect(resolveAdjacentSelectionId(ids, 'org-7', 1)).toBe('org-1');
  });

  it('resolves from dead-selection fallback before applying adjacent keyboard navigation', () => {
    const ids = ['org-1', 'org-4', 'org-7'];

    expect(resolveAdjacentSelectionId(ids, 'org-4-dead', 1)).toBe('org-1');
    expect(resolveAdjacentSelectionId(ids, 'org-4-dead', -1)).toBe('org-4');
  });

  it('uses directional edge fallback when no prior selection exists', () => {
    const ids = ['org-1', 'org-4', 'org-7'];

    expect(resolveAdjacentSelectionId(ids, null, 1)).toBe('org-1');
    expect(resolveAdjacentSelectionId(ids, null, -1)).toBe('org-7');
  });
});
