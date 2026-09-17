/**
 * The screened vocabulary, read out of the installed `obscenity` package.
 *
 * The single place this repository reads that dataset, so the matcher and the
 * tests that probe it cannot drift apart in how they find a root. Keeping it
 * here is also what lets the repository screen these terms without naming them:
 * the words live in a dependency under `node_modules`, and nothing checked in
 * spells one.
 */

import { englishDataset } from 'obscenity';

/**
 * Every root word the installed English dataset ships.
 *
 * Read through the public `getPayloadWithPhraseMetadata` rather than the
 * dataset's private `containers` field. Their patterns are not taken, because
 * most are unanchored; only the words are, and the matcher supplies its own
 * anchoring.
 */
export const PROFANE_ROOTS: ReadonlySet<string> = (() => {
  const roots = new Set<string>();
  for (const term of englishDataset.build().blacklistedTerms ?? []) {
    const { phraseMetadata } = englishDataset.getPayloadWithPhraseMetadata({
      termId: term.id,
      startIndex: 0,
      endIndex: 0,
      matchLength: 0,
    });
    if (phraseMetadata?.originalWord) {
      roots.add(phraseMetadata.originalWord);
    }
  }
  return roots;
})();
