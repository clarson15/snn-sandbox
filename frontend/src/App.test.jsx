import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import App from './App';
import { createInitialWorldFromConfig, loadSimulationConfig, normalizeSimulationConfig, STORAGE_KEY } from './simulation/config';

describe('App', () => {
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
  });

  afterEach(() => {
    if (typeof window.localStorage?.clear === 'function') {
      window.localStorage.clear();
    } else if (typeof window.localStorage?.removeItem === 'function') {
      window.localStorage.removeItem(STORAGE_KEY);
    }

    vi.restoreAllMocks();
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
