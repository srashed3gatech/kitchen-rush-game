/**
 * Day-night overlay helper.
 *
 * Returns a tint colour (CSS rgba) and an alpha for the full-canvas overlay
 * rect, based on the current in-game minute (0 = midnight / 00:00,
 * 480 = 08:00 AM, 1020 = 17:00 / 5 PM, 1200 = 20:00 / 8 PM, etc.).
 *
 * Visual transition table from design.md §1:
 *   08:00 – 11:00  cool morning blue → bright          (480 – 660)
 *   11:00 – 16:00  bright daylight, warm beach          (660 – 960)
 *   16:00 – 19:00  golden hour, orange-pink             (960 – 1140)
 *   19:00 – 21:00  sunset over ocean                    (1140 – 1260)
 *   21:00 – 05:00  deep blue night, lantern warm-glow   (1260 – 1440 / 0 – 300)
 *   05:00 – 08:00  pre-dawn purple → soft sunrise       (300 – 480)
 */

export interface DayNightOverlay {
  /** CSS colour string for the tint rect, e.g. 'rgba(30, 60, 120, 0.25)' */
  color: string;
  /** 0–1 — draw the rect at this globalAlpha */
  alpha: number;
}

interface Keyframe {
  minute: number;     // in-game minute (0–1439)
  r: number; g: number; b: number;
  alpha: number;
}

/**
 * Keyframes for the overlay. Interpolated linearly between adjacent entries.
 * Minute 0 = midnight (00:00). Minute 480 = 08:00 AM.
 */
const KEYFRAMES: Keyframe[] = [
  // pre-dawn purple          05:00
  { minute:   0, r: 80,  g:  30, b: 100, alpha: 0.40 },
  // pre-dawn purple          05:00
  { minute: 300, r: 80,  g:  30, b: 100, alpha: 0.40 },
  // soft sunrise             07:30
  { minute: 450, r: 220, g: 130, b:  80, alpha: 0.18 },
  // cool morning             08:00
  { minute: 480, r:  60, g: 100, b: 180, alpha: 0.15 },
  // bright morning           10:00
  { minute: 600, r: 255, g: 230, b: 180, alpha: 0.05 },
  // bright daylight          11:00
  { minute: 660, r: 255, g: 240, b: 200, alpha: 0.00 },
  // bright daylight          14:00
  { minute: 840, r: 255, g: 240, b: 200, alpha: 0.00 },
  // late afternoon           16:00
  { minute: 960, r: 255, g: 180, b:  80, alpha: 0.12 },
  // golden hour              17:30
  { minute:1050, r: 255, g: 140, b:  60, alpha: 0.22 },
  // sunset                   19:00
  { minute:1140, r: 220, g:  90, b:  60, alpha: 0.28 },
  // dusk                     20:00
  { minute:1200, r:  60, g:  40, b: 100, alpha: 0.35 },
  // deep night               21:00
  { minute:1260, r:  20, g:  20,  b: 70, alpha: 0.45 },
  // deep night               00:00 / 1440 → wrap to 0
  { minute:1440, r:  20, g:  20,  b: 70, alpha: 0.45 },
];

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * Return the overlay descriptor for a given in-game minute (0–1439).
 */
export function getDayNightOverlay(inGameMinute: number): DayNightOverlay {
  // Clamp to [0, 1439]
  const m = ((inGameMinute % 1440) + 1440) % 1440;

  // Find surrounding keyframes
  let lo = KEYFRAMES[0]!;
  let hi = KEYFRAMES[KEYFRAMES.length - 1]!;

  for (let i = 0; i < KEYFRAMES.length - 1; i++) {
    const kfCurr = KEYFRAMES[i]!;
    const kfNext = KEYFRAMES[i + 1]!;
    if (m >= kfCurr.minute && m <= kfNext.minute) {
      lo = kfCurr;
      hi = kfNext;
      break;
    }
  }

  const range = hi.minute - lo.minute;
  const t = range === 0 ? 0 : (m - lo.minute) / range;

  const r = Math.round(lerp(lo.r, hi.r, t));
  const g = Math.round(lerp(lo.g, hi.g, t));
  const b = Math.round(lerp(lo.b, hi.b, t));
  const alpha = lerp(lo.alpha, hi.alpha, t);

  return {
    color: `rgb(${r},${g},${b})`,
    alpha: Math.max(0, Math.min(1, alpha)),
  };
}
