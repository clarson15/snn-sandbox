import { describe, expect, it } from 'vitest';

import { drawWorldSnapshot, deriveBiomeLabel, calculateBiomeLabelPosition } from './renderer';

function createMockContext() {
  let currentFillStyle = null;
  let currentFont = null;
  let currentTextAlign = null;
  let currentTextBaseline = null;
  return {
    arcCalls: [],
    fillRectCalls: [],
    fillCalls: [],
    strokeRectCalls: [],
    moveToCalls: [],
    lineToCalls: [],
    fillTextCalls: [],
    clearRect() {},
    fillRect(x, y, width, height) {
      this.fillRectCalls.push({ x, y, width, height, fillStyle: currentFillStyle });
    },
    strokeRect(x, y, width, height) {
      this.strokeRectCalls.push({ x, y, width, height });
    },
    beginPath() {},
    arc(x, y, radius, startAngle, endAngle) {
      this.arcCalls.push({ x, y, radius, startAngle, endAngle });
    },
    fill() {
      this.fillCalls.push({ fillStyle: currentFillStyle });
    },
    stroke() {},
    moveTo(x, y) {
      this.moveToCalls.push({ x, y });
    },
    lineTo(x, y) {
      this.lineToCalls.push({ x, y });
    },
    fillText(text, x, y) {
      this.fillTextCalls.push({ text, x, y, fillStyle: currentFillStyle, font: currentFont, textAlign: currentTextAlign, textBaseline: currentTextBaseline });
    },
    set fillStyle(value) {
      currentFillStyle = value;
    },
    set strokeStyle(_value) {},
    set lineWidth(_value) {},
    set font(value) {
      currentFont = value;
    },
    set textAlign(value) {
      currentTextAlign = value;
    },
    set textBaseline(value) {
      currentTextBaseline = value;
    }
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

  it('renders organisms using their explicit organism color', () => {
    const ctx = createMockContext();
    const snapshot = {
      tick: 1,
      food: [],
      organisms: [
        { id: 'a', x: 20, y: 20, direction: 0, color: '#123456', traits: { size: 1, visionRange: 0 } },
        { id: 'b', x: 40, y: 20, direction: 0, color: '#abcdef', traits: { size: 1, visionRange: 0 } }
      ]
    };

    drawWorldSnapshot(ctx, snapshot, { width: 100, height: 100 }, { cullPadding: 0 });

    expect(ctx.fillCalls.some(({ fillStyle }) => fillStyle === '#123456')).toBe(true);
    expect(ctx.fillCalls.some(({ fillStyle }) => fillStyle === '#abcdef')).toBe(true);
  });

  it('renders terrain zones with correct colors', () => {
    const ctx = createMockContext();
    const snapshot = {
      tick: 1,
      food: [],
      organisms: [],
      terrainZones: [
        { id: 'zone-1', type: 'plains', bounds: { x: 10, y: 10, width: 30, height: 20 } },
        { id: 'zone-2', type: 'forest', bounds: { x: 50, y: 50, width: 25, height: 25 } },
        { id: 'zone-3', type: 'wetland', bounds: { x: 80, y: 10, width: 15, height: 30 } },
        { id: 'zone-4', type: 'rocky', bounds: { x: 10, y: 60, width: 20, height: 15 } }
      ]
    };

    drawWorldSnapshot(ctx, snapshot, { width: 100, height: 100 }, { cullPadding: 0 });

    // Check that terrain zones are rendered with correct fillRect calls
    const terrainZoneFills = ctx.fillRectCalls.filter(
      (call) => call.x === 10 && call.y === 10 && call.width === 30 && call.height === 20 && call.fillStyle === 'rgba(194, 178, 128, 0.25)'
    );
    expect(terrainZoneFills.length).toBe(1);

    const forestZoneFills = ctx.fillRectCalls.filter(
      (call) => call.x === 50 && call.y === 50 && call.width === 25 && call.height === 25 && call.fillStyle === 'rgba(34, 139, 34, 0.25)'
    );
    expect(forestZoneFills.length).toBe(1);
  });

  it('renders terrain zones under organisms and food', () => {
    const ctx = createMockContext();
    const snapshot = {
      tick: 1,
      food: [{ x: 25, y: 25 }],
      organisms: [{ id: 'a', x: 30, y: 30, direction: 0, color: '#38bdf8', traits: { size: 1, visionRange: 0 } }],
      terrainZones: [
        { id: 'zone-1', type: 'plains', bounds: { x: 0, y: 0, width: 100, height: 100 } }
      ]
    };

    drawWorldSnapshot(ctx, snapshot, { width: 100, height: 100 }, { cullPadding: 0 });

    // Terrain zone fillRect should be called (drawn first, under organisms/food) - check for terrain zone color
    const terrainZoneFills = ctx.fillRectCalls.filter(
      (call) => call.x === 0 && call.y === 0 && call.width === 100 && call.height === 100 && call.fillStyle === 'rgba(194, 178, 128, 0.25)'
    );
    expect(terrainZoneFills.length).toBe(1);
  });

  it('handles missing terrain zones gracefully', () => {
    const ctx = createMockContext();
    const snapshot = {
      tick: 1,
      food: [],
      organisms: []
      // No terrainZones property
    };

    // Should not throw
    expect(() => {
      drawWorldSnapshot(ctx, snapshot, { width: 100, height: 100 });
    }).not.toThrow();
  });
});

describe('deriveBiomeLabel', () => {
  it('returns correct label for known biome types', () => {
    expect(deriveBiomeLabel('plains')).toBe('Plains');
    expect(deriveBiomeLabel('forest')).toBe('Forest');
    expect(deriveBiomeLabel('wetland')).toBe('Wetland');
    expect(deriveBiomeLabel('rocky')).toBe('Rocky');
  });

  it('returns empty string for unknown biome types', () => {
    expect(deriveBiomeLabel('unknown')).toBe('');
    expect(deriveBiomeLabel('')).toBe('');
    expect(deriveBiomeLabel('desert')).toBe('');
  });
});

describe('calculateBiomeLabelPosition', () => {
  it('calculates center position correctly', () => {
    const bounds = { x: 10, y: 20, width: 100, height: 50 };
    const pos = calculateBiomeLabelPosition(bounds);
    expect(pos.x).toBe(60);  // 10 + 100/2
    expect(pos.y).toBe(45);  // 20 + 50/2
  });

  it('handles small zones', () => {
    const bounds = { x: 0, y: 0, width: 10, height: 10 };
    const pos = calculateBiomeLabelPosition(bounds);
    expect(pos.x).toBe(5);
    expect(pos.y).toBe(5);
  });

  it('handles non-zero origin', () => {
    const bounds = { x: 50, y: 50, width: 20, height: 20 };
    const pos = calculateBiomeLabelPosition(bounds);
    expect(pos.x).toBe(60);
    expect(pos.y).toBe(60);
  });
});

describe('drawWorldSnapshot biome labels', () => {
  it('renders biome labels centered in terrain zones', () => {
    const ctx = createMockContext();
    const snapshot = {
      tick: 1,
      food: [],
      organisms: [],
      terrainZones: [
        { id: 'zone-1', type: 'plains', bounds: { x: 10, y: 10, width: 40, height: 30 } },
        { id: 'zone-2', type: 'forest', bounds: { x: 60, y: 60, width: 30, height: 30 } }
      ]
    };

    drawWorldSnapshot(ctx, snapshot, { width: 100, height: 100 }, { cullPadding: 0 });

    // Check that labels are drawn at the center of each zone
    const plainsLabel = ctx.fillTextCalls.find(call => call.text === 'Plains');
    expect(plainsLabel).toBeDefined();
    expect(plainsLabel.x).toBe(30);  // 10 + 40/2
    expect(plainsLabel.y).toBe(25);  // 10 + 30/2

    const forestLabel = ctx.fillTextCalls.find(call => call.text === 'Forest');
    expect(forestLabel).toBeDefined();
    expect(forestLabel.x).toBe(75);  // 60 + 30/2
    expect(forestLabel.y).toBe(75);  // 60 + 30/2
  });

  it('does not render labels for unknown biome types', () => {
    const ctx = createMockContext();
    const snapshot = {
      tick: 1,
      food: [],
      organisms: [],
      terrainZones: [
        { id: 'zone-1', type: 'unknown', bounds: { x: 0, y: 0, width: 50, height: 50 } }
      ]
    };

    drawWorldSnapshot(ctx, snapshot, { width: 100, height: 100 }, { cullPadding: 0 });

    // No text should be drawn for unknown biome types
    expect(ctx.fillTextCalls.length).toBe(0);
  });

  it('renders labels for all supported biome types', () => {
    const ctx = createMockContext();
    const snapshot = {
      tick: 1,
      food: [],
      organisms: [],
      terrainZones: [
        { id: 'p', type: 'plains', bounds: { x: 0, y: 0, width: 20, height: 20 } },
        { id: 'f', type: 'forest', bounds: { x: 25, y: 0, width: 20, height: 20 } },
        { id: 'w', type: 'wetland', bounds: { x: 50, y: 0, width: 20, height: 20 } },
        { id: 'r', type: 'rocky', bounds: { x: 75, y: 0, width: 20, height: 20 } }
      ]
    };

    drawWorldSnapshot(ctx, snapshot, { width: 100, height: 100 }, { cullPadding: 0 });

    const labels = ctx.fillTextCalls.map(call => call.text);
    expect(labels).toContain('Plains');
    expect(labels).toContain('Forest');
    expect(labels).toContain('Wetland');
    expect(labels).toContain('Rocky');
  });
});
