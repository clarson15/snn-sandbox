import { describe, expect, it } from 'vitest';

import { deriveNeuronDetailPanel } from './inspectorNeuronDetail';

describe('deriveNeuronDetailPanel', () => {
  it('sorts synapse lists deterministically by source/target and derives neuron state fields', () => {
    const model = {
      nodes: [{ id: 'n-2', type: 'hidden', value: 0.8 }],
      edges: [
        { id: 'e-4', sourceId: 'n-2', targetId: 'n-7', weight: 0.2, weightLabel: '0.200' },
        { id: 'e-1', sourceId: 'n-1', targetId: 'n-2', weight: 0.5, weightLabel: '0.500' },
        { id: 'e-2', sourceId: 'n-1', targetId: 'n-2', weight: -0.1, weightLabel: '-0.100' },
        { id: 'e-3', sourceId: 'n-2', targetId: 'n-5', weight: -0.4, weightLabel: '-0.400' }
      ]
    };

    const panel = deriveNeuronDetailPanel(model, { neurons: [{ id: 'n-2', threshold: 0.75 }] }, 'n-2');

    expect(panel?.incomingSynapses.map((edge) => edge.id)).toEqual(['e-1', 'e-2']);
    expect(panel?.outgoingSynapses.map((edge) => edge.id)).toEqual(['e-3', 'e-4']);
    expect(panel?.roleLabel).toBe('Hidden neuron n-2');
    expect(panel?.thresholdLabel).toBe('0.750');
    expect(panel?.currentPotentialLabel).toBe('0.800');
    expect(panel?.spikeStateLabel).toBe('Spiking');
  });

  it('returns deterministic empty incoming/outgoing lists when no edges match the neuron', () => {
    const model = {
      nodes: [{ id: 'n-9', type: 'output' }],
      edges: [{ id: 'e-1', sourceId: 'n-1', targetId: 'n-2', weight: 0.1, weightLabel: '0.100' }]
    };

    const panel = deriveNeuronDetailPanel(model, { neurons: [{ id: 'n-9', threshold: 0.2 }] }, 'n-9');
    expect(panel?.incomingSynapses).toEqual([]);
    expect(panel?.outgoingSynapses).toEqual([]);
    expect(panel?.incomingCount).toBe(0);
    expect(panel?.outgoingCount).toBe(0);
  });

  it('prefers explicit raw spike-state fields when present', () => {
    const model = {
      nodes: [{ id: 'n-4', type: 'output', value: 0.9 }],
      edges: []
    };

    const panel = deriveNeuronDetailPanel(model, { neurons: [{ id: 'n-4', threshold: 0.2, spiked: false }] }, 'n-4');
    expect(panel?.spikeStateLabel).toBe('Idle');
  });

  it('returns null when neuron id is unavailable', () => {
    const panel = deriveNeuronDetailPanel({ nodes: [], edges: [] }, null, 'n-1');
    expect(panel).toBeNull();
  });
});
