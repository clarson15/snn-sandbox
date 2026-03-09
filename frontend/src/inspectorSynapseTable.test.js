import { describe, expect, it } from 'vitest';

import {
  deriveInspectorSynapseTableRows,
  INSPECTOR_SYNAPSE_TABLE_EMPTY_STATE
} from './inspectorSynapseTable';

describe('deriveInspectorSynapseTableRows', () => {
  it('sorts rows deterministically independent of source array order', () => {
    const selected = {
      brain: {
        synapses: [
          { id: 's-2', sourceId: 'hidden-1', targetId: 'out-forward', weight: 0.5 },
          { id: 's-1', sourceId: 'in-energy', targetId: 'out-turn-left', weight: -0.25 },
          { id: 's-3', sourceId: 'in-energy', targetId: 'out-forward', weight: 1.25 }
        ]
      }
    };

    const modelA = deriveInspectorSynapseTableRows(selected);
    const modelB = deriveInspectorSynapseTableRows({
      ...selected,
      brain: { synapses: [...selected.brain.synapses].reverse() }
    });

    expect(modelA).toEqual(modelB);
    expect(modelA.map((row) => `${row.sourceNeuron}->${row.targetNeuron}:${row.weight}`)).toEqual([
      'hidden-1->out-forward:0.500',
      'in-energy->out-forward:1.250',
      'in-energy->out-turn-left:-0.250'
    ]);
  });

  it('uses fixed deterministic precision for weights', () => {
    const rows = deriveInspectorSynapseTableRows({
      brain: {
        synapses: [{ sourceId: 'in-energy', targetId: 'out-forward', weight: 0.123456 }]
      }
    });

    expect(rows[0]).toMatchObject({
      sourceNeuron: 'in-energy',
      targetNeuron: 'out-forward',
      weight: '0.123'
    });
  });

  it('returns no rows for organisms without synapses', () => {
    expect(deriveInspectorSynapseTableRows({ brain: { synapses: [] } })).toEqual([]);
    expect(deriveInspectorSynapseTableRows({ brain: {} })).toEqual([]);
    expect(deriveInspectorSynapseTableRows(undefined)).toEqual([]);
    expect(INSPECTOR_SYNAPSE_TABLE_EMPTY_STATE).toBe('No synapses for selected organism.');
  });
});
