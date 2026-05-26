// coachReply.ts — STUB for Wave 2.
// Returns template-based worker responses for quiet-hours one-on-one sessions.
// Real Claude (Opus 4.7) implementation comes in Wave 2 per architecture §6.

import type { Worker } from '@kitchen-rush/shared';
import { xpToLevel } from '@kitchen-rush/shared';

interface CoachReplyInput {
  worker: Worker & { level?: 1 | 2 | 3 | 4 | 5 };
  choice: 1 | 2 | 3;
}

interface CoachReplyOutput {
  workerResponse: string;
  xpDelta: number;
  moodDelta: number;
  claudeUsed: boolean;
}

// Deltas per design §4.4
const ONE_ON_ONE_DELTAS: Record<1 | 2 | 3, { xp: number; mood: number }> = {
  1: { xp: 10, mood: 20 },
  2: { xp: 20, mood: 10 },
  3: { xp: 0,  mood: 25 },
};

// Template strings per choice
const REPLY_TEMPLATES: Record<1 | 2 | 3, (name: string) => string> = {
  1: (name) => `${name}: "The grill kept burning my patties — I'll watch it more carefully tomorrow."`,
  2: (name) => `${name}: "Yeah, I think I rushed the assembly. I'll slow down."`,
  3: (name) => `${name}: "Thanks. That means a lot."`,
};

export async function coachReply(
  userId: number,
  input: CoachReplyInput
): Promise<CoachReplyOutput> {
  const { worker, choice } = input;
  const { xp, mood } = ONE_ON_ONE_DELTAS[choice];
  const workerResponse = REPLY_TEMPLATES[choice](worker.name);

  return {
    workerResponse,
    xpDelta: xp,
    moodDelta: mood,
    claudeUsed: false,
  };
}
