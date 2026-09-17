/**
 * Strips the disguises `obscenity`'s own transformers cannot see through.
 *
 * The matchers in `lexiconMatcher.ts` and `profanityMatcher.ts` fold case,
 * leetspeak and an extensive confusables table, which between them cover every
 * styled-Latin alphabet: small capitals, negative-squared and negative-circled
 * letters, parenthesized letters, fullwidth forms, and Cyrillic and Greek
 * lookalikes. None of those need a table here.
 *
 * What survives here is what obscenity leaves alone: characters that split a
 * word without changing how it reads, plus a short list of residual character
 * folds its confusables table misses. It runs as a pre-pass before the matcher.
 */

/**
 * Invisible characters that split a word without changing how it renders.
 *
 * Zero-width spaces and joiners, the soft hyphen, and the bidi marks all render
 * as nothing, so leaving them in lets a term sit in plain sight with the word
 * boundaries broken underneath it.
 */
const INVISIBLE_CHARACTERS = /[­​-‏⁠﻿]/g;

/**
 * Combining marks, stripped after NFKD splits accented letters into base + mark.
 *
 * `\p{M}` rather than `\p{Mn}`: nonspacing marks are the common case, but
 * spacing marks (`Mc`) and enclosing marks (`Me`, such as the combining
 * enclosing circle) sit inside a word just as happily and break the literal
 * match the same way. The lexicon is Latin-only, so removing marks from any
 * script cannot assemble a term that was not already there.
 */
const COMBINING_MARKS = /\p{M}/gu;

/**
 * Punctuation stripped before matching, so `f-a-g-g-o-t` reads as one word.
 *
 * Whitespace is **not** stripped. Joining across spaces would turn innocent
 * word pairs into terms, which is the expensive direction to be wrong in.
 *
 * Brackets are **not** here either, and that is load-bearing. Stripping them
 * closes the parenthesized alphabet, but it also joins a root to the word
 * behind it whenever a bracket sits between them, because a bracket abutting a
 * word is a word boundary in ordinary prose exactly as a space is. That
 * alphabet is obscenity's confusables table to handle, and it does.
 */
const IN_WORD_SEPARATORS = /[.\-_*'`~]/g;

/**
 * The Mathematical Alphanumeric Symbols letters, `U+1D400`-`U+1D6A3`.
 *
 * Thirteen styles, each laid out as 26 capitals then 26 smalls, giving a
 * regular period of 52 across the whole range. Unicode leaves holes wherever a
 * letter already existed in Letterlike Symbols, and those holes differ per
 * style: script-capital is missing eight, fraktur-capital five,
 * double-struck-capital seven, and the lowercase styles their own. NFKD folds
 * every *assigned* position, so only the holes need covering.
 *
 * Derived from the range's period rather than listed style by style. Listing
 * them was the first approach and it shipped a bypass: only the two lowercase
 * styles were named, so a term spelled in script capitals defeated ten of
 * eleven terms. Arithmetic cannot forget a style.
 */
const MATH_ALPHANUMERIC_FIRST = 0x1d400;
const MATH_ALPHANUMERIC_LAST = 0x1d6a3;
const MATH_STYLE_PERIOD = 52;

/** Every math-alphanumeric code point folded to its plain lowercase letter. */
function mathAlphanumericFolds(): [string, string][] {
  const folds: [string, string][] = [];
  for (
    let codePoint = MATH_ALPHANUMERIC_FIRST;
    codePoint <= MATH_ALPHANUMERIC_LAST;
    codePoint++
  ) {
    const offset = (codePoint - MATH_ALPHANUMERIC_FIRST) % MATH_STYLE_PERIOD;
    const letterIndex = offset % 26;
    folds.push([
      String.fromCodePoint(codePoint),
      String.fromCharCode(97 + letterIndex),
    ]);
  }
  return folds;
}

/**
 * The residual character folds obscenity's confusables table does not cover.
 *
 * Deliberately tiny, and every entry was verified missing rather than assumed:
 * obscenity handles small capitals, negative-squared and negative-circled
 * letters, regional indicators, parenthesized letters, fullwidth forms and
 * Cyrillic and Greek lookalikes on its own. `ꜰ` is the single small-capital it
 * misses, and the mathematical holes are unassigned code points no table
 * covers.
 */
const RESIDUAL_FOLDS: ReadonlyMap<string, string> = new Map<string, string>([
  ['\ua730', 'f'],
  // The dotless letters. NFKD turns MATHEMATICAL ITALIC SMALL DOTLESS I/J into
  // these rather than into `i`/`j`, and they are readable as `i`/`j` on their
  // own too, so folding the maths block alone would not be enough.
  ['\u0131', 'i'],
  ['\u0237', 'j'],
  // Parenthesized letters: obscenity resolves these, but only if they survive
  // to reach it. See the ordering note below.
  ...Array.from({ length: 26 }, (_unused, offset): [string, string] => [
    String.fromCodePoint(0x249c + offset),
    String.fromCharCode(97 + offset),
  ]),
  ...mathAlphanumericFolds(),
]);

/**
 * Reduces text to the form the matcher is run against.
 *
 * Order matters twice over. {@link RESIDUAL_FOLDS} runs first, because NFKD
 * would expand the parenthesized letters into bracket triples and lose them.
 * NFKD runs next, so an accent separates from its base letter and can be
 * stripped as a mark rather than hiding one.
 *
 * @param text - Arbitrary generated text.
 * @returns The text with word-splitting disguises removed and real word
 * boundaries, including whitespace and brackets, left intact.
 */
export function normaliseForScreening(text: string): string {
  const preFolded = Array.from(
    text,
    (char) => RESIDUAL_FOLDS.get(char) ?? char,
  ).join('');

  return preFolded
    .normalize('NFKD')
    .replace(COMBINING_MARKS, '')
    .replace(INVISIBLE_CHARACTERS, '')
    .replace(IN_WORD_SEPARATORS, '')
    .toLowerCase();
}
