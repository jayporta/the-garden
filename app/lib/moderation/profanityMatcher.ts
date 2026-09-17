/**
 * Builds the matcher the local screening tier runs.
 *
 * The screened vocabulary is `obscenity`'s English dataset, read out of the
 * installed package by `profaneRoots.ts` rather than restated here, so no
 * screened spelling appears in this repository. The ordinary-English lists this module composes with it
 * live in `profanityWordLists.ts`.
 */

import {
  DataSet,
  RegExpMatcher,
  englishRecommendedTransformers,
  parseRawPattern,
} from 'obscenity';

import {
  doublingTolerantPattern,
  matchableSpelling,
} from './doublingTolerantPattern';
import { PROFANE_ROOTS } from './profaneRoots';
import {
  COMPOUND_PREFIXES,
  PROFANE_SUFFIXES,
  SUPPLEMENTARY_WHITELIST,
} from './profanityWordLists';

/**
 * Every spelling screened, as a root paired with the word it is reported as.
 *
 * A root contributes itself plus one entry per {@link COMPOUND_PREFIXES},
 * which recovers the prefixed compounds that anchoring the bare root would
 * otherwise miss. A prefix that forms no real compound yields a pattern that
 * matches nothing, so the composition costs coverage nowhere.
 *
 * Each spelling passes through {@link matchableSpelling} first, because a
 * junction that doubles a letter the collapse step folds would otherwise
 * compile a pattern that can never fire. Deduplicated afterwards, since two
 * compositions can collapse onto the same spelling.
 */
const SCREENED_SPELLINGS: readonly string[] = [
  ...new Set(
    [...PROFANE_ROOTS].flatMap((root) =>
      [root, ...COMPOUND_PREFIXES.map((prefix) => `${prefix}${root}`)].map(
        matchableSpelling,
      ),
    ),
  ),
];

/**
 * Their word list rebuilt with word-boundary anchored patterns.
 *
 * Obscenity's own patterns are mostly unanchored, which is deliberate on their
 * part — it catches compounds — but it means a root fires inside any word
 * containing it. Screening the system dictionary shows the cost: 517 ordinary
 * words flagged, including `cocksure`, `feckless` and `cockpit`, all of which
 * sit squarely in the arrogant, dismissive register the `ego.high` and
 * `aggression.high` dials exist to produce. Rebuilding their roots with
 * anchored, doubling-tolerant patterns takes that to a handful, recovered by
 * {@link SUPPLEMENTARY_WHITELIST}. The trade is which way to be wrong: a false
 * positive forfeits a debate, while a miss falls through to the networked
 * tiers, so the screen leans away from forfeiting.
 *
 * Exported alongside the matcher so a test can read a match's `originalWord`
 * metadata and can build a matcher over these same patterns with the whitelist
 * left off. Asserting an invariant about {@link SUPPLEMENTARY_WHITELIST}
 * against the stock English dataset would check patterns this module never
 * runs.
 */
export const PROFANITY_DATASET = SCREENED_SPELLINGS.reduce(
  (dataset, spelling) =>
    dataset.addPhrase((phrase) => {
      const withMetadata = phrase.setMetadata({ originalWord: spelling });
      return PROFANE_SUFFIXES.reduce(
        (built, suffix) =>
          built.addPattern(
            parseRawPattern(doublingTolerantPattern(spelling, suffix)),
          ),
        withMetadata,
      );
    }),
  new DataSet<{ originalWord: string }>(),
);

const PROFANITY_TERMS = PROFANITY_DATASET.build();

/**
 * The local matcher, built from obscenity's own English dataset.
 *
 * Carries obscenity's recommended transformer chain, which its maintainers
 * tuned for the word list this dataset ships, rather than a chain derived from
 * terms this repository names.
 *
 * The dataset covers slurs as well as ordinary swearing, so a match reports
 * only that a screened term fired, not which protected characteristic it
 * attacks. Attribution is left to the networked tiers, which read the text
 * rather than a word list; the local tier's job is to be the floor that works
 * with no API key configured.
 */
export const PROFANITY_MATCHER = new RegExpMatcher({
  ...PROFANITY_TERMS,
  ...englishRecommendedTransformers,
  whitelistedTerms: [
    ...(PROFANITY_TERMS.whitelistedTerms ?? []),
    ...SUPPLEMENTARY_WHITELIST,
  ],
});
