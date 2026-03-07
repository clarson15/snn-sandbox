import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import App from './App';
import { createInitialWorldFromConfig, loadSimulationConfig, normalizeSimulationConfig, STORAGE_KEY, toEngineStepParams } from './simulation/config';
import { loadReplayComparisonPresets } from './simulation/replayComparisonPresets';
import { stepWorld } from './simulation/engine';
import { createSeededPrng } from './simulation/prng';

describe('App', () => {
  let clipboardWriteText;

  beforeEach(() => {
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

    expect(screen.getByText(/click an organism to inspect it\./i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^pause$/i })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: /^1x$/i })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText(/^tick count:/i)).toHaveTextContent('Tick count: 0');

    vi.useRealTimers();
  });

  it('shows actionable validation errors for invalid ranges', () => {
    render(<App />);

    fireEvent.change(screen.getByLabelText(/world width/i), { target: { value: '20' } });
    fireEvent.change(screen.getByLabelText(/max food/i), { target: { value: '1' } });
    fireEvent.change(screen.getByLabelText(/initial food count/i), { target: { value: '20' } });
    fireEvent.click(screen.getByRole('button', { name: /start simulation/i }));

    expect(screen.getByText(/world width must be between 100 and 3000/i)).toBeInTheDocument();
    expect(screen.getByText(/max food must be greater than or equal to initial food count/i)).toBeInTheDocument();
  });

  it('supports pause and runtime speed control transitions', () => {
    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: /start simulation/i }));

    const pauseButton = screen.getByRole('button', { name: /^pause$/i });
    const speed1x = screen.getByRole('button', { name: /^1x$/i });
    const speed2x = screen.getByRole('button', { name: /^2x$/i });
    const speed5x = screen.getByRole('button', { name: /^5x$/i });
    const speed10x = screen.getByRole('button', { name: /^10x$/i });

    expect(speed1x).toHaveAttribute('aria-pressed', 'true');
    expect(speed2x).toHaveAttribute('aria-pressed', 'false');
    expect(speed5x).toHaveAttribute('aria-pressed', 'false');
    expect(speed10x).toHaveAttribute('aria-pressed', 'false');

    fireEvent.click(speed5x);
    expect(speed5x).toHaveAttribute('aria-pressed', 'true');
    expect(speed1x).toHaveAttribute('aria-pressed', 'false');

    fireEvent.click(pauseButton);
    expect(screen.getByRole('button', { name: /^pause$/i })).toHaveAttribute('aria-pressed', 'true');
    expect(speed5x).toHaveAttribute('aria-pressed', 'false');

    fireEvent.click(speed2x);
    expect(screen.getByRole('button', { name: /^pause$/i })).toHaveAttribute('aria-pressed', 'false');
    expect(speed2x).toHaveAttribute('aria-pressed', 'true');
  });

  it('renders deterministic run metadata and copies a stable payload', async () => {
    render(<App />);

    fireEvent.change(screen.getByLabelText(/seed/i), { target: { value: 'meta-seed' } });
    fireEvent.click(screen.getByRole('button', { name: /start simulation/i }));

    expect(screen.getByText(/^seed:/i)).toHaveTextContent('Seed: meta-seed');
    expect(screen.getByText(/^speed multiplier:/i)).toHaveTextContent('Speed multiplier: 1x');
    expect(screen.getByText(/^snapshot id:/i)).toHaveTextContent('Snapshot ID: No snapshot');

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
    fireEvent.click(within(savedRegion).getByRole('button', { name: /^load$/i }));

    await waitFor(() => {
      expect(screen.getByText(/active snapshot:/i)).toHaveTextContent('Fixture snapshot');
      expect(screen.getByText(/^tick count:/i)).toHaveTextContent('Tick count: 0');
      expect(screen.getByText(/loaded\./i)).toBeInTheDocument();
      const runMetadataPanel = screen.getByRole('region', { name: /run metadata panel/i });
      expect(within(runMetadataPanel).getByText(/^seed: fixture-seed$/i)).toBeInTheDocument();
      expect(within(runMetadataPanel).getByText(/^snapshot id: sim-fixture$/i)).toBeInTheDocument();
    });
  });

  it('supports deterministic replay tick jumps from a loaded snapshot and only resumes when explicit', async () => {
    render(<App />);

    const savedRegion = await screen.findByRole('region', { name: /saved simulations/i });
    fireEvent.click(within(savedRegion).getByRole('button', { name: /^load$/i }));

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
    fireEvent.click(within(savedRegion).getByRole('button', { name: /^load$/i }));

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
    fireEvent.click(within(savedRegion).getByRole('button', { name: /^load$/i }));

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
    fireEvent.click(within(savedRegion).getByRole('button', { name: /^load$/i }));

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
    fireEvent.click(within(savedRegion).getByRole('button', { name: /^load$/i }));

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
    fireEvent.click(within(savedRegion).getByRole('button', { name: /^load$/i }));

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
    fireEvent.click(within(savedRegion).getByRole('button', { name: /^load$/i }));

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
    fireEvent.click(within(savedRegion).getByRole('button', { name: /^load$/i }));

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
    fireEvent.click(within(savedRegion).getByRole('button', { name: /^load$/i }));

    const mismatchRegion = await screen.findByRole('region', { name: /replay mismatch details/i });
    expect(within(mismatchRegion).getByText(/no mismatch events available for this replay payload\./i)).toBeInTheDocument();
    expect(within(mismatchRegion).queryByRole('list')).not.toBeInTheDocument();
  });

  it('hides mismatch details panel when runs match', async () => {
    render(<App />);

    const savedRegion = await screen.findByRole('region', { name: /saved simulations/i });
    fireEvent.click(within(savedRegion).getByRole('button', { name: /^load$/i }));

    await waitFor(() => {
      expect(screen.queryByRole('region', { name: /replay mismatch details/i })).not.toBeInTheDocument();
    });
  });

  it('surfaces load failures for invalid/corrupt snapshots', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url, options = {}) => {
      if (url === '/api/simulations/snapshots' && (!options.method || options.method === 'GET')) {
        return {
          ok: true,
          status: 200,
          json: async () => ([{ id: 'sim-bad', name: 'Bad snapshot', updatedAt: '2026-03-06T12:00:01.000Z' }])
        };
      }

      if (String(url).startsWith('/api/simulations/snapshots/')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ id: 'sim-bad', tickCount: 10, worldState: { tick: 9 } })
        };
      }

      return { ok: false, status: 404, json: async () => ({}) };
    }));

    render(<App />);
    const savedRegion = await screen.findByRole('region', { name: /saved simulations/i });
    fireEvent.click(within(savedRegion).getByRole('button', { name: /^load$/i }));

    await waitFor(() => {
      expect(screen.getByText(/failed to load snapshot/i)).toBeInTheDocument();
    });
  });

  it('deletes a snapshot after explicit confirmation and updates the list', async () => {
    render(<App />);

    fireEvent.click(await screen.findByRole('button', { name: /delete/i }));

    await waitFor(() => {
      expect(screen.getByText(/deleted\./i)).toBeInTheDocument();
      expect(screen.queryByText(/fixture snapshot/i)).not.toBeInTheDocument();
    });
  });

  it('cancels delete when confirmation is declined', async () => {
    window.confirm.mockReturnValue(false);
    render(<App />);

    fireEvent.click(await screen.findByRole('button', { name: /delete/i }));

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
    fireEvent.click(await screen.findByRole('button', { name: /delete/i }));

    await waitFor(() => {
      expect(screen.getByText(/failed to delete snapshot\./i)).toBeInTheDocument();
      expect(screen.getByText(/fixture snapshot/i)).toBeInTheDocument();
    });
  });

  it('steps exactly one tick while paused and keeps step disabled while running', () => {
    vi.useFakeTimers();
    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: /start simulation/i }));

    const tickNode = screen.getByText(/^tick count:/i);
    const stepButton = screen.getByRole('button', { name: /^step$/i });
    const readTick = () => Number.parseInt(tickNode.textContent.replace(/\D+/g, ''), 10);

    expect(stepButton).toBeDisabled();

    const stepControl = stepButton.closest('.control-with-hint');
    stepControl.focus();
    expect(screen.getByRole('tooltip')).toHaveTextContent('Pause the simulation to step one tick at a time.');

    fireEvent.click(screen.getByRole('button', { name: /^pause$/i }));
    expect(stepButton).toBeEnabled();
    expect(stepButton.closest('.control-with-hint')).not.toHaveClass('is-disabled');

    const pausedTick = readTick();
    fireEvent.click(stepButton);
    expect(readTick()).toBe(pausedTick + 1);

    fireEvent.click(stepButton);
    expect(readTick()).toBe(pausedTick + 2);

    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(readTick()).toBe(pausedTick + 2);

    fireEvent.click(screen.getByRole('button', { name: /^1x$/i }));
    expect(stepButton).toBeDisabled();

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

  it('supports keyboard shortcuts for pause/play, step, speed presets, and ignores keys while typing', () => {
    vi.useFakeTimers();
    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: /start simulation/i }));

    const tickNode = screen.getByText(/^tick count:/i);
    const readTick = () => Number.parseInt(tickNode.textContent.replace(/\D+/g, ''), 10);

    expect(screen.getByText(/shortcuts: space pause\/play/i)).toBeInTheDocument();

    fireEvent.keyDown(window, { key: '3', code: 'Digit3' });
    expect(screen.getByRole('button', { name: /^5x$/i })).toHaveAttribute('aria-pressed', 'true');

    fireEvent.keyDown(window, { key: ' ', code: 'Space' });
    expect(screen.getByRole('button', { name: /^pause$/i })).toHaveAttribute('aria-pressed', 'true');

    const pausedTick = readTick();
    fireEvent.keyDown(window, { key: '.', code: 'Period' });
    expect(readTick()).toBe(pausedTick + 1);

    fireEvent.keyDown(window, { key: ' ', code: 'Space' });
    expect(screen.getByRole('button', { name: /^5x$/i })).toHaveAttribute('aria-pressed', 'true');

    fireEvent.keyDown(window, { key: ' ', code: 'Space' });
    const seedInput = screen.getByLabelText(/seed/i);
    seedInput.focus();

    const focusedPauseTick = readTick();
    fireEvent.keyDown(seedInput, { key: '.', code: 'Period' });
    fireEvent.keyDown(seedInput, { key: '4', code: 'Digit4' });

    expect(readTick()).toBe(focusedPauseTick);
    expect(screen.getByRole('button', { name: /^10x$/i })).toHaveAttribute('aria-pressed', 'false');

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
    expect(within(modal).getByText(/^1 \/ 2 \/ 3 \/ 4$/i)).toBeInTheDocument();

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

  it('keeps selection stable across controls, then shows and clears stale-selection state after death', async () => {
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

    fireEvent.click(screen.getByRole('button', { name: /^2x$/i }));
    fireEvent.click(screen.getByRole('button', { name: /^pause$/i }));
    fireEvent.click(screen.getByRole('button', { name: /^5x$/i }));
    fireEvent.click(screen.getByRole('button', { name: /^pause$/i }));
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

    expect(screen.getByText(/selected organism is no longer available\./i)).toBeInTheDocument();
    expect(screen.getByText(/inspector will close on your next interaction\./i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /^pause$/i }));
    expect(inspector).toHaveTextContent(/click an organism to inspect it\./i);

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
    expect(inspector).toHaveTextContent(`Generation: ${firstTarget.generation}`);
    expect(inspector).toHaveTextContent(`Age: ${firstTarget.age}`);
    expect(inspector).toHaveTextContent(`Size: ${firstTarget.traits.size}`);
    expect(inspector).toHaveTextContent(`Speed: ${firstTarget.traits.speed}`);
    expect(inspector).toHaveTextContent(`Vision range: ${firstTarget.traits.visionRange}`);
    expect(inspector).toHaveTextContent(`Turn rate: ${firstTarget.traits.turnRate}`);
    expect(inspector).toHaveTextContent(`Metabolism: ${firstTarget.traits.metabolism}`);
    expect(inspector).toHaveTextContent(`Neurons: ${firstTarget.brain.neurons.length}`);
    expect(inspector).toHaveTextContent(`Synapses: ${firstTarget.brain.synapses.length}`);
    expect(screen.getByLabelText(/brain graph weight legend/i)).toHaveTextContent(/green = excitatory/i);
    expect(screen.getByRole('img', { name: /organism brain graph/i })).toBeInTheDocument();

    fireEvent.click(canvas, { clientX: secondTarget.x, clientY: secondTarget.y });
    expect(inspector).toHaveTextContent(`ID: ${secondTarget.id}`);

    fireEvent.click(canvas, { clientX: 799, clientY: 479 });
    expect(inspector).toHaveTextContent(/click an organism to inspect it/i);

    fireEvent.click(canvas, { clientX: firstTarget.x, clientY: firstTarget.y });
    fireEvent.click(screen.getByRole('button', { name: /close organism inspector/i }));
    expect(inspector).toHaveTextContent(/click an organism to inspect it/i);
  });
});
