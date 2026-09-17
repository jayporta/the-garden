/**
 * Screened spellings read out of the installed word list at test time.
 *
 * The screen's tests need text it actually rejects, and writing that text into
 * a test file would put the terms back into the repository the library was
 * built to keep them out of. Reading them from `obscenity` at runtime keeps the
 * assertions real while leaving nothing to read in the source.
 *
 * The probes are derived from the same `profaneRoots.ts` the matcher screens
 * against, so a test that uses one is asserting about a spelling the matcher
 * genuinely covers rather than one this file hoped it covered. Every probe is
 * verified against the matcher before it is handed out, so a dataset change
 * that removes a spelling fails loudly here instead of quietly weakening a test
 * elsewhere.
 */

import { PROFANE_ROOTS } from '../profaneRoots';
import { PROFANITY_MATCHER } from '../profanityMatcher';
import { normaliseForScreening } from '../normaliseForScreening';

/**
 * Roots long enough to be unambiguous, that the matcher confirms it screens.
 *
 * Short roots are skipped because they are the ones most likely to sit inside a
 * whitelist region, which would make a probe behave unlike the rest of the
 * list.
 */
const VERIFIED: readonly string[] = [...PROFANE_ROOTS]
  .sort()
  .filter(
    (root) =>
      root.length >= 5 &&
      PROFANITY_MATCHER.hasMatch(normaliseForScreening(root)),
  );

/**
 * Distinct screened spellings, for a test that needs more than one.
 *
 * @param count - How many spellings to return.
 * @returns That many screened spellings, in a stable order.
 * @throws {Error} When the installed dataset supplies fewer than `count`.
 */
export function screenedProbes(count: number): readonly string[] {
  if (VERIFIED.length < count) {
    throw new Error(
      `obscenity supplies ${VERIFIED.length} verified probe terms, needed ${count}`,
    );
  }
  return VERIFIED.slice(0, count);
}

/**
 * One screened spelling, for the common case.
 *
 * Stable across runs, so a failure names the same term twice in a row.
 */
export const SCREENED_PROBE: string = screenedProbes(1)[0];
