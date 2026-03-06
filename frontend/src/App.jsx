import { useEffect, useMemo, useRef, useState } from 'react';

import { stepWorld } from './simulation/engine';
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
import { drawWorldSnapshot } from './simulation/renderer';
import { pickOrganismAtPoint } from './simulation/selection';

const TICK_MS = 1000 / 30;
const SPEED_OPTIONS = [1, 2, 5, 10];

function App() {
  const [paused, setPaused] = useState(false);
  const [speedMultiplier, setSpeedMultiplier] = useState(1);
  const [tickDisplay, setTickDisplay] = useState(0);
  const [resolvedSeed, setResolvedSeed] = useState('');
  const [selectedOrganismId, setSelectedOrganismId] = useState(null);
  const [errors, setErrors] = useState({});
  const [formState, setFormState] = useState(() => {
    const saved = loadSimulationConfig();
    if (!saved) {
      return {
        ...DEFAULT_CONFIG,
        worldWidth: String(DEFAULT_CONFIG.worldWidth),
        worldHeight: String(DEFAULT_CONFIG.worldHeight),
        initialPopulation: String(DEFAULT_CONFIG.initialPopulation),
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
  const rngRef = useRef(null);
  const stepParamsRef = useRef(null);
  const viewportRef = useRef({ width: DEFAULT_CONFIG.worldWidth, height: DEFAULT_CONFIG.worldHeight });

  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

  useEffect(() => {
    speedMultiplierRef.current = speedMultiplier;
  }, [speedMultiplier]);

  useEffect(() => {
    const interval = setInterval(() => {
      if (pausedRef.current || !worldRef.current || !rngRef.current || !stepParamsRef.current) {
        return;
      }

      for (let i = 0; i < speedMultiplierRef.current; i += 1) {
        worldRef.current = stepWorld(worldRef.current, rngRef.current, stepParamsRef.current);
      }

      setTickDisplay(worldRef.current.tick);
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
      if (worldRef.current) {
        drawWorldSnapshot(ctx, worldRef.current, viewportRef.current);
      }
      frame = requestAnimationFrame(render);
    };

    frame = requestAnimationFrame(render);

    return () => cancelAnimationFrame(frame);
  }, []);

  const selectedOrganism = useMemo(() => {
    if (!selectedOrganismId || !worldRef.current) {
      return null;
    }

    return worldRef.current.organisms.find((organism) => organism.id === selectedOrganismId) ?? null;
  }, [selectedOrganismId, tickDisplay]);

  useEffect(() => {
    if (selectedOrganismId && !selectedOrganism) {
      setSelectedOrganismId(null);
    }
  }, [selectedOrganismId, selectedOrganism]);

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

  const startSimulation = () => {
    const nextErrors = validateSimulationConfig(formState);
    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return;
    }

    const seedToUse = resolveSeed(formState.seed);
    const config = normalizeSimulationConfig(formState, seedToUse);

    const initialWorld = createInitialWorldFromConfig(config);
    worldRef.current = initialWorld;
    rngRef.current = createSeededPrng(config.resolvedSeed);
    stepParamsRef.current = toEngineStepParams(config);
    viewportRef.current = {
      width: config.worldWidth,
      height: config.worldHeight
    };

    setSelectedOrganismId(null);
    setResolvedSeed(config.resolvedSeed);
    setTickDisplay(0);
    setSpeedMultiplier(1);
    setPaused(false);
    saveSimulationConfig(config);
    setFormState((prev) => ({ ...prev, seed: config.seed || config.resolvedSeed }));
  };

  const hasSimulation = useMemo(() => Boolean(worldRef.current && rngRef.current), [tickDisplay, resolvedSeed]);

  const onSpeedSelect = (multiplier) => {
    setSpeedMultiplier(multiplier);
    setPaused(false);
  };

  const onCanvasClick = (event) => {
    if (!canvasRef.current || !worldRef.current) {
      return;
    }

    const rect = canvasRef.current.getBoundingClientRect();
    const scaleX = canvasRef.current.width / rect.width;
    const scaleY = canvasRef.current.height / rect.height;
    const x = (event.clientX - rect.left) * scaleX;
    const y = (event.clientY - rect.top) * scaleY;

    const selected = pickOrganismAtPoint(worldRef.current.organisms, x, y);
    setSelectedOrganismId(selected?.id ?? null);
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
        <button type="button" onClick={() => setPaused((value) => !value)} disabled={!hasSimulation} aria-pressed={paused}>
          {paused ? 'Resume' : 'Pause'}
        </button>
        {SPEED_OPTIONS.map((multiplier) => (
          <button
            key={multiplier}
            type="button"
            onClick={() => onSpeedSelect(multiplier)}
            disabled={!hasSimulation}
            aria-pressed={!paused && speedMultiplier === multiplier}
          >
            {multiplier}x
          </button>
        ))}
        <span>Tick: {tickDisplay}</span>
      </section>

      <canvas
        ref={canvasRef}
        width={Number(formState.worldWidth) || DEFAULT_CONFIG.worldWidth}
        height={Number(formState.worldHeight) || DEFAULT_CONFIG.worldHeight}
        aria-label="simulation world"
        onClick={onCanvasClick}
      />

      <section className="config-panel" aria-label="organism inspector">
        <h2>Organism inspector</h2>
        {selectedOrganism ? (
          <>
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
          </>
        ) : (
          <p>Click an organism to inspect it.</p>
        )}
      </section>
    </main>
  );
}

export default App;
