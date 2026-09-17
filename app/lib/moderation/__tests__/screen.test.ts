import { describe, it, expect } from 'vitest';
import { screenLocally } from '@/app/lib/moderation/screen';
import { LOCAL_SCREEN_CATEGORY } from '@/app/lib/moderation/categories';
import {
  COMPOUND_PREFIXES,
  PROFANE_SUFFIXES,
  SUPPLEMENTARY_WHITELIST,
} from '@/app/lib/moderation/profanityWordLists';
import { PROFANITY_DATASET } from '@/app/lib/moderation/profanityMatcher';
import { screenedProbes } from './probeTerms';
import { englishRecommendedTransformers, RegExpMatcher } from 'obscenity';

/**
 * Every spelling the matcher compiles a pattern for.
 *
 * Read back off the built dataset rather than recomposed here, so a test
 * asserts about what the matcher actually screens rather than about what this
 * file assumes it screens.
 */
const SCREENED_SPELLINGS: readonly string[] = [
  ...new Set(
    (PROFANITY_DATASET.build().blacklistedTerms ?? [])
      .map(
        (term) =>
          PROFANITY_DATASET.getPayloadWithPhraseMetadata({
            termId: term.id,
            startIndex: 0,
            endIndex: 0,
            matchLength: 0,
          }).phraseMetadata?.originalWord,
      )
      .filter((word): word is string => word !== undefined),
  ),
];

/** Screened spellings drawn from the installed dataset, never written here. */
const PROBES = screenedProbes(12);

describe('the screened word list', () => {
  it('is non-empty, since it is the only screen that works with no API key', () => {
    expect(SCREENED_SPELLINGS.length).toBeGreaterThan(0);
  });

  it('screens every spelling it compiles, so no pattern is unreachable', () => {
    expect.hasAssertions();
    // A spelling is only worth a pattern if that pattern can fire. Obscenity's
    // collapse-duplicates step keeps a doubled letter for `b`, `e`, `o`, `l`,
    // `s` and `g` only, so a spelling doubling any other letter is reduced
    // below its own pattern's minimum and can never match. Composing prefixes
    // with roots makes that easy to introduce by accident, so every composed
    // spelling is checked rather than a sample.
    for (const spelling of SCREENED_SPELLINGS) {
      expect(screenLocally(spelling).safe, spelling).toBe(false);
    }
  });
});

describe('screenLocally', () => {
  it('passes ordinary debate text', () => {
    const verdict = screenLocally(
      'A hot dog is plainly a sandwich, and your argument is weak.',
    );
    expect(verdict.safe).toBe(true);
  });

  it('passes empty text', () => {
    expect(screenLocally('').safe).toBe(true);
  });

  it('catches every screened root as a bare word', () => {
    expect.hasAssertions();
    for (const probe of PROBES) {
      expect(screenLocally(`you ${probe}`).safe, probe).toBe(false);
    }
  });

  it('catches the suffixed forms anchoring would otherwise lose', () => {
    expect.hasAssertions();
    // Anchoring a root means its pattern has to span the whole word, so each
    // inflection needs a pattern of its own. Iterated rather than sampled so a
    // suffix added later is covered without anyone remembering to extend this.
    for (const probe of PROBES) {
      for (const suffix of PROFANE_SUFFIXES) {
        const form = `${probe}${suffix}`;
        expect(screenLocally(`you ${form}`).safe, form).toBe(false);
      }
    }
  });

  it('catches the compounds composed from the innocent prefixes', () => {
    expect.hasAssertions();
    for (const probe of PROBES) {
      for (const prefix of COMPOUND_PREFIXES) {
        const compound = `${prefix}${probe}`;
        expect(screenLocally(`you ${compound}`).safe, compound).toBe(false);
      }
    }
  });

  it('never screens a compound prefix on its own', () => {
    expect.hasAssertions();
    // The prefixes exist only to compose. Screening one by itself would flag
    // ordinary words, which is the failure this list must never introduce.
    for (const prefix of COMPOUND_PREFIXES) {
      expect(screenLocally(`a ${prefix} argument`).safe, prefix).toBe(true);
    }
  });

  it('reports the local category and names itself as the source', () => {
    const verdict = screenLocally(`you ${PROBES[0]}`);
    expect(verdict.safe).toBe(false);
    if (!verdict.safe) {
      expect(verdict.categories).toEqual([LOCAL_SCREEN_CATEGORY]);
      expect(verdict.source).toBe('lexicon');
    }
  });

  it('catches terms regardless of case', () => {
    expect(screenLocally(PROBES[0].toUpperCase()).safe).toBe(false);
  });

  it('sees through leetspeak substitution', () => {
    expect.hasAssertions();
    const leet: Record<string, string> = {
      a: '4',
      e: '3',
      i: '1',
      o: '0',
      s: '5',
      t: '7',
    };
    for (const probe of PROBES) {
      const disguised = [...probe].map((char) => leet[char] ?? char).join('');
      if (disguised === probe) {
        continue;
      }
      expect(screenLocally(`you ${disguised}`).safe, disguised).toBe(false);
    }
  });

  it('sees through separators inserted inside a word', () => {
    expect.hasAssertions();
    for (const probe of PROBES) {
      const disguised = [...probe].join('-');
      expect(screenLocally(`you ${disguised}`).safe, disguised).toBe(false);
    }
  });

  it('sees through invisible characters splitting a word', () => {
    expect.hasAssertions();
    const invisibles = ['​', '‍', '­', '﻿'];
    for (const probe of PROBES) {
      for (const invisible of invisibles) {
        const disguised = probe[0] + invisible + probe.slice(1);
        expect(screenLocally(`you ${disguised}`).safe, probe).toBe(false);
      }
    }
  });

  it('strips every class of combining mark, not just nonspacing ones', () => {
    expect.hasAssertions();
    // Mn, Mc and Me respectively; all three sit inside a word and break a
    // literal match, so the matcher needs the whole \p{M} category.
    for (const mark of ['́', 'ः', '⃝']) {
      for (const probe of PROBES) {
        const disguised = probe[0] + mark + probe.slice(1);
        expect(screenLocally(`you ${disguised}`).safe, probe).toBe(false);
      }
    }
  });

  it('sees through fullwidth letters, which NFKD folds back to ASCII', () => {
    expect.hasAssertions();
    for (const probe of PROBES) {
      const disguised = Array.from(probe, (char) =>
        String.fromCharCode(char.charCodeAt(0) + 0xfee0),
      ).join('');
      expect(screenLocally(`you ${disguised}`).safe, probe).toBe(false);
    }
  });

  it('sees through a Cyrillic letter standing in for its Latin lookalike', () => {
    expect.hasAssertions();
    const lookalikes: Record<string, string> = {
      a: 'а',
      e: 'е',
      o: 'о',
      p: 'р',
      c: 'с',
      i: 'і',
      s: 'ѕ',
    };
    for (const probe of PROBES) {
      const disguised = Array.from(
        probe,
        (char) => lookalikes[char] ?? char,
      ).join('');
      if (disguised === probe) {
        continue;
      }
      expect(screenLocally(`you ${disguised}`).safe, probe).toBe(false);
    }
  });

  it('sees through the small-capitals alphabet', () => {
    // The standard chat-platform evasion alphabet, and the one gap that made
    // every screened term evadable: small caps have no NFKD decomposition.
    expect.hasAssertions();
    const smallCaps: Record<string, string> = {
      a: 'ᴀ',
      b: 'ʙ',
      c: 'ᴄ',
      d: 'ᴅ',
      e: 'ᴇ',
      f: 'ꜰ',
      g: 'ɢ',
      h: 'ʜ',
      i: 'ɪ',
      k: 'ᴋ',
      l: 'ʟ',
      m: 'ᴍ',
      n: 'ɴ',
      o: 'ᴏ',
      p: 'ᴘ',
      r: 'ʀ',
      s: 'ꜱ',
      t: 'ᴛ',
      u: 'ᴜ',
      w: 'ᴡ',
      y: 'ʏ',
      z: 'ᴢ',
    };
    for (const probe of PROBES) {
      const disguised = Array.from(
        probe,
        (char) => smallCaps[char] ?? char,
      ).join('');
      expect(screenLocally(`you ${disguised}`).safe, probe).toBe(false);
    }
  });

  it('sees through styled Latin alphabet blocks NFKD does not fold', () => {
    expect.hasAssertions();
    // Negative-circled and negative-squared (the meme-letter alphabets) and
    // regional indicators all render as A-Z but have no NFKD decomposition.
    // Parenthesized is folded before NFKD rather than by the styled table,
    // since NFKD would expand it to "(a)" and lose the single glyph.
    const starts = [0x1f150, 0x1f170, 0x1f1e6, 0x249c, 0x1d4b6, 0x1d44e];
    for (const start of starts) {
      for (const probe of PROBES) {
        const disguised = Array.from(probe, (char) =>
          String.fromCodePoint(start + (char.charCodeAt(0) - 97)),
        ).join('');
        expect(screenLocally(`you ${disguised}`).safe, probe).toBe(false);
      }
    }
  });

  it('sees through the dotless letters', () => {
    expect.hasAssertions();
    for (const probe of PROBES) {
      const dotless = probe.replace(/i/g, 'ı').replace(/j/g, 'ȷ');
      if (dotless === probe) {
        continue;
      }
      expect(screenLocally(`you ${dotless}`).safe, probe).toBe(false);
    }
  });

  it('catches a letter doubled at any position in a term', () => {
    expect.hasAssertions();
    // Every position, not a sample. Collapse thresholds derived per character
    // across the whole list let a term evade by doubling a letter that some
    // unrelated term legitimately doubles. Per-term tolerance has no such
    // crosstalk, and sampling positions would not demonstrate it.
    for (const probe of PROBES) {
      for (let index = 0; index < probe.length; index++) {
        const doubled =
          probe.slice(0, index) + probe[index] + probe.slice(index);
        expect(screenLocally(`you ${doubled}`).safe, doubled).toBe(false);
      }
    }
  });

  it('catches a letter repeated many times over', () => {
    expect.hasAssertions();
    for (const probe of PROBES) {
      const shouted = probe[0].repeat(5) + probe.slice(1);
      expect(screenLocally(`you ${shouted}`).safe, probe).toBe(false);
    }
  });

  it('does not fire on a term appearing inside a longer word', () => {
    expect.hasAssertions();
    for (const probe of PROBES) {
      const buried = `pre${probe}ing`;
      expect(
        screenLocally(`a perfectly ordinary ${buried} word`).safe,
        buried,
      ).toBe(true);
    }
  });

  it('does not join separate words into a term across a space', () => {
    expect.hasAssertions();
    for (const probe of PROBES) {
      const split = `${probe.slice(0, 2)} ${probe.slice(2)}`;
      expect(screenLocally(`the ${split} of it`).safe, split).toBe(true);
    }
  });

  it('does not join two words across a bracket', () => {
    // A bracket abutting a word is a word boundary in prose, exactly as a
    // space is. Folding the parenthesized alphabet before NFKD, rather than
    // stripping brackets globally, is what keeps these ordinary sentences from
    // flagging on the word a bracket happens to abut.
    //
    // A bracket is itself a confusable for several letters, so a split falling
    // where that letter completes a root still rejoins. Measured at roughly one
    // split position in twelve, unchanged by how the word list is sourced, and
    // left to the networked tiers rather than closed by stripping brackets,
    // which would join far more.
    for (const innocent of [
      'the claim (a hot dog) is a sandwich',
      'see [1] and [2] for sources',
      'the argument (weak as it is) fails',
    ]) {
      expect(screenLocally(innocent).safe, innocent).toBe(true);
    }
  });

  it('leaves accented ordinary words alone', () => {
    for (const innocent of ['café', 'naïve', 'résumé']) {
      expect(screenLocally(`a perfectly ordinary ${innocent}`).safe).toBe(true);
    }
  });

  it('does not collapse doubled letters, so it keeps bookkeeper intact', () => {
    expect(screenLocally('the bookkeeper and the assassin').safe).toBe(true);
  });

  it('does not fire on ordinary words obscenity would flag', () => {
    // Found by screening the full system dictionary against their list. Their
    // own whitelist covers analysis, canal, arsenal, assassin and class; these
    // are the plausible ones it misses.
    for (const innocent of [
      'the annals of culinary history',
      'the annalist recorded it',
      'the cockpit of the aircraft',
      'an analgesic effect',
      'the town of Penistone in Yorkshire',
      'rapeseed oil works as well as olive oil',
      // Words in exactly the dismissive register the ego and aggression dials
      // produce, and all of them substrings of a screened root, so they flag
      // unless the root is anchored.
      'do not be so cocksure about your position',
      'that is a feckless response',
      'stop pussyfooting around the issue',
      // Collide with a screened root once suffixes are allowed.
      'scatter the evidence and a scattered argument',
      'a titter ran through the crowd',
      'the booby prize',
      'a cocker spaniel',
      // A fixed idiom.
      'tit for tat retaliation gets us nowhere',
    ]) {
      expect(screenLocally(innocent).safe, innocent).toBe(true);
    }
  });

  it('leaves names of religions alone, religion being a protected category', () => {
    // A branch of Islam collides with a screened root because the
    // doubling-tolerant pattern reads its doubled vowel as a repetition.
    // Screening a religious identity is the worst false positive this list can
    // produce, so both the singular and the plural are whitelisted and both are
    // asserted here.
    for (const innocent of [
      'Shiite',
      'Shiites',
      'the Shiites of Iraq',
      'a Shiite scholar and a Sunni scholar disagreed',
      'Muslim',
      'Sikh',
      'Jewish',
      'Hindu',
      'Buddhist',
      'Catholic',
    ]) {
      expect(screenLocally(innocent).safe, innocent).toBe(true);
    }
  });

  it('keeps every supplementary whitelist entry narrow', () => {
    expect.hasAssertions();
    // An entry broad enough to cover an innocent word can also swallow a real
    // term, and obscenity flattens every whitelist into one global list, so
    // such an entry suppresses matches anywhere its span falls. An entry must
    // therefore rescue one word family and no more.
    //
    // Probed against this module's own patterns with the whitelist left off,
    // not against the stock English dataset. The patterns actually screened are
    // re-anchored, doubling-tolerant and suffix-expanded, so an entry can be
    // narrow under the stock dataset and wide under these.
    //
    // "One family" rather than "one word" because suffix expansion makes nested
    // roots unavoidable: one root plus a suffix can spell another root plus a
    // different suffix. Those are one term inside another, not two independent
    // terms, and suppressing them within the span of a single innocent word
    // smuggles nothing. Two roots neither of which contains the other would
    // mean the entry reaches past the word it exists for, which is the failure
    // worth catching.
    const probe = new RegExpMatcher({
      ...PROFANITY_DATASET.build(),
      ...englishRecommendedTransformers,
    });

    for (const allowed of SUPPLEMENTARY_WHITELIST) {
      const covered = [
        ...new Set(
          probe
            .getAllMatches(allowed)
            .map(
              (match) =>
                PROFANITY_DATASET.getPayloadWithPhraseMetadata(match)
                  .phraseMetadata?.originalWord,
            )
            .filter((word): word is string => word !== undefined),
        ),
      ];
      const longest = covered.reduce(
        (widest, word) => (word.length > widest.length ? word : widest),
        '',
      );
      for (const word of covered) {
        expect(longest.includes(word), `${allowed} covers ${word}`).toBe(true);
      }
    }
  });
});
