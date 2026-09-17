import { describe, it, expect } from 'vitest';
import { normaliseForScreening } from '@/app/lib/moderation/normaliseForScreening';

describe('normaliseForScreening', () => {
  it('folds case', () => {
    expect(normaliseForScreening('SHOUTING')).toBe('shouting');
  });

  it('leaves ordinary text otherwise intact', () => {
    expect(normaliseForScreening('a hot dog is a sandwich')).toBe(
      'a hot dog is a sandwich',
    );
  });

  it('preserves whitespace, so separate words cannot join into one', () => {
    // The rule this protects: joining across spaces would turn innocent word
    // pairs into lexicon terms, which is the expensive direction to be wrong in.
    expect(normaliseForScreening('his panic')).toBe('his panic');
    expect(normaliseForScreening('the rapist')).toBe('the rapist');
  });

  it('leaves leetspeak alone, since the matcher resolves it', () => {
    // Obscenity's transformers fold leetspeak, confusables and styled
    // alphabets. This module only removes what those cannot see through.
    expect(normaliseForScreening('l337')).toBe('l337');
  });

  it('removes in-word punctuation used as a separator', () => {
    expect(normaliseForScreening('f-a-k-e')).toBe('fake');
    expect(normaliseForScreening('f.a.k.e')).toBe('fake');
    expect(normaliseForScreening('f_a_k_e')).toBe('fake');
  });

  it('removes invisible characters that split a word', () => {
    for (const invisible of ['​', '‍', '­', '﻿', '⁠']) {
      expect(normaliseForScreening(`fa${invisible}ke`)).toBe('fake');
    }
  });

  it('strips combining marks after NFKD separates them', () => {
    expect(normaliseForScreening('café')).toBe('cafe');
    expect(normaliseForScreening('naïve')).toBe('naive');
    expect(normaliseForScreening('fáke')).toBe('fake');
  });

  it('folds fullwidth letters back to ASCII', () => {
    expect(normaliseForScreening('ｆａｋｅ')).toBe('fake');
  });

  it('leaves Cyrillic lookalikes alone, since the matcher resolves them', () => {
    expect(normaliseForScreening('сар')).toBe('сар');
  });

  it('folds the residual characters obscenity does not cover', () => {
    // Verified gaps, not assumed ones: the small-capital F, and the reserved
    // holes in the mathematical blocks.
    expect(normaliseForScreening('ꜰ')).toBe('f');
    expect(normaliseForScreening('𝒺')).toBe('e');
    expect(normaliseForScreening('𝑕')).toBe('h');
  });

  it('folds the dotless letters NFKD produces', () => {
    // NFKD turns MATHEMATICAL ITALIC SMALL DOTLESS I/J into these rather than
    // into i/j, and they read as i/j on their own, so folding the maths block
    // alone would not have been enough.
    expect(normaliseForScreening('\u0131')).toBe('i');
    expect(normaliseForScreening('\u0237')).toBe('j');
  });

  it('folds every mathematical alphanumeric position, capitals included', () => {
    // A property test over the whole range, not hand-picked code points. The
    // bug this pins shipped once: only the two lowercase styles were listed, so
    // a term spelled in mathematical script capitals defeated ten of eleven
    // terms while the lowercase tests stayed green.
    const first = 0x1d400;
    const last = 0x1d6a3;
    for (let codePoint = first; codePoint <= last; codePoint++) {
      const offset = (codePoint - first) % 52;
      const expected = String.fromCharCode(97 + (offset % 26));
      expect(normaliseForScreening(String.fromCodePoint(codePoint))).toBe(
        expected,
      );
    }
  });

  it('folds parenthesized letters before NFKD can expand them', () => {
    // NFKD would turn these into "(f)(a)(k)(e)" and lose the glyphs the
    // matcher's confusables table knows how to resolve.
    expect(normaliseForScreening('⒡⒜⒦⒠')).toBe('fake');
  });

  it('is idempotent, so screening a normalised string changes nothing', () => {
    for (const sample of ['café', 'ｆａｋｅ', 'l337', 'f-a-k-e', 'his panic']) {
      const once = normaliseForScreening(sample);
      expect(normaliseForScreening(once)).toBe(once);
    }
  });

  it('handles empty text', () => {
    expect(normaliseForScreening('')).toBe('');
  });
});
