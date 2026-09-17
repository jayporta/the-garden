/**
 * Reads a safety verdict out of a Gemini `generateContent` response.
 *
 * Separate from `geminiGuard.ts` so the request and the reading of its answer
 * can be reviewed apart: one is an HTTP call, the other is a contract with
 * somebody else's response shape, and the second is where the subtleties are.
 *
 * **The prompt's ratings are the signal, not the candidate's.** The text being
 * screened is submitted as the prompt, so `promptFeedback` is what rates it.
 * `candidates[].safetyRatings` rate the reply Gemini generated, which is a
 * different question and, since this tier asks for almost no output, a reply
 * barely exists to rate.
 */

import type { SafetyVerdict } from './screen';
import { UnreadableAnswer } from './unreadableAnswer';

/**
 * The rated likelihoods that count as clean. **Anything else blocks.**
 *
 * `NEGLIGIBLE` and `LOW` pass, so a combative persona is not forfeited for
 * being forceful — blocking at `LOW` is the risk of a guardrail neutering the
 * feature it protects.
 *
 * Written as the passing set rather than the blocking one so an unrecognised
 * value fails closed. Listing `MEDIUM` and `HIGH` as blockers instead would let
 * a severity Google adds later, or a malformed value, through as clean.
 */
const PASSING_PROBABILITIES: ReadonlySet<string> = new Set([
  'NEGLIGIBLE',
  'LOW',
]);

/** A rating as the API reports it. */
type SafetyRating = {
  readonly category?: unknown;
  readonly probability?: unknown;
};

/** The parts of a `generateContent` response a verdict is read from. */
export type GeminiResponse = {
  readonly promptFeedback?: {
    readonly blockReason?: unknown;
    readonly safetyRatings?: readonly SafetyRating[];
  };
  readonly candidates?: readonly {
    readonly finishReason?: unknown;
    readonly safetyRatings?: readonly SafetyRating[];
  }[];
};

/** Turns `HARM_CATEGORY_HATE_SPEECH` into `hate speech`. */
function readableCategory(category: string): string {
  return category
    .replace(/^HARM_CATEGORY_/, '')
    .toLowerCase()
    .replace(/_/g, ' ');
}

/**
 * The categories a rating list flags.
 *
 * A rating is flagged unless its probability is one of the values known to be
 * clean, so an unrecognised or non-string probability counts against the text
 * rather than for it.
 *
 * @param ratings - The ratings to read.
 * @returns The flagged categories, humanised and deduplicated.
 */
function flaggedCategories(
  ratings: readonly SafetyRating[],
): readonly string[] {
  return [
    ...new Set(
      ratings
        .filter(
          (rating) =>
            typeof rating.probability !== 'string' ||
            !PASSING_PROBABILITIES.has(rating.probability),
        )
        .map((rating) =>
          typeof rating.category === 'string'
            ? readableCategory(rating.category)
            : 'unspecified',
        ),
    ),
  ];
}

/**
 * Reads a verdict out of a `generateContent` body.
 *
 * Signals are taken in order of how conclusive they are. A `blockReason` means
 * Gemini refused the prompt outright. The prompt's own ratings are next, since
 * the prompt is the screened text. A `finishReason` of `SAFETY` blocks too: it
 * says generation stopped on safety grounds, which is a judgement about the
 * exchange even though it describes the reply.
 *
 * **A body with no usable signal is unreadable, not safe.** Ratings come back
 * only for the categories the request names, so their absence means this tier
 * did not run rather than that nothing was flagged, and reading that as clean
 * is how a screen is lost without anyone noticing. An empty rating list is
 * different: the field arrived and reported nothing, which is a judgement.
 *
 * @param body - The parsed response body.
 * @returns An unsafe verdict naming the categories, or a safe one.
 */
export function parseGeminiVerdict(body: unknown): SafetyVerdict {
  const response = body as GeminiResponse | null | undefined;

  const blockReason = response?.promptFeedback?.blockReason;
  if (typeof blockReason === 'string' && blockReason.length > 0) {
    return {
      safe: false,
      categories: [blockReason.toLowerCase()],
      source: 'gemini',
    };
  }

  const promptRatings = response?.promptFeedback?.safetyRatings;
  const stoppedOnSafety = response?.candidates?.[0]?.finishReason === 'SAFETY';

  if (!Array.isArray(promptRatings)) {
    if (stoppedOnSafety) {
      return { safe: false, categories: ['safety'], source: 'gemini' };
    }
    throw new UnreadableAnswer(
      'Gemini response carried no prompt safety ratings to read',
    );
  }

  const flagged = flaggedCategories(promptRatings);
  if (stoppedOnSafety) {
    return {
      safe: false,
      // The finish reason is conclusive on its own, so an empty rating list
      // still blocks rather than being reported as clean.
      categories: flagged.length > 0 ? flagged : ['safety'],
      source: 'gemini',
    };
  }
  if (flagged.length > 0) {
    return { safe: false, categories: flagged, source: 'gemini' };
  }
  return { safe: true };
}
