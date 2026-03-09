import { describe, expect, it } from 'vitest';

import { deriveInspectorTraitDeltaModel, TRAIT_DELTA_EMPTY_STATE } from './inspectorTraitDelta';

describe('deriveInspectorTraitDeltaModel', () => {
  it('renders deterministic trait order and stable numeric formatting', () => {
    const selected = {
      id: 'child-1',
      lineage: { parentId: 'parent-1' },
      traits: {
        speed: 2.34567,
        metabolism: 0.51234,
        turnRate: 0.12345,
        visionRange: 10.5555,
        size: 1.98765
      }
    };
    const parent = {
      id: 'parent-1',
      traits: {
        speed: 2.24567,
        metabolism: 0.61234,
        turnRate: 0.12345,
        visionRange: 10,
        size: 2
      }
    };

    const model = deriveInspectorTraitDeltaModel(selected, [selected, parent]);

    expect(model.hasParent).toBe(true);
    expect(model.rows.map((row) => row.key)).toEqual([
      'size',
      'speed',
      'turnRate',
      'visionRange',
      'metabolism'
    ]);
    expect(model.rows.map((row) => row.label)).toEqual([
      'size',
      'speed',
      'turn_rate',
      'vision_range',
      'metabolism'
    ]);
    expect(model.rows.find((row) => row.key === 'size')).toMatchObject({
      parentDisplay: '2.000',
      selectedDisplay: '1.988',
      deltaDisplay: '-0.012'
    });
    expect(model.rows.find((row) => row.key === 'turnRate')?.deltaDisplay).toBe('±0.000');
  });

  it('returns deterministic empty state when parent is missing', () => {
    const selected = {
      id: 'founder-1',
      traits: {
        size: 1,
        speed: 2,
        visionRange: 3,
        turnRate: 4,
        metabolism: 5
      }
    };

    const model = deriveInspectorTraitDeltaModel(selected, [selected]);

    expect(model.hasParent).toBe(false);
    expect(model.rows).toEqual([]);
    expect(model.message).toBe(TRAIT_DELTA_EMPTY_STATE);
  });
});
