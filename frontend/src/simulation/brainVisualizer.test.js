import { describe, expect, it } from 'vitest';

import { mapBrainToVisualizerModel } from './brainVisualizer';

describe('mapBrainToVisualizerModel', () => {
  it('maps deterministic sorted nodes and edges with visible weight cues', () => {
    const brain = {
      neurons: [
        { id: 'out-2', type: 'output' },
        { id: 'in-1', type: 'input' },
        { id: 'out-1', type: 'output' },
        { id: 'in-2', type: 'input' }
      ],
      synapses: [
        { id: 's-b', sourceId: 'in-2', targetId: 'out-1', weight: -0.35 },
        { id: 's-a', sourceId: 'in-1', targetId: 'out-2', weight: 0.5 }
      ]
    };

    const mapped = mapBrainToVisualizerModel(brain);

    expect(mapped).not.toBeNull();
    expect(mapped.nodes.map((node) => node.id)).toEqual(['in-1', 'in-2', 'out-1', 'out-2']);
    expect(mapped.edges).toEqual([
      {
        id: 's-a',
        sourceId: 'in-1',
        targetId: 'out-2',
        weight: 0.5,
        strokeWidth: 2,
        color: '#22d3ee'
      },
      {
        id: 's-b',
        sourceId: 'in-2',
        targetId: 'out-1',
        weight: -0.35,
        strokeWidth: 1.7,
        color: '#f97316'
      }
    ]);
  });

  it('returns null for empty or invalid brain data', () => {
    expect(mapBrainToVisualizerModel(null)).toBeNull();
    expect(mapBrainToVisualizerModel({ neurons: [], synapses: [] })).toBeNull();
    expect(mapBrainToVisualizerModel({ neurons: [{ id: 'in-1', type: 'input' }] })).toBeNull();
  });
});
