const LAYER_ORDER = ['input', 'hidden', 'output'];

function layerRank(type) {
  const rank = LAYER_ORDER.indexOf(type);
  return rank === -1 ? LAYER_ORDER.length : rank;
}

/**
 * @param {unknown} brain
 * @returns {{nodes: {id:string,type:string,x:number,y:number}[], edges: {id:string,sourceId:string,targetId:string,weight:number,strokeWidth:number,color:string}[]} | null}
 */
export function mapBrainToVisualizerModel(brain) {
  if (!brain || !Array.isArray(brain.neurons) || !Array.isArray(brain.synapses)) {
    return null;
  }

  const neurons = brain.neurons
    .filter((neuron) => neuron && typeof neuron.id === 'string')
    .map((neuron) => ({
      id: neuron.id,
      type: typeof neuron.type === 'string' ? neuron.type : 'unknown'
    }))
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
      const weight = Number(synapse.weight);
      return {
        id: typeof synapse.id === 'string' ? synapse.id : `synapse-${index}`,
        sourceId: synapse.sourceId,
        targetId: synapse.targetId,
        weight,
        strokeWidth: Number((1 + Math.abs(weight) * 2).toFixed(3)),
        color: weight >= 0 ? '#22d3ee' : '#f97316'
      };
    })
    .sort((a, b) => a.id.localeCompare(b.id));

  return {
    nodes: neurons,
    edges
  };
}
