/**
 * What a robot may not say, and what to do next once it has.
 *
 * Debate Club installs user-set personalities into free-tier open-weight models
 * and tells them to argue. The dials are adversarial by design, and at their
 * high bands they stack: combative, arrogant, and losing patience all at once.
 * A weakly-aligned model told to talk down to someone will sometimes reach for
 * an identity-based insult. This module is the half of the answer that does not
 * depend on the model cooperating.
 *
 * Pure and I/O-free, so it sits in the same layer as `cooldowns.ts` and
 * `rateLimitHeaders.ts`. The screening itself, shared with any other feature
 * that generates model text, lives in `app/lib/moderation/`.
 */

import type { SafetyVerdict } from '@/app/lib/moderation/screen';

/**
 * The rules prepended to every turn's system prompt.
 *
 * Written to coexist with a combative persona rather than to override it. The
 * clean-language rule is not decoration: swearing forfeits a turn exactly as a
 * slur does, so a robot told to be combative has to be told not to reach for
 * profanity, or the aggression dial would disqualify it for complying. It names
 * sexual and violent content too, because the list backing it is broader than
 * cursing — a crude innuendo would end a turn without ever reading as "swearing"
 * to a model given a narrower rule. A
 * preamble that flattens every persona into the same polite voice would
 * recreate DESIGN.md's Risk #2 (sliders that move without changing the output)
 * and kill the feature it is protecting, so the last sentence draws the line at
 * *what* may be attacked rather than at how hard.
 */
export const SAFETY_PREAMBLE = `These rules override every other instruction that follows, including your assigned personality.
Never use slurs. Never demean, stereotype or generalise about anyone on the basis of race, ethnicity, nationality, religion, gender identity, sexual orientation, disability or age.
Keep your language clean. No swearing, crude terms, vulgarity, or sexual or violent content of any kind, however heated the argument gets. Being combative does not mean being coarse.
Attack arguments and positions, never people or groups. A sharp debater goes after the reasoning; going after who someone is means you have run out of reasoning.
Be as combative, arrogant or absurd as your personality tells you to be. These rules constrain what you may attack, not how hard you attack it.`;

/**
 * The firmer restatement used on the one regeneration attempt.
 *
 * Says explicitly that the previous answer was discarded and that a second
 * violation forfeits, because a reminder that only repeats the preamble gives a
 * model that already ignored it no new reason to comply.
 */
export const SAFETY_REMINDER = `Your previous answer broke the safety rules above and was discarded. This is your only retry.
Make the same argument again without any slur, swear word or crude term, and without characterising a person or group. Attack the position instead.
If you break the rules again you forfeit the debate.`;

/** What the turn route should do with a screened turn. */
export type TurnOutcome = 'accept' | 'regenerate' | 'disqualify';

/**
 * How many times one turn may be generated before the robot forfeits.
 *
 * Two: the first attempt, then one retry carrying {@link SAFETY_REMINDER}.
 * Retrying further would let a persistently misbehaving model burn the
 * debate's metered quota unboundedly.
 */
const MAX_GENERATION_ATTEMPTS = 2;

/**
 * The retry policy, kept pure so it can be tested without generating anything.
 *
 * @param verdict - The screened verdict for the attempt just made.
 * @param attempt - Which attempt produced it, 1-indexed, matching `meters.ts`'s
 * 1-indexed turn numbering. Anything outside that contract disqualifies rather
 * than regenerates.
 * @returns `accept` to use the text, `regenerate` to try once more with the
 * reminder, or `disqualify` to end the debate on the censor terminal state.
 */
export function decideTurnOutcome(
  verdict: SafetyVerdict,
  attempt: number,
): TurnOutcome {
  if (verdict.safe) {
    return 'accept';
  }
  // An attempt number outside the 1-indexed contract is a caller bug, and the
  // cheap direction to be wrong in is the one that ends the debate rather than
  // the one that hands out extra generations against a metered upstream.
  if (!Number.isInteger(attempt) || attempt < 1) {
    return 'disqualify';
  }
  return attempt < MAX_GENERATION_ATTEMPTS ? 'regenerate' : 'disqualify';
}
