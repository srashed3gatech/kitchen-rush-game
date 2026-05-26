/**
 * drawShop — restaurant interior, redrawn as cartoon canvas-primitives.
 *
 * Layout (canvas 960×600):
 *   y 0–270   beach background (drawn by drawBeach, visible above the shop)
 *   y 270–600 shop interior (330px tall — nearly 55% of canvas)
 *
 * Shop layout:
 *   y 270–286 back wall (warm cream stripe)
 *   y 286–404 kitchen line — 5 stations across the back
 *   y 404–416 counter divider (warm wooden bar separating kitchen ↔ dining)
 *   y 416–600 dining floor (3 tables × 2 chairs, plus entrance bottom-right)
 *
 * Stations are drawn via canvas primitives (no sprite PNGs) so they read
 * as actual kitchen equipment: grill flames, fryer baskets, drink bottles,
 * dessert case, wooden counter. No more colored rectangles.
 *
 * Exported constants:
 *   - SHOP_LAYOUT.stations: station_id → { cx, cy } (used by drawWorkers)
 *   - SHOP_LAYOUT.tables:  seat positions (used by drawCustomers)
 */

export const SHOP_LAYOUT = {
  // Vertical bands
  ceilingY: 270,
  kitchenY: 286,
  kitchenH: 118,
  counterY: 404,
  counterH: 12,
  diningY: 416,
  diningH: 184,

  // Station centers — each station drawn 96×110, centered on these points.
  // x positions are evenly distributed across the kitchen line.
  // Stations drawn left → right: counter, grill, fryer, drink, dessert
  stations: {
    counter:  { cx: 120, cy: 345, kind: 'counter'  as const },
    grill:    { cx: 250, cy: 345, kind: 'grill'    as const },
    fryer:    { cx: 380, cy: 345, kind: 'fryer'    as const },
    drink:    { cx: 510, cy: 345, kind: 'drink'    as const },
    dessert:  { cx: 640, cy: 345, kind: 'dessert'  as const },
    // Floor/prep/assembly stations live in the dining area for visiting workers
    prep:     { cx: 770, cy: 345, kind: 'prep'     as const },
    assembly: { cx: 770, cy: 345, kind: 'assembly' as const },
    floor:    { cx: 600, cy: 540, kind: 'floor'    as const },
  },

  // Seat positions for customers in scene
  seats: [
    // Table 1 (left)
    { x: 180, y: 500 },
    { x: 240, y: 500 },
    // Table 2 (middle)
    { x: 380, y: 500 },
    { x: 440, y: 500 },
    // Table 3 (right)
    { x: 580, y: 500 },
    { x: 640, y: 500 },
  ],

  // Table centers (for drawing wooden discs under chairs)
  tableCenters: [
    { cx: 210, cy: 510 },
    { cx: 410, cy: 510 },
    { cx: 610, cy: 510 },
  ],

  // Entrance / door anchor (bottom-right)
  entrance:    { x: 880, y: 540 },
  doorOpening: { x: 850, y: 480 },
} as const;

// ── Small helpers ─────────────────────────────────────────────────────────

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number,
  r: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y,     x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x,     y + h, r);
  ctx.arcTo(x,     y + h, x,     y,     r);
  ctx.arcTo(x,     y,     x + w, y,     r);
  ctx.closePath();
}

function softShadow(ctx: CanvasRenderingContext2D, cx: number, cy: number, w: number, h: number): void {
  ctx.save();
  ctx.fillStyle = 'rgba(60,40,20,0.18)';
  ctx.beginPath();
  ctx.ellipse(cx, cy, w / 2, h / 2, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

// ── Station kinds: each drawn ~80×100, anchored at center bottom (cx, cy) ──

type StationKind = 'counter' | 'grill' | 'fryer' | 'drink' | 'dessert' | 'prep' | 'assembly';

function drawStation(
  ctx: CanvasRenderingContext2D,
  kind: StationKind,
  cx: number,
  cy: number,
  timeMs: number,
): void {
  const W = 92;
  const H = 100;
  const top = cy - H + 18;
  const left = cx - W / 2;

  // Shadow on floor
  softShadow(ctx, cx, cy + 14, W * 1.05, 14);

  switch (kind) {
    case 'grill': {
      // Stainless body
      ctx.fillStyle = '#9CA3AF';
      roundRect(ctx, left, top + 30, W, H - 30, 4); ctx.fill();
      // Grill top (dark grates)
      ctx.fillStyle = '#2D2A2A';
      roundRect(ctx, left + 4, top + 30, W - 8, 14, 3); ctx.fill();
      ctx.strokeStyle = '#4B4848';
      ctx.lineWidth = 1.5;
      for (let i = 0; i < 4; i++) {
        ctx.beginPath();
        ctx.moveTo(left + 8 + i * 20, top + 32);
        ctx.lineTo(left + 8 + i * 20, top + 42);
        ctx.stroke();
      }
      // Hood / chimney
      ctx.fillStyle = '#8B5E3C';
      roundRect(ctx, left + 18, top - 6, W - 36, 20, 4); ctx.fill();
      ctx.fillStyle = '#6B4421';
      ctx.fillRect(left + W / 2 - 4, top - 18, 8, 14);
      // Flames (animated)
      const flicker = (Math.sin(timeMs / 90) + 1) / 2;
      ctx.save();
      ctx.translate(cx, top + 30);
      for (let i = -1; i <= 1; i++) {
        const fh = 8 + flicker * 4 + i * 2;
        ctx.fillStyle = '#FBBF24';
        ctx.beginPath();
        ctx.ellipse(i * 12, -fh / 2, 5, fh, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#F97316';
        ctx.beginPath();
        ctx.ellipse(i * 12, -fh / 2 + 2, 3, fh - 2, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
      // Knobs
      ctx.fillStyle = '#1F2937';
      for (let k = 0; k < 3; k++) {
        ctx.beginPath();
        ctx.arc(left + 16 + k * 30, top + 60, 3, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }
    case 'fryer': {
      // Body
      ctx.fillStyle = '#D97706';
      roundRect(ctx, left, top + 24, W, H - 24, 6); ctx.fill();
      // Oil basin
      ctx.fillStyle = '#FCD34D';
      roundRect(ctx, left + 6, top + 28, W - 12, 30, 4); ctx.fill();
      // Bubbles
      const phase = timeMs / 400;
      ctx.fillStyle = '#FEF3C7';
      for (let b = 0; b < 6; b++) {
        const bx = left + 14 + ((b * 13 + phase * 8) % (W - 28));
        const by = top + 56 - ((phase + b) * 4) % 22 - 2;
        ctx.beginPath();
        ctx.arc(bx, by, 2, 0, Math.PI * 2);
        ctx.fill();
      }
      // Basket handle
      ctx.strokeStyle = '#374151';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(left + W / 2 - 18, top + 28);
      ctx.lineTo(left + W / 2 - 18, top + 16);
      ctx.lineTo(left + W / 2 + 18, top + 16);
      ctx.lineTo(left + W / 2 + 18, top + 28);
      ctx.stroke();
      break;
    }
    case 'drink': {
      // Soda fountain — turquoise cabinet
      ctx.fillStyle = '#0E9488';
      roundRect(ctx, left, top + 18, W, H - 18, 6); ctx.fill();
      // Glass panel
      ctx.fillStyle = '#CFFAFE';
      roundRect(ctx, left + 6, top + 24, W - 12, 36, 4); ctx.fill();
      // Bottles
      const bottleColors = ['#EF4444', '#F59E0B', '#22D3EE', '#A78BFA'];
      for (let i = 0; i < 4; i++) {
        ctx.fillStyle = bottleColors[i]!;
        roundRect(ctx, left + 12 + i * 18, top + 28, 12, 28, 3); ctx.fill();
        // Bottle neck
        ctx.fillStyle = '#fff';
        ctx.fillRect(left + 16 + i * 18, top + 24, 4, 6);
      }
      // Tap
      ctx.fillStyle = '#94A3B8';
      ctx.fillRect(left + W / 2 - 3, top + 64, 6, 14);
      ctx.beginPath();
      ctx.arc(left + W / 2, top + 80, 5, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'dessert': {
      // Pink ice cream case
      ctx.fillStyle = '#F472B6';
      roundRect(ctx, left, top + 24, W, H - 24, 6); ctx.fill();
      // Glass dome
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      ctx.beginPath();
      ctx.ellipse(cx, top + 24, W / 2 - 4, 18, 0, Math.PI, 0, true);
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      // Ice cream scoops inside the case
      const scoops = ['#FCA5A5', '#FBBF24', '#A78BFA'];
      for (let i = 0; i < 3; i++) {
        ctx.fillStyle = scoops[i]!;
        ctx.beginPath();
        ctx.arc(left + 22 + i * 25, top + 26, 8, 0, Math.PI * 2);
        ctx.fill();
        // Cherry
        ctx.fillStyle = '#DC2626';
        ctx.beginPath();
        ctx.arc(left + 22 + i * 25, top + 19, 2, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }
    case 'counter': {
      // Wooden counter / cash register
      ctx.fillStyle = '#92400E';
      roundRect(ctx, left, top + 20, W, H - 20, 6); ctx.fill();
      ctx.fillStyle = '#B45309';
      ctx.fillRect(left + 4, top + 24, W - 8, 8);
      // Cash register on top
      ctx.fillStyle = '#374151';
      roundRect(ctx, left + 18, top - 2, W - 36, 22, 3); ctx.fill();
      ctx.fillStyle = '#22C55E';
      ctx.fillRect(left + 26, top + 2, W - 52, 8);
      // Keys
      ctx.fillStyle = '#9CA3AF';
      for (let i = 0; i < 3; i++) {
        ctx.fillRect(left + 24 + i * 14, top + 12, 8, 5);
      }
      break;
    }
    case 'prep':
    case 'assembly': {
      // Stainless prep table
      ctx.fillStyle = '#A1A1AA';
      roundRect(ctx, left, top + 24, W, H - 24, 4); ctx.fill();
      ctx.fillStyle = '#71717A';
      ctx.fillRect(left + 6, top + 30, W - 12, 4);
      // Cutting board
      ctx.fillStyle = '#D4A574';
      roundRect(ctx, left + 14, top + 38, W - 28, 22, 3); ctx.fill();
      // Knife
      ctx.fillStyle = '#E5E7EB';
      ctx.fillRect(left + 22, top + 44, 24, 3);
      ctx.fillStyle = '#7C2D12';
      ctx.fillRect(left + 16, top + 43, 8, 5);
      break;
    }
  }
}

// ── Tables and chairs ─────────────────────────────────────────────────────

function drawTableSet(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
): void {
  // Floor shadow
  softShadow(ctx, cx, cy + 24, 70, 12);

  // Two chairs (one on each side)
  for (const ox of [-30, 30]) {
    ctx.fillStyle = '#7C3F1B';
    roundRect(ctx, cx + ox - 12, cy - 10, 24, 28, 4);
    ctx.fill();
    // Chair back
    ctx.fillStyle = '#A0541F';
    roundRect(ctx, cx + ox - 12, cy - 16, 24, 8, 3);
    ctx.fill();
    // Seat highlight
    ctx.fillStyle = 'rgba(255,235,200,0.35)';
    ctx.fillRect(cx + ox - 10, cy - 8, 20, 3);
  }

  // Table top (oval)
  ctx.save();
  ctx.translate(cx, cy);
  // Pedestal
  ctx.fillStyle = '#5C2E0E';
  ctx.fillRect(-4, 0, 8, 22);
  // Top
  const tableGrad = ctx.createRadialGradient(0, -3, 5, 0, 0, 40);
  tableGrad.addColorStop(0, '#C99462');
  tableGrad.addColorStop(1, '#8B5A2B');
  ctx.fillStyle = tableGrad;
  ctx.beginPath();
  ctx.ellipse(0, 0, 36, 14, 0, 0, Math.PI * 2);
  ctx.fill();
  // Highlight ring
  ctx.strokeStyle = 'rgba(255,235,200,0.4)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.ellipse(0, -3, 30, 9, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

// ── Window / décor on the back wall ─────────────────────────────────────

function drawBackWallDecor(ctx: CanvasRenderingContext2D): void {
  // Hanging string lights across the dining area
  ctx.strokeStyle = 'rgba(80,55,30,0.5)';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(140, 422);
  ctx.quadraticCurveTo(480, 444, 820, 422);
  ctx.stroke();
  // Bulbs
  for (let i = 0; i < 14; i++) {
    const t = i / 13;
    const x = 140 + t * 680;
    // Sag based on quadratic curve
    const y = 422 + Math.sin(t * Math.PI) * 14;
    ctx.fillStyle = '#FBBF24';
    ctx.beginPath();
    ctx.arc(x, y + 4, 2.5, 0, Math.PI * 2);
    ctx.fill();
    // Glow
    ctx.fillStyle = 'rgba(251,191,36,0.22)';
    ctx.beginPath();
    ctx.arc(x, y + 4, 6, 0, Math.PI * 2);
    ctx.fill();
  }

  // Chalkboard menu on back wall (between stations 4 and 5)
  ctx.fillStyle = '#1F2937';
  roundRect(ctx, 700, 296, 70, 50, 4); ctx.fill();
  ctx.fillStyle = '#92400E';
  ctx.lineWidth = 2;
  ctx.strokeStyle = '#92400E';
  roundRect(ctx, 700, 296, 70, 50, 4); ctx.stroke();
  ctx.fillStyle = '#F9FAFB';
  ctx.font = 'bold 8px Georgia, serif';
  ctx.textAlign = 'center';
  ctx.fillText('TODAY', 735, 308);
  ctx.fillStyle = '#FCD34D';
  ctx.font = 'italic 7px Georgia, serif';
  ctx.fillText('· burgers', 735, 320);
  ctx.fillText('· fries', 735, 330);
  ctx.fillText('· cold drinks', 735, 340);
}

// ── Door / entrance ───────────────────────────────────────────────────────

function drawEntrance(ctx: CanvasRenderingContext2D): void {
  const x = SHOP_LAYOUT.entrance.x;
  const y = SHOP_LAYOUT.entrance.y;

  // Door frame
  ctx.fillStyle = '#7C2D12';
  ctx.fillRect(x - 26, y - 80, 50, 80);
  // Door itself (slightly open)
  ctx.fillStyle = '#C49860';
  ctx.fillRect(x - 22, y - 76, 42, 76);
  // Door window
  ctx.fillStyle = '#A7DAEA';
  roundRect(ctx, x - 16, y - 70, 30, 22, 3); ctx.fill();
  ctx.strokeStyle = '#7C2D12';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x - 1, y - 70);
  ctx.lineTo(x - 1, y - 48);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x - 16, y - 59);
  ctx.lineTo(x + 14, y - 59);
  ctx.stroke();
  // Doorknob
  ctx.fillStyle = '#FBBF24';
  ctx.beginPath();
  ctx.arc(x + 10, y - 36, 2.5, 0, Math.PI * 2);
  ctx.fill();
  // OPEN sign
  ctx.fillStyle = '#16A34A';
  roundRect(ctx, x - 18, y - 42, 34, 12, 2); ctx.fill();
  ctx.fillStyle = '#FFFFFF';
  ctx.font = 'bold 7px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('OPEN', x - 1, y - 33);
}

// ── Main entry point ─────────────────────────────────────────────────────

export function drawShop(ctx: CanvasRenderingContext2D, timeMs: number): void {
  const W = 960;
  const ceilingY = SHOP_LAYOUT.ceilingY;
  const totalH = 600 - ceilingY;

  // ── Floor: warm wood gradient ────────────────────────────────────────
  const floorGrad = ctx.createLinearGradient(0, ceilingY, 0, 600);
  floorGrad.addColorStop(0, '#F5E1B9');
  floorGrad.addColorStop(0.45, '#EFD3A1');
  floorGrad.addColorStop(1, '#D9B47A');
  ctx.fillStyle = floorGrad;
  ctx.fillRect(0, ceilingY, W, totalH);

  // ── Subtle plank grain ──────────────────────────────────────────────
  ctx.save();
  ctx.strokeStyle = 'rgba(120,85,40,0.13)';
  ctx.lineWidth = 0.8;
  for (let y = ceilingY + 30; y < 600; y += 26) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(W, y);
    ctx.stroke();
  }
  ctx.restore();

  // ── Back wall stripe ────────────────────────────────────────────────
  // Soft sky-toned strip behind the kitchen (sells "back of house" feel)
  const wallGrad = ctx.createLinearGradient(0, ceilingY, 0, SHOP_LAYOUT.counterY);
  wallGrad.addColorStop(0, '#FFE9C2');
  wallGrad.addColorStop(1, '#F2D49B');
  ctx.fillStyle = wallGrad;
  ctx.fillRect(0, ceilingY, W, SHOP_LAYOUT.counterY - ceilingY);

  // Décor on the back wall (string lights, chalkboard) — drawn UNDER the stations
  drawBackWallDecor(ctx);

  // ── Stations along the back ─────────────────────────────────────────
  // Draw counter/grill/fryer/drink/dessert (the visible kitchen line).
  // prep/assembly share station 5 area and are not drawn separately.
  const visibleStations: StationKind[] = ['counter', 'grill', 'fryer', 'drink', 'dessert'];
  for (const kind of visibleStations) {
    const slot = SHOP_LAYOUT.stations[kind];
    drawStation(ctx, kind, slot.cx, slot.cy, timeMs);
  }

  // ── Counter divider (wooden bar between kitchen and dining) ─────────
  const cy = SHOP_LAYOUT.counterY;
  const ch = SHOP_LAYOUT.counterH;
  const counterGrad = ctx.createLinearGradient(0, cy, 0, cy + ch);
  counterGrad.addColorStop(0, '#A86A2E');
  counterGrad.addColorStop(1, '#7C3F1B');
  ctx.fillStyle = counterGrad;
  ctx.fillRect(0, cy, W, ch);
  ctx.fillStyle = 'rgba(255,230,180,0.4)';
  ctx.fillRect(0, cy, W, 2);

  // ── Dining area: tables and chairs ──────────────────────────────────
  for (const t of SHOP_LAYOUT.tableCenters) {
    drawTableSet(ctx, t.cx, t.cy);
  }

  // ── Entrance ────────────────────────────────────────────────────────
  drawEntrance(ctx);
}
