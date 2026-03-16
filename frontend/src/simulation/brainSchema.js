export const BASE_INPUT_NEURON_IDS = Object.freeze([
  'in-age',
  'in-direction',
  'in-direction-cos',
  'in-energy',
  'in-food-detected',
  'in-food-direction',
  'in-food-distance',
  'in-size',
  'in-speed',
  'in-vision-range',
  'in-x',
  'in-y'
]);

export const PREDATOR_INPUT_NEURON_IDS = Object.freeze([
  'in-prey-distance',
  'in-prey-direction',
  'in-prey-detected'
]);

export const INPUT_NEURON_IDS = Object.freeze([
  ...BASE_INPUT_NEURON_IDS,
  ...PREDATOR_INPUT_NEURON_IDS
]);

export function getInputNeuronIdsForOrganismType(organismType = 'herbivore') {
  return organismType === 'predator'
    ? INPUT_NEURON_IDS
    : BASE_INPUT_NEURON_IDS;
}

export const OUTPUT_NEURON_IDS = Object.freeze([
  'out-forward',
  'out-turn-left',
  'out-turn-right'
]);

export function isInputNeuronId(id) {
  return INPUT_NEURON_IDS.includes(id);
}

export function isOutputNeuronId(id) {
  return OUTPUT_NEURON_IDS.includes(id) || id === 'out-move-forward' || id === 'out-move';
}

export function createNeuronDefinition(id, type, overrides = {}) {
  const base = {
    id,
    type,
    threshold: type === 'input' ? 0.5 : 1,
    decay: type === 'input' ? 0 : type === 'output' ? 0.8 : 0.85,
    resetPotential: 0,
    bias: 0,
    potential: 0,
    value: 0,
    activation: 0,
    signal: 0,
    spiked: false
  };

  return {
    ...base,
    ...overrides
  };
}
