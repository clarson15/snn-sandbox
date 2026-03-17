/**
 * Canvas renderer for simulation snapshots.
 * Read-only: never mutates simulation state.
 */

import { resolveExpressedTraits } from './engine';

/**
 * @typedef {import('./engine').WorldState} WorldState
 */

const ORGANISM_BASE_RADIUS = 6;
const DIRECTION_INDICATOR_LENGTH = 4;
const MAX_ENERGY_FOR_BAR = 40;
const HEALTH_DECAY_TICKS = 1000;
const DEFAULT_VIEWPORT_CULL_PADDING = 12;
const FOOD_RADIUS = 3;

// Hazard type visual configurations
const HAZARD_STYLES = {
  lava: {
    innerColor: [239, 68, 68],    // Red
    outerColor: [220, 38, 38],    // Darker red
    accentColor: 'rgba(249, 115, 22, 0.8)'  // Orange accent
  },
  acid: {
    innerColor: [34, 197, 94],    // Green
    outerColor: [22, 163, 74],    // Darker green
    accentColor: 'rgba(132, 204, 22, 0.8)'  // Lime accent
  },
  radiation: {
    innerColor: [234, 179, 8],    // Yellow
    outerColor: [202, 138, 4],    // Darker yellow
    accentColor: 'rgba(168, 85, 247, 0.8)'  // Purple accent
  }
};

// Terrain zone type visual configurations
const TERRAIN_ZONE_STYLES = {
  plains: {
    color: 'rgba(194, 178, 128, 0.25)',    // Light tan/sandy
    borderColor: 'rgba(194, 178, 128, 0.5)',
    labelColor: '#c2b280'
  },
  forest: {
    color: 'rgba(34, 139, 34, 0.25)',       // Forest green
    borderColor: 'rgba(34, 139, 34, 0.5)',
    labelColor: '#228b22'
  },
  wetland: {
    color: 'rgba(72, 209, 204, 0.25)',      // Medium turquoise
    borderColor: 'rgba(72, 209, 204, 0.5)',
    labelColor: '#48d1d0'
  },
  rocky: {
    color: 'rgba(128, 128, 128, 0.25)',     // Gray
    borderColor: 'rgba(128, 128, 128, 0.5)',
    labelColor: '#a8a8a8'
  }
};

// Biome type to display label mapping
const BIOME_LABELS = {
  plains: 'Plains',
  forest: 'Forest',
  wetland: 'Wetland',
  rocky: 'Rocky'
};

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function deriveOrganismRadius(organism) {
  const sizeTrait = resolveExpressedTraits(organism).size ?? 1;
  return clamp(ORGANISM_BASE_RADIUS * sizeTrait, 3, 18);
}

function isEggStage(organism) {
  return organism?.lifeStage === 'egg';
}

function isCircleWithinViewport(x, y, radius, width, height, padding) {
  return !(
    x + radius < -padding ||
    x - radius > width + padding ||
    y + radius < -padding ||
    y - radius > height + padding
  );
}

function drawBar(ctx, x, y, width, height, ratio, fillStyle) {
  const clampedRatio = clamp(ratio, 0, 1);

  ctx.fillStyle = '#0f172a';
  ctx.fillRect(x, y, width, height);

  ctx.fillStyle = fillStyle;
  ctx.fillRect(x, y, width * clampedRatio, height);

  ctx.strokeStyle = '#94a3b8';
  ctx.lineWidth = 1;
  ctx.strokeRect(x, y, width, height);
}

/**
 * Draw a hazard zone with type-specific visual styling
 */
function drawHazardZone(ctx, zone, tick) {
  const style = HAZARD_STYLES[zone.type] || HAZARD_STYLES.lava;
  const [innerR, innerG, innerB] = style.innerColor;
  const [outerR, outerG, outerB] = style.outerColor;
  
  // Pulsing effect based on tick
  const pulseAlpha = 0.15 + 0.1 * Math.sin(tick * 0.1);
  
  // Create radial gradient for the hazard
  const gradient = ctx.createRadialGradient(zone.x, zone.y, 0, zone.x, zone.y, zone.radius);
  gradient.addColorStop(0, `rgba(${innerR}, ${innerG}, ${innerB}, ${pulseAlpha + 0.1})`);
  gradient.addColorStop(0.5, `rgba(${innerR}, ${innerG}, ${innerB}, ${pulseAlpha})`);
  gradient.addColorStop(0.8, `rgba(${outerR}, ${outerG}, ${outerB}, ${pulseAlpha * 0.5})`);
  gradient.addColorStop(1, `rgba(${outerR}, ${outerG}, ${outerB}, 0)`);

  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(zone.x, zone.y, zone.radius, 0, Math.PI * 2);
  ctx.fill();

  // Draw border with accent color
  ctx.strokeStyle = style.accentColor;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(zone.x, zone.y, zone.radius, 0, Math.PI * 2);
  ctx.stroke();

  // Draw inner circle for additional visual depth
  ctx.strokeStyle = `rgba(${innerR}, ${innerG}, ${innerB}, 0.4)`;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(zone.x, zone.y, zone.radius * 0.6, 0, Math.PI * 2);
  ctx.stroke();
}

/**
 * Derive the display label text for a biome type
 * @param {string} biomeType - The terrain zone type (e.g., 'plains', 'forest')
 * @returns {string} The display label (e.g., 'Plains', 'Forest') or empty string if unknown
 */
export function deriveBiomeLabel(biomeType) {
  return BIOME_LABELS[biomeType] ?? '';
}

/**
 * Calculate the center position for a biome label based on zone bounds
 * @param {{x: number, y: number, width: number, height: number}} bounds - Zone bounds
 * @returns {{x: number, y: number}} Center coordinates for the label
 */
export function calculateBiomeLabelPosition(bounds) {
  return {
    x: bounds.x + bounds.width / 2,
    y: bounds.y + bounds.height / 2
  };
}

/**
 * Draw a terrain zone with type-specific visual styling
 */
function drawTerrainZone(ctx, zone) {
  const style = TERRAIN_ZONE_STYLES[zone.type] || TERRAIN_ZONE_STYLES.plains;
  const bounds = zone.bounds;

  // Draw filled rectangle with zone color
  ctx.fillStyle = style.color;
  ctx.fillRect(bounds.x, bounds.y, bounds.width, bounds.height);

  // Draw border with zone border color
  ctx.strokeStyle = style.borderColor;
  ctx.lineWidth = 1;
  ctx.strokeRect(bounds.x, bounds.y, bounds.width, bounds.height);

  // Draw biome label centered in the zone
  const label = deriveBiomeLabel(zone.type);
  if (label) {
    const pos = calculateBiomeLabelPosition(bounds);
    ctx.font = '12px sans-serif';
    ctx.fillStyle = style.labelColor || '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, pos.x, pos.y);
  }
}

function drawSelectedOrganismOverlays(ctx, organism, radius) {
  ctx.beginPath();
  ctx.strokeStyle = '#facc15';
  ctx.lineWidth = 3;
  ctx.arc(organism.x, organism.y, radius + 3, 0, Math.PI * 2);
  ctx.stroke();

  const visionRange = organism?.traits?.visionRange ?? 0;

  if (visionRange > 0) {
    ctx.beginPath();
    ctx.strokeStyle = 'rgba(59, 130, 246, 0.6)';
    ctx.lineWidth = 1.5;
    ctx.arc(organism.x, organism.y, visionRange, 0, Math.PI * 2);
    ctx.stroke();
  }

  const barWidth = Math.max(16, radius * 2.2);
  const barHeight = 4;
  const barX = organism.x - barWidth / 2;
  const energyBarY = organism.y - radius - 12;
  const healthBarY = energyBarY - 6;

  const energyRatio = clamp((organism.energy ?? 0) / MAX_ENERGY_FOR_BAR, 0, 1);
  const healthRatio = clamp(1 - ((organism.age ?? 0) / HEALTH_DECAY_TICKS), 0, 1);

  drawBar(ctx, barX, healthBarY, barWidth, barHeight, healthRatio, '#ef4444');
  drawBar(ctx, barX, energyBarY, barWidth, barHeight, energyRatio, '#22c55e');
}

/**
 * Draw a world snapshot onto a 2D canvas context.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {WorldState} snapshot
 * @param {{width: number, height: number}} viewport
 * @param {{selectedOrganismId?: string|null, enableViewportCulling?: boolean, cullPadding?: number}} [renderOptions]
 */
export function drawWorldSnapshot(ctx, snapshot, viewport, renderOptions = {}) {
  const { width, height } = viewport;
  const selectedOrganismId = renderOptions.selectedOrganismId ?? null;
  const cullPadding = Number.isFinite(renderOptions.cullPadding)
    ? Math.max(0, renderOptions.cullPadding)
    : DEFAULT_VIEWPORT_CULL_PADDING;
  const viewportCullingEnabled = renderOptions.enableViewportCulling ?? true;

  ctx.clearRect(0, 0, width, height);

  ctx.fillStyle = '#020617';
  ctx.fillRect(0, 0, width, height);

  // Draw danger zones (under everything)
  if (snapshot.dangerZones) {
    for (const zone of snapshot.dangerZones) {
      drawHazardZone(ctx, zone, snapshot.tick ?? 0);
    }
  }

  // Draw obstacles
  if (snapshot.obstacles) {
    for (const obstacle of snapshot.obstacles) {
      ctx.fillStyle = '#475569';
      ctx.strokeStyle = '#64748b';
      ctx.lineWidth = 2;

      // Draw rectangle with rounded appearance
      const x = Math.max(0, obstacle.x);
      const y = Math.max(0, obstacle.y);
      const w = obstacle.width;
      const h = obstacle.height;

      ctx.fillRect(x, y, w, h);
      ctx.strokeRect(x, y, w, h);

      // Add diagonal stripe pattern for visual distinction
      ctx.strokeStyle = '#334155';
      ctx.lineWidth = 1;
      for (let i = -h; i < w; i += 10) {
        ctx.beginPath();
        ctx.moveTo(x + i, y);
        ctx.lineTo(x + i + h, y + h);
        ctx.stroke();
      }
    }
  }

  // Draw terrain zones (under food and organisms but above background)
  if (snapshot.terrainZones) {
    for (const zone of snapshot.terrainZones) {
      drawTerrainZone(ctx, zone);
    }
  }

  // Food first (under organisms)
  ctx.fillStyle = '#22c55e';
  for (const food of snapshot.food) {
    if (viewportCullingEnabled && !isCircleWithinViewport(food.x, food.y, FOOD_RADIUS, width, height, cullPadding)) {
      continue;
    }

    ctx.beginPath();
    ctx.arc(food.x, food.y, FOOD_RADIUS, 0, Math.PI * 2);
    ctx.fill();
  }

  for (const organism of snapshot.organisms) {
    const radius = deriveOrganismRadius(organism);
    if (viewportCullingEnabled && !isCircleWithinViewport(organism.x, organism.y, radius, width, height, cullPadding)) {
      continue;
    }

    const organismColor = organism.color ?? '#38bdf8';

    if (isEggStage(organism)) {
      ctx.fillStyle = '#f8fafc';
      ctx.beginPath();
      ctx.ellipse(organism.x, organism.y, radius * 0.8, radius, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = organismColor;
      ctx.lineWidth = 2;
      ctx.stroke();
    } else {
      const direction = Number.isFinite(organism.direction) ? organism.direction : 0;
      const headingX = organism.x + Math.cos(direction) * (radius + DIRECTION_INDICATOR_LENGTH);
      const headingY = organism.y + Math.sin(direction) * (radius + DIRECTION_INDICATOR_LENGTH);

      ctx.fillStyle = organismColor;
      ctx.beginPath();
      ctx.arc(organism.x, organism.y, radius, 0, Math.PI * 2);
      ctx.fill();

      ctx.beginPath();
      ctx.strokeStyle = '#e2e8f0';
      ctx.lineWidth = 1.5;
      ctx.moveTo(organism.x, organism.y);
      ctx.lineTo(headingX, headingY);
      ctx.stroke();
    }

    if (selectedOrganismId && organism.id === selectedOrganismId) {
      drawSelectedOrganismOverlays(ctx, organism, radius);
    }
  }
}
