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
import { mapBrainToVisualizerModel } from './simulation/brainVisualizer';
import { drawWorldSnapshot } from './simulation/renderer';
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
  saveSimulationSnapshot
} from './simulation/api';

const TICK_MS = 1000 / 30;
const SPEED_OPTIONS = [1, 2, 5, 10];
const SIMULATION_VERSION = 'snn-sandbox-v1';

function App() {
  const [paused, setPaused] = useState(false);
  const [speedMultiplier, setSpeedMultiplier] = useState(1);
  const [tickDisplay, setTickDisplay] = useState(0);
  const [resolvedSeed, setResolvedSeed] = useState('');
  const [selectedOrganismId, setSelectedOrganismId] = useState(null);
  const [selectedOrganismUnavailable, setSelectedOrganismUnavailable] = useState(false);
  const [errors, setErrors] = useState({});
  const [savedSimulations, setSavedSimulations] = useState([]);
  const [saveStatus, setSaveStatus] = useState('');
  const [loadStatus, setLoadStatus] = useState('');
  const [deleteStatus, setDeleteStatus] = useState('');
  const [copyMetadataStatus, setCopyMetadataStatus] = useState('');
  const [seedControlStatus, setSeedControlStatus] = useState('');
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
  const [formState, setFormState] = useState(() => {
    const saved = loadSimulationConfig();
    if (!saved) {
      return {
        ...DEFAULT_CONFIG,
        worldWidth: String(DEFAULT_CONFIG.worldWidth),
        worldHeight: String(DEFAULT_CONFIG.worldHeight),
        initialPopulation: String(DEFAULT_CONFIG.initialPopulation),
        minimumPopulation: String(DEFAULT_CONFIG.minimumPopulation),
        initialFoodCount: String(DEFAULT_CONFIG.initialFoodCount),
        foodSpawnChance: String(DEFAULT_CONFIG.foodSpawnChance),
        foodEnergyValue: String(DEFAULT_CONFIG.foodEnergyValue),
        maxFood: String(DEFAULT_CONFIG.maxFood)
      };
    }

    return {
      ...saved,
      worldWidth: String(saved.worldWidth),
      worldHeight: String(saved.worldHeight),
      initialPopulation: String(saved.initialPopulation),
      minimumPopulation: String(saved.minimumPopulation ?? saved.initialPopulation),
      initialFoodCount: String(saved.initialFoodCount),
      foodSpawnChance: String(saved.foodSpawnChance),
      foodEnergyValue: String(saved.foodEnergyValue),
      maxFood: String(saved.maxFood)
    };
  });

  const worldRef = useRef(null);
  const pausedRef = useRef(paused);
  const speedMultiplierRef = useRef(speedMultiplier);
  const canvasRef = useRef(null);
  const replayInteractionRegionRef = useRef(null);
  const rngRef = useRef(null);
  const stepParamsRef = useRef(null);
  const lastPersistedTickRef = useRef(0);
  const activeConfigRef = useRef(null);
  const viewportRef = useRef({ width: DEFAULT_CONFIG.worldWidth, height: DEFAULT_CONFIG.worldHeight });
  const replayContextRef = useRef(null);

  const displayWorld = replayWorldState ?? worldRef.current;
  const replayActive = Boolean(replayContextRef.current);

  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

  useEffect(() => {
    speedMultiplierRef.current = speedMultiplier;
  }, [speedMultiplier]);

  const advanceOneTick = () => {
    if (!worldRef.current || !rngRef.current || !stepParamsRef.current) {
      return;
    }

    worldRef.current = stepWorld(worldRef.current, rngRef.current, stepParamsRef.current);
    setTickDisplay(worldRef.current.tick);
  };

  useEffect(() => {
    const interval = setInterval(() => {
      if (replayContextRef.current || pausedRef.current || !worldRef.current || !rngRef.current || !stepParamsRef.current) {
        return;
      }

      for (let i = 0; i < speedMultiplierRef.current; i += 1) {
        advanceOneTick();
      }
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

    let frame = 0;
    const render = () => {
      const worldToDraw = replayWorldState ?? worldRef.current;
      if (worldToDraw) {
        drawWorldSnapshot(ctx, worldToDraw, viewportRef.current, {
          selectedOrganismId
        });
      }
      frame = requestAnimationFrame(render);
    };

    frame = requestAnimationFrame(render);

    return () => cancelAnimationFrame(frame);
  }, [replayWorldState, selectedOrganismId]);

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
    if (!selectedOrganismId) {
      if (selectedOrganismUnavailable) {
        setSelectedOrganismUnavailable(false);
      }
      return;
    }

    if (!selectedOrganism) {
      setSelectedOrganismUnavailable(true);
      return;
    }

    if (selectedOrganismUnavailable) {
      setSelectedOrganismUnavailable(false);
    }
  }, [selectedOrganismId, selectedOrganism, selectedOrganismUnavailable]);

  const clearSelection = () => {
    setSelectedOrganismId(null);
    setSelectedOrganismUnavailable(false);
  };

  const acknowledgeUnavailableSelection = () => {
    if (!selectedOrganismUnavailable) {
      return false;
    }

    clearSelection();
    return true;
  };

  const brainGraphModel = useMemo(() => {
    if (!selectedOrganism) {
      return null;
    }
    return mapBrainToVisualizerModel(selectedOrganism.brain);
  }, [selectedOrganism]);

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
    setFormState({
      ...loadedConfig,
      worldWidth: String(loadedConfig.worldWidth),
      worldHeight: String(loadedConfig.worldHeight),
      initialPopulation: String(loadedConfig.initialPopulation),
      minimumPopulation: String(loadedConfig.minimumPopulation),
      initialFoodCount: String(loadedConfig.initialFoodCount),
      foodSpawnChance: String(loadedConfig.foodSpawnChance),
      foodEnergyValue: String(loadedConfig.foodEnergyValue),
      maxFood: String(loadedConfig.maxFood)
    });

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
    setFormState((prev) => ({ ...prev, seed: config.seed || config.resolvedSeed }));
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

  const onStepTick = () => {
    if (acknowledgeUnavailableSelection()) {
      return;
    }

    if (!pausedRef.current || replayContextRef.current) {
      return;
    }

    advanceOneTick();
  };

  const onTogglePausePlay = () => {
    if (pausedRef.current) {
      onSpeedSelect(speedMultiplierRef.current || 1);
      return;
    }

    onPause();
  };

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
      if (isTypingTarget(event.target) || replayContextRef.current || !worldRef.current || !rngRef.current) {
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
  }, [onStepTick, onTogglePausePlay, onSpeedSelect]);

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
      clearSelection();
      return;
    }

    setSelectedOrganismId(selected.id);
    setSelectedOrganismUnavailable(false);
  };

  const onSaveSimulation = async () => {
    if (!worldRef.current || !activeConfigRef.current) {
      return;
    }

    setSaveStatus('Saving…');

    try {
      await saveSimulationSnapshot({
        name: activeConfigRef.current.name,
        seed: activeConfigRef.current.resolvedSeed,
        parameters: activeConfigRef.current,
        tickCount: worldRef.current.tick,
        worldState: worldRef.current,
        rngState: rngRef.current?.getState?.() ?? null
      });
      lastPersistedTickRef.current = worldRef.current.tick;

      const items = await listSimulationSnapshots();
      setSavedSimulations(items);
      setSaveStatus('Saved.');
    } catch {
      setSaveStatus('Failed to save.');
    }
  };

  const onLoadSimulation = async (snapshotSummary) => {
    setLoadStatus('Loading…');

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
    }
  };

  const onDeleteSimulation = async (snapshotSummary) => {
    const confirmed = window.confirm(`Delete snapshot "${snapshotSummary.name}"? This cannot be undone.`);
    if (!confirmed) {
      setDeleteStatus('Delete cancelled.');
      return;
    }

    setDeleteStatus('Deleting…');

    try {
      await deleteSimulationSnapshot(snapshotSummary.id);
      setSavedSimulations((previous) => previous.filter((snapshot) => snapshot.id !== snapshotSummary.id));

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
      maxFood: String(validatedPreset.parameters.maxFood)
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
          <label>
            Initial food count
            <input type="number" value={formState.initialFoodCount} onChange={onFieldChange('initialFoodCount')} />
            {errors.initialFoodCount ? <span className="error-text">{errors.initialFoodCount}</span> : null}
          </label>
        </div>

        <div className="field-row">
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

        <button type="button" onClick={startSimulation}>
          Start simulation
        </button>
      </section>

      {resolvedSeed ? <p className="seed-banner">Resolved seed: {resolvedSeed}</p> : null}

      <section className="controls" aria-label="simulation controls">
        <p>Active seed: {resolvedSeed || 'No active simulation'}</p>
        <button type="button" onClick={onCopyActiveSeed} disabled={!hasSimulation}>Copy seed</button>
        <button type="button" onClick={onRegenerateSeed} disabled={!hasSimulation}>Regenerate seed + restart</button>
        <button type="button" onClick={onRestartFromSeed} disabled={!hasSimulation}>Restart from Seed</button>
        {seedControlStatus ? <p aria-live="polite">{seedControlStatus}</p> : null}
        <button
          type="button"
          onClick={onPause}
          disabled={!hasSimulation || replayActive}
          aria-pressed={paused || replayActive}
        >
          Pause
        </button>
        {SPEED_OPTIONS.map((multiplier) => (
          <button
            key={multiplier}
            type="button"
            onClick={() => onSpeedSelect(multiplier)}
            disabled={!hasSimulation || replayActive}
            aria-pressed={!paused && !replayActive && speedMultiplier === multiplier}
          >
            {multiplier}x
          </button>
        ))}
        <button type="button" onClick={onStepTick} disabled={!hasSimulation || replayActive || !paused}>
          Step
        </button>
        <button type="button" onClick={onSaveSimulation} disabled={!hasSimulation}>Save snapshot</button>
        <p className="shortcut-hints">Shortcuts: Space pause/play · . single-step (paused) · 1/2/3/4 set 1x/2x/5x/10x</p>
      </section>


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
            {savedSimulations.map((snapshot) => (
              <li key={snapshot.id}>
                {snapshot.name} — {formatTimestamp(snapshot.updatedAt)}{' '}
                <button type="button" onClick={() => onLoadSimulation(snapshot)}>Load</button>{' '}
                <button type="button" onClick={() => onDeleteSimulation(snapshot)}>Delete</button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="simulation-stage" aria-label="simulation stage">
        {(hasSimulation || replayActive) ? (
          <section className="simulation-stats-hud" aria-label="simulation stats hud">
            <h2>Simulation stats</h2>
            <p>Population: {formattedStats.population}</p>
            <p>Food count: {formattedStats.foodCount}</p>
            <p>Average generation: {formattedStats.averageGeneration}</p>
            <p>Average organism energy: {formattedStats.averageEnergy}</p>
            <p>Tick count: {formattedStats.tickCount}</p>
            <p>Time elapsed: {formattedStats.elapsedTime}</p>
          </section>
        ) : null}

        <canvas
          ref={canvasRef}
          width={Number(formState.worldWidth) || DEFAULT_CONFIG.worldWidth}
          height={Number(formState.worldHeight) || DEFAULT_CONFIG.worldHeight}
          aria-label="simulation world"
          onClick={onCanvasClick}
        />
      </section>

      <section className="config-panel" aria-label="organism inspector">
        <h2>Organism inspector</h2>
        {selectedOrganism ? (
          <>
            <button type="button" onClick={clearSelection} aria-label="close organism inspector">Close inspector</button>
            <p><strong>ID:</strong> {selectedOrganism.id}</p>
            <p><strong>Generation:</strong> {selectedOrganism.generation}</p>
            <p><strong>Age:</strong> {selectedOrganism.age}</p>
            <p><strong>Energy:</strong> {selectedOrganism.energy.toFixed(3)}</p>
            <p><strong>Position:</strong> ({selectedOrganism.x.toFixed(3)}, {selectedOrganism.y.toFixed(3)})</p>
            <h3>Physical traits</h3>
            <ul>
              <li>Size: {selectedOrganism.traits.size}</li>
              <li>Speed: {selectedOrganism.traits.speed}</li>
              <li>Vision range: {selectedOrganism.traits.visionRange}</li>
              <li>Turn rate: {selectedOrganism.traits.turnRate}</li>
              <li>Metabolism: {selectedOrganism.traits.metabolism}</li>
            </ul>

            <h3>Brain visualizer (read-only)</h3>
            {brainGraphModel ? (
              <>
                <p>
                  <strong>Neurons:</strong> {brainGraphModel.nodes.length} | <strong>Synapses:</strong> {brainGraphModel.edges.length}
                </p>
                <p aria-label="brain graph weight legend">
                  Synapse weights: <span style={{ color: '#22c55e' }}>green = excitatory (+)</span>,{' '}
                  <span style={{ color: '#ef4444' }}>red = inhibitory (-)</span>, thicker edge = stronger magnitude.
                </p>
                <svg viewBox="0 0 640 300" role="img" aria-label="organism brain graph" className="brain-graph">
                  {brainGraphModel.edges.map((edge) => {
                    const source = brainGraphModel.nodes.find((node) => node.id === edge.sourceId);
                    const target = brainGraphModel.nodes.find((node) => node.id === edge.targetId);
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
                        strokeWidth={edge.strokeWidth}
                        opacity="0.85"
                      />
                    );
                  })}
                  {brainGraphModel.nodes.map((node) => (
                    <g key={node.id}>
                      <circle cx={node.x} cy={node.y} r="10" fill={node.fillColor} stroke="#94a3b8" strokeWidth="1.5" />
                      <text x={node.x + 14} y={node.y + 4} fill={node.labelColor} fontSize="12">{node.id} ({node.value.toFixed(2)})</text>
                    </g>
                  ))}
                </svg>
              </>
            ) : (
              <p>Brain data unavailable for this organism.</p>
            )}
          </>
        ) : selectedOrganismUnavailable ? (
          <>
            <button type="button" onClick={clearSelection} aria-label="close organism inspector">Close inspector</button>
            <p>Selected organism is no longer available.</p>
            <p>Inspector will close on your next interaction.</p>
          </>
        ) : (
          <p>Click an organism to inspect it.</p>
        )}
      </section>
    </main>
  );
}

export default App;
