import { describe, expect, it } from 'vitest';

import { createWorldState } from './engine';
import { drawWorldSnapshot } from './renderer';

function createRecordingContext() {
  const calls = [];

  const ctx = {
    set fillStyle(value) {
      calls.push(['fillStyle', value]);
    },
    clearRect: (...args) => calls.push(['clearRect', ...args]),
    fillRect: (...args) => calls.push(['fillRect', ...args]),
    beginPath: () => calls.push(['beginPath']),
    arc: (...args) => calls.push(['arc', ...args]),
    fill: () => calls.push(['fill'])
  };

  return { ctx, calls };
}

describe('drawWorldSnapshot', () => {
  it('draws the same command stream for the same snapshot', () => {
    const snapshot = createWorldState({
      tick: 10,
      organisms: [{ id: 'o1', x: 30, y: 40, energy: 12 }],
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
      organisms: [{ id: 'o1', x: 5, y: 6, energy: 7 }],
      food: [{ id: 'f1', x: 8, y: 9, energyValue: 2 }]
    });

    const before = JSON.parse(JSON.stringify(snapshot));
    const { ctx } = createRecordingContext();

    drawWorldSnapshot(ctx, snapshot, { width: 160, height: 120 });

    expect(snapshot).toEqual(before);
  });
});
