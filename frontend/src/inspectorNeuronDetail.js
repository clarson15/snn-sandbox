function compareSynapses(left, right) {
  const sourceDelta = left.sourceId.localeCompare(right.sourceId);
  if (sourceDelta !== 0) {
    return sourceDelta;
  }

  const targetDelta = left.targetId.localeCompare(right.targetId);
  if (targetDelta !== 0) {
    return targetDelta;
  }

  const weightDelta = left.weight - right.weight;
  if (weightDelta !== 0) {
    return weightDelta;
  }

  return left.id.localeCompare(right.id);
}

function formatThresholdValue(value) {
  return Number.isFinite(value) ? value.toFixed(3) : 'Unavailable';
}

export function deriveNeuronDetailPanel(model, rawBrain, neuronId) {
  if (!model || !Array.isArray(model.nodes) || !Array.isArray(model.edges) || !neuronId) {
    return null;
  }

  const neuron = model.nodes.find((node) => node.id === neuronId);
  if (!neuron) {
    return null;
  }

  const rawNeuron = Array.isArray(rawBrain?.neurons)
    ? rawBrain.neurons.find((candidate) => candidate?.id === neuronId)
    : null;
  const thresholdValue = Number(rawNeuron?.threshold);

  const incomingSynapses = model.edges
    .filter((edge) => edge.targetId === neuronId)
    .sort(compareSynapses);
  const outgoingSynapses = model.edges
    .filter((edge) => edge.sourceId === neuronId)
    .sort(compareSynapses);

  return {
    neuronId,
    role: neuron.type,
    incomingCount: incomingSynapses.length,
    outgoingCount: outgoingSynapses.length,
    thresholdLabel: formatThresholdValue(thresholdValue),
    incomingSynapses,
    outgoingSynapses
  };
}
