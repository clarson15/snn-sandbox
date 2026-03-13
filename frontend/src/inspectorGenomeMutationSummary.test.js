import { describe, expect, it } from 'vitest';

import {
  HIDDEN_NEURON_EMPTY_MESSAGE,
  PARENT_UNAVAILABLE_MESSAGE,
  SYNAPSE_EMPTY_MESSAGE,
  TRAIT_EMPTY_MESSAGE,
  deriveInspectorGenomeMutationSummaryModel
} from './inspectorGenomeMutationSummary';

describe('deriveInspectorGenomeMutationSummaryModel', () => {
  it('is hidden for generation-0 organisms with no parent id', () => {
    const selected = {
      id: 'founder-1',
      generation: 0,
      traits: { size: 1, speed: 1, adolescenceAge: 40, eggHatchTime: 0, visionRange: 1, turnRate: 1, metabolism: 1 },
      brain: { neurons: [], synapses: [] }
    };

    const model = deriveInspectorGenomeMutationSummaryModel(selected, [selected]);

    expect(model.isVisible).toBe(false);
  });

  it('returns deterministic sorted changes and remains stable under array permutation', () => {
    const parent = {
      id: 'parent-1',
      traits: { size: 1, speed: 1, adolescenceAge: 30, eggHatchTime: 2, visionRange: 10, turnRate: 0.1, metabolism: 0.05 },
      brain: {
        neurons: [
          { id: 'n-hidden-2', type: 'hidden' },
          { id: 'in-energy', type: 'input' },
          { id: 'n-hidden-1', type: 'hidden' }
        ],
        synapses: [
          { sourceId: 'in-food-direction', targetId: 'out-turn-left' },
          { sourceId: 'in-energy', targetId: 'out-forward' }
        ]
      }
    };

    const selected = {
      id: 'child-1',
      lineage: { parentId: 'parent-1' },
      traits: { size: 1.2, speed: 1, adolescenceAge: 45, eggHatchTime: 5, visionRange: 9, turnRate: 0.2, metabolism: 0.05 },
      brain: {
        neurons: [
          { id: 'n-hidden-3', type: 'hidden' },
          { id: 'n-hidden-2', type: 'hidden' },
          { id: 'in-energy', type: 'input' }
        ],
        synapses: [
          { sourceId: 'in-energy', targetId: 'out-forward' },
          { sourceId: 'in-energy', targetId: 'out-turn-right' }
        ]
      }
    };

    const modelA = deriveInspectorGenomeMutationSummaryModel(selected, [selected, parent]);
    const modelB = deriveInspectorGenomeMutationSummaryModel(
      {
        ...selected,
        brain: {
          ...selected.brain,
          neurons: [...selected.brain.neurons].reverse(),
          synapses: [...selected.brain.synapses].reverse()
        }
      },
      [
        { ...parent, brain: { ...parent.brain, neurons: [...parent.brain.neurons].reverse(), synapses: [...parent.brain.synapses].reverse() } },
        selected
      ]
    );

    expect(modelA).toEqual(modelB);
    expect(modelA.traitDeltas.map((item) => item.key)).toEqual(['size', 'adolescenceAge', 'eggHatchTime', 'visionRange', 'turnRate']);
    expect(modelA.synapseChanges).toEqual([
      { sourceId: 'in-energy', targetId: 'out-turn-right', changeType: 'added' },
      { sourceId: 'in-food-direction', targetId: 'out-turn-left', changeType: 'removed' }
    ]);
    expect(modelA.hiddenNeuronChanges).toEqual([
      { neuronId: 'n-hidden-1', changeType: 'removed' },
      { neuronId: 'n-hidden-3', changeType: 'added' }
    ]);
  });

  it('returns deterministic empty messages when categories have no changes', () => {
    const parent = {
      id: 'parent-1',
      traits: { size: 1, speed: 1, adolescenceAge: 30, eggHatchTime: 2, visionRange: 10, turnRate: 0.1, metabolism: 0.05 },
      brain: {
        neurons: [{ id: 'in-energy', type: 'input' }],
        synapses: [{ sourceId: 'in-energy', targetId: 'out-forward' }]
      }
    };
    const selected = {
      id: 'child-1',
      lineage: { parentId: 'parent-1' },
      traits: { ...parent.traits },
      brain: {
        neurons: [{ id: 'in-energy', type: 'input' }],
        synapses: [{ sourceId: 'in-energy', targetId: 'out-forward' }]
      }
    };

    const model = deriveInspectorGenomeMutationSummaryModel(selected, [selected, parent]);

    expect(model.traitDeltas).toEqual([]);
    expect(model.synapseChanges).toEqual([]);
    expect(model.hiddenNeuronChanges).toEqual([]);
    expect(TRAIT_EMPTY_MESSAGE).toBe('No trait deltas.');
    expect(SYNAPSE_EMPTY_MESSAGE).toBe('No synapse structure changes.');
    expect(HIDDEN_NEURON_EMPTY_MESSAGE).toBe('No hidden-neuron structure changes.');
  });

  it('is visible but reports deterministic unavailable message when parent snapshot is missing', () => {
    const selected = {
      id: 'child-1',
      lineage: { parentId: 'parent-missing' },
      traits: {},
      brain: { neurons: [], synapses: [] }
    };

    const model = deriveInspectorGenomeMutationSummaryModel(selected, [selected]);
    expect(model.isVisible).toBe(true);
    expect(model.unavailableMessage).toBe(PARENT_UNAVAILABLE_MESSAGE);
  });
});
