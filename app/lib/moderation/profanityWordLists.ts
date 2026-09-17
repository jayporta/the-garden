/**
 * The word lists the profanity matcher is assembled from.
 *
 * Data only, so `profanityMatcher.ts` holds nothing but the dataset build and
 * the matcher itself. A list is reviewed by reading it, while a matcher is
 * reviewed by reasoning about what it matches.
 *
 * **No profane spelling is written here.** The screened vocabulary comes from
 * the installed `obscenity` package, which ships it as data under
 * `node_modules`. Every list in this file is ordinary English — endings,
 * prefixes and innocent words — so the repository carries the matching rules
 * without carrying the terms.
 *
 * Every list here is calibrated against the installed `obscenity` version.
 * Re-run the dictionary sweep in `docs/debate-club/DESIGN.md` whenever that
 * dependency moves.
 */

/**
 * Word endings a screened root takes, so anchoring does not lose the inflections.
 *
 * Anchoring costs coverage of compounds built on a root, since an anchored root
 * has to span the whole word. These recover the suffixed forms. Prefixed
 * compounds are recovered by {@link COMPOUND_PREFIXES} instead, since a prefix
 * cannot be expressed as an ending.
 */
export const PROFANE_SUFFIXES: readonly string[] = [
  '',
  's',
  'es',
  'er',
  'ers',
  'ing',
  'ed',
  'y',
  'ish',
];

/**
 * Ordinary words that form a screened compound when placed in front of a root.
 *
 * Anchoring a root is what keeps unrelated words containing it clean, but it
 * also stops the compounds built on that root from matching, because the root
 * sits at a word edge rather than spanning the whole word. Composing these
 * prefixes with the roots `obscenity` supplies recovers the common compounds
 * without naming any of them.
 *
 * Each entry is an innocent English word on its own and is never screened by
 * itself; only the composed spelling is. A prefix that is not a real compound
 * former costs a pattern that matches nothing, not a false positive, so the
 * list errs toward including one.
 */
export const COMPOUND_PREFIXES: readonly string[] = [
  'bad',
  'bull',
  'cluster',
  'dip',
  'dumb',
  'hard',
  'horse',
  'jack',
  'kick',
  'smart',
];

/**
 * Ordinary words the anchored profanity matcher still flags.
 *
 * Anchoring removes almost all of the substring false positives a dictionary
 * sweep finds, and most of what survives is an inflection of a screened root,
 * which should flag. These are the genuinely innocent remainder. `annal` also
 * covers `annals` and `annalist`, and `analgesi` covers the
 * `analgesic`/`analgesia` family, since a whitelist entry matches as a
 * substring.
 *
 * **Re-run the sweep when `obscenity` is upgraded.** These entries are only
 * correct for the word list the installed version ships; a changed list can add
 * false positives this does not cover, or make an entry here broad enough to
 * swallow a newly added term. The scan is in `docs/debate-club/DESIGN.md` under
 * Verification, and `screen.test.ts` guards the second failure mode.
 */
export const SUPPLEMENTARY_WHITELIST: readonly string[] = [
  'annal',
  'annals',
  'analgesi',
  // A branch of Islam, and religion is a protected characteristic, so screening
  // it as profanity is the worst class of false positive this list can produce.
  // The plural needs its own entry rather than riding on the singular as a
  // substring: `i` is not one of the letters obscenity's collapse step
  // preserves, so the blacklist can match the whole of the plural, which the
  // shorter whitelist region does not cover.
  'shiite',
  'shiites',
  // A fixed idiom, so whitelisting the whole phrase carries none of the
  // smuggling risk a bare-word entry would.
  'tit for tat',
  // Ordinary words that collide with a screened root once suffixes are allowed.
  // `scatter` is the consequential one: it is common, and "a scattered
  // argument" is exactly the sort of phrase a debate produces.
  'scatter',
  'scatty',
  'titter',
  'titer',
  'booby',
  'cocker',
];
