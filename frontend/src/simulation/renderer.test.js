import { describe, expect, it } from 'vitest';

import { createWorldState } from './engine';
import { drawWorldSnapshot } from './renderer';

function createRecordingContext() {
  const calls = [];

  const ctx = {
    set fillStyle(value) {
      calls.push(['fillStyle', value]);
    },
    set strokeStyle(value) {
      calls.push(['strokeStyle', value]);
    },
    set lineWidth(value) {
      calls.push(['lineWidth', value]);
    },
    clearRect: (...args) => calls.push(['clearRect', ...args]),
    fillRect: (...args) => calls.push(['fillRect', ...args]),
    strokeRect: (...args) => calls.push(['strokeRect', ...args]),
    beginPath: () => calls.push(['beginPath']),
    arc: (...args) => calls.push(['arc', ...args]),
    moveTo: (...args) => calls.push(['moveTo', ...args]),
    lineTo: (...args) => calls.push(['lineTo', ...args]),
    fill: () => calls.push(['fill']),
    stroke: () => calls.push(['stroke'])
  };

  return { ctx, calls };
}

describe('drawWorldSnapshot', () => {
  it('draws the same command stream for the same snapshot', () => {
    const snapshot = createWorldState({
      tick: 10,
      organisms: [{ id: 'o1', x: 30, y: 40, energy: 12, direction: Math.PI / 3, traits: { size: 1 } }],
      food: [{ id: 'f1', x: 10, y: 20, energyValue: 5 }]
    });

    const first = createRecordingContext();
    const second = createRecordingContext();

    drawWorldSnapshot(first.ctx, snapshot, { width: 320, height: 200 });
    drawWorldSnapshot(second.ctx, snapshot, { width: 320, height: 200 });

    expect(second.calls).toEqual(first.calls);
  });

  it('does not mutate world snapshot while rendering', () => {
    const snapshot = createWorldState({
      tick: 3,
      organisms: [{ id: 'o1', x: 5, y: 6, energy: 7, direction: 0, traits: { size: 1, visionRange: 10 } }],
      food: [{ id: 'f1', x: 8, y: 9, energyValue: 2 }]
    });

    const before = JSON.parse(JSON.stringify(snapshot));
    const { ctx } = createRecordingContext();

    drawWorldSnapshot(ctx, snapshot, { width: 160, height: 120 }, { selectedOrganismId: 'o1' });

    expect(snapshot).toEqual(before);
  });

  it('draws heading indicator aligned with organism direction', () => {
    const snapshot = createWorldState({
      organisms: [{ id: 'o1', x: 10, y: 20, energy: 10, direction: 0, traits: { size: 1 } }],
      food: []
    });

    const { ctx, calls } = createRecordingContext();

    drawWorldSnapshot(ctx, snapshot, { width: 100, height: 80 });

    expect(calls).toContainEqual(['moveTo', 10, 20]);
    expect(calls).toContainEqual(['lineTo', 20, 20]);
  });

  it('draws selection overlays only for selected organism', () => {
    const snapshot = createWorldState({
      organisms: [
        { id: 'o1', x: 10, y: 20, energy: 30, age: 50, direction: 0, traits: { size: 1, visionRange: 12 } },
        { id: 'o2', x: 40, y: 30, energy: 30, age: 50, direction: 0, traits: { size: 1, visionRange: 25 } }
      ],
      food: []
    });

    const withSelection = createRecordingContext();
    drawWorldSnapshot(withSelection.ctx, snapshot, { width: 100, height: 80 }, { selectedOrganismId: 'o1' });

    const withoutSelection = createRecordingContext();
    drawWorldSnapshot(withoutSelection.ctx, snapshot, { width: 100, height: 80 }, { selectedOrganismId: null });

    const selectedVisionArcCount = withSelection.calls.filter(
      (call) => call[0] === 'arc' && call[3] === 12
    ).length;
    const unselectedVisionArcCount = withoutSelection.calls.filter(
      (call) => call[0] === 'arc' && call[3] === 12
    ).length;

    expect(selectedVisionArcCount).toBe(1);
    expect(unselectedVisionArcCount).toBe(0);
    expect(withSelection.calls.some((call) => call[0] === 'strokeRect')).toBe(true);
  });
});
