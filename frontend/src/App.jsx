import { useEffect, useMemo, useRef, useState } from 'react';

import { createWorldState, stepWorld } from './simulation/engine';
import { createSeededPrng } from './simulation/prng';
import { drawWorldSnapshot } from './simulation/renderer';

const VIEWPORT = { width: 800, height: 480 };
const TICK_MS = 1000 / 30;

function createInitialWorld() {
  return createWorldState({
    tick: 0,
    organisms: [
      { id: 'org-1', x: 150, y: 160, energy: 20 },
      { id: 'org-2', x: 300, y: 220, energy: 20 },
      { id: 'org-3', x: 500, y: 260, energy: 20 }
    ],
    food: [
      { id: 'food-1', x: 120, y: 100, energyValue: 5 },
      { id: 'food-2', x: 640, y: 320, energyValue: 5 }
    ]
  });
}

function App() {
  const [paused, setPaused] = useState(false);
  const [tickDisplay, setTickDisplay] = useState(0);
  const worldRef = useRef(createInitialWorld());
  const pausedRef = useRef(paused);
  const canvasRef = useRef(null);
  const rng = useMemo(() => createSeededPrng('ssn-8-renderer-seed'), []);

  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

  useEffect(() => {
    const interval = setInterval(() => {
      if (pausedRef.current) {
        return;
      }

      worldRef.current = stepWorld(worldRef.current, rng, {
        movementDelta: 1.5,
        metabolismPerTick: 0.05,
        foodSpawnChance: 0.02,
        foodEnergyValue: 5
      });

      if (worldRef.current.tick % 10 === 0) {
        setTickDisplay(worldRef.current.tick);
      }
    }, TICK_MS);

    return () => clearInterval(interval);
  }, [rng]);

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
      if (!pausedRef.current) {
        drawWorldSnapshot(ctx, worldRef.current, VIEWPORT);
      }
      frame = requestAnimationFrame(render);
    };

    frame = requestAnimationFrame(render);

    return () => cancelAnimationFrame(frame);
  }, []);

  return (
    <main className="app-shell">
      <header className="app-header">
        <h1>SNN Sandbox</h1>
        <p>Deterministic simulation renderer harness</p>
      </header>

      <section className="controls" aria-label="simulation controls">
        <button type="button" onClick={() => setPaused((value) => !value)}>
          {paused ? 'Resume' : 'Pause'}
        </button>
        <span>Tick: {tickDisplay}</span>
      </section>

      <canvas
        ref={canvasRef}
        width={VIEWPORT.width}
        height={VIEWPORT.height}
        aria-label="simulation world"
      />
    </main>
  );
}

export default App;
