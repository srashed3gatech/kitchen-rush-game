// claudeClient.ts — STUB.
// Wave 2 will implement real Anthropic SDK calls here.
// Exported for use by reviewScorer.ts and coachReply.ts in Wave 2.

import Anthropic from '@anthropic-ai/sdk';

/** Get an Anthropic client configured with the given API key. */
export function getAnthropicClient(apiKey: string): Anthropic {
  return new Anthropic({ apiKey });
}
