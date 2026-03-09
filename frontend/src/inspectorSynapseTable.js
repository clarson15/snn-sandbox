export const INSPECTOR_SYNAPSE_TABLE_EMPTY_STATE = 'No synapses for selected organism.';

function normalizeText(value) {
  return typeof value === 'string' ? value : '';
}

function normalizeWeight(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function compareSynapses(left, right) {
  const sourceCompare = normalizeText(left?.sourceId).localeCompare(normalizeText(right?.sourceId));
  if (sourceCompare !== 0) {
    return sourceCompare;
  }

  const targetCompare = normalizeText(left?.targetId).localeCompare(normalizeText(right?.targetId));
  if (targetCompare !== 0) {
    return targetCompare;
  }

  const idCompare = normalizeText(left?.id).localeCompare(normalizeText(right?.id));
  if (idCompare !== 0) {
    return idCompare;
  }

  return normalizeWeight(left?.weight) - normalizeWeight(right?.weight);
}

function formatWeight(weight) {
  return normalizeWeight(weight).toFixed(3);
}

export function deriveInspectorSynapseTableRows(selectedOrganism) {
  const synapses = Array.isArray(selectedOrganism?.brain?.synapses) ? selectedOrganism.brain.synapses : [];

  return [...synapses]
    .sort(compareSynapses)
    .map((synapse, index) => ({
      key: `${normalizeText(synapse?.sourceId)}->${normalizeText(synapse?.targetId)}:${normalizeText(synapse?.id)}:${index}`,
      sourceNeuron: normalizeText(synapse?.sourceId) || '—',
      targetNeuron: normalizeText(synapse?.targetId) || '—',
      weight: formatWeight(synapse?.weight)
    }));
}
