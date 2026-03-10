/**
 * Canvas renderer for simulation snapshots.
 * Read-only: never mutates simulation state.
 */

import { detectSpecies, getSpeciesColor, getGenerationColor } from './engine';

/**
 * @typedef {import('./engine').WorldState} WorldState
 */

const ORGANISM_BASE_RADIUS = 6;
const DIRECTION_INDICATOR_LENGTH = 4;
const MAX_ENERGY_FOR_BAR = 40;
const HEALTH_DECAY_TICKS = 1000;
const DEFAULT_VIEWPORT_CULL_PADDING = 12;
const FOOD_RADIUS = 3;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function deriveOrganismRadius(organism) {
  const sizeTrait = organism?.traits?.size ?? 1;
  return clamp(ORGANISM_BASE_RADIUS * sizeTrait, 3, 18);
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

  // Detect species once for all organisms
  const speciesMap = detectSpecies(snapshot.organisms, 0.5);

  for (const organism of snapshot.organisms) {
    const radius = deriveOrganismRadius(organism);
    if (viewportCullingEnabled && !isCircleWithinViewport(organism.x, organism.y, radius, width, height, cullPadding)) {
      continue;
    }

    const direction = Number.isFinite(organism.direction) ? organism.direction : 0;
    const headingX = organism.x + Math.cos(direction) * (radius + DIRECTION_INDICATOR_LENGTH);
    const headingY = organism.y + Math.sin(direction) * (radius + DIRECTION_INDICATOR_LENGTH);

    const speciesId = speciesMap.get(organism.id);
    // Use generation-based color tint (section 10.1 of design doc)
    const organismColor = getGenerationColor(organism.generation ?? 0);

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

    if (selectedOrganismId && organism.id === selectedOrganismId) {
      drawSelectedOrganismOverlays(ctx, organism, radius);
    }
  }
}
