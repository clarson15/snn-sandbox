import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import App from './App';
import { createInitialWorldFromConfig, loadSimulationConfig, normalizeSimulationConfig, STORAGE_KEY } from './simulation/config';

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
    expect(screen.getByRole('button', { name: /^resume$/i })).toHaveAttribute('aria-pressed', 'true');
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

    fireEvent.click(screen.getByRole('button', { name: /tick 18 · organisms\[2\]\.energy/i }));

    await waitFor(() => {
      expect(screen.getByText(/jumped to mismatch event tick\./i)).toBeInTheDocument();
    });

    const tickInput = screen.getByLabelText(/jump to tick/i);
    expect(tickInput).toHaveValue(18);
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
    expect(screen.getByText(/^average generation:/i).textContent).toMatch(/\d+\.\d{2}$/);
    expect(screen.getByText(/^average organism energy:/i).textContent).toMatch(/\d+\.\d{3}$/);

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
    const target = fixtureWorld.organisms[0];

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

    fireEvent.click(canvas, { clientX: target.x, clientY: target.y });

    const inspector = screen.getByRole('region', { name: /organism inspector/i });

    expect(inspector).toHaveTextContent(`ID: ${target.id}`);
    expect(inspector).toHaveTextContent(`Generation: ${target.generation}`);
    expect(inspector).toHaveTextContent(`Age: ${target.age}`);
    expect(inspector).toHaveTextContent(`Size: ${target.traits.size}`);
    expect(inspector).toHaveTextContent(`Speed: ${target.traits.speed}`);
    expect(inspector).toHaveTextContent(`Vision range: ${target.traits.visionRange}`);
    expect(inspector).toHaveTextContent(`Turn rate: ${target.traits.turnRate}`);
    expect(inspector).toHaveTextContent(`Metabolism: ${target.traits.metabolism}`);
    expect(inspector).toHaveTextContent(`Neurons: ${target.brain.neurons.length}`);
    expect(inspector).toHaveTextContent(`Synapses: ${target.brain.synapses.length}`);
    expect(screen.getByRole('img', { name: /organism brain graph/i })).toBeInTheDocument();
  });
});
