/**
 * Canvas renderer for simulation snapshots.
 * Read-only: never mutates simulation state.
 */

/**
 * @typedef {import('./engine').WorldState} WorldState
 */

/**
 * Draw a world snapshot onto a 2D canvas context.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {WorldState} snapshot
 * @param {{width: number, height: number}} viewport
 */
export function drawWorldSnapshot(ctx, snapshot, viewport) {
  const { width, height } = viewport;

  ctx.clearRect(0, 0, width, height);

  ctx.fillStyle = '#020617';
  ctx.fillRect(0, 0, width, height);

  // Food first (under organisms)
  ctx.fillStyle = '#22c55e';
  for (const food of snapshot.food) {
    ctx.beginPath();
    ctx.arc(food.x, food.y, 3, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.fillStyle = '#38bdf8';
  for (const organism of snapshot.organisms) {
    ctx.beginPath();
    ctx.arc(organism.x, organism.y, 6, 0, Math.PI * 2);
    ctx.fill();
  }
}
