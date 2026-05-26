/**
 * drawWorkers — cartoon chef characters rendered via canvas primitives.
 *
 * Each chef is drawn at their assigned station (positions live in
 * SHOP_LAYOUT.stations from drawShop.ts). Worker variant is keyed by
 * portrait_id from the server.
 *
 * Visual: chef hat + round head with face + apron body. Gentle idle bob
 * keyed by worker id so they don't sync-bob. Speech bubble appears for
 * recent coaching events (≤4 real seconds since coach POST).
 */

import type { Worker } from '@kitchen-rush/shared';
import { SHOP_LAYOUT } from './drawShop.js';
import { drawMoodEmoji } from './drawCustomers.js';

export const STATION_POSITIONS: Record<string, { x: number; y: number }> = Object.fromEntries(
  Object.entries(SHOP_LAYOUT.stations).map(([k, v]) => [k, { x: v.cx, y: v.cy }]),
);

export interface CoachingEvent {
  workerId: number;
  presetKey: string;
  receivedAt: number; // performance.now()
}

const PRESET_BUBBLE_TEXT: Record<string, string> = {
  praise:           'Thanks! 😊',
  take_time:        'No rush ✨',
  try_again:        'Will do!',
  watch_heat:       'On it 🔥',
  check_ticket:     'Checking...',
  cleanup_when_can: 'I got it 🧹',
};

// Worker color palette by portrait_id
const WORKER_PALETTE: Record<string, { skin: string; hair: string; apronTrim: string }> = {
  worker_chef_blond_idle:   { skin: '#FDE2C0', hair: '#F4D38A', apronTrim: '#7E4A20' },
  worker_chef_brown_idle:   { skin: '#D9A87A', hair: '#5A3A22', apronTrim: '#4A2B16' },
  worker_chef_redhead_idle: { skin: '#FDDAC0', hair: '#C84F2C', apronTrim: '#8A2F1C' },
  worker_chef_short_idle:   { skin: '#E8C39A', hair: '#3A2A1C', apronTrim: '#2C1E12' },
};

function softShadow(ctx: CanvasRenderingContext2D, cx: number, cy: number, w: number, h: number): void {
  ctx.save();
  ctx.fillStyle = 'rgba(40,25,10,0.22)';
  ctx.beginPath();
  ctx.ellipse(cx, cy, w / 2, h / 2, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawSpeechBubble(
  ctx: CanvasRenderingContext2D,
  cx: number,
  yTop: number,
  text: string,
  alpha: number,
): void {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.font = '11px system-ui, sans-serif';
  const padX = 8;
  const tw = ctx.measureText(text).width;
  const w = tw + padX * 2;
  const h = 22;
  const x = cx - w / 2;
  const y = yTop - h - 6;

  // Bubble background
  ctx.fillStyle = '#FFFFFF';
  ctx.strokeStyle = '#2A1F12';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(x + 6, y);
  ctx.arcTo(x + w, y,     x + w, y + h, 6);
  ctx.arcTo(x + w, y + h, x,     y + h, 6);
  // Tail
  ctx.lineTo(cx + 5, y + h);
  ctx.lineTo(cx,     y + h + 5);
  ctx.lineTo(cx - 5, y + h);
  ctx.arcTo(x,     y + h, x,     y,     6);
  ctx.arcTo(x,     y,     x + w, y,     6);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Text
  ctx.fillStyle = '#2A1F12';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, cx, y + h / 2 + 1);
  ctx.restore();
}

function drawChef(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  portraitId: string,
  bob: number,
  facingRight: boolean,
  isLevelUp: boolean,
): void {
  const palette = WORKER_PALETTE[portraitId] ?? WORKER_PALETTE['worker_chef_blond_idle']!;

  // (cx, cy) is bottom-center of the character (their feet on the floor).
  const baseY = cy + bob;

  // Shadow on floor
  softShadow(ctx, cx, cy + 8, 38, 8);

  // Body proportions (cartoon, slightly stylized)
  const bodyW = 36;
  const bodyH = 42;
  const headR = 14;
  const hatH  = 22;

  // Body (apron)
  const bodyTop = baseY - bodyH - 4;
  ctx.fillStyle = '#FFFFFF';
  ctx.beginPath();
  // Pear-shaped body
  ctx.moveTo(cx - bodyW / 2 + 2, bodyTop + bodyH - 2);
  ctx.quadraticCurveTo(cx - bodyW / 2 - 4, bodyTop + bodyH - 14, cx - bodyW / 2, bodyTop + 6);
  ctx.quadraticCurveTo(cx, bodyTop - 2, cx + bodyW / 2, bodyTop + 6);
  ctx.quadraticCurveTo(cx + bodyW / 2 + 4, bodyTop + bodyH - 14, cx + bodyW / 2 - 2, bodyTop + bodyH - 2);
  ctx.closePath();
  ctx.fill();
  // Apron trim
  ctx.fillStyle = palette.apronTrim;
  ctx.fillRect(cx - bodyW / 2 - 2, bodyTop + bodyH - 6, bodyW + 4, 4);
  // Apron strings
  ctx.strokeStyle = palette.apronTrim;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(cx - 10, bodyTop + 18);
  ctx.lineTo(cx - 14, bodyTop + 22);
  ctx.moveTo(cx + 10, bodyTop + 18);
  ctx.lineTo(cx + 14, bodyTop + 22);
  ctx.stroke();
  // Two apron buttons
  ctx.fillStyle = palette.apronTrim;
  ctx.beginPath();
  ctx.arc(cx, bodyTop + 16, 1.5, 0, Math.PI * 2);
  ctx.arc(cx, bodyTop + 26, 1.5, 0, Math.PI * 2);
  ctx.fill();

  // Arms — short stubs out the sides
  ctx.fillStyle = '#FFFFFF';
  const armY = bodyTop + 14;
  // Left arm
  ctx.beginPath();
  ctx.ellipse(cx - bodyW / 2, armY, 5, 9, -0.2, 0, Math.PI * 2);
  ctx.fill();
  // Right arm
  ctx.beginPath();
  ctx.ellipse(cx + bodyW / 2, armY, 5, 9, 0.2, 0, Math.PI * 2);
  ctx.fill();
  // Hands (skin colored)
  ctx.fillStyle = palette.skin;
  ctx.beginPath();
  ctx.arc(cx - bodyW / 2 - 2, armY + 6, 3, 0, Math.PI * 2);
  ctx.arc(cx + bodyW / 2 + 2, armY + 6, 3, 0, Math.PI * 2);
  ctx.fill();

  // Head — circle, slightly above body
  const headCY = bodyTop - 2;
  // Hair backdrop (around the head)
  ctx.fillStyle = palette.hair;
  ctx.beginPath();
  ctx.arc(cx, headCY, headR + 1, 0, Math.PI * 2);
  ctx.fill();
  // Face
  ctx.fillStyle = palette.skin;
  ctx.beginPath();
  ctx.arc(cx, headCY, headR, 0, Math.PI * 2);
  ctx.fill();

  // Hair fringe (small darker arc on top)
  ctx.fillStyle = palette.hair;
  ctx.beginPath();
  ctx.arc(cx, headCY - 4, headR - 2, Math.PI * 1.1, Math.PI * 1.9, false);
  ctx.fill();

  // Eyes — two small dots
  ctx.fillStyle = '#1F1109';
  const eyeOffX = facingRight ? 1 : -1;
  ctx.beginPath();
  ctx.arc(cx - 4 + eyeOffX, headCY - 1, 1.6, 0, Math.PI * 2);
  ctx.arc(cx + 4 + eyeOffX, headCY - 1, 1.6, 0, Math.PI * 2);
  ctx.fill();

  // Cheek blush
  ctx.fillStyle = 'rgba(241,120,120,0.35)';
  ctx.beginPath();
  ctx.arc(cx - 6, headCY + 4, 2, 0, Math.PI * 2);
  ctx.arc(cx + 6, headCY + 4, 2, 0, Math.PI * 2);
  ctx.fill();

  // Smile
  ctx.strokeStyle = '#3A1F0F';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.arc(cx, headCY + 3, 3.5, Math.PI * 0.15, Math.PI * 0.85);
  ctx.stroke();

  // Chef hat — puffy white toque
  const hatBaseY = headCY - headR + 2;
  ctx.fillStyle = '#FFFFFF';
  // Hat band
  roundRectInline(ctx, cx - headR + 2, hatBaseY - 2, (headR - 2) * 2, 6, 3);
  ctx.fill();
  // Puffy top — three overlapping circles
  ctx.beginPath();
  ctx.arc(cx - 8, hatBaseY - 6, 8, 0, Math.PI * 2);
  ctx.arc(cx,     hatBaseY - 10, 9, 0, Math.PI * 2);
  ctx.arc(cx + 8, hatBaseY - 6, 8, 0, Math.PI * 2);
  ctx.fill();
  // Subtle hat outline
  ctx.strokeStyle = 'rgba(60,40,20,0.25)';
  ctx.lineWidth = 0.8;
  ctx.stroke();

  // Level-up sparkle effect
  if (isLevelUp) {
    ctx.fillStyle = '#FBBF24';
    ctx.font = 'bold 14px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText('✨', cx - 18, hatBaseY - 12);
    ctx.fillText('✨', cx + 18, hatBaseY - 12);
  }
  // Note: hatH is used for layout calculations elsewhere
  void hatH;
}

function roundRectInline(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number, r: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y,     x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x,     y + h, r);
  ctx.arcTo(x,     y + h, x,     y,     r);
  ctx.arcTo(x,     y,     x + w, y,     r);
  ctx.closePath();
}

// ── Main entry point ─────────────────────────────────────────────────────

export function drawWorkers(
  ctx: CanvasRenderingContext2D,
  workers: Worker[],
  timeMs: number,
  coachingEvents: CoachingEvent[],
): void {
  const now = performance.now();

  for (const worker of workers) {
    if (!worker.is_active) continue;
    const pos = STATION_POSITIONS[worker.station] ?? STATION_POSITIONS['floor']!;
    if (!pos) continue;

    // Gentle bob — unique per worker (golden-angle spread)
    const phase = (worker.id * 2.399) % (Math.PI * 2);
    const bob = Math.sin(timeMs / 600 + phase) * 1.8;
    // Face the dining area (left side faces right, right side faces left)
    const facingRight = pos.x < 480;

    // Chef stands slightly in front of their station — bring their feet down.
    const standY = pos.y + 60;

    drawChef(ctx, pos.x, standY, worker.portrait_id, bob, facingRight, false);

    // Mood emoji above the chef hat.
    // Geometry mirrors drawChef: bodyTop = standY+bob - bodyH(42) - 4 = standY+bob - 46.
    // Head center sits at bodyTop - 2; head radius is 14; hat extends ~19px above head center.
    const bodyTopY = standY + bob - 46;
    const headCY = bodyTopY - 2;
    const hatTopY = headCY - 19; // top of the chef hat puff
    drawMoodEmoji(ctx, pos.x, hatTopY, worker.mood);

    // Name label below chef
    ctx.save();
    ctx.fillStyle = 'rgba(30,18,8,0.85)';
    ctx.strokeStyle = 'rgba(255,236,200,0.9)';
    ctx.lineWidth = 3;
    ctx.font = 'bold 11px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.strokeText(worker.name, pos.x, standY + 12);
    ctx.fillText(worker.name, pos.x, standY + 12);
    ctx.restore();

    // Speech bubble from recent coaching event
    const event = coachingEvents.find((e) => e.workerId === worker.id);
    if (event) {
      const elapsed = (now - event.receivedAt) / 1000;
      const BUBBLE_DURATION = 4.0;
      if (elapsed < BUBBLE_DURATION) {
        const alpha = Math.max(0.1, 1 - elapsed / BUBBLE_DURATION);
        const text = PRESET_BUBBLE_TEXT[event.presetKey] ?? '...';
        // Bubble sits above the chef's hat
        drawSpeechBubble(ctx, pos.x, standY - 80, text, alpha);
      }
    }
  }
}
