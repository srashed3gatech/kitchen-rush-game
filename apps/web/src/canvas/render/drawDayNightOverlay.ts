/**
 * drawDayNightOverlay — composites the day-night tint over the entire scene.
 *
 * Called last in the render pipeline so it sits on top of all scene elements.
 * Uses getDayNightOverlay() from dayNight.ts and paints a full-canvas rect
 * at the computed alpha.
 */

import { getDayNightOverlay } from '../dayNight.js';

export function drawDayNightOverlay(
  ctx: CanvasRenderingContext2D,
  inGameMinute: number,
  width: number,
  height: number,
): void {
  const overlay = getDayNightOverlay(inGameMinute);
  if (overlay.alpha <= 0) return;

  ctx.save();
  ctx.globalAlpha = overlay.alpha;
  ctx.fillStyle = overlay.color;
  ctx.fillRect(0, 0, width, height);
  ctx.restore();
}
