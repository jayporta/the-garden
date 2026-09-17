import 'server-only';

/**
 * The OpenAI Moderation API tier of the content-safety screen.
 *
 * Uses a plain `fetch` rather than a provider package: the AI SDK exposes no
 * moderation binding, and the endpoint is free, so screening does not spend the
 * debate's metered quota.
 */

import { logError } from '@/app/api/logError';
import type { FetchImpl } from './fetchImpl';
import type { SafetyVerdict } from './screen';

const MODERATION_ENDPOINT = 'https://api.openai.com/v1/moderations';
const MODERATION_MODEL = 'omni-moderation-latest';

/** The shape this module relies on from a moderation response. */
type ModerationResult = {
  readonly flagged: boolean;
  readonly categories: Readonly<Record<string, unknown>>;
};

/**
 * Reads the first result out of a response body.
 *
 * Throws rather than guessing on an unrecognised shape, so a changed API
 * contract degrades to the lexicon through the same path as a network failure
 * instead of silently passing every turn.
 *
 * @param body - The parsed response body.
 * @returns The first result, once confirmed to have the expected shape.
 */
function readResult(body: unknown): ModerationResult {
  const result = (body as { results?: readonly unknown[] } | null)
    ?.results?.[0];
  const candidate = result as Partial<ModerationResult> | undefined;

  if (
    typeof candidate?.flagged !== 'boolean' ||
    typeof candidate.categories !== 'object' ||
    candidate.categories === null
  ) {
    throw new Error('moderation response did not match the expected shape');
  }
  return { flagged: candidate.flagged, categories: candidate.categories };
}

/**
 * Screens text with the OpenAI Moderation API.
 *
 * **Fails open.** If `OPENAI_API_KEY` is unset, or the request fails, or the
 * body is unrecognisable, the answer is safe and the degradation is logged.
 * Failing closed would disqualify every turn and make the app unusable without
 * a key that is currently optional, so the no-key posture is a working game
 * with a weaker screen rather than no game.
 *
 * @param text - The text to screen.
 * @param fetchImpl - Injectable `fetch`, for tests.
 * @returns An unsafe verdict naming the flagged categories, or a safe one.
 */
export async function screenWithModerationApi(
  text: string,
  fetchImpl: FetchImpl,
): Promise<SafetyVerdict> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return { safe: true };
  }

  try {
    const response = await fetchImpl(MODERATION_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ model: MODERATION_MODEL, input: text }),
    });

    if (!response.ok) {
      throw new Error(`moderation request failed with ${response.status}`);
    }

    const result = readResult(await response.json());
    if (!result.flagged) {
      return { safe: true };
    }
    return {
      safe: false,
      categories: Object.entries(result.categories)
        .filter(([, flagged]) => flagged === true)
        .map(([category]) => category),
      source: 'moderation',
    };
  } catch (error) {
    logError('moderateText', error);
    return { safe: true };
  }
}
