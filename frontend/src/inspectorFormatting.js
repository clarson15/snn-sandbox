import { formatNeuronBindingList } from './neuronLabels';

const INSPECTOR_PLACEHOLDER = '—';

function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function formatFixed(value, digits) {
  if (!isFiniteNumber(value)) {
    return INSPECTOR_PLACEHOLDER;
  }

  return value.toFixed(digits);
}

function formatInteger(value) {
  if (!Number.isInteger(value)) {
    return INSPECTOR_PLACEHOLDER;
  }

  return String(value);
}

function formatPosition(x, y) {
  const formattedX = formatFixed(x, 3);
  const formattedY = formatFixed(y, 3);

  if (formattedX === INSPECTOR_PLACEHOLDER || formattedY === INSPECTOR_PLACEHOLDER) {
    return INSPECTOR_PLACEHOLDER;
  }

  return `(${formattedX}, ${formattedY})`;
}

function formatFoodDistance(value) {
  return formatFixed(value, 3);
}

function formatBirthMode(eggHatchTime) {
  if (!isFiniteNumber(eggHatchTime)) {
    return INSPECTOR_PLACEHOLDER;
  }

  return eggHatchTime > 0 ? 'Egg-laying' : 'Live birth';
}

function countNeuronsByType(neurons, type) {
  const count = Array.isArray(neurons)
    ? neurons.filter((neuron) => neuron?.type === type).length
    : 0;

  return count > 0 ? String(count) : INSPECTOR_PLACEHOLDER;
}

function deriveBindingIds(brain, type) {
  const neurons = Array.isArray(brain?.neurons) ? brain.neurons : [];
  const neuronIds = neurons
    .filter((neuron) => neuron?.type === type && typeof neuron?.id === 'string')
    .map((neuron) => neuron.id);

  if (neuronIds.length > 0) {
    return neuronIds;
  }

  const synapses = Array.isArray(brain?.synapses) ? brain.synapses : [];
  if (type === 'input') {
    return synapses
      .map((synapse) => synapse?.sourceId)
      .filter((id) => typeof id === 'string' && id.startsWith('in-'));
  }

  if (type === 'output') {
    return synapses
      .map((synapse) => synapse?.targetId)
      .filter((id) => typeof id === 'string' && id.startsWith('out-'));
  }

  return [];
}

function resolveParentId(organism) {
  const parentId = organism?.lineage?.parentId ?? organism?.parentId;
  if (typeof parentId === 'string' && parentId.trim().length > 0) {
    return parentId;
  }

  return INSPECTOR_PLACEHOLDER;
}

function resolveOffspringCount(organism) {
  const lineageCount = organism?.lineage?.offspringCount;
  if (Number.isInteger(lineageCount) && lineageCount >= 0) {
    return String(lineageCount);
  }

  const directCount = organism?.offspringCount;
  if (Number.isInteger(directCount) && directCount >= 0) {
    return String(directCount);
  }

  const offspringIds = organism?.offspringIds;
  if (Array.isArray(offspringIds)) {
    return String(offspringIds.length);
  }

  return INSPECTOR_PLACEHOLDER;
}

function formatInspectorSnapshot(organism, nearestFoodDistance) {
  const brain = organism?.brain ?? {};
  const neurons = Array.isArray(brain.neurons) ? brain.neurons : [];
  const synapses = Array.isArray(brain.synapses) ? brain.synapses : [];

  return {
    id: typeof organism?.id === 'string' && organism.id.trim().length > 0 ? organism.id : INSPECTOR_PLACEHOLDER,
    lifeStage: typeof organism?.lifeStage === 'string' ? organism.lifeStage : 'live',
    generation: formatInteger(organism?.generation),
    parentId: resolveParentId(organism),
    offspringCount: resolveOffspringCount(organism),
    age: formatInteger(organism?.age),
    incubationAge: formatFixed(organism?.incubationAge, 3),
    energy: formatFixed(organism?.energy, 3),
    position: formatPosition(organism?.x, organism?.y),
    nearestFoodDistance: formatFoodDistance(nearestFoodDistance),
    size: formatFixed(organism?.traits?.size, 3),
    speed: formatFixed(organism?.traits?.speed, 3),
    adolescenceAge: formatFixed(organism?.traits?.adolescenceAge, 3),
    eggHatchTime: formatFixed(organism?.traits?.eggHatchTime, 3),
    birthMode: formatBirthMode(organism?.traits?.eggHatchTime),
    maturationPeriod: formatFixed(organism?.traits?.adolescenceAge, 3),
    visionRange: formatFixed(organism?.traits?.visionRange, 3),
    turnRate: formatFixed(organism?.traits?.turnRate, 3),
    metabolism: formatFixed(organism?.traits?.metabolism, 3),
    neuronCount: formatInteger(neurons.length),
    inputNeuronCount: countNeuronsByType(neurons, 'input'),
    hiddenNeuronCount: countNeuronsByType(neurons, 'hidden'),
    outputNeuronCount: countNeuronsByType(neurons, 'output'),
    synapseCount: formatInteger(synapses.length),
    inputBindings: formatNeuronBindingList(deriveBindingIds(brain, 'input'), 'input', INSPECTOR_PLACEHOLDER),
    outputBindings: formatNeuronBindingList(deriveBindingIds(brain, 'output'), 'output', INSPECTOR_PLACEHOLDER)
  };
}

export {
  INSPECTOR_PLACEHOLDER,
  formatFixed,
  formatFoodDistance,
  formatInspectorSnapshot
};
