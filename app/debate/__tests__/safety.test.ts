import { describe, it, expect } from 'vitest';
import {
  SAFETY_PREAMBLE,
  SAFETY_REMINDER,
  decideTurnOutcome,
} from '@/app/debate/safety';
import { PROTECTED_CATEGORIES } from '@/app/lib/moderation/categories';
import type { SafetyVerdict } from '@/app/lib/moderation/screen';

/** An unsafe verdict, so retry-policy tests do not depend on the lexicon. */
function unsafeVerdict(
  overrides: Partial<Extract<SafetyVerdict, { safe: false }>> = {},
): SafetyVerdict {
  return { safe: false, categories: ['hate'], source: 'lexicon', ...overrides };
}

describe('SAFETY_PREAMBLE', () => {
  it('names every protected category it claims to cover', () => {
    for (const category of PROTECTED_CATEGORIES) {
      expect(SAFETY_PREAMBLE.toLowerCase()).toContain(category.toLowerCase());
    }
  });

  it('tells the model to attack arguments rather than people', () => {
    expect(SAFETY_PREAMBLE.toLowerCase()).toContain('argument');
  });

  it('is firmer on the reminder than on the first pass', () => {
    expect(SAFETY_REMINDER.length).toBeGreaterThan(0);
    expect(SAFETY_REMINDER).not.toBe(SAFETY_PREAMBLE);
  });
});

describe('decideTurnOutcome', () => {
  it('accepts a safe turn on any attempt', () => {
    expect(decideTurnOutcome({ safe: true }, 1)).toBe('accept');
    expect(decideTurnOutcome({ safe: true }, 2)).toBe('accept');
  });

  it('regenerates once on the first violation', () => {
    expect(decideTurnOutcome(unsafeVerdict(), 1)).toBe('regenerate');
  });

  it('disqualifies rather than looping when the retry also violates', () => {
    expect(decideTurnOutcome(unsafeVerdict(), 2)).toBe('disqualify');
  });

  it('disqualifies rather than regenerating on an attempt below the contract', () => {
    expect(decideTurnOutcome(unsafeVerdict(), 0)).toBe('disqualify');
    expect(decideTurnOutcome(unsafeVerdict(), -1)).toBe('disqualify');
  });

  it('disqualifies on a non-integer attempt', () => {
    expect(decideTurnOutcome(unsafeVerdict(), 1.5)).toBe('disqualify');
    expect(decideTurnOutcome(unsafeVerdict(), Number.NaN)).toBe('disqualify');
  });

  it('still accepts a safe turn whatever the attempt number', () => {
    expect(decideTurnOutcome({ safe: true }, 0)).toBe('accept');
    expect(decideTurnOutcome({ safe: true }, Number.NaN)).toBe('accept');
  });

  it('disqualifies on any attempt past the retry', () => {
    expect(decideTurnOutcome(unsafeVerdict(), 3)).toBe('disqualify');
  });
});
