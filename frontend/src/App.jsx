import { useEffect, useMemo, useRef, useState } from 'react';
import packageJson from '../package.json';

import { createWorldState, stepWorld, detectSpecies, getSpeciesColor } from './simulation/engine';
import {
  DEFAULT_CONFIG,
  SIMULATION_PRESETS,
  applyPreset,
  createDeterministicRunBootstrap,
  getCustomPresets,
  getPresetById,
  loadSimulationConfig,
  normalizeSimulationConfig,
  resolveSeed,
  saveCustomPreset,
  saveSimulationConfig,
  toEngineStepParams,
  validateAndNormalizeLoadedSnapshot,
  validateSimulationConfig
} from './simulation/config';
import { createSeededPrng } from './simulation/prng';
import {
  applyBrainViewportZoom,
  BRAIN_GRAPH_VIEWBOX,
  createBrainViewportFitTransform,
  createBrainViewportFitSelectionTransform,
  deriveBrainVisualizerLegend,
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
import { deriveDeterministicOrganismIds } from './inspectorSelection';
import {
  deriveInspectorTrendSeries,
  reduceInspectorTrendState,
  formatTrendPolyline,
  INSPECTOR_TREND_WINDOW_TICKS
} from './inspectorTrend';
import { INSPECTOR_PLACEHOLDER, formatInspectorSnapshot } from './inspectorFormatting';
import {
  deriveSimulationStats,
  deriveStatsTrends,
  formatSimulationStats,
  formatTrendIndicator,
  reduceStatsTrendHistory
} from './simulation/stats';
import { deriveRunMetadata, serializeReproducibilityMetadata } from './simulation/metadata';
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
  HUD_VISIBILITY_PRESETS,
  loadHudVisibilityPreset,
  saveHudVisibilityPreset
} from './simulation/hudVisibilityPreset';
import {
  deleteSimulationSnapshot,
  getSimulationSnapshot,
  getStatus,
  listSimulationSnapshots,
  saveSimulationSnapshot,
  SnapshotNameConflictError
} from './simulation/api';
import { formatSimulationTimestamp } from './simulation/timestamp';
import { generateDeterministicCopyName } from './simulation/saveName';
import { resolveDeterministicQueryPrefill } from './simulation/shareLink';
import {
  DEFAULT_SAVED_SIMULATION_LIST_VIEW_STATE,
  deriveSavedSimulationListView,
  SAVED_SIMULATION_SORT_OPTIONS
} from './simulation/savedSimulationListView';
import { useToasts } from './toasts';
import { deriveInspectorTraitSections, INSPECTOR_TRAIT_SECTION_SCHEMA } from './inspectorTraitSchema';
import { deriveInspectorTraitDeltaModel } from './inspectorTraitDelta';
import { deriveInspectorGenomeMutationSummaryModel } from './inspectorGenomeMutationSummary';
import { deriveInspectorSynapseTableRows } from './inspectorSynapseTable';
import { deriveInspectorComparisonRows } from './inspectorComparison';
import { deriveNeuronDetailPanel } from './inspectorNeuronDetail';

const TICK_MS = 1000 / 30;
const SPEED_OPTIONS = [1, 2, 5, 10];
const REPLAY_SPEED_OPTIONS = [0.5, 1, 2, 5];
const SIMULATION_VERSION = 'snn-sandbox-v1';
const INSPECTOR_COMPACT_BREAKPOINT_PX = 980;
const INSPECTOR_TREND_STRIP_WIDTH = 280;
const INSPECTOR_TREND_STRIP_HEIGHT = 72;
const INSPECTOR_SECTION_ORDER = INSPECTOR_TRAIT_SECTION_SCHEMA.map((section) => section.key);
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
  'mutationStrength',
  'reproductionThreshold',
  'reproductionCost',
  'offspringStartEnergy',
  'reproductionMinimumAge',
  'reproductionRefractoryPeriod',
  'maximumOrganismAge'
];

function stableStringify(value) {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  }

  const keys = Object.keys(value).sort();
  const entries = keys.map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`);
  return `{${entries.join(',')}}`;
}

function hashStableValue(value) {
  const input = stableStringify(value);
  let hash = 2166136261;

  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }

  return (hash >>> 0).toString(16).padStart(8, '0');
}

function deriveRunLifecycleMetadata({ seed, tickCount, snapshotId, simulationVersion, simulationId, lastSavedAt, lastSavedStateHash }) {
  const normalizedTickCount = Number.isInteger(tickCount) && tickCount >= 0 ? tickCount : 0;
  const normalizedSnapshotId = typeof snapshotId === 'string' && snapshotId.length > 0 ? snapshotId : 'No snapshot';

  return {
    seed: typeof seed === 'string' ? seed : '',
    tickCount: normalizedTickCount,
    snapshotId: normalizedSnapshotId,
    simulationVersion: typeof simulationVersion === 'string' && simulationVersion.length > 0 ? simulationVersion : SIMULATION_VERSION,
    simulationId: typeof simulationId === 'string' && simulationId.length > 0 ? simulationId : normalizedSnapshotId,
    lastSavedTick: normalizedTickCount,
    lastSavedAt: typeof lastSavedAt === 'string' && lastSavedAt.length > 0 ? lastSavedAt : 'Not saved yet',
    lastSavedStateHash: typeof lastSavedStateHash === 'string' && lastSavedStateHash.length > 0 ? lastSavedStateHash : '00000000'
  };
}

function normalizeComparableSeed(seed) {
  return String(seed ?? '').trim();
}

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
    mutationStrength: String(config.mutationStrength ?? DEFAULT_CONFIG.mutationStrength),
    reproductionThreshold: String(config.reproductionThreshold ?? DEFAULT_CONFIG.reproductionThreshold),
    reproductionCost: String(config.reproductionCost ?? DEFAULT_CONFIG.reproductionCost),
    offspringStartEnergy: String(config.offspringStartEnergy ?? DEFAULT_CONFIG.offspringStartEnergy),
    reproductionMinimumAge: String(config.reproductionMinimumAge ?? DEFAULT_CONFIG.reproductionMinimumAge),
    reproductionRefractoryPeriod: String(config.reproductionRefractoryPeriod ?? DEFAULT_CONFIG.reproductionRefractoryPeriod),
    maximumOrganismAge: String(config.maximumOrganismAge ?? DEFAULT_CONFIG.maximumOrganismAge)
  };
}

function toFiniteNumberOrDefault(value, fallback) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}


function getControlDisableReasons({ hasSimulation, replayActive, paused, spectatorMode }) {
  const simulationRequiredReason = 'Start a simulation to enable this control.';
  const spectatorModeReason = 'Spectator mode is active. Changes cannot be saved.';

  return {
    regenerateSeed: hasSimulation ? '' : spectatorMode ? spectatorModeReason : simulationRequiredReason,
    restartFromSeed: hasSimulation ? '' : spectatorMode ? spectatorModeReason : simulationRequiredReason,
    pause: !hasSimulation ? simulationRequiredReason : replayActive ? 'Replay mode is active. Resume live simulation to pause playback.' : spectatorMode ? spectatorModeReason : '',
    resume: !hasSimulation ? simulationRequiredReason : replayActive ? 'Replay mode is active. Resume live simulation before using runtime playback controls.' : spectatorMode ? spectatorModeReason : '',
    speed: !hasSimulation ? simulationRequiredReason : replayActive ? 'Replay mode is active. Resume live simulation to change speed.' : spectatorMode ? spectatorModeReason : '',
    step: !hasSimulation
      ? simulationRequiredReason
      : replayActive
        ? 'Replay mode is active. Resume live simulation to step ticks.'
        : !paused
          ? 'Pause the simulation to step one tick at a time.'
          : spectatorMode
            ? spectatorModeReason
            : '',
    saveSnapshot: hasSimulation ? '' : spectatorMode ? spectatorModeReason : simulationRequiredReason
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
  const [runStartTick, setRunStartTick] = useState(0);
  const [resolvedSeed, setResolvedSeed] = useState('');
  const [appVersion, setAppVersion] = useState('unknown');
  const [selectedOrganismId, setSelectedOrganismId] = useState(null);
  const [hudOverlayVisible, setHudOverlayVisible] = useState(false);
  const [inspectorPinned, setInspectorPinned] = useState(false);
  const [isCompactInspectorLayout, setIsCompactInspectorLayout] = useState(false);
  const [pinnedOrganismSnapshot, setPinnedOrganismSnapshot] = useState(null);
  const [selectedOrganismUnavailable, setSelectedOrganismUnavailable] = useState(false);
  const [inspectorTrendState, setInspectorTrendState] = useState(() => ({ selectedOrganismId: null, samples: [] }));
  const [activeInspectorSectionIndex, setActiveInspectorSectionIndex] = useState(0);
  const [hoveredSynapseId, setHoveredSynapseId] = useState(null);
  const [selectedSynapseHighlight, setSelectedSynapseHighlight] = useState(null);
  const [brainGraphTransform, setBrainGraphTransform] = useState(() => ({ scale: 1, translateX: 0, translateY: 0 }));
  const [hideNearZeroBrainEdges, setHideNearZeroBrainEdges] = useState(false);
  const [strongestBrainEdgeCount, setStrongestBrainEdgeCount] = useState(0);
  const [brainFilterTypes, setBrainFilterTypes] = useState(() => ({ input: true, hidden: true, output: true }));
  const [brainMinActivationThreshold, setBrainMinActivationThreshold] = useState(0);
  const [pinnedBrainNeuronId, setPinnedBrainNeuronId] = useState(null);
  const [emphasizedOutputNeuronId, setEmphasizedOutputNeuronId] = useState(null);
  const [selectedBrainNeuronId, setSelectedBrainNeuronId] = useState(null);
  const [hoveredBrainNeuronId, setHoveredBrainNeuronId] = useState(null);
  const [brainFocusMode, setBrainFocusMode] = useState('full');
  const [errors, setErrors] = useState({});
  const [savedSimulations, setSavedSimulations] = useState([]);
  const [savedSimulationListViewState, setSavedSimulationListViewState] = useState(DEFAULT_SAVED_SIMULATION_LIST_VIEW_STATE);
  const [savedSimulationsError, setSavedSimulationsError] = useState('');
  const [saveStatus, setSaveStatus] = useState('');
  const [saveErrorDetail, setSaveErrorDetail] = useState('');
  const [saveAsDraftName, setSaveAsDraftName] = useState('');
  const [saveAsValidationError, setSaveAsValidationError] = useState('');
  const [saveConflictResolution, setSaveConflictResolution] = useState(null);
  const [loadStatus, setLoadStatus] = useState('');
  const [loadRecoveryBySnapshotId, setLoadRecoveryBySnapshotId] = useState({});
  const [loadingSnapshotById, setLoadingSnapshotById] = useState({});
  const [pendingDeleteSnapshot, setPendingDeleteSnapshot] = useState(null);
  const [deleteStatus, setDeleteStatus] = useState('');
  const [copyMetadataStatus, setCopyMetadataStatus] = useState('');
  const [seedControlStatus, setSeedControlStatus] = useState('');
  const [keyboardShortcutsModalOpen, setKeyboardShortcutsModalOpen] = useState(false);
  const [preferencesModalOpen, setPreferencesModalOpen] = useState(false);
  const [aboutModalOpen, setAboutModalOpen] = useState(false);
  const [activeLoadedMetadata, setActiveLoadedMetadata] = useState(null);
  const [persistedRunMetadata, setPersistedRunMetadata] = useState(null);
  const [replayTickInput, setReplayTickInput] = useState('');
  const [replayStatus, setReplayStatus] = useState('');
  const [replayWorldState, setReplayWorldState] = useState(null);
  const [replaySnapshotMetadata, setReplaySnapshotMetadata] = useState(null);
  const [replayPresetName, setReplayPresetName] = useState('');
  const [replayPresetStatus, setReplayPresetStatus] = useState('');
  const [replayPlaying, setReplayPlaying] = useState(false);
  const [replaySpeedMultiplier, setReplaySpeedMultiplier] = useState(1);
  const [replayComparisonPresets, setReplayComparisonPresets] = useState(() => loadReplayComparisonPresets());
  const [selectedMismatchEventKey, setSelectedMismatchEventKey] = useState(null);
  const [mismatchEventFilters, setMismatchEventFilters] = useState({ types: [], severities: [] });
  const [activeMismatchAnnouncement, setActiveMismatchAnnouncement] = useState('');
  const [schedulerClampState, setSchedulerClampState] = useState({ active: false, droppedTicks: 0 });
  const [statsTrendHistory, setStatsTrendHistory] = useState([]);
  const [hudVisibilityPreset, setHudVisibilityPreset] = useState(() => loadHudVisibilityPreset());
  const [activeViewport, setActiveViewport] = useState({
    width: DEFAULT_CONFIG.worldWidth,
    height: DEFAULT_CONFIG.worldHeight
  });
  const [initialQueryPrefill] = useState(() => {
    if (typeof window === 'undefined') {
      return { prefill: null, warningMessage: '' };
    }

    return resolveDeterministicQueryPrefill(window.location.search);
  });

  const [initialFormState] = useState(() => {
    const saved = loadSimulationConfig();
    const baseFormState = createFormStateFromConfig(saved ?? DEFAULT_CONFIG);

    if (!initialQueryPrefill.prefill) {
      return baseFormState;
    }

    return {
      ...baseFormState,
      ...initialQueryPrefill.prefill
    };
  });
  const [formState, setFormState] = useState(initialFormState);
  const [formBaselineState, setFormBaselineState] = useState(initialFormState);
  const [selectedPresetId, setSelectedPresetId] = useState('');
  const [customPresets, setCustomPresets] = useState([]);
  const [showSavePresetInput, setShowSavePresetInput] = useState(false);
  const [newPresetName, setNewPresetName] = useState('');
  const [spectatorMode, setSpectatorMode] = useState(false);

  // Load custom presets from localStorage on mount
  useEffect(() => {
    const loaded = getCustomPresets();
    setCustomPresets(loaded);
  }, []);

  const [sideNavDrawerOpen, setSideNavDrawerOpen] = useState(false);
  const [shareStatus, setShareStatus] = useState('');
  const [queryPrefillStatus, setQueryPrefillStatus] = useState(initialQueryPrefill.warningMessage);

  const worldRef = useRef(null);
  const pausedRef = useRef(paused);
  const speedMultiplierRef = useRef(speedMultiplier);
  const canvasRef = useRef(null);
  const canvasScaleRef = useRef(1); // devicePixelRatio for canvas
  const keyboardShortcutsTriggerRef = useRef(null);
  const keyboardShortcutsCloseButtonRef = useRef(null);
  const deleteConfirmButtonRef = useRef(null);
  const replayInteractionRegionRef = useRef(null);
  const rngRef = useRef(null);
  const stepParamsRef = useRef(null);
  const schedulerCarryMsRef = useRef(0);
  const schedulerLastFrameTimeRef = useRef(null);
  const lastPersistedTickRef = useRef(0);
  const activeConfigRef = useRef(null);
  const viewportRef = useRef({ width: DEFAULT_CONFIG.worldWidth, height: DEFAULT_CONFIG.worldHeight });
  const replayContextRef = useRef(null);
  const previousSpeciesMapRef = useRef(null);
  const { toasts, enqueueToast, dismissToast } = useToasts();
  const toastsEnabled = process.env.NODE_ENV !== 'test';

  const displayWorld = replayWorldState ?? worldRef.current;
  const replayActive = Boolean(replayContextRef.current);
  const dirtyFormFields = useMemo(
    () => FORM_FIELDS.filter((field) => formState[field] !== formBaselineState[field]),
    [formBaselineState, formState]
  );
  const hasUnsavedFormChanges = dirtyFormFields.length > 0;
  const urlSeed = useMemo(() => normalizeComparableSeed(initialQueryPrefill.prefill?.seed), [initialQueryPrefill.prefill?.seed]);
  const normalizedActiveSeed = useMemo(() => normalizeComparableSeed(resolvedSeed), [resolvedSeed]);
  const hasUrlSeedMismatch = Boolean(urlSeed && normalizedActiveSeed && urlSeed !== normalizedActiveSeed);

  const getViewportDimensions = () => ({
    width: activeViewport.width || viewportRef.current.width || DEFAULT_CONFIG.worldWidth,
    height: activeViewport.height || viewportRef.current.height || DEFAULT_CONFIG.worldHeight
  });

  const syncCanvasViewport = (canvas, ctx) => {
    const dpr = window.devicePixelRatio || 1;
    const { width: logicalWidth, height: logicalHeight } = getViewportDimensions();

    viewportRef.current = {
      width: logicalWidth,
      height: logicalHeight
    };
    canvasScaleRef.current = dpr;
    canvas.width = logicalWidth * dpr;
    canvas.height = logicalHeight * dpr;

    if (ctx.setTransform) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
    }
    if (ctx.scale) {
      ctx.scale(dpr, dpr);
    }

    canvas.setAttribute('width', String(logicalWidth * dpr));
    canvas.setAttribute('height', String(logicalHeight * dpr));
  };

  const redrawCanvasSnapshot = (ctx) => {
    if (
      typeof ctx?.clearRect !== 'function'
      || typeof ctx?.fillRect !== 'function'
      || typeof ctx?.beginPath !== 'function'
      || typeof ctx?.arc !== 'function'
      || typeof ctx?.fill !== 'function'
      || typeof ctx?.moveTo !== 'function'
      || typeof ctx?.lineTo !== 'function'
      || typeof ctx?.stroke !== 'function'
    ) {
      return;
    }

    const worldToDraw = replayWorldState ?? worldRef.current;
    if (!worldToDraw) {
      return;
    }

    drawWorldSnapshot(ctx, worldToDraw, viewportRef.current, {
      selectedOrganismId
    });
  };

  const currentRunLifecycleMetadata = useMemo(
    () => deriveRunLifecycleMetadata({
      seed: resolvedSeed,
      tickCount: tickDisplay,
      snapshotId: activeLoadedMetadata?.id,
      simulationVersion: SIMULATION_VERSION,
      simulationId: activeLoadedMetadata?.id ?? persistedRunMetadata?.simulationId ?? 'No snapshot',
      lastSavedAt: persistedRunMetadata?.lastSavedAt,
      lastSavedStateHash: persistedRunMetadata?.lastSavedStateHash
    }),
    [resolvedSeed, tickDisplay, activeLoadedMetadata?.id, persistedRunMetadata?.simulationId, persistedRunMetadata?.lastSavedAt, persistedRunMetadata?.lastSavedStateHash]
  );
  const hasUnsavedRunChanges = useMemo(() => {
    if (!persistedRunMetadata || !resolvedSeed) {
      return false;
    }

    const simulationId = persistedRunMetadata.simulationId;
    const lastSavedTick = persistedRunMetadata.lastSavedTick;
    const lastSavedStateHash = persistedRunMetadata.lastSavedStateHash;
    const dirtySignature = hashStableValue({ simulationId, currentTick: currentRunLifecycleMetadata.tickCount, lastSavedTick, lastSavedStateHash });
    const cleanSignature = hashStableValue({ simulationId, currentTick: lastSavedTick, lastSavedTick, lastSavedStateHash });
    return dirtySignature !== cleanSignature;
  }, [persistedRunMetadata, resolvedSeed, currentRunLifecycleMetadata.tickCount]);
  const runSaveStatusLabel = hasUnsavedRunChanges ? 'Unsaved' : 'Saved';

  useEffect(() => {
    [
      seedControlStatus,
      saveStatus,
      loadStatus,
      deleteStatus,
      copyMetadataStatus,
      replayStatus,
      replayPresetStatus,
      shareStatus
    ].forEach((message) => publishControlToast(message));
  }, [
    seedControlStatus,
    saveStatus,
    loadStatus,
    deleteStatus,
    copyMetadataStatus,
    replayStatus,
    replayPresetStatus,
    shareStatus
  ]);

  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

  useEffect(() => {
    getStatus()
      .then((status) => {
        setAppVersion(status.version || packageJson.version);
      })
      .catch(() => {
        setAppVersion(packageJson.version);
      });
  }, []);

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

    syncCanvasViewport(canvas, ctx);
    redrawCanvasSnapshot(ctx);

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
  }, [replayWorldState, selectedOrganismId, activeViewport.width, activeViewport.height]);

  // Handle canvas DPI scaling when viewport changes
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return;
    }

    syncCanvasViewport(canvas, ctx);
    redrawCanvasSnapshot(ctx);
  }, [activeViewport.width, activeViewport.height, replayWorldState, selectedOrganismId]);

  useEffect(() => {
    if (replayWorldState) {
      return;
    }

    setTickDisplay((currentTick) => (worldRef.current ? worldRef.current.tick : currentTick));
  }, [speedMultiplier, replayWorldState]);

  useEffect(() => {
    listSimulationSnapshots()
      .then((items) => {
        setSavedSimulations(items);
        setSavedSimulationsError('');
      })
      .catch(() => {
        setSavedSimulations([]);
        setSavedSimulationsError('Unable to load saved simulations. Retry from a fresh page load.');
      });
  }, []);

  // Check URL for spectator mode and auto-load snapshot
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const snapshotIdParam = params.get('snapshot');
    const spectatorParam = params.get('spectator');

    if (snapshotIdParam) {
      setSpectatorMode(spectatorParam === 'true');

      // Find and load the snapshot
      const snapshot = savedSimulations.find((s) => s.id === snapshotIdParam);
      if (snapshot) {
        // Auto-select and load the snapshot
        setSavedSimulationListViewState((previous) => ({
          ...previous,
          selectedSnapshotId: snapshotIdParam
        }));
        // Load the simulation
        getSimulationSnapshot(snapshotIdParam)
          .then((snapshotData) => {
            const validated = validateAndNormalizeLoadedSnapshot(snapshotData);
            const config = createFormStateFromConfig(validated);
            setFormState(config);
            setFormBaselineState(config);
            setActiveLoadedMetadata(validated);
            setResolvedSeed(validated.seed);
            applySimulationConfig(validated, { paused: true });
          })
          .catch(() => {
            setLoadStatus('Failed to load shared simulation.');
          });
      }
    }
  }, [savedSimulations]);

  const savedSimulationListView = useMemo(
    () => deriveSavedSimulationListView(savedSimulations, savedSimulationListViewState),
    [savedSimulations, savedSimulationListViewState]
  );

  useEffect(() => {
    setSavedSimulationListViewState((previous) => {
      const nextSelectedSnapshotId = savedSimulationListView.selectedSnapshotId;
      if (previous.selectedSnapshotId === nextSelectedSnapshotId) {
        return previous;
      }

      return {
        ...previous,
        selectedSnapshotId: nextSelectedSnapshotId
      };
    });
  }, [savedSimulationListView.selectedSnapshotId]);

  const selectedOrganism = useMemo(() => {
    if (!selectedOrganismId || !displayWorld) {
      return null;
    }

    return displayWorld.organisms.find((organism) => organism.id === selectedOrganismId) ?? null;
  }, [displayWorld, selectedOrganismId, tickDisplay]);

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
      return;
    }

    if (selectedOrganism) {
      if (selectedOrganismUnavailable) {
        setSelectedOrganismUnavailable(false);
      }
      return;
    }

    setSelectedOrganismId(null);
    setInspectorPinned(false);
    setPinnedOrganismSnapshot(null);
    setSelectedOrganismUnavailable(true);
  }, [selectedOrganismId, selectedOrganism, selectedOrganismUnavailable]);

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

  const onToggleSideNavDrawer = () => {
    setSideNavDrawerOpen((previous) => !previous);
  };

  const onCloseSideNavDrawer = () => {
    setSideNavDrawerOpen(false);
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

  const onResetBrainGraphViewport = () => {
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

  const onFitSelectionBrainGraphViewport = () => {
    if (!brainGraphModel) {
      return;
    }

    setBrainGraphTransform(
      createBrainViewportFitSelectionTransform(brainGraphModel, {
        width: BRAIN_GRAPH_VIEWBOX.width,
        height: BRAIN_GRAPH_VIEWBOX.height,
        selectedNeuronId: selectedBrainNeuronId,
        selectedSynapseId: selectedSynapseHighlightId
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

  const selectSynapseHighlight = (synapseId, neuronId) => {
    if (!inspectorOrganism?.id || !synapseId || !neuronId) {
      return;
    }

    setSelectedSynapseHighlight({
      organismId: inspectorOrganism.id,
      neuronId,
      synapseId
    });
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
  const inspectorSummaryParentId = formattedInspector.parentId === INSPECTOR_PLACEHOLDER
    ? 'none'
    : formattedInspector.parentId;
  const inspectorTraitSections = useMemo(
    () => deriveInspectorTraitSections(formattedInspector),
    [formattedInspector]
  );
  const inspectorTraitDeltaModel = useMemo(
    () => deriveInspectorTraitDeltaModel(inspectorOrganism, displayWorld?.organisms),
    [inspectorOrganism, displayWorld?.organisms]
  );
  const inspectorGenomeMutationSummaryModel = useMemo(
    () => deriveInspectorGenomeMutationSummaryModel(inspectorOrganism, displayWorld?.organisms),
    [inspectorOrganism, displayWorld?.organisms]
  );
  const inspectorSynapseTableRows = useMemo(
    () => deriveInspectorSynapseTableRows(inspectorOrganism),
    [inspectorOrganism]
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

  const activeBrainNeuronDetailNeuronId = pinnedBrainNeuronId ?? hoveredBrainNeuronId ?? selectedBrainNeuronId;

  const selectedSynapseHighlightId = useMemo(() => {
    if (!selectedSynapseHighlight || !brainGraphModel || !inspectorOrganism?.id || !activeBrainNeuronDetailNeuronId) {
      return null;
    }

    if (
      selectedSynapseHighlight.organismId !== inspectorOrganism.id
      || selectedSynapseHighlight.neuronId !== activeBrainNeuronDetailNeuronId
    ) {
      return null;
    }

    return brainGraphModel.edges.some((edge) => edge.id === selectedSynapseHighlight.synapseId)
      ? selectedSynapseHighlight.synapseId
      : null;
  }, [selectedSynapseHighlight, brainGraphModel, inspectorOrganism?.id, activeBrainNeuronDetailNeuronId]);

  const activeSynapseId = hoveredSynapseId ?? selectedSynapseHighlightId;

  const activeSynapse = useMemo(() => {
    if (!brainGraphModel || !activeSynapseId) {
      return null;
    }
    return brainGraphModel.edges.find((edge) => edge.id === activeSynapseId) ?? null;
  }, [activeSynapseId, brainGraphModel]);
  const activeBrainNeuronDetail = useMemo(() => deriveNeuronDetailPanel(
    baseBrainGraphModel,
    inspectorOrganism?.brain,
    activeBrainNeuronDetailNeuronId
  ), [baseBrainGraphModel, inspectorOrganism?.brain, activeBrainNeuronDetailNeuronId]);

  const brainGraphLayoutChecksum = useMemo(() => mapBrainLayoutChecksum(baseBrainGraphModel), [baseBrainGraphModel]);
  const brainGraphEmphasisChecksum = useMemo(
    () => mapBrainEmphasisChecksum(baseBrainGraphModel, {
      hideNearZeroWeights: hideNearZeroBrainEdges,
      nearZeroThreshold: 0.1,
      strongestEdgeCount: strongestBrainEdgeCount
    }),
    [baseBrainGraphModel, hideNearZeroBrainEdges, strongestBrainEdgeCount]
  );

  const brainGraphLegend = useMemo(() => deriveBrainVisualizerLegend(baseBrainGraphModel), [baseBrainGraphModel]);

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
    setHoveredBrainNeuronId(null);
    setHoveredSynapseId(null);
    setSelectedSynapseHighlight(null);
    setBrainFocusMode('full');
  }, [inspectorOrganism?.id]);

  useEffect(() => {
    if (!brainGraphModel || !hoveredSynapseId) {
      setHoveredSynapseId(null);
      return;
    }

    if (!brainGraphModel.edges.some((edge) => edge.id === hoveredSynapseId)) {
      setHoveredSynapseId(null);
    }
  }, [hoveredSynapseId, brainGraphModel]);

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

  useEffect(() => {
    if (!selectedSynapseHighlightId && selectedSynapseHighlight) {
      setSelectedSynapseHighlight(null);
    }
  }, [selectedSynapseHighlightId, selectedSynapseHighlight]);

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
    if (queryPrefillStatus) {
      setQueryPrefillStatus('');
    }
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

  const confirmDiscardUnsavedRunChanges = () => {
    if (!hasUnsavedRunChanges) {
      return true;
    }

    return window.confirm('You have unsaved simulation changes for this run. Discard changes and continue?');
  };

  const onResetConfigToDefaults = () => {
    setFormState(createFormStateFromConfig(DEFAULT_CONFIG));
    setSelectedPresetId('');
    setErrors({});
  };

  const onPresetChange = (event) => {
    const presetId = event.target.value;
    setSelectedPresetId(presetId);

    if (!presetId) {
      return;
    }

    // Check built-in presets first
    let preset = getPresetById(presetId);
    
    // If not found, check custom presets
    if (!preset) {
      preset = customPresets.find(p => p.id === presetId);
    }

    if (!preset) {
      return;
    }

    // Apply preset values to form state, preserving name and seed
    const newFormState = {
      ...formState,
      name: formState.name || DEFAULT_CONFIG.name,
      seed: '',
      worldWidth: String(preset.config.worldWidth),
      worldHeight: String(preset.config.worldHeight),
      initialPopulation: String(preset.config.initialPopulation),
      minimumPopulation: String(preset.config.minimumPopulation),
      initialFoodCount: String(preset.config.initialFoodCount),
      foodSpawnChance: String(preset.config.foodSpawnChance),
      foodEnergyValue: String(preset.config.foodEnergyValue),
      maxFood: String(preset.config.maxFood),
      mutationRate: String(preset.config.mutationRate),
      mutationStrength: String(preset.config.mutationStrength),
      reproductionThreshold: String(preset.config.reproductionThreshold ?? DEFAULT_CONFIG.reproductionThreshold),
      reproductionCost: String(preset.config.reproductionCost ?? DEFAULT_CONFIG.reproductionCost),
      offspringStartEnergy: String(preset.config.offspringStartEnergy ?? DEFAULT_CONFIG.offspringStartEnergy),
      reproductionMinimumAge: String(preset.config.reproductionMinimumAge ?? DEFAULT_CONFIG.reproductionMinimumAge),
      reproductionRefractoryPeriod: String(preset.config.reproductionRefractoryPeriod ?? DEFAULT_CONFIG.reproductionRefractoryPeriod),
      maximumOrganismAge: String(preset.config.maximumOrganismAge ?? DEFAULT_CONFIG.maximumOrganismAge)
    };

    setFormState(newFormState);
    setErrors({});
  };

  const onSavePreset = () => {
    if (!newPresetName.trim()) {
      return;
    }

    const currentConfig = {
      worldWidth: toFiniteNumberOrDefault(formState.worldWidth, DEFAULT_CONFIG.worldWidth),
      worldHeight: toFiniteNumberOrDefault(formState.worldHeight, DEFAULT_CONFIG.worldHeight),
      initialPopulation: toFiniteNumberOrDefault(formState.initialPopulation, DEFAULT_CONFIG.initialPopulation),
      minimumPopulation: toFiniteNumberOrDefault(formState.minimumPopulation, DEFAULT_CONFIG.minimumPopulation),
      initialFoodCount: toFiniteNumberOrDefault(formState.initialFoodCount, DEFAULT_CONFIG.initialFoodCount),
      foodSpawnChance: toFiniteNumberOrDefault(formState.foodSpawnChance, DEFAULT_CONFIG.foodSpawnChance),
      foodEnergyValue: toFiniteNumberOrDefault(formState.foodEnergyValue, DEFAULT_CONFIG.foodEnergyValue),
      maxFood: toFiniteNumberOrDefault(formState.maxFood, DEFAULT_CONFIG.maxFood),
      mutationRate: toFiniteNumberOrDefault(formState.mutationRate, DEFAULT_CONFIG.mutationRate),
      mutationStrength: toFiniteNumberOrDefault(formState.mutationStrength, DEFAULT_CONFIG.mutationStrength),
      reproductionThreshold: toFiniteNumberOrDefault(formState.reproductionThreshold, DEFAULT_CONFIG.reproductionThreshold),
      reproductionCost: toFiniteNumberOrDefault(formState.reproductionCost, DEFAULT_CONFIG.reproductionCost),
      offspringStartEnergy: toFiniteNumberOrDefault(formState.offspringStartEnergy, DEFAULT_CONFIG.offspringStartEnergy),
      reproductionMinimumAge: toFiniteNumberOrDefault(formState.reproductionMinimumAge, DEFAULT_CONFIG.reproductionMinimumAge),
      reproductionRefractoryPeriod: toFiniteNumberOrDefault(formState.reproductionRefractoryPeriod, DEFAULT_CONFIG.reproductionRefractoryPeriod),
      maximumOrganismAge: toFiniteNumberOrDefault(formState.maximumOrganismAge, DEFAULT_CONFIG.maximumOrganismAge)
    };

    const success = saveCustomPreset(newPresetName, currentConfig);
    if (success) {
      const updatedPresets = getCustomPresets();
      setCustomPresets(updatedPresets);
      setNewPresetName('');
      setShowSavePresetInput(false);
    }
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

  const applyLoadedSimulation = (snapshot) => {
    // Use deterministic validation with fallback rules
    const validation = validateAndNormalizeLoadedSnapshot(snapshot);
    
    // If there are critical errors, show warning but still apply with fallbacks
    if (validation.errors.length > 0) {
      for (const err of validation.errors) {
        enqueueToast(`Load warning: ${err}`, 'warning');
      }
    }
    
    // Show warnings as toasts for visibility
    for (const warning of validation.warnings) {
      enqueueToast(`Load: ${warning}`, 'info');
    }

    const { config: loadedConfig, world: loadedWorld, rngState: loadedRngState, tickCount } = validation;
    const loadedRng = createSeededPrng(loadedConfig.resolvedSeed, loadedRngState);

    worldRef.current = loadedWorld;
    rngRef.current = loadedRng;
    stepParamsRef.current = toEngineStepParams(loadedConfig);
    activeConfigRef.current = loadedConfig;
    viewportRef.current = {
      width: loadedConfig.worldWidth,
      height: loadedConfig.worldHeight
    };
    setActiveViewport({
      width: loadedConfig.worldWidth,
      height: loadedConfig.worldHeight
    });
    lastPersistedTickRef.current = loadedWorld.tick;

    saveSimulationConfig(loadedConfig);
    const loadedFormState = createFormStateFromConfig(loadedConfig);
    setFormState(loadedFormState);
    setFormBaselineState(loadedFormState);

    replayContextRef.current = {
      baseWorldState: createWorldState(loadedWorld),
      baseRngState: loadedRngState,
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
    setRunStartTick(loadedWorld.tick);
    setSpeedMultiplier(1);
    setPaused(true);
    setPersistedRunMetadata(deriveRunLifecycleMetadata({
      seed: loadedConfig.resolvedSeed,
      tickCount: loadedWorld.tick,
      snapshotId: snapshot.id,
      simulationVersion: snapshot.simulationVersion ?? SIMULATION_VERSION,
      simulationId: snapshot.id,
      lastSavedAt: snapshot.updatedAt,
      lastSavedStateHash: hashStableValue(snapshot.worldState ?? null)
    }));
  };

  const applySimulationConfig = (config, { paused: pausedNext = false } = {}) => {
    const { initialWorld, rng, stepParams } = createDeterministicRunBootstrap(config);
    worldRef.current = initialWorld;
    rngRef.current = rng;
    stepParamsRef.current = stepParams;
    activeConfigRef.current = config;
    viewportRef.current = {
      width: config.worldWidth,
      height: config.worldHeight
    };
    setActiveViewport({
      width: config.worldWidth,
      height: config.worldHeight
    });
    lastPersistedTickRef.current = 0;

    setSelectedOrganismId(null);
    setSelectedOrganismUnavailable(false);
    setInspectorPinned(false);
    setPinnedOrganismSnapshot(null);
    setResolvedSeed(config.resolvedSeed);
    setTickDisplay(0);
    setRunStartTick(0);
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
    setPersistedRunMetadata(deriveRunLifecycleMetadata({
      seed: config.resolvedSeed,
      tickCount: 0,
      snapshotId: null,
      simulationVersion: SIMULATION_VERSION,
      simulationId: config.name,
      lastSavedStateHash: hashStableValue(initialWorld)
    }));
    setLoadStatus('');
    setCopyMetadataStatus('');
    saveSimulationConfig(config);
    setFormState(() => {
      const next = createFormStateFromConfig({
        ...config,
        seed: config.seed || config.resolvedSeed
      });
      setFormBaselineState(next);
      return next;
    });
  };

  const startSimulationFromFormState = (nextFormState, { resetPresetSelection = false } = {}) => {
    const nextErrors = validateSimulationConfig(nextFormState);
    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return;
    }

    const seedToUse = resolveSeed(nextFormState.seed);
    const config = normalizeSimulationConfig(nextFormState, seedToUse);
    applySimulationConfig(config, { paused: false });
    if (resetPresetSelection) {
      setSelectedPresetId('');
    }
    setErrors({});
    setSeedControlStatus('');
  };

  const startSimulation = () => {
    if (hasSimulation && !confirmDiscardUnsavedRunChanges()) {
      setSeedControlStatus('Start cancelled.');
      return;
    }

    startSimulationFromFormState(formState);
  };

  const onQuickStartSimulation = () => {
    if (hasSimulation && !confirmDiscardUnsavedRunChanges()) {
      setSeedControlStatus('Quick start cancelled.');
      return;
    }

    if (hasUnsavedFormChanges && !confirmDiscardUnsavedFormChanges()) {
      setSeedControlStatus('Quick start cancelled.');
      return;
    }

    const defaultFormState = createFormStateFromConfig(DEFAULT_CONFIG);
    startSimulationFromFormState(defaultFormState, {
      resetPresetSelection: true
    });
  };

  const onShareSimulation = async () => {
    if (!activeLoadedMetadata?.id) {
      setShareStatus('Save the simulation first to share it.');
      return;
    }

    const writeText = globalThis?.navigator?.clipboard?.writeText;
    if (typeof writeText !== 'function') {
      setShareStatus('Clipboard is unavailable.');
      return;
    }

    try {
      const shareUrl = `${window.location.origin}${window.location.pathname}?snapshot=${encodeURIComponent(activeLoadedMetadata.id)}&spectator=true`;
      await writeText(shareUrl);
      setShareStatus('Share URL copied to clipboard!');
    } catch {
      setShareStatus('Failed to copy share URL.');
    }
  };

  const onRestartRun = () => {
    if (!activeConfigRef.current) {
      return;
    }

    const hasUnsavedProgress = (worldRef.current?.tick ?? 0) > lastPersistedTickRef.current;
    if (hasUnsavedProgress) {
      const confirmed = window.confirm(
        'You have unsaved simulation progress. Restarting now will reset to tick 0 and keep the current seed. Continue?'
      );
      if (!confirmed) {
        setSeedControlStatus('New run cancelled.');
        return;
      }
    }

    const config = normalizeSimulationConfig(activeConfigRef.current, activeConfigRef.current.resolvedSeed);
    applySimulationConfig(config, { paused: false });
    setSeedControlStatus('Started a new run with the same seed.');
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

  const onUseUrlSeed = () => {
    if (!urlSeed) {
      return;
    }

    if (hasSimulation && !confirmDiscardUnsavedRunChanges()) {
      setSeedControlStatus('Use URL seed cancelled.');
      return;
    }

    const nextErrors = validateSimulationConfig(formState);
    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return;
    }

    const config = normalizeSimulationConfig({ ...formState, seed: urlSeed }, urlSeed);
    applySimulationConfig(config, { paused: false });
    setSeedControlStatus('Started a new run with the URL seed.');
  };

  const hasSimulation = useMemo(() => Boolean(worldRef.current && rngRef.current), [tickDisplay, resolvedSeed]);

  const controlDisableReasons = useMemo(
    () => getControlDisableReasons({ hasSimulation, replayActive, paused, spectatorMode }),
    [hasSimulation, replayActive, paused, spectatorMode]
  );

  const derivedStats = useMemo(() => deriveSimulationStats(displayWorld), [displayWorld, tickDisplay, resolvedSeed]);

  // Compute species map for visual species identification (SSN-219)
  // Pass previous species assignments to maintain stable colors as organisms die
  const speciesMap = useMemo(() => {
    if (!displayWorld?.organisms) return null;
    return detectSpecies(displayWorld.organisms, 0.5, previousSpeciesMapRef.current);
  }, [displayWorld]);

  // Update the ref with the new species map for the next render
  useEffect(() => {
    if (speciesMap) {
      previousSpeciesMapRef.current = speciesMap;
    }
  }, [speciesMap]);

  // Get species info for selected organism (SSN-219)
  const selectedOrganismSpeciesId = useMemo(() => {
    if (!selectedOrganism || !speciesMap) return null;
    return speciesMap.get(selectedOrganism.id);
  }, [selectedOrganism, speciesMap]);

  // Get unique species for legend (SSN-219)
  const speciesLegend = useMemo(() => {
    if (!speciesMap) return [];
    const uniqueSpecies = [...new Set(speciesMap.values())];
    return uniqueSpecies.map(id => ({ id, color: getSpeciesColor(id) }));
  }, [speciesMap]);

  // Get unique hazard types for legend (SSN-237)
  const hazardLegend = useMemo(() => {
    if (!displayWorld || !displayWorld.dangerZones) return [];
    const typeMap = new Map();
    for (const zone of displayWorld.dangerZones) {
      if (!typeMap.has(zone.type)) {
        const colors = {
          lava: '#ef4444',
          acid: '#22c55e',
          radiation: '#eab308'
        };
        typeMap.set(zone.type, { type: zone.type, color: colors[zone.type] || '#ef4444' });
      }
    }
    return Array.from(typeMap.values());
  }, [displayWorld]);

  const formattedStats = useMemo(() => formatSimulationStats(derivedStats), [derivedStats]);

  useEffect(() => {
    setStatsTrendHistory((previous) => reduceStatsTrendHistory(previous, derivedStats));
  }, [derivedStats]);

  const statsTrends = useMemo(
    () => deriveStatsTrends(statsTrendHistory, derivedStats.tickCount),
    [statsTrendHistory, derivedStats.tickCount]
  );

  useEffect(() => {
    saveHudVisibilityPreset(hudVisibilityPreset);
  }, [hudVisibilityPreset]);

  const runMetadata = useMemo(
    () => deriveRunMetadata({
      resolvedSeed,
      tickCount: tickDisplay,
      speedMultiplier,
      snapshotId: activeLoadedMetadata?.id
    }),
    [resolvedSeed, tickDisplay, speedMultiplier, activeLoadedMetadata?.id]
  );

  const simulationParametersFingerprint = useMemo(
    () => deriveSimulationParametersSignature(activeConfigRef.current) ?? '{}',
    [tickDisplay, resolvedSeed]
  );

  const simulationParametersFingerprintHash = useMemo(
    () => hashStableValue(simulationParametersFingerprint),
    [simulationParametersFingerprint]
  );

  const runElapsedTicks = useMemo(
    () => Math.max(0, runMetadata.tickCount - runStartTick),
    [runMetadata.tickCount, runStartTick]
  );

  const reproducibilityPayload = useMemo(
    () => serializeReproducibilityMetadata({
      seed: runMetadata.seed,
      configFingerprint: simulationParametersFingerprint,
      configFingerprintHash: simulationParametersFingerprintHash
    }),
    [runMetadata.seed, simulationParametersFingerprint, simulationParametersFingerprintHash]
  );

  const hudSeedLabel = runMetadata.seed.trim() || 'Seed unavailable';
  const isDetailedHudVisible = hudVisibilityPreset === HUD_VISIBILITY_PRESETS.DETAILED;

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

  const onResume = () => {
    if (acknowledgeUnavailableSelection()) {
      return;
    }

    if (!worldRef.current || !rngRef.current || replayContextRef.current) {
      return;
    }

    setPaused(false);
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
        return;
      }

      if (event.key === 'Escape' && hudOverlayVisible) {
        event.preventDefault();
        setHudOverlayVisible(false);
        clearSelection();
        return;
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    keyboardShortcutsModalOpen,
    pendingDeleteSnapshot,
    inspectorOrganism,
    activeInspectorSectionIndex,
    hudOverlayVisible,
    onAdjustSpeedByStep,
    onSelectNextOrganism,
    onSelectPreviousOrganism,
    onStepTick,
    onToggleInspectorPin,
    onTogglePausePlay,
    onSpeedSelect,
    clearSelection
  ]);

  const onCanvasClick = (event) => {
    if (!canvasRef.current || !displayWorld) {
      return;
    }

    if (acknowledgeUnavailableSelection()) {
      return;
    }

    const rect = canvasRef.current.getBoundingClientRect();
    // canvas.width is scaled by devicePixelRatio, so we divide by it to get logical coordinates
    const dpr = canvasScaleRef.current;
    const scaleX = (canvasRef.current.width / rect.width) / dpr;
    const scaleY = (canvasRef.current.height / rect.height) / dpr;
    const x = (event.clientX - rect.left) * scaleX;
    const y = (event.clientY - rect.top) * scaleY;

    const selected = pickOrganismAtPoint(displayWorld.organisms, x, y);
    if (!selected) {
      if (!inspectorPinned) {
        clearSelection();
        setHudOverlayVisible(false);
      }
      return;
    }

    setSelectedOrganismId(selected.id);
    setSelectedOrganismUnavailable(false);
    setHudOverlayVisible(true);
  };

  // Touch handler for mobile - tap to select organism
  const touchStartRef = useRef(null);

  const onCanvasTouchStart = (event) => {
    if (event.touches.length === 1) {
      const touch = event.touches[0];
      touchStartRef.current = {
        x: touch.clientX,
        y: touch.clientY,
        time: Date.now()
      };
    }
  };

  const onCanvasTouchEnd = (event) => {
    if (!canvasRef.current || !displayWorld) {
      return;
    }

    const touch = touchStartRef.current;
    if (!touch) {
      return;
    }

    // Check if it was a tap (not a drag) - minimal movement and quick
    const rect = canvasRef.current.getBoundingClientRect();
    const dpr = canvasScaleRef.current;
    const scaleX = (canvasRef.current.width / rect.width) / dpr;
    const scaleY = (canvasRef.current.height / rect.height) / dpr;
    const x = (touch.x - rect.left) * scaleX;
    const y = (touch.y - rect.top) * scaleY;

    const selected = pickOrganismAtPoint(displayWorld.organisms, x, y);
    if (!selected) {
      if (!inspectorPinned) {
        clearSelection();
        setHudOverlayVisible(false);
      }
      touchStartRef.current = null;
      return;
    }

    setSelectedOrganismId(selected.id);
    setSelectedOrganismUnavailable(false);
    setHudOverlayVisible(true);
    touchStartRef.current = null;
  };

  const onSaveSimulation = async (options = {}) => {
    const {
      forceOverwrite = false,
      overwriteSnapshotId = null,
      saveName = activeConfigRef.current?.name ?? '',
      activateSavedSnapshot = false
    } = options;

    if (!worldRef.current || !activeConfigRef.current) {
      return null;
    }

    setSaveErrorDetail('');
    setSaveStatus('Saving…');

    try {
      const savedSnapshot = await saveSimulationSnapshot({
        name: saveName,
        seed: activeConfigRef.current.resolvedSeed,
        parameters: activeConfigRef.current,
        tickCount: worldRef.current.tick,
        worldState: worldRef.current,
        rngState: rngRef.current?.getState?.() ?? null,
        overwriteExisting: forceOverwrite,
        overwriteSnapshotId
      });
      const activeSnapshotId = activateSavedSnapshot ? savedSnapshot.id : activeLoadedMetadata?.id;
      const activeSnapshotName = activateSavedSnapshot ? saveName : (activeLoadedMetadata?.name ?? saveName);
      const activeSnapshotUpdatedAt = activateSavedSnapshot
        ? (savedSnapshot.updatedAt ?? persistedRunMetadata?.lastSavedAt ?? 'Not saved yet')
        : (activeLoadedMetadata?.updatedAt ?? savedSnapshot.updatedAt ?? persistedRunMetadata?.lastSavedAt ?? 'Not saved yet');

      if (activateSavedSnapshot) {
        setActiveLoadedMetadata({
          id: savedSnapshot.id,
          name: activeSnapshotName,
          updatedAt: activeSnapshotUpdatedAt
        });
      }

      lastPersistedTickRef.current = worldRef.current.tick;
      setPersistedRunMetadata(deriveRunLifecycleMetadata({
        seed: resolvedSeed,
        tickCount: worldRef.current.tick,
        snapshotId: activeSnapshotId,
        simulationVersion: SIMULATION_VERSION,
        simulationId: activeSnapshotId ?? activeSnapshotName,
        lastSavedAt: activeSnapshotUpdatedAt,
        lastSavedStateHash: hashStableValue(worldRef.current)
      }));

      const items = await listSimulationSnapshots();
      setSavedSimulations(items);
      setSavedSimulationsError('');
      setSaveConflictResolution(null);
      setSaveStatus('Saved.');
      return savedSnapshot;
    } catch (error) {
      if (error instanceof SnapshotNameConflictError && error.conflictingSnapshot) {
        const generatedCopyName = generateDeterministicCopyName(saveName, savedSimulations);
        setSaveConflictResolution({
          saveName,
          conflictingSnapshot: error.conflictingSnapshot,
          overwriteSnapshotId: error.conflictingSnapshot.id,
          generatedCopyName,
          activateSavedSnapshot
        });
        setSaveStatus(`Name conflict: "${saveName}" already exists.`);
        return null;
      }

      const detail = error instanceof Error ? error.message : 'Unknown save error.';
      setSaveErrorDetail(detail);
      setSaveStatus('Failed to save snapshot. Retry when ready.');
      return null;
    }
  };

  const onSaveAsSimulation = async () => {
    const proposedName = saveAsDraftName.trim();
    if (!proposedName) {
      setSaveAsValidationError('Save As name is required.');
      return;
    }

    const duplicateSnapshot = savedSimulations.find(
      (snapshot) => snapshot.name.trim().toLowerCase() === proposedName.toLowerCase()
    );
    if (duplicateSnapshot) {
      setSaveAsValidationError('A saved simulation with this name already exists. Choose a different name.');
      return;
    }

    setSaveAsValidationError('');
    const savedSnapshot = await onSaveSimulation({
      saveName: proposedName,
      activateSavedSnapshot: true
    });

    if (savedSnapshot) {
      setSaveAsDraftName('');
    }
  };

  const onResolveSaveConflictOverwrite = async () => {
    if (!saveConflictResolution) {
      return;
    }

    await onSaveSimulation({
      forceOverwrite: true,
      overwriteSnapshotId: saveConflictResolution.overwriteSnapshotId,
      saveName: saveConflictResolution.saveName,
      activateSavedSnapshot: saveConflictResolution.activateSavedSnapshot
    });
  };

  const onResolveSaveConflictCopy = async () => {
    if (!saveConflictResolution) {
      return;
    }

    const copyName = generateDeterministicCopyName(saveConflictResolution.saveName, savedSimulations);
    const savedSnapshot = await onSaveSimulation({
      saveName: copyName,
      activateSavedSnapshot: true
    });

    if (savedSnapshot) {
      setSaveAsDraftName('');
    }
  };

  const onCancelSaveConflictResolution = () => {
    setSaveConflictResolution(null);
    setSaveStatus('Save cancelled.');
  };

  const onLoadSimulation = async (snapshotSummary) => {
    if (loadingSnapshotById[snapshotSummary.id]) {
      return;
    }

    if (!confirmDiscardUnsavedRunChanges() || !confirmDiscardUnsavedFormChanges()) {
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

  const onSpectateSimulation = async (snapshotSummary) => {
    if (loadingSnapshotById[snapshotSummary.id]) {
      return;
    }

    if (!confirmDiscardUnsavedRunChanges() || !confirmDiscardUnsavedFormChanges()) {
      setLoadStatus('Spectate cancelled.');
      return;
    }

    setLoadingSnapshotById((previous) => ({
      ...previous,
      [snapshotSummary.id]: true
    }));
    setLoadStatus('Loading for spectating…');
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
      setSpectatorMode(true);
      // Update URL to include spectator param for sharing
      const newUrl = new URL(window.location.href);
      newUrl.searchParams.set('snapshot', snapshot.id);
      newUrl.searchParams.set('spectator', 'true');
      window.history.replaceState({}, '', newUrl.toString());
      setCopyMetadataStatus('');
      setLoadStatus('Spectating.');
    } catch {
      setLoadStatus('Failed to load snapshot for spectating.');
      setLoadRecoveryBySnapshotId((previous) => ({
        ...previous,
        [snapshotSummary.id]: 'Snapshot could not be spectated. Retry or select a different save.'
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
      await writeText(reproducibilityPayload);
      setCopyMetadataStatus('Reproducibility string copied.');
    } catch {
      setCopyMetadataStatus('Failed to copy reproducibility string.');
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

  // Auto-advance replay when playing
  useEffect(() => {
    if (!replayPlaying || !replayContextRef.current) {
      return;
    }

    const currentTick = replayWorldState?.tick ?? replayContextRef.current.baseWorldState.tick;
    const maxTick = replayTimeline.latestRecordedTick;

    if (currentTick >= maxTick) {
      setReplayPlaying(false);
      setReplayStatus('Replay reached end.');
      return;
    }

    const advanceInterval = setInterval(() => {
      const tick = replayWorldState?.tick ?? replayContextRef.current.baseWorldState.tick;
      if (tick >= replayTimeline.latestRecordedTick) {
        setReplayPlaying(false);
        setReplayStatus('Replay reached end.');
        return;
      }
      const nextTick = tick + replaySpeedMultiplier;
      jumpReplayToTick(nextTick, '', false);
    }, 100 / replaySpeedMultiplier);

    return () => clearInterval(advanceInterval);
  }, [replayPlaying, replayWorldState?.tick, replayTimeline.latestRecordedTick, replaySpeedMultiplier]);

  const onReplayPlay = () => {
    if (!replayContextRef.current) {
      return;
    }
    setReplayPlaying(true);
    setReplayStatus('Replaying...');
  };

  const onReplayPause = () => {
    setReplayPlaying(false);
    setReplayStatus('Replay paused.');
  };

  const onReplaySpeedSelect = (multiplier) => {
    setReplaySpeedMultiplier(multiplier);
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

  const onSavedSimulationSortChange = (event) => {
    const nextSortKey = event.target.value;
    setSavedSimulationListViewState((previous) => ({
      ...previous,
      sortKey: nextSortKey
    }));
  };

  const onSavedSimulationFilterChange = (event) => {
    const nextFilter = event.target.value;
    setSavedSimulationListViewState((previous) => ({
      ...previous,
      nameFilter: nextFilter
    }));
  };

  const onSavedSimulationSelect = (snapshotId) => {
    setSavedSimulationListViewState((previous) => ({
      ...previous,
      selectedSnapshotId: snapshotId
    }));
  };

  const runtimeModeLabel = replayActive ? 'Replay active' : paused ? 'Paused' : `Running at ${speedMultiplier}x`;

  return (
    <main className="app-shell">
      <header className="app-header">
        <div className="app-brand">
          <p className="eyebrow">Deterministic simulation lab</p>
          <h1>SNN Sandbox</h1>
          <p className="app-subtitle">Observe the ecosystem first, then tune the parameters that shape it.</p>
        </div>
        <div className="app-header-actions">
          <div className="app-version-badge">Version {appVersion}</div>
          <button type="button" onClick={() => setPreferencesModalOpen(true)}>
            Preferences
          </button>
          <button type="button" onClick={() => setAboutModalOpen(true)}>
            About
          </button>
        </div>
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

      <div className="page-content">
        <section className="hero-panel" aria-label="simulation overview">
          <div className="hero-copy">
            <p className="eyebrow">Artificial life sandbox</p>
            <h2>Grow strange ecosystems, watch them adapt, and shape what happens next.</h2>
            <p>
              Start a world, watch populations rise and collapse, then tune the setup to see how different conditions change the story.
            </p>
          </div>
          <div className="hero-metrics" aria-label="simulation status summary">
            <div className="hero-metric-card">
              <span className="metric-label">Runtime</span>
              <strong>{runtimeModeLabel}</strong>
              <span className="metric-detail">Tick {tickDisplay}</span>
            </div>
            <div className="hero-metric-card">
              <span className="metric-label">Population</span>
              <strong>{formattedStats.population}</strong>
              <span className="metric-detail">{formatTrendIndicator(statsTrends.population)}</span>
            </div>
            <div className="hero-metric-card">
              <span className="metric-label">Seed</span>
              <strong>{resolvedSeed || 'No active simulation'}</strong>
              <span className="metric-detail">{hasSimulation ? `Save status: ${runSaveStatusLabel}` : 'Start a run to bring the world to life'}</span>
            </div>
          </div>
        </section>

        <div className="config-and-canvas-row">
          <div className="simulation-area">
            {resolvedSeed ? <p className="seed-banner">Resolved seed: {resolvedSeed}</p> : null}

            <section className="simulation-stage" aria-label="simulation stage">
              <div className="canvas-frame">
                <canvas
                  ref={canvasRef}
                  width={activeViewport.width}
                  height={activeViewport.height}
                  aria-label="simulation world"
                  onClick={onCanvasClick}
                  onTouchStart={onCanvasTouchStart}
                  onTouchEnd={onCanvasTouchEnd}
                />

                {!hasSimulation ? (
                  <div className="simulation-empty-state" role="status" aria-live="polite">
                    <p className="eyebrow">Simulation ready</p>
                    <h3>Start a simulation to populate the world.</h3>
                    <p>Use the configuration panel to customize the run, or launch a default run immediately.</p>
                    <div className="simulation-empty-state-actions">
                      <button type="button" onClick={onQuickStartSimulation}>
                        Quick start defaults
                      </button>
                    </div>
                  </div>
                ) : null}

                {hudOverlayVisible && selectedOrganism ? (
                  <div className="organism-hud-overlay" role="region" aria-label="organism info">
                    <div className="organism-hud-header">
                      <span className="organism-hud-id">Organism {selectedOrganism.id.slice(0, 8)}</span>
                      <button
                        type="button"
                        className="organism-hud-close"
                        onClick={() => {
                          setHudOverlayVisible(false);
                          clearSelection();
                        }}
                        aria-label="Close organism info"
                      >
                        ×
                      </button>
                    </div>
                    <div className="organism-hud-stats">
                      <p><strong>Generation:</strong> {formattedInspector.generation}</p>
                      <p><strong>Size:</strong> {formattedInspector.size}</p>
                      <p><strong>Energy:</strong> {formattedInspector.energy}</p>
                      {selectedOrganismSpeciesId ? (
                        <p><strong>Species:</strong> <span style={{ color: getSpeciesColor(selectedOrganismSpeciesId) }}>{selectedOrganismSpeciesId}</span></p>
                      ) : null}
                    </div>
                    {brainGraphModel && brainGraphModel.nodes.length > 0 ? (
                      <div className="organism-hud-brain">
                        <div className="brain-graph-controls">
                          <button type="button" onClick={onResetBrainGraphViewport} aria-label="Reset brain view">Reset</button>
                          <button type="button" onClick={onFitSelectionBrainGraphViewport} aria-label="Fit selection">Fit</button>
                          <button type="button" onClick={() => onZoomBrainGraphViewport(1)} aria-label="Zoom in">+</button>
                          <button type="button" onClick={() => onZoomBrainGraphViewport(-1)} aria-label="Zoom out">−</button>
                        </div>
                        <svg
                          className="brain-graph"
                          viewBox={`0 0 ${BRAIN_GRAPH_VIEWBOX.width} ${BRAIN_GRAPH_VIEWBOX.height}`}
                          aria-label="Brain neural network visualization"
                        >
                          <g transform={`translate(${brainGraphTransform.translateX}, ${brainGraphTransform.translateY}) scale(${brainGraphTransform.scale})`}>
                            {brainGraphModel.edges.map((edge) => (
                              <line
                                key={edge.id}
                                className="brain-graph-synapse-edge"
                                x1={brainGraphNodeById.get(edge.sourceId)?.x ?? 0}
                                y1={brainGraphNodeById.get(edge.sourceId)?.y ?? 0}
                                x2={brainGraphNodeById.get(edge.targetId)?.x ?? 0}
                                y2={brainGraphNodeById.get(edge.targetId)?.y ?? 0}
                                stroke={edge.color}
                                strokeWidth={edge.strokeWidth}
                                opacity={edge.emphasisOpacity}
                              />
                            ))}
                            {brainGraphModel.nodes.map((node) => (
                              <circle
                                key={node.id}
                                cx={node.x}
                                cy={node.y}
                                r={8}
                                fill={node.fillColor}
                                stroke={node.id === pinnedBrainNeuronId ? '#38bdf8' : node.id === selectedBrainNeuronId ? '#f59e0b' : '#1e293b'}
                                strokeWidth={node.id === pinnedBrainNeuronId || node.id === selectedBrainNeuronId ? 3 : 1}
                                opacity={node.emphasisOpacity}
                                style={{ cursor: 'pointer' }}
                                onClick={() => setPinnedBrainNeuronId(node.id === pinnedBrainNeuronId ? null : node.id)}
                                onMouseEnter={() => setHoveredBrainNeuronId(node.id)}
                                onMouseLeave={() => setHoveredBrainNeuronId(null)}
                                aria-label={`Neuron ${node.id}, type: ${node.type}`}
                              />
                            ))}
                            {hoveredBrainNeuronId && brainGraphNodeById.get(hoveredBrainNeuronId) ? (
                              <g transform={`translate(${brainGraphNodeById.get(hoveredBrainNeuronId).x + 12}, ${brainGraphNodeById.get(hoveredBrainNeuronId).y - 6})`}>
                                <rect x="0" y="-10" width="156" height="20" rx="4" fill="#1e293b" opacity="0.95" />
                                <text x="78" y="4" textAnchor="middle" fill="#f8fafc" fontSize="11" fontFamily="system-ui">
                                  {brainGraphNodeById.get(hoveredBrainNeuronId).displayLabel}
                                </text>
                              </g>
                            ) : null}
                          </g>
                        </svg>
                        {brainGraphLegend && brainGraphLegend.neuronTypes.length > 0 ? (
                          <div className="brain-graph-legend" role="region" aria-label="Brain graph legend">
                            <div className="brain-graph-legend-section">
                              <strong>Neuron Types</strong>
                              <div className="brain-graph-legend-items">
                                {brainGraphLegend.neuronTypes.map((nt) => (
                                  <span key={nt.type} className="brain-graph-legend-item">
                                    <span className="brain-graph-legend-swatch" style={{ backgroundColor: nt.color.cssColor }} />
                                    {nt.label}
                                  </span>
                                ))}
                              </div>
                            </div>
                            <div className="brain-graph-legend-section">
                              <strong>Synapses</strong>
                              <div className="brain-graph-legend-items">
                                {brainGraphLegend.synapseCues.map((sc) => (
                                  <span key={sc.polarity} className="brain-graph-legend-item">
                                    <span className="brain-graph-legend-swatch" style={{ backgroundColor: sc.color }} />
                                    {sc.polarity}
                                  </span>
                                ))}
                              </div>
                            </div>
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>

              <section className="simulation-stats-hud" aria-label="simulation stats hud">
                <div className="hud-heading-row">
                  <div>
                    <p className="eyebrow">Live telemetry</p>
                    <h2>Simulation stats</h2>
                  </div>
                  <div className="hud-toggle-group" role="group" aria-label="stats visibility presets">
                    <button
                      type="button"
                      onClick={() => setHudVisibilityPreset(HUD_VISIBILITY_PRESETS.MINIMAL)}
                      aria-pressed={hudVisibilityPreset === HUD_VISIBILITY_PRESETS.MINIMAL}
                    >
                      Minimal
                    </button>
                    <button
                      type="button"
                      onClick={() => setHudVisibilityPreset(HUD_VISIBILITY_PRESETS.DETAILED)}
                      aria-pressed={hudVisibilityPreset === HUD_VISIBILITY_PRESETS.DETAILED}
                    >
                      Detailed
                    </button>
                  </div>
                </div>
                <div className="hud-metric-grid">
                  <p>Seed: {hudSeedLabel}</p>
                  <p>Population: {formattedStats.population} ({formatTrendIndicator(statsTrends.population)})</p>
                  {isDetailedHudVisible ? <p>Species count: {formattedStats.speciesCount}</p> : null}
                  {isDetailedHudVisible ? <p>Food count: {formattedStats.foodCount}</p> : null}
                  {isDetailedHudVisible ? <p>Average generation: {formattedStats.averageGeneration}</p> : null}
                  {isDetailedHudVisible ? <p>Average organism energy: {formattedStats.averageEnergy} ({formatTrendIndicator(statsTrends.averageEnergy)})</p> : null}
                  {isDetailedHudVisible ? <p>Tick count: {formattedStats.tickCount}</p> : null}
                  {isDetailedHudVisible ? <p>Time elapsed: {formattedStats.elapsedTime}</p> : null}
                  {isDetailedHudVisible ? (
                    <p>Tick budget clamp: {schedulerClampState.active ? `Active (dropped ${schedulerClampState.droppedTicks} ticks this frame)` : 'Inactive'}</p>
                  ) : null}
                </div>
                <div className="hud-runtime-row">
                  <div className="hud-playback-controls">
                    <strong>Playback speed</strong>
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
                  </div>
                  <div className="hud-runtime-copy">
                    {hasUrlSeedMismatch ? (
                      <div className="seed-mismatch-banner" role="status" aria-live="polite">
                        <p>
                          URL seed <strong>{urlSeed}</strong> does not match active seed <strong>{normalizedActiveSeed}</strong>.
                        </p>
                        <button type="button" onClick={onUseUrlSeed}>
                          Use URL seed
                        </button>
                      </div>
                    ) : null}
                    <p role="status" aria-live="polite" data-tick-counter>
                      Tick: {tickDisplay} | {replayActive ? 'Replay active' : paused ? 'runtime state: paused' : `runtime state: running at ${speedMultiplier}x`}
                    </p>
                    {hasSimulation ? (
                      <p
                        className={`save-status-badge ${hasUnsavedRunChanges ? 'is-unsaved' : 'is-saved'}`}
                        role="status"
                        aria-live="polite"
                      >
                        Save status: {runSaveStatusLabel}
                      </p>
                    ) : null}
                    {seedControlStatus ? <p aria-live="polite">{seedControlStatus}</p> : null}
                    {spectatorMode ? (
                      <p className="spectator-banner"><strong>Spectator Mode</strong> - You are viewing a shared simulation. Changes cannot be saved.</p>
                    ) : null}
                  </div>
                </div>
                <div className="hud-action-row" role="group" aria-label="simulation actions">
                  <ControlButtonWithHint name="regenerate-seed" onClick={onRegenerateSeed} reason={controlDisableReasons.regenerateSeed}>
                    Regenerate seed + restart
                  </ControlButtonWithHint>
                  <ControlButtonWithHint name="restart-run" onClick={onRestartRun} reason={controlDisableReasons.restartFromSeed}>
                    New run with same seed
                  </ControlButtonWithHint>
                  <ControlButtonWithHint
                    name="pause"
                    onClick={onPause}
                    reason={controlDisableReasons.pause}
                    aria-pressed={paused || replayActive}
                  >
                    Pause
                  </ControlButtonWithHint>
                  <ControlButtonWithHint
                    name="resume"
                    onClick={onResume}
                    reason={controlDisableReasons.resume}
                    aria-pressed={!paused && !replayActive}
                  >
                    Resume
                  </ControlButtonWithHint>
                  <ControlButtonWithHint name="step-plus-1" onClick={onStepTick} reason={controlDisableReasons.step}>
                    Step +1
                  </ControlButtonWithHint>
                  <ControlButtonWithHint name="step-plus-10" onClick={onStepTenTicks} reason={controlDisableReasons.step}>
                    Step +10
                  </ControlButtonWithHint>
                  <ControlButtonWithHint name="save-snapshot" onClick={onSaveSimulation} reason={controlDisableReasons.saveSnapshot}>
                    Save snapshot
                  </ControlButtonWithHint>
                  <ControlButtonWithHint name="save-as-snapshot" onClick={onSaveAsSimulation} reason={controlDisableReasons.saveSnapshot}>
                    Save As
                  </ControlButtonWithHint>
                  {!spectatorMode && activeLoadedMetadata?.id ? (
                    <ControlButtonWithHint name="share-snapshot" onClick={onShareSimulation} reason={''}>
                      Share
                    </ControlButtonWithHint>
                  ) : null}
                  <button
                    type="button"
                    onClick={onOpenKeyboardShortcuts}
                    ref={keyboardShortcutsTriggerRef}
                    aria-haspopup="dialog"
                    aria-expanded={keyboardShortcutsModalOpen}
                  >
                    Keyboard Shortcuts
                  </button>
                </div>
                <label className="hud-save-as-field">
                  Save As
                  <input
                    type="text"
                    value={saveAsDraftName}
                    onChange={(event) => {
                      setSaveAsDraftName(event.target.value);
                      if (saveAsValidationError) {
                        setSaveAsValidationError('');
                      }
                      if (saveConflictResolution) {
                        setSaveConflictResolution(null);
                      }
                    }}
                    placeholder={activeConfigRef.current?.name ?? 'New Simulation copy'}
                  />
                </label>
                {saveAsValidationError ? <p aria-live="polite">{saveAsValidationError}</p> : null}
                <p className="shortcut-hints">Shortcuts: Space pause/play · . single-step (paused) · 1/2/3/4 set speed (1x/2x/5x/10x)</p>
                {formattedStats.energyDeathWarning ? (
                  <p className="warning-banner">Warning: Low energy - organisms at risk of dying</p>
                ) : null}
                {isDetailedHudVisible && speciesLegend.length > 0 ? (
                  <div className="legend-group species-legend">
                    <strong>Species</strong>
                    <div className="legend-items">
                      {speciesLegend.slice(0, 10).map(({ id, color }) => (
                        <div key={id} className="legend-item">
                          <span className="legend-swatch is-round" style={{ backgroundColor: color }} />
                          {id}
                        </div>
                      ))}
                      {speciesLegend.length > 10 ? <span className="legend-item">+{speciesLegend.length - 10} more</span> : null}
                    </div>
                  </div>
                ) : null}
                {isDetailedHudVisible && hazardLegend.length > 0 ? (
                  <div className="legend-group hazard-legend">
                    <strong>Hazards</strong>
                    <div className="legend-items">
                      {hazardLegend.map(({ type, color }) => (
                        <div key={type} className="legend-item">
                          <span className="legend-swatch" style={{ backgroundColor: color }} />
                          {type}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </section>
            </section>
          </div>

          <div className="sidebar-column">
            <section className="config-panel" aria-label="simulation configuration">
              <div className="panel-heading">
                <div>
                  <p className="eyebrow">Simulation setup</p>
                  <h2>Configuration</h2>
                </div>
                <p className="panel-copy">Tune the world after you can already see the run context.</p>
              </div>

              <label>
                Quick-start preset
                <select value={selectedPresetId} onChange={onPresetChange}>
                  <option value="">Custom (select a preset)</option>
                  {SIMULATION_PRESETS.map((preset) => (
                    <option key={preset.id} value={preset.id}>
                      {preset.name}
                    </option>
                  ))}
                  {customPresets.length > 0 ? (
                    <optgroup label="Custom Presets">
                      {customPresets.map((preset) => (
                        <option key={preset.id} value={preset.id}>
                          {preset.name}
                        </option>
                      ))}
                    </optgroup>
                  ) : null}
                </select>
              </label>
              {selectedPresetId ? (
                <p className="field-hint">
                  {getPresetById(selectedPresetId)?.description || customPresets.find((p) => p.id === selectedPresetId)?.description}
                </p>
              ) : null}

              {!showSavePresetInput ? (
                <button type="button" onClick={() => setShowSavePresetInput(true)}>
                  Save current as preset
                </button>
              ) : (
                <div className="field-row">
                  <input
                    value={newPresetName}
                    onChange={(event) => setNewPresetName(event.target.value)}
                    placeholder="Preset name"
                    onKeyDown={(event) => event.key === 'Enter' && onSavePreset()}
                  />
                  <button type="button" onClick={onSavePreset}>
                    Save
                  </button>
                  <button type="button" onClick={() => { setShowSavePresetInput(false); setNewPresetName(''); }}>
                    Cancel
                  </button>
                </div>
              )}

              <label>
                Simulation name
                <input value={formState.name} onChange={onFieldChange('name')} />
                {errors.name ? <span className="error-text">{errors.name}</span> : null}
              </label>

              <label>
                Seed (optional)
                <input value={formState.seed} onChange={onFieldChange('seed')} placeholder="Leave blank to auto-generate" />
              </label>
              <p className="field-hint">Leave blank to generate a seed once at start; save this value to replay identical deterministic runs.</p>

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
              <p className="field-hint">Initial/minimum population: 1–2000.</p>
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

              <h3>Reproduction settings</h3>
              <p className="field-hint">Threshold/cost/start energy: 1-200, 0-200, 0-200. Reproduction age and refractory period gate breeding cadence. Max life sets the lifespan cap in ticks.</p>
              <div className="field-row">
                <label>
                  Reproduction threshold
                  <input type="number" value={formState.reproductionThreshold} onChange={onFieldChange('reproductionThreshold')} />
                  {errors.reproductionThreshold ? <span className="error-text">{errors.reproductionThreshold}</span> : null}
                </label>
                <label>
                  Reproduction cost
                  <input type="number" value={formState.reproductionCost} onChange={onFieldChange('reproductionCost')} />
                  {errors.reproductionCost ? <span className="error-text">{errors.reproductionCost}</span> : null}
                </label>
                <label>
                  Offspring start energy
                  <input type="number" value={formState.offspringStartEnergy} onChange={onFieldChange('offspringStartEnergy')} />
                  {errors.offspringStartEnergy ? <span className="error-text">{errors.offspringStartEnergy}</span> : null}
                </label>
              </div>
              <div className="field-row">
                <label>
                  Reproduction age
                  <input type="number" value={formState.reproductionMinimumAge} onChange={onFieldChange('reproductionMinimumAge')} />
                  {errors.reproductionMinimumAge ? <span className="error-text">{errors.reproductionMinimumAge}</span> : null}
                </label>
                <label>
                  Refractory period
                  <input type="number" value={formState.reproductionRefractoryPeriod} onChange={onFieldChange('reproductionRefractoryPeriod')} />
                  {errors.reproductionRefractoryPeriod ? <span className="error-text">{errors.reproductionRefractoryPeriod}</span> : null}
                </label>
                <label>
                  Max life (ticks)
                  <input type="number" value={formState.maximumOrganismAge} onChange={onFieldChange('maximumOrganismAge')} />
                  {errors.maximumOrganismAge ? <span className="error-text">{errors.maximumOrganismAge}</span> : null}
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
              {hasUnsavedFormChanges ? <p aria-live="polite">Unsaved setup changes in: {dirtyFormFields.join(', ')}.</p> : null}
              {queryPrefillStatus ? <p aria-live="polite">{queryPrefillStatus}</p> : null}
            </section>

            <section className="config-panel" aria-label="run metadata panel">
              <details open={hasSimulation}>
                <summary>Run metadata</summary>
                <p>Seed: {runMetadata.seed}</p>
                <p>Current tick: {runMetadata.tickCount}</p>
                <p>Run start tick marker: {runStartTick}</p>
                <p>Run elapsed marker: T+{runElapsedTicks} ticks</p>
                <p>Speed multiplier: {runMetadata.speedMultiplier}</p>
                <p>Snapshot ID: {runMetadata.snapshotId}</p>
                <p>Config fingerprint: {simulationParametersFingerprint}</p>
                <p>Config fingerprint hash: {simulationParametersFingerprintHash}</p>
                <button type="button" onClick={onCopyRunMetadata} disabled={!hasSimulation}>Copy reproducibility string</button>
              </details>
            </section>

            <section id="saved-simulations-section" className="config-panel" aria-label="saved simulations">
              <div className="panel-heading">
                <div>
                  <p className="eyebrow">Saved runs</p>
                  <h2>Saved simulations</h2>
                </div>
              </div>
              <div className="field-row" aria-label="saved simulation list controls">
                <label>
                  Sort saves
                  <select value={savedSimulationListViewState.sortKey} onChange={onSavedSimulationSortChange}>
                    {SAVED_SIMULATION_SORT_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Filter by name
                  <input
                    type="text"
                    value={savedSimulationListViewState.nameFilter}
                    onChange={onSavedSimulationFilterChange}
                    placeholder="Type to filter saves"
                  />
                </label>
              </div>
              {savedSimulationsError ? <p role="alert">{savedSimulationsError}</p> : null}
              {savedSimulations.length === 0 ? (
                <p>{savedSimulationsError ? 'Saved simulations unavailable.' : 'No saved simulations yet.'}</p>
              ) : savedSimulationListView.visibleItems.length === 0 ? (
                <p>No saved simulations match the current filter.</p>
              ) : (
                <ul className="saved-simulation-list">
                  {savedSimulationListView.visibleItems.map((snapshot) => {
                    const isLoadingSnapshot = Boolean(loadingSnapshotById[snapshot.id]);
                    const hasValidMetadata = snapshot.metadataValid !== false;
                    const seedLabel = hasValidMetadata ? (snapshot.seed || 'unknown') : 'metadata unavailable';
                    const tickLabel = hasValidMetadata ? snapshot.tickCount : 'metadata unavailable';
                    const isSelected = savedSimulationListView.selectedSnapshotId === snapshot.id;

                    return (
                      <li key={snapshot.id} className={`saved-simulation-item${isSelected ? ' is-selected' : ''}`} aria-current={isSelected ? 'true' : undefined}>
                        <div className="saved-simulation-copy">
                          <strong>{snapshot.name}</strong>
                          <span>Updated {formatSimulationTimestamp(snapshot.updatedAt)}</span>
                          <span>Seed {seedLabel} · tick {tickLabel}</span>
                          <span>Population {snapshot.populationCount ?? 'metadata unavailable'} · config {snapshot.configSummary ?? 'metadata unavailable'}</span>
                        </div>
                        <div className="saved-simulation-actions">
                          <button type="button" onClick={() => onSavedSimulationSelect(snapshot.id)} aria-pressed={isSelected}>
                            {isSelected ? 'Selected' : 'Select'}
                          </button>
                          <button type="button" onClick={() => onLoadSimulation(snapshot)} disabled={isLoadingSnapshot || !hasValidMetadata}>
                            {isLoadingSnapshot ? 'Loading…' : 'Resume'}
                          </button>
                          <button type="button" onClick={() => onSpectateSimulation(snapshot)} disabled={isLoadingSnapshot || !hasValidMetadata}>
                            {isLoadingSnapshot ? 'Loading…' : 'Spectate'}
                          </button>
                          <button type="button" onClick={() => onDeleteSimulation(snapshot)} disabled={isLoadingSnapshot}>Delete</button>
                        </div>
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
          </div>
        </div>

        {replayActive ? (
          <div ref={replayInteractionRegionRef} className="replay-layout" onKeyDown={onReplayMismatchKeyboardNavigate}>
            <section className="config-panel replay-summary-strip" aria-label="replay session summary strip" tabIndex={-1}>
              <h2>Replay summary</h2>
              <p>Deterministic context: {replaySummaryStrip.contextLabel}</p>
              <p>Seed: {replaySummaryStrip.seed}</p>
              <p>Simulation version: {replaySummaryStrip.simulationVersion}</p>
              <p>Parameter fingerprint: {replaySummaryStrip.parameterFingerprint}</p>
              <button type="button" onClick={onCopyDeterministicContext}>Copy deterministic context</button>
              {replaySummaryStrip.contextDifferences.length > 0 ? <p>Context differences: {replaySummaryStrip.contextDifferences.join(', ')}</p> : null}
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
                    {selectedMismatchDetails.entityId ? <p>Entity ID: {selectedMismatchDetails.entityId}</p> : null}
                    <p>Compared key/path: {selectedMismatchDetails.path}</p>
                    <p>Baseline value: {formatMismatchDisplayValue(selectedMismatchDetails.baselineValue)}</p>
                    <p>Comparison value: {formatMismatchDisplayValue(selectedMismatchDetails.comparisonValue)}</p>
                    {selectedMismatchDetails.severity ? <p>Severity: {selectedMismatchDetails.severity}</p> : null}
                    <p>
                      Absolute delta:{' '}
                      {selectedMismatchDetails.absoluteDelta === null ? 'N/A' : formatMismatchDisplayValue(selectedMismatchDetails.absoluteDelta)}
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
                    const positionPercent = replayTimeline.latestRecordedTick > 0 ? (markerTick / replayTimeline.latestRecordedTick) * 100 : 0;
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
              <div className="field-row">
                {replayPlaying ? (
                  <button type="button" onClick={onReplayPause}>Pause</button>
                ) : (
                  <button type="button" onClick={onReplayPlay}>Play</button>
                )}
              </div>
              <div className="speed-presets" role="group" aria-label="replay speed presets">
                {REPLAY_SPEED_OPTIONS.map((multiplier) => (
                  <button
                    key={`replay-speed-${multiplier}`}
                    type="button"
                    onClick={() => onReplaySpeedSelect(multiplier)}
                    className={`speed-preset-button${replaySpeedMultiplier === multiplier ? ' is-active' : ''}`}
                    aria-pressed={replaySpeedMultiplier === multiplier}
                  >
                    {multiplier}x
                  </button>
                ))}
              </div>
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
      </div>

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
                <dd>Move focus between inspector trait sections (Lifecycle, Physical Traits, Genome/Brain).</dd>
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

      {preferencesModalOpen ? (
        <div className="modal-backdrop" role="presentation">
          <section className="modal-panel" role="dialog" aria-modal="true" aria-label="preferences">
            <div className="modal-header-row">
              <h2>Preferences</h2>
              <button type="button" onClick={() => setPreferencesModalOpen(false)} aria-label="Close preferences">
                Close
              </button>
            </div>
            <p>Preferences settings will be saved locally.</p>
            <div className="field-row" style={{ marginTop: '1rem' }}>
              <label>
                <input type="checkbox" checked={hudVisibilityPreset === HUD_VISIBILITY_PRESETS.MINIMAL} onChange={() => setHudVisibilityPreset(HUD_VISIBILITY_PRESETS.MINIMAL)} />
                Minimal HUD
              </label>
              <label>
                <input type="checkbox" checked={hudVisibilityPreset === HUD_VISIBILITY_PRESETS.DETAILED} onChange={() => setHudVisibilityPreset(HUD_VISIBILITY_PRESETS.DETAILED)} />
                Detailed HUD
              </label>
            </div>
            <p>Press Escape to close this dialog.</p>
          </section>
        </div>
      ) : null}

      {aboutModalOpen ? (
        <div className="modal-backdrop" role="presentation">
          <section className="modal-panel" role="dialog" aria-modal="true" aria-label="about">
            <div className="modal-header-row">
              <h2>About SNN Sandbox</h2>
              <button type="button" onClick={() => setAboutModalOpen(false)} aria-label="Close about">
                Close
              </button>
            </div>
            <p><strong>SNN Sandbox</strong> - Deterministic Spiking Neural Network Simulation</p>
            <p style={{ marginTop: '0.5rem' }}>Version: {appVersion}</p>
            <p style={{ marginTop: '0.5rem', color: '#b9c4d1' }}>
              A deterministic simulation environment for evolving spiking neural networks.
              The simulation produces identical results regardless of when or where it runs,
              enabling reproducible scientific experiments.
            </p>
            <p style={{ marginTop: '0.5rem', color: '#b9c4d1' }}>
              Built with React, deterministic PRNG, and spatial indexing for efficient simulation.
            </p>
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
            <p>Last updated: {formatSimulationTimestamp(pendingDeleteSnapshot.updatedAt)}</p>
            <div className="field-row">
              <button type="button" onClick={onConfirmDeleteSimulation} ref={deleteConfirmButtonRef}>Confirm delete</button>
              <button type="button" onClick={onCancelDeleteSimulation}>Cancel</button>
            </div>
            <p>Press Escape to cancel.</p>
          </section>
        </div>
      ) : null}

      {saveStatus ? <p>{saveStatus}</p> : null}
      {saveErrorDetail ? <p role="alert">Save error: {saveErrorDetail} <button type="button" onClick={onSaveSimulation}>Retry save</button></p> : null}
      {saveConflictResolution ? (
        <section aria-label="save name conflict resolution">
          <p>
            A saved simulation named "{saveConflictResolution.saveName}" already exists (tick {saveConflictResolution.conflictingSnapshot.tickCount}).
            Choose overwrite or save as "{saveConflictResolution.generatedCopyName}".
          </p>
          <div className="field-row">
            <button type="button" onClick={onResolveSaveConflictOverwrite}>Overwrite existing</button>
            <button type="button" onClick={onResolveSaveConflictCopy}>Save as "{saveConflictResolution.generatedCopyName}"</button>
            <button type="button" onClick={onCancelSaveConflictResolution}>Cancel</button>
          </div>
        </section>
      ) : null}
      {loadStatus ? <p>{loadStatus}</p> : null}
      {deleteStatus ? <p>{deleteStatus}</p> : null}
      {copyMetadataStatus ? <p>{copyMetadataStatus}</p> : null}
      {replayStatus ? <p>{replayStatus}</p> : null}
      {activeLoadedMetadata ? <p>Active snapshot: {activeLoadedMetadata.name} (updated {formatSimulationTimestamp(activeLoadedMetadata.updatedAt)})</p> : null}

    </main>
  );
}

export default App;
