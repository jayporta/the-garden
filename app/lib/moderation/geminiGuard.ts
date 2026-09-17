import 'server-only';

/**
 * The fallback guardrail tier: Gemini's safety ratings of the submitted text.
 *
 * Runs behind {@link screenWithNemotron}, whose free ceiling is 50 requests a
 * day, and covers the rest of the day once that is spent. It answers a weaker
 * question than a dedicated classifier does — a safety rating says how Gemini
 * scores the text against its own harm categories, not whether a debate
 * opponent would be hurt by it — which is why it is the fallback rather than
 * the primary.
 *
 * **Not for text derived from what a person supplied.** Google's free tier
 * permits prompts and responses to be used to improve its products and to be
 * read by human reviewers. Generated debate turns are model output and carry no
 * one's document; a RAG summary derives from a file somebody pasted. Callers
 * screening the latter pass `confidential` to `moderateText`, which omits this
 * tier.
 *
 * The key travels in `x-goog-api-key`, not the `?key=` query parameter Google
 * also documents. A key in a URL ends up in any logged request, and `logError`
 * redacts URL credentials and key prefixes but not query strings.
 *
 * Reading the answer lives in `geminiVerdict.ts`.
 */

import { logError } from '@/app/api/logError';
import type { FetchImpl } from './fetchImpl';
import type { SafetyVerdict } from './screen';
import { UnreadableAnswer, unreadableVerdict } from './unreadableAnswer';
import { parseGeminiVerdict } from './geminiVerdict';

const GEMINI_ORIGIN = 'https://generativelanguage.googleapis.com/v1beta/models';

/**
 * The model asked to rate the text.
 *
 * Free-tier access covers the Flash line only; the Pro series is paid.
 *
 * **A rolling alias, not a pinned id.** Google retires a pinned id by answering
 * `404 … no longer available to new users`, and a failed request here fails
 * open, so a stale default does not break the app — it quietly removes the last
 * screening tier from it. The alias cannot go stale that way. The cost is that
 * the model behind it changes without notice, which can shift where the ratings
 * land; `GEMINI_GUARD_MODEL` pins a specific id when that matters more.
 */
const DEFAULT_GEMINI_MODEL = 'gemini-flash-lite-latest';

/**
 * The harm categories rated, each at the lowest threshold.
 *
 * Ratings are only returned for categories named in the request, and filtering
 * is **off** unless `safetySettings` is sent, so asking for every category at
 * `BLOCK_LOW_AND_ABOVE` is what makes the ratings arrive at all.
 */
const HARM_CATEGORIES: readonly string[] = [
  'HARM_CATEGORY_HATE_SPEECH',
  'HARM_CATEGORY_HARASSMENT',
  'HARM_CATEGORY_SEXUALLY_EXPLICIT',
  'HARM_CATEGORY_DANGEROUS_CONTENT',
];

/**
 * Screens generated text with Gemini's safety ratings.
 *
 * **Fails open on availability, blocks on comprehension.** No
 * `GEMINI_API_KEY`, a refused request, or an exhausted quota return a safe
 * verdict with the degradation logged — which is the fallback behaviour this
 * tier exists to provide, since the tiers ahead of it have already run and
 * Google publishes no static free-tier limit to plan against. A body that
 * arrived carrying no verdict blocks instead.
 *
 * @param text - The generated text to screen.
 * @param fetchImpl - Injectable `fetch`, for tests.
 * @returns The verdict, or a safe one when the tier is unavailable.
 */
export async function screenWithGemini(
  text: string,
  fetchImpl: FetchImpl = fetch,
): Promise<SafetyVerdict> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return { safe: true };
  }

  // `||`, not `??`: an override set to the empty string is a misconfiguration
  // rather than a choice, and `??` would build a URL ending
  // `/models/:generateContent`.
  const model = process.env.GEMINI_GUARD_MODEL || DEFAULT_GEMINI_MODEL;

  try {
    const response = await fetchImpl(
      `${GEMINI_ORIGIN}/${model}:generateContent`,
      {
        method: 'POST',
        headers: {
          'x-goog-api-key': apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text }] }],
          safetySettings: HARM_CATEGORIES.map((category) => ({
            category,
            threshold: 'BLOCK_LOW_AND_ABOVE',
          })),
          // One token, because the generated reply is not what gets read.
          // `promptFeedback` rates the submitted text and is computed before
          // generation, so asking for less output costs nothing in signal.
          generationConfig: { maxOutputTokens: 1, temperature: 0 },
        }),
      },
    );

    if (!response.ok) {
      throw new Error(`Gemini request failed with ${response.status}`);
    }

    return parseGeminiVerdict(await response.json());
  } catch (error) {
    logError('screenWithGemini', error);
    return error instanceof UnreadableAnswer
      ? unreadableVerdict('gemini')
      : { safe: true };
  }
}
