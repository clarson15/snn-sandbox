function compareSynapses(left, right) {
  const sourceDelta = left.sourceId.localeCompare(right.sourceId);
  if (sourceDelta !== 0) {
    return sourceDelta;
  }

  const targetDelta = left.targetId.localeCompare(right.targetId);
  if (targetDelta !== 0) {
    return targetDelta;
  }

  return left.id.localeCompare(right.id);
}

function formatMetricValue(value) {
  return Number.isFinite(value) ? value.toFixed(3) : 'Unavailable';
}

function resolveSpikeState(rawNeuron, currentPotential, thresholdValue) {
  const explicitSpikeState = rawNeuron?.spikeState ?? rawNeuron?.isSpiking ?? rawNeuron?.spiked ?? rawNeuron?.fired;
  if (typeof explicitSpikeState === 'boolean') {
    return explicitSpikeState ? 'Spiking' : 'Idle';
  }

  if (Number.isFinite(currentPotential) && Number.isFinite(thresholdValue)) {
    return currentPotential >= thresholdValue ? 'Spiking' : 'Idle';
  }

  return 'Unavailable';
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
  const currentPotential = Number(neuron?.value);

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
    thresholdLabel: formatMetricValue(thresholdValue),
    currentPotentialLabel: formatMetricValue(currentPotential),
    spikeStateLabel: resolveSpikeState(rawNeuron, currentPotential, thresholdValue),
    incomingSynapses,
    outgoingSynapses
  };
}
