import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import App from './App';
import { loadSimulationConfig, STORAGE_KEY } from './simulation/config';

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
});
