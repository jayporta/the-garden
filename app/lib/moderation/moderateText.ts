import 'server-only';

/**
 * The order the content-safety screen's tiers run in.
 *
 * Lives outside `app/debate/` because the screen is a library shared by more
 * than one feature. A module in this file reads `OPENAI_API_KEY`, so it stays
 * out of a client bundle the same way `app/api/logError.ts` and
 * `app/api/prismaClient.ts` do.
 *
 * **Tiers run cheapest first and stop at the first violation.** The lexicon is
 * local and instant; the Moderation API is free and specialised; the two
 * guardrail models are the only tiers that are model calls, and they read
 * phrasing no word list has an entry for. A tier is only consulted when
 * everything before it passed, so the common case of clean text is the only one
 * that pays for every round trip.
 *
 * Every tier is free at the volumes this app runs at, and every networked one
 * fails open, so the screen degrades tier by tier as keys go missing or quotas
 * run out rather than failing outright.
 */

import type { FetchImpl } from './fetchImpl';
import { screenLocally, type SafetyVerdict } from './screen';
import { screenWithModerationApi } from './openAiModeration';
import { screenWithNemotron } from './nemotronGuard';
import { screenWithGemini } from './geminiGuard';

/** One screening tier: given the text and the injectable `fetch`, a verdict. */
type Screen = (text: string, fetchImpl: FetchImpl) => Promise<SafetyVerdict>;

/** A tier, and whether it may be shown text a person supplied. */
type Tier = {
  readonly screen: Screen;
  /**
   * Omits the tier when the caller passes `confidential`.
   *
   * Set only for a vendor whose terms permit retaining or human-reviewing what
   * it is sent.
   */
  readonly retainsText?: true;
};

/**
 * The tiers, cheapest and most available first.
 *
 * The lexicon is local, synchronous and needs no key, so it always runs.
 * Nemotron precedes Gemini because it is a purpose-built classifier while a
 * Gemini safety rating answers whether Gemini would refuse to say the text —
 * the weaker question — and because Nemotron's free ceiling of 50 requests a
 * day is the one worth spending first.
 *
 * Appending a tier here is the whole change a new one needs.
 */
const TIERS: readonly Tier[] = [
  { screen: (text) => Promise.resolve(screenLocally(text)) },
  { screen: screenWithModerationApi },
  { screen: screenWithNemotron },
  { screen: screenWithGemini, retainsText: true },
];

/** How one call to {@link moderateText} should behave. */
export type ModerateOptions = {
  /** Injectable `fetch`, for tests. @defaultValue the global `fetch` */
  readonly fetchImpl?: FetchImpl;
  /**
   * Omits every tier whose vendor may retain or human-review what it is sent.
   *
   * Set it when the screened text derives from something a person supplied — a
   * RAG summary of a pasted document — rather than being model output the app
   * generated from its own prompts.
   * @defaultValue `false`
   */
  readonly confidential?: boolean;
};

/**
 * Screens generated text through every applicable tier, stopping at the first
 * violation.
 *
 * An earlier tier's hit short-circuits: it is already a violation, so there is
 * nothing a later tier could add and no reason to spend a round trip on it.
 *
 * **Every networked tier fails open on availability**, so with no API keys
 * configured the lexicon alone decides and the app still runs. A tier whose
 * vendor is unreachable, unkeyed or out of quota is logged and treated as
 * passing. The exception is a vendor that answered something unparsable, which
 * blocks — availability and comprehension are different failures, and the
 * reasoning is on `unreadableAnswer.ts`.
 *
 * Quota exhaustion needs no special handling here beyond failing open: the
 * tiers are ordered so that everything cheaper has already returned a verdict
 * by the time a metered one is reached. Recording a durable cooldown so a spent
 * quota is skipped rather than retried belongs to the route that owns the
 * database, using `observeRateLimit` from `app/debate/rateLimitHeaders.ts`; a
 * screening library should not reach for Prisma.
 *
 * @param text - The generated text, before any of it reaches a client.
 * @param options - Which tiers may run, and the `fetch` to use.
 * @param options.fetchImpl - Injectable `fetch`, for tests.
 * @param options.confidential - Omits tiers whose vendor may retain the text.
 * @returns The verdict the caller should act on.
 */
export async function moderateText(
  text: string,
  { fetchImpl = fetch, confidential = false }: ModerateOptions = {},
): Promise<SafetyVerdict> {
  for (const tier of TIERS) {
    if (confidential && tier.retainsText) {
      continue;
    }
    const verdict = await tier.screen(text, fetchImpl);
    if (!verdict.safe) {
      return verdict;
    }
  }
  return { safe: true };
}
