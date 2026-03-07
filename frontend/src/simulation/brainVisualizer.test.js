import { describe, expect, it } from 'vitest';

import { mapBrainToVisualizerModel, mapNeuronValueToColor, mapSynapseWeightToCue } from './brainVisualizer';

describe('mapNeuronValueToColor', () => {
  it('maps negative to red, zero to neutral, and positive to green', () => {
    const negative = mapNeuronValueToColor(-0.5);
    const zero = mapNeuronValueToColor(0);
    const positive = mapNeuronValueToColor(0.5);

    expect(negative.hue).toBe(0);
    expect(zero.hue).toBe(210);
    expect(positive.hue).toBe(145);
  });

  it('increases intensity monotonically with absolute magnitude', () => {
    const lowMagnitude = mapNeuronValueToColor(0.2);
    const highMagnitude = mapNeuronValueToColor(0.8);

    expect(highMagnitude.saturation).toBeGreaterThan(lowMagnitude.saturation);
    expect(highMagnitude.lightness).toBeGreaterThan(lowMagnitude.lightness);
  });
});

describe('mapSynapseWeightToCue', () => {
  it('maps deterministic cue values for known weights', () => {
    expect(mapSynapseWeightToCue(0.5)).toEqual({
      weight: 0.5,
      magnitude: 0.5,
      strokeWidth: 2.625,
      color: '#22c55e',
      polarityLabel: 'excitatory (+)'
    });

    expect(mapSynapseWeightToCue(-0.35)).toEqual({
      weight: -0.35,
      magnitude: 0.35,
      strokeWidth: 2.212,
      color: '#ef4444',
      polarityLabel: 'inhibitory (-)'
    });
  });

  it('clamps out-of-range weights to fixed bounds', () => {
    expect(mapSynapseWeightToCue(9).weight).toBe(1);
    expect(mapSynapseWeightToCue(-9).weight).toBe(-1);
  });
});

describe('mapBrainToVisualizerModel', () => {
  it('maps deterministic sorted nodes and edges with visible weight cues', () => {
    const brain = {
      neurons: [
        { id: 'out-2', type: 'output', value: -0.3 },
        { id: 'in-1', type: 'input', value: 0.5 },
        { id: 'out-1', type: 'output', value: 0 },
        { id: 'in-2', type: 'input', value: -0.9 }
      ],
      synapses: [
        { id: 's-b', sourceId: 'in-2', targetId: 'out-1', weight: -0.35 },
        { id: 's-a', sourceId: 'in-1', targetId: 'out-2', weight: 0.5 }
      ]
    };

    const mapped = mapBrainToVisualizerModel(brain);

    expect(mapped).not.toBeNull();
    expect(mapped.nodes.map((node) => node.id)).toEqual(['in-1', 'in-2', 'out-1', 'out-2']);
    expect(mapped.nodes.map((node) => node.value)).toEqual([0.5, -0.9, 0, -0.3]);
    expect(mapped.nodes.map((node) => node.fillColor)).toEqual([
      mapNeuronValueToColor(0.5).cssColor,
      mapNeuronValueToColor(-0.9).cssColor,
      mapNeuronValueToColor(0).cssColor,
      mapNeuronValueToColor(-0.3).cssColor
    ]);
    expect(mapped.edges).toEqual([
      {
        id: 's-a',
        sourceId: 'in-1',
        targetId: 'out-2',
        weight: 0.5,
        strokeWidth: 2.625,
        color: '#22c55e',
        polarityLabel: 'excitatory (+)'
      },
      {
        id: 's-b',
        sourceId: 'in-2',
        targetId: 'out-1',
        weight: -0.35,
        strokeWidth: 2.212,
        color: '#ef4444',
        polarityLabel: 'inhibitory (-)'
      }
    ]);
  });

  it('falls back to neutral color when neuron value is missing', () => {
    const mapped = mapBrainToVisualizerModel({
      neurons: [{ id: 'in-1', type: 'input' }],
      synapses: []
    });

    expect(mapped).not.toBeNull();
    expect(mapped.nodes[0].value).toBe(0);
    expect(mapped.nodes[0].fillColor).toBe(mapNeuronValueToColor(0).cssColor);
  });

  it('returns null for empty or invalid brain data', () => {
    expect(mapBrainToVisualizerModel(null)).toBeNull();
    expect(mapBrainToVisualizerModel({ neurons: [], synapses: [] })).toBeNull();
    expect(mapBrainToVisualizerModel({ neurons: [{ id: 'in-1', type: 'input' }] })).toBeNull();
  });
});
