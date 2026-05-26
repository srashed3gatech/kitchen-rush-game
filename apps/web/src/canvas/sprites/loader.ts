/**
 * Sprite loader — lazy-loads PNGs from /sprites/ and caches them.
 *
 * Path resolution: `/sprites/{src}` — Vite serves apps/web/public statically
 * at /, so `public/sprites/toon-characters/chef_blond.png` becomes
 * `/sprites/toon-characters/chef_blond.png` at runtime.
 */

import { ATLAS, type SpriteKey } from './atlas.js';

const BASE = '/sprites/';

/** Shared image cache keyed by the raw src path (not the SpriteKey). */
const cache = new Map<string, HTMLImageElement>();

/** Promises in-flight, keyed by src — prevents duplicate concurrent loads. */
const pending = new Map<string, Promise<HTMLImageElement>>();

function loadByPath(src: string): Promise<HTMLImageElement> {
  const cached = cache.get(src);
  if (cached) return Promise.resolve(cached);

  const inFlight = pending.get(src);
  if (inFlight) return inFlight;

  const p = new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      cache.set(src, img);
      pending.delete(src);
      resolve(img);
    };
    img.onerror = () => {
      pending.delete(src);
      reject(new Error(`Failed to load sprite: ${BASE}${src}`));
    };
    img.src = `${BASE}${src}`;
  });

  pending.set(src, p);
  return p;
}

/**
 * Load a single sprite by atlas key.
 * Returns the cached HTMLImageElement; loads it if not yet cached.
 */
export function loadSprite(key: SpriteKey): Promise<HTMLImageElement> {
  const entry = ATLAS[key];
  if (!entry) return Promise.reject(new Error(`Unknown sprite key: ${key}`));
  return loadByPath(entry.src);
}

/**
 * Eagerly preload every sprite in the atlas.
 * Resolves when all images have finished loading (or failing gracefully).
 * Failed images are silently skipped — the renderer falls back to a
 * coloured rectangle for any missing sprite.
 */
export async function preloadAll(): Promise<void> {
  const srcs = [...new Set(Object.values(ATLAS).map((e) => e.src))];
  await Promise.allSettled(srcs.map((src) => loadByPath(src)));
}

/**
 * Synchronous lookup — returns the cached image or undefined.
 * Use this inside the RAF draw loop (never await in a draw call).
 */
export function getCached(key: SpriteKey): HTMLImageElement | undefined {
  const entry = ATLAS[key];
  if (!entry) return undefined;
  return cache.get(entry.src);
}
