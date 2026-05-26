// reviewTemplates.ts — persona-flavored review text generator.
// Heuristic only (no AI). Each persona has a small phrase bank, split between
// happy / mistake / generic. The chosen phrase is salted by the customer name
// so the same player sees variety across orders.

import type { ReviewInput } from '@kitchen-rush/shared';
import type { Persona } from '@kitchen-rush/shared';

type PhraseBank = {
  happy:   string[];
  mistake: string[];
};

const TEMPLATES: Record<Persona, PhraseBank> = {
  beach_bum: {
    happy: [
      'Solid grindz, mate. {item} was choice.',
      'Mellow vibes, the {item} hit the spot 🌊',
      'No worries, that {item} was epic.',
      'Catch a wave and a {item}, what else do you need 🤙',
    ],
    mistake: [
      'Hmm, {item} was a bit off but still chill.',
      'Not my best meal but the vibes were okay.',
      '{item} was kinda meh today — still digging the spot tho.',
    ],
  },
  tourist_family: {
    happy: [
      'The kids loved the {item}! Will visit again 📸',
      'Friendly staff, great {item}, a perfect lunch.',
      'A delightful little stop on our trip — {item} was great.',
      'We snapped photos of the {item}! So fun.',
    ],
    mistake: [
      'The {item} wasn’t quite right — the children were patient though.',
      'A bit of a hiccup with the {item}, but the atmosphere is lovely.',
      'Not our best meal of the trip, but the spot is sweet.',
    ],
  },
  date_couple: {
    happy: [
      'Such a sweet little spot. The {item} was wonderful 💕',
      'Lovely evening, lovely {item}. Will definitely return.',
      'Perfect date spot — {item} was a winner.',
      'We split the {item} and it was magical ✨',
    ],
    mistake: [
      'The {item} was off, but the evening was still nice.',
      'Romantic vibes, slightly underwhelming {item}.',
      'A small misstep with the {item} — we’ll forgive it.',
    ],
  },
  foodie_critic: {
    happy: [
      'Surprisingly competent {item}. Notes: balanced, well-prepared.',
      'I was skeptical, but the {item} held up. Recommended.',
      'Honest, well-executed {item}. A fair price for the craft.',
      'The {item} shows promise. I’ll be watching this kitchen.',
    ],
    mistake: [
      'The {item} missed its mark. Technique needs work.',
      'Inconsistent execution on the {item}. Try again.',
      'The kitchen had an off moment with the {item}.',
    ],
  },
  night_owl: {
    happy: [
      'Late-night {item} fix, exactly what I needed 🦉',
      '{item} at midnight — chef’s kiss.',
      'Open late, hot {item}, no judgement. Love it.',
      'Best 2am {item} on the beach 🌙',
    ],
    mistake: [
      'The {item} was sleepy tonight, like me.',
      'Not their best work — still appreciate the late hours.',
      '{item} was off but I’m too tired to complain.',
    ],
  },
  hangry_surfer: {
    happy: [
      'Was STARVING. The {item} saved my session 🍔',
      'Fast and filling — exactly what a surfer needs.',
      'Brought me back to life. {item} was a 10/10.',
      'Pre-surf fuel sorted. {item} = perfect.',
    ],
    mistake: [
      'Bro the {item} was kinda rough today.',
      'Hangry got hangrier. {item} wasn’t it.',
      'The {item} let me down, but I get it — busy day.',
    ],
  },
};

function pickFrom<T>(arr: T[], seed: number): T {
  if (arr.length === 0) throw new Error('empty bank');
  return arr[Math.abs(seed) % arr.length]!;
}

function hashSeed(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) | 0;
  }
  return h;
}

export function generateReview(input: ReviewInput): { rawComment: string } {
  const archetype = input.customer.archetype as Persona;
  const bank = TEMPLATES[archetype];
  const phrases = input.order.wasMistake ? bank.mistake : bank.happy;
  // Seed on customer name + item so the same NPC says different things across visits.
  const seed = hashSeed(input.customer.displayName + input.order.menuItemDisplayName + Date.now());
  const phrase = pickFrom(phrases, seed);
  const rawComment = phrase.replace('{item}', input.order.menuItemDisplayName);
  return { rawComment };
}
