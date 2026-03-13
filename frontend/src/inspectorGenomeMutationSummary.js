const MUTATION_TRAIT_FIELDS = Object.freeze([
  Object.freeze({ key: 'size', label: 'size' }),
  Object.freeze({ key: 'speed', label: 'speed' }),
  Object.freeze({ key: 'adolescenceAge', label: 'adolescence_age' }),
  Object.freeze({ key: 'visionRange', label: 'vision_range' }),
  Object.freeze({ key: 'turnRate', label: 'turn_rate' }),
  Object.freeze({ key: 'metabolism', label: 'metabolism' })
]);

const SYNAPSE_EMPTY_MESSAGE = 'No synapse structure changes.';
const HIDDEN_NEURON_EMPTY_MESSAGE = 'No hidden-neuron structure changes.';
const TRAIT_EMPTY_MESSAGE = 'No trait deltas.';
const PARENT_UNAVAILABLE_MESSAGE = 'Genome mutation summary unavailable: selected organism has no parent snapshot in the current world state.';

function resolveParentId(organism) {
  const lineageParentId = organism?.lineage?.parentId;
  if (typeof lineageParentId === 'string' && lineageParentId.trim().length > 0) {
    return lineageParentId;
  }

  const directParentId = organism?.parentId;
  if (typeof directParentId === 'string' && directParentId.trim().length > 0) {
    return directParentId;
  }

  return null;
}

function compareStrings(a, b) {
  return String(a).localeCompare(String(b));
}

function deriveInspectorGenomeMutationSummaryModel(selectedOrganism, organisms) {
  const parentId = resolveParentId(selectedOrganism);
  if (!parentId) {
    return {
      isVisible: false,
      parentId: null,
      unavailableMessage: '',
      traitDeltas: [],
      synapseChanges: [],
      hiddenNeuronChanges: []
    };
  }

  const parentOrganism = Array.isArray(organisms)
    ? organisms.find((organism) => organism?.id === parentId)
    : null;

  if (!parentOrganism) {
    return {
      isVisible: true,
      parentId,
      unavailableMessage: PARENT_UNAVAILABLE_MESSAGE,
      traitDeltas: [],
      synapseChanges: [],
      hiddenNeuronChanges: []
    };
  }

  const traitDeltas = MUTATION_TRAIT_FIELDS
    .map((field) => {
      const selectedValue = selectedOrganism?.traits?.[field.key];
      const parentValue = parentOrganism?.traits?.[field.key];
      if (!Number.isFinite(selectedValue) || !Number.isFinite(parentValue)) {
        return null;
      }

      const delta = selectedValue - parentValue;
      if (delta === 0) {
        return null;
      }

      return {
        key: field.key,
        label: field.label,
        delta
      };
    })
    .filter(Boolean);

  const selectedSynapseKeys = new Set(
    (selectedOrganism?.brain?.synapses ?? [])
      .map((synapse) => (synapse?.sourceId && synapse?.targetId ? `${synapse.sourceId}->${synapse.targetId}` : null))
      .filter(Boolean)
  );
  const parentSynapseKeys = new Set(
    (parentOrganism?.brain?.synapses ?? [])
      .map((synapse) => (synapse?.sourceId && synapse?.targetId ? `${synapse.sourceId}->${synapse.targetId}` : null))
      .filter(Boolean)
  );

  const synapseChanges = [];
  for (const synapseKey of selectedSynapseKeys) {
    if (!parentSynapseKeys.has(synapseKey)) {
      const [sourceId, targetId] = synapseKey.split('->');
      synapseChanges.push({ sourceId, targetId, changeType: 'added' });
    }
  }
  for (const synapseKey of parentSynapseKeys) {
    if (!selectedSynapseKeys.has(synapseKey)) {
      const [sourceId, targetId] = synapseKey.split('->');
      synapseChanges.push({ sourceId, targetId, changeType: 'removed' });
    }
  }
  synapseChanges.sort((left, right) => (
    compareStrings(left.sourceId, right.sourceId)
    || compareStrings(left.targetId, right.targetId)
    || compareStrings(left.changeType, right.changeType)
  ));

  const selectedHiddenNeuronIds = new Set(
    (selectedOrganism?.brain?.neurons ?? [])
      .filter((neuron) => neuron?.type === 'hidden')
      .map((neuron) => neuron.id)
      .filter(Boolean)
  );
  const parentHiddenNeuronIds = new Set(
    (parentOrganism?.brain?.neurons ?? [])
      .filter((neuron) => neuron?.type === 'hidden')
      .map((neuron) => neuron.id)
      .filter(Boolean)
  );

  const hiddenNeuronChanges = [];
  for (const neuronId of selectedHiddenNeuronIds) {
    if (!parentHiddenNeuronIds.has(neuronId)) {
      hiddenNeuronChanges.push({ neuronId, changeType: 'added' });
    }
  }
  for (const neuronId of parentHiddenNeuronIds) {
    if (!selectedHiddenNeuronIds.has(neuronId)) {
      hiddenNeuronChanges.push({ neuronId, changeType: 'removed' });
    }
  }
  hiddenNeuronChanges.sort((left, right) => compareStrings(left.neuronId, right.neuronId) || compareStrings(left.changeType, right.changeType));

  return {
    isVisible: true,
    parentId,
    unavailableMessage: '',
    traitDeltas,
    synapseChanges,
    hiddenNeuronChanges
  };
}

export {
  HIDDEN_NEURON_EMPTY_MESSAGE,
  MUTATION_TRAIT_FIELDS,
  PARENT_UNAVAILABLE_MESSAGE,
  SYNAPSE_EMPTY_MESSAGE,
  TRAIT_EMPTY_MESSAGE,
  deriveInspectorGenomeMutationSummaryModel
};
