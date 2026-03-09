import { describe, expect, it } from 'vitest';

import { deriveInspectorComparisonRows } from './inspectorComparison';

describe('deriveInspectorComparisonRows', () => {
  it('returns stable field ordering and deterministic delta labels', () => {
    const selected = {
      generation: 7,
      age: 42,
      energy: 12.3456,
      traits: {
        size: 1.2,
        speed: 2.4,
        visionRange: 55,
        turnRate: 0.5,
        metabolism: 1.1
      }
    };
    const pinned = {
      generation: 6,
      age: 40,
      energy: 10.3456,
      traits: {
        size: 1.1,
        speed: 2.6,
        visionRange: 50,
        turnRate: 0.5,
        metabolism: 1.2
      }
    };

    const first = deriveInspectorComparisonRows(selected, pinned);
    const second = deriveInspectorComparisonRows(selected, pinned);

    expect(first.map((row) => row.key)).toEqual([
      'generation',
      'age',
      'energy',
      'size',
      'speed',
      'turnRate',
      'visionRange',
      'metabolism'
    ]);
    expect(second).toEqual(first);
    expect(first.find((row) => row.key === 'energy')?.deltaLabel).toBe('+2.000 vs pinned');
  });

  it('marks unavailable values explicitly when either side is missing', () => {
    const selected = {
      generation: 1,
      age: 2,
      energy: 3,
      traits: {
        size: 1,
        speed: undefined,
        visionRange: 3,
        turnRate: 0.2
      }
    };
    const pinned = {
      generation: 1,
      age: 2,
      energy: 3,
      traits: {
        size: 1,
        speed: 2,
        visionRange: 3,
        turnRate: 0.2,
        metabolism: 0.7
      }
    };

    const rows = deriveInspectorComparisonRows(selected, pinned);
    const speedRow = rows.find((row) => row.key === 'speed');
    const metabolismRow = rows.find((row) => row.key === 'metabolism');

    expect(speedRow?.selectedDisplay).toBe('Unavailable');
    expect(speedRow?.deltaLabel).toBe('Unavailable on one side');
    expect(metabolismRow?.selectedDisplay).toBe('Unavailable');
    expect(metabolismRow?.pinnedDisplay).toBe('0.70');
  });
});
