/**
 * drawBeach — procedural ocean/beach background.
 *
 * Renders (bottom to top of canvas):
 *   sand → wet sand → shallow water → ocean → horizon → sky
 *
 * Also animates shimmer particles along the wet-sand line using a time
 * accumulator passed in by the RAF loop.
 *
 * Canvas layout (960×600):
 *   y 0–240   sky gradient
 *   y 240–340 ocean
 *   y 340–380 horizon mist / shallow water
 *   y 380–440 wet sand (shimmer particles here)
 *   y 440–600 dry sand
 */

export interface BeachDrawOptions {
  ctx: CanvasRenderingContext2D;
  /** Monotonically increasing real-time milliseconds (from performance.now()). */
  timeMs: number;
  width: number;
  height: number;
}

/** Small shimmer particle. State is deterministic from seed + time. */
function drawShimmerParticles(
  ctx: CanvasRenderingContext2D,
  timeMs: number,
  width: number,
  wetSandY: number,
  wetSandH: number,
): void {
  const count = 28;
  const t = timeMs / 1000;

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';

  for (let i = 0; i < count; i++) {
    // Deterministic positions from index seed
    const seed1 = (i * 127.1 + 311.7) % 1;
    const seed2 = (i * 269.5 + 183.3) % 1;
    const seed3 = (i * 419.2 + 97.6) % 1;

    const x = (seed1 * width + Math.sin(t * 0.8 + i) * 12) % width;
    const yOff = seed2 * wetSandH;
    const phase = seed3 * Math.PI * 2;
    const pulse = (Math.sin(t * 2.5 + phase) + 1) / 2; // 0–1

    const radius = 1.5 + pulse * 2.5;
    const alpha = 0.15 + pulse * 0.35;

    ctx.beginPath();
    ctx.arc(x, wetSandY + yOff, radius, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(160,210,255,${alpha.toFixed(2)})`;
    ctx.fill();
  }

  ctx.restore();
}

export function drawBeach(opts: BeachDrawOptions): void {
  const { ctx, timeMs, width, height } = opts;

  // ── Sky gradient ──────────────────────────────────────────────────────────
  const skyBottom = height * 0.40; // y=240
  const skyGrad = ctx.createLinearGradient(0, 0, 0, skyBottom);
  skyGrad.addColorStop(0.0, '#87CEEB');    // light sky blue
  skyGrad.addColorStop(0.6, '#B0D8F0');
  skyGrad.addColorStop(1.0, '#D6EEF8');   // near-horizon pale
  ctx.fillStyle = skyGrad;
  ctx.fillRect(0, 0, width, skyBottom);

  // ── Ocean ─────────────────────────────────────────────────────────────────
  const oceanTop = skyBottom;
  const oceanBottom = height * 0.63; // y=380
  const oceanGrad = ctx.createLinearGradient(0, oceanTop, 0, oceanBottom);
  oceanGrad.addColorStop(0.0, '#2E86AB');   // deep ocean blue
  oceanGrad.addColorStop(0.55, '#4AADCC');
  oceanGrad.addColorStop(1.0, '#7CC8D8');  // shallow turquoise
  ctx.fillStyle = oceanGrad;
  ctx.fillRect(0, oceanTop, width, oceanBottom - oceanTop);

  // Gentle wave lines
  const t = timeMs / 1000;
  ctx.save();
  ctx.strokeStyle = 'rgba(255,255,255,0.18)';
  ctx.lineWidth = 1.5;
  for (let w = 0; w < 3; w++) {
    const baseY = oceanTop + (w + 1) * ((oceanBottom - oceanTop) / 4);
    const speed = 0.4 + w * 0.15;
    ctx.beginPath();
    for (let x = 0; x <= width; x += 4) {
      const y = baseY + Math.sin((x / 60) + t * speed + w * 1.3) * 2.5;
      if (x === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  ctx.restore();

  // ── Wet sand / surf zone ─────────────────────────────────────────────────
  const wetSandTop = oceanBottom;
  const wetSandBottom = height * 0.73; // y=438
  const wetSandGrad = ctx.createLinearGradient(0, wetSandTop, 0, wetSandBottom);
  wetSandGrad.addColorStop(0.0, '#A0C8B8');   // seafoam
  wetSandGrad.addColorStop(0.4, '#C8B88A');   // wet sand
  wetSandGrad.addColorStop(1.0, '#D4A96A');   // damp sand
  ctx.fillStyle = wetSandGrad;
  ctx.fillRect(0, wetSandTop, width, wetSandBottom - wetSandTop);

  // Shimmer particles in wet-sand zone
  drawShimmerParticles(ctx, timeMs, width, wetSandTop, wetSandBottom - wetSandTop);

  // ── Dry sand ──────────────────────────────────────────────────────────────
  const sandGrad = ctx.createLinearGradient(0, wetSandBottom, 0, height);
  sandGrad.addColorStop(0.0, '#E8C87A');   // golden sand
  sandGrad.addColorStop(0.5, '#F0D090');
  sandGrad.addColorStop(1.0, '#F5DCA0');
  ctx.fillStyle = sandGrad;
  ctx.fillRect(0, wetSandBottom, width, height - wetSandBottom);

  // Subtle sand texture dots
  ctx.save();
  ctx.globalAlpha = 0.08;
  for (let i = 0; i < 60; i++) {
    const sx = (i * 173.13) % width;
    const sy = wetSandBottom + (i * 97.3) % (height - wetSandBottom);
    ctx.fillStyle = '#C8A050';
    ctx.beginPath();
    ctx.arc(sx, sy, 1.2, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  // ── Restaurant building silhouette (back wall) ───────────────────────────
  // A warm-coloured building strip at ~y=440 that the interior floats on top of
  const buildingTop = wetSandBottom - 10;
  const buildingH = 14;
  ctx.fillStyle = '#F0E0C0';
  ctx.fillRect(80, buildingTop, width - 160, buildingH);

  // Awning stripes (red/white alternating)
  const stripeW = 18;
  const awningY = buildingTop - 8;
  ctx.save();
  ctx.beginPath();
  ctx.rect(80, awningY, width - 160, 16);
  ctx.clip();
  for (let sx = 80; sx < width - 80; sx += stripeW) {
    ctx.fillStyle = sx % (stripeW * 2) === 0 ? '#E53935' : '#FFFFFF';
    ctx.fillRect(sx, awningY, stripeW, 16);
  }
  ctx.restore();
}
