import { describe, expect, it } from 'vitest';

import { drawWorldSnapshot, deriveBiomeLabel, calculateBiomeLabelPosition, deriveHazardLabel, calculateHazardLabelPosition } from './renderer';

function createMockContext() {
  let currentFillStyle = null;
  let currentFont = null;
  let currentTextAlign = null;
  let currentTextBaseline = null;
  let currentShadowColor = null;
  let currentShadowBlur = null;
  let currentLineWidth = null;
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
      this.arcCalls.push({ x, y, radius, startAngle, endAngle, lineWidth: currentLineWidth });
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
      this.fillTextCalls.push({ text, x, y, fillStyle: currentFillStyle, font: currentFont, textAlign: currentTextAlign, textBaseline: currentTextBaseline, shadowColor: currentShadowColor, shadowBlur: currentShadowBlur });
    },
    createRadialGradient(x1, y1, r1, x2, y2, r2) {
      return {
        addColorStop: () => {}
      };
    },
    createRadialGradient(x1, y1, r1, x2, y2, r2) {
      // Return a mock gradient object with addColorStop
      return {
        addColorStop(offset, color) {
          // No-op for testing
        }
      };
    },
    set fillStyle(value) {
      currentFillStyle = value;
    },
    set strokeStyle(_value) {},
    set lineWidth(value) {
      currentLineWidth = value;
    },
    set font(value) {
      currentFont = value;
    },
    set textAlign(value) {
      currentTextAlign = value;
    },
    set textBaseline(value) {
      currentTextBaseline = value;
    },
    set shadowColor(value) {
      currentShadowColor = value;
    },
    set shadowBlur(value) {
      currentShadowBlur = value;
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

  // SSN-281: Zone highlighting for selected organism
  describe('zone highlighting when organism is selected', () => {
    it('highlights terrain zone when selected organism is inside it', () => {
      const ctx = createMockContext();
      const snapshot = {
        tick: 1,
        food: [],
        organisms: [
          { id: 'org-1', x: 50, y: 50, direction: 0, color: '#38bdf8', traits: { size: 1, visionRange: 0 } }
        ],
        terrainZones: [
          { id: 'zone-1', type: 'plains', bounds: { x: 0, y: 0, width: 100, height: 100 } }
        ]
      };

      // When organism is inside terrain zone, highlighted version should be rendered
      drawWorldSnapshot(ctx, snapshot, { width: 100, height: 100 }, { selectedOrganismId: 'org-1', cullPadding: 0 });

      // Check that highlighted terrain zone is rendered (opacity 0.45 instead of 0.25)
      const highlightedTerrainFills = ctx.fillRectCalls.filter(
        (call) => call.x === 0 && call.y === 0 && call.width === 100 && call.height === 100 && call.fillStyle === 'rgba(194, 178, 128, 0.45)'
      );
      expect(highlightedTerrainFills.length).toBe(1);
    });

    it('does not highlight terrain zone when selected organism is outside it', () => {
      const ctx = createMockContext();
      const snapshot = {
        tick: 1,
        food: [],
        organisms: [
          { id: 'org-1', x: 150, y: 150, direction: 0, color: '#38bdf8', traits: { size: 1, visionRange: 0 } }
        ],
        terrainZones: [
          { id: 'zone-1', type: 'plains', bounds: { x: 0, y: 0, width: 100, height: 100 } }
        ]
      };

      // When organism is outside terrain zone, normal version should be rendered
      drawWorldSnapshot(ctx, snapshot, { width: 200, height: 200 }, { selectedOrganismId: 'org-1', cullPadding: 0 });

      // Check that normal (non-highlighted) terrain zone is rendered
      const normalTerrainFills = ctx.fillRectCalls.filter(
        (call) => call.x === 0 && call.y === 0 && call.width === 100 && call.height === 100 && call.fillStyle === 'rgba(194, 178, 128, 0.25)'
      );
      expect(normalTerrainFills.length).toBe(1);
    });

    it('highlights danger zone when selected organism is inside it', () => {
      const ctx = createMockContext();
      const snapshot = {
        tick: 1,
        food: [],
        organisms: [
          { id: 'org-1', x: 50, y: 50, direction: 0, color: '#38bdf8', traits: { size: 1, visionRange: 0 } }
        ],
        dangerZones: [
          { id: 'danger-1', type: 'lava', x: 50, y: 50, radius: 30 }
        ]
      };

      // When organism is inside danger zone, highlighted version should be rendered
      drawWorldSnapshot(ctx, snapshot, { width: 100, height: 100 }, { selectedOrganismId: 'org-1', cullPadding: 0 });

      // Get all arc calls for the danger zone (both outer circle at radius 30 and inner at radius 18)
      const dangerZoneArcs = ctx.arcCalls.filter(
        (call) => call.x === 50 && call.y === 50
      );
      expect(dangerZoneArcs.length).toBeGreaterThan(0);

      // Verify there's an outer border arc with highlighted lineWidth (4 instead of 2)
      const outerBorderArc = dangerZoneArcs.find(call => call.radius === 30 && call.lineWidth === 4);
      expect(outerBorderArc).toBeDefined();

      // Verify there's an inner circle arc with highlighted lineWidth (2 instead of 1)
      const innerCircleArc = dangerZoneArcs.find(call => call.radius === 18 && call.lineWidth === 2);
      expect(innerCircleArc).toBeDefined();
    });

    it('does not highlight danger zone when selected organism is outside it', () => {
      const ctx = createMockContext();
      const snapshot = {
        tick: 1,
        food: [],
        organisms: [
          { id: 'org-1', x: 150, y: 150, direction: 0, color: '#38bdf8', traits: { size: 1, visionRange: 0 } }
        ],
        dangerZones: [
          { id: 'danger-1', type: 'lava', x: 50, y: 50, radius: 30 }
        ]
      };

      // When organism is outside danger zone, normal version should be rendered
      drawWorldSnapshot(ctx, snapshot, { width: 200, height: 200 }, { selectedOrganismId: 'org-1', cullPadding: 0 });

      // Get all arc calls for the danger zone
      const dangerZoneArcs = ctx.arcCalls.filter(
        (call) => call.x === 50 && call.y === 50
      );
      expect(dangerZoneArcs.length).toBeGreaterThan(0);

      // Verify the outer border is drawn with baseline lineWidth (2, not highlighted 4)
      const outerBorderArc = dangerZoneArcs.find(call => call.radius === 30 && call.lineWidth === 2);
      expect(outerBorderArc).toBeDefined();

      // Verify inner circle is drawn with baseline lineWidth (1, not highlighted 2)
      const innerCircleArc = dangerZoneArcs.find(call => call.radius === 18 && call.lineWidth === 1);
      expect(innerCircleArc).toBeDefined();
    });

    it('does not highlight zones when no organism is selected', () => {
      const ctx = createMockContext();
      const snapshot = {
        tick: 1,
        food: [],
        organisms: [
          { id: 'org-1', x: 50, y: 50, direction: 0, color: '#38bdf8', traits: { size: 1, visionRange: 0 } }
        ],
        terrainZones: [
          { id: 'zone-1', type: 'plains', bounds: { x: 0, y: 0, width: 100, height: 100 } }
        ],
        dangerZones: [
          { id: 'danger-1', type: 'lava', x: 50, y: 50, radius: 30 }
        ]
      };

      // No selected organism - zones should render normally
      drawWorldSnapshot(ctx, snapshot, { width: 100, height: 100 }, { cullPadding: 0 });

      // Check that normal terrain zone is rendered (not highlighted)
      const normalTerrainFills = ctx.fillRectCalls.filter(
        (call) => call.x === 0 && call.y === 0 && call.width === 100 && call.height === 100 && call.fillStyle === 'rgba(194, 178, 128, 0.25)'
      );
      expect(normalTerrainFills.length).toBe(1);

      // Verify danger zone is rendered with baseline lineWidth (not highlighted)
      const dangerZoneArcs = ctx.arcCalls.filter(
        (call) => call.x === 50 && call.y === 50
      );
      const outerBorderArc = dangerZoneArcs.find(call => call.radius === 30 && call.lineWidth === 2);
      expect(outerBorderArc).toBeDefined();

      const innerCircleArc = dangerZoneArcs.find(call => call.radius === 18 && call.lineWidth === 1);
      expect(innerCircleArc).toBeDefined();
    });

    it('handles multiple terrain zones with selected organism in one of them', () => {
      const ctx = createMockContext();
      const snapshot = {
        tick: 1,
        food: [],
        organisms: [
          { id: 'org-1', x: 25, y: 25, direction: 0, color: '#38bdf8', traits: { size: 1, visionRange: 0 } }
        ],
        terrainZones: [
          { id: 'zone-1', type: 'plains', bounds: { x: 0, y: 0, width: 50, height: 50 } },  // org inside
          { id: 'zone-2', type: 'forest', bounds: { x: 60, y: 60, width: 40, height: 40 } }  // org outside
        ]
      };

      drawWorldSnapshot(ctx, snapshot, { width: 100, height: 100 }, { selectedOrganismId: 'org-1', cullPadding: 0 });

      // Zone 1 should be highlighted (opacity 0.45)
      const highlightedZone = ctx.fillRectCalls.filter(
        (call) => call.x === 0 && call.y === 0 && call.width === 50 && call.height === 50 && call.fillStyle === 'rgba(194, 178, 128, 0.45)'
      );
      expect(highlightedZone.length).toBe(1);

      // Zone 2 should not be highlighted (opacity 0.25)
      const normalZone = ctx.fillRectCalls.filter(
        (call) => call.x === 60 && call.y === 60 && call.width === 40 && call.height === 40 && call.fillStyle === 'rgba(34, 139, 34, 0.25)'
      );
      expect(normalZone.length).toBe(1);
    });
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

describe('deriveHazardLabel', () => {
  it('returns correct label for known hazard types', () => {
    expect(deriveHazardLabel('lava')).toBe('Lava');
    expect(deriveHazardLabel('acid')).toBe('Acid');
    expect(deriveHazardLabel('radiation')).toBe('Radiation');
  });

  it('returns empty string for unknown hazard types', () => {
    expect(deriveHazardLabel('unknown')).toBe('');
    expect(deriveHazardLabel('')).toBe('');
    expect(deriveHazardLabel('fire')).toBe('');
  });

  it('returns empty string for undefined or null', () => {
    expect(deriveHazardLabel(undefined)).toBe('');
    expect(deriveHazardLabel(null)).toBe('');
  });
});

describe('calculateHazardLabelPosition', () => {
  it('calculates center position from zone center', () => {
    const zone = { x: 50, y: 75, radius: 20 };
    const pos = calculateHazardLabelPosition(zone);
    expect(pos.x).toBe(50);
    expect(pos.y).toBe(75);
  });

  it('handles zone at origin', () => {
    const zone = { x: 0, y: 0, radius: 10 };
    const pos = calculateHazardLabelPosition(zone);
    expect(pos.x).toBe(0);
    expect(pos.y).toBe(0);
  });

  it('uses zone center regardless of radius', () => {
    const zone = { x: 100, y: 200, radius: 50 };
    const pos = calculateHazardLabelPosition(zone);
    expect(pos.x).toBe(100);
    expect(pos.y).toBe(200);
  });
});

describe('drawWorldSnapshot hazard labels', () => {
  it('renders hazard labels centered in danger zones', () => {
    const ctx = createMockContext();
    const snapshot = {
      tick: 1,
      food: [],
      organisms: [],
      dangerZones: [
        { id: 'lava-zone', type: 'lava', x: 25, y: 25, radius: 20, damagePerTick: 5 },
        { id: 'acid-zone', type: 'acid', x: 75, y: 75, radius: 15, damagePerTick: 3 }
      ]
    };

    drawWorldSnapshot(ctx, snapshot, { width: 100, height: 100 }, { cullPadding: 0 });

    // Check that labels are drawn at the center of each zone
    const lavaLabel = ctx.fillTextCalls.find(call => call.text === 'Lava');
    expect(lavaLabel).toBeDefined();
    expect(lavaLabel.x).toBe(25);
    expect(lavaLabel.y).toBe(25);

    const acidLabel = ctx.fillTextCalls.find(call => call.text === 'Acid');
    expect(acidLabel).toBeDefined();
    expect(acidLabel.x).toBe(75);
    expect(acidLabel.y).toBe(75);
  });

  it('does not render labels for unknown hazard types', () => {
    const ctx = createMockContext();
    const snapshot = {
      tick: 1,
      food: [],
      organisms: [],
      dangerZones: [
        { id: 'unknown-zone', type: 'unknown', x: 50, y: 50, radius: 20, damagePerTick: 5 }
      ]
    };

    drawWorldSnapshot(ctx, snapshot, { width: 100, height: 100 }, { cullPadding: 0 });

    // No text should be drawn for unknown hazard types
    expect(ctx.fillTextCalls.length).toBe(0);
  });

  it('renders labels for all supported hazard types', () => {
    const ctx = createMockContext();
    const snapshot = {
      tick: 1,
      food: [],
      organisms: [],
      dangerZones: [
        { id: 'lava', type: 'lava', x: 20, y: 20, radius: 10, damagePerTick: 5 },
        { id: 'acid', type: 'acid', x: 50, y: 20, radius: 10, damagePerTick: 3 },
        { id: 'radiation', type: 'radiation', x: 80, y: 20, radius: 10, damagePerTick: 2 }
      ]
    };

    drawWorldSnapshot(ctx, snapshot, { width: 100, height: 100 }, { cullPadding: 0 });

    const labels = ctx.fillTextCalls.map(call => call.text);
    expect(labels).toContain('Lava');
    expect(labels).toContain('Acid');
    expect(labels).toContain('Radiation');
  });

  it('handles missing danger zones gracefully', () => {
    const ctx = createMockContext();
    const snapshot = {
      tick: 1,
      food: [],
      organisms: []
      // No dangerZones property
    };

    // Should not throw
    expect(() => {
      drawWorldSnapshot(ctx, snapshot, { width: 100, height: 100 });
    }).not.toThrow();
  });

  it('handles danger zones without type property (legacy)', () => {
    const ctx = createMockContext();
    const snapshot = {
      tick: 1,
      food: [],
      organisms: [],
      dangerZones: [
        // Legacy zone without type - should use default styling and not crash
        { id: 'legacy-zone', x: 50, y: 50, radius: 20, damagePerTick: 5 }
      ]
    };

    // Should not throw and should render with fallback (empty label for unknown type)
    expect(() => {
      drawWorldSnapshot(ctx, snapshot, { width: 100, height: 100 });
    }).not.toThrow();
    
    // No label should be drawn for legacy zones without type
    expect(ctx.fillTextCalls.length).toBe(0);
  });

  it('renders hazard labels with bold font and white fill', () => {
    const ctx = createMockContext();
    const snapshot = {
      tick: 1,
      food: [],
      organisms: [],
      dangerZones: [
        { id: 'lava-zone', type: 'lava', x: 50, y: 50, radius: 20, damagePerTick: 5 }
      ]
    };

    drawWorldSnapshot(ctx, snapshot, { width: 100, height: 100 }, { cullPadding: 0 });

    const label = ctx.fillTextCalls.find(call => call.text === 'Lava');
    expect(label).toBeDefined();
    expect(label.font).toBe('bold 12px sans-serif');
    expect(label.fillStyle).toBe('#ffffff');
    expect(label.textAlign).toBe('center');
    expect(label.textBaseline).toBe('middle');
    expect(label.shadowColor).toBe('rgba(0, 0, 0, 0.8)');
    expect(label.shadowBlur).toBe(3);
  });
});
