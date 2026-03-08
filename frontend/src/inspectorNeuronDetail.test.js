import { describe, expect, it } from 'vitest';

import { deriveNeuronDetailPanel } from './inspectorNeuronDetail';

describe('deriveNeuronDetailPanel', () => {
  it('sorts synapse lists deterministically by source/target/weight', () => {
    const model = {
      nodes: [{ id: 'n-2', type: 'hidden' }],
      edges: [
        { id: 'e-4', sourceId: 'n-2', targetId: 'n-7', weight: 0.2, weightLabel: '0.200' },
        { id: 'e-1', sourceId: 'n-1', targetId: 'n-2', weight: 0.5, weightLabel: '0.500' },
        { id: 'e-2', sourceId: 'n-1', targetId: 'n-2', weight: -0.1, weightLabel: '-0.100' },
        { id: 'e-3', sourceId: 'n-2', targetId: 'n-5', weight: -0.4, weightLabel: '-0.400' }
      ]
    };

    const panel = deriveNeuronDetailPanel(model, { neurons: [{ id: 'n-2', threshold: 0.75 }] }, 'n-2');

    expect(panel?.incomingSynapses.map((edge) => edge.id)).toEqual(['e-2', 'e-1']);
    expect(panel?.outgoingSynapses.map((edge) => edge.id)).toEqual(['e-3', 'e-4']);
    expect(panel?.thresholdLabel).toBe('0.750');
  });

  it('returns null when neuron id is unavailable', () => {
    const panel = deriveNeuronDetailPanel({ nodes: [], edges: [] }, null, 'n-1');
    expect(panel).toBeNull();
  });
});
