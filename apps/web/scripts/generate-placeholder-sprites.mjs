#!/usr/bin/env node
/**
 * generate-placeholder-sprites.mjs
 *
 * Generates procedural placeholder PNGs for all sprites referenced by atlas.ts.
 * Runs with Node.js built-ins only — no canvas library required.
 *
 * PNG encoding:
 *   - Uses pure CRC32 + zlib deflate via Node's built-in `zlib` module.
 *   - Outputs RGBA pixel data for a simple coloured shape + label.
 *
 * Run: node apps/web/scripts/generate-placeholder-sprites.mjs
 */

import { createWriteStream, mkdirSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SPRITES_DIR = resolve(__dirname, '../public/sprites');

// ── PNG encoding helpers ─────────────────────────────────────────────────────

function crc32(buf) {
  const table = (() => {
    const t = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
      let c = i;
      for (let k = 0; k < 8; k++) c = (c & 1) ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
      t[i] = c;
    }
    return t;
  })();
  let c = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) c = table[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

function uint32BE(n) {
  const b = Buffer.alloc(4);
  b.writeUInt32BE(n >>> 0, 0);
  return b;
}

function chunk(type, data) {
  const typeBytes = Buffer.from(type, 'ascii');
  const len = uint32BE(data.length);
  const crcInput = Buffer.concat([typeBytes, data]);
  const crcBytes = uint32BE(crc32(crcInput));
  return Buffer.concat([len, typeBytes, data, crcBytes]);
}

function makePNG(width, height, drawFn) {
  // drawFn(x, y) → [r, g, b, a]
  const SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData[8] = 8;   // bit depth
  ihdrData[9] = 2;   // color type RGB (we'll use RGBA=6 actually)
  ihdrData[9] = 6;   // RGBA
  ihdrData[10] = 0;  // compression
  ihdrData[11] = 0;  // filter
  ihdrData[12] = 0;  // interlace

  // Raw pixel data — filter byte (0) + RGBA per pixel per row
  const raw = Buffer.alloc(height * (1 + width * 4));
  for (let y = 0; y < height; y++) {
    raw[y * (1 + width * 4)] = 0; // filter type: None
    for (let x = 0; x < width; x++) {
      const [r, g, b, a] = drawFn(x, y);
      const off = y * (1 + width * 4) + 1 + x * 4;
      raw[off]     = r;
      raw[off + 1] = g;
      raw[off + 2] = b;
      raw[off + 3] = a;
    }
  }

  const compressed = deflateSync(raw, { level: 6 });
  const idat = chunk('IDAT', compressed);
  const ihdr = chunk('IHDR', ihdrData);
  const iend = chunk('IEND', Buffer.alloc(0));

  return Buffer.concat([SIGNATURE, ihdr, idat, iend]);
}

// ── Shape helpers ────────────────────────────────────────────────────────────

function inCircle(x, y, cx, cy, r) {
  const dx = x - cx; const dy = y - cy;
  return dx * dx + dy * dy <= r * r;
}

function inRect(x, y, rx, ry, rw, rh) {
  return x >= rx && x < rx + rw && y >= ry && y < ry + rh;
}

// Simple 5×7 pixel font bitmaps for A-Z and 0-9 (subset)
const FONT = {
  A:['01110','10001','10001','11111','10001','10001','10001'],
  B:['11110','10001','10001','11110','10001','10001','11110'],
  C:['01110','10001','10000','10000','10000','10001','01110'],
  D:['11110','10001','10001','10001','10001','10001','11110'],
  E:['11111','10000','10000','11110','10000','10000','11111'],
  F:['11111','10000','10000','11110','10000','10000','10000'],
  G:['01110','10001','10000','10111','10001','10001','01111'],
  H:['10001','10001','10001','11111','10001','10001','10001'],
  I:['01110','00100','00100','00100','00100','00100','01110'],
  K:['10001','10010','10100','11000','10100','10010','10001'],
  L:['10000','10000','10000','10000','10000','10000','11111'],
  M:['10001','11011','10101','10001','10001','10001','10001'],
  N:['10001','11001','10101','10011','10001','10001','10001'],
  O:['01110','10001','10001','10001','10001','10001','01110'],
  P:['11110','10001','10001','11110','10000','10000','10000'],
  R:['11110','10001','10001','11110','10100','10010','10001'],
  S:['01111','10000','10000','01110','00001','00001','11110'],
  T:['11111','00100','00100','00100','00100','00100','00100'],
  U:['10001','10001','10001','10001','10001','10001','01110'],
  V:['10001','10001','10001','10001','10001','01010','00100'],
  W:['10001','10001','10001','10001','10101','11011','10001'],
  Y:['10001','10001','01010','00100','00100','00100','00100'],
  ' ':['00000','00000','00000','00000','00000','00000','00000'],
  '?':['01110','10001','00001','00010','00100','00000','00100'],
};

function renderText(text, x, y, pixels, pw, ph, r, g, b) {
  const scale = 1;
  let cx = x;
  for (const ch of text.toUpperCase()) {
    const bitmap = FONT[ch] || FONT['?'];
    const charWidth = bitmap[0]?.length ?? 5;
    for (let row = 0; row < 7; row++) {
      const line = bitmap[row];
      if (!line) continue;
      for (let col = 0; col < line.length; col++) {
        if (line[col] === '1') {
          const px = cx + col * scale;
          const py = y + row * scale;
          for (let dy = 0; dy < scale; dy++) {
            for (let dx = 0; dx < scale; dx++) {
              const nx = px + dx; const ny = py + dy;
              if (nx >= 0 && nx < pw && ny >= 0 && ny < ph) {
                const off = (ny * pw + nx) * 4;
                pixels[off] = r; pixels[off+1] = g; pixels[off+2] = b; pixels[off+3] = 255;
              }
            }
          }
        }
      }
    }
    cx += (charWidth + 1) * scale;
  }
}

// ── Sprite generators ────────────────────────────────────────────────────────

// Worker: 64×64 RGBA. Circle body + chef-hat silhouette + colored fill.
function makeWorkerSprite(bodyColor, label) {
  const [br, bg, bb] = bodyColor;
  return makePNG(64, 64, (x, y) => {
    const cx = 32; const cy = 36;
    // Background transparent
    // Body circle
    if (inCircle(x, y, cx, cy, 22)) return [br, bg, bb, 255];
    // Chef hat brim
    if (y >= 10 && y <= 16 && x >= 16 && x <= 48) return [240, 240, 240, 255];
    // Hat top
    if (inRect(x, y, 20, 2, 24, 14)) return [250, 250, 250, 255];
    // Outline ring
    const dx = x - cx; const dy = y - cy;
    const r2 = dx*dx + dy*dy;
    if (r2 <= 24*24 && r2 >= 21*21) return [60, 40, 20, 200];
    return [0, 0, 0, 0]; // transparent
  });
}

// Customer: 64×64. Filled circle with persona color + initial letter.
function makeCustomerSprite(bodyColor, initial) {
  const [br, bg, bb] = bodyColor;
  // Build pixel array for text rendering
  const w = 64; const h = 64;
  const pixels = new Uint8Array(w * h * 4); // all transparent

  // Draw circle
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const off = (y * w + x) * 4;
      if (inCircle(x, y, 32, 32, 28)) {
        pixels[off] = br; pixels[off+1] = bg; pixels[off+2] = bb; pixels[off+3] = 255;
      }
      // Outline
      const dx = x - 32; const dy = y - 32;
      const r2 = dx*dx + dy*dy;
      if (r2 <= 28*28 && r2 >= 25*25) {
        pixels[off] = Math.max(0, br - 40);
        pixels[off+1] = Math.max(0, bg - 40);
        pixels[off+2] = Math.max(0, bb - 40);
        pixels[off+3] = 255;
      }
    }
  }
  // Render initial letter centered
  renderText(initial, 28, 25, pixels, w, h, 255, 255, 255);

  // Now produce PNG from pixels array
  const SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(w, 0); ihdrData.writeUInt32BE(h, 4);
  ihdrData[8] = 8; ihdrData[9] = 6;

  const raw = Buffer.alloc(h * (1 + w * 4));
  for (let y = 0; y < h; y++) {
    raw[y * (1 + w * 4)] = 0;
    for (let x = 0; x < w; x++) {
      const src = (y * w + x) * 4;
      const dst = y * (1 + w * 4) + 1 + x * 4;
      raw[dst] = pixels[src]; raw[dst+1] = pixels[src+1];
      raw[dst+2] = pixels[src+2]; raw[dst+3] = pixels[src+3];
    }
  }
  const compressed = deflateSync(raw, { level: 6 });
  return Buffer.concat([SIGNATURE, chunk('IHDR', ihdrData), chunk('IDAT', compressed), chunk('IEND', Buffer.alloc(0))]);
}

// Station: 96×96 square with color + label
function makeStationSprite(bgColor, label) {
  const [br, bg, bb] = bgColor;
  const w = 96; const h = 96;
  const pixels = new Uint8Array(w * h * 4);

  // Background square with rounded corners
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const off = (y * w + x) * 4;
      // Rounded rect ~6px radius
      const inR = x >= 6 && x < w-6 && y >= 6 && y < h-6;
      if (!inR) {
        // Check corner rounding
        const corners = [
          [6, 6], [w-7, 6], [6, h-7], [w-7, h-7],
        ];
        let inCornerCircle = false;
        for (const [cx, cy] of corners) {
          const dx = x - cx; const dy = y - cy;
          if (dx*dx + dy*dy <= 36 && !inCircle(x, y, cx, cy, 6)) { inCornerCircle = true; break; }
        }
        if (inCornerCircle) continue;
      }
      const border = x < 3 || x >= w-3 || y < 3 || y >= h-3;
      if (border) {
        pixels[off] = Math.max(0, br-50); pixels[off+1] = Math.max(0, bg-50);
        pixels[off+2] = Math.max(0, bb-50); pixels[off+3] = 255;
      } else {
        pixels[off] = br; pixels[off+1] = bg; pixels[off+2] = bb; pixels[off+3] = 255;
      }
    }
  }

  // Label text in center (up to 5 chars)
  const short = label.slice(0, 7).toUpperCase();
  const textW = short.length * 6;
  const textX = Math.floor((w - textW) / 2);
  renderText(short, textX, 44, pixels, w, h, 255, 255, 255);

  const SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(w, 0); ihdrData.writeUInt32BE(h, 4);
  ihdrData[8] = 8; ihdrData[9] = 6;
  const raw = Buffer.alloc(h * (1 + w * 4));
  for (let y = 0; y < h; y++) {
    raw[y * (1 + w * 4)] = 0;
    for (let x = 0; x < w; x++) {
      const src = (y * w + x) * 4;
      const dst = y * (1 + w * 4) + 1 + x * 4;
      raw[dst] = pixels[src]; raw[dst+1] = pixels[src+1];
      raw[dst+2] = pixels[src+2]; raw[dst+3] = pixels[src+3];
    }
  }
  const compressed = deflateSync(raw, { level: 6 });
  return Buffer.concat([SIGNATURE, chunk('IHDR', ihdrData), chunk('IDAT', compressed), chunk('IEND', Buffer.alloc(0))]);
}

// Table: 64×64 brown circle
function makeTableSprite() {
  return makePNG(64, 64, (x, y) => {
    if (inCircle(x, y, 32, 32, 28)) {
      const dx = x-32; const dy = y-32; const r2 = dx*dx+dy*dy;
      if (r2 >= 25*25) return [100, 60, 20, 255]; // border
      return [141, 85, 36, 255]; // #8D5524
    }
    return [0, 0, 0, 0];
  });
}

// Chair: 32×32 brown square
function makeChairSprite() {
  return makePNG(32, 32, (x, y) => {
    if (x < 2 || x >= 30 || y < 2 || y >= 30) return [120, 80, 40, 255];
    if (inRect(x, y, 2, 2, 28, 28)) return [160, 120, 90, 255];
    return [0, 0, 0, 0];
  });
}

// ── Sprite manifest ──────────────────────────────────────────────────────────

const SPRITES = [
  // Workers
  { path: 'toon-characters/chef_blond.png',    gen: () => makeWorkerSprite([230, 200, 80], 'W') },
  { path: 'toon-characters/chef_brown.png',    gen: () => makeWorkerSprite([140, 90, 40], 'W') },
  { path: 'toon-characters/chef_redhead.png',  gen: () => makeWorkerSprite([200, 60, 30], 'W') },
  { path: 'toon-characters/chef_short.png',    gen: () => makeWorkerSprite([70, 50, 120], 'W') },

  // Customers
  { path: 'toon-characters/beach_bum.png',     gen: () => makeCustomerSprite([212, 168, 96], 'B') },
  { path: 'toon-characters/tourist_dad.png',   gen: () => makeCustomerSprite([74, 144, 217], 'D') },
  { path: 'toon-characters/tourist_mom.png',   gen: () => makeCustomerSprite([232, 127, 160], 'M') },
  { path: 'toon-characters/tourist_kid.png',   gen: () => makeCustomerSprite([255, 215, 64], 'K') },
  { path: 'toon-characters/date_a.png',        gen: () => makeCustomerSprite([156, 95, 192], 'A') },
  { path: 'toon-characters/date_b.png',        gen: () => makeCustomerSprite([42, 187, 176], 'B') },
  { path: 'toon-characters/foodie.png',        gen: () => makeCustomerSprite([128, 128, 128], 'F') },
  { path: 'toon-characters/night_owl.png',     gen: () => makeCustomerSprite([26, 58, 112], 'N') },
  { path: 'toon-characters/hangry_surfer.png', gen: () => makeCustomerSprite([224, 96, 32], 'S') },

  // Stations
  { path: 'restaurant-kit/grill.png',    gen: () => makeStationSprite([229, 57, 53], 'GRILL') },
  { path: 'restaurant-kit/fryer.png',    gen: () => makeStationSprite([251, 140, 0], 'FRYER') },
  { path: 'restaurant-kit/drink.png',    gen: () => makeStationSprite([0, 172, 193], 'DRINK') },
  { path: 'restaurant-kit/dessert.png',  gen: () => makeStationSprite([216, 27, 96], 'DESRT') },
  { path: 'restaurant-kit/prep.png',     gen: () => makeStationSprite([67, 160, 71], 'PREP') },
  { path: 'restaurant-kit/assembly.png', gen: () => makeStationSprite([109, 76, 65], 'ASSEM') },
  { path: 'restaurant-kit/counter.png',  gen: () => makeStationSprite([200, 169, 106], 'COUNT') },

  // Furniture
  { path: 'restaurant-kit/table.png',    gen: () => makeTableSprite() },
  { path: 'restaurant-kit/chair.png',    gen: () => makeChairSprite() },
];

// ── Main ─────────────────────────────────────────────────────────────────────

let created = 0;
let skipped = 0;

for (const sprite of SPRITES) {
  const fullPath = resolve(SPRITES_DIR, sprite.path);
  const dir = resolve(fullPath, '..');

  mkdirSync(dir, { recursive: true });

  if (existsSync(fullPath)) {
    skipped++;
    continue;
  }

  const buffer = sprite.gen();
  createWriteStream(fullPath).end(buffer);
  created++;
  console.log(`  created: ${sprite.path}`);
}

console.log(`\n[generate-placeholder-sprites] Done. Created ${created}, skipped ${skipped} (already exist).`);
if (skipped > 0) {
  console.log('  (Delete existing files and re-run to regenerate them.)');
}
