import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import App from './App';
import { createInitialWorldFromConfig, loadSimulationConfig, normalizeSimulationConfig, STORAGE_KEY, toEngineStepParams } from './simulation/config';
import { loadReplayComparisonPresets } from './simulation/replayComparisonPresets';
import { stepWorld } from './simulation/engine';
import { createSeededPrng } from './simulation/prng';
import { mapBrainEmphasisChecksum, mapBrainToVisualizerModel } from './simulation/brainVisualizer';
import { INSPECTOR_TRAIT_SECTION_SCHEMA } from './inspectorTraitSchema';

function ensureWritableLocalStorage() {
  const storage = window.localStorage;
  if (storage && typeof storage.setItem === 'function' && typeof storage.getItem === 'function') {
    return;
  }

  const backing = new Map();
  const fallbackStorage = {
    getItem: (key) => (backing.has(String(key)) ? backing.get(String(key)) : null),
    setItem: (key, value) => {
      backing.set(String(key), String(value));
    },
    removeItem: (key) => {
      backing.delete(String(key));
    },
    clear: () => {
      backing.clear();
    }
  };

  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: fallbackStorage
  });
}

describe('App', () => {
  let clipboardWriteText;

  beforeEach(() => {
    ensureWritableLocalStorage();

    vi.spyOn(window, 'requestAnimationFrame').mockImplementation(() => 1);
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {});
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      clearRect: () => {},
      fillRect: () => {},
      beginPath: () => {},
      arc: () => {},
      fill: () => {}
    });

    vi.spyOn(globalThis.crypto, 'getRandomValues').mockImplementation((array) => {
      array[0] = 123456;
      return array;
    });

    vi.spyOn(window, 'confirm').mockReturnValue(true);

    clipboardWriteText = vi.fn(async () => undefined);
    Object.defineProperty(window.navigator, 'clipboard', {
      configurable: true,
      value: { writeText: clipboardWriteText }
    });

    vi.stubGlobal('fetch', vi.fn(async (url, options = {}) => {
      if (url === '/api/simulations/snapshots' && (!options.method || options.method === 'GET')) {
        return {
          ok: true,
          status: 200,
          json: async () => ([
            {
              id: 'sim-fixture',
              name: 'Fixture snapshot',
              seed: 'fixture-seed',
              tickCount: 0,
              updatedAt: '2026-03-06T12:00:01.000Z'
            }
          ])
        };
      }

      if (String(url).startsWith('/api/simulations/snapshots/') && (!options.method || options.method === 'GET')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            id: 'sim-fixture',
            name: 'Fixture snapshot',
            seed: 'fixture-seed',
            parameters: {
              name: 'Fixture',
              seed: 'fixture-seed',
              resolvedSeed: 'fixture-seed',
              worldWidth: 800,
              worldHeight: 480,
              initialPopulation: 12,
              initialFoodCount: 30,
              foodSpawnChance: 0.04,
              foodEnergyValue: 5,
              maxFood: 120
            },
            tickCount: 0,
            rngState: 123,
            worldState: createInitialWorldFromConfig(normalizeSimulationConfig({
              name: 'Fixture',
              seed: 'fixture-seed',
              worldWidth: 800,
              worldHeight: 480,
              initialPopulation: 12,
              initialFoodCount: 30,
              foodSpawnChance: 0.04,
              foodEnergyValue: 5,
              maxFood: 120
            }, 'fixture-seed'))
          })
        };
      }

      if (url === '/api/simulations/snapshots' && options.method === 'POST') {
        return {
          ok: true,
          status: 201,
          json: async () => ({ id: 'sim-1' })
        };
      }

      if (String(url).startsWith('/api/simulations/snapshots/') && options.method === 'DELETE') {
        return {
          ok: true,
          status: 204,
          json: async () => ({})
        };
      }

      return {
        ok: false,
        status: 404,
        json: async () => ({})
      };
    }));
  });

  afterEach(() => {
    vi.useRealTimers();

    if (typeof window.localStorage?.clear === 'function') {
      window.localStorage.clear();
    } else if (typeof window.localStorage?.removeItem === 'function') {
      window.localStorage.removeItem(STORAGE_KEY);
    }

    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    cleanup();
  });

  it('renders the simulation heading and config form', () => {
    render(<App />);

    expect(
      screen.getByRole('heading', {
        level: 1,
        name: /snn sandbox/i
      })
    ).toBeInTheDocument();

    expect(screen.getByRole('button', { name: /start simulation/i })).toBeInTheDocument();
    expect(screen.getByText(/leave blank to generate a seed once at start/i)).toBeInTheDocument();
  });

  it('resets setup form values back to project defaults', () => {
    render(<App />);

    fireEvent.change(screen.getByLabelText(/simulation name/i), { target: { value: 'Custom setup' } });
    fireEvent.change(screen.getByLabelText(/^seed \(optional\)$/i), { target: { value: 'abc-seed' } });
    fireEvent.change(screen.getByLabelText(/world width/i), { target: { value: '1200' } });
    fireEvent.change(screen.getByLabelText(/mutation rate/i), { target: { value: '0.33' } });

    fireEvent.click(screen.getByRole('button', { name: /use defaults/i }));

    expect(screen.getByLabelText(/simulation name/i)).toHaveValue('New Simulation');
    expect(screen.getByLabelText(/^seed \(optional\)$/i)).toHaveValue('');
    expect(screen.getByLabelText(/world width/i)).toHaveValue(800);
    expect(screen.getByLabelText(/mutation rate/i)).toHaveValue(0.05);
  });

  it('keeps saved draft intact when using defaults in the form', () => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({
      name: 'Draft Simulation',
      seed: 'draft-seed',
      worldWidth: 999,
      worldHeight: 600,
      initialPopulation: 40,
      minimumPopulation: 30,
      initialFoodCount: 60,
      foodSpawnChance: 0.2,
      foodEnergyValue: 7,
      maxFood: 200,
      mutationRate: 0.15,
      mutationStrength: 0.25
    }));

    const { unmount } = render(<App />);

    expect(screen.getByLabelText(/simulation name/i)).toHaveValue('Draft Simulation');

    fireEvent.click(screen.getByRole('button', { name: /use defaults/i }));
    expect(screen.getByLabelText(/simulation name/i)).toHaveValue('New Simulation');

    unmount();
    render(<App />);
    expect(screen.getByLabelText(/simulation name/i)).toHaveValue('Draft Simulation');
  });

  it('tracks dirty setup fields and clears dirty state when values are reverted', () => {
    render(<App />);

    expect(screen.queryByText(/unsaved setup changes in:/i)).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/world width/i), { target: { value: '900' } });
    expect(screen.getByText(/unsaved setup changes in: worldWidth\./i)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/world width/i), { target: { value: '800' } });
    expect(screen.queryByText(/unsaved setup changes in:/i)).not.toBeInTheDocument();
  });

  it('prompts before discarding dirty setup form changes when resuming a saved simulation', async () => {
    window.confirm.mockReturnValue(false);
    render(<App />);

    fireEvent.change(screen.getByLabelText(/world width/i), { target: { value: '950' } });

    const savedSimulationsPanel = await screen.findByRole('region', { name: /saved simulations/i });
    const resumeButton = await within(savedSimulationsPanel).findByRole('button', { name: /^resume$/i });
    fireEvent.click(resumeButton);

    expect(window.confirm).toHaveBeenCalledWith('You have unsaved setup changes. Discard them and continue?');
    expect(screen.getByText(/load cancelled\./i)).toBeInTheDocument();
  });

  it('prompts before discarding dirty run changes when starting or loading another simulation', async () => {
    window.confirm.mockReturnValue(false);
    render(<App />);

    fireEvent.change(screen.getByLabelText(/^seed \(optional\)$/i), { target: { value: 'dirty-run-seed' } });
    fireEvent.click(screen.getByRole('button', { name: /start simulation/i }));

    await waitFor(() => {
      expect(Number.parseInt(screen.getByText(/^tick count:/i).textContent.replace(/\D+/g, ''), 10)).toBeGreaterThan(0);
    });

    fireEvent.click(screen.getByRole('button', { name: /start simulation/i }));
    expect(window.confirm).toHaveBeenCalledWith('You have unsaved simulation changes for this run. Discard changes and continue?');
    expect(screen.getByText(/start cancelled\./i)).toBeInTheDocument();

    const savedSimulationsPanel = await screen.findByRole('region', { name: /saved simulations/i });
    fireEvent.click(within(savedSimulationsPanel).getByRole('button', { name: /^resume$/i }));
    expect(window.confirm).toHaveBeenCalledWith('You have unsaved simulation changes for this run. Discard changes and continue?');
    expect(screen.getByText(/load cancelled\./i)).toBeInTheDocument();
  });

  it('generates a seed when omitted and persists config', async () => {
    const canReadWriteStorage = (() => {
      const storage = window.localStorage;
      if (!storage || typeof storage.setItem !== 'function' || typeof storage.getItem !== 'function') {
        return false;
      }

      try {
        storage.setItem(STORAGE_KEY, '__probe__');
        const probe = storage.getItem(STORAGE_KEY);
        storage.removeItem(STORAGE_KEY);
        return probe === '__probe__';
      } catch {
        return false;
      }
    })();

    render(<App />);

    fireEvent.change(screen.getByLabelText(/seed/i), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: /start simulation/i }));

    expect(screen.getByText(/resolved seed:/i)).toHaveTextContent('1e240');

    await waitFor(() => {
      const saved = loadSimulationConfig();

      if (!canReadWriteStorage) {
        expect(saved).toBeNull();
        return;
      }

      expect(saved).toMatchObject({
        name: 'New Simulation',
        resolvedSeed: '1e240'
      });
    });
  });

  it('shows active seed controls and supports copy/regenerate/restart interactions', async () => {
    let regenerateCounter = 0;

    vi.spyOn(globalThis.crypto, 'getRandomValues').mockImplementation((array) => {
      regenerateCounter += 1;
      array[0] = regenerateCounter === 1 ? 111111 : 222222;
      return array;
    });

    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: /start simulation/i }));

    expect(screen.getByText(/^active seed:/i)).toHaveTextContent('Active seed: 1b207');

    const tickNode = screen.getByText(/^tick count:/i);
    await waitFor(() => {
      expect(Number.parseInt(tickNode.textContent.replace(/\D+/g, ''), 10)).toBeGreaterThan(0);
    });

    fireEvent.click(screen.getByRole('button', { name: /copy seed/i }));

    await waitFor(() => {
      expect(clipboardWriteText).toHaveBeenCalledWith('1b207');
    });

    fireEvent.click(screen.getByRole('button', { name: /restart from seed/i }));
    expect(window.confirm).toHaveBeenCalledWith(
      'You have unsaved simulation progress. Restarting now will reset to tick 0 and keep the current seed. Continue?'
    );
    expect(screen.getByText(/^active seed:/i)).toHaveTextContent('Active seed: 1b207');
    expect(tickNode).toHaveTextContent('Tick count: 0');

    await waitFor(() => {
      expect(Number.parseInt(tickNode.textContent.replace(/\D+/g, ''), 10)).toBeGreaterThan(0);
    });

    fireEvent.click(screen.getByRole('button', { name: /regenerate seed \+ restart/i }));
    expect(window.confirm).toHaveBeenCalledWith(
      'You have unsaved simulation progress. Regenerating will create a new seed and reset to tick 0. Continue?'
    );
    expect(screen.getByText(/^active seed:/i)).toHaveTextContent('Active seed: 3640e');
    expect(tickNode).toHaveTextContent('Tick count: 0');
  });

  it('cancels restart and regenerate flows when unsaved-progress confirmation is declined', async () => {
    let regenerateCounter = 0;

    vi.spyOn(globalThis.crypto, 'getRandomValues').mockImplementation((array) => {
      regenerateCounter += 1;
      array[0] = regenerateCounter === 1 ? 333333 : 444444;
      return array;
    });

    window.confirm.mockReturnValue(false);

    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: /start simulation/i }));
    const tickNode = screen.getByText(/^tick count:/i);

    await waitFor(() => {
      expect(Number.parseInt(tickNode.textContent.replace(/\D+/g, ''), 10)).toBeGreaterThan(0);
    });

    fireEvent.click(screen.getByRole('button', { name: /restart from seed/i }));
    expect(screen.getByText(/^active seed:/i)).toHaveTextContent('Active seed: 51615');
    expect(Number.parseInt(tickNode.textContent.replace(/\D+/g, ''), 10)).toBeGreaterThan(0);
    expect(screen.getByText(/restart cancelled\./i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /regenerate seed \+ restart/i }));
    expect(screen.getByText(/^active seed:/i)).toHaveTextContent('Active seed: 51615');
    expect(Number.parseInt(tickNode.textContent.replace(/\D+/g, ''), 10)).toBeGreaterThan(0);
    expect(screen.getByText(/seed regeneration cancelled\./i)).toBeInTheDocument();
  });

  it('restart from seed clears selection and restores default playback controls', async () => {
    vi.useFakeTimers();
    render(<App />);

    fireEvent.change(screen.getByLabelText(/^seed \(optional\)$/i), { target: { value: 'restart-selection-seed' } });
    fireEvent.click(screen.getByRole('button', { name: /start simulation/i }));
    fireEvent.click(screen.getByRole('button', { name: /^pause$/i }));

    const deterministicConfig = normalizeSimulationConfig(
      {
        name: 'Restart selection test',
        seed: 'restart-selection-seed',
        worldWidth: 800,
        worldHeight: 480,
        initialPopulation: 20,
        minimumPopulation: 15,
        initialFoodCount: 40,
        foodSpawnChance: 0.03,
        foodEnergyValue: 20,
        maxFood: 250
      },
      'restart-selection-seed'
    );

    const initialWorld = createInitialWorldFromConfig(deterministicConfig);
    const selectedFixture = initialWorld.organisms[0];
    expect(selectedFixture).toBeTruthy();

    const canvas = screen.getByLabelText(/simulation world/i);
    vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      width: 800,
      height: 480,
      right: 800,
      bottom: 480,
      toJSON: () => ({})
    });

    fireEvent.click(canvas, { clientX: selectedFixture.x, clientY: selectedFixture.y });
    const inspector = screen.getByRole('region', { name: /organism inspector/i });
    expect(inspector).toHaveTextContent(`ID: ${selectedFixture.id}`);

    fireEvent.click(screen.getByRole('button', { name: /^5x$/i }));
    fireEvent.click(screen.getByRole('button', { name: /restart from seed/i }));

    expect(screen.getByRole('heading', { name: /no organism selected/i })).toBeInTheDocument();
    expect(screen.getByText(/select an organism to view deterministic inspector details\./i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^pause$/i })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: /^1x$/i })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText(/^tick count:/i)).toHaveTextContent('Tick count: 0');

    vi.useRealTimers();
  });

  it('switches inspector layout mode between desktop and compact on breakpoint changes', () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: 1200 });
    render(<App />);

    fireEvent.change(screen.getByLabelText(/^seed \(optional\)$/i), { target: { value: 'inspector-layout-seed' } });
    fireEvent.click(screen.getByRole('button', { name: /start simulation/i }));
    fireEvent.click(screen.getByRole('button', { name: /^pause$/i }));

    const deterministicConfig = normalizeSimulationConfig(
      {
        name: 'Inspector layout test',
        seed: 'inspector-layout-seed',
        worldWidth: 800,
        worldHeight: 480,
        initialPopulation: 20,
        minimumPopulation: 15,
        initialFoodCount: 40,
        foodSpawnChance: 0.03,
        foodEnergyValue: 20,
        maxFood: 250
      },
      'inspector-layout-seed'
    );

    const initialWorld = createInitialWorldFromConfig(deterministicConfig);
    const selectedFixture = initialWorld.organisms[0];
    const canvas = screen.getByLabelText(/simulation world/i);
    vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      width: 800,
      height: 480,
      right: 800,
      bottom: 480,
      toJSON: () => ({})
    });

    fireEvent.click(canvas, { clientX: selectedFixture.x, clientY: selectedFixture.y });

    const inspector = screen.getByRole('region', { name: /organism inspector/i });
    const layout = inspector.querySelector('.inspector-sections-layout');
    expect(layout).toHaveAttribute('data-layout-mode', 'desktop');

    act(() => {
      window.innerWidth = 900;
      window.dispatchEvent(new Event('resize'));
    });

    expect(layout).toHaveAttribute('data-layout-mode', 'compact');
  });

  it('shows critical inspector stats including food distance while selected', () => {
    render(<App />);

    fireEvent.change(screen.getByLabelText(/^seed \(optional\)$/i), { target: { value: 'inspector-critical-stats-seed' } });
    fireEvent.click(screen.getByRole('button', { name: /start simulation/i }));
    fireEvent.click(screen.getByRole('button', { name: /^pause$/i }));

    const deterministicConfig = normalizeSimulationConfig(
      {
        name: 'Inspector critical stats test',
        seed: 'inspector-critical-stats-seed',
        worldWidth: 800,
        worldHeight: 480,
        initialPopulation: 20,
        minimumPopulation: 15,
        initialFoodCount: 40,
        foodSpawnChance: 0.03,
        foodEnergyValue: 20,
        maxFood: 250
      },
      'inspector-critical-stats-seed'
    );

    const initialWorld = createInitialWorldFromConfig(deterministicConfig);
    const selectedFixture = initialWorld.organisms[0];
    const canvas = screen.getByLabelText(/simulation world/i);
    vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      width: 800,
      height: 480,
      right: 800,
      bottom: 480,
      toJSON: () => ({})
    });

    fireEvent.click(canvas, { clientX: selectedFixture.x, clientY: selectedFixture.y });

    const lineageRow = screen.getByRole('region', { name: /inspector lineage row/i });
    expect(lineageRow).toHaveTextContent(/generation:/i);
    expect(lineageRow).toHaveTextContent(/parent:/i);
    expect(lineageRow).toHaveTextContent(/offspring:/i);
    expect(lineageRow).toHaveTextContent(/parent:\s*—/i);
    expect(lineageRow).toHaveTextContent(/offspring:\s*—/i);

    const criticalStats = screen.getByRole('region', { name: /inspector critical stats/i });
    expect(criticalStats).toHaveTextContent(/energy:/i);
    expect(criticalStats).toHaveTextContent(/age:/i);
    expect(criticalStats).toHaveTextContent(/generation:/i);
    expect(criticalStats).toHaveTextContent(/food distance:/i);
  });

  it('shows actionable validation errors for invalid ranges', () => {
    render(<App />);

    fireEvent.change(screen.getByLabelText(/world width/i), { target: { value: '20' } });
    fireEvent.change(screen.getByLabelText(/max food/i), { target: { value: '1' } });
    fireEvent.change(screen.getByLabelText(/initial food count/i), { target: { value: '20' } });
    fireEvent.change(screen.getByLabelText(/mutation rate/i), { target: { value: '2' } });
    fireEvent.click(screen.getByRole('button', { name: /start simulation/i }));

    expect(screen.getByText(/world width must be between 100 and 3000/i)).toBeInTheDocument();
    expect(screen.getByText(/max food must be greater than or equal to initial food count/i)).toBeInTheDocument();
    expect(screen.getByText(/mutation rate must be between 0 and 1/i)).toBeInTheDocument();
  });

  it('supports pause/resume and runtime speed control transitions', () => {
    vi.useFakeTimers();
    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: /start simulation/i }));

    const pauseButton = screen.getByRole('button', { name: /^pause$/i });
    const resumeButton = screen.getByRole('button', { name: /^resume$/i });
    const speedPresets = screen.getByRole('group', { name: /speed presets/i });
    const speed1x = screen.getByRole('button', { name: /^1x$/i });
    const speed2x = screen.getByRole('button', { name: /^2x$/i });
    const speed5x = screen.getByRole('button', { name: /^5x$/i });
    const speed10x = screen.getByRole('button', { name: /^10x$/i });
    const tickNode = screen.getByText(/^tick count:/i);
    const readTick = () => Number.parseInt(tickNode.textContent.replace(/\D+/g, ''), 10);

    expect(speedPresets).toBeInTheDocument();
    expect(screen.getByText(/runtime state: running at 1x/i)).toBeInTheDocument();
    expect(speed1x).toHaveClass('speed-preset-button', 'is-active');
    expect(speed1x).toHaveAttribute('aria-pressed', 'true');
    expect(speed2x).toHaveAttribute('aria-pressed', 'false');
    expect(speed5x).toHaveAttribute('aria-pressed', 'false');
    expect(speed10x).toHaveAttribute('aria-pressed', 'false');

    fireEvent.click(speed5x);
    expect(screen.getByText(/runtime state: running at 5x/i)).toBeInTheDocument();
    expect(speed5x).toHaveClass('speed-preset-button', 'is-active');
    expect(speed5x).toHaveAttribute('aria-pressed', 'true');
    expect(speed1x).not.toHaveClass('is-active');
    expect(speed1x).toHaveAttribute('aria-pressed', 'false');

    fireEvent.click(pauseButton);
    const pausedTick = readTick();
    expect(screen.getByRole('button', { name: /^pause$/i })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText(/runtime state: paused/i)).toBeInTheDocument();
    expect(speed5x).not.toHaveClass('is-active');
    expect(speed5x).toHaveAttribute('aria-pressed', 'false');

    act(() => {
      vi.advanceTimersByTime(250);
    });
    expect(readTick()).toBe(pausedTick);

    fireEvent.click(resumeButton);
    expect(screen.getByText(/runtime state: running at 5x/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^pause$/i })).toHaveAttribute('aria-pressed', 'false');

    fireEvent.click(speed2x);
    expect(screen.getByText(/runtime state: running at 2x/i)).toBeInTheDocument();
    expect(speed2x).toHaveClass('speed-preset-button', 'is-active');
    expect(speed2x).toHaveAttribute('aria-pressed', 'true');

    vi.useRealTimers();
  });

  it('renders deterministic run metadata and copies a stable payload', async () => {
    render(<App />);

    fireEvent.change(screen.getByLabelText(/seed/i), { target: { value: 'meta-seed' } });
    fireEvent.click(screen.getByRole('button', { name: /start simulation/i }));

    const runMetadataPanel = screen.getByRole('region', { name: /run metadata panel/i });
    expect(within(runMetadataPanel).getByText(/^seed:/i)).toHaveTextContent('Seed: meta-seed');
    expect(within(runMetadataPanel).getByText(/^speed multiplier:/i)).toHaveTextContent('Speed multiplier: 1x');
    expect(within(runMetadataPanel).getByText(/^snapshot id:/i)).toHaveTextContent('Snapshot ID: No snapshot');

    await waitFor(() => {
      const tickValue = Number.parseInt(screen.getByText(/^current tick:/i).textContent.replace(/\D+/g, ''), 10);
      expect(tickValue).toBeGreaterThan(0);
    });

    fireEvent.click(screen.getByRole('button', { name: /^5x$/i }));
    expect(screen.getByText(/^speed multiplier:/i)).toHaveTextContent('Speed multiplier: 5x');

    const tickValue = Number.parseInt(screen.getByText(/^current tick:/i).textContent.replace(/\D+/g, ''), 10);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /copy metadata payload/i }));
    });

    expect(clipboardWriteText).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/metadata copied\./i)).toBeInTheDocument();

    const copiedPayload = clipboardWriteText.mock.calls[0][0];
    expect(copiedPayload).toBe(
      `{"seed":"meta-seed","tickCount":${tickValue},"speedMultiplier":"5x","snapshotId":"No snapshot"}`
    );
  });

  it('loads a saved snapshot and shows active snapshot metadata', async () => {
    render(<App />);

    const savedRegion = await screen.findByRole('region', { name: /saved simulations/i });
    expect(within(savedRegion).getByText(/seed fixture-seed/i)).toBeInTheDocument();
    expect(within(savedRegion).getByText(/tick 0/i)).toBeInTheDocument();
    expect(within(savedRegion).getByText(/population metadata unavailable/i)).toBeInTheDocument();
    fireEvent.click(within(savedRegion).getByRole('button', { name: /^resume$/i }));

    await waitFor(() => {
      expect(screen.getByText(/active snapshot:/i)).toHaveTextContent('Fixture snapshot');
      expect(screen.getByText(/^tick count:/i)).toHaveTextContent('Tick count: 0');
      expect(screen.getByText(/loaded\./i)).toBeInTheDocument();
      const runMetadataPanel = screen.getByRole('region', { name: /run metadata panel/i });
      expect(within(runMetadataPanel).getByText(/^seed: fixture-seed$/i)).toBeInTheDocument();
      expect(within(runMetadataPanel).getByText(/^snapshot id: sim-fixture$/i)).toBeInTheDocument();
    });
  });

  it('renders deterministic fallback metadata and disables resume for invalid saved rows', async () => {
    globalThis.fetch.mockImplementation(async (url, options = {}) => {
      if (url === '/api/simulations/snapshots' && (!options.method || options.method === 'GET')) {
        return {
          ok: true,
          status: 200,
          json: async () => ([
            {
              id: 'sim-invalid',
              name: 'Corrupt metadata',
              seed: '',
              tickCount: -1,
              updatedAt: '2026-03-06T12:00:01.000Z'
            }
          ])
        };
      }

      if (String(url).startsWith('/api/simulations/snapshots/')) {
        return { ok: true, status: 200, json: async () => ({}) };
      }

      return { ok: false, status: 404, json: async () => ({}) };
    });

    render(<App />);

    const savedRegion = await screen.findByRole('region', { name: /saved simulations/i });
    expect(within(savedRegion).getByText(/seed metadata unavailable/i)).toBeInTheDocument();
    expect(within(savedRegion).getByText(/tick metadata unavailable/i)).toBeInTheDocument();
    expect(within(savedRegion).getByRole('button', { name: /^resume$/i })).toBeDisabled();
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  it('locks per-save resume actions while a snapshot load request is in flight', async () => {
    let resolveSnapshot;
    const snapshotPromise = new Promise((resolve) => {
      resolveSnapshot = resolve;
    });

    globalThis.fetch.mockImplementation(async (url, options = {}) => {
      if (url === '/api/simulations/snapshots' && (!options.method || options.method === 'GET')) {
        return {
          ok: true,
          status: 200,
          json: async () => ([{ id: 'sim-fixture', name: 'Fixture snapshot', updatedAt: '2026-03-06T12:00:01.000Z' }])
        };
      }

      if (String(url).startsWith('/api/simulations/snapshots/sim-fixture') && (!options.method || options.method === 'GET')) {
        const snapshot = await snapshotPromise;
        return {
          ok: true,
          status: 200,
          json: async () => snapshot
        };
      }

      return { ok: false, status: 404, json: async () => ({}) };
    });

    render(<App />);

    const savedRegion = await screen.findByRole('region', { name: /saved simulations/i });
    const resumeButton = within(savedRegion).getByRole('button', { name: /^resume$/i });

    fireEvent.click(resumeButton);

    expect(within(savedRegion).getByRole('button', { name: /loading…/i })).toBeDisabled();
    expect(globalThis.fetch).toHaveBeenCalledWith(
      '/api/simulations/snapshots/sim-fixture',
      expect.objectContaining({ method: 'GET' })
    );

    fireEvent.click(within(savedRegion).getByRole('button', { name: /loading…/i }));

    expect(globalThis.fetch).toHaveBeenCalledTimes(2);

    resolveSnapshot({
      id: 'sim-fixture',
      name: 'Fixture snapshot',
      updatedAt: '2026-03-06T12:00:01.000Z',
      seed: 'fixture-seed',
      tickCount: 0,
      rngState: createSeededPrng('fixture-seed').state,
      worldState: createInitialWorldFromConfig(normalizeSimulationConfig({
        name: 'Fixture snapshot',
        seed: 'fixture-seed',
        worldWidth: 800,
        worldHeight: 600,
        initialPopulation: 12,
        minimumPopulation: 12,
        initialFoodCount: 30,
        foodSpawnChance: 0.04,
        foodEnergyValue: 5,
        maxFood: 120
      }, 'fixture-seed')),
      parameters: toEngineStepParams(normalizeSimulationConfig({
        name: 'Fixture snapshot',
        seed: 'fixture-seed',
        worldWidth: 800,
        worldHeight: 600,
        initialPopulation: 12,
        minimumPopulation: 12,
        initialFoodCount: 30,
        foodSpawnChance: 0.04,
        foodEnergyValue: 5,
        maxFood: 120
      }, 'fixture-seed'))
    });

    await waitFor(() => {
      expect(screen.getByText(/loaded\./i)).toBeInTheDocument();
      expect(within(savedRegion).getByRole('button', { name: /^resume$/i })).toBeEnabled();
    });
  });

  it('renders saved-card population metadata from persisted snapshot payload when available', async () => {
    globalThis.fetch.mockImplementation(async (url, options = {}) => {
      if (url === '/api/simulations/snapshots' && (!options.method || options.method === 'GET')) {
        return {
          ok: true,
          status: 200,
          json: async () => ([
            {
              id: 'sim-pop',
              name: 'Population fixture',
              seed: 'seed-pop',
              tickCount: 44,
              updatedAt: '2026-03-06T12:00:01.000Z',
              worldState: {
                organisms: [{ id: 'o1' }, { id: 'o2' }, { id: 'o3' }, { id: 'o4' }]
              },
              parameters: {
                worldWidth: 800,
                worldHeight: 480,
                initialPopulation: 20,
                maxFood: 120
              }
            }
          ])
        };
      }

      if (String(url).startsWith('/api/simulations/snapshots/')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ id: 'sim-pop' })
        };
      }

      return { ok: true, status: 200, json: async () => ({}) };
    });

    render(<App />);

    const savedRegion = await screen.findByRole('region', { name: /saved simulations/i });
    expect(within(savedRegion).getByText(/population 4/i)).toBeInTheDocument();
    expect(within(savedRegion).getByText(/config 800x480 · init pop 20 · max food 120/i)).toBeInTheDocument();
  });

  it('renders saved-simulations error state when list request fails', async () => {
    globalThis.fetch.mockImplementation(async (url, options = {}) => {
      if (url === '/api/simulations/snapshots' && (!options.method || options.method === 'GET')) {
        return { ok: false, status: 500, json: async () => ({}) };
      }

      return { ok: false, status: 404, json: async () => ({}) };
    });

    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/unable to load saved simulations/i);
      expect(screen.getByText(/saved simulations unavailable/i)).toBeInTheDocument();
    });
  });

  it('supports deterministic replay tick jumps from a loaded snapshot and only resumes when explicit', async () => {
    render(<App />);

    const savedRegion = await screen.findByRole('region', { name: /saved simulations/i });
    fireEvent.click(within(savedRegion).getByRole('button', { name: /^resume$/i }));

    await waitFor(() => {
      const summaryRegion = screen.getByRole('region', { name: /replay session summary strip/i });
      expect(summaryRegion).toBeInTheDocument();
      expect(screen.getByRole('region', { name: /replay timeline controls/i })).toBeInTheDocument();
      expect(screen.getByText(/^tick count:/i)).toHaveTextContent('Tick count: 0');
      expect(within(summaryRegion).getByText(/^seed: fixture-seed$/i)).toBeInTheDocument();
      expect(within(summaryRegion).getByText(/^simulation: fixture snapshot$/i)).toBeInTheDocument();
      expect(within(summaryRegion).getByText(/^simulation id: sim-fixture$/i)).toBeInTheDocument();
      expect(within(summaryRegion).getByText(/^captured tick range: 0 → 0$/i)).toBeInTheDocument();
      expect(within(summaryRegion).getByText(/^total replay duration \(ticks\): 0$/i)).toBeInTheDocument();
      expect(within(summaryRegion).getByText(/^deterministic context: context match$/i)).toBeInTheDocument();
      expect(within(summaryRegion).getByText(/^simulation version: snn-sandbox-v1$/i)).toBeInTheDocument();
      expect(within(summaryRegion).getByText(/^parameter fingerprint:/i)).toBeInTheDocument();
      expect(within(summaryRegion).getByRole('button', { name: /copy deterministic context/i })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /jump to first mismatch/i })).not.toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /copy deterministic context/i }));
    await waitFor(() => {
      expect(clipboardWriteText).toHaveBeenCalledTimes(1);
    });
    expect(clipboardWriteText.mock.calls[0][0]).toContain('seed=fixture-seed');
    expect(clipboardWriteText.mock.calls[0][0]).toContain('simulationVersion=snn-sandbox-v1');
    await waitFor(() => {
      expect(screen.getByText(/deterministic context copied\./i)).toBeInTheDocument();
    });

    const tickNode = screen.getByText(/^tick count:/i);
    const jumpInput = screen.getByLabelText(/jump to tick/i);
    const scrubber = screen.getByRole('slider', { name: /replay timeline scrubber/i });

    expect(scrubber).toHaveAttribute('min', '0');
    expect(scrubber).toHaveAttribute('max', '0');

    fireEvent.change(jumpInput, { target: { value: '20' } });
    fireEvent.click(screen.getByRole('button', { name: /^jump$/i }));
    expect(tickNode).toHaveTextContent('Tick count: 20');
    expect(scrubber).toHaveAttribute('max', '20');

    fireEvent.change(scrubber, { target: { value: '7' } });
    expect(tickNode).toHaveTextContent('Tick count: 7');
    expect(jumpInput).toHaveValue(7);
    const summaryRegion = screen.getByRole('region', { name: /replay session summary strip/i });
    expect(within(summaryRegion).getByText(/^captured tick range: 0 → 7$/i)).toBeInTheDocument();
    expect(within(summaryRegion).getByText(/^total replay duration \(ticks\): 7$/i)).toBeInTheDocument();

    const originalCreateObjectURL = URL.createObjectURL;
    const originalRevokeObjectURL = URL.revokeObjectURL;
    URL.createObjectURL = vi.fn(() => 'blob:test');
    URL.revokeObjectURL = vi.fn(() => {});
    const click = vi.fn();
    const createElement = vi.spyOn(document, 'createElement').mockReturnValue({
      click,
      set href(value) {
        this._href = value;
      },
      set download(value) {
        this._download = value;
      }
    });

    fireEvent.click(screen.getByRole('button', { name: /export snapshot/i }));

    expect(screen.getByText(/replay snapshot exported\./i)).toBeInTheDocument();
    expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
    expect(click).toHaveBeenCalledTimes(1);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:test');

    URL.createObjectURL = originalCreateObjectURL;
    URL.revokeObjectURL = originalRevokeObjectURL;
    createElement.mockRestore();

    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(tickNode).toHaveTextContent('Tick count: 7');

    fireEvent.click(screen.getByRole('button', { name: /resume live from selected tick/i }));

    await waitFor(() => {
      expect(Number.parseInt(tickNode.textContent.replace(/\D+/g, ''), 10)).toBeGreaterThan(7);
    });
  });

  it('saves, applies, and deletes replay comparison presets using deterministic payloads only', async () => {
    render(<App />);

    const savedRegion = await screen.findByRole('region', { name: /saved simulations/i });
    fireEvent.click(within(savedRegion).getByRole('button', { name: /^resume$/i }));

    const presetsRegion = await screen.findByRole('region', { name: /replay comparison presets/i });

    fireEvent.change(within(presetsRegion).getByLabelText(/preset name/i), { target: { value: 'Fixture deterministic preset' } });
    fireEvent.click(within(presetsRegion).getByRole('button', { name: /save preset/i }));

    await waitFor(() => {
      expect(screen.getByText(/replay comparison preset saved\./i)).toBeInTheDocument();
      expect(screen.getByText(/fixture deterministic preset — seed fixture-seed/i)).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText(/^world width$/i), { target: { value: '999' } });
    fireEvent.change(screen.getByLabelText(/^seed \(optional\)$/i), { target: { value: 'override-seed' } });

    fireEvent.click(within(presetsRegion).getByRole('button', { name: /^apply$/i }));

    expect(screen.getByLabelText(/^world width$/i)).toHaveValue(800);
    expect(screen.getByLabelText(/^seed \(optional\)$/i)).toHaveValue('fixture-seed');

    fireEvent.click(within(presetsRegion).getByRole('button', { name: /^delete$/i }));

    await waitFor(() => {
      expect(screen.getByText(/deleted preset: fixture deterministic preset\./i)).toBeInTheDocument();
      expect(screen.getByText(/no replay comparison presets saved yet\./i)).toBeInTheDocument();
    });

    expect(loadReplayComparisonPresets(window.localStorage)).toEqual([]);
  });

  it('shows first-mismatch jump control when mismatch location is available and jumps deterministically', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url, options = {}) => {
      if (url === '/api/simulations/snapshots' && (!options.method || options.method === 'GET')) {
        return {
          ok: true,
          status: 200,
          json: async () => ([{ id: 'sim-mismatch', name: 'Mismatch snapshot', updatedAt: '2026-03-06T12:00:01.000Z' }])
        };
      }

      if (String(url).startsWith('/api/simulations/snapshots/')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            id: 'sim-mismatch',
            name: 'Mismatch snapshot',
            seed: 'fixture-seed',
            mismatchDetected: true,
            firstMismatchTick: 12,
            parameters: {
              name: 'Fixture',
              seed: 'fixture-seed',
              resolvedSeed: 'fixture-seed',
              worldWidth: 800,
              worldHeight: 480,
              initialPopulation: 12,
              initialFoodCount: 30,
              foodSpawnChance: 0.04,
              foodEnergyValue: 5,
              maxFood: 120
            },
            tickCount: 0,
            rngState: 123,
            worldState: createInitialWorldFromConfig(normalizeSimulationConfig({
              name: 'Fixture',
              seed: 'fixture-seed',
              worldWidth: 800,
              worldHeight: 480,
              initialPopulation: 12,
              initialFoodCount: 30,
              foodSpawnChance: 0.04,
              foodEnergyValue: 5,
              maxFood: 120
            }, 'fixture-seed'))
          })
        };
      }

      return { ok: false, status: 404, json: async () => ({}) };
    }));

    render(<App />);

    const savedRegion = await screen.findByRole('region', { name: /saved simulations/i });
    fireEvent.click(within(savedRegion).getByRole('button', { name: /^resume$/i }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /jump to first mismatch/i })).toBeEnabled();
    });

    fireEvent.click(screen.getByRole('button', { name: /jump to first mismatch/i }));

    expect(screen.getByText(/^tick count:/i)).toHaveTextContent('Tick count: 12');
    expect(screen.getByLabelText(/jump to tick/i)).toHaveValue(12);
    expect(screen.getByText(/jumped to first mismatch tick\./i)).toBeInTheDocument();
  });

  it('disables first-mismatch jump control when mismatch location is unavailable', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url, options = {}) => {
      if (url === '/api/simulations/snapshots' && (!options.method || options.method === 'GET')) {
        return {
          ok: true,
          status: 200,
          json: async () => ([{ id: 'sim-mismatch-no-tick', name: 'Mismatch without tick', updatedAt: '2026-03-06T12:00:01.000Z' }])
        };
      }

      if (String(url).startsWith('/api/simulations/snapshots/')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            id: 'sim-mismatch-no-tick',
            name: 'Mismatch without tick',
            seed: 'fixture-seed',
            mismatchDetected: true,
            parameters: {
              name: 'Fixture',
              seed: 'fixture-seed',
              resolvedSeed: 'fixture-seed',
              worldWidth: 800,
              worldHeight: 480,
              initialPopulation: 12,
              initialFoodCount: 30,
              foodSpawnChance: 0.04,
              foodEnergyValue: 5,
              maxFood: 120
            },
            tickCount: 0,
            rngState: 123,
            worldState: createInitialWorldFromConfig(normalizeSimulationConfig({
              name: 'Fixture',
              seed: 'fixture-seed',
              worldWidth: 800,
              worldHeight: 480,
              initialPopulation: 12,
              initialFoodCount: 30,
              foodSpawnChance: 0.04,
              foodEnergyValue: 5,
              maxFood: 120
            }, 'fixture-seed'))
          })
        };
      }

      return { ok: false, status: 404, json: async () => ({}) };
    }));

    render(<App />);

    const savedRegion = await screen.findByRole('region', { name: /saved simulations/i });
    fireEvent.click(within(savedRegion).getByRole('button', { name: /^resume$/i }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /jump to first mismatch/i })).toBeDisabled();
    });
  });

  it('shows mismatch details panel with deterministic values when mismatch context exists', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url, options = {}) => {
      if (url === '/api/simulations/snapshots' && (!options.method || options.method === 'GET')) {
        return {
          ok: true,
          status: 200,
          json: async () => ([{ id: 'sim-mismatch-details', name: 'Mismatch details snapshot', updatedAt: '2026-03-06T12:00:01.000Z' }])
        };
      }

      if (String(url).startsWith('/api/simulations/snapshots/')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            id: 'sim-mismatch-details',
            name: 'Mismatch details snapshot',
            seed: 'fixture-seed',
            parameters: {
              name: 'Fixture',
              seed: 'fixture-seed',
              resolvedSeed: 'fixture-seed',
              worldWidth: 800,
              worldHeight: 480,
              initialPopulation: 12,
              initialFoodCount: 30,
              foodSpawnChance: 0.04,
              foodEnergyValue: 5,
              maxFood: 120
            },
            tickCount: 0,
            rngState: 123,
            comparison: {
              mismatchDetected: true,
              firstMismatchTick: 12,
              firstMismatch: {
                entityId: 'org-7',
                path: 'organisms[7].energyState',
                baselineValue: 'feeding',
                comparisonValue: 'moving'
              }
            },
            worldState: createInitialWorldFromConfig(normalizeSimulationConfig({
              name: 'Fixture',
              seed: 'fixture-seed',
              worldWidth: 800,
              worldHeight: 480,
              initialPopulation: 12,
              initialFoodCount: 30,
              foodSpawnChance: 0.04,
              foodEnergyValue: 5,
              maxFood: 120
            }, 'fixture-seed'))
          })
        };
      }

      return { ok: false, status: 404, json: async () => ({}) };
    }));

    render(<App />);

    const savedRegion = await screen.findByRole('region', { name: /saved simulations/i });
    fireEvent.click(within(savedRegion).getByRole('button', { name: /^resume$/i }));

    await waitFor(() => {
      expect(screen.getByRole('region', { name: /replay mismatch details/i })).toBeInTheDocument();
    });

    expect(screen.getByText(/first mismatch tick: 12/i)).toBeInTheDocument();
    expect(screen.getByText(/entity id: org-7/i)).toBeInTheDocument();
    expect(screen.getByText(/compared key\/path: organisms\[7\]\.energystate/i)).toBeInTheDocument();
    expect(screen.getByText(/baseline value: feeding/i)).toBeInTheDocument();
    expect(screen.getByText(/comparison value: moving/i)).toBeInTheDocument();
    expect(screen.getByText(/absolute delta: n\/a/i)).toBeInTheDocument();
  });

  it('copies deterministic mismatch report payload from mismatch details panel', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url, options = {}) => {
      if (url === '/api/simulations/snapshots' && (!options.method || options.method === 'GET')) {
        return {
          ok: true,
          status: 200,
          json: async () => ([{ id: 'sim-mismatch-copy', name: 'Mismatch copy snapshot', updatedAt: '2026-03-06T12:00:01.000Z' }])
        };
      }

      if (String(url).startsWith('/api/simulations/snapshots/')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            id: 'sim-mismatch-copy',
            name: 'Mismatch copy snapshot',
            seed: 'fixture-seed',
            parameters: {
              name: 'Fixture',
              seed: 'fixture-seed',
              resolvedSeed: 'fixture-seed',
              worldWidth: 800,
              worldHeight: 480,
              initialPopulation: 12,
              initialFoodCount: 30,
              foodSpawnChance: 0.04,
              foodEnergyValue: 5,
              maxFood: 120
            },
            tickCount: 0,
            rngState: 123,
            comparison: {
              mismatchDetected: true,
              firstMismatchTick: 12,
              firstMismatch: {
                entityId: 'org-7',
                path: 'organisms[7].energyState',
                baselineValue: 'feeding',
                comparisonValue: 'moving',
                severity: 'high'
              }
            },
            worldState: createInitialWorldFromConfig(normalizeSimulationConfig({
              name: 'Fixture',
              seed: 'fixture-seed',
              worldWidth: 800,
              worldHeight: 480,
              initialPopulation: 12,
              initialFoodCount: 30,
              foodSpawnChance: 0.04,
              foodEnergyValue: 5,
              maxFood: 120
            }, 'fixture-seed'))
          })
        };
      }

      return { ok: false, status: 404, json: async () => ({}) };
    }));

    render(<App />);

    const savedRegion = await screen.findByRole('region', { name: /saved simulations/i });
    fireEvent.click(within(savedRegion).getByRole('button', { name: /^resume$/i }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /copy mismatch report/i })).toBeEnabled();
    });

    fireEvent.click(screen.getByRole('button', { name: /copy mismatch report/i }));

    await waitFor(() => {
      expect(clipboardWriteText).toHaveBeenCalledTimes(1);
    });

    expect(clipboardWriteText.mock.calls[0][0]).toContain('Replay mismatch report');
    expect(clipboardWriteText.mock.calls[0][0]).toContain('seed: fixture-seed');
    expect(clipboardWriteText.mock.calls[0][0]).toContain('firstMismatchTick: 12');
    expect(screen.getByText(/mismatch report copied\./i)).toBeInTheDocument();
  });

  it('renders mismatch event list and seeks replay tick when an event row is clicked', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url, options = {}) => {
      if (url === '/api/simulations/snapshots' && (!options.method || options.method === 'GET')) {
        return {
          ok: true,
          status: 200,
          json: async () => ([{ id: 'sim-mismatch-events', name: 'Mismatch events snapshot', updatedAt: '2026-03-06T12:00:01.000Z' }])
        };
      }

      if (String(url).startsWith('/api/simulations/snapshots/')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            id: 'sim-mismatch-events',
            name: 'Mismatch events snapshot',
            seed: 'fixture-seed',
            parameters: {
              name: 'Fixture',
              seed: 'fixture-seed',
              resolvedSeed: 'fixture-seed',
              worldWidth: 800,
              worldHeight: 480,
              initialPopulation: 12,
              initialFoodCount: 30,
              foodSpawnChance: 0.04,
              foodEnergyValue: 5,
              maxFood: 120
            },
            tickCount: 0,
            rngState: 123,
            comparison: {
              mismatchDetected: true,
              firstMismatchTick: 12,
              mismatchEvents: [
                { tick: 18, path: 'organisms[2].energy', baselineValue: 9, comparisonValue: 8, severity: 'high' },
                { tick: 12, path: 'organisms[0].age', baselineValue: 3, comparisonValue: 4 }
              ]
            },
            worldState: createInitialWorldFromConfig(normalizeSimulationConfig({
              name: 'Fixture',
              seed: 'fixture-seed',
              worldWidth: 800,
              worldHeight: 480,
              initialPopulation: 12,
              initialFoodCount: 30,
              foodSpawnChance: 0.04,
              foodEnergyValue: 5,
              maxFood: 120
            }, 'fixture-seed'))
          })
        };
      }

      return { ok: false, status: 404, json: async () => ({}) };
    }));

    render(<App />);

    const savedRegion = await screen.findByRole('region', { name: /saved simulations/i });
    fireEvent.click(within(savedRegion).getByRole('button', { name: /^resume$/i }));

    await waitFor(() => {
      expect(screen.getByRole('region', { name: /replay mismatch details/i })).toBeInTheDocument();
    });

    expect(screen.getByText(/tick 12 · organisms\[0\]\.age/i)).toBeInTheDocument();
    expect(screen.getByText(/tick 18 · organisms\[2\]\.energy/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/replay mismatch markers/i)).toBeInTheDocument();
    expect(document.querySelectorAll('.replay-marker')).toHaveLength(2);
    expect(document.querySelectorAll('.replay-marker-active')).toHaveLength(1);
    expect(screen.getByRole('button', { name: /tick 12 · organisms\[0\]\.age/i })).toHaveAttribute('aria-current', 'true');

    fireEvent.click(screen.getByRole('button', { name: /tick 18 · organisms\[2\]\.energy/i }));

    await waitFor(() => {
      expect(screen.getByText(/jumped to mismatch event tick\./i)).toBeInTheDocument();
    });

    const tickInput = screen.getByLabelText(/jump to tick/i);
    expect(tickInput).toHaveValue(18);
    expect(screen.getByRole('button', { name: /tick 18 · organisms\[2\]\.energy/i })).toHaveAttribute('aria-current', 'true');

    fireEvent.change(screen.getByRole('slider', { name: /replay timeline scrubber/i }), { target: { value: '12' } });
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /tick 12 · organisms\[0\]\.age/i })).toHaveAttribute('aria-current', 'true');
    });

    const replaySummaryRegion = screen.getByRole('region', { name: /replay session summary strip/i });
    replaySummaryRegion.focus();
    fireEvent.keyDown(replaySummaryRegion, { key: 'ArrowDown', altKey: true });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /tick 18 · organisms\[2\]\.energy/i })).toHaveAttribute('aria-current', 'true');
    });
    expect(screen.getByLabelText(/jump to tick/i)).toHaveValue(18);
  });

  it('filters mismatch events by type/severity and supports active filter chips', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url, options = {}) => {
      if (url === '/api/simulations/snapshots' && (!options.method || options.method === 'GET')) {
        return {
          ok: true,
          status: 200,
          json: async () => ([{ id: 'sim-mismatch-filter-events', name: 'Mismatch filter snapshot', updatedAt: '2026-03-06T12:00:01.000Z' }])
        };
      }

      if (String(url).startsWith('/api/simulations/snapshots/')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            id: 'sim-mismatch-filter-events',
            name: 'Mismatch filter snapshot',
            seed: 'fixture-seed',
            parameters: {
              name: 'Fixture',
              seed: 'fixture-seed',
              resolvedSeed: 'fixture-seed',
              worldWidth: 800,
              worldHeight: 480,
              initialPopulation: 12,
              initialFoodCount: 30,
              foodSpawnChance: 0.04,
              foodEnergyValue: 5,
              maxFood: 120
            },
            tickCount: 0,
            rngState: 123,
            comparison: {
              mismatchDetected: true,
              firstMismatchTick: 10,
              mismatchEvents: [
                { tick: 11, path: 'organisms[0].brain.state', baselineValue: 1, comparisonValue: 2, severity: 'low' },
                { tick: 12, path: 'organisms[0].brain.input[0]', baselineValue: 1, comparisonValue: 2, severity: 'medium' },
                { tick: 13, path: 'organisms[0].brain.output[0]', baselineValue: 1, comparisonValue: 2, severity: 'high' }
              ]
            },
            worldState: createInitialWorldFromConfig(normalizeSimulationConfig({
              name: 'Fixture',
              seed: 'fixture-seed',
              worldWidth: 800,
              worldHeight: 480,
              initialPopulation: 12,
              initialFoodCount: 30,
              foodSpawnChance: 0.04,
              foodEnergyValue: 5,
              maxFood: 120
            }, 'fixture-seed'))
          })
        };
      }

      return { ok: false, status: 404, json: async () => ({}) };
    }));

    render(<App />);

    const savedRegion = await screen.findByRole('region', { name: /saved simulations/i });
    fireEvent.click(within(savedRegion).getByRole('button', { name: /^resume$/i }));

    await screen.findByRole('region', { name: /replay mismatch details/i });
    expect(screen.getByText(/tick 11 · organisms\[0\]\.brain\.state/i)).toBeInTheDocument();
    expect(screen.getByText(/tick 12 · organisms\[0\]\.brain\.input\[0\]/i)).toBeInTheDocument();
    expect(screen.getByText(/tick 13 · organisms\[0\]\.brain\.output\[0\]/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /type: input/i }));
    expect(screen.getByText(/tick 12 · organisms\[0\]\.brain\.input\[0\]/i)).toBeInTheDocument();
    expect(screen.queryByText(/tick 11 · organisms\[0\]\.brain\.state/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/tick 13 · organisms\[0\]\.brain\.output\[0\]/i)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /type: input ×/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /severity: high/i }));
    expect(screen.getByText(/no mismatch events match active filters\./i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /clear all filters/i }));
    expect(screen.getByText(/tick 11 · organisms\[0\]\.brain\.state/i)).toBeInTheDocument();
    expect(screen.getByText(/tick 12 · organisms\[0\]\.brain\.input\[0\]/i)).toBeInTheDocument();
    expect(screen.getByText(/tick 13 · organisms\[0\]\.brain\.output\[0\]/i)).toBeInTheDocument();
  });

  it('shows deterministic mismatch-event empty state when no mismatch events are provided', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url, options = {}) => {
      if (url === '/api/simulations/snapshots' && (!options.method || options.method === 'GET')) {
        return {
          ok: true,
          status: 200,
          json: async () => ([{ id: 'sim-mismatch-empty-events', name: 'Mismatch empty events snapshot', updatedAt: '2026-03-06T12:00:01.000Z' }])
        };
      }

      if (String(url).startsWith('/api/simulations/snapshots/')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            id: 'sim-mismatch-empty-events',
            name: 'Mismatch empty events snapshot',
            seed: 'fixture-seed',
            parameters: {
              name: 'Fixture',
              seed: 'fixture-seed',
              resolvedSeed: 'fixture-seed',
              worldWidth: 800,
              worldHeight: 480,
              initialPopulation: 12,
              initialFoodCount: 30,
              foodSpawnChance: 0.04,
              foodEnergyValue: 5,
              maxFood: 120
            },
            tickCount: 0,
            rngState: 123,
            comparison: {
              mismatchDetected: true
            },
            worldState: createInitialWorldFromConfig(normalizeSimulationConfig({
              name: 'Fixture',
              seed: 'fixture-seed',
              worldWidth: 800,
              worldHeight: 480,
              initialPopulation: 12,
              initialFoodCount: 30,
              foodSpawnChance: 0.04,
              foodEnergyValue: 5,
              maxFood: 120
            }, 'fixture-seed'))
          })
        };
      }

      return { ok: false, status: 404, json: async () => ({}) };
    }));

    render(<App />);

    const savedRegion = await screen.findByRole('region', { name: /saved simulations/i });
    fireEvent.click(within(savedRegion).getByRole('button', { name: /^resume$/i }));

    const mismatchRegion = await screen.findByRole('region', { name: /replay mismatch details/i });
    expect(within(mismatchRegion).getByText(/no mismatch events available for this replay payload\./i)).toBeInTheDocument();
    expect(within(mismatchRegion).queryByRole('list')).not.toBeInTheDocument();
  });

  it('hides mismatch details panel when runs match', async () => {
    render(<App />);

    const savedRegion = await screen.findByRole('region', { name: /saved simulations/i });
    fireEvent.click(within(savedRegion).getByRole('button', { name: /^resume$/i }));

    await waitFor(() => {
      expect(screen.queryByRole('region', { name: /replay mismatch details/i })).not.toBeInTheDocument();
    });
  });

  it('surfaces per-save recovery actions for invalid/corrupt snapshots and supports retry', async () => {
    let loadAttempts = 0;
    vi.stubGlobal('fetch', vi.fn(async (url, options = {}) => {
      if (url === '/api/simulations/snapshots' && (!options.method || options.method === 'GET')) {
        return {
          ok: true,
          status: 200,
          json: async () => ([{ id: 'sim-bad', name: 'Bad snapshot', updatedAt: '2026-03-06T12:00:01.000Z' }])
        };
      }

      if (String(url).startsWith('/api/simulations/snapshots/') && (!options.method || options.method === 'GET')) {
        loadAttempts += 1;
        if (loadAttempts === 1) {
          return {
            ok: false,
            status: 404,
            json: async () => ({})
          };
        }

        return {
          ok: true,
          status: 200,
          json: async () => ({
            id: 'sim-bad',
            name: 'Bad snapshot',
            seed: 'fixture-seed',
            parameters: {
              name: 'Fixture',
              seed: 'fixture-seed',
              resolvedSeed: 'fixture-seed',
              worldWidth: 800,
              worldHeight: 480,
              initialPopulation: 12,
              minimumPopulation: 12,
              initialFoodCount: 30,
              foodSpawnChance: 0.04,
              foodEnergyValue: 5,
              maxFood: 120
            },
            tickCount: 0,
            rngState: 123,
            worldState: createInitialWorldFromConfig(normalizeSimulationConfig({
              name: 'Fixture',
              seed: 'fixture-seed',
              worldWidth: 800,
              worldHeight: 480,
              initialPopulation: 12,
              minimumPopulation: 12,
              initialFoodCount: 30,
              foodSpawnChance: 0.04,
              foodEnergyValue: 5,
              maxFood: 120
            }, 'fixture-seed'))
          })
        };
      }

      return { ok: false, status: 404, json: async () => ({}) };
    }));

    render(<App />);
    const savedRegion = await screen.findByRole('region', { name: /saved simulations/i });
    fireEvent.click(within(savedRegion).getByRole('button', { name: /^resume$/i }));

    const recoveryAlert = await screen.findByRole('alert');
    expect(recoveryAlert).toHaveTextContent(/snapshot could not be resumed\. retry or delete this save\./i);
    expect(within(recoveryAlert).getByRole('button', { name: /retry/i })).toBeInTheDocument();
    expect(within(recoveryAlert).getByRole('button', { name: /delete broken save/i })).toBeInTheDocument();

    fireEvent.click(within(recoveryAlert).getByRole('button', { name: /retry/i }));

    await waitFor(() => {
      expect(screen.getByText(/loaded\./i)).toBeInTheDocument();
      expect(screen.queryByText(/snapshot could not be resumed\. retry or delete this save\./i)).not.toBeInTheDocument();
    });
  });

  it('allows deleting a broken save from recovery actions', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url, options = {}) => {
      if (url === '/api/simulations/snapshots' && (!options.method || options.method === 'GET')) {
        return {
          ok: true,
          status: 200,
          json: async () => ([{ id: 'sim-bad', name: 'Bad snapshot', updatedAt: '2026-03-06T12:00:01.000Z' }])
        };
      }

      if (String(url).startsWith('/api/simulations/snapshots/') && (!options.method || options.method === 'GET')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ id: 'sim-bad', tickCount: 10, worldState: { tick: 9 } })
        };
      }

      if (String(url).startsWith('/api/simulations/snapshots/') && options.method === 'DELETE') {
        return { ok: true, status: 204, json: async () => ({}) };
      }

      return { ok: false, status: 404, json: async () => ({}) };
    }));

    render(<App />);

    const savedRegion = await screen.findByRole('region', { name: /saved simulations/i });
    fireEvent.click(within(savedRegion).getByRole('button', { name: /^resume$/i }));

    const recoveryAlert = await screen.findByRole('alert');
    fireEvent.click(within(recoveryAlert).getByRole('button', { name: /delete broken save/i }));
    fireEvent.click(await screen.findByRole('button', { name: /confirm delete/i }));

    await waitFor(() => {
      expect(screen.getByText(/deleted\./i)).toBeInTheDocument();
      expect(screen.queryByText(/bad snapshot/i)).not.toBeInTheDocument();
    });
  });

  it('deletes a snapshot after explicit confirmation and updates the list', async () => {
    render(<App />);

    fireEvent.click(await screen.findByRole('button', { name: /^delete$/i }));

    const dialog = await screen.findByRole('dialog', { name: /delete saved simulation confirmation/i });
    expect(within(dialog).getByText(/name: fixture snapshot/i)).toBeInTheDocument();
    expect(within(dialog).getByText(/seed: fixture-seed/i)).toBeInTheDocument();
    expect(within(dialog).getByText(/tick: 0/i)).toBeInTheDocument();
    expect(within(dialog).getByText(/last updated:/i)).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole('button', { name: /confirm delete/i }));

    await waitFor(() => {
      expect(screen.getByText(/deleted\./i)).toBeInTheDocument();
      expect(screen.queryByText(/fixture snapshot/i)).not.toBeInTheDocument();
    });
  });

  it('cancels delete from the confirmation modal without mutating the list', async () => {
    render(<App />);

    fireEvent.click(await screen.findByRole('button', { name: /^delete$/i }));
    fireEvent.click(await screen.findByRole('button', { name: /^cancel$/i }));

    await waitFor(() => {
      expect(screen.getByText(/delete cancelled\./i)).toBeInTheDocument();
      expect(screen.getByText(/fixture snapshot/i)).toBeInTheDocument();
    });
  });

  it('surfaces delete API failures without desyncing the local list', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url, options = {}) => {
      if (url === '/api/simulations/snapshots' && (!options.method || options.method === 'GET')) {
        return {
          ok: true,
          status: 200,
          json: async () => ([{ id: 'sim-fixture', name: 'Fixture snapshot', updatedAt: '2026-03-06T12:00:01.000Z' }])
        };
      }

      if (String(url).startsWith('/api/simulations/snapshots/') && options.method === 'DELETE') {
        return { ok: false, status: 500, json: async () => ({}) };
      }

      if (String(url).startsWith('/api/simulations/snapshots/')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ id: 'sim-fixture', tickCount: 0, worldState: { tick: 0 }, parameters: {} })
        };
      }

      return { ok: false, status: 404, json: async () => ({}) };
    }));

    render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: /^delete$/i }));
    fireEvent.click(await screen.findByRole('button', { name: /confirm delete/i }));

    await waitFor(() => {
      expect(screen.getByText(/failed to delete snapshot\./i)).toBeInTheDocument();
      expect(screen.getByText(/fixture snapshot/i)).toBeInTheDocument();
    });
  });

  it('steps exactly +1 or +10 ticks while paused and keeps step controls disabled while running', () => {
    vi.useFakeTimers();
    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: /start simulation/i }));

    const tickNode = screen.getByText(/^tick count:/i);
    const stepPlusOneButton = screen.getByRole('button', { name: /^step \+1$/i });
    const stepPlusTenButton = screen.getByRole('button', { name: /^step \+10$/i });
    const readTick = () => Number.parseInt(tickNode.textContent.replace(/\D+/g, ''), 10);

    expect(stepPlusOneButton).toBeDisabled();
    expect(stepPlusTenButton).toBeDisabled();

    const stepControl = stepPlusOneButton.closest('.control-with-hint');
    stepControl.focus();
    expect(within(stepControl).getByRole('tooltip')).toHaveTextContent('Pause the simulation to step one tick at a time.');

    fireEvent.click(screen.getByRole('button', { name: /^pause$/i }));
    expect(stepPlusOneButton).toBeEnabled();
    expect(stepPlusTenButton).toBeEnabled();
    expect(stepPlusOneButton.closest('.control-with-hint')).not.toHaveClass('is-disabled');

    const pausedTick = readTick();
    fireEvent.click(stepPlusOneButton);
    expect(readTick()).toBe(pausedTick + 1);

    fireEvent.click(stepPlusTenButton);
    expect(readTick()).toBe(pausedTick + 11);

    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(readTick()).toBe(pausedTick + 11);

    fireEvent.click(screen.getByRole('button', { name: /^1x$/i }));
    expect(stepPlusOneButton).toBeDisabled();
    expect(stepPlusTenButton).toBeDisabled();

    vi.useRealTimers();
  });

  it('shows disable hints for seeded controls when simulation is unavailable', () => {
    render(<App />);

    const restartButton = screen.getByRole('button', { name: /restart from seed/i });
    expect(restartButton).toBeDisabled();

    const restartControl = restartButton.closest('.control-with-hint');
    restartControl.focus();
    const restartHintId = restartControl.getAttribute('aria-describedby');
    expect(document.getElementById(restartHintId)).toHaveTextContent('Start a simulation to enable this control.');

    fireEvent.click(screen.getByRole('button', { name: /start simulation/i }));
    const enabledRestartButton = screen.getByRole('button', { name: /restart from seed/i });
    expect(enabledRestartButton).toBeEnabled();
    expect(enabledRestartButton.closest('.control-with-hint')).not.toHaveClass('is-disabled');
  });

  it('supports playback + inspector keyboard shortcuts and ignores keys while typing', () => {
    vi.useFakeTimers();
    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: /start simulation/i }));

    const tickNode = screen.getByText(/^tick count:/i);
    const readTick = () => Number.parseInt(tickNode.textContent.replace(/\D+/g, ''), 10);

    expect(screen.getByText(/shortcuts: space pause\/play · \. single-step \(paused\) · 1\/2\/3\/4 set speed/i)).toBeInTheDocument();
    expect(screen.getByText(/inspector shortcuts: ←\/↑ previous organism · →\/↓ next organism · p pin\/unpin inspector · \[\/\] section focus · enter toggle section/i)).toBeInTheDocument();
    expect(screen.getByText(/pin mode: disabled/i)).toBeInTheDocument();

    fireEvent.keyDown(window, { key: '3', code: 'Digit3' });
    expect(screen.getByRole('button', { name: /^5x$/i })).toHaveAttribute('aria-pressed', 'true');


    fireEvent.keyDown(window, { key: ' ', code: 'Space' });
    expect(screen.getByRole('button', { name: /^pause$/i })).toHaveAttribute('aria-pressed', 'true');


    const pausedTick = readTick();
    fireEvent.keyDown(window, { key: '.', code: 'Period' });
    expect(readTick()).toBe(pausedTick + 1);

    const inspectorPanel = screen.getByRole('heading', { name: /organism inspector/i }).closest('section');
    expect(inspectorPanel).toBeTruthy();

    const readInspectorId = () => inspectorPanel?.textContent?.match(/ID:\s*(org-\d+)/i)?.[1];

    fireEvent.keyDown(window, { key: 'ArrowRight', code: 'ArrowRight' });
    const firstSelectedId = readInspectorId();
    expect(firstSelectedId).toBeTruthy();

    fireEvent.keyDown(window, { key: 'ArrowDown', code: 'ArrowDown' });
    const secondSelectedId = readInspectorId();
    expect(secondSelectedId).toBeTruthy();
    expect(secondSelectedId).not.toBe(firstSelectedId);

    fireEvent.keyDown(window, { key: 'ArrowUp', code: 'ArrowUp' });
    const restoredSelectedId = readInspectorId();
    expect(restoredSelectedId).toBe(firstSelectedId);

    fireEvent.keyDown(window, { key: 'ArrowLeft', code: 'ArrowLeft' });
    const wrappedSelectedId = readInspectorId();
    expect(wrappedSelectedId).toBeTruthy();
    expect(wrappedSelectedId).not.toBe(restoredSelectedId);

    const identityToggle = screen.getByRole('button', { name: /^identity$/i });
    const lifecycleToggle = screen.getByRole('button', { name: /^lifecycle$/i });
    const energyToggle = screen.getByRole('button', { name: /^energy$/i });
    const locomotionToggle = screen.getByRole('button', { name: /^locomotion$/i });
    const sensesToggle = screen.getByRole('button', { name: /^senses$/i });
    const brainToggle = screen.getByRole('button', { name: /^brain$/i });

    expect(identityToggle).toHaveAttribute('aria-expanded', 'true');
    fireEvent.keyDown(window, { key: ']', code: 'BracketRight' });
    expect(lifecycleToggle).toHaveFocus();
    fireEvent.keyDown(window, { key: ']', code: 'BracketRight' });
    expect(energyToggle).toHaveFocus();
    fireEvent.keyDown(window, { key: ']', code: 'BracketRight' });
    expect(locomotionToggle).toHaveFocus();
    fireEvent.keyDown(window, { key: ']', code: 'BracketRight' });
    expect(sensesToggle).toHaveFocus();
    fireEvent.keyDown(window, { key: ']', code: 'BracketRight' });
    expect(brainToggle).toHaveFocus();
    fireEvent.keyDown(window, { key: '[', code: 'BracketLeft' });
    expect(sensesToggle).toHaveFocus();

    fireEvent.keyDown(window, { key: ']', code: 'BracketRight' });
    expect(brainToggle).toHaveFocus();
    fireEvent.keyDown(window, { key: 'Enter', code: 'Enter' });
    expect(brainToggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByText(/genome signature:/i)).not.toBeVisible();

    fireEvent.keyDown(window, { key: 'Enter', code: 'Enter' });
    expect(brainToggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText(/genome signature:/i)).toBeInTheDocument();

    fireEvent.keyDown(window, { key: 'p', code: 'KeyP' });
    expect(screen.getByRole('button', { name: /unpin organism inspector/i })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText(/pin mode: enabled/i)).toBeInTheDocument();

    fireEvent.keyDown(window, { key: 'P', code: 'KeyP' });
    expect(screen.getByRole('button', { name: /pin organism inspector/i })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByText(/pin mode: disabled/i)).toBeInTheDocument();

    fireEvent.keyDown(window, { key: ' ', code: 'Space' });
    expect(screen.getByRole('button', { name: /^pause$/i })).toHaveAttribute('aria-pressed', 'false');

    fireEvent.keyDown(window, { key: ' ', code: 'Space' });
    expect(screen.getByRole('button', { name: /^pause$/i })).toHaveAttribute('aria-pressed', 'true');
    const seedInput = screen.getByLabelText(/seed/i);
    seedInput.focus();

    const focusedPauseTick = readTick();
    const focusedInspectorId = readInspectorId();
    fireEvent.keyDown(seedInput, { key: '.', code: 'Period' });
    fireEvent.keyDown(seedInput, { key: '4', code: 'Digit4' });
    fireEvent.keyDown(seedInput, { key: '[', code: 'BracketLeft' });
    fireEvent.keyDown(seedInput, { key: ']', code: 'BracketRight' });
    fireEvent.keyDown(seedInput, { key: 'ArrowRight', code: 'ArrowRight' });
    fireEvent.keyDown(seedInput, { key: 'p', code: 'KeyP' });

    expect(readTick()).toBe(focusedPauseTick);
    expect(screen.getByRole('button', { name: /^10x$/i })).toHaveAttribute('aria-pressed', 'false');
    expect(inspectorPanel.textContent.match(/ID:\s*(org-\d+)/i)?.[1]).toBe(focusedInspectorId);
    expect(screen.getByRole('button', { name: /pin organism inspector/i })).toHaveAttribute('aria-pressed', 'false');

    vi.useRealTimers();
  });

  it('shows keyboard shortcuts modal and supports close interactions without mutating simulation state', () => {
    vi.useFakeTimers();
    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: /start simulation/i }));
    fireEvent.click(screen.getByRole('button', { name: /^pause$/i }));

    const tickNode = screen.getByText(/^tick count:/i);
    const pausedTick = Number.parseInt(tickNode.textContent.replace(/\D+/g, ''), 10);

    const speed5x = screen.getByRole('button', { name: /^5x$/i });
    fireEvent.click(speed5x);
    fireEvent.click(screen.getByRole('button', { name: /^pause$/i }));
    expect(speed5x).toHaveAttribute('aria-pressed', 'false');

    const trigger = screen.getByRole('button', { name: /keyboard shortcuts/i });
    fireEvent.click(trigger);

    const modal = screen.getByRole('dialog', { name: /keyboard shortcuts help/i });
    expect(modal).toBeInTheDocument();
    expect(within(modal).getByText(/^space$/i)).toBeInTheDocument();
    expect(within(modal).getByText(/^\.$/i)).toBeInTheDocument();
    expect(within(modal).getByText(/^\[ \/ \]$/i)).toBeInTheDocument();
    expect(within(modal).getByText(/^1 \/ 2 \/ 3 \/ 4$/i)).toBeInTheDocument();
    expect(within(modal).getByText(/^← \/ →$/i)).toBeInTheDocument();
    expect(within(modal).getByText(/^p$/i)).toBeInTheDocument();

    fireEvent.keyDown(window, { key: 'Escape', code: 'Escape' });
    expect(screen.queryByRole('dialog', { name: /keyboard shortcuts help/i })).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();

    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole('button', { name: /close keyboard shortcuts/i }));
    expect(screen.queryByRole('dialog', { name: /keyboard shortcuts help/i })).not.toBeInTheDocument();

    expect(Number.parseInt(tickNode.textContent.replace(/\D+/g, ''), 10)).toBe(pausedTick);
    expect(screen.getByRole('button', { name: /^pause$/i })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: /^5x$/i })).toHaveAttribute('aria-pressed', 'false');

    vi.useRealTimers();
  });

  it('clears stale selection to deterministic empty state when selected organism dies', async () => {
    vi.useFakeTimers();
    render(<App />);

    fireEvent.change(screen.getByLabelText(/^seed \(optional\)$/i), { target: { value: 'selection-stale-seed' } });
    fireEvent.change(screen.getByLabelText(/^initial population$/i), { target: { value: '2' } });
    fireEvent.change(screen.getByLabelText(/^minimum population$/i), { target: { value: '1' } });
    fireEvent.change(screen.getByLabelText(/^initial food count$/i), { target: { value: '0' } });
    fireEvent.change(screen.getByLabelText(/food spawn chance/i), { target: { value: '0' } });
    fireEvent.change(screen.getByLabelText(/^max food$/i), { target: { value: '1' } });

    fireEvent.click(screen.getByRole('button', { name: /start simulation/i }));
    fireEvent.click(screen.getByRole('button', { name: /^pause$/i }));

    const deterministicConfig = normalizeSimulationConfig(
      {
        name: 'Selection stale test',
        seed: 'selection-stale-seed',
        worldWidth: 800,
        worldHeight: 480,
        initialPopulation: 2,
        minimumPopulation: 1,
        initialFoodCount: 0,
        foodSpawnChance: 0,
        foodEnergyValue: 5,
        maxFood: 1
      },
      'selection-stale-seed'
    );

    const initialWorld = createInitialWorldFromConfig(deterministicConfig);
    const rng = createSeededPrng(deterministicConfig.resolvedSeed);
    const stepParams = toEngineStepParams(deterministicConfig);
    const initialIds = initialWorld.organisms.map((organism) => organism.id);

    let projected = initialWorld;
    let firstDiedId = null;
    for (let i = 0; i < 800 && !firstDiedId; i += 1) {
      projected = stepWorld(projected, rng, stepParams);
      firstDiedId = initialIds.find((id) => !projected.organisms.some((organism) => organism.id === id)) ?? null;
    }

    expect(firstDiedId).toBeTruthy();
    const selectedFixture = initialWorld.organisms.find((organism) => organism.id === firstDiedId);
    expect(selectedFixture).toBeTruthy();

    const canvas = screen.getByLabelText(/simulation world/i);
    vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      width: 800,
      height: 480,
      right: 800,
      bottom: 480,
      toJSON: () => ({})
    });

    fireEvent.click(canvas, { clientX: selectedFixture.x, clientY: selectedFixture.y });
    const inspector = screen.getByRole('region', { name: /organism inspector/i });
    expect(inspector).toHaveTextContent(`ID: ${selectedFixture.id}`);

    fireEvent.click(screen.getByRole('button', { name: /^1x$/i }));

    for (let i = 0; i < 12; i += 1) {
      act(() => {
        vi.advanceTimersByTime(1000);
      });

      if (screen.queryByText(/selected organism is no longer available\./i)) {
        break;
      }
    }

    fireEvent.click(screen.getByRole('button', { name: /^pause$/i }));
    expect(screen.getByRole('heading', { name: /no organism selected/i })).toBeInTheDocument();
    expect(screen.queryByText(/selected organism details/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/brain data unavailable for this organism\./i)).not.toBeInTheDocument();

    vi.useRealTimers();
  });

  it('clears pinned inspector snapshot when selected organism dies', () => {
    vi.useFakeTimers();
    render(<App />);

    fireEvent.change(screen.getByLabelText(/^seed \(optional\)$/i), { target: { value: 'pin-mode-seed' } });
    fireEvent.change(screen.getByLabelText(/^initial population$/i), { target: { value: '2' } });
    fireEvent.change(screen.getByLabelText(/^minimum population$/i), { target: { value: '1' } });
    fireEvent.change(screen.getByLabelText(/^initial food count$/i), { target: { value: '0' } });
    fireEvent.change(screen.getByLabelText(/food spawn chance/i), { target: { value: '0' } });
    fireEvent.change(screen.getByLabelText(/^max food$/i), { target: { value: '1' } });

    fireEvent.click(screen.getByRole('button', { name: /start simulation/i }));
    fireEvent.click(screen.getByRole('button', { name: /^pause$/i }));

    const deterministicConfig = normalizeSimulationConfig(
      {
        name: 'Pin mode stale test',
        seed: 'pin-mode-seed',
        worldWidth: 800,
        worldHeight: 480,
        initialPopulation: 2,
        minimumPopulation: 1,
        initialFoodCount: 0,
        foodSpawnChance: 0,
        foodEnergyValue: 5,
        maxFood: 1
      },
      'pin-mode-seed'
    );

    const initialWorld = createInitialWorldFromConfig(deterministicConfig);
    const rng = createSeededPrng(deterministicConfig.resolvedSeed);
    const stepParams = toEngineStepParams(deterministicConfig);
    const initialIds = initialWorld.organisms.map((organism) => organism.id);

    let projected = initialWorld;
    let firstDiedId = null;
    for (let i = 0; i < 800 && !firstDiedId; i += 1) {
      projected = stepWorld(projected, rng, stepParams);
      firstDiedId = initialIds.find((id) => !projected.organisms.some((organism) => organism.id === id)) ?? null;
    }

    expect(firstDiedId).toBeTruthy();
    const selectedFixture = initialWorld.organisms.find((organism) => organism.id === firstDiedId);
    expect(selectedFixture).toBeTruthy();

    const canvas = screen.getByLabelText(/simulation world/i);
    vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      width: 800,
      height: 480,
      right: 800,
      bottom: 480,
      toJSON: () => ({})
    });

    fireEvent.click(canvas, { clientX: selectedFixture.x, clientY: selectedFixture.y });
    const inspector = screen.getByRole('region', { name: /organism inspector/i });
    expect(inspector).toHaveTextContent(`ID: ${selectedFixture.id}`);

    const pinButton = screen.getByRole('button', { name: /pin organism inspector/i });
    fireEvent.click(pinButton);
    expect(screen.getByRole('button', { name: /unpin organism inspector/i })).toHaveAttribute('aria-pressed', 'true');

    fireEvent.click(canvas, { clientX: 799, clientY: 479 });
    expect(inspector).toHaveTextContent(`ID: ${selectedFixture.id}`);

    fireEvent.click(screen.getByRole('button', { name: /^1x$/i }));

    for (let i = 0; i < 12; i += 1) {
      act(() => {
        vi.advanceTimersByTime(1000);
      });

      if (!inspector.textContent?.includes(`ID: ${selectedFixture.id}`)) {
        break;
      }
    }

    expect(screen.getByText(/selected organism is no longer available\./i)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /no organism selected/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /pin organism inspector/i })).toHaveAttribute('aria-pressed', 'false');
    expect(inspector).not.toHaveTextContent(`ID: ${selectedFixture.id}`);

    vi.useRealTimers();
  });

  it('renders selected vs pinned side-by-side comparison for key inspector fields', () => {
    render(<App />);

    fireEvent.change(screen.getByLabelText(/seed/i), { target: { value: 'comparison-seed' } });
    fireEvent.change(screen.getByLabelText(/initial population/i), { target: { value: '4' } });
    fireEvent.change(screen.getByLabelText(/minimum population/i), { target: { value: '4' } });
    fireEvent.click(screen.getByRole('button', { name: /start simulation/i }));
    fireEvent.click(screen.getByRole('button', { name: /^pause$/i }));

    const nextButton = screen.getByRole('button', { name: /next organism/i });
    fireEvent.click(nextButton);

    const pinButton = screen.getByRole('button', { name: /pin organism inspector/i });
    fireEvent.click(pinButton);

    fireEvent.click(nextButton);

    expect(screen.getByRole('heading', { name: /selected vs pinned comparison/i })).toBeInTheDocument();
    const comparisonTable = screen.getByRole('table');
    expect(comparisonTable).toBeInTheDocument();
    expect(within(comparisonTable).getByText(/^generation$/i)).toBeInTheDocument();
    expect(within(comparisonTable).getByText(/^vision range$/i)).toBeInTheDocument();
    const fieldOrder = within(comparisonTable)
      .getAllByRole('rowheader')
      .map((cell) => cell.textContent?.trim())
      .filter(Boolean);
    expect(fieldOrder).toEqual([
      'Generation',
      'Age',
      'Energy',
      'Size',
      'Speed',
      'Vision range',
      'Turn rate',
      'Metabolism'
    ]);
    expect(screen.getAllByText(/vs pinned/i).length).toBeGreaterThan(0);
  });

  it('renders an always-visible zero-safe stats HUD before simulation starts', () => {
    render(<App />);

    const statsHud = screen.getByRole('region', { name: /simulation stats hud/i });
    expect(statsHud).toBeInTheDocument();
    expect(within(statsHud).getByText(/^seed:/i)).toHaveTextContent('Seed: Seed unavailable');
    expect(within(statsHud).getByText(/^population:/i)).toHaveTextContent('Population: 0');
    expect(screen.getByText(/^food count:/i)).toHaveTextContent('Food count: 0');
    expect(screen.getByText(/^average generation:/i)).toHaveTextContent('Average generation: 0.0');
    expect(screen.getByText(/^average organism energy:/i)).toHaveTextContent('Average organism energy: 0.0');
    expect(screen.getByText(/^tick count:/i)).toHaveTextContent('Tick count: 0');
    expect(screen.getByText(/^time elapsed:/i)).toHaveTextContent('Time elapsed: 0.0s');
    expect(screen.getByText(/^tick budget clamp:/i)).toHaveTextContent('Tick budget clamp: Inactive');
  });

  it('renders deterministic seed/tick in stats HUD and reports copy feedback', async () => {
    vi.useFakeTimers();
    const clipboardWriteText = vi.fn().mockResolvedValue();
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: clipboardWriteText }
    });

    render(<App />);
    fireEvent.change(screen.getByLabelText(/^seed \(optional\)$/i), { target: { value: 'hud-seed' } });
    fireEvent.click(screen.getByRole('button', { name: /start simulation/i }));

    const statsHud = screen.getByRole('region', { name: /simulation stats hud/i });
    expect(within(statsHud).getByText(/^seed:/i)).toHaveTextContent('Seed: hud-seed');

    const tickNode = within(statsHud).getByText(/^tick count:/i);
    act(() => {
      vi.advanceTimersByTime(110);
    });
    expect(Number.parseInt(tickNode.textContent.replace(/\D+/g, ''), 10)).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole('button', { name: /copy seed/i }));
    await act(async () => {});
    expect(clipboardWriteText).toHaveBeenCalledWith('hud-seed');
    expect(screen.getByText(/seed copied\./i)).toBeInTheDocument();

    vi.useRealTimers();
  });

  it('updates stats while running and keeps tick-derived metrics stable while paused', () => {
    vi.useFakeTimers();
    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: /start simulation/i }));

    const tickNode = screen.getByText(/^tick count:/i);
    expect(tickNode).toHaveTextContent('Tick count: 0');

    act(() => {
      vi.advanceTimersByTime(110);
    });
    expect(Number.parseInt(tickNode.textContent.replace(/\D+/g, ''), 10)).toBeGreaterThan(0);

    const pausedTick = Number.parseInt(tickNode.textContent.replace(/\D+/g, ''), 10);
    fireEvent.click(screen.getByRole('button', { name: /^pause$/i }));
    act(() => {
      vi.advanceTimersByTime(200);
    });

    expect(tickNode).toHaveTextContent(`Tick count: ${pausedTick}`);
    expect(screen.getByText(/^population:/i)).toBeInTheDocument();
    expect(screen.getByText(/^food count:/i)).toBeInTheDocument();
    expect(screen.getByText(/^average generation:/i).textContent).toMatch(/\d+\.\d$/);
    expect(screen.getByText(/^average organism energy:/i).textContent).toMatch(/\d+\.\d$/);
    expect(screen.getByText(/^time elapsed:/i).textContent).toMatch(/\d+\.\ds$/);

    vi.useRealTimers();
  });

  it('increases tick throughput at higher speed and keeps continuity when pausing/resuming at 1x', () => {
    vi.useFakeTimers();
    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: /start simulation/i }));
    const tickNode = screen.getByText(/^tick count:/i);
    const readTick = () => Number.parseInt(tickNode.textContent.replace(/\D+/g, ''), 10);

    act(() => {
      vi.advanceTimersByTime(300);
    });
    const after1x = readTick();

    fireEvent.click(screen.getByRole('button', { name: /^5x$/i }));
    act(() => {
      vi.advanceTimersByTime(300);
    });
    const after5x = readTick();
    const delta1x = after1x;
    const delta5x = after5x - after1x;

    expect(delta1x).toBeGreaterThan(0);
    expect(delta5x).toBeGreaterThan(delta1x);

    fireEvent.click(screen.getByRole('button', { name: /^pause$/i }));
    const pausedTick = readTick();
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(readTick()).toBe(pausedTick);

    fireEvent.click(screen.getByRole('button', { name: /^1x$/i }));
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(readTick()).toBeGreaterThan(pausedTick);

    vi.useRealTimers();
  });

  it('disables inspector next/previous controls when there are no alive organisms', () => {
    render(<App />);

    expect(screen.getByRole('button', { name: /previous organism/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /next organism/i })).toBeDisabled();
  });

  it('navigates organisms in deterministic id order with next/previous controls', () => {
    render(<App />);

    fireEvent.change(screen.getByLabelText(/name/i), { target: { value: 'Fixture' } });
    fireEvent.change(screen.getByLabelText(/seed/i), { target: { value: 'fixture-seed' } });
    fireEvent.change(screen.getByLabelText(/world width/i), { target: { value: '800' } });
    fireEvent.change(screen.getByLabelText(/world height/i), { target: { value: '480' } });
    fireEvent.change(screen.getByLabelText(/initial population/i), { target: { value: '12' } });
    fireEvent.change(screen.getByLabelText(/minimum population/i), { target: { value: '12' } });
    fireEvent.change(screen.getByLabelText(/initial food count/i), { target: { value: '30' } });
    fireEvent.change(screen.getByLabelText(/food spawn chance/i), { target: { value: '0.04' } });
    fireEvent.change(screen.getByLabelText(/food energy value/i), { target: { value: '5' } });
    fireEvent.change(screen.getByLabelText(/max food/i), { target: { value: '120' } });
    fireEvent.click(screen.getByRole('button', { name: /start simulation/i }));

    const fixtureConfig = normalizeSimulationConfig(
      {
        name: 'Fixture',
        seed: 'fixture-seed',
        worldWidth: 800,
        worldHeight: 480,
        initialPopulation: 12,
        minimumPopulation: 12,
        initialFoodCount: 30,
        foodSpawnChance: 0.04,
        foodEnergyValue: 5,
        maxFood: 120
      },
      'fixture-seed'
    );
    const fixtureWorld = createInitialWorldFromConfig(fixtureConfig);
    const sortedIds = fixtureWorld.organisms.map((organism) => organism.id).sort((left, right) => left.localeCompare(right));

    const nextButton = screen.getByRole('button', { name: /next organism/i });
    const previousButton = screen.getByRole('button', { name: /previous organism/i });
    const inspector = screen.getByRole('region', { name: /organism inspector/i });

    expect(nextButton).toBeEnabled();
    expect(previousButton).toBeEnabled();

    fireEvent.click(nextButton);
    expect(inspector).toHaveTextContent(`ID: ${sortedIds[0]}`);

    fireEvent.click(nextButton);
    expect(inspector).toHaveTextContent(`ID: ${sortedIds[1]}`);

    fireEvent.click(previousButton);
    expect(inspector).toHaveTextContent(`ID: ${sortedIds[0]}`);

    fireEvent.click(previousButton);
    expect(inspector).toHaveTextContent(`ID: ${sortedIds[sortedIds.length - 1]}`);
  });

  it('renders deterministic inspector values from fixed seeded fixture', () => {
    render(<App />);

    fireEvent.change(screen.getByLabelText(/seed/i), { target: { value: 'fixture-seed' } });
    fireEvent.click(screen.getByRole('button', { name: /start simulation/i }));

    const fixtureConfig = normalizeSimulationConfig(
      {
        name: 'Fixture',
        seed: 'fixture-seed',
        worldWidth: 800,
        worldHeight: 480,
        initialPopulation: 12,
        initialFoodCount: 30,
        foodSpawnChance: 0.04,
        foodEnergyValue: 5,
        maxFood: 120
      },
      'fixture-seed'
    );
    const fixtureWorld = createInitialWorldFromConfig(fixtureConfig);
    const firstTarget = fixtureWorld.organisms[0];
    const secondTarget = fixtureWorld.organisms[1];

    const canvas = screen.getByLabelText(/simulation world/i);
    vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      width: 800,
      height: 480,
      right: 800,
      bottom: 480,
      toJSON: () => ({})
    });

    fireEvent.click(canvas, { clientX: firstTarget.x, clientY: firstTarget.y });

    const inspector = screen.getByRole('region', { name: /organism inspector/i });

    expect(inspector).toHaveTextContent(`ID: ${firstTarget.id}`);
    expect(within(inspector).queryByRole('heading', { name: /no organism selected/i })).not.toBeInTheDocument();
    expect(inspector).toHaveTextContent(`Generation: ${firstTarget.generation}`);
    expect(inspector).toHaveTextContent(`Age: ${firstTarget.age}`);
    expect(inspector).toHaveTextContent(`Size: ${firstTarget.traits.size.toFixed(3)}`);
    expect(inspector).toHaveTextContent(`Speed: ${firstTarget.traits.speed.toFixed(3)}`);
    expect(inspector).toHaveTextContent(`Vision range: ${firstTarget.traits.visionRange.toFixed(3)}`);
    expect(inspector).toHaveTextContent(`Turn rate: ${firstTarget.traits.turnRate.toFixed(3)}`);
    expect(inspector).toHaveTextContent(`Metabolism: ${firstTarget.traits.metabolism.toFixed(3)}`);
    expect(inspector).toHaveTextContent(`Neurons: ${firstTarget.brain.neurons.length}`);
    expect(inspector).toHaveTextContent(`Synapses: ${firstTarget.brain.synapses.length}`);
    expect(screen.getByLabelText(/brain graph legend/i)).toHaveTextContent(/input neurons/i);
    expect(screen.getByLabelText(/brain graph legend/i)).toHaveTextContent(/hidden neurons/i);
    expect(screen.getByLabelText(/brain graph legend/i)).toHaveTextContent(/output neurons/i);
    expect(screen.getByLabelText(/brain graph weight legend/i)).toHaveTextContent(/fixed scale -1.0 to \+1.0/i);
    expect(screen.getByRole('img', { name: /organism brain graph/i })).toBeInTheDocument();

    fireEvent.click(canvas, { clientX: secondTarget.x, clientY: secondTarget.y });
    expect(inspector).toHaveTextContent(`ID: ${secondTarget.id}`);

    fireEvent.click(canvas, { clientX: 799, clientY: 479 });
    expect(inspector).toHaveTextContent(/no organism selected/i);
    expect(inspector).toHaveTextContent(/select an organism to view deterministic inspector details/i);

    fireEvent.click(canvas, { clientX: firstTarget.x, clientY: firstTarget.y });
    fireEvent.click(screen.getByRole('button', { name: /close organism inspector/i }));
    expect(inspector).toHaveTextContent(/no organism selected/i);
    expect(inspector).toHaveTextContent(/select an organism to view deterministic inspector details/i);
  });

  it('keeps signal emphasis controls deterministic for fixture brain data', () => {
    render(<App />);

    fireEvent.change(screen.getByLabelText(/seed/i), { target: { value: 'fixture-seed' } });
    fireEvent.click(screen.getByRole('button', { name: /start simulation/i }));

    const fixtureConfig = normalizeSimulationConfig(
      {
        name: 'Fixture',
        seed: 'fixture-seed',
        worldWidth: 800,
        worldHeight: 480,
        initialPopulation: 12,
        initialFoodCount: 30,
        foodSpawnChance: 0.04,
        foodEnergyValue: 5,
        maxFood: 120
      },
      'fixture-seed'
    );
    const fixtureWorld = createInitialWorldFromConfig(fixtureConfig);
    const firstTarget = fixtureWorld.organisms[0];

    const canvas = screen.getByLabelText(/simulation world/i);
    vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      width: 800,
      height: 480,
      right: 800,
      bottom: 480,
      toJSON: () => ({})
    });

    fireEvent.click(canvas, { clientX: firstTarget.x, clientY: firstTarget.y });

    const expectedChecksum = mapBrainEmphasisChecksum(mapBrainToVisualizerModel(firstTarget.brain), {
      hideNearZeroWeights: true,
      nearZeroThreshold: 0.1,
      strongestEdgeCount: 2
    });

    fireEvent.click(screen.getByLabelText(/hide near-zero-weight synapses/i));
    fireEvent.change(screen.getByLabelText(/highlight strongest synapse count/i), { target: { value: '2' } });

    expect(screen.getByLabelText(/brain graph emphasis checksum/i)).toHaveTextContent(expectedChecksum);
  });

  it('supports deterministic neuron filters and pinned path metadata in brain visualizer', () => {
    render(<App />);

    fireEvent.change(screen.getByLabelText(/seed/i), { target: { value: 'fixture-seed' } });
    fireEvent.click(screen.getByRole('button', { name: /start simulation/i }));

    const fixtureConfig = normalizeSimulationConfig(
      {
        name: 'Fixture',
        seed: 'fixture-seed',
        worldWidth: 800,
        worldHeight: 480,
        initialPopulation: 12,
        initialFoodCount: 30,
        foodSpawnChance: 0.04,
        foodEnergyValue: 5,
        maxFood: 120
      },
      'fixture-seed'
    );
    const fixtureWorld = createInitialWorldFromConfig(fixtureConfig);
    const firstTarget = fixtureWorld.organisms[0];

    const canvas = screen.getByLabelText(/simulation world/i);
    vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      width: 800,
      height: 480,
      right: 800,
      bottom: 480,
      toJSON: () => ({})
    });

    fireEvent.click(canvas, { clientX: firstTarget.x, clientY: firstTarget.y });

    const pinNeuronButton = screen.getAllByRole('button', { name: /pin neuron/i })[0];
    fireEvent.click(pinNeuronButton);

    expect(screen.getByText(/pinned neuron: /i)).not.toHaveTextContent('none');
    expect(screen.getByText(/pinned neuron metadata — id:/i)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/minimum neuron activation threshold/i), { target: { value: '0.5' } });
    fireEvent.click(screen.getByRole('checkbox', { name: /hidden/i }));

    fireEvent.click(screen.getByRole('button', { name: /clear filters \+ pin/i }));
    expect(screen.getByText(/pinned neuron: none/i)).toBeInTheDocument();
    expect(screen.queryByText(/pinned neuron metadata — id:/i)).not.toBeInTheDocument();
  });

  it('supports keyboard-accessible brain focus mode controls and safely resets on invalid neuron selection', () => {
    render(<App />);

    fireEvent.change(screen.getByLabelText(/seed/i), { target: { value: 'fixture-seed' } });
    fireEvent.click(screen.getByRole('button', { name: /start simulation/i }));

    const fixtureConfig = normalizeSimulationConfig(
      {
        name: 'Fixture',
        seed: 'fixture-seed',
        worldWidth: 800,
        worldHeight: 480,
        initialPopulation: 12,
        initialFoodCount: 30,
        foodSpawnChance: 0.04,
        foodEnergyValue: 5,
        maxFood: 120
      },
      'fixture-seed'
    );
    const fixtureWorld = createInitialWorldFromConfig(fixtureConfig);
    const firstTarget = fixtureWorld.organisms[0];

    const canvas = screen.getByLabelText(/simulation world/i);
    vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      width: 800,
      height: 480,
      right: 800,
      bottom: 480,
      toJSON: () => ({})
    });

    fireEvent.click(canvas, { clientX: firstTarget.x, clientY: firstTarget.y });

    const selectedNeuronControl = screen.getByLabelText(/selected neuron for focus mode/i);
    const optionText = selectedNeuronControl.querySelector('option[value]:not([value=""])')?.textContent;
    expect(optionText).toBeTruthy();

    fireEvent.change(selectedNeuronControl, { target: { value: optionText } });
    fireEvent.click(screen.getByRole('radio', { name: /incoming only/i }));

    expect(screen.getByText(/focus mode:/i)).toHaveTextContent(/incoming/i);
    expect(screen.getByText(/selected neuron:/i)).not.toHaveTextContent(/none/i);

    fireEvent.change(screen.getByLabelText(/minimum neuron activation threshold/i), { target: { value: '1' } });

    expect(screen.getByText(/focus mode:/i)).toHaveTextContent(/full/i);
    expect(screen.getByText(/selected neuron:/i)).toHaveTextContent(/none/i);
  });

  it('resets neuron detail panel predictably when selected organism changes', () => {
    render(<App />);

    fireEvent.change(screen.getByLabelText(/seed/i), { target: { value: 'fixture-seed' } });
    fireEvent.click(screen.getByRole('button', { name: /start simulation/i }));

    const fixtureConfig = normalizeSimulationConfig(
      {
        name: 'Fixture',
        seed: 'fixture-seed',
        worldWidth: 800,
        worldHeight: 480,
        initialPopulation: 12,
        initialFoodCount: 30,
        foodSpawnChance: 0.04,
        foodEnergyValue: 5,
        maxFood: 120
      },
      'fixture-seed'
    );
    const fixtureWorld = createInitialWorldFromConfig(fixtureConfig);
    const firstTarget = fixtureWorld.organisms[0];

    const canvas = screen.getByLabelText(/simulation world/i);
    vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      width: 800,
      height: 480,
      right: 800,
      bottom: 480,
      toJSON: () => ({})
    });

    fireEvent.click(canvas, { clientX: firstTarget.x, clientY: firstTarget.y });

    const selectedNeuronControl = screen.getByLabelText(/selected neuron for focus mode/i);
    const optionValue = selectedNeuronControl.querySelector('option[value]:not([value=""])')?.getAttribute('value');
    expect(optionValue).toBeTruthy();
    fireEvent.change(selectedNeuronControl, { target: { value: optionValue } });

    expect(screen.getByLabelText(/brain neuron detail panel/i)).toHaveTextContent(/Neuron detail:/i);

    fireEvent.click(screen.getByRole('button', { name: /select next organism/i }));

    expect(screen.getByLabelText(/brain neuron detail panel/i)).toHaveTextContent(/Select, focus, or hover a neuron/i);
  });

  it('pins neuron detail on click and ignores hover overrides until unpinned', () => {
    render(<App />);

    fireEvent.change(screen.getByLabelText(/seed/i), { target: { value: 'fixture-seed' } });
    fireEvent.click(screen.getByRole('button', { name: /start simulation/i }));

    const fixtureConfig = normalizeSimulationConfig(
      {
        name: 'Fixture',
        seed: 'fixture-seed',
        worldWidth: 800,
        worldHeight: 480,
        initialPopulation: 12,
        initialFoodCount: 30,
        foodSpawnChance: 0.04,
        foodEnergyValue: 5,
        maxFood: 120
      },
      'fixture-seed'
    );
    const fixtureWorld = createInitialWorldFromConfig(fixtureConfig);
    const firstTarget = fixtureWorld.organisms[0];

    const canvas = screen.getByLabelText(/simulation world/i);
    vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      width: 800,
      height: 480,
      right: 800,
      bottom: 480,
      toJSON: () => ({})
    });

    fireEvent.click(canvas, { clientX: firstTarget.x, clientY: firstTarget.y });

    const selectedNeuronControl = screen.getByLabelText(/selected neuron for focus mode/i);
    const neuronIds = Array.from(selectedNeuronControl.querySelectorAll('option[value]'))
      .map((option) => option.getAttribute('value'))
      .filter((value) => value);
    expect(neuronIds.length).toBeGreaterThan(1);

    const firstNeuronId = neuronIds[0];
    const secondNeuronId = neuronIds[1];
    const neuronDetailPanel = screen.getByLabelText(/brain neuron detail panel/i);
    const brainGraph = screen.getByRole('img', { name: /organism brain graph/i });

    const firstNeuronButton = within(brainGraph).getByLabelText(`Pin neuron ${firstNeuronId}`);
    const secondNeuronButton = within(brainGraph).getByLabelText(`Pin neuron ${secondNeuronId}`);

    fireEvent.click(firstNeuronButton);
    expect(screen.getByText(/pinned neuron:/i)).toHaveTextContent(firstNeuronId);
    expect(neuronDetailPanel).toHaveTextContent(new RegExp(`Neuron detail:\\s*ID ${firstNeuronId}`, 'i'));

    fireEvent.mouseEnter(secondNeuronButton);
    expect(neuronDetailPanel).toHaveTextContent(new RegExp(`Neuron detail:\\s*ID ${firstNeuronId}`, 'i'));

    fireEvent.click(firstNeuronButton);
    expect(screen.getByText(/pinned neuron:/i)).toHaveTextContent(/none/i);

    fireEvent.mouseEnter(secondNeuronButton);
    expect(neuronDetailPanel).toHaveTextContent(new RegExp(`Neuron detail:\\s*ID ${secondNeuronId}`, 'i'));
  });

  it('maps synapse row selection to graph edge highlight deterministically', () => {
    render(<App />);

    fireEvent.change(screen.getByLabelText(/seed/i), { target: { value: 'fixture-seed' } });
    fireEvent.click(screen.getByRole('button', { name: /start simulation/i }));

    const fixtureConfig = normalizeSimulationConfig(
      {
        name: 'Fixture',
        seed: 'fixture-seed',
        worldWidth: 800,
        worldHeight: 480,
        initialPopulation: 12,
        initialFoodCount: 30,
        foodSpawnChance: 0.04,
        foodEnergyValue: 5,
        maxFood: 120
      },
      'fixture-seed'
    );
    const fixtureWorld = createInitialWorldFromConfig(fixtureConfig);
    const firstTarget = fixtureWorld.organisms[0];

    const canvas = screen.getByLabelText(/simulation world/i);
    vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      width: 800,
      height: 480,
      right: 800,
      bottom: 480,
      toJSON: () => ({})
    });

    fireEvent.click(canvas, { clientX: firstTarget.x, clientY: firstTarget.y });

    const selectedNeuronControl = screen.getByLabelText(/selected neuron for focus mode/i);
    const optionValue = selectedNeuronControl.querySelector('option[value]:not([value=""])')?.getAttribute('value');
    expect(optionValue).toBeTruthy();
    fireEvent.change(selectedNeuronControl, { target: { value: optionValue } });

    const neuronDetailPanel = screen.getByLabelText(/brain neuron detail panel/i);
    const synapseRowButton = within(neuronDetailPanel).queryAllByRole('button', { name: /select synapse/i })[0];
    expect(synapseRowButton).toBeTruthy();

    fireEvent.click(synapseRowButton);

    const selectedDetails = screen.getByLabelText(/brain graph selected synapse details/i);
    expect(selectedDetails.textContent).toMatch(/selected synapse/i);

    const selectedSynapseId = synapseRowButton.getAttribute('aria-label')?.match(/select synapse\s+([^:]+)/i)?.[1];
    expect(selectedSynapseId).toBeTruthy();
    expect(selectedDetails.textContent).toContain(selectedSynapseId);
    expect(synapseRowButton).toHaveAttribute('aria-pressed', 'true');
  });

  it('renders inspector sections in deterministic order and uses placeholder for missing values', () => {
    render(<App />);

    fireEvent.change(screen.getByLabelText(/seed/i), { target: { value: 'fixture-seed' } });
    fireEvent.click(screen.getByRole('button', { name: /start simulation/i }));

    const fixtureConfig = normalizeSimulationConfig(
      {
        name: 'Fixture',
        seed: 'fixture-seed',
        worldWidth: 800,
        worldHeight: 480,
        initialPopulation: 12,
        initialFoodCount: 30,
        foodSpawnChance: 0.04,
        foodEnergyValue: 5,
        maxFood: 120
      },
      'fixture-seed'
    );
    const fixtureWorld = createInitialWorldFromConfig(fixtureConfig);
    const firstTarget = fixtureWorld.organisms[0];

    const canvas = screen.getByLabelText(/simulation world/i);
    vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      width: 800,
      height: 480,
      right: 800,
      bottom: 480,
      toJSON: () => ({})
    });

    fireEvent.click(canvas, { clientX: firstTarget.x, clientY: firstTarget.y });

    const sectionLabels = screen.getAllByRole('button', {
      name: /^(Identity|Lifecycle|Energy|Locomotion|Senses|Brain)$/i
    }).map((element) => element.textContent);
    expect(sectionLabels).toEqual([
      ...INSPECTOR_TRAIT_SECTION_SCHEMA.map((section) => section.label),
      'Brain'
    ]);

    const traitSectionRows = INSPECTOR_TRAIT_SECTION_SCHEMA.map((section) => {
      const region = screen.getByRole('region', { name: section.label });
      return Array.from(region.querySelectorAll('p strong')).map((node) => node.textContent);
    });

    expect(traitSectionRows).toEqual(
      INSPECTOR_TRAIT_SECTION_SCHEMA.map((section) => section.fields.map((field) => `${field.label}:`))
    );
  });

  it('keeps inspector and synapse controls keyboard-operable with deterministic focus after selection changes', async () => {
    render(<App />);

    fireEvent.change(screen.getByLabelText(/seed/i), { target: { value: 'fixture-seed' } });
    fireEvent.click(screen.getByRole('button', { name: /start simulation/i }));

    const fixtureConfig = normalizeSimulationConfig(
      {
        name: 'Fixture',
        seed: 'fixture-seed',
        worldWidth: 800,
        worldHeight: 480,
        initialPopulation: 12,
        initialFoodCount: 30,
        foodSpawnChance: 0.04,
        foodEnergyValue: 5,
        maxFood: 120
      },
      'fixture-seed'
    );
    const fixtureWorld = createInitialWorldFromConfig(fixtureConfig);
    const firstTarget = fixtureWorld.organisms[0];

    const canvas = screen.getByLabelText(/simulation world/i);
    vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      width: 800,
      height: 480,
      right: 800,
      bottom: 480,
      toJSON: () => ({})
    });

    fireEvent.click(canvas, { clientX: firstTarget.x, clientY: firstTarget.y });

    const selectionHeading = screen.getByRole('heading', { name: /inspector selection details/i });
    await waitFor(() => {
      expect(selectionHeading).toHaveFocus();
    });

    fireEvent.click(screen.getByRole('button', { name: /select next organism/i }));
    await waitFor(() => {
      expect(selectionHeading).toHaveFocus();
    });

    expect(screen.getByRole('group', { name: /brain visualizer viewport controls/i })).toBeInTheDocument();

    const synapseControl = screen.getAllByRole('button', { name: /synapse/i })[0];
    synapseControl.focus();
    fireEvent.keyDown(synapseControl, { key: 'Enter' });

    expect(screen.getByLabelText(/brain graph selected synapse details/i).textContent).toMatch(/selected synapse/i);
  });
});
