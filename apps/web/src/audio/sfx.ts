/**
 * sfx.ts — tiny WebAudio synthesizer for the cozy kid game.
 *
 * No asset files. All sounds are short oscillator + envelope blips so they
 * load instantly, work offline, and respect iPad autoplay rules (the very
 * first user tap initializes the AudioContext, then every later sound flows).
 *
 * Public API:
 *   playSfx(name)  — fire-and-forget a named sound
 *   setMuted(bool) — runtime mute (persisted to localStorage)
 *   isMuted()      — current state
 *   primeOnFirstGesture() — call once on app boot; unlocks audio on the
 *                            first pointer/key event.
 *
 * Tone palette (frequencies in Hz):
 *   coin    — 880 → 1320 quick bright glint            ("$ ka-ching")
 *   chime   — 660 → 880 → 1175 soft 3-note arpeggio    (good moment)
 *   bell    — 1320 + 1760 brief bell                    (customer enters)
 *   pop     — 440 quick blip                            (modal open / button)
 *   click   — 220 ultra-short tick                      (tap feedback)
 *   cheer   — 587 + 784 + 988 bright triad              (review ≥ 80)
 *   sad     — 392 + 330 falling                         (review < 40)
 *   praise  — 880 + 1175 warm two-note                  (coaching landed)
 *   thanks  — 1175 + 880 dropping warm                  (customer thanks)
 */

const MUTE_KEY = 'kr_audio_muted';

let ctx: AudioContext | null = null;
let masterGain: GainNode | null = null;
let muted = false;
let primed = false;

try {
  muted = localStorage.getItem(MUTE_KEY) === '1';
} catch {
  // localStorage unavailable (e.g. private mode) — fine, default unmuted.
}

function ensureCtx(): boolean {
  if (muted) return false;
  if (ctx && ctx.state !== 'closed') {
    if (ctx.state === 'suspended') void ctx.resume();
    return true;
  }
  try {
    const Ctx =
      (window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext })
        .AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return false;
    ctx = new Ctx();
    masterGain = ctx.createGain();
    masterGain.gain.value = 0.35; // kid-friendly: not loud
    masterGain.connect(ctx.destination);
    return true;
  } catch {
    return false;
  }
}

interface Note {
  /** Hz */
  freq: number;
  /** seconds offset from sequence start */
  at: number;
  /** seconds */
  dur: number;
  /** peak gain (0..1, scaled by masterGain) */
  gain?: number;
  /** 'sine' | 'triangle' | 'square' | 'sawtooth' */
  type?: OscillatorType;
}

function playSequence(notes: Note[]): void {
  if (!ensureCtx() || !ctx || !masterGain) return;
  const start = ctx.currentTime;
  for (const n of notes) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = n.type ?? 'sine';
    osc.frequency.value = n.freq;
    const peak = (n.gain ?? 0.5);
    const t0 = start + n.at;
    const t1 = t0 + Math.max(0.04, n.dur);
    // Quick attack, exponential decay — feels "musical"
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(peak, t0 + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, t1);
    osc.connect(gain).connect(masterGain);
    osc.start(t0);
    osc.stop(t1 + 0.02);
  }
}

export type SfxName =
  | 'coin'
  | 'chime'
  | 'bell'
  | 'pop'
  | 'click'
  | 'cheer'
  | 'sad'
  | 'praise'
  | 'thanks';

const RECIPES: Record<SfxName, Note[]> = {
  coin: [
    { freq: 988,  at: 0.00, dur: 0.10, type: 'triangle', gain: 0.55 },
    { freq: 1318, at: 0.06, dur: 0.16, type: 'triangle', gain: 0.55 },
  ],
  chime: [
    { freq: 659,  at: 0.00, dur: 0.22, type: 'sine', gain: 0.45 },
    { freq: 880,  at: 0.08, dur: 0.22, type: 'sine', gain: 0.45 },
    { freq: 1175, at: 0.16, dur: 0.28, type: 'sine', gain: 0.40 },
  ],
  bell: [
    { freq: 1318, at: 0.00, dur: 0.20, type: 'triangle', gain: 0.5 },
    { freq: 1760, at: 0.03, dur: 0.18, type: 'triangle', gain: 0.4 },
  ],
  pop: [
    { freq: 440, at: 0, dur: 0.08, type: 'triangle', gain: 0.45 },
  ],
  click: [
    { freq: 220, at: 0, dur: 0.04, type: 'square', gain: 0.25 },
  ],
  cheer: [
    { freq: 587, at: 0.00, dur: 0.22, type: 'triangle', gain: 0.5 },
    { freq: 784, at: 0.10, dur: 0.22, type: 'triangle', gain: 0.5 },
    { freq: 988, at: 0.20, dur: 0.30, type: 'triangle', gain: 0.5 },
  ],
  sad: [
    { freq: 392, at: 0.00, dur: 0.22, type: 'sine', gain: 0.4 },
    { freq: 330, at: 0.18, dur: 0.30, type: 'sine', gain: 0.4 },
  ],
  praise: [
    { freq: 880,  at: 0.00, dur: 0.16, type: 'sine', gain: 0.45 },
    { freq: 1175, at: 0.08, dur: 0.22, type: 'sine', gain: 0.40 },
  ],
  thanks: [
    { freq: 1175, at: 0.00, dur: 0.14, type: 'sine', gain: 0.45 },
    { freq: 880,  at: 0.08, dur: 0.20, type: 'sine', gain: 0.40 },
  ],
};

export function playSfx(name: SfxName): void {
  const recipe = RECIPES[name];
  if (!recipe) return;
  playSequence(recipe);
}

export function isMuted(): boolean {
  return muted;
}

export function setMuted(value: boolean): void {
  muted = value;
  try {
    localStorage.setItem(MUTE_KEY, value ? '1' : '0');
  } catch {
    // ignore
  }
  if (value && ctx) {
    // Silence anything in flight
    if (masterGain) masterGain.gain.value = 0;
  } else if (masterGain) {
    masterGain.gain.value = 0.35;
  }
}

/**
 * iPad Safari blocks AudioContext until a user gesture. Call this once on
 * app mount; the very first pointer or key event will unlock audio and
 * then this listener removes itself.
 */
export function primeOnFirstGesture(): void {
  if (primed) return;
  primed = true;
  const unlock = () => {
    ensureCtx();
    window.removeEventListener('pointerdown', unlock);
    window.removeEventListener('keydown', unlock);
    window.removeEventListener('touchstart', unlock);
  };
  window.addEventListener('pointerdown', unlock, { passive: true });
  window.addEventListener('keydown', unlock);
  window.addEventListener('touchstart', unlock, { passive: true });
}
