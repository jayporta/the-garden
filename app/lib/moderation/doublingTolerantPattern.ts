/**
 * The letters obscenity's collapse-duplicates step keeps a doubled copy of.
 *
 * Every other letter collapses to one, so screened text never presents a run of
 * them to the matcher.
 */
const PRESERVED_DOUBLES = new Set(['b', 'e', 'o', 'l', 's', 'g']);

/**
 * Rewrites a spelling so its doubling-tolerant pattern can actually match.
 *
 * A run is truncated to what the collapse step can still deliver: two letters
 * for a member of {@link PRESERVED_DOUBLES}, one for anything else. Without
 * this a spelling carrying a longer run compiles a pattern demanding more
 * copies of a letter than the matcher will ever see, so the pattern fires on
 * nothing. Composing a prefix onto a root makes that easy to hit by accident,
 * since the junction repeats a letter whenever the prefix ends with the letter
 * the root begins with.
 *
 * Truncating loses no coverage, because {@link doublingTolerantPattern} supplies
 * the optional extra letter itself: the shortened spelling matches the longer
 * form as well as its own.
 *
 * @param spelling - A lowercase, single-token term, root or compound.
 * @returns The spelling with over-long runs truncated.
 */
export function matchableSpelling(spelling: string): string {
  const out: string[] = [];
  let run = 0;

  for (const char of spelling) {
    run = char === out[out.length - 1] ? run + 1 : 1;
    if (run <= (PRESERVED_DOUBLES.has(char) ? 2 : 1)) {
      out.push(char);
    }
  }

  return out.join('');
}

/**
 * Builds a pattern that tolerates any letter of a term being doubled.
 *
 * Each character is followed by an optional copy of itself, so a four-letter
 * root becomes `|a[a]b[b]c[c]d[d]|`. Together with the matcher's
 * collapse-duplicates step this covers every repetition: a long run collapses
 * to the threshold, and a run of exactly two is absorbed by the optional
 * character.
 *
 * Per-term tolerance is what a threshold map derived from the word list cannot
 * give. Thresholds apply per character across the *whole* list, so a term
 * evades by doubling any letter that some unrelated term legitimately doubles.
 * Tolerance written into each pattern has no such crosstalk, and it leaves no
 * map to keep in step with the terms.
 *
 * `|` is obscenity's word-boundary assertion, matching the `\b...\b` anchoring
 * this screen relies on.
 *
 * **The collapse threshold belongs to the matcher, not to this function.**
 * `profanityMatcher.ts` keeps obscenity's own chain, which collapses to 1 for
 * every letter but `b`, `e`, `o`, `l`, `s` and `g`. A spelling given to that
 * matcher must therefore carry no doubled letter outside that set, or the
 * collapsed input falls below the pattern's own minimum and it matches nothing.
 * `screen.test.ts` guards every screened spelling against this by asserting it
 * matches itself.
 *
 * @param term - A term or root, lowercase and single-token.
 * @param suffix - An optional word ending appended inside the right boundary.
 * @returns The pattern source for {@link parseRawPattern}.
 */
export function doublingTolerantPattern(term: string, suffix = ''): string {
  const tolerant = Array.from(term, (char) => `${char}[${char}]`).join('');
  return `|${tolerant}${suffix}|`;
}
