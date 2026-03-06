import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import App from './App';

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
  });

  afterEach(() => {
    vi.restoreAllMocks();
    cleanup();
  });

  it('renders the simulation heading and canvas', () => {
    render(<App />);

    expect(
      screen.getByRole('heading', {
        level: 1,
        name: /snn sandbox/i
      })
    ).toBeInTheDocument();

    expect(screen.getByLabelText(/simulation world/i)).toBeInTheDocument();
  });

  it('toggles pause and resume controls', () => {
    render(<App />);

    const button = screen.getByRole('button', { name: /pause/i });
    fireEvent.click(button);

    expect(screen.getByRole('button', { name: /resume/i })).toBeInTheDocument();
  });
});
