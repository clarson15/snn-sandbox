const LAYER_ORDER = ['input', 'hidden', 'output'];
const SYNAPSE_WEIGHT_MIN = -1;
const SYNAPSE_WEIGHT_MAX = 1;
const SYNAPSE_STROKE_MIN = 1.25;
const SYNAPSE_STROKE_MAX = 4;

const NEURON_VALUE_KEYS = ['value', 'activation', 'state', 'signal'];

function layerRank(type) {
  const rank = LAYER_ORDER.indexOf(type);
  return rank === -1 ? LAYER_ORDER.length : rank;
}

function resolveNeuronValue(neuron) {
  for (const key of NEURON_VALUE_KEYS) {
    const candidate = Number(neuron?.[key]);
    if (Number.isFinite(candidate)) {
      return candidate;
    }
  }

  return 0;
}

export function mapNeuronValueToColor(value) {
  const numericValue = Number(value);
  const clamped = Number.isFinite(numericValue)
    ? Math.max(SYNAPSE_WEIGHT_MIN, Math.min(SYNAPSE_WEIGHT_MAX, numericValue))
    : 0;
  const magnitude = Math.abs(clamped);
  const saturation = Number((20 + magnitude * 75).toFixed(3));
  const lightness = Number((24 + magnitude * 24).toFixed(3));

  if (clamped > 0) {
    return {
      hue: 145,
      saturation,
      lightness,
      cssColor: `hsl(145 ${saturation}% ${lightness}%)`
    };
  }

  if (clamped < 0) {
    return {
      hue: 0,
      saturation,
      lightness,
      cssColor: `hsl(0 ${saturation}% ${lightness}%)`
    };
  }

  return {
    hue: 210,
    saturation: 18,
    lightness: 28,
    cssColor: 'hsl(210 18% 28%)'
  };
}

export function mapSynapseWeightToCue(weight) {
  const numericWeight = Number(weight);
  const clampedWeight = Number.isFinite(numericWeight)
    ? Math.max(SYNAPSE_WEIGHT_MIN, Math.min(SYNAPSE_WEIGHT_MAX, numericWeight))
    : 0;
  const magnitude = Math.abs(clampedWeight);
  const strokeWidth = Number((SYNAPSE_STROKE_MIN + magnitude * (SYNAPSE_STROKE_MAX - SYNAPSE_STROKE_MIN)).toFixed(3));

  return {
    weight: clampedWeight,
    magnitude,
    strokeWidth,
    color: clampedWeight >= 0 ? '#22c55e' : '#ef4444',
    polarityLabel: clampedWeight >= 0 ? 'excitatory (+)' : 'inhibitory (-)'
  };
}

/**
 * @param {unknown} brain
 * @returns {{nodes: {id:string,type:string,x:number,y:number,value:number,fillColor:string,labelColor:string}[], edges: {id:string,sourceId:string,targetId:string,weight:number,strokeWidth:number,color:string,polarityLabel:string}[]} | null}
 */
export function mapBrainLayoutChecksum(model) {
  if (!model || !Array.isArray(model.nodes) || !Array.isArray(model.edges)) {
    return '';
  }

  const nodeSignature = model.nodes
    .map((node) => `${node.id}@${Number(node.x).toFixed(3)},${Number(node.y).toFixed(3)}`)
    .join('|');
  const edgeSignature = model.edges
    .map((edge) => `${edge.id}:${edge.sourceId}->${edge.targetId}:${Number(edge.weight).toFixed(3)}`)
    .join('|');

  return `${nodeSignature}::${edgeSignature}`;
}

export function mapBrainToVisualizerModel(brain) {
  if (!brain || !Array.isArray(brain.neurons) || !Array.isArray(brain.synapses)) {
    return null;
  }

  const neurons = brain.neurons
    .filter((neuron) => neuron && typeof neuron.id === 'string')
    .map((neuron) => {
      const value = resolveNeuronValue(neuron);
      const color = mapNeuronValueToColor(value);

      return {
        id: neuron.id,
        type: typeof neuron.type === 'string' ? neuron.type : 'unknown',
        value,
        fillColor: color.cssColor,
        labelColor: Math.abs(value) >= 0.65 ? '#f8fafc' : '#cbd5e1'
      };
    })
    .sort((a, b) => {
      const rankDelta = layerRank(a.type) - layerRank(b.type);
      if (rankDelta !== 0) {
        return rankDelta;
      }
      return a.id.localeCompare(b.id);
    });

  if (neurons.length === 0) {
    return null;
  }

  const layerCounts = new Map();
  for (const neuron of neurons) {
    layerCounts.set(neuron.type, (layerCounts.get(neuron.type) ?? 0) + 1);
  }

  const layerOffsets = new Map();
  for (const neuron of neurons) {
    const used = layerOffsets.get(neuron.type) ?? 0;
    const total = layerCounts.get(neuron.type) ?? 1;
    layerOffsets.set(neuron.type, used + 1);

    neuron.x = 120 + layerRank(neuron.type) * 180;
    neuron.y = 60 + ((used + 1) / (total + 1)) * 180;
  }

  const nodeById = new Map(neurons.map((node) => [node.id, node]));

  const edges = brain.synapses
    .filter((synapse) => synapse && typeof synapse.sourceId === 'string' && typeof synapse.targetId === 'string' && Number.isFinite(synapse.weight))
    .filter((synapse) => nodeById.has(synapse.sourceId) && nodeById.has(synapse.targetId))
    .map((synapse, index) => {
      const cue = mapSynapseWeightToCue(synapse.weight);
      return {
        id: typeof synapse.id === 'string' ? synapse.id : `synapse-${index}`,
        sourceId: synapse.sourceId,
        targetId: synapse.targetId,
        weight: cue.weight,
        strokeWidth: cue.strokeWidth,
        color: cue.color,
        polarityLabel: cue.polarityLabel,
        weightLabel: cue.weight.toFixed(3)
      };
    })
    .sort((a, b) => a.id.localeCompare(b.id));

  return {
    nodes: neurons,
    edges
  };
}
