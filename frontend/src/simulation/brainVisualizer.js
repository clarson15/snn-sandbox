const LAYER_ORDER = ['input', 'hidden', 'output'];
const SYNAPSE_WEIGHT_MIN = -1;
const SYNAPSE_WEIGHT_MAX = 1;
const SYNAPSE_STROKE_MIN = 1.25;
const SYNAPSE_STROKE_MAX = 4;

export const BRAIN_GRAPH_VIEWBOX = {
  width: 640,
  height: 300
};

export const BRAIN_GRAPH_ZOOM_LIMITS = {
  minScale: 0.5,
  maxScale: 4,
  stepMultiplier: 1.25
};

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
function roundTransformValue(value) {
  return Number(value.toFixed(6));
}

function clampViewportScale(scale, limits = BRAIN_GRAPH_ZOOM_LIMITS) {
  const numericScale = Number(scale);
  if (!Number.isFinite(numericScale)) {
    return 1;
  }

  return Math.max(limits.minScale, Math.min(limits.maxScale, numericScale));
}

export function mapBrainGraphBounds(model) {
  if (!model || !Array.isArray(model.nodes) || model.nodes.length === 0) {
    return null;
  }

  const xs = model.nodes.map((node) => node.x);
  const ys = model.nodes.map((node) => node.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);

  return {
    minX,
    maxX,
    minY,
    maxY,
    width: Math.max(1, maxX - minX),
    height: Math.max(1, maxY - minY)
  };
}

export function createBrainViewportFitTransform(model, options = {}) {
  const bounds = mapBrainGraphBounds(model);
  if (!bounds) {
    return {
      scale: 1,
      translateX: 0,
      translateY: 0
    };
  }

  const width = Number(options.width) || BRAIN_GRAPH_VIEWBOX.width;
  const height = Number(options.height) || BRAIN_GRAPH_VIEWBOX.height;
  const padding = Number.isFinite(options.padding) ? options.padding : 24;
  const limits = options.limits ?? BRAIN_GRAPH_ZOOM_LIMITS;

  const availableWidth = Math.max(1, width - padding * 2);
  const availableHeight = Math.max(1, height - padding * 2);
  const fitScale = Math.min(availableWidth / bounds.width, availableHeight / bounds.height);
  const scale = clampViewportScale(fitScale, limits);
  const translateX = (width - bounds.width * scale) / 2 - bounds.minX * scale;
  const translateY = (height - bounds.height * scale) / 2 - bounds.minY * scale;

  return {
    scale: roundTransformValue(scale),
    translateX: roundTransformValue(translateX),
    translateY: roundTransformValue(translateY)
  };
}

export function applyBrainViewportZoom(transform, direction, options = {}) {
  const width = Number(options.width) || BRAIN_GRAPH_VIEWBOX.width;
  const height = Number(options.height) || BRAIN_GRAPH_VIEWBOX.height;
  const limits = options.limits ?? BRAIN_GRAPH_ZOOM_LIMITS;
  const anchorX = Number.isFinite(options.anchorX) ? options.anchorX : width / 2;
  const anchorY = Number.isFinite(options.anchorY) ? options.anchorY : height / 2;
  const currentScale = clampViewportScale(transform?.scale ?? 1, limits);
  const currentTranslateX = Number(transform?.translateX) || 0;
  const currentTranslateY = Number(transform?.translateY) || 0;

  const zoomDirection = direction >= 0 ? 1 : -1;
  const nextScale = clampViewportScale(
    currentScale * (zoomDirection > 0 ? limits.stepMultiplier : 1 / limits.stepMultiplier),
    limits
  );

  const graphAnchorX = (anchorX - currentTranslateX) / currentScale;
  const graphAnchorY = (anchorY - currentTranslateY) / currentScale;
  const translateX = anchorX - graphAnchorX * nextScale;
  const translateY = anchorY - graphAnchorY * nextScale;

  return {
    scale: roundTransformValue(nextScale),
    translateX: roundTransformValue(translateX),
    translateY: roundTransformValue(translateY)
  };
}

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

function normalizeEmphasisSettings(settings = {}) {
  const hideNearZeroWeights = Boolean(settings.hideNearZeroWeights);
  const nearZeroThresholdCandidate = Number(settings.nearZeroThreshold);
  const nearZeroThreshold = Number.isFinite(nearZeroThresholdCandidate)
    ? Math.max(0, Math.min(1, nearZeroThresholdCandidate))
    : 0.1;
  const strongestEdgeCountCandidate = Number(settings.strongestEdgeCount);
  const strongestEdgeCount = Number.isFinite(strongestEdgeCountCandidate)
    ? Math.max(0, Math.floor(strongestEdgeCountCandidate))
    : 0;

  return {
    hideNearZeroWeights,
    nearZeroThreshold,
    strongestEdgeCount
  };
}

export function deriveEmphasizedBrainGraphModel(model, settings = {}) {
  if (!model || !Array.isArray(model.nodes) || !Array.isArray(model.edges)) {
    return null;
  }

  const normalized = normalizeEmphasisSettings(settings);
  const sortedEdges = [...model.edges].sort((a, b) => a.id.localeCompare(b.id));
  const visibleEdges = normalized.hideNearZeroWeights
    ? sortedEdges.filter((edge) => Math.abs(edge.weight) >= normalized.nearZeroThreshold)
    : sortedEdges;

  let strongestEdgeIds = new Set();
  if (normalized.strongestEdgeCount > 0 && visibleEdges.length > 0) {
    strongestEdgeIds = new Set(
      [...visibleEdges]
        .sort((left, right) => {
          const magnitudeDelta = Math.abs(right.weight) - Math.abs(left.weight);
          if (magnitudeDelta !== 0) {
            return magnitudeDelta;
          }
          return left.id.localeCompare(right.id);
        })
        .slice(0, normalized.strongestEdgeCount)
        .map((edge) => edge.id)
    );
  }

  const emphasizedEdges = visibleEdges.map((edge) => {
    const isStrongest = strongestEdgeIds.has(edge.id);
    const deemphasized = strongestEdgeIds.size > 0 && !isStrongest;

    return {
      ...edge,
      isStrongest,
      emphasisOpacity: deemphasized ? 0.25 : 1,
      emphasisStrokeWidth: isStrongest ? Number((edge.strokeWidth + 0.85).toFixed(3)) : edge.strokeWidth
    };
  });

  return {
    ...model,
    edges: emphasizedEdges,
    emphasisSettings: normalized
  };
}

export function mapBrainEmphasisChecksum(model, settings = {}) {
  const emphasized = deriveEmphasizedBrainGraphModel(model, settings);
  if (!emphasized) {
    return '';
  }

  const settingsKey = `${emphasized.emphasisSettings.hideNearZeroWeights ? 1 : 0}:${emphasized.emphasisSettings.nearZeroThreshold.toFixed(3)}:${emphasized.emphasisSettings.strongestEdgeCount}`;
  const edgeKey = emphasized.edges
    .map((edge) => `${edge.id}:${Number(edge.weight).toFixed(3)}:${edge.isStrongest ? 1 : 0}`)
    .join('|');

  return `${settingsKey}::${edgeKey}`;
}

function normalizeNeuronFilterSettings(settings = {}) {
  const minActivationThresholdCandidate = Number(settings.minActivationThreshold);
  const minActivationThreshold = Number.isFinite(minActivationThresholdCandidate)
    ? Math.max(0, Math.min(1, minActivationThresholdCandidate))
    : 0;
  const visibleNeuronTypes = new Set(
    Array.isArray(settings.visibleNeuronTypes)
      ? settings.visibleNeuronTypes
          .filter((type) => typeof type === 'string')
          .map((type) => type.toLowerCase())
      : LAYER_ORDER
  );

  return {
    minActivationThreshold,
    visibleNeuronTypes
  };
}

function normalizeFocusMode(mode) {
  if (mode === 'incoming' || mode === 'outgoing') {
    return mode;
  }

  return 'full';
}

export function deriveFilteredBrainGraphModel(model, settings = {}) {
  if (!model || !Array.isArray(model.nodes) || !Array.isArray(model.edges)) {
    return null;
  }

  const normalized = normalizeNeuronFilterSettings(settings);
  const filteredNodes = model.nodes
    .filter((node) => normalized.visibleNeuronTypes.has(String(node.type || '').toLowerCase()))
    .filter((node) => Math.abs(Number(node.value) || 0) >= normalized.minActivationThreshold)
    .sort((a, b) => a.id.localeCompare(b.id));
  const visibleNodeIds = new Set(filteredNodes.map((node) => node.id));

  const filteredEdges = model.edges
    .filter((edge) => visibleNodeIds.has(edge.sourceId) && visibleNodeIds.has(edge.targetId))
    .sort((a, b) => a.id.localeCompare(b.id));

  const selectedNeuronId = typeof settings.selectedNeuronId === 'string' && visibleNodeIds.has(settings.selectedNeuronId)
    ? settings.selectedNeuronId
    : null;
  const focusMode = normalizeFocusMode(settings.focusMode);

  const focusedEdges = selectedNeuronId === null || focusMode === 'full'
    ? filteredEdges
    : filteredEdges.filter((edge) => (focusMode === 'incoming' ? edge.targetId === selectedNeuronId : edge.sourceId === selectedNeuronId));

  const focusedNodeIds = selectedNeuronId === null || focusMode === 'full'
    ? visibleNodeIds
    : new Set([selectedNeuronId, ...focusedEdges.map((edge) => edge.sourceId), ...focusedEdges.map((edge) => edge.targetId)]);

  const focusedNodes = filteredNodes.filter((node) => focusedNodeIds.has(node.id));

  const pinnedNeuronId = typeof settings.pinnedNeuronId === 'string' && focusedNodeIds.has(settings.pinnedNeuronId)
    ? settings.pinnedNeuronId
    : null;

  const pinnedNeuron = pinnedNeuronId ? focusedNodes.find((node) => node.id === pinnedNeuronId) ?? null : null;
  const inboundDegree = pinnedNeuronId
    ? focusedEdges.filter((edge) => edge.targetId === pinnedNeuronId).length
    : 0;
  const outboundDegree = pinnedNeuronId
    ? focusedEdges.filter((edge) => edge.sourceId === pinnedNeuronId).length
    : 0;

  const edges = focusedEdges.map((edge) => {
    const isInboundToPinned = pinnedNeuronId !== null && edge.targetId === pinnedNeuronId;
    const isOutboundFromPinned = pinnedNeuronId !== null && edge.sourceId === pinnedNeuronId;
    const isPinnedPath = isInboundToPinned || isOutboundFromPinned;

    return {
      ...edge,
      isInboundToPinned,
      isOutboundFromPinned,
      isPinnedPath,
      emphasisOpacity: pinnedNeuronId === null ? edge.emphasisOpacity : isPinnedPath ? 1 : 0.2,
      emphasisStrokeWidth: isPinnedPath ? Number((edge.emphasisStrokeWidth + 1).toFixed(3)) : edge.emphasisStrokeWidth,
      color: isInboundToPinned ? '#38bdf8' : isOutboundFromPinned ? '#f59e0b' : edge.color
    };
  });

  return {
    ...model,
    nodes: focusedNodes,
    edges,
    selectedNeuronId,
    focusMode,
    pinnedNeuron,
    pinnedNeuronId,
    pinnedNeuronMetadata: pinnedNeuron
      ? {
          id: pinnedNeuron.id,
          type: pinnedNeuron.type,
          activation: Number(pinnedNeuron.value.toFixed(3)),
          inboundDegree,
          outboundDegree
        }
      : null,
    filterSettings: {
      minActivationThreshold: normalized.minActivationThreshold,
      visibleNeuronTypes: [...normalized.visibleNeuronTypes].sort((left, right) => left.localeCompare(right))
    }
  };
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
