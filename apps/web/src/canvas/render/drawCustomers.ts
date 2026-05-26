/**
 * drawCustomers — renders customer cartoon characters animating through phases:
 *   walking_in → seated → eating → leaving
 *
 * Pure canvas primitives — no PNG sprites. Six distinct personas per design §5.2.
 * Customers ~36w × 54h, drawn with primitives for cartoon iPad feel.
 *
 * Customers are ephemeral — they come from RestaurantState.customers_in_scene.
 * Phase mapping:
 *   walking_in: slide from right-edge → assigned seat over ~2s
 *   seated:     idle at seat
 *   eating:     small chewing bob + fork hint near mouth
 *   leaving:    slide right + fade
 *
 * Seat assignment is stable per ephemeral_id (hash → seat index).
 */

import type { CustomerInScene } from '@kitchen-rush/shared';
import { SHOP_LAYOUT } from './drawShop.js';

const SEATS = SHOP_LAYOUT.seats;

// Walking path start (just off-canvas right edge)
const ENTER_START = { x: 950, y: 540 };

/** Stable seat assignment keyed by ephemeral_id */
const seatAssignments = new Map<string, { x: number; y: number }>();

/** Stable hash for an id string */
function hashId(id: string): number {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return hash;
}

export function getSeatIndexForId(id: string): number {
  return hashId(id) % SEATS.length;
}

function getOrAssignSeat(id: string): { x: number; y: number } {
  if (seatAssignments.has(id)) return seatAssignments.get(id)!;
  const seat = SEATS[getSeatIndexForId(id)] ?? SEATS[0]!;
  seatAssignments.set(id, seat);
  return seat;
}

function cleanupOldSeats(activeIds: Set<string>): void {
  for (const id of seatAssignments.keys()) {
    if (!activeIds.has(id)) seatAssignments.delete(id);
  }
}

/** Linear interpolation, clamped to [0,1] */
function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * Math.min(1, Math.max(0, t));
}

/** Phase timing in real seconds */
const PHASE_DURATIONS: Record<CustomerInScene['phase'], number> = {
  walking_in: 2.0,
  seated:     0.3,
  eating:     8.0,
  leaving:    2.0,
};

/** Per-customer animation state (keyed by ephemeral_id) */
const phaseTimers = new Map<string, { phase: string; startMs: number }>();

function getPhaseProgress(
  id: string,
  phase: CustomerInScene['phase'],
  nowMs: number,
): number {
  const current = phaseTimers.get(id);
  if (!current || current.phase !== phase) {
    phaseTimers.set(id, { phase, startMs: nowMs });
    return 0;
  }
  const elapsed = (nowMs - current.startMs) / 1000;
  const duration = PHASE_DURATIONS[phase] ?? 1;
  return Math.min(1, elapsed / duration);
}

// ── Mood derivation & emoji overlay ─────────────────────────────────────

function customerMoodFromWait(waitMin: number): number {
  if (waitMin <= 60) return 75;
  if (waitMin <= 180) return 50;
  return 30;
}

function moodEmoji(mood: number): string {
  if (mood >= 70) return '😊';
  if (mood >= 40) return '😐';
  return '😟';
}

/** Draw a small mood emoji 14px above (cx, headTopY), with a soft white halo. */
export function drawMoodEmoji(
  ctx: CanvasRenderingContext2D,
  cx: number,
  headTopY: number,
  mood: number,
  alpha = 1,
): void {
  const emoji = moodEmoji(mood);
  const y = headTopY - 14;
  ctx.save();
  ctx.globalAlpha = alpha;
  // Soft white circle behind emoji
  ctx.fillStyle = 'rgba(255,255,255,0.88)';
  ctx.beginPath();
  ctx.arc(cx, y, 10, 0, Math.PI * 2);
  ctx.fill();
  // Subtle ring
  ctx.strokeStyle = 'rgba(60,40,20,0.18)';
  ctx.lineWidth = 1;
  ctx.stroke();
  // Emoji glyph
  ctx.font = '13px "Apple Color Emoji", "Segoe UI Emoji", system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#1F1109';
  ctx.fillText(emoji, cx, y + 1);
  ctx.restore();
}

// ── Persona drawing helpers ─────────────────────────────────────────────

interface DrawCtx {
  ctx: CanvasRenderingContext2D;
  cx: number;          // horizontal center
  feetY: number;       // bottom of character (feet)
  alpha: number;
  scale: number;
  phase: CustomerInScene['phase'];
  timeMs: number;
  nameHash: number;
  arrivalMin: number;
}

/** Body proportions (before scale): width 36, total height 54, head radius 11 */
const BODY_W = 36;
const BODY_TOTAL_H = 54;
const HEAD_R = 11;

/** Compute head center y given feetY and scale */
function headCenterY(feetY: number, scale: number): number {
  // Head sits at top of character
  return feetY - (BODY_TOTAL_H - HEAD_R) * scale;
}

/** Quick rounded rect path */
function roundRectPath(
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

function softShadow(ctx: CanvasRenderingContext2D, cx: number, cy: number, w: number, h: number, alpha: number): void {
  ctx.save();
  ctx.fillStyle = `rgba(40,25,10,${0.22 * alpha})`;
  ctx.beginPath();
  ctx.ellipse(cx, cy, w / 2, h / 2, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** Draw a generic head circle with optional skin tone. Returns head center y. */
function drawHead(
  ctx: CanvasRenderingContext2D,
  cx: number,
  feetY: number,
  scale: number,
  skin: string,
): { hcx: number; hcy: number; r: number } {
  const hcy = headCenterY(feetY, scale);
  const r = HEAD_R * scale;
  ctx.fillStyle = skin;
  ctx.beginPath();
  ctx.arc(cx, hcy, r, 0, Math.PI * 2);
  ctx.fill();
  return { hcx: cx, hcy, r };
}

/** Draw a generic body torso starting just below the head. Returns top/bottom y. */
function drawTorso(
  ctx: CanvasRenderingContext2D,
  cx: number,
  feetY: number,
  scale: number,
  shirtColor: string,
): { top: number; bottom: number; w: number } {
  const w = BODY_W * scale;
  const torsoH = 22 * scale;
  const top = headCenterY(feetY, scale) + HEAD_R * scale - 2 * scale;
  const bottom = top + torsoH;
  ctx.fillStyle = shirtColor;
  roundRectPath(ctx, cx - w / 2, top, w, torsoH, 5 * scale);
  ctx.fill();
  return { top, bottom, w };
}

/** Draw simple legs/shorts below the torso. */
function drawLegs(
  ctx: CanvasRenderingContext2D,
  cx: number,
  torsoBottom: number,
  feetY: number,
  scale: number,
  pantsColor: string,
): void {
  const legH = feetY - torsoBottom;
  const legW = 9 * scale;
  ctx.fillStyle = pantsColor;
  roundRectPath(ctx, cx - 10 * scale, torsoBottom, legW, legH, 3 * scale);
  ctx.fill();
  roundRectPath(ctx, cx + 1 * scale, torsoBottom, legW, legH, 3 * scale);
  ctx.fill();
}

/** Draw striped legs (for beach bum). */
function drawStripedShorts(
  ctx: CanvasRenderingContext2D,
  cx: number,
  torsoBottom: number,
  feetY: number,
  scale: number,
  baseColor: string,
  stripeColor: string,
): void {
  const shortsH = (feetY - torsoBottom) * 0.62;
  const fullW = 24 * scale;
  ctx.fillStyle = baseColor;
  roundRectPath(ctx, cx - fullW / 2, torsoBottom, fullW, shortsH, 4 * scale);
  ctx.fill();
  // Diagonal stripes
  ctx.save();
  ctx.beginPath();
  roundRectPath(ctx, cx - fullW / 2, torsoBottom, fullW, shortsH, 4 * scale);
  ctx.clip();
  ctx.strokeStyle = stripeColor;
  ctx.lineWidth = 2.5 * scale;
  for (let i = -4; i < 6; i++) {
    ctx.beginPath();
    ctx.moveTo(cx - fullW / 2 + i * 6 * scale, torsoBottom);
    ctx.lineTo(cx - fullW / 2 + i * 6 * scale + shortsH, torsoBottom + shortsH);
    ctx.stroke();
  }
  ctx.restore();
  // Bare legs below shorts
  const barLegStart = torsoBottom + shortsH;
  const barLegH = feetY - barLegStart;
  if (barLegH > 0) {
    ctx.fillStyle = '#D9A87A';
    roundRectPath(ctx, cx - 8 * scale, barLegStart, 6 * scale, barLegH, 2 * scale);
    ctx.fill();
    roundRectPath(ctx, cx + 2 * scale, barLegStart, 6 * scale, barLegH, 2 * scale);
    ctx.fill();
    // Flip-flops
    ctx.fillStyle = '#3B2A1E';
    roundRectPath(ctx, cx - 11 * scale, feetY - 3 * scale, 9 * scale, 3 * scale, 2 * scale);
    ctx.fill();
    roundRectPath(ctx, cx + 2 * scale, feetY - 3 * scale, 9 * scale, 3 * scale, 2 * scale);
    ctx.fill();
  }
}

/** Eyes for the standard happy/neutral face. */
function drawEyes(
  ctx: CanvasRenderingContext2D,
  hcx: number,
  hcy: number,
  scale: number,
  opts?: { halfClosed?: boolean; behindGlasses?: boolean },
): void {
  ctx.fillStyle = '#1F1109';
  if (opts?.halfClosed) {
    // Drooping eyelids: small lines
    ctx.strokeStyle = '#1F1109';
    ctx.lineWidth = 1.4 * scale;
    ctx.beginPath();
    ctx.moveTo(hcx - 4 * scale, hcy - 0.5 * scale);
    ctx.lineTo(hcx - 1.5 * scale, hcy + 0.5 * scale);
    ctx.moveTo(hcx + 1.5 * scale, hcy + 0.5 * scale);
    ctx.lineTo(hcx + 4 * scale, hcy - 0.5 * scale);
    ctx.stroke();
  } else {
    ctx.beginPath();
    ctx.arc(hcx - 3 * scale, hcy - 1 * scale, 1.3 * scale, 0, Math.PI * 2);
    ctx.arc(hcx + 3 * scale, hcy - 1 * scale, 1.3 * scale, 0, Math.PI * 2);
    ctx.fill();
  }
  if (opts?.behindGlasses) {
    // Slightly enlarged pupils through lenses already drawn
  }
}

/** Smile arc. */
function drawSmile(
  ctx: CanvasRenderingContext2D,
  hcx: number,
  hcy: number,
  scale: number,
  frown = false,
): void {
  ctx.strokeStyle = '#3A1F0F';
  ctx.lineWidth = 1.1 * scale;
  ctx.beginPath();
  if (frown) {
    ctx.arc(hcx, hcy + 6 * scale, 3 * scale, Math.PI * 1.15, Math.PI * 1.85);
  } else {
    ctx.arc(hcx, hcy + 3 * scale, 3 * scale, Math.PI * 0.15, Math.PI * 0.85);
  }
  ctx.stroke();
}

/** Chewing-fork hint near mouth for eating phase. */
function drawForkHint(
  ctx: CanvasRenderingContext2D,
  hcx: number,
  hcy: number,
  scale: number,
  timeMs: number,
): void {
  const wiggle = Math.sin(timeMs / 200) * 1.5 * scale;
  ctx.save();
  ctx.strokeStyle = '#9CA3AF';
  ctx.lineWidth = 1.4 * scale;
  ctx.beginPath();
  ctx.moveTo(hcx + 7 * scale, hcy + 8 * scale + wiggle);
  ctx.lineTo(hcx + 12 * scale, hcy + 14 * scale + wiggle);
  ctx.stroke();
  // Tines
  ctx.beginPath();
  ctx.moveTo(hcx + 6 * scale, hcy + 9 * scale + wiggle);
  ctx.lineTo(hcx + 8 * scale, hcy + 6 * scale + wiggle);
  ctx.moveTo(hcx + 7 * scale, hcy + 10 * scale + wiggle);
  ctx.lineTo(hcx + 9 * scale, hcy + 7 * scale + wiggle);
  ctx.stroke();
  ctx.restore();
}

// ── Six personas ─────────────────────────────────────────────────────────

function drawBeachBum(d: DrawCtx): { hcx: number; hcy: number; r: number } {
  const { ctx, cx, feetY, scale, phase, timeMs } = d;
  const skin = '#D9A87A';
  const torso = drawTorso(ctx, cx, feetY, scale, '#FACC15'); // bright tank
  drawStripedShorts(ctx, cx, torso.bottom, feetY, scale, '#0EA5E9', '#FFFFFF');
  const head = drawHead(ctx, cx, feetY, scale, skin);
  // Messy sandy hair
  ctx.fillStyle = '#D4A860';
  ctx.beginPath();
  ctx.arc(head.hcx, head.hcy - 4 * scale, head.r - 1, Math.PI * 1.05, Math.PI * 1.95, false);
  ctx.fill();
  // Sunglasses — wide dark strip with two darker dots
  ctx.fillStyle = '#1F1109';
  roundRectPath(ctx, head.hcx - 7 * scale, head.hcy - 2 * scale, 14 * scale, 5 * scale, 2 * scale);
  ctx.fill();
  // Bridge
  ctx.fillRect(head.hcx - 0.5 * scale, head.hcy - 0.5 * scale, 1 * scale, 2 * scale);
  // Lens highlights (two tiny dots)
  ctx.fillStyle = '#FFFFFF';
  ctx.beginPath();
  ctx.arc(head.hcx - 4 * scale, head.hcy - 0.5 * scale, 0.8 * scale, 0, Math.PI * 2);
  ctx.arc(head.hcx + 4 * scale, head.hcy - 0.5 * scale, 0.8 * scale, 0, Math.PI * 2);
  ctx.fill();
  // Mouth
  drawSmile(ctx, head.hcx, head.hcy, scale);
  if (phase === 'eating') drawForkHint(ctx, head.hcx, head.hcy, scale, timeMs);
  return head;
}

function drawTouristFamily(d: DrawCtx): { hcx: number; hcy: number; r: number } {
  const { ctx, cx, feetY, scale, phase, timeMs, nameHash } = d;
  // Vary by name hash so family members differ
  const variant = nameHash % 3;
  const shirts = ['#EF4444', '#22C55E', '#F59E0B'];
  const skins  = ['#FDDAB0', '#E8C39A', '#D9A87A'];
  const hatColors = ['#FACC15', '#F472B6', '#FFFFFF'];
  const shirt = shirts[variant]!;
  const skin = skins[variant]!;
  const hatColor = hatColors[variant]!;

  const torso = drawTorso(ctx, cx, feetY, scale, shirt);
  // Patterned floral dots on the shirt
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  for (let i = 0; i < 4; i++) {
    const px = cx - 8 * scale + (i % 2) * 12 * scale;
    const py = torso.top + 6 * scale + Math.floor(i / 2) * 8 * scale;
    ctx.beginPath();
    ctx.arc(px, py, 1.5 * scale, 0, Math.PI * 2);
    ctx.fill();
  }
  drawLegs(ctx, cx, torso.bottom, feetY, scale, '#3B82F6');
  const head = drawHead(ctx, cx, feetY, scale, skin);
  // Sun hat — wide brim + crown
  ctx.fillStyle = hatColor;
  // Brim
  ctx.beginPath();
  ctx.ellipse(head.hcx, head.hcy - head.r + 2 * scale, head.r + 6 * scale, 3 * scale, 0, 0, Math.PI * 2);
  ctx.fill();
  // Crown
  roundRectPath(ctx, head.hcx - 6 * scale, head.hcy - head.r - 4 * scale, 12 * scale, 6 * scale, 2 * scale);
  ctx.fill();
  // Hat band
  ctx.fillStyle = '#7C2D12';
  ctx.fillRect(head.hcx - 6 * scale, head.hcy - head.r - 0.5 * scale, 12 * scale, 1.5 * scale);

  drawEyes(ctx, head.hcx, head.hcy, scale);
  drawSmile(ctx, head.hcx, head.hcy, scale);
  // Camera ring around neck — strap + camera body
  ctx.strokeStyle = '#1F1109';
  ctx.lineWidth = 1 * scale;
  ctx.beginPath();
  ctx.moveTo(head.hcx - 8 * scale, head.hcy + head.r - 1 * scale);
  ctx.quadraticCurveTo(head.hcx, head.hcy + head.r + 4 * scale, head.hcx + 8 * scale, head.hcy + head.r - 1 * scale);
  ctx.stroke();
  // Camera body
  ctx.fillStyle = '#1F2937';
  roundRectPath(ctx, head.hcx - 4 * scale, torso.top + 3 * scale, 8 * scale, 5 * scale, 1.5 * scale);
  ctx.fill();
  // Lens
  ctx.fillStyle = '#0EA5E9';
  ctx.beginPath();
  ctx.arc(head.hcx, torso.top + 5.5 * scale, 1.6 * scale, 0, Math.PI * 2);
  ctx.fill();
  if (phase === 'eating') drawForkHint(ctx, head.hcx, head.hcy, scale, timeMs);
  return head;
}

function drawDateCouple(d: DrawCtx): { hcx: number; hcy: number; r: number } {
  const { ctx, cx, feetY, scale, phase, timeMs, nameHash } = d;
  const partner = nameHash % 2;
  const shirt = partner === 0 ? '#F9A8D4' : '#A5B4FC';
  const pants = partner === 0 ? '#BE185D' : '#3730A3';
  const skin = '#FDDAB0';
  const hairColor = partner === 0 ? '#7C2D12' : '#1F1109';

  const torso = drawTorso(ctx, cx, feetY, scale, shirt);
  drawLegs(ctx, cx, torso.bottom, feetY, scale, pants);
  const head = drawHead(ctx, cx, feetY, scale, skin);
  // Hair — soft hairstyle
  ctx.fillStyle = hairColor;
  ctx.beginPath();
  ctx.arc(head.hcx, head.hcy - 3 * scale, head.r, Math.PI * 1.0, Math.PI * 2.0, false);
  ctx.fill();
  if (partner === 0) {
    // Long-ish hair sides
    roundRectPath(ctx, head.hcx - head.r, head.hcy - 2 * scale, 2.5 * scale, 9 * scale, 1.5 * scale);
    ctx.fill();
    roundRectPath(ctx, head.hcx + head.r - 2.5 * scale, head.hcy - 2 * scale, 2.5 * scale, 9 * scale, 1.5 * scale);
    ctx.fill();
  }
  drawEyes(ctx, head.hcx, head.hcy, scale);
  drawSmile(ctx, head.hcx, head.hcy, scale);
  // Cheek blush
  ctx.fillStyle = 'rgba(244,114,182,0.55)';
  ctx.beginPath();
  ctx.arc(head.hcx - 5 * scale, head.hcy + 2 * scale, 1.5 * scale, 0, Math.PI * 2);
  ctx.arc(head.hcx + 5 * scale, head.hcy + 2 * scale, 1.5 * scale, 0, Math.PI * 2);
  ctx.fill();

  // Floating heart above head when seated/eating
  if (phase === 'seated' || phase === 'eating') {
    const bob = Math.sin(timeMs / 600 + nameHash) * 2;
    drawHeart(ctx, head.hcx + 10 * scale, head.hcy - head.r - 8 * scale + bob, 4 * scale);
  }
  if (phase === 'eating') drawForkHint(ctx, head.hcx, head.hcy, scale, timeMs);
  return head;
}

function drawHeart(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number): void {
  ctx.save();
  ctx.fillStyle = '#EC4899';
  ctx.beginPath();
  ctx.moveTo(cx, cy + size * 0.7);
  ctx.bezierCurveTo(cx + size, cy + size * 0.2, cx + size, cy - size * 0.6, cx, cy - size * 0.2);
  ctx.bezierCurveTo(cx - size, cy - size * 0.6, cx - size, cy + size * 0.2, cx, cy + size * 0.7);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawFoodieCritic(d: DrawCtx): { hcx: number; hcy: number; r: number } {
  const { ctx, cx, feetY, scale, phase, timeMs } = d;
  const skin = '#E8C39A';
  const torso = drawTorso(ctx, cx, feetY, scale, '#6B7280'); // neutral gray shirt
  drawLegs(ctx, cx, torso.bottom, feetY, scale, '#374151');
  const head = drawHead(ctx, cx, feetY, scale, skin);
  // Hair — neat
  ctx.fillStyle = '#3A2A1C';
  ctx.beginPath();
  ctx.arc(head.hcx, head.hcy - 3 * scale, head.r - 0.5 * scale, Math.PI * 1.05, Math.PI * 1.95, false);
  ctx.fill();
  // Round glasses — two circles connected
  ctx.strokeStyle = '#1F1109';
  ctx.lineWidth = 1.1 * scale;
  ctx.beginPath();
  ctx.arc(head.hcx - 3.5 * scale, head.hcy - 1 * scale, 2.5 * scale, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(head.hcx + 3.5 * scale, head.hcy - 1 * scale, 2.5 * scale, 0, Math.PI * 2);
  ctx.stroke();
  // Bridge
  ctx.beginPath();
  ctx.moveTo(head.hcx - 1 * scale, head.hcy - 1 * scale);
  ctx.lineTo(head.hcx + 1 * scale, head.hcy - 1 * scale);
  ctx.stroke();
  // Tiny pupils inside lenses
  ctx.fillStyle = '#1F1109';
  ctx.beginPath();
  ctx.arc(head.hcx - 3.5 * scale, head.hcy - 1 * scale, 0.8 * scale, 0, Math.PI * 2);
  ctx.arc(head.hcx + 3.5 * scale, head.hcy - 1 * scale, 0.8 * scale, 0, Math.PI * 2);
  ctx.fill();
  // Thoughtful mouth — straight line
  ctx.strokeStyle = '#3A1F0F';
  ctx.lineWidth = 1.1 * scale;
  ctx.beginPath();
  ctx.moveTo(head.hcx - 2 * scale, head.hcy + 5 * scale);
  ctx.lineTo(head.hcx + 2 * scale, head.hcy + 5 * scale);
  ctx.stroke();
  // Tiny notebook in hand (right side of torso)
  ctx.fillStyle = '#FEF3C7';
  roundRectPath(ctx, cx + 9 * scale, torso.top + 8 * scale, 6 * scale, 8 * scale, 1 * scale);
  ctx.fill();
  ctx.strokeStyle = '#92400E';
  ctx.lineWidth = 0.8 * scale;
  ctx.stroke();
  // Notebook lines
  ctx.beginPath();
  for (let i = 0; i < 3; i++) {
    ctx.moveTo(cx + 10 * scale, torso.top + 10 * scale + i * 2 * scale);
    ctx.lineTo(cx + 14 * scale, torso.top + 10 * scale + i * 2 * scale);
  }
  ctx.stroke();
  if (phase === 'eating') drawForkHint(ctx, head.hcx, head.hcy, scale, timeMs);
  return head;
}

function drawNightOwl(d: DrawCtx): { hcx: number; hcy: number; r: number } {
  const { ctx, cx, feetY, scale, phase, timeMs } = d;
  const skin = '#D4B59A';
  // Dark hoodie body — slightly larger silhouette
  const w = BODY_W * scale * 1.05;
  const torsoH = 24 * scale;
  const torsoTop = headCenterY(feetY, scale) + HEAD_R * scale - 4 * scale;
  ctx.fillStyle = '#374151';
  roundRectPath(ctx, cx - w / 2, torsoTop, w, torsoH, 6 * scale);
  ctx.fill();
  // Hoodie pocket
  ctx.fillStyle = '#1F2937';
  roundRectPath(ctx, cx - 10 * scale, torsoTop + 10 * scale, 20 * scale, 7 * scale, 2 * scale);
  ctx.fill();
  // Legs
  drawLegs(ctx, cx, torsoTop + torsoH, feetY, scale, '#1F2937');
  // Head — hood up: skin only in a small front oval
  const hcy = headCenterY(feetY, scale);
  const r = HEAD_R * scale;
  // Hood (gray) behind head
  ctx.fillStyle = '#4B5563';
  ctx.beginPath();
  ctx.arc(cx, hcy, r + 2 * scale, 0, Math.PI * 2);
  ctx.fill();
  // Face peeking out
  ctx.fillStyle = skin;
  ctx.beginPath();
  ctx.arc(cx, hcy + 1 * scale, r - 1 * scale, Math.PI * 0.15, Math.PI * 0.85, false);
  ctx.fill();
  // Half-closed eyes
  drawEyes(ctx, cx, hcy, scale, { halfClosed: true });
  // Tired mouth — slight downturn
  ctx.strokeStyle = '#3A1F0F';
  ctx.lineWidth = 1.1 * scale;
  ctx.beginPath();
  ctx.moveTo(cx - 2 * scale, hcy + 5 * scale);
  ctx.lineTo(cx + 2 * scale, hcy + 5 * scale);
  ctx.stroke();
  if (phase === 'eating') drawForkHint(ctx, cx, hcy, scale, timeMs);
  return { hcx: cx, hcy, r };
}

function drawHangrySurfer(d: DrawCtx): { hcx: number; hcy: number; r: number } {
  const { ctx, cx, feetY, scale, phase, timeMs } = d;
  const skin = '#D9A87A';
  // Surfboard diagonal behind shoulder (drawn first, behind body)
  ctx.save();
  ctx.translate(cx - 4 * scale, headCenterY(feetY, scale) + 6 * scale);
  ctx.rotate(-Math.PI / 5);
  // Board base
  ctx.fillStyle = '#FBBF24';
  roundRectPath(ctx, -6 * scale, -28 * scale, 12 * scale, 60 * scale, 6 * scale);
  ctx.fill();
  // Center stripe
  ctx.fillStyle = '#EF4444';
  ctx.fillRect(-1 * scale, -26 * scale, 2 * scale, 56 * scale);
  ctx.restore();

  const torso = drawTorso(ctx, cx, feetY, scale, '#0EA5E9');
  drawStripedShorts(ctx, cx, torso.bottom, feetY, scale, '#EF4444', '#FFFFFF');
  const head = drawHead(ctx, cx, feetY, scale, skin);
  // Wet/messy hair
  ctx.fillStyle = '#7C2D12';
  ctx.beginPath();
  ctx.arc(head.hcx, head.hcy - 4 * scale, head.r, Math.PI * 1.05, Math.PI * 1.95, false);
  ctx.fill();
  // Furrowed brows
  ctx.strokeStyle = '#1F1109';
  ctx.lineWidth = 1.3 * scale;
  ctx.beginPath();
  ctx.moveTo(head.hcx - 5 * scale, head.hcy - 4 * scale);
  ctx.lineTo(head.hcx - 1 * scale, head.hcy - 2.5 * scale);
  ctx.moveTo(head.hcx + 5 * scale, head.hcy - 4 * scale);
  ctx.lineTo(head.hcx + 1 * scale, head.hcy - 2.5 * scale);
  ctx.stroke();
  drawEyes(ctx, head.hcx, head.hcy, scale);
  // Frown
  drawSmile(ctx, head.hcx, head.hcy, scale, true);
  if (phase === 'eating') drawForkHint(ctx, head.hcx, head.hcy, scale, timeMs);
  return head;
}

const PERSONA_DRAW: Record<string, (d: DrawCtx) => { hcx: number; hcy: number; r: number }> = {
  beach_bum:      drawBeachBum,
  tourist_family: drawTouristFamily,
  date_couple:    drawDateCouple,
  foodie_critic:  drawFoodieCritic,
  night_owl:      drawNightOwl,
  hangry_surfer:  drawHangrySurfer,
};

// ── Main entry ──────────────────────────────────────────────────────────

export function drawCustomers(
  ctx: CanvasRenderingContext2D,
  customers: CustomerInScene[],
  timeMs: number,
  currentInGameMinute: number,
): void {
  const activeIds = new Set(customers.map((c) => c.ephemeral_id));
  cleanupOldSeats(activeIds);

  for (const customer of customers) {
    const seat = getOrAssignSeat(customer.ephemeral_id);
    const t = getPhaseProgress(customer.ephemeral_id, customer.phase, timeMs);

    let x: number;
    let y: number;
    let alpha = 1.0;
    const scale = 0.95;

    switch (customer.phase) {
      case 'walking_in': {
        // Slide from off-screen right → seat
        x = lerp(ENTER_START.x, seat.x, t);
        y = lerp(ENTER_START.y, seat.y, t);
        alpha = Math.min(1, t * 4);
        break;
      }
      case 'seated':
        x = seat.x; y = seat.y;
        break;
      case 'eating': {
        const bob = Math.sin(timeMs / 400 + customer.arrival_at_minute) * 1.2;
        x = seat.x; y = seat.y + bob;
        break;
      }
      case 'leaving': {
        x = lerp(seat.x, ENTER_START.x, t);
        y = lerp(seat.y, ENTER_START.y, t);
        alpha = Math.max(0, 1 - t * 1.5);
        break;
      }
      default:
        x = seat.x; y = seat.y;
    }

    if (alpha <= 0) continue;

    ctx.save();
    ctx.globalAlpha = alpha;

    // Shadow
    softShadow(ctx, x, y + 4, BODY_W * scale, 6, alpha);

    const drawFn = PERSONA_DRAW[customer.archetype] ?? drawBeachBum;
    const headInfo = drawFn({
      ctx,
      cx: x,
      feetY: y,
      alpha,
      scale,
      phase: customer.phase,
      timeMs,
      nameHash: hashId(customer.display_name),
      arrivalMin: customer.arrival_at_minute,
    });

    ctx.restore();

    // Mood emoji overlay (above head) — only when seated/eating (not walking/leaving)
    if (customer.phase === 'seated' || customer.phase === 'eating') {
      const waitMin = Math.max(0, currentInGameMinute - customer.arrival_at_minute);
      const mood = customerMoodFromWait(waitMin);
      const headTopY = headInfo.hcy - headInfo.r;
      drawMoodEmoji(ctx, headInfo.hcx, headTopY, mood, alpha);
    }
  }
}
