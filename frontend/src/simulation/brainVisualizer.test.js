import { describe, expect, it } from 'vitest';

import {
  applyBrainViewportZoom,
  createBrainViewportFitSelectionTransform,
  createBrainViewportFitTransform,
  deriveBrainVisualizerLegend,
  deriveEmphasizedBrainGraphModel,
  deriveFilteredBrainGraphModel,
  mapBrainEmphasisChecksum,
  mapBrainLayoutChecksum,
  mapBrainToVisualizerModel,
  mapNeuronValueToColor,
  mapSynapseWeightToCue
} from './brainVisualizer';

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

const createViewportTestModel = () => ({
  nodes: [
    { id: 'in-1', x: 120, y: 120 },
    { id: 'in-2', x: 120, y: 180 },
    { id: 'h-1', x: 300, y: 150 },
    { id: 'out-1', x: 480, y: 150 }
  ],
  edges: [
    {
      id: 's-1',
      sourceId: 'h-1',
      targetId: 'out-1'
    }
  ]
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
    expect(mapped.nodes.map((node) => node.displayLabel)).toEqual([
      'Input sensor (in-1)',
      'Input sensor (in-2)',
      'Output actuator (out-1)',
      'Output actuator (out-2)'
    ]);
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
        polarityLabel: 'excitatory (+)',
        weightLabel: '0.500'
      },
      {
        id: 's-b',
        sourceId: 'in-2',
        targetId: 'out-1',
        weight: -0.35,
        strokeWidth: 2.212,
        color: '#ef4444',
        polarityLabel: 'inhibitory (-)',
        weightLabel: '-0.350'
      }
    ]);
  });

  it('draws synapses in deterministic layer order independent of input order', () => {
    const brain = {
      neurons: [
        { id: 'in-1', type: 'input', value: 0.1 },
        { id: 'h-1', type: 'hidden', value: 0.2 },
        { id: 'out-1', type: 'output', value: 0.3 }
      ],
      synapses: [
        { id: 's-hidden-output', sourceId: 'h-1', targetId: 'out-1', weight: 0.5 },
        { id: 's-input-hidden', sourceId: 'in-1', targetId: 'h-1', weight: 0.5 },
        { id: 's-input-output', sourceId: 'in-1', targetId: 'out-1', weight: 0.5 }
      ]
    };

    const mapped = mapBrainToVisualizerModel(brain);

    expect(mapped?.edges.map((edge) => edge.id)).toEqual(['s-input-hidden', 's-input-output', 's-hidden-output']);
  });

  it('produces a deterministic layout checksum for identical brains', () => {
    const brain = {
      neurons: [
        { id: 'in-2', type: 'input', value: 0.1 },
        { id: 'out-1', type: 'output', value: -0.2 },
        { id: 'in-1', type: 'input', value: 0.8 },
        { id: 'h-1', type: 'hidden', value: 0.3 }
      ],
      synapses: [
        { id: 's2', sourceId: 'h-1', targetId: 'out-1', weight: -0.25 },
        { id: 's1', sourceId: 'in-1', targetId: 'h-1', weight: 0.9 },
        { id: 's3', sourceId: 'in-2', targetId: 'h-1', weight: 0.2 }
      ]
    };

    const first = mapBrainToVisualizerModel(brain);
    const second = mapBrainToVisualizerModel(structuredClone(brain));

    expect(first).not.toBeNull();
    expect(second).not.toBeNull();
    expect(mapBrainLayoutChecksum(first)).toBe(
      'in-1@120.000,120.000|in-2@120.000,180.000|h-1@300.000,150.000|out-1@480.000,150.000::s1:in-1->h-1:0.900|s3:in-2->h-1:0.200|s2:h-1->out-1:-0.250'
    );
    expect(mapBrainLayoutChecksum(second)).toBe(mapBrainLayoutChecksum(first));
  });

  it('keeps neuron coordinates deterministic when neuron and synapse arrays arrive in different orders', () => {
    const canonical = mapBrainToVisualizerModel({
      neurons: [
        { id: 'in-a', type: 'input', value: 0.4 },
        { id: 'in-b', type: 'input', value: 0.6 },
        { id: 'h-a', type: 'hidden', value: 0.2 },
        { id: 'out-a', type: 'output', value: 0.9 }
      ],
      synapses: [
        { id: 's-a', sourceId: 'in-a', targetId: 'h-a', weight: 0.7 },
        { id: 's-b', sourceId: 'in-b', targetId: 'h-a', weight: -0.3 },
        { id: 's-c', sourceId: 'h-a', targetId: 'out-a', weight: 0.2 }
      ]
    });

    const shuffled = mapBrainToVisualizerModel({
      neurons: [
        { id: 'out-a', type: 'output', value: 0.9 },
        { id: 'h-a', type: 'hidden', value: 0.2 },
        { id: 'in-b', type: 'input', value: 0.6 },
        { id: 'in-a', type: 'input', value: 0.4 }
      ],
      synapses: [
        { id: 's-c', sourceId: 'h-a', targetId: 'out-a', weight: 0.2 },
        { id: 's-b', sourceId: 'in-b', targetId: 'h-a', weight: -0.3 },
        { id: 's-a', sourceId: 'in-a', targetId: 'h-a', weight: 0.7 }
      ]
    });

    expect(canonical).not.toBeNull();
    expect(shuffled).not.toBeNull();
    expect(mapBrainLayoutChecksum(shuffled)).toBe(mapBrainLayoutChecksum(canonical));
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

  it('preserves sensor and actuator binding labels for known neuron ids', () => {
    const mapped = mapBrainToVisualizerModel({
      neurons: [
        { id: 'in-energy', type: 'input', value: 0.4 },
        { id: 'out-turn-left', type: 'output', value: 0.2 }
      ],
      synapses: [
        { id: 's-1', sourceId: 'in-energy', targetId: 'out-turn-left', weight: 0.5 }
      ]
    });

    expect(mapped?.nodes.map((node) => node.displayLabel)).toEqual([
      'Energy sensor',
      'Turn left actuator'
    ]);
  });

  it('returns null for empty or invalid brain data', () => {
    expect(mapBrainToVisualizerModel(null)).toBeNull();
    expect(mapBrainToVisualizerModel({ neurons: [], synapses: [] })).toBeNull();
    expect(mapBrainToVisualizerModel({ neurons: [{ id: 'in-1', type: 'input' }] })).toBeNull();
  });
});

describe('deriveEmphasizedBrainGraphModel', () => {
  it('deterministically filters near-zero edges and highlights strongest edges', () => {
    const base = mapBrainToVisualizerModel({
      neurons: [
        { id: 'in-1', type: 'input', value: 0.2 },
        { id: 'h-1', type: 'hidden', value: 0.3 },
        { id: 'out-1', type: 'output', value: -0.1 }
      ],
      synapses: [
        { id: 's-weak', sourceId: 'in-1', targetId: 'h-1', weight: 0.02 },
        { id: 's-mid', sourceId: 'h-1', targetId: 'out-1', weight: -0.4 },
        { id: 's-strong', sourceId: 'in-1', targetId: 'out-1', weight: 0.95 }
      ]
    });

    expect(base).not.toBeNull();

    const settings = { hideNearZeroWeights: true, nearZeroThreshold: 0.1, strongestEdgeCount: 1 };
    const first = deriveEmphasizedBrainGraphModel(base, settings);
    const second = deriveEmphasizedBrainGraphModel(structuredClone(base), settings);

    expect(first.edges.map((edge) => edge.id)).toEqual(['s-mid', 's-strong']);
    expect(first.edges.find((edge) => edge.id === 's-strong')?.isStrongest).toBe(true);
    expect(first.edges.find((edge) => edge.id === 's-mid')?.emphasisOpacity).toBe(0.25);
    expect(mapBrainEmphasisChecksum(first, settings)).toBe(mapBrainEmphasisChecksum(second, settings));
  });
});

describe('deriveFilteredBrainGraphModel', () => {
  it('deterministically filters neuron classes + activation threshold and annotates pinned paths', () => {
    const base = mapBrainToVisualizerModel({
      neurons: [
        { id: 'in-a', type: 'input', value: 0.9 },
        { id: 'h-a', type: 'hidden', value: 0.45 },
        { id: 'out-a', type: 'output', value: 0.7 },
        { id: 'out-b', type: 'output', value: 0.02 }
      ],
      synapses: [
        { id: 's-1', sourceId: 'in-a', targetId: 'h-a', weight: 0.4 },
        { id: 's-2', sourceId: 'h-a', targetId: 'out-a', weight: -0.3 },
        { id: 's-3', sourceId: 'in-a', targetId: 'out-b', weight: 0.2 }
      ]
    });

    const first = deriveFilteredBrainGraphModel(base, {
      visibleNeuronTypes: ['input', 'hidden', 'output'],
      minActivationThreshold: 0.1,
      pinnedNeuronId: 'h-a'
    });
    const second = deriveFilteredBrainGraphModel(structuredClone(base), {
      visibleNeuronTypes: ['output', 'input', 'hidden'],
      minActivationThreshold: 0.1,
      pinnedNeuronId: 'h-a'
    });

    expect(first.nodes.map((node) => node.id)).toEqual(['h-a', 'in-a', 'out-a']);
    expect(first.edges.map((edge) => edge.id)).toEqual(['s-1', 's-2']);
    expect(first.edges.find((edge) => edge.id === 's-1')?.isInboundToPinned).toBe(true);
    expect(first.edges.find((edge) => edge.id === 's-2')?.isOutboundFromPinned).toBe(true);
    expect(first.pinnedNeuronMetadata).toEqual({
      id: 'h-a',
      type: 'hidden',
      activation: 0.45,
      inboundDegree: 1,
      outboundDegree: 1
    });
    expect(first.filterSettings).toEqual(second.filterSettings);
    expect(mapBrainLayoutChecksum(first)).toBe(mapBrainLayoutChecksum(second));
  });

  it('layers pinned-path edges last so highlighting remains visible in full mode', () => {
    const base = mapBrainToVisualizerModel({
      neurons: [
        { id: 'in-a', type: 'input', value: 0.9 },
        { id: 'h-a', type: 'hidden', value: 0.45 },
        { id: 'out-a', type: 'output', value: 0.7 },
        { id: 'out-b', type: 'output', value: 0.4 }
      ],
      synapses: [
        { id: 's-bg', sourceId: 'in-a', targetId: 'out-b', weight: 0.1 },
        { id: 's-in', sourceId: 'in-a', targetId: 'h-a', weight: 0.4 },
        { id: 's-out', sourceId: 'h-a', targetId: 'out-a', weight: -0.3 }
      ]
    });

    const filtered = deriveFilteredBrainGraphModel(base, {
      visibleNeuronTypes: ['input', 'hidden', 'output'],
      minActivationThreshold: 0,
      pinnedNeuronId: 'h-a',
      focusMode: 'full'
    });

    expect(filtered.edges.map((edge) => edge.id)).toEqual(['s-bg', 's-in', 's-out']);
    expect(filtered.edges.at(-1)?.isOutboundFromPinned).toBe(true);
  });

  it('supports deterministic incoming/outgoing focus modes for a selected neuron', () => {
    const base = mapBrainToVisualizerModel({
      neurons: [
        { id: 'in-a', type: 'input', value: 0.9 },
        { id: 'h-a', type: 'hidden', value: 0.45 },
        { id: 'out-a', type: 'output', value: 0.7 }
      ],
      synapses: [
        { id: 's-1', sourceId: 'in-a', targetId: 'h-a', weight: 0.4 },
        { id: 's-2', sourceId: 'h-a', targetId: 'out-a', weight: -0.3 },
        { id: 's-3', sourceId: 'in-a', targetId: 'out-a', weight: 0.2 }
      ]
    });

    const incomingFirst = deriveFilteredBrainGraphModel(base, {
      visibleNeuronTypes: ['input', 'hidden', 'output'],
      minActivationThreshold: 0,
      selectedNeuronId: 'h-a',
      focusMode: 'incoming',
      pinnedNeuronId: 'h-a'
    });
    const incomingSecond = deriveFilteredBrainGraphModel(structuredClone(base), {
      visibleNeuronTypes: ['output', 'hidden', 'input'],
      minActivationThreshold: 0,
      selectedNeuronId: 'h-a',
      focusMode: 'incoming',
      pinnedNeuronId: 'h-a'
    });

    expect(incomingFirst.edges.map((edge) => edge.id)).toEqual(['s-1']);
    expect(incomingFirst.nodes.map((node) => node.id)).toEqual(['h-a', 'in-a']);
    expect(incomingFirst.focusMode).toBe('incoming');
    expect(incomingFirst.selectedNeuronId).toBe('h-a');
    expect(mapBrainLayoutChecksum(incomingFirst)).toBe(mapBrainLayoutChecksum(incomingSecond));

    const outgoing = deriveFilteredBrainGraphModel(base, {
      visibleNeuronTypes: ['input', 'hidden', 'output'],
      minActivationThreshold: 0,
      selectedNeuronId: 'h-a',
      focusMode: 'outgoing',
      pinnedNeuronId: 'h-a'
    });

    expect(outgoing.edges.map((edge) => edge.id)).toEqual(['s-2']);
    expect(outgoing.nodes.map((node) => node.id)).toEqual(['h-a', 'out-a']);
    expect(outgoing.pinnedNeuronMetadata).toEqual({
      id: 'h-a',
      type: 'hidden',
      activation: 0.45,
      inboundDegree: 0,
      outboundDegree: 1
    });
  });

  it('emphasizes incoming paths for selected output neuron without dropping non-related edges', () => {
    const base = mapBrainToVisualizerModel({
      neurons: [
        { id: 'in-a', type: 'input', value: 0.9 },
        { id: 'in-b', type: 'input', value: 0.6 },
        { id: 'h-a', type: 'hidden', value: 0.45 },
        { id: 'out-a', type: 'output', value: 0.7 },
        { id: 'out-b', type: 'output', value: 0.4 }
      ],
      synapses: [
        { id: 's-bg', sourceId: 'in-a', targetId: 'out-b', weight: 0.15 },
        { id: 's-in-1', sourceId: 'in-b', targetId: 'out-a', weight: 0.2 },
        { id: 's-in-2', sourceId: 'h-a', targetId: 'out-a', weight: -0.35 }
      ]
    });

    const first = deriveFilteredBrainGraphModel(base, {
      visibleNeuronTypes: ['input', 'hidden', 'output'],
      minActivationThreshold: 0,
      emphasizedOutputNeuronId: 'out-a',
      focusMode: 'full'
    });
    const second = deriveFilteredBrainGraphModel(structuredClone(base), {
      visibleNeuronTypes: ['output', 'hidden', 'input'],
      minActivationThreshold: 0,
      emphasizedOutputNeuronId: 'out-a',
      focusMode: 'full'
    });

    expect(first.edges.map((edge) => edge.id)).toEqual(['s-bg', 's-in-1', 's-in-2']);
    expect(first.edges.find((edge) => edge.id === 's-bg')?.emphasisOpacity).toBe(0.2);
    expect(first.edges.find((edge) => edge.id === 's-in-1')?.isIncomingToEmphasizedOutput).toBe(true);
    expect(first.nodes.find((node) => node.id === 'out-a')?.isEmphasizedOutputTarget).toBe(true);
    expect(first.nodes.find((node) => node.id === 'h-a')?.isEmphasizedOutputSource).toBe(true);
    expect(first.emphasizedOutputNeuronMetadata).toEqual({
      id: 'out-a',
      incomingEdgeCount: 2,
      sourceNeuronCount: 2
    });
    expect(mapBrainLayoutChecksum(first)).toBe(mapBrainLayoutChecksum(second));
  });
});

describe('brain graph viewport transforms', () => {
  it('derives deterministic fit transform from bounds and viewbox size', () => {
    const model = createViewportTestModel();

    const first = createBrainViewportFitTransform(model);
    const second = createBrainViewportFitTransform(structuredClone(model));

    expect(first).toEqual({
      scale: 1.644444,
      translateX: -173.333333,
      translateY: -96.666667
    });
    expect(second).toEqual(first);
  });

  it('zooms in and out deterministically around the canvas center', () => {
    const model = createViewportTestModel();
    const fit = createBrainViewportFitTransform(model);

    const zoomIn = applyBrainViewportZoom(fit, 1);
    const zoomOut = applyBrainViewportZoom(zoomIn, -1);

    expect(zoomIn).toEqual({
      scale: 2.055555,
      translateX: -296.666666,
      translateY: -158.333334
    });
    expect(zoomOut).toEqual(fit);
  });

  it('clamps zoom operations to min/max scale bounds', () => {
    const extremeIn = applyBrainViewportZoom({ scale: 10, translateX: 0, translateY: 0 }, 1);
    const extremeOut = applyBrainViewportZoom({ scale: 0.01, translateX: 0, translateY: 0 }, -1);

    expect(extremeIn.scale).toBe(4);
    expect(extremeOut.scale).toBe(0.5);
  });

  it('fits selected neuron deterministically and falls back to graph fit with no selection', () => {
    const model = createViewportTestModel();

    const selectedNeuronFit = createBrainViewportFitSelectionTransform(model, { selectedNeuronId: 'h-1' });
    const fallbackFit = createBrainViewportFitSelectionTransform(model, { selectedNeuronId: 'missing' });

    expect(selectedNeuronFit).toEqual({
      scale: 4,
      translateX: -882,
      translateY: -452
    });
    expect(fallbackFit).toEqual(createBrainViewportFitTransform(model));
  });

  it('fits selected synapse endpoint context deterministically', () => {
    const model = createViewportTestModel();

    const selectedSynapseFit = createBrainViewportFitSelectionTransform(model, { selectedSynapseId: 's-1' });

    expect(selectedSynapseFit).toEqual({
      scale: 3.288889,
      translateX: -962.666667,
      translateY: -344.977778
    });
  });
});

describe('deriveBrainVisualizerLegend', () => {
  it('returns empty legend for null model', () => {
    const legend = deriveBrainVisualizerLegend(null);
    expect(legend.neuronTypes).toEqual([]);
    expect(legend.synapseCues).toHaveLength(2);
  });

  it('returns empty legend for model without nodes', () => {
    const legend = deriveBrainVisualizerLegend({ nodes: [], edges: [] });
    expect(legend.neuronTypes).toEqual([]);
  });

  it('extracts neuron types from model deterministically', () => {
    const model = {
      nodes: [
        { id: 'n1', type: 'hidden' },
        { id: 'n2', type: 'input' },
        { id: 'n3', type: 'output' }
      ],
      edges: []
    };

    const legend = deriveBrainVisualizerLegend(model);

    expect(legend.neuronTypes).toHaveLength(3);
    expect(legend.neuronTypes[0].type).toBe('input');
    expect(legend.neuronTypes[1].type).toBe('hidden');
    expect(legend.neuronTypes[2].type).toBe('output');
  });

  it('sorts neuron types by layer order then alphabetically', () => {
    const model = {
      nodes: [
        { id: 'n1', type: 'output' },
        { id: 'n2', type: 'hidden' },
        { id: 'n3', type: 'input' },
        { id: 'n4', type: 'unknown' }
      ],
      edges: []
    };

    const legend = deriveBrainVisualizerLegend(model);

    expect(legend.neuronTypes.map((t) => t.type)).toEqual(['input', 'hidden', 'output', 'unknown']);
  });

  it('includes correct labels and colors for each neuron type', () => {
    const model = {
      nodes: [
        { id: 'n1', type: 'input' },
        { id: 'n2', type: 'hidden' },
        { id: 'n3', type: 'output' }
      ],
      edges: []
    };

    const legend = deriveBrainVisualizerLegend(model);

    expect(legend.neuronTypes[0]).toMatchObject({
      type: 'input',
      label: 'Input',
      color: expect.objectContaining({ hue: 210 })
    });
    expect(legend.neuronTypes[1]).toMatchObject({
      type: 'hidden',
      label: 'Hidden',
      color: expect.objectContaining({ hue: 270 })
    });
    expect(legend.neuronTypes[2]).toMatchObject({
      type: 'output',
      label: 'Output',
      color: expect.objectContaining({ hue: 150 })
    });
  });

  it('includes synapse polarity cues', () => {
    const legend = deriveBrainVisualizerLegend({ nodes: [], edges: [] });

    expect(legend.synapseCues).toHaveLength(2);
    expect(legend.synapseCues[0]).toMatchObject({
      polarity: 'excitatory',
      color: '#22c55e',
      description: 'Positive weight (excitatory)'
    });
    expect(legend.synapseCues[1]).toMatchObject({
      polarity: 'inhibitory',
      color: '#ef4444',
      description: 'Negative weight (inhibitory)'
    });
  });

  it('does not mutate input model', () => {
    const model = {
      nodes: [
        { id: 'n1', type: 'input' }
      ],
      edges: []
    };
    const originalNodes = JSON.stringify(model.nodes);

    deriveBrainVisualizerLegend(model);

    expect(JSON.stringify(model.nodes)).toBe(originalNodes);
  });
});
