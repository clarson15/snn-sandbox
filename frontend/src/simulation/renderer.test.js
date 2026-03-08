import { describe, expect, it } from 'vitest';

import { drawWorldSnapshot } from './renderer';

function createMockContext() {
  return {
    arcCalls: [],
    fillRectCalls: [],
    strokeRectCalls: [],
    moveToCalls: [],
    lineToCalls: [],
    clearRect() {},
    fillRect(x, y, width, height) {
      this.fillRectCalls.push({ x, y, width, height });
    },
    strokeRect(x, y, width, height) {
      this.strokeRectCalls.push({ x, y, width, height });
    },
    beginPath() {},
    arc(x, y, radius, startAngle, endAngle) {
      this.arcCalls.push({ x, y, radius, startAngle, endAngle });
    },
    fill() {},
    stroke() {},
    moveTo(x, y) {
      this.moveToCalls.push({ x, y });
    },
    lineTo(x, y) {
      this.lineToCalls.push({ x, y });
    },
    set fillStyle(_value) {},
    set strokeStyle(_value) {},
    set lineWidth(_value) {}
  };
}

describe('drawWorldSnapshot viewport culling', () => {
  it('draws inside entities and skips fully offscreen entities', () => {
    const ctx = createMockContext();
    const snapshot = {
      food: [
        { x: 20, y: 20 },
        { x: -40, y: 10 }
      ],
      organisms: [
        { id: 'inside', x: 30, y: 30, direction: 0, traits: { size: 1 } },
        { id: 'outside', x: 250, y: 30, direction: 0, traits: { size: 1 } }
      ]
    };

    drawWorldSnapshot(ctx, snapshot, { width: 100, height: 100 }, { cullPadding: 0 });

    const arcsAtVisiblePositions = ctx.arcCalls.filter(({ x, y }) =>
      (x === 20 && y === 20) || (x === 30 && y === 30)
    );
    expect(arcsAtVisiblePositions).toHaveLength(2);
    expect(ctx.arcCalls.some(({ x, y }) => x === -40 && y === 10)).toBe(false);
    expect(ctx.arcCalls.some(({ x, y }) => x === 250 && y === 30)).toBe(false);
  });

  it('keeps edge-overlap organisms visible and overlays selected entity near boundary', () => {
    const ctx = createMockContext();
    const snapshot = {
      food: [],
      organisms: [
        {
          id: 'edge',
          x: 104,
          y: 50,
          direction: 0,
          age: 10,
          energy: 20,
          traits: { size: 1, visionRange: 12 }
        }
      ]
    };

    drawWorldSnapshot(ctx, snapshot, { width: 100, height: 100 }, { selectedOrganismId: 'edge', cullPadding: 0 });

    const edgeBodyArc = ctx.arcCalls.find(({ x, y, radius }) => x === 104 && y === 50 && radius === 6);
    expect(edgeBodyArc).toBeDefined();
    const selectedOverlayArc = ctx.arcCalls.find(({ x, y, radius }) => x === 104 && y === 50 && radius === 9);
    expect(selectedOverlayArc).toBeDefined();
    const visionArc = ctx.arcCalls.find(({ x, y, radius }) => x === 104 && y === 50 && radius === 12);
    expect(visionArc).toBeDefined();
  });

  it('does not mutate snapshot state whether culling is enabled or disabled', () => {
    const baseSnapshot = {
      tick: 42,
      food: [{ x: 10, y: 10 }, { x: 220, y: 220 }],
      organisms: [{ id: 'a', x: 20, y: 20, direction: 0, energy: 5, age: 2, traits: { size: 1, visionRange: 0 } }]
    };

    const enabledSnapshot = structuredClone(baseSnapshot);
    const disabledSnapshot = structuredClone(baseSnapshot);
    const enabledBefore = JSON.stringify(enabledSnapshot);
    const disabledBefore = JSON.stringify(disabledSnapshot);

    drawWorldSnapshot(createMockContext(), enabledSnapshot, { width: 100, height: 100 }, { enableViewportCulling: true });
    drawWorldSnapshot(createMockContext(), disabledSnapshot, { width: 100, height: 100 }, { enableViewportCulling: false });

    expect(JSON.stringify(enabledSnapshot)).toBe(enabledBefore);
    expect(JSON.stringify(disabledSnapshot)).toBe(disabledBefore);
  });
});
