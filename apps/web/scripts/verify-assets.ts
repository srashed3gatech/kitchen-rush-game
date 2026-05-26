#!/usr/bin/env tsx
/**
 * verify-assets.ts — prebuild validation.
 *
 * Reads apps/web/src/canvas/sprites/atlas.ts, extracts every `src` value,
 * and asserts that the corresponding PNG exists under
 * apps/web/public/sprites/.
 *
 * Exits 0 if all assets are present, exits 1 with a clear error list otherwise.
 *
 * Run via: tsx apps/web/scripts/verify-assets.ts
 * Also wired into apps/web/package.json "prebuild" script.
 */

import { existsSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Resolve paths relative to apps/web/
const WEB_ROOT    = resolve(__dirname, '..');
const ATLAS_FILE  = resolve(WEB_ROOT, 'src/canvas/sprites/atlas.ts');
const SPRITES_DIR = resolve(WEB_ROOT, 'public/sprites');

// ── Parse atlas.ts ───────────────────────────────────────────────────────────
// We read the TS source and regex-extract every `src: '...'` value.
// This avoids a ts-node import and keeps the script fast.

function extractSrcValues(source: string): string[] {
  const matches = [...source.matchAll(/src:\s*['"]([^'"]+)['"]/g)];
  return [...new Set(matches.map((m) => m[1]))];
}

// ── Main ─────────────────────────────────────────────────────────────────────

const source = readFileSync(ATLAS_FILE, 'utf-8');
const srcs = extractSrcValues(source);

if (srcs.length === 0) {
  console.error('[verify-assets] ERROR: No src values found in atlas.ts — check the regex.');
  process.exit(1);
}

const missing: string[] = [];

for (const src of srcs) {
  const fullPath = resolve(SPRITES_DIR, src);
  if (!existsSync(fullPath)) {
    missing.push(src);
  }
}

if (missing.length > 0) {
  console.error(
    `[verify-assets] FAIL — ${missing.length} sprite(s) missing from apps/web/public/sprites/:\n`,
  );
  for (const m of missing) {
    console.error(`  MISSING: ${m}`);
    console.error(`           Expected at: public/sprites/${m}`);
  }
  console.error(`
To fix:
  1. If you have the real Kenney packs, copy the PNGs to the correct paths above.
  2. Or run the placeholder generator:
       node apps/web/scripts/generate-placeholder-sprites.mjs
  3. See apps/web/public/sprites/README.md for full swap instructions.
`);
  process.exit(1);
}

console.log(`[verify-assets] OK — all ${srcs.length} sprites present.`);
