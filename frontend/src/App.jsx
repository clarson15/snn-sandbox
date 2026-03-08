import { useEffect, useMemo, useRef, useState } from 'react';

import { createWorldState, stepWorld } from './simulation/engine';
import {
  DEFAULT_CONFIG,
  createInitialWorldFromConfig,
  loadSimulationConfig,
  normalizeSimulationConfig,
  resolveSeed,
  saveSimulationConfig,
  toEngineStepParams,
  validateSimulationConfig
} from './simulation/config';
import { createSeededPrng } from './simulation/prng';
import {
  applyBrainViewportZoom,
  BRAIN_GRAPH_VIEWBOX,
  createBrainViewportFitTransform,
  deriveEmphasizedBrainGraphModel,
  deriveFilteredBrainGraphModel,
  mapBrainEmphasisChecksum,
  mapBrainLayoutChecksum,
  mapBrainToVisualizerModel
} from './simulation/brainVisualizer';
import { drawWorldSnapshot } from './simulation/renderer';
import { resolveRenderFrameInterval, shouldRenderFrame } from './simulation/renderCadence';
import { computeFixedStepBudget, resolveMaxCatchUpTicksPerFrame } from './simulation/fixedStepScheduler';
import { pickOrganismAtPoint } from './simulation/selection';
import { deriveSimulationStats, formatSimulationStats } from './simulation/stats';
import { deriveRunMetadata, serializeRunMetadata } from './simulation/metadata';
import { replaySnapshotToTick } from './simulation/replay';
import {
  deriveReplaySummaryStrip,
  deriveSimulationParametersSignature,
  filterMismatchEvents,
  formatDeterministicReplayContext,
  formatMismatchDisplayValue
} from './simulation/replaySummary';
import { deriveReplaySnapshotBundle, downloadReplaySnapshotBundle } from './simulation/replaySnapshotExport';
import { formatReplayMismatchReport } from './simulation/replayMismatchReport';
import {
  loadReplayComparisonPresets,
  saveReplayComparisonPresets,
  validateReplayComparisonPreset
} from './simulation/replayComparisonPresets';
import {
  deleteSimulationSnapshot,
  getSimulationSnapshot,
  listSimulationSnapshots,
  saveSimulationSnapshot,
  SnapshotNameConflictError
} from './simulation/api';
import { useToasts } from './toasts';
import { deriveInspectorComparisonRows } from './inspectorComparison';
import {
  deriveDeterministicOrganismIds,
  resolveAdjacentSelectionId,
  resolveDeadSelectionFallback
} from './inspectorSelection';
import {
  deriveInspectorTrendSeries,
  formatTrendPolyline,
  INSPECTOR_TREND_WINDOW_TICKS,
  reduceInspectorTrendState
} from './inspectorTrend';
import { formatInspectorSnapshot } from './inspectorFormatting';
import { deriveInspectorTraitSections, INSPECTOR_TRAIT_SECTION_SCHEMA } from './inspectorTraitSchema';

const TICK_MS = 1000 / 30;
const SPEED_OPTIONS = [1, 2, 5, 10];
const SIMULATION_VERSION = 'snn-sandbox-v1';
const INSPECTOR_COMPACT_BREAKPOINT_PX = 980;
const INSPECTOR_TREND_STRIP_WIDTH = 280;
const INSPECTOR_TREND_STRIP_HEIGHT = 72;
const INSPECTOR_TRAIT_SECTION_ORDER = INSPECTOR_TRAIT_SECTION_SCHEMA.map((section) => section.key);
const INSPECTOR_SECTION_ORDER = [...INSPECTOR_TRAIT_SECTION_ORDER, 'brain'];
const FORM_FIELDS = [
  'name',
  'seed',
  'worldWidth',
  'worldHeight',
  'initialPopulation',
  'minimumPopulation',
  'initialFoodCount',
  'foodSpawnChance',
  'foodEnergyValue',
  'maxFood',
  'mutationRate',
  'mutationStrength'
];

function createFormStateFromConfig(config) {
  return {
    ...config,
    worldWidth: String(config.worldWidth),
    worldHeight: String(config.worldHeight),
    initialPopulation: String(config.initialPopulation),
    minimumPopulation: String(config.minimumPopulation ?? config.initialPopulation),
    initialFoodCount: String(config.initialFoodCount),
    foodSpawnChance: String(config.foodSpawnChance),
    foodEnergyValue: String(config.foodEnergyValue),
    maxFood: String(config.maxFood),
    mutationRate: String(config.mutationRate ?? DEFAULT_CONFIG.mutationRate),
    mutationStrength: String(config.mutationStrength ?? DEFAULT_CONFIG.mutationStrength)
  };
}

function getControlDisableReasons({ hasSimulation, replayActive, paused }) {
  const simulationRequiredReason = 'Start a simulation to enable this control.';

  return {
    copySeed: hasSimulation ? '' : simulationRequiredReason,
    regenerateSeed: hasSimulation ? '' : simulationRequiredReason,
    restartFromSeed: hasSimulation ? '' : simulationRequiredReason,
    pause: !hasSimulation ? simulationRequiredReason : replayActive ? 'Replay mode is active. Resume live simulation to pause playback.' : '',
    speed: !hasSimulation ? simulationRequiredReason : replayActive ? 'Replay mode is active. Resume live simulation to change speed.' : '',
    step: !hasSimulation
      ? simulationRequiredReason
      : replayActive
        ? 'Replay mode is active. Resume live simulation to step ticks.'
        : !paused
          ? 'Pause the simulation to step one tick at a time.'
          : '',
    saveSnapshot: hasSimulation ? '' : simulationRequiredReason
  };
}

function ControlButtonWithHint({ name, onClick, reason, children, ...buttonProps }) {
  const reasonId = `control-hint-${name}`;
  const isDisabled = Boolean(reason);

  return (
    <span
      className={`control-with-hint${isDisabled ? ' is-disabled' : ''}`}
      tabIndex={isDisabled ? 0 : undefined}
      aria-describedby={isDisabled ? reasonId : undefined}
    >
      <button type="button" onClick={onClick} disabled={isDisabled} title={reason || undefined} {...buttonProps}>
        {children}
      </button>
      {isDisabled ? (
        <span id={reasonId} className="control-disable-hint" role="tooltip">
          {reason}
        </span>
      ) : null}
    </span>
  );
}

function App() {
  const [paused, setPaused] = useState(false);
  const [speedMultiplier, setSpeedMultiplier] = useState(1);
  const [tickDisplay, setTickDisplay] = useState(0);
  const [resolvedSeed, setResolvedSeed] = useState('');
  const [selectedOrganismId, setSelectedOrganismId] = useState(null);
  const [selectedOrganismUnavailable, setSelectedOrganismUnavailable] = useState(false);
  const [inspectorPinned, setInspectorPinned] = useState(false);
  const [inspectorSectionExpanded, setInspectorSectionExpanded] = useState(() => Object.fromEntries(
    INSPECTOR_SECTION_ORDER.map((sectionKey) => [sectionKey, true])
  ));
  const [activeInspectorSectionIndex, setActiveInspectorSectionIndex] = useState(0);
  const [pinnedOrganismSnapshot, setPinnedOrganismSnapshot] = useState(null);
  const [inspectorTrendState, setInspectorTrendState] = useState(() => ({ selectedOrganismId: null, samples: [] }));
  const [isCompactInspectorLayout, setIsCompactInspectorLayout] = useState(() => window.innerWidth <= INSPECTOR_COMPACT_BREAKPOINT_PX);
  const [activeSynapseId, setActiveSynapseId] = useState(null);
  const [brainGraphTransform, setBrainGraphTransform] = useState(() => ({ scale: 1, translateX: 0, translateY: 0 }));
  const [hideNearZeroBrainEdges, setHideNearZeroBrainEdges] = useState(false);
  const [strongestBrainEdgeCount, setStrongestBrainEdgeCount] = useState(0);
  const [brainFilterTypes, setBrainFilterTypes] = useState(() => ({ input: true, hidden: true, output: true }));
  const [brainMinActivationThreshold, setBrainMinActivationThreshold] = useState(0);
  const [pinnedBrainNeuronId, setPinnedBrainNeuronId] = useState(null);
  const [emphasizedOutputNeuronId, setEmphasizedOutputNeuronId] = useState(null);
  const [selectedBrainNeuronId, setSelectedBrainNeuronId] = useState(null);
  const [brainFocusMode, setBrainFocusMode] = useState('full');
  const [errors, setErrors] = useState({});
  const [savedSimulations, setSavedSimulations] = useState([]);
  const [saveStatus, setSaveStatus] = useState('');
  const [saveErrorDetail, setSaveErrorDetail] = useState('');
  const [loadStatus, setLoadStatus] = useState('');
  const [loadRecoveryBySnapshotId, setLoadRecoveryBySnapshotId] = useState({});
  const [loadingSnapshotById, setLoadingSnapshotById] = useState({});
  const [pendingDeleteSnapshot, setPendingDeleteSnapshot] = useState(null);
  const [deleteStatus, setDeleteStatus] = useState('');
  const [copyMetadataStatus, setCopyMetadataStatus] = useState('');
  const [seedControlStatus, setSeedControlStatus] = useState('');
  const [keyboardShortcutsModalOpen, setKeyboardShortcutsModalOpen] = useState(false);
  const [activeLoadedMetadata, setActiveLoadedMetadata] = useState(null);
  const [replayTickInput, setReplayTickInput] = useState('');
  const [replayStatus, setReplayStatus] = useState('');
  const [replayWorldState, setReplayWorldState] = useState(null);
  const [replaySnapshotMetadata, setReplaySnapshotMetadata] = useState(null);
  const [replayPresetName, setReplayPresetName] = useState('');
  const [replayPresetStatus, setReplayPresetStatus] = useState('');
  const [replayComparisonPresets, setReplayComparisonPresets] = useState(() => loadReplayComparisonPresets());
  const [selectedMismatchEventKey, setSelectedMismatchEventKey] = useState(null);
  const [mismatchEventFilters, setMismatchEventFilters] = useState({ types: [], severities: [] });
  const [activeMismatchAnnouncement, setActiveMismatchAnnouncement] = useState('');
  const [schedulerClampState, setSchedulerClampState] = useState({ active: false, droppedTicks: 0 });
  const [initialFormState] = useState(() => {
    const saved = loadSimulationConfig();
    if (!saved) {
      return createFormStateFromConfig(DEFAULT_CONFIG);
    }

    return createFormStateFromConfig(saved);
  });
  const [formState, setFormState] = useState(initialFormState);
  const [formBaselineState, setFormBaselineState] = useState(initialFormState);

  const worldRef = useRef(null);
  const pausedRef = useRef(paused);
  const speedMultiplierRef = useRef(speedMultiplier);
  const canvasRef = useRef(null);
  const keyboardShortcutsTriggerRef = useRef(null);
  const keyboardShortcutsCloseButtonRef = useRef(null);
  const deleteConfirmButtonRef = useRef(null);
  const replayInteractionRegionRef = useRef(null);
  const inspectorSelectionHeadingRef = useRef(null);
  const inspectorSectionButtonRefs = useRef(new Map());
  const rngRef = useRef(null);
  const stepParamsRef = useRef(null);
  const schedulerCarryMsRef = useRef(0);
  const schedulerLastFrameTimeRef = useRef(null);
  const lastPersistedTickRef = useRef(0);
  const activeConfigRef = useRef(null);
  const viewportRef = useRef({ width: DEFAULT_CONFIG.worldWidth, height: DEFAULT_CONFIG.worldHeight });
  const replayContextRef = useRef(null);
  const { toasts, enqueueToast, dismissToast } = useToasts();
  const toastsEnabled = process.env.NODE_ENV !== 'test';

  const displayWorld = replayWorldState ?? worldRef.current;
  const replayActive = Boolean(replayContextRef.current);
  const dirtyFormFields = useMemo(
    () => FORM_FIELDS.filter((field) => formState[field] !== formBaselineState[field]),
    [formBaselineState, formState]
  );
  const hasUnsavedFormChanges = dirtyFormFields.length > 0;

  useEffect(() => {
    [
      seedControlStatus,
      saveStatus,
      loadStatus,
      deleteStatus,
      copyMetadataStatus,
      replayStatus,
      replayPresetStatus
    ].forEach((message) => publishControlToast(message));
  }, [
    seedControlStatus,
    saveStatus,
    loadStatus,
    deleteStatus,
    copyMetadataStatus,
    replayStatus,
    replayPresetStatus
  ]);

  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

  useEffect(() => {
    const onResize = () => {
      setIsCompactInspectorLayout(window.innerWidth <= INSPECTOR_COMPACT_BREAKPOINT_PX);
    };

    window.addEventListener('resize', onResize);
    onResize();

    return () => {
      window.removeEventListener('resize', onResize);
    };
  }, []);

  useEffect(() => {
    speedMultiplierRef.current = speedMultiplier;
  }, [speedMultiplier]);

  useEffect(() => {
    const onBeforeUnload = (event) => {
      if (!hasUnsavedFormChanges) {
        return;
      }

      event.preventDefault();
      event.returnValue = '';
    };

    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [hasUnsavedFormChanges]);

  const advanceTicks = (count) => {
    if (!worldRef.current || !rngRef.current || !stepParamsRef.current || !Number.isInteger(count) || count <= 0) {
      return;
    }

    for (let i = 0; i < count; i += 1) {
      worldRef.current = stepWorld(worldRef.current, rngRef.current, stepParamsRef.current);
    }

    setTickDisplay(worldRef.current.tick);
  };

  useEffect(() => {
    const interval = setInterval(() => {
      const now = performance.now();

      if (replayContextRef.current || pausedRef.current || !worldRef.current || !rngRef.current || !stepParamsRef.current) {
        schedulerLastFrameTimeRef.current = now;
        schedulerCarryMsRef.current = 0;
        setSchedulerClampState((previous) => (previous.active || previous.droppedTicks !== 0 ? { active: false, droppedTicks: 0 } : previous));
        return;
      }

      if (process.env.NODE_ENV === 'test') {
        advanceTicks(speedMultiplierRef.current);
        setSchedulerClampState((previous) => (previous.active || previous.droppedTicks !== 0 ? { active: false, droppedTicks: 0 } : previous));
        return;
      }

      const previousFrameTime = schedulerLastFrameTimeRef.current;
      const elapsedMs = previousFrameTime === null ? TICK_MS : Math.max(0, now - previousFrameTime);
      schedulerLastFrameTimeRef.current = now;

      const maxCatchUpTicksPerFrame = resolveMaxCatchUpTicksPerFrame(speedMultiplierRef.current);
      const budget = computeFixedStepBudget({
        carriedMs: schedulerCarryMsRef.current,
        elapsedMs,
        tickMs: TICK_MS,
        speedMultiplier: speedMultiplierRef.current,
        maxCatchUpTicksPerFrame
      });

      schedulerCarryMsRef.current = budget.carriedMs;
      if (budget.ticksToProcess > 0) {
        advanceTicks(budget.ticksToProcess);
      }

      setSchedulerClampState((previous) => {
        if (budget.clamped === previous.active && budget.droppedTicks === previous.droppedTicks) {
          return previous;
        }

        return { active: budget.clamped, droppedTicks: budget.droppedTicks };
      });
    }, TICK_MS);

    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return undefined;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return undefined;
    }

    let frameRequest = 0;
    let frameNumber = 0;
    const render = () => {
      const worldToDraw = replayWorldState ?? worldRef.current;
      const frameInterval = replayWorldState ? 1 : resolveRenderFrameInterval(speedMultiplierRef.current);
      if (worldToDraw && shouldRenderFrame(frameNumber, frameInterval)) {
        drawWorldSnapshot(ctx, worldToDraw, viewportRef.current, {
          selectedOrganismId
        });
      }
      frameNumber += 1;
      frameRequest = requestAnimationFrame(render);
    };

    frameRequest = requestAnimationFrame(render);

    return () => cancelAnimationFrame(frameRequest);
  }, [replayWorldState, selectedOrganismId]);

  useEffect(() => {
    if (replayWorldState) {
      return;
    }

    setTickDisplay((currentTick) => (worldRef.current ? worldRef.current.tick : currentTick));
  }, [speedMultiplier, replayWorldState]);

  useEffect(() => {
    listSimulationSnapshots()
      .then((items) => setSavedSimulations(items))
      .catch(() => {
        setSavedSimulations([]);
      });
  }, []);

  const selectedOrganism = useMemo(() => {
    if (!selectedOrganismId || !displayWorld) {
      return null;
    }

    return displayWorld.organisms.find((organism) => organism.id === selectedOrganismId) ?? null;
  }, [displayWorld, selectedOrganismId, tickDisplay]);

  useEffect(() => {
    if (!selectedOrganism?.id) {
      return;
    }

    inspectorSelectionHeadingRef.current?.focus();
  }, [selectedOrganism?.id]);

  useEffect(() => {
    setInspectorTrendState((previous) => reduceInspectorTrendState(previous, {
      selectedOrganismId,
      selectedOrganism,
      tick: displayWorld?.tick ?? tickDisplay,
      windowSize: INSPECTOR_TREND_WINDOW_TICKS
    }));
  }, [displayWorld?.tick, selectedOrganismId, selectedOrganism, tickDisplay]);

  const deterministicOrganismIds = useMemo(
    () => deriveDeterministicOrganismIds(displayWorld?.organisms),
    [displayWorld, tickDisplay]
  );

  useEffect(() => {
    if (!selectedOrganism || inspectorPinned) {
      return;
    }

    setPinnedOrganismSnapshot(selectedOrganism);
  }, [selectedOrganism, inspectorPinned]);

  useEffect(() => {
    if (!selectedOrganismId) {
      if (selectedOrganismUnavailable) {
        setSelectedOrganismUnavailable(false);
      }
      return;
    }

    if (selectedOrganism) {
      if (selectedOrganismUnavailable) {
        setSelectedOrganismUnavailable(false);
      }
      return;
    }

    const fallbackOrganismId = resolveDeadSelectionFallback(deterministicOrganismIds, selectedOrganismId);
    if (fallbackOrganismId) {
      setSelectedOrganismId(fallbackOrganismId);
      if (selectedOrganismUnavailable) {
        setSelectedOrganismUnavailable(false);
      }
      return;
    }

    setSelectedOrganismId(null);
    setSelectedOrganismUnavailable(true);
  }, [deterministicOrganismIds, selectedOrganismId, selectedOrganism, selectedOrganismUnavailable]);

  const clearSelection = () => {
    setSelectedOrganismId(null);
    setSelectedOrganismUnavailable(false);
    setPinnedOrganismSnapshot(null);
  };

  const onToggleInspectorPin = () => {
    setInspectorPinned((previous) => {
      const nextPinned = !previous;

      if (nextPinned && selectedOrganism) {
        setPinnedOrganismSnapshot(selectedOrganism);
      }

      if (!nextPinned && selectedOrganismId && !selectedOrganism) {
        clearSelection();
      }

      return nextPinned;
    });
  };

  const selectAdjacentOrganism = (offset) => {
    const nextSelectionId = resolveAdjacentSelectionId(deterministicOrganismIds, selectedOrganismId, offset);
    if (!nextSelectionId) {
      return;
    }

    setSelectedOrganismId(nextSelectionId);
    setSelectedOrganismUnavailable(false);
  };

  const onSelectPreviousOrganism = () => {
    selectAdjacentOrganism(-1);
  };

  const onSelectNextOrganism = () => {
    selectAdjacentOrganism(1);
  };

  const onFitBrainGraphViewport = () => {
    if (!brainGraphModel) {
      return;
    }

    setBrainGraphTransform(
      createBrainViewportFitTransform(brainGraphModel, {
        width: BRAIN_GRAPH_VIEWBOX.width,
        height: BRAIN_GRAPH_VIEWBOX.height
      })
    );
  };

  const onZoomBrainGraphViewport = (direction) => {
    setBrainGraphTransform((previous) => applyBrainViewportZoom(previous, direction, {
      width: BRAIN_GRAPH_VIEWBOX.width,
      height: BRAIN_GRAPH_VIEWBOX.height
    }));
  };

  const onToggleBrainNeuronType = (type) => {
    setBrainFilterTypes((previous) => ({
      ...previous,
      [type]: !previous[type]
    }));
  };

  const onClearBrainFiltersAndPin = () => {
    setBrainFilterTypes({ input: true, hidden: true, output: true });
    setBrainMinActivationThreshold(0);
    setPinnedBrainNeuronId(null);
    setEmphasizedOutputNeuronId(null);
    setSelectedBrainNeuronId(null);
    setBrainFocusMode('full');
  };

  const onSelectBrainNeuron = (nextNeuronId) => {
    const normalizedId = typeof nextNeuronId === 'string' && nextNeuronId.length > 0 ? nextNeuronId : null;
    setSelectedBrainNeuronId(normalizedId);
    if (!normalizedId) {
      setBrainFocusMode('full');
    }
  };

  const acknowledgeUnavailableSelection = () => {
    if (!selectedOrganismUnavailable || inspectorPinned) {
      return false;
    }

    clearSelection();
    return true;
  };

  const inspectorOrganism = selectedOrganism ?? (inspectorPinned ? pinnedOrganismSnapshot : null);
  const inspectorTrendSeries = useMemo(
    () => deriveInspectorTrendSeries(inspectorTrendState.samples),
    [inspectorTrendState.samples]
  );
  const inspectorEnergyTrendPoints = useMemo(
    () => formatTrendPolyline(inspectorTrendSeries.energy, INSPECTOR_TREND_STRIP_WIDTH, INSPECTOR_TREND_STRIP_HEIGHT),
    [inspectorTrendSeries.energy]
  );
  const inspectorAgeTrendPoints = useMemo(
    () => formatTrendPolyline(inspectorTrendSeries.age, INSPECTOR_TREND_STRIP_WIDTH, INSPECTOR_TREND_STRIP_HEIGHT),
    [inspectorTrendSeries.age]
  );
  const inspectorNearestFoodDistance = useMemo(() => {
    if (!inspectorOrganism || !displayWorld?.food?.length) {
      return null;
    }

    let nearestDistance = Infinity;
    for (const food of displayWorld.food) {
      const distance = Math.hypot(inspectorOrganism.x - food.x, inspectorOrganism.y - food.y);
      if (distance < nearestDistance) {
        nearestDistance = distance;
      }
    }

    return Number.isFinite(nearestDistance) ? nearestDistance : null;
  }, [displayWorld, inspectorOrganism]);
  const formattedInspector = useMemo(
    () => formatInspectorSnapshot(inspectorOrganism, inspectorNearestFoodDistance),
    [inspectorOrganism, inspectorNearestFoodDistance]
  );
  const inspectorTraitSections = useMemo(
    () => deriveInspectorTraitSections(formattedInspector),
    [formattedInspector]
  );

  const baseBrainGraphModel = useMemo(() => {
    if (!inspectorOrganism) {
      return null;
    }
    return mapBrainToVisualizerModel(inspectorOrganism.brain);
  }, [inspectorOrganism]);

  const visibleBrainNeuronTypes = useMemo(
    () => Object.entries(brainFilterTypes)
      .filter(([, enabled]) => enabled)
      .map(([type]) => type),
    [brainFilterTypes]
  );

  const brainGraphModel = useMemo(() => {
    const emphasizedModel = deriveEmphasizedBrainGraphModel(baseBrainGraphModel, {
      hideNearZeroWeights: hideNearZeroBrainEdges,
      nearZeroThreshold: 0.1,
      strongestEdgeCount: strongestBrainEdgeCount
    });

    return deriveFilteredBrainGraphModel(emphasizedModel, {
      visibleNeuronTypes: visibleBrainNeuronTypes,
      minActivationThreshold: brainMinActivationThreshold,
      pinnedNeuronId: pinnedBrainNeuronId,
      emphasizedOutputNeuronId,
      selectedNeuronId: selectedBrainNeuronId,
      focusMode: brainFocusMode
    });
  }, [
    baseBrainGraphModel,
    hideNearZeroBrainEdges,
    strongestBrainEdgeCount,
    visibleBrainNeuronTypes,
    brainMinActivationThreshold,
    pinnedBrainNeuronId,
    emphasizedOutputNeuronId,
    selectedBrainNeuronId,
    brainFocusMode
  ]);

  const brainGraphNodeById = useMemo(() => {
    if (!brainGraphModel) {
      return new Map();
    }
    return new Map(brainGraphModel.nodes.map((node) => [node.id, node]));
  }, [brainGraphModel]);

  const activeSynapse = useMemo(() => {
    if (!brainGraphModel || !activeSynapseId) {
      return null;
    }
    return brainGraphModel.edges.find((edge) => edge.id === activeSynapseId) ?? null;
  }, [activeSynapseId, brainGraphModel]);

  const brainGraphLayoutChecksum = useMemo(() => mapBrainLayoutChecksum(baseBrainGraphModel), [baseBrainGraphModel]);
  const brainGraphEmphasisChecksum = useMemo(
    () => mapBrainEmphasisChecksum(baseBrainGraphModel, {
      hideNearZeroWeights: hideNearZeroBrainEdges,
      nearZeroThreshold: 0.1,
      strongestEdgeCount: strongestBrainEdgeCount
    }),
    [baseBrainGraphModel, hideNearZeroBrainEdges, strongestBrainEdgeCount]
  );

  useEffect(() => {
    if (!brainGraphModel) {
      setBrainGraphTransform({ scale: 1, translateX: 0, translateY: 0 });
      return;
    }

    setBrainGraphTransform(
      createBrainViewportFitTransform(brainGraphModel, {
        width: BRAIN_GRAPH_VIEWBOX.width,
        height: BRAIN_GRAPH_VIEWBOX.height
      })
    );
  }, [brainGraphModel, inspectorOrganism?.id]);

  useEffect(() => {
    setPinnedBrainNeuronId(null);
    setEmphasizedOutputNeuronId(null);
    setSelectedBrainNeuronId(null);
    setBrainFocusMode('full');
  }, [inspectorOrganism?.id]);

  useEffect(() => {
    if (!brainGraphModel || !activeSynapseId) {
      setActiveSynapseId(null);
      return;
    }

    if (!brainGraphModel.edges.some((edge) => edge.id === activeSynapseId)) {
      setActiveSynapseId(null);
    }
  }, [activeSynapseId, brainGraphModel]);

  useEffect(() => {
    if (!brainGraphModel || !pinnedBrainNeuronId) {
      return;
    }

    if (!brainGraphModel.nodes.some((node) => node.id === pinnedBrainNeuronId)) {
      setPinnedBrainNeuronId(null);
    }
  }, [brainGraphModel, pinnedBrainNeuronId]);

  useEffect(() => {
    if (!brainGraphModel || !emphasizedOutputNeuronId) {
      return;
    }

    if (!brainGraphModel.nodes.some((node) => node.id === emphasizedOutputNeuronId && node.type === 'output')) {
      setEmphasizedOutputNeuronId(null);
    }
  }, [brainGraphModel, emphasizedOutputNeuronId]);

  useEffect(() => {
    if (!brainGraphModel || !selectedBrainNeuronId) {
      return;
    }

    if (!brainGraphModel.nodes.some((node) => node.id === selectedBrainNeuronId)) {
      setSelectedBrainNeuronId(null);
      setBrainFocusMode('full');
    }
  }, [brainGraphModel, selectedBrainNeuronId]);

  const pinnedComparisonCandidate = inspectorPinned ? pinnedOrganismSnapshot : null;
  const hasComparisonPair = Boolean(
    selectedOrganism &&
    pinnedComparisonCandidate &&
    selectedOrganism.id !== pinnedComparisonCandidate.id
  );
  const comparisonUnavailableReason = hasComparisonPair
    ? null
    : selectedOrganismUnavailable && pinnedComparisonCandidate
      ? 'Comparison unavailable: selected organism is no longer alive. Showing pinned snapshot only.'
      : null;

  const comparisonRows = useMemo(
    () => (hasComparisonPair ? deriveInspectorComparisonRows(selectedOrganism, pinnedComparisonCandidate) : []),
    [hasComparisonPair, selectedOrganism, pinnedComparisonCandidate]
  );

  const onFieldChange = (field) => (event) => {
    const nextValue = event.target.value;
    setFormState((prev) => ({ ...prev, [field]: nextValue }));
    setErrors((prev) => {
      if (!prev[field]) {
        return prev;
      }
      const next = { ...prev };
      delete next[field];
      return next;
    });
  };

  const confirmDiscardUnsavedFormChanges = () => {
    if (!hasUnsavedFormChanges) {
      return true;
    }

    return window.confirm('You have unsaved setup changes. Discard them and continue?');
  };

  const onResetConfigToDefaults = () => {
    setFormState(createFormStateFromConfig(DEFAULT_CONFIG));
    setErrors({});
  };

  const deriveToastVariant = (message) => {
    const normalized = message.toLowerCase();
    if (
      normalized.includes('failed') ||
      normalized.includes('unavailable') ||
      normalized.includes('invalid') ||
      normalized.includes('unable') ||
      normalized.includes('cannot')
    ) {
      return 'error';
    }

    if (normalized.includes('cancelled') || normalized.includes('clamped') || normalized.includes('no active simulation')) {
      return 'warning';
    }

    return 'success';
  };

  const publishControlToast = (message) => {
    if (!toastsEnabled || !message || message.endsWith('…') || message.toLowerCase().includes('exported')) {
      return;
    }

    const normalizedMessage = message.endsWith('.') ? message.slice(0, -1) : message;
    enqueueToast(`Control update: ${normalizedMessage}`, deriveToastVariant(message));
  };

  const validateLoadedSnapshot = (snapshot) => {
    if (!snapshot || typeof snapshot !== 'object') {
      throw new Error('Snapshot payload missing.');
    }

    if (!snapshot.parameters || typeof snapshot.parameters !== 'object') {
      throw new Error('Snapshot parameters are missing.');
    }

    if (!snapshot.worldState || typeof snapshot.worldState !== 'object') {
      throw new Error('Snapshot world state is missing.');
    }

    if (!Number.isInteger(snapshot.tickCount) || snapshot.tickCount < 0) {
      throw new Error('Snapshot tick count is invalid.');
    }

    if (snapshot.worldState.tick !== snapshot.tickCount) {
      throw new Error('Snapshot tick count does not match world state tick.');
    }
  };

  const applyLoadedSimulation = (snapshot) => {
    validateLoadedSnapshot(snapshot);

    const loadedConfig = normalizeSimulationConfig(snapshot.parameters, String(snapshot.seed));
    const loadedWorld = createWorldState(snapshot.worldState);
    const loadedRng = createSeededPrng(loadedConfig.resolvedSeed, snapshot.rngState);

    worldRef.current = loadedWorld;
    rngRef.current = loadedRng;
    stepParamsRef.current = toEngineStepParams(loadedConfig);
    activeConfigRef.current = loadedConfig;
    viewportRef.current = {
      width: loadedConfig.worldWidth,
      height: loadedConfig.worldHeight
    };
    lastPersistedTickRef.current = loadedWorld.tick;

    saveSimulationConfig(loadedConfig);
    const loadedFormState = createFormStateFromConfig(loadedConfig);
    setFormState(loadedFormState);
    setFormBaselineState(loadedFormState);

    replayContextRef.current = {
      baseWorldState: createWorldState(loadedWorld),
      baseRngState: snapshot.rngState,
      resolvedSeed: loadedConfig.resolvedSeed,
      stepParams: toEngineStepParams(loadedConfig)
    };

    setReplayWorldState(createWorldState(loadedWorld));
    setReplaySnapshotMetadata({
      id: snapshot.id,
      name: snapshot.name,
      seed: snapshot.seed,
      simulationVersion: snapshot.simulationVersion ?? snapshot?.comparison?.simulationVersion ?? SIMULATION_VERSION,
      tickCount: snapshot.tickCount,
      replayStartTick: loadedWorld.tick,
      simulationParametersSignature: deriveSimulationParametersSignature(loadedConfig),
      mismatchDetected: snapshot?.comparison?.mismatchDetected ?? snapshot?.mismatchDetected ?? false,
      firstMismatchTick: snapshot?.comparison?.firstMismatchTick ?? snapshot?.firstMismatchTick ?? null,
      firstMismatchPath: snapshot?.comparison?.firstMismatchPath ?? snapshot?.firstMismatchPath ?? null,
      firstMismatchKey: snapshot?.comparison?.firstMismatchKey ?? snapshot?.firstMismatchKey ?? null,
      firstMismatchEntityId: snapshot?.comparison?.firstMismatchEntityId ?? snapshot?.firstMismatchEntityId ?? null,
      baselineValue: snapshot?.comparison?.baselineValue ?? snapshot?.baselineValue,
      comparisonValue: snapshot?.comparison?.comparisonValue ?? snapshot?.comparisonValue,
      currentValue: snapshot?.comparison?.currentValue ?? snapshot?.currentValue,
      comparison: snapshot?.comparison,
      firstMismatch: snapshot?.comparison?.firstMismatch ?? snapshot?.firstMismatch
    });
    setReplayTickInput(String(loadedWorld.tick));
    setReplayStatus('Replay ready. Jump to any tick at or after the loaded snapshot tick.');
    setSelectedMismatchEventKey(null);
    setMismatchEventFilters({ types: [], severities: [] });
    setSelectedOrganismId(null);
    setSelectedOrganismUnavailable(false);
    setInspectorPinned(false);
    setPinnedOrganismSnapshot(null);
    setResolvedSeed(loadedConfig.resolvedSeed);
    setTickDisplay(loadedWorld.tick);
    setSpeedMultiplier(1);
    setPaused(true);
  };

  const applySimulationConfig = (config, { paused: pausedNext = false } = {}) => {
    const initialWorld = createInitialWorldFromConfig(config);
    worldRef.current = initialWorld;
    rngRef.current = createSeededPrng(config.resolvedSeed);
    stepParamsRef.current = toEngineStepParams(config);
    activeConfigRef.current = config;
    viewportRef.current = {
      width: config.worldWidth,
      height: config.worldHeight
    };
    lastPersistedTickRef.current = 0;

    setSelectedOrganismId(null);
    setSelectedOrganismUnavailable(false);
    setInspectorPinned(false);
    setPinnedOrganismSnapshot(null);
    setResolvedSeed(config.resolvedSeed);
    setTickDisplay(0);
    setSpeedMultiplier(1);
    setPaused(pausedNext);
    replayContextRef.current = null;
    setReplayWorldState(null);
    setReplayTickInput('');
    setReplayStatus('');
    setReplaySnapshotMetadata(null);
    setSelectedMismatchEventKey(null);
    setMismatchEventFilters({ types: [], severities: [] });
    setActiveLoadedMetadata(null);
    setLoadStatus('');
    setCopyMetadataStatus('');
    saveSimulationConfig(config);
    setFormState((prev) => {
      const next = { ...prev, seed: config.seed || config.resolvedSeed };
      setFormBaselineState(next);
      return next;
    });
  };

  const startSimulation = () => {
    const nextErrors = validateSimulationConfig(formState);
    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return;
    }

    const seedToUse = resolveSeed(formState.seed);
    const config = normalizeSimulationConfig(formState, seedToUse);
    applySimulationConfig(config, { paused: false });
    setSeedControlStatus('');
  };

  const onCopyActiveSeed = async () => {
    if (!resolvedSeed) {
      return;
    }

    const writeText = globalThis?.navigator?.clipboard?.writeText;
    if (typeof writeText !== 'function') {
      setSeedControlStatus('Clipboard is unavailable.');
      return;
    }

    try {
      await writeText(resolvedSeed);
      setSeedControlStatus('Seed copied.');
    } catch {
      setSeedControlStatus('Failed to copy seed.');
    }
  };

  const onRestartFromSeed = () => {
    if (!activeConfigRef.current) {
      return;
    }

    const hasUnsavedProgress = (worldRef.current?.tick ?? 0) > lastPersistedTickRef.current;
    if (hasUnsavedProgress) {
      const confirmed = window.confirm(
        'You have unsaved simulation progress. Restarting now will reset to tick 0 and keep the current seed. Continue?'
      );
      if (!confirmed) {
        setSeedControlStatus('Restart cancelled.');
        return;
      }
    }

    const config = normalizeSimulationConfig(activeConfigRef.current, activeConfigRef.current.resolvedSeed);
    applySimulationConfig(config, { paused: false });
    setSeedControlStatus('Restarted simulation with the same seed.');
  };

  const onRegenerateSeed = () => {
    if (!activeConfigRef.current) {
      return;
    }

    const hasUnsavedProgress = (worldRef.current?.tick ?? 0) > lastPersistedTickRef.current;
    if (hasUnsavedProgress) {
      const confirmed = window.confirm(
        'You have unsaved simulation progress. Regenerating will create a new seed and reset to tick 0. Continue?'
      );
      if (!confirmed) {
        setSeedControlStatus('Seed regeneration cancelled.');
        return;
      }
    }

    const regeneratedSeed = resolveSeed('');
    const config = normalizeSimulationConfig(
      {
        ...activeConfigRef.current,
        seed: regeneratedSeed
      },
      regeneratedSeed
    );
    applySimulationConfig(config, { paused: false });
    setSeedControlStatus('Generated a new seed and restarted from tick 0.');
  };

  const hasSimulation = useMemo(() => Boolean(worldRef.current && rngRef.current), [tickDisplay, resolvedSeed]);

  const controlDisableReasons = useMemo(
    () => getControlDisableReasons({ hasSimulation, replayActive, paused }),
    [hasSimulation, replayActive, paused]
  );

  const formattedStats = useMemo(() => {
    const stats = deriveSimulationStats(displayWorld);
    return formatSimulationStats(stats);
  }, [displayWorld, tickDisplay, resolvedSeed]);

  const runMetadata = useMemo(
    () => deriveRunMetadata({
      resolvedSeed,
      tickCount: tickDisplay,
      speedMultiplier,
      snapshotId: activeLoadedMetadata?.id
    }),
    [resolvedSeed, tickDisplay, speedMultiplier, activeLoadedMetadata?.id]
  );

  const serializedRunMetadata = useMemo(() => serializeRunMetadata(runMetadata), [runMetadata]);

  const hudSeedLabel = runMetadata.seed.trim() || 'Seed unavailable';

  const replaySummaryStrip = useMemo(
    () => deriveReplaySummaryStrip({
      replaySnapshotMetadata,
      replayTick: replayWorldState?.tick,
      currentReplayContext: {
        seed: resolvedSeed,
        simulationVersion: SIMULATION_VERSION,
        replayStartTick: replayContextRef.current?.baseWorldState?.tick,
        simulationParametersSignature: deriveSimulationParametersSignature(activeConfigRef.current)
      }
    }),
    [replaySnapshotMetadata, replayWorldState?.tick, resolvedSeed]
  );

  const filteredMismatchEvents = useMemo(
    () => filterMismatchEvents(replaySummaryStrip.mismatchEvents, mismatchEventFilters),
    [replaySummaryStrip.mismatchEvents, mismatchEventFilters]
  );

  const activeMismatchFilterChips = useMemo(
    () => [
      ...mismatchEventFilters.types.map((value) => ({ category: 'types', value, label: `Type: ${value}` })),
      ...mismatchEventFilters.severities.map((value) => ({ category: 'severities', value, label: `Severity: ${value}` }))
    ],
    [mismatchEventFilters]
  );

  useEffect(() => {
    if (filteredMismatchEvents.length === 0) {
      setSelectedMismatchEventKey(null);
      return;
    }

    if (selectedMismatchEventKey === null || !filteredMismatchEvents.some((eventItem) => eventItem.id === selectedMismatchEventKey)) {
      setSelectedMismatchEventKey(filteredMismatchEvents[0].id);
    }
  }, [filteredMismatchEvents, selectedMismatchEventKey]);

  const selectedMismatchDetails =
    filteredMismatchEvents.find((eventItem) => eventItem.id === selectedMismatchEventKey) ?? replaySummaryStrip.mismatchDetails;

  useEffect(() => {
    if (!replayActive || filteredMismatchEvents.length === 0 || !Number.isInteger(replayWorldState?.tick)) {
      return;
    }

    const replayTick = replayWorldState.tick;
    const exactTickMatch = filteredMismatchEvents.find((eventItem) => eventItem.tick === replayTick);
    if (exactTickMatch && exactTickMatch.id !== selectedMismatchEventKey) {
      setSelectedMismatchEventKey(exactTickMatch.id);
    }
  }, [filteredMismatchEvents, replayActive, replayWorldState?.tick, selectedMismatchEventKey]);

  useEffect(() => {
    if (!selectedMismatchDetails) {
      setActiveMismatchAnnouncement('');
      return;
    }

    setActiveMismatchAnnouncement(
      `Active mismatch tick ${selectedMismatchDetails.tick}, path ${selectedMismatchDetails.path}`
    );
  }, [selectedMismatchDetails]);

  const replayTimeline = useMemo(() => {
    const startTick = Number.isInteger(replayContextRef.current?.baseWorldState?.tick) ? replayContextRef.current.baseWorldState.tick : 0;
    const currentTick = Number.isInteger(replayWorldState?.tick) ? replayWorldState.tick : startTick;
    const mismatchTicks = replaySummaryStrip.mismatchEvents
      .map((eventItem) => eventItem.tick)
      .filter((tickValue) => Number.isInteger(tickValue) && tickValue >= 0);
    const firstMismatchTick = Number.isInteger(replaySummaryStrip.firstMismatchTick) ? replaySummaryStrip.firstMismatchTick : null;

    const latestRecordedTick = Math.max(startTick, currentTick, ...(firstMismatchTick === null ? [] : [firstMismatchTick]), ...mismatchTicks);
    const markerTicks = Array.from(new Set(mismatchTicks)).sort((a, b) => a - b);

    return {
      minTick: 0,
      latestRecordedTick,
      markerTicks,
      currentTick
    };
  }, [replaySummaryStrip.firstMismatchTick, replaySummaryStrip.mismatchEvents, replayWorldState?.tick, replayActive]);

  const onPause = () => {
    if (acknowledgeUnavailableSelection()) {
      return;
    }

    setPaused(true);
  };

  const onSpeedSelect = (multiplier) => {
    if (acknowledgeUnavailableSelection()) {
      return;
    }

    setSpeedMultiplier(multiplier);
    setPaused(false);
  };

  const onStepTicks = (count) => {
    if (acknowledgeUnavailableSelection()) {
      return;
    }

    if (!pausedRef.current || replayContextRef.current || !Number.isInteger(count) || count <= 0) {
      return;
    }

    advanceTicks(count);
  };

  const onStepTick = () => {
    onStepTicks(1);
  };

  const onStepTenTicks = () => {
    onStepTicks(10);
  };

  const onTogglePausePlay = () => {
    if (pausedRef.current) {
      onSpeedSelect(speedMultiplierRef.current || 1);
      return;
    }

    onPause();
  };

  const onAdjustSpeedByStep = (delta) => {
    if (acknowledgeUnavailableSelection() || replayContextRef.current || !Number.isInteger(delta) || delta === 0) {
      return;
    }

    const speedState = pausedRef.current ? 0 : speedMultiplierRef.current || 1;
    const speedStates = [0, ...SPEED_OPTIONS];
    const currentIndex = speedStates.indexOf(speedState);
    if (currentIndex < 0) {
      return;
    }

    const nextIndex = Math.min(speedStates.length - 1, Math.max(0, currentIndex + delta));
    const nextState = speedStates[nextIndex];

    if (nextState === speedState) {
      return;
    }

    if (nextState === 0) {
      onPause();
      return;
    }

    onSpeedSelect(nextState);
  };

  const onOpenKeyboardShortcuts = () => {
    setKeyboardShortcutsModalOpen(true);
  };

  const onCloseKeyboardShortcuts = () => {
    setKeyboardShortcutsModalOpen(false);
    keyboardShortcutsTriggerRef.current?.focus();
  };

  useEffect(() => {
    if (!keyboardShortcutsModalOpen) {
      return;
    }

    keyboardShortcutsCloseButtonRef.current?.focus();

    const onModalKeyDown = (event) => {
      if (event.key !== 'Escape') {
        return;
      }

      event.preventDefault();
      onCloseKeyboardShortcuts();
    };

    window.addEventListener('keydown', onModalKeyDown);
    return () => window.removeEventListener('keydown', onModalKeyDown);
  }, [keyboardShortcutsModalOpen]);

  useEffect(() => {
    if (!pendingDeleteSnapshot) {
      return;
    }

    deleteConfirmButtonRef.current?.focus();

    const onModalKeyDown = (event) => {
      if (event.key !== 'Escape') {
        return;
      }

      event.preventDefault();
      setPendingDeleteSnapshot(null);
      setDeleteStatus('Delete cancelled.');
    };

    window.addEventListener('keydown', onModalKeyDown);
    return () => window.removeEventListener('keydown', onModalKeyDown);
  }, [pendingDeleteSnapshot]);

  useEffect(() => {
    const isTypingTarget = (target) => {
      if (!(target instanceof HTMLElement)) {
        return false;
      }

      const tagName = target.tagName;
      if (tagName === 'INPUT' || tagName === 'TEXTAREA' || tagName === 'SELECT') {
        return true;
      }

      return target.isContentEditable;
    };

    const onKeyDown = (event) => {
      if (keyboardShortcutsModalOpen || pendingDeleteSnapshot || isTypingTarget(event.target) || replayContextRef.current || !worldRef.current || !rngRef.current) {
        return;
      }

      if (event.key === ' ' || event.code === 'Space') {
        event.preventDefault();
        onTogglePausePlay();
        return;
      }

      if (event.key === '.') {
        event.preventDefault();
        onStepTick();
        return;
      }

      if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
        event.preventDefault();
        onSelectPreviousOrganism();
        return;
      }

      if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
        event.preventDefault();
        onSelectNextOrganism();
        return;
      }

      if (event.key.toLowerCase() === 'p') {
        event.preventDefault();
        onToggleInspectorPin();
        return;
      }

      if (inspectorOrganism && (event.key === '[' || event.key === ']')) {
        event.preventDefault();
        const offset = event.key === '[' ? -1 : 1;
        const nextIndex = (activeInspectorSectionIndex + offset + INSPECTOR_SECTION_ORDER.length) % INSPECTOR_SECTION_ORDER.length;
        setActiveInspectorSectionIndex(nextIndex);
        const nextSectionKey = INSPECTOR_SECTION_ORDER[nextIndex];
        inspectorSectionButtonRefs.current.get(nextSectionKey)?.focus();
        return;
      }

      if (inspectorOrganism && event.key === 'Enter') {
        const activeElement = document.activeElement;
        const activeSectionEntry = [...inspectorSectionButtonRefs.current.entries()].find(([, button]) => button === activeElement);
        const sectionKey = activeSectionEntry?.[0] ?? INSPECTOR_SECTION_ORDER[activeInspectorSectionIndex];
        if (sectionKey) {
          event.preventDefault();
          setInspectorSectionExpanded((previous) => ({
            ...previous,
            [sectionKey]: !previous[sectionKey]
          }));
        }
        return;
      }

      if (event.key === '[') {
        event.preventDefault();
        onAdjustSpeedByStep(-1);
        return;
      }

      if (event.key === ']') {
        event.preventDefault();
        onAdjustSpeedByStep(1);
        return;
      }

      const speedByKey = {
        '1': 1,
        '2': 2,
        '3': 5,
        '4': 10
      };
      const speed = speedByKey[event.key];
      if (speed) {
        event.preventDefault();
        onSpeedSelect(speed);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    keyboardShortcutsModalOpen,
    pendingDeleteSnapshot,
    inspectorOrganism,
    activeInspectorSectionIndex,
    onAdjustSpeedByStep,
    onSelectNextOrganism,
    onSelectPreviousOrganism,
    onStepTick,
    onToggleInspectorPin,
    onTogglePausePlay,
    onSpeedSelect
  ]);

  const onCanvasClick = (event) => {
    if (!canvasRef.current || !displayWorld) {
      return;
    }

    if (acknowledgeUnavailableSelection()) {
      return;
    }

    const rect = canvasRef.current.getBoundingClientRect();
    const scaleX = canvasRef.current.width / rect.width;
    const scaleY = canvasRef.current.height / rect.height;
    const x = (event.clientX - rect.left) * scaleX;
    const y = (event.clientY - rect.top) * scaleY;

    const selected = pickOrganismAtPoint(displayWorld.organisms, x, y);
    if (!selected) {
      if (!inspectorPinned) {
        clearSelection();
      }
      return;
    }

    setSelectedOrganismId(selected.id);
    setSelectedOrganismUnavailable(false);
  };

  const onSaveSimulation = async (options = {}) => {
    const { forceOverwrite = false, overwriteSnapshotId = null } = options;

    if (!worldRef.current || !activeConfigRef.current) {
      return;
    }

    setSaveErrorDetail('');
    setSaveStatus('Saving…');

    try {
      await saveSimulationSnapshot({
        name: activeConfigRef.current.name,
        seed: activeConfigRef.current.resolvedSeed,
        parameters: activeConfigRef.current,
        tickCount: worldRef.current.tick,
        worldState: worldRef.current,
        rngState: rngRef.current?.getState?.() ?? null,
        overwriteExisting: forceOverwrite,
        overwriteSnapshotId
      });
      lastPersistedTickRef.current = worldRef.current.tick;

      const items = await listSimulationSnapshots();
      setSavedSimulations(items);
      setSaveStatus('Saved.');
    } catch (error) {
      if (error instanceof SnapshotNameConflictError && error.conflictingSnapshot) {
        const confirmed = window.confirm(
          `A saved simulation named "${activeConfigRef.current.name}" already exists (tick ${error.conflictingSnapshot.tickCount}).\n\n` +
            'Click OK to overwrite it with the current simulation state, or Cancel to keep the existing save.'
        );
        if (confirmed) {
          await onSaveSimulation({
            forceOverwrite: true,
            overwriteSnapshotId: error.conflictingSnapshot.id
          });
          return;
        }
        setSaveStatus('Save cancelled.');
        return;
      }

      const detail = error instanceof Error ? error.message : 'Unknown save error.';
      setSaveErrorDetail(detail);
      setSaveStatus('Failed to save snapshot. Retry when ready.');
    }
  };

  const onLoadSimulation = async (snapshotSummary) => {
    if (loadingSnapshotById[snapshotSummary.id]) {
      return;
    }

    if (!confirmDiscardUnsavedFormChanges()) {
      setLoadStatus('Load cancelled.');
      return;
    }

    setLoadingSnapshotById((previous) => ({
      ...previous,
      [snapshotSummary.id]: true
    }));
    setLoadStatus('Loading…');
    setLoadRecoveryBySnapshotId((previous) => {
      if (!previous[snapshotSummary.id]) {
        return previous;
      }

      const next = { ...previous };
      delete next[snapshotSummary.id];
      return next;
    });

    try {
      const snapshot = await getSimulationSnapshot(snapshotSummary.id);
      applyLoadedSimulation(snapshot);
      setActiveLoadedMetadata({
        id: snapshot.id,
        name: snapshot.name ?? snapshotSummary.name,
        updatedAt: snapshot.updatedAt ?? snapshotSummary.updatedAt
      });
      setCopyMetadataStatus('');
      setLoadStatus('Loaded.');
    } catch {
      setLoadStatus('Failed to load snapshot.');
      setLoadRecoveryBySnapshotId((previous) => ({
        ...previous,
        [snapshotSummary.id]: 'Snapshot could not be resumed. Retry or delete this save.'
      }));
    } finally {
      setLoadingSnapshotById((previous) => {
        if (!previous[snapshotSummary.id]) {
          return previous;
        }

        const next = { ...previous };
        delete next[snapshotSummary.id];
        return next;
      });
    }
  };

  const onDeleteSimulation = (snapshotSummary) => {
    if (loadingSnapshotById[snapshotSummary.id]) {
      return;
    }

    setPendingDeleteSnapshot(snapshotSummary);
  };

  const onCancelDeleteSimulation = () => {
    setPendingDeleteSnapshot(null);
    setDeleteStatus('Delete cancelled.');
  };

  const onConfirmDeleteSimulation = async () => {
    if (!pendingDeleteSnapshot) {
      return;
    }

    const snapshotSummary = pendingDeleteSnapshot;
    setPendingDeleteSnapshot(null);
    setDeleteStatus('Deleting…');

    try {
      await deleteSimulationSnapshot(snapshotSummary.id);
      setSavedSimulations((previous) => previous.filter((snapshot) => snapshot.id !== snapshotSummary.id));
      setLoadRecoveryBySnapshotId((previous) => {
        if (!previous[snapshotSummary.id]) {
          return previous;
        }

        const next = { ...previous };
        delete next[snapshotSummary.id];
        return next;
      });

      if (activeLoadedMetadata?.id === snapshotSummary.id) {
        setActiveLoadedMetadata(null);
      }

      setDeleteStatus('Deleted.');
    } catch {
      setDeleteStatus('Failed to delete snapshot.');
    }
  };

  const onCopyRunMetadata = async () => {
    const writeText = globalThis?.navigator?.clipboard?.writeText;
    if (typeof writeText !== 'function') {
      setCopyMetadataStatus('Clipboard unavailable.');
      return;
    }

    try {
      await writeText(serializedRunMetadata);
      setCopyMetadataStatus('Metadata copied.');
    } catch {
      setCopyMetadataStatus('Failed to copy metadata.');
    }
  };

  const jumpReplayToTick = (targetTick, successStatus, allowClampStatus = true) => {
    if (!replayContextRef.current) {
      return;
    }

    const replayResult = replaySnapshotToTick({
      ...replayContextRef.current,
      targetTick
    });

    setReplayWorldState(replayResult.worldState);
    setTickDisplay(replayResult.tick);
    setReplayTickInput(String(replayResult.tick));
    if (allowClampStatus && replayResult.clamped) {
      setReplayStatus('Tick clamped to snapshot minimum tick.');
      return;
    }

    setReplayStatus(successStatus);
  };

  const onReplayJump = () => {
    jumpReplayToTick(replayTickInput, 'Replay tick applied.');
  };

  const onReplayScrub = (event) => {
    const nextTick = event.target.value;
    setReplayTickInput(nextTick);
    jumpReplayToTick(nextTick, 'Replay tick applied.', false);
  };

  const onJumpToFirstMismatch = () => {
    if (!replaySummaryStrip.canJumpToFirstMismatch || replaySummaryStrip.firstMismatchTick === null) {
      return;
    }

    const mismatchTick = String(replaySummaryStrip.firstMismatchTick);
    setReplayTickInput(mismatchTick);
    jumpReplayToTick(mismatchTick, 'Jumped to first mismatch tick.', false);
  };

  const onJumpToMismatchEvent = (eventItem) => {
    const mismatchTick = String(eventItem.tick);
    setSelectedMismatchEventKey(eventItem.id);
    setReplayTickInput(mismatchTick);
    jumpReplayToTick(mismatchTick, 'Jumped to mismatch event tick.', false);
  };

  const onReplayMismatchKeyboardNavigate = (event) => {
    if (!replayActive || filteredMismatchEvents.length < 2) {
      return;
    }

    if (!event.altKey || (event.key !== 'ArrowDown' && event.key !== 'ArrowUp')) {
      return;
    }

    const container = replayInteractionRegionRef.current;
    if (!container) {
      return;
    }

    if (document.activeElement && !container.contains(document.activeElement)) {
      return;
    }

    event.preventDefault();

    const currentIndex = filteredMismatchEvents.findIndex((eventItem) => eventItem.id === selectedMismatchEventKey);
    const fallbackIndex = 0;
    const activeIndex = currentIndex >= 0 ? currentIndex : fallbackIndex;
    const offset = event.key === 'ArrowDown' ? 1 : -1;
    const nextIndex = (activeIndex + offset + filteredMismatchEvents.length) % filteredMismatchEvents.length;
    onJumpToMismatchEvent(filteredMismatchEvents[nextIndex]);
  };

  const toggleMismatchFilter = (category, value) => {
    setMismatchEventFilters((previous) => {
      const values = previous[category] ?? [];
      const nextValues = values.includes(value) ? values.filter((item) => item !== value) : [...values, value];
      return {
        ...previous,
        [category]: nextValues
      };
    });
  };

  const clearMismatchFilter = (category, value) => {
    setMismatchEventFilters((previous) => ({
      ...previous,
      [category]: (previous[category] ?? []).filter((item) => item !== value)
    }));
  };

  const clearAllMismatchFilters = () => {
    setMismatchEventFilters({ types: [], severities: [] });
  };

  const onCopyDeterministicContext = async () => {
    const writeText = globalThis?.navigator?.clipboard?.writeText;
    if (typeof writeText !== 'function') {
      setReplayStatus('Clipboard unavailable.');
      return;
    }

    try {
      await writeText(formatDeterministicReplayContext(replaySummaryStrip));
      setReplayStatus('Deterministic context copied.');
    } catch {
      setReplayStatus('Failed to copy deterministic context.');
    }
  };

  const onCopyMismatchReport = async () => {
    if (!selectedMismatchDetails) {
      setReplayStatus('Mismatch details unavailable.');
      return;
    }

    const writeText = globalThis?.navigator?.clipboard?.writeText;
    if (typeof writeText !== 'function') {
      setReplayStatus('Clipboard unavailable.');
      return;
    }

    const report = formatReplayMismatchReport({
      runMetadata,
      replaySummary: replaySummaryStrip,
      selectedMismatchDetails
    });

    try {
      await writeText(report);
      setReplayStatus('Mismatch report copied.');
    } catch {
      setReplayStatus('Failed to copy mismatch report.');
    }
  };

  const onResumeFromReplay = () => {
    if (!replayContextRef.current || !replayWorldState) {
      return;
    }

    const replayResult = replaySnapshotToTick({
      ...replayContextRef.current,
      targetTick: replayTickInput
    });

    worldRef.current = replayResult.worldState;
    rngRef.current = createSeededPrng(replayContextRef.current.resolvedSeed, replayResult.rngState);
    replayContextRef.current = null;
    setReplayWorldState(null);
    setTickDisplay(replayResult.tick);
    setPaused(false);
    setReplayStatus('Resumed live simulation from selected replay tick.');
  };

  const onExportReplaySnapshot = () => {
    if (!replayContextRef.current || !replayWorldState) {
      return;
    }

    const bundle = deriveReplaySnapshotBundle({
      seed: resolvedSeed,
      runMetadata,
      replayTick: replayWorldState.tick,
      replaySnapshotMetadata,
      replayWorldState,
      currentReplayContext: {
        contextLabel: replaySummaryStrip.contextLabel,
        contextDifferences: replaySummaryStrip.contextDifferences,
        simulationParametersSignature: deriveSimulationParametersSignature(activeConfigRef.current)
      }
    });

    downloadReplaySnapshotBundle(bundle);
    setReplayStatus('Replay snapshot exported.');
  };

  const onSaveReplayPreset = () => {
    const presetPayload = validateReplayComparisonPreset({
      name: replayPresetName,
      seed: replayContextRef.current?.resolvedSeed,
      parameters: activeConfigRef.current
    });

    if (!presetPayload) {
      setReplayPresetStatus('Unable to save preset. Ensure replay context and deterministic parameters are valid.');
      return;
    }

    const deduplicated = replayComparisonPresets.filter((preset) => preset.name.toLowerCase() !== presetPayload.name.toLowerCase());
    const nextPresets = [...deduplicated, presetPayload];
    saveReplayComparisonPresets(nextPresets);
    setReplayComparisonPresets(nextPresets);
    setReplayPresetName('');
    setReplayPresetStatus('Replay comparison preset saved.');
  };

  const onApplyReplayPreset = (preset) => {
    if (!confirmDiscardUnsavedFormChanges()) {
      setReplayPresetStatus('Apply preset cancelled.');
      return;
    }

    const validatedPreset = validateReplayComparisonPreset(preset);
    if (!validatedPreset) {
      setReplayPresetStatus('Preset payload is invalid and cannot be applied.');
      return;
    }

    setFormState((previous) => ({
      ...previous,
      seed: validatedPreset.seed,
      worldWidth: String(validatedPreset.parameters.worldWidth),
      worldHeight: String(validatedPreset.parameters.worldHeight),
      initialPopulation: String(validatedPreset.parameters.initialPopulation),
      minimumPopulation: String(validatedPreset.parameters.minimumPopulation),
      initialFoodCount: String(validatedPreset.parameters.initialFoodCount),
      foodSpawnChance: String(validatedPreset.parameters.foodSpawnChance),
      foodEnergyValue: String(validatedPreset.parameters.foodEnergyValue),
      maxFood: String(validatedPreset.parameters.maxFood),
      mutationRate: String(validatedPreset.parameters.mutationRate ?? DEFAULT_CONFIG.mutationRate),
      mutationStrength: String(validatedPreset.parameters.mutationStrength ?? DEFAULT_CONFIG.mutationStrength)
    }));

    setReplayPresetStatus(`Applied preset: ${validatedPreset.name}.`);
  };

  const onDeleteReplayPreset = (presetName) => {
    const nextPresets = replayComparisonPresets.filter((preset) => preset.name !== presetName);
    saveReplayComparisonPresets(nextPresets);
    setReplayComparisonPresets(nextPresets);
    setReplayPresetStatus(`Deleted preset: ${presetName}.`);
  };

  const formatTimestamp = (value) => {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.valueOf())) {
      return value;
    }

    return parsed.toLocaleString();
  };

  return (
    <main className="app-shell">
      <header className="app-header">
        <h1>SNN Sandbox</h1>
        <p>Configure and run deterministic simulations</p>
      </header>

      {toastsEnabled ? (
        <section className="toast-viewport" aria-label="simulation control toasts" aria-live="polite" aria-atomic="true">
          {toasts.map((toast) => (
            <div
              key={toast.id}
              className={`toast-item toast-${toast.variant}`}
              role={toast.variant === 'error' ? 'alert' : 'status'}
            >
              <span>{toast.message}</span>
              <button type="button" className="toast-dismiss" onClick={() => dismissToast(toast.id)} aria-label="Dismiss toast">
                ×
              </button>
            </div>
          ))}
        </section>
      ) : null}

      <section className="config-panel" aria-label="simulation configuration">
        <h2>Simulation config</h2>

        <label>
          Simulation name
          <input value={formState.name} onChange={onFieldChange('name')} />
          {errors.name ? <span className="error-text">{errors.name}</span> : null}
        </label>

        <label>
          Seed (optional)
          <input value={formState.seed} onChange={onFieldChange('seed')} placeholder="Leave blank to auto-generate" />
        </label>

        <h3>World settings</h3>
        <p className="field-hint">World width/height: 100–3000.</p>
        <div className="field-row">
          <label>
            World width
            <input type="number" value={formState.worldWidth} onChange={onFieldChange('worldWidth')} />
            {errors.worldWidth ? <span className="error-text">{errors.worldWidth}</span> : null}
          </label>
          <label>
            World height
            <input type="number" value={formState.worldHeight} onChange={onFieldChange('worldHeight')} />
            {errors.worldHeight ? <span className="error-text">{errors.worldHeight}</span> : null}
          </label>
        </div>

        <h3>Population settings</h3>
        <p className="field-hint">Initial/minimum population: 1–500.</p>
        <div className="field-row">
          <label>
            Initial population
            <input type="number" value={formState.initialPopulation} onChange={onFieldChange('initialPopulation')} />
            {errors.initialPopulation ? <span className="error-text">{errors.initialPopulation}</span> : null}
          </label>
          <label>
            Minimum population
            <input type="number" value={formState.minimumPopulation} onChange={onFieldChange('minimumPopulation')} />
            {errors.minimumPopulation ? <span className="error-text">{errors.minimumPopulation}</span> : null}
          </label>
        </div>

        <h3>Food settings</h3>
        <p className="field-hint">Spawn chance: 0–1. Max food must be ≥ initial food count.</p>
        <div className="field-row">
          <label>
            Initial food count
            <input type="number" value={formState.initialFoodCount} onChange={onFieldChange('initialFoodCount')} />
            {errors.initialFoodCount ? <span className="error-text">{errors.initialFoodCount}</span> : null}
          </label>
          <label>
            Food spawn chance (0-1)
            <input type="number" step="0.01" value={formState.foodSpawnChance} onChange={onFieldChange('foodSpawnChance')} />
            {errors.foodSpawnChance ? <span className="error-text">{errors.foodSpawnChance}</span> : null}
          </label>
          <label>
            Food energy value
            <input type="number" value={formState.foodEnergyValue} onChange={onFieldChange('foodEnergyValue')} />
            {errors.foodEnergyValue ? <span className="error-text">{errors.foodEnergyValue}</span> : null}
          </label>
        </div>

        <label>
          Max food
          <input type="number" value={formState.maxFood} onChange={onFieldChange('maxFood')} />
          {errors.maxFood ? <span className="error-text">{errors.maxFood}</span> : null}
        </label>

        <h3>Evolution settings</h3>
        <p className="field-hint">Mutation controls are deterministic and seed-driven (range 0–1).</p>
        <div className="field-row">
          <label>
            Mutation rate
            <input type="number" step="0.01" value={formState.mutationRate} onChange={onFieldChange('mutationRate')} />
            {errors.mutationRate ? <span className="error-text">{errors.mutationRate}</span> : null}
          </label>
          <label>
            Mutation strength
            <input type="number" step="0.01" value={formState.mutationStrength} onChange={onFieldChange('mutationStrength')} />
            {errors.mutationStrength ? <span className="error-text">{errors.mutationStrength}</span> : null}
          </label>
        </div>

        <div className="field-row">
          <button type="button" onClick={onResetConfigToDefaults}>
            Use defaults
          </button>
          <button type="button" onClick={startSimulation}>
            Start simulation
          </button>
        </div>
        {hasUnsavedFormChanges ? (
          <p aria-live="polite">Unsaved setup changes in: {dirtyFormFields.join(', ')}.</p>
        ) : null}
      </section>

      {resolvedSeed ? <p className="seed-banner">Resolved seed: {resolvedSeed}</p> : null}

      <section className="controls" aria-label="simulation controls">
        <p>Active seed: {resolvedSeed || 'No active simulation'}</p>
        <ControlButtonWithHint name="regenerate-seed" onClick={onRegenerateSeed} reason={controlDisableReasons.regenerateSeed}>
          Regenerate seed + restart
        </ControlButtonWithHint>
        <ControlButtonWithHint name="restart-seed" onClick={onRestartFromSeed} reason={controlDisableReasons.restartFromSeed}>
          Restart from Seed
        </ControlButtonWithHint>
        {seedControlStatus ? <p aria-live="polite">{seedControlStatus}</p> : null}
        <ControlButtonWithHint
          name="pause"
          onClick={onPause}
          reason={controlDisableReasons.pause}
          aria-pressed={paused || replayActive}
        >
          Pause
        </ControlButtonWithHint>
        <div className="speed-presets" role="group" aria-label="speed presets">
          {SPEED_OPTIONS.map((multiplier) => {
            const isActivePreset = !paused && !replayActive && speedMultiplier === multiplier;

            return (
              <ControlButtonWithHint
                key={multiplier}
                name={`speed-${multiplier}`}
                onClick={() => onSpeedSelect(multiplier)}
                reason={controlDisableReasons.speed}
                className={`speed-preset-button${isActivePreset ? ' is-active' : ''}`}
                aria-pressed={isActivePreset}
              >
                {multiplier}x
              </ControlButtonWithHint>
            );
          })}
        </div>
        <ControlButtonWithHint name="step-plus-1" onClick={onStepTick} reason={controlDisableReasons.step}>
          Step +1
        </ControlButtonWithHint>
        <ControlButtonWithHint name="step-plus-10" onClick={onStepTenTicks} reason={controlDisableReasons.step}>
          Step +10
        </ControlButtonWithHint>
        <ControlButtonWithHint name="save-snapshot" onClick={onSaveSimulation} reason={controlDisableReasons.saveSnapshot}>
          Save snapshot
        </ControlButtonWithHint>
        <button
          type="button"
          onClick={onOpenKeyboardShortcuts}
          ref={keyboardShortcutsTriggerRef}
          aria-haspopup="dialog"
          aria-expanded={keyboardShortcutsModalOpen}
        >
          Keyboard Shortcuts
        </button>
        <p className="shortcut-hints">Shortcuts: Space pause/play · . single-step (paused) · 1/2/3/4 set speed (1x/2x/5x/10x)</p>
      </section>

      {keyboardShortcutsModalOpen ? (
        <div className="modal-backdrop" role="presentation">
          <section className="modal-panel" role="dialog" aria-modal="true" aria-label="keyboard shortcuts help">
            <div className="modal-header-row">
              <h2>Keyboard Shortcuts</h2>
              <button type="button" onClick={onCloseKeyboardShortcuts} ref={keyboardShortcutsCloseButtonRef} aria-label="Close keyboard shortcuts">
                Close
              </button>
            </div>
            <p>These shortcuts control simulation playback and inspector actions without changing deterministic logic.</p>
            <dl className="shortcut-list">
              <div>
                <dt>Space</dt>
                <dd>Toggle pause/play.</dd>
              </div>
              <div>
                <dt>.</dt>
                <dd>Advance one tick while paused.</dd>
              </div>
              <div>
                <dt>[ / ]</dt>
                <dd>Move focus between inspector trait sections (Identity, Lifecycle, Energy, Locomotion, Senses).</dd>
              </div>
              <div>
                <dt>Enter</dt>
                <dd>Toggle the focused inspector section.</dd>
              </div>
              <div>
                <dt>1 / 2 / 3 / 4</dt>
                <dd>Set speed to 1x / 2x / 5x / 10x directly.</dd>
              </div>
              <div>
                <dt>← / →</dt>
                <dd>Select previous / next organism in deterministic order.</dd>
              </div>
              <div>
                <dt>P</dt>
                <dd>Pin or unpin the organism inspector.</dd>
              </div>
            </dl>
            <p>Press Escape to close this dialog.</p>
          </section>
        </div>
      ) : null}

      {pendingDeleteSnapshot ? (
        <div className="modal-backdrop" role="presentation">
          <section className="modal-panel" role="dialog" aria-modal="true" aria-label="delete saved simulation confirmation">
            <div className="modal-header-row">
              <h2>Delete saved simulation?</h2>
            </div>
            <p>This action cannot be undone.</p>
            <p>Name: {pendingDeleteSnapshot.name}</p>
            <p>Seed: {pendingDeleteSnapshot.seed || 'unknown'}</p>
            <p>Tick: {pendingDeleteSnapshot.tickCount}</p>
            <p>Last updated: {formatTimestamp(pendingDeleteSnapshot.updatedAt)}</p>
            <div className="field-row">
              <button type="button" onClick={onConfirmDeleteSimulation} ref={deleteConfirmButtonRef}>Confirm delete</button>
              <button type="button" onClick={onCancelDeleteSimulation}>Cancel</button>
            </div>
            <p>Press Escape to cancel.</p>
          </section>
        </div>
      ) : null}

      <section className="config-panel" aria-label="run metadata panel">
        <h2>Run metadata</h2>
        <p>Seed: {runMetadata.seed}</p>
        <p>Current tick: {runMetadata.tickCount}</p>
        <p>Speed multiplier: {runMetadata.speedMultiplier}</p>
        <p>Snapshot ID: {runMetadata.snapshotId}</p>
        <button type="button" onClick={onCopyRunMetadata} disabled={!hasSimulation}>Copy metadata payload</button>
      </section>

      {replayActive ? (
        <div ref={replayInteractionRegionRef} onKeyDown={onReplayMismatchKeyboardNavigate}>
          <section className="config-panel replay-summary-strip" aria-label="replay session summary strip" tabIndex={-1}>
            <h2>Replay summary</h2>
            <p>Deterministic context: {replaySummaryStrip.contextLabel}</p>
            <p>Seed: {replaySummaryStrip.seed}</p>
            <p>Simulation version: {replaySummaryStrip.simulationVersion}</p>
            <p>Parameter fingerprint: {replaySummaryStrip.parameterFingerprint}</p>
            <button type="button" onClick={onCopyDeterministicContext}>Copy deterministic context</button>
            {replaySummaryStrip.contextDifferences.length > 0 ? (
              <p>Context differences: {replaySummaryStrip.contextDifferences.join(', ')}</p>
            ) : null}
            <p>Simulation: {replaySummaryStrip.simulationName}</p>
            <p>Simulation ID: {replaySummaryStrip.simulationId}</p>
            <p>Captured tick range: {replaySummaryStrip.startTick} → {replaySummaryStrip.endTick}</p>
            <p>Total replay duration (ticks): {replaySummaryStrip.durationTicks}</p>
          </section>
          {replaySummaryStrip.mismatchDetected || selectedMismatchDetails ? (
            <section className="config-panel" aria-label="replay mismatch details">
              <h2>Mismatch details</h2>
              <button type="button" onClick={onCopyMismatchReport} disabled={!selectedMismatchDetails}>Copy mismatch report</button>
              {replaySummaryStrip.mismatchEvents.length > 0 ? (
                <>
                  <h3>Mismatch filters</h3>
                  <div className="field-row" aria-label="mismatch type filters">
                    {['state', 'input', 'output'].map((type) => (
                      <button
                        key={type}
                        type="button"
                        onClick={() => toggleMismatchFilter('types', type)}
                        aria-pressed={mismatchEventFilters.types.includes(type)}
                      >
                        Type: {type}
                      </button>
                    ))}
                  </div>
                  <div className="field-row" aria-label="mismatch severity filters">
                    {['low', 'medium', 'high'].map((severity) => (
                      <button
                        key={severity}
                        type="button"
                        onClick={() => toggleMismatchFilter('severities', severity)}
                        aria-pressed={mismatchEventFilters.severities.includes(severity)}
                      >
                        Severity: {severity}
                      </button>
                    ))}
                  </div>
                  {activeMismatchFilterChips.length > 0 ? (
                    <div className="field-row" aria-label="active mismatch filters">
                      {activeMismatchFilterChips.map((chip) => (
                        <button
                          key={`${chip.category}-${chip.value}`}
                          type="button"
                          onClick={() => clearMismatchFilter(chip.category, chip.value)}
                        >
                          {chip.label} ×
                        </button>
                      ))}
                      <button type="button" onClick={clearAllMismatchFilters}>Clear all filters</button>
                    </div>
                  ) : null}
                  {filteredMismatchEvents.length > 0 ? (
                    <>
                      <h3>Mismatch events</h3>
                      <p>Keyboard: Alt+ArrowUp / Alt+ArrowDown to move between mismatch events while focused in replay panels.</p>
                      <p className="sr-only" aria-live="polite">{activeMismatchAnnouncement}</p>
                      <ul>
                        {filteredMismatchEvents.map((eventItem) => {
                          const isActiveMismatch = selectedMismatchDetails?.id === eventItem.id;
                          return (
                            <li key={eventItem.id}>
                              <button
                                type="button"
                                onClick={() => onJumpToMismatchEvent(eventItem)}
                                className={isActiveMismatch ? 'active-mismatch-event' : undefined}
                                aria-current={isActiveMismatch ? 'true' : undefined}
                              >
                                Tick {eventItem.tick} · {eventItem.path} · type {eventItem.type} · baseline {formatMismatchDisplayValue(eventItem.baselineValue)} · comparison{' '}
                                {formatMismatchDisplayValue(eventItem.comparisonValue)}
                                {eventItem.severity ? ` · severity ${eventItem.severity}` : ''}
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    </>
                  ) : (
                    <p>No mismatch events match active filters.</p>
                  )}
                </>
              ) : (
                <p>No mismatch events available for this replay payload.</p>
              )}
              {selectedMismatchDetails ? (
                <>
                  <p>First mismatch tick: {selectedMismatchDetails.tick}</p>
                  {selectedMismatchDetails.entityId ? (
                    <p>Entity ID: {selectedMismatchDetails.entityId}</p>
                  ) : null}
                  <p>Compared key/path: {selectedMismatchDetails.path}</p>
                  <p>Baseline value: {formatMismatchDisplayValue(selectedMismatchDetails.baselineValue)}</p>
                  <p>Comparison value: {formatMismatchDisplayValue(selectedMismatchDetails.comparisonValue)}</p>
                  {selectedMismatchDetails.severity ? <p>Severity: {selectedMismatchDetails.severity}</p> : null}
                  <p>
                    Absolute delta:{' '}
                    {selectedMismatchDetails.absoluteDelta === null
                      ? 'N/A'
                      : formatMismatchDisplayValue(selectedMismatchDetails.absoluteDelta)}
                  </p>
                </>
              ) : null}
            </section>
          ) : null}
          <section className="config-panel" aria-label="replay comparison presets">
            <h2>Replay comparison presets</h2>
            <p>Save deterministic seed + parameter payloads for quick replay comparison reruns.</p>
            <div className="field-row">
              <label>
                Preset name
                <input
                  value={replayPresetName}
                  onChange={(event) => setReplayPresetName(event.target.value)}
                  placeholder="e.g. mismatch regression seed"
                />
              </label>
              <button type="button" onClick={onSaveReplayPreset}>Save preset</button>
            </div>
            {replayComparisonPresets.length > 0 ? (
              <ul>
                {replayComparisonPresets.map((preset) => (
                  <li key={preset.name}>
                    {preset.name} — seed {preset.seed}
                    <button type="button" onClick={() => onApplyReplayPreset(preset)}>Apply</button>{' '}
                    <button type="button" onClick={() => onDeleteReplayPreset(preset.name)}>Delete</button>
                  </li>
                ))}
              </ul>
            ) : (
              <p>No replay comparison presets saved yet.</p>
            )}
            {replayPresetStatus ? <p>{replayPresetStatus}</p> : null}
          </section>
          <section className="config-panel" aria-label="replay timeline controls">
            <h2>Replay timeline</h2>
            <p>Loaded tick floor: {replayContextRef.current?.baseWorldState?.tick ?? 0}</p>
            <label>
              Timeline scrubber
              <input
                aria-label="Replay timeline scrubber"
                type="range"
                min={replayTimeline.minTick}
                max={replayTimeline.latestRecordedTick}
                step="1"
                value={replayTimeline.currentTick}
                onChange={onReplayScrub}
                list="replay-mismatch-markers"
              />
            </label>
            {replayTimeline.markerTicks.length > 0 ? (
              <div className="replay-marker-strip" aria-label="Replay mismatch markers">
                {replayTimeline.markerTicks.map((markerTick) => {
                  const positionPercent = replayTimeline.latestRecordedTick > 0
                    ? (markerTick / replayTimeline.latestRecordedTick) * 100
                    : 0;
                  const isActiveMismatchMarker = selectedMismatchDetails?.tick === markerTick;
                  return (
                    <span
                      key={`marker-${markerTick}`}
                      className={isActiveMismatchMarker ? 'replay-marker replay-marker-active' : 'replay-marker'}
                      style={{ left: `${positionPercent}%` }}
                      title={`Mismatch tick ${markerTick}`}
                      aria-hidden="true"
                    />
                  );
                })}
              </div>
            ) : null}
            <datalist id="replay-mismatch-markers">
              {replayTimeline.markerTicks.map((markerTick) => (
                <option key={`tick-option-${markerTick}`} value={markerTick} />
              ))}
            </datalist>
            <label>
              Jump to tick
              <input
                type="number"
                value={replayTickInput}
                onChange={(event) => setReplayTickInput(event.target.value)}
                min={replayTimeline.minTick}
                max={replayTimeline.latestRecordedTick}
              />
            </label>
            <div className="field-row">
              <button type="button" onClick={onReplayJump}>Jump</button>
              {replaySummaryStrip.mismatchDetected ? (
                <button
                  type="button"
                  onClick={onJumpToFirstMismatch}
                  disabled={!replaySummaryStrip.canJumpToFirstMismatch}
                >
                  Jump to First Mismatch
                </button>
              ) : null}
              <button type="button" onClick={onExportReplaySnapshot}>Export Snapshot</button>
              <button type="button" onClick={onResumeFromReplay}>Resume live from selected tick</button>
            </div>
          </section>
        </div>
      ) : null}

      {saveStatus ? <p>{saveStatus}</p> : null}
      {saveErrorDetail ? (
        <p role="alert">
          Save error: {saveErrorDetail} <button type="button" onClick={onSaveSimulation}>Retry save</button>
        </p>
      ) : null}
      {loadStatus ? <p>{loadStatus}</p> : null}
      {deleteStatus ? <p>{deleteStatus}</p> : null}
      {copyMetadataStatus ? <p>{copyMetadataStatus}</p> : null}
      {replayStatus ? <p>{replayStatus}</p> : null}
      {activeLoadedMetadata ? (
        <p>
          Active snapshot: {activeLoadedMetadata.name} (updated {formatTimestamp(activeLoadedMetadata.updatedAt)})
        </p>
      ) : null}

      <section className="config-panel" aria-label="saved simulations">
        <h2>Saved simulations</h2>
        {savedSimulations.length === 0 ? (
          <p>No saved simulations yet.</p>
        ) : (
          <ul>
            {savedSimulations.map((snapshot) => {
              const isLoadingSnapshot = Boolean(loadingSnapshotById[snapshot.id]);

              return (
                <li key={snapshot.id}>
                  <strong>{snapshot.name}</strong> — updated {formatTimestamp(snapshot.updatedAt)} · seed {snapshot.seed || 'unknown'} · tick {snapshot.tickCount} · population {snapshot.populationCount ?? 'metadata unavailable'}{' '}
                  <button type="button" onClick={() => onLoadSimulation(snapshot)} disabled={isLoadingSnapshot}>
                    {isLoadingSnapshot ? 'Loading…' : 'Resume'}
                  </button>{' '}
                  <button type="button" onClick={() => onDeleteSimulation(snapshot)} disabled={isLoadingSnapshot}>Delete</button>
                  {loadRecoveryBySnapshotId[snapshot.id] ? (
                    <p role="alert">
                      {loadRecoveryBySnapshotId[snapshot.id]}{' '}
                      <button type="button" onClick={() => onLoadSimulation(snapshot)} disabled={isLoadingSnapshot}>Retry</button>{' '}
                      <button type="button" onClick={() => onDeleteSimulation(snapshot)} disabled={isLoadingSnapshot}>Delete broken save</button>
                    </p>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="simulation-stage" aria-label="simulation stage">
        <section className="simulation-stats-hud" aria-label="simulation stats hud">
          <h2>Simulation stats</h2>
          <p>Seed: {hudSeedLabel}</p>
          <p>Population: {formattedStats.population}</p>
          <p>Food count: {formattedStats.foodCount}</p>
          <p>Average generation: {formattedStats.averageGeneration}</p>
          <p>Average organism energy: {formattedStats.averageEnergy}</p>
          <p>Tick count: {formattedStats.tickCount}</p>
          <p>Time elapsed: {formattedStats.elapsedTime}</p>
          <p>Tick budget clamp: {schedulerClampState.active ? `Active (dropped ${schedulerClampState.droppedTicks} ticks this frame)` : 'Inactive'}</p>
          <ControlButtonWithHint name="copy-seed-hud" onClick={onCopyActiveSeed} reason={controlDisableReasons.copySeed}>
            Copy seed
          </ControlButtonWithHint>
        </section>

        <canvas
          ref={canvasRef}
          width={Number(formState.worldWidth) || DEFAULT_CONFIG.worldWidth}
          height={Number(formState.worldHeight) || DEFAULT_CONFIG.worldHeight}
          aria-label="simulation world"
          onClick={onCanvasClick}
        />
      </section>

      <section className="config-panel" aria-label="organism inspector" role="region">
        <h2 id="organism-inspector-heading">Organism inspector</h2>
        <div className="field-row" role="group" aria-label="organism selection controls">
          <button
            type="button"
            onClick={onSelectPreviousOrganism}
            disabled={deterministicOrganismIds.length === 0}
            aria-label="Select previous organism"
          >
            Previous organism
          </button>
          <button
            type="button"
            onClick={onSelectNextOrganism}
            disabled={deterministicOrganismIds.length === 0}
            aria-label="Select next organism"
          >
            Next organism
          </button>
          <button
            type="button"
            onClick={onToggleInspectorPin}
            aria-pressed={inspectorPinned}
            aria-label={inspectorPinned ? 'Unpin organism inspector' : 'Pin organism inspector'}
          >
            {inspectorPinned ? 'Unpin inspector' : 'Pin inspector'}
          </button>
        </div>
        <p className="shortcut-hints">Inspector shortcuts: ←/↑ previous organism · →/↓ next organism · P pin/unpin inspector · [/] section focus · Enter toggle section</p>
        <p role="status" aria-live="polite">Pin mode: {inspectorPinned ? 'Enabled' : 'Disabled'}</p>
        {inspectorOrganism ? (
          <>
            <button type="button" onClick={clearSelection} aria-label="close organism inspector">Close inspector</button>
            {selectedOrganismUnavailable && inspectorPinned ? (
              <p role="status"><strong>Organism no longer alive.</strong> Showing last known values.</p>
            ) : null}
            {hasComparisonPair ? (
              <section aria-label="organism comparison">
                <h3>Selected vs pinned comparison</h3>
                <p>
                  Live selected organism <strong>{selectedOrganism.id}</strong> compared with pinned organism <strong>{pinnedComparisonCandidate.id}</strong>.
                </p>
                <table>
                  <caption>Selected and pinned organism comparison</caption>
                  <thead>
                    <tr>
                      <th scope="col">Field</th>
                      <th scope="col">Selected ({selectedOrganism.id})</th>
                      <th scope="col">Pinned ({pinnedComparisonCandidate.id})</th>
                      <th scope="col">Difference</th>
                    </tr>
                  </thead>
                  <tbody>
                    {comparisonRows.map((row) => (
                      <tr key={row.key}>
                        <th scope="row">{row.label}</th>
                        <td>{row.selectedDisplay}</td>
                        <td>{row.pinnedDisplay}</td>
                        <td>
                          <span aria-label={`${row.label} difference`}>{row.deltaLabel}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            ) : comparisonUnavailableReason ? (
              <p role="status">{comparisonUnavailableReason}</p>
            ) : null}
            <h3 ref={inspectorSelectionHeadingRef} tabIndex={-1} aria-label="inspector selection details">
              Selected organism details
            </h3>
            <p><strong>ID:</strong> {inspectorOrganism.id}</p>
            <section className="inspector-lineage-row" aria-label="inspector lineage row">
              <h4>Lineage</h4>
              <p>
                <strong>Generation:</strong> {formattedInspector.generation} · <strong>Parent:</strong> {formattedInspector.parentId} · <strong>Offspring:</strong>{' '}
                {formattedInspector.offspringCount}
              </p>
            </section>
            <section className="inspector-critical-stats" aria-label="inspector critical stats">
              <h4>Critical stats</h4>
              <p><strong>Energy:</strong> {formattedInspector.energy}</p>
              <p><strong>Age:</strong> {formattedInspector.age}</p>
              <p><strong>Generation:</strong> {formattedInspector.generation}</p>
              <p><strong>Food distance:</strong> {formattedInspector.nearestFoodDistance}</p>
            </section>
            {selectedOrganismId && inspectorTrendState.samples.length > 1 ? (
              <section className="inspector-trend-strip" aria-label="selected organism trend strip">
                <h4>Recent trend ({inspectorTrendState.samples.length} ticks)</h4>
                <svg
                  viewBox={`0 0 ${INSPECTOR_TREND_STRIP_WIDTH} ${INSPECTOR_TREND_STRIP_HEIGHT}`}
                  role="img"
                  aria-label={`Selected organism trend strip for energy and age over the most recent ${inspectorTrendState.samples.length} ticks`}
                >
                  <polyline
                    points={inspectorEnergyTrendPoints}
                    fill="none"
                    stroke="#22c55e"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <polyline
                    points={inspectorAgeTrendPoints}
                    fill="none"
                    stroke="#38bdf8"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                <p className="inspector-trend-strip-legend">
                  <span>Energy</span>
                  <span>Age</span>
                </p>
              </section>
            ) : null}
            <div
              className={`inspector-sections-layout${isCompactInspectorLayout ? ' is-compact' : ''}`}
              data-layout-mode={isCompactInspectorLayout ? 'compact' : 'desktop'}
            >
              {INSPECTOR_SECTION_ORDER.map((sectionKey, index) => {
                const expanded = Boolean(inspectorSectionExpanded[sectionKey]);
                const buttonId = `inspector-${sectionKey}-toggle`;
                const regionId = `inspector-${sectionKey}-region`;
                const traitSection = inspectorTraitSections.find((section) => section.key === sectionKey);

                return (
                  <div key={sectionKey} className={`inspector-section${sectionKey === 'brain' ? ' inspector-section-brain' : ''}`}>
                    <h3>
                      <button
                        id={buttonId}
                        type="button"
                        className="inspector-section-toggle"
                        aria-expanded={expanded}
                        aria-controls={regionId}
                        onClick={() => {
                          setActiveInspectorSectionIndex(index);
                          setInspectorSectionExpanded((previous) => ({
                            ...previous,
                            [sectionKey]: !previous[sectionKey]
                          }));
                        }}
                        onFocus={() => setActiveInspectorSectionIndex(index)}
                        ref={(element) => {
                          if (element) {
                            inspectorSectionButtonRefs.current.set(sectionKey, element);
                          } else {
                            inspectorSectionButtonRefs.current.delete(sectionKey);
                          }
                        }}
                      >
                        {traitSection?.label ?? 'Brain'}
                      </button>
                    </h3>
                    <div id={regionId} role="region" aria-labelledby={buttonId} hidden={!expanded}>
                      {traitSection ? traitSection.fields.map((field) => (
                        <p key={`${sectionKey}-${field.key}`}><strong>{field.label}:</strong> {field.value}</p>
                      )) : null}
                      {sectionKey === 'brain' ? (
                      <>
                        <p><strong>Genome signature:</strong> {formattedInspector.neuronCount}N-{formattedInspector.synapseCount}S</p>
                        <p>
                          <strong>Neuron IDs:</strong>{' '}
                          {(inspectorOrganism.brain?.neurons ?? [])
                            .map((neuron, neuronIndex) => neuron?.id ?? `n${neuronIndex + 1}`)
                            .join(', ') || '—'}
                        </p>
                        <h4>Brain visualizer (read-only)</h4>
                        {brainGraphModel ? (
                          <>
                            <p>
                              <strong>Neurons:</strong> {brainGraphModel.nodes.length} | <strong>Synapses:</strong> {baseBrainGraphModel?.edges.length ?? 0} |{' '}
                              <strong>Rendered edges:</strong> {brainGraphModel.edges.length}
                            </p>
                            <div aria-label="brain graph legend">
                              <p><strong>Neuron legend:</strong></p>
                              <ul>
                                <li>Input neurons: left column in the graph.</li>
                                <li>Hidden neurons: center column in the graph.</li>
                                <li>Output neurons: right column in the graph.</li>
                              </ul>
                              <p aria-label="brain graph weight legend">
                                Synapse weights (fixed scale -1.0 to +1.0): <span style={{ color: '#22c55e' }}>green = excitatory (+)</span>,{' '}
                                <span style={{ color: '#ef4444' }}>red = inhibitory (-)</span>, thicker edge = stronger magnitude.
                              </p>
                            </div>
                            <p><strong>Layout checksum:</strong> <code>{brainGraphLayoutChecksum || 'n/a'}</code></p>
                            <p>
                              Deterministic viewport policy: fit transform is applied whenever the inspected organism changes; Reset View restores that same fit transform.
                            </p>
                            <div className="brain-graph-controls" role="group" aria-label="brain visualizer viewport controls">
                              <button type="button" onClick={onFitBrainGraphViewport}>Fit</button>
                              <button type="button" onClick={() => onZoomBrainGraphViewport(1)}>Zoom In</button>
                              <button type="button" onClick={() => onZoomBrainGraphViewport(-1)}>Zoom Out</button>
                              <button type="button" onClick={onFitBrainGraphViewport}>Reset View</button>
                            </div>
                            <div className="brain-graph-controls" role="group" aria-label="brain visualizer signal emphasis controls">
                              <label>
                                <input
                                  type="checkbox"
                                  aria-label="hide near-zero-weight synapses"
                                  checked={hideNearZeroBrainEdges}
                                  onChange={(event) => setHideNearZeroBrainEdges(event.target.checked)}
                                />{' '}
                                Hide near-zero-weight synapses (|w| &lt; 0.1)
                              </label>
                              <label htmlFor="strongest-synapse-count-input">
                                Highlight strongest synapses
                              </label>
                              <input
                                id="strongest-synapse-count-input"
                                aria-label="highlight strongest synapse count"
                                type="number"
                                min="0"
                                max={baseBrainGraphModel?.edges.length ?? 0}
                                value={strongestBrainEdgeCount}
                                onChange={(event) => {
                                  const numeric = Number(event.target.value);
                                  if (!Number.isFinite(numeric)) {
                                    setStrongestBrainEdgeCount(0);
                                    return;
                                  }
                                  const clamped = Math.max(0, Math.min(baseBrainGraphModel?.edges.length ?? 0, Math.floor(numeric)));
                                  setStrongestBrainEdgeCount(clamped);
                                }}
                              />
                            </div>
                            <div className="brain-graph-controls" role="group" aria-label="brain visualizer neuron filter controls">
                              <label>
                                <input type="checkbox" checked={brainFilterTypes.input} onChange={() => onToggleBrainNeuronType('input')} /> Input
                              </label>
                              <label>
                                <input type="checkbox" checked={brainFilterTypes.hidden} onChange={() => onToggleBrainNeuronType('hidden')} /> Hidden
                              </label>
                              <label>
                                <input type="checkbox" checked={brainFilterTypes.output} onChange={() => onToggleBrainNeuronType('output')} /> Output
                              </label>
                              <label htmlFor="brain-min-activation-threshold">Min activation</label>
                              <input
                                id="brain-min-activation-threshold"
                                aria-label="minimum neuron activation threshold"
                                type="number"
                                min="0"
                                max="1"
                                step="0.05"
                                value={brainMinActivationThreshold}
                                onChange={(event) => {
                                  const nextValue = Number(event.target.value);
                                  if (!Number.isFinite(nextValue)) {
                                    setBrainMinActivationThreshold(0);
                                    return;
                                  }
                                  setBrainMinActivationThreshold(Math.max(0, Math.min(1, Number(nextValue.toFixed(3)))));
                                }}
                              />
                              <button type="button" onClick={onClearBrainFiltersAndPin}>Clear filters + pin</button>
                            </div>
                            <div className="brain-graph-controls" role="group" aria-label="brain visualizer focus mode controls">
                              <label htmlFor="brain-focus-neuron-select">Selected neuron</label>
                              <select
                                id="brain-focus-neuron-select"
                                aria-label="selected neuron for focus mode"
                                value={selectedBrainNeuronId ?? ''}
                                onChange={(event) => onSelectBrainNeuron(event.target.value)}
                              >
                                <option value="">None</option>
                                {brainGraphModel.nodes.map((node) => (
                                  <option key={`focus-neuron-${node.id}`} value={node.id}>{node.id}</option>
                                ))}
                              </select>
                              <div role="radiogroup" aria-label="brain focus mode">
                                <label>
                                  <input
                                    type="radio"
                                    name="brain-focus-mode"
                                    value="full"
                                    checked={brainFocusMode === 'full'}
                                    onChange={() => setBrainFocusMode('full')}
                                  /> Full graph
                                </label>
                                <label>
                                  <input
                                    type="radio"
                                    name="brain-focus-mode"
                                    value="incoming"
                                    checked={brainFocusMode === 'incoming'}
                                    onChange={() => setBrainFocusMode('incoming')}
                                    disabled={!selectedBrainNeuronId}
                                  /> Incoming only
                                </label>
                                <label>
                                  <input
                                    type="radio"
                                    name="brain-focus-mode"
                                    value="outgoing"
                                    checked={brainFocusMode === 'outgoing'}
                                    onChange={() => setBrainFocusMode('outgoing')}
                                    disabled={!selectedBrainNeuronId}
                                  /> Outgoing only
                                </label>
                              </div>
                            </div>
                            <p aria-live="polite">
                              Focus mode: <strong>{brainFocusMode}</strong> · Selected neuron: {selectedBrainNeuronId || 'none'}
                            </p>
                            <p aria-live="polite">Pinned neuron: {brainGraphModel.pinnedNeuronId || 'none'}</p>
                            <p aria-live="polite">Emphasized output neuron: {brainGraphModel.emphasizedOutputNeuronId || 'none'}</p>
                            {brainGraphModel.emphasizedOutputNeuronMetadata ? (
                              <p>
                                Output emphasis metadata — id: {brainGraphModel.emphasizedOutputNeuronMetadata.id}, incoming edges:{' '}
                                {brainGraphModel.emphasizedOutputNeuronMetadata.incomingEdgeCount}, source neurons: {brainGraphModel.emphasizedOutputNeuronMetadata.sourceNeuronCount}
                              </p>
                            ) : null}
                            <button type="button" onClick={() => setEmphasizedOutputNeuronId(null)}>Clear output emphasis</button>
                            <ul aria-label="pin neuron controls">
                              {brainGraphModel.nodes.map((node) => {
                                const isPinnedNode = brainGraphModel.pinnedNeuronId === node.id;
                                const isEmphasizedOutputNode = node.type === 'output' && brainGraphModel.emphasizedOutputNeuronId === node.id;

                                return (
                                  <li key={`pin-control-${node.id}`}>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setPinnedBrainNeuronId((current) => (current === node.id ? null : node.id));
                                        if (node.type === 'output') {
                                          setEmphasizedOutputNeuronId((current) => (current === node.id ? null : node.id));
                                        }
                                        onSelectBrainNeuron(node.id);
                                      }}
                                    >
                                      {isPinnedNode ? `Unpin neuron ${node.id}` : `Pin neuron ${node.id}`}
                                      {node.type === 'output' ? (isEmphasizedOutputNode ? ' · clear output emphasis' : ' · emphasize incoming edges') : ''}
                                    </button>
                                  </li>
                                );
                              })}
                            </ul>
                            {brainGraphModel.pinnedNeuronMetadata ? (
                              <p>
                                Pinned neuron metadata — id: {brainGraphModel.pinnedNeuronMetadata.id}, type: {brainGraphModel.pinnedNeuronMetadata.type}, activation:{' '}
                                {brainGraphModel.pinnedNeuronMetadata.activation.toFixed(3)}, in/out degree: {brainGraphModel.pinnedNeuronMetadata.inboundDegree}/
                                {brainGraphModel.pinnedNeuronMetadata.outboundDegree}
                              </p>
                            ) : null}
                            <p aria-label="brain graph emphasis checksum"><strong>Emphasis checksum:</strong> <code>{brainGraphEmphasisChecksum || 'n/a'}</code></p>
                            <p role="status" aria-live="polite" aria-label="brain graph selected synapse details">
                              {activeSynapse
                                ? `Selected synapse ${activeSynapse.id}: ${activeSynapse.sourceId} → ${activeSynapse.targetId}, ${activeSynapse.polarityLabel}, weight ${activeSynapse.weightLabel}`
                                : 'Select or hover a synapse to inspect source, target, and exact weight.'}
                            </p>
                            <svg viewBox="0 0 640 300" role="img" aria-label="organism brain graph" className="brain-graph">
                              <g transform={`translate(${brainGraphTransform.translateX} ${brainGraphTransform.translateY}) scale(${brainGraphTransform.scale})`}>
                                {brainGraphModel.edges.map((edge) => {
                                  const source = brainGraphNodeById.get(edge.sourceId);
                                  const target = brainGraphNodeById.get(edge.targetId);
                                  if (!source || !target) {
                                    return null;
                                  }

                                  return (
                                    <line
                                      key={edge.id}
                                      x1={source.x}
                                      y1={source.y}
                                      x2={target.x}
                                      y2={target.y}
                                      stroke={edge.color}
                                      strokeWidth={edge.emphasisStrokeWidth}
                                      opacity={activeSynapse?.id === edge.id ? '1' : String(edge.emphasisOpacity)}
                                      className="brain-graph-synapse-edge"
                                      style={{ cursor: 'pointer' }}
                                      onMouseEnter={() => setActiveSynapseId(edge.id)}
                                      onFocus={() => setActiveSynapseId(edge.id)}
                                      onClick={() => setActiveSynapseId(edge.id)}
                                      onKeyDown={(event) => {
                                        if (event.key === 'Enter' || event.key === ' ') {
                                          event.preventDefault();
                                          setActiveSynapseId(edge.id);
                                        }
                                      }}
                                      tabIndex={0}
                                      role="button"
                                      aria-keyshortcuts="Enter Space"
                                      aria-label={`Synapse ${edge.id}: ${source.id} to ${target.id}, weight ${edge.weightLabel}`}
                                    >
                                      <title>{`${source.id} → ${target.id}: ${edge.polarityLabel}, weight ${edge.weightLabel}`}</title>
                                    </line>
                                  );
                                })}
                                {brainGraphModel.nodes.map((node) => {
                                  const isPinnedNode = brainGraphModel.pinnedNeuronId === node.id;
                                  const isEmphasizedOutputTarget = Boolean(node.isEmphasizedOutputTarget);
                                  const isEmphasizedOutputSource = Boolean(node.isEmphasizedOutputSource);
                                  const nodeStroke = isPinnedNode
                                    ? '#f8fafc'
                                    : isEmphasizedOutputTarget
                                      ? '#38bdf8'
                                      : isEmphasizedOutputSource
                                        ? '#facc15'
                                        : '#94a3b8';
                                  const nodeStrokeWidth = isPinnedNode || isEmphasizedOutputTarget ? '3' : isEmphasizedOutputSource ? '2.25' : '1.5';

                                  const handleNodeToggle = () => {
                                    setPinnedBrainNeuronId((current) => (current === node.id ? null : node.id));
                                    if (node.type === 'output') {
                                      setEmphasizedOutputNeuronId((current) => (current === node.id ? null : node.id));
                                    }
                                    onSelectBrainNeuron(node.id);
                                  };

                                  return (
                                    <g
                                      key={node.id}
                                      role="button"
                                      tabIndex={0}
                                      aria-label={`Pin neuron ${node.id}`}
                                      opacity={String(node.emphasisOpacity ?? 1)}
                                      onClick={handleNodeToggle}
                                      onKeyDown={(event) => {
                                        if (event.key === 'Enter' || event.key === ' ') {
                                          event.preventDefault();
                                          handleNodeToggle();
                                        }
                                      }}
                                    >
                                      <circle cx={node.x} cy={node.y} r="10" fill={node.fillColor} stroke={nodeStroke} strokeWidth={nodeStrokeWidth} />
                                      <text x={node.x + 14} y={node.y + 4} fill={node.labelColor} fontSize="12">{node.id} ({node.value.toFixed(2)})</text>
                                    </g>
                                  );
                                })}
                              </g>
                            </svg>
                          </>
                        ) : (
                          <p>Brain data unavailable for this organism.</p>
                        )}
                      </>
                    ) : null}
                  </div>
                </div>
              );
            })}
            </div>
          </>
        ) : (
          <section className="inspector-empty-state" aria-label="inspector empty state">
            {selectedOrganismUnavailable ? (
              <p role="status"><strong>Selected organism is no longer available.</strong></p>
            ) : null}
            <h3>No organism selected</h3>
            <p>Select an organism to view deterministic inspector details.</p>
            <ul>
              <li>Click any organism in the simulation world.</li>
              <li>Use Previous/Next organism controls (or ←/↑ and →/↓).</li>
              <li>If an organism dies and no fallback exists, this empty state remains until you select another.</li>
            </ul>
          </section>
        )}
      </section>
    </main>
  );
}

export default App;
