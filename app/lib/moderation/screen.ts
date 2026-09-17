/**
 * The local, network-free screening tier.
 *
 * Pure and I/O-free, so it sits in the same layer as `app/debate/cooldowns.ts`
 * and `app/debate/rateLimitHeaders.ts`. It is the safety floor when no API key
 * is configured; the networked tiers live in `moderateText.ts`.
 */

import { LOCAL_SCREEN_CATEGORY } from './categories';
import { PROFANITY_MATCHER } from './profanityMatcher';
import { normaliseForScreening } from './normaliseForScreening';

/** Which screen produced an unsafe verdict. */
export type SafetySource = 'lexicon' | 'moderation' | 'nemotron' | 'gemini';

/** The result of screening one turn's text. */
export type SafetyVerdict =
  | { readonly safe: true }
  | {
      readonly safe: false;
      /** Deduplicated, in the order the screen reports them. */
      readonly categories: readonly string[];
      readonly source: SafetySource;
    };

/**
 * Screens text against the local word list.
 *
 * Deterministic and network-free, so it is the safety floor when
 * `OPENAI_API_KEY` is unset and the Moderation API is unavailable. Matching is
 * word-boundary anchored after {@link normaliseForScreening}, so a term buried
 * inside a longer word does not fire.
 *
 * The verdict names {@link LOCAL_SCREEN_CATEGORY} rather than a protected
 * characteristic: the word list this tier runs against does not record which
 * characteristic a term attacks, and the tiers that can tell report it
 * themselves.
 *
 * @param text - One turn's generated text.
 * @returns An unsafe verdict naming the matched category, or a safe one.
 */
export function screenLocally(text: string): SafetyVerdict {
  if (PROFANITY_MATCHER.hasMatch(normaliseForScreening(text))) {
    return {
      safe: false,
      categories: [LOCAL_SCREEN_CATEGORY],
      source: 'lexicon',
    };
  }

  return { safe: true };
}
