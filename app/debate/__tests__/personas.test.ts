import { describe, it, expect } from 'vitest';
import {
  PERSONALITY_AXES,
  deriveSimParams,
  compilePersonaPrompt,
  derivePersonalityType,
  type Persona,
  type PersonaPromptMeters,
} from '@/app/debate/personas';

/** A persona with every axis at the neutral midpoint, overridden per test. */
function testPersona(overrides: Partial<Persona> = {}): Persona {
  const neutral = Object.fromEntries(
    PERSONALITY_AXES.map((axis) => [axis.key, 50]),
  ) as Persona;
  return { ...neutral, ...overrides };
}

/** Healthy meters (no low-meter prompt instructions fire), overridden per test. */
function testMeters(
  overrides: Partial<PersonaPromptMeters> = {},
): PersonaPromptMeters {
  return { patience: 100, conviction: 100, ...overrides };
}

describe('PERSONALITY_AXES', () => {
  it('has exactly six axes', () => {
    expect(PERSONALITY_AXES.length).toBe(6);
  });

  it('has unique keys', () => {
    const keys = PERSONALITY_AXES.map((axis) => axis.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('gives every axis a non-empty label and low/high descriptor', () => {
    for (const axis of PERSONALITY_AXES) {
      expect(axis.label.length).toBeGreaterThan(0);
      expect(axis.low.length).toBeGreaterThan(0);
      expect(axis.high.length).toBeGreaterThan(0);
    }
  });

  it('gives every axis a label short enough for the chest panel', () => {
    for (const axis of PERSONALITY_AXES) {
      expect(axis.label.length).toBeLessThanOrEqual(24);
    }
  });

  it('gives every axis distinct low and high descriptors', () => {
    for (const axis of PERSONALITY_AXES) {
      expect(axis.low).not.toBe(axis.high);
    }
  });
});

describe('deriveSimParams', () => {
  it('returns finite numbers for every field', () => {
    const params = deriveSimParams(testPersona());
    expect(Number.isFinite(params.convictionDecayRate)).toBe(true);
    expect(Number.isFinite(params.opponentPatienceDrainRate)).toBe(true);
    expect(Number.isFinite(params.landedPointConvictionBoost)).toBe(true);
  });

  it('returns the midpoint multiplier for a fully neutral persona', () => {
    const params = deriveSimParams(testPersona());
    expect(params.convictionDecayRate).toBe(1);
    expect(params.opponentPatienceDrainRate).toBe(1);
    expect(params.landedPointConvictionBoost).toBe(1);
  });

  it('slows conviction decay as stubbornness rises', () => {
    const persuadable = deriveSimParams(testPersona({ stubbornness: 0 }));
    const immovable = deriveSimParams(testPersona({ stubbornness: 100 }));

    expect(persuadable.convictionDecayRate).toBe(1.5);
    expect(immovable.convictionDecayRate).toBe(0.5);
  });

  it('makes the opponent lose patience faster as aggression rises', () => {
    const gentle = deriveSimParams(testPersona({ aggression: 0 }));
    const combative = deriveSimParams(testPersona({ aggression: 100 }));

    expect(gentle.opponentPatienceDrainRate).toBe(0.5);
    expect(combative.opponentPatienceDrainRate).toBe(1.5);
  });

  it('grows the landed-point conviction boost as ego rises', () => {
    const humble = deriveSimParams(testPersona({ ego: 0 }));
    const arrogant = deriveSimParams(testPersona({ ego: 100 }));

    expect(humble.landedPointConvictionBoost).toBe(0.5);
    expect(arrogant.landedPointConvictionBoost).toBe(1.5);
  });

  it('is unaffected by verbosity, formality or humour', () => {
    const base = deriveSimParams(testPersona());
    const flavorOnly = deriveSimParams(
      testPersona({ verbosity: 0, formality: 100, humour: 0 }),
    );

    expect(flavorOnly).toEqual(base);
  });
});

describe('compilePersonaPrompt', () => {
  it('returns an empty string for a neutral persona with healthy meters', () => {
    expect(compilePersonaPrompt(testPersona(), testMeters())).toBe('');
  });

  it('instructs a short answer at minimum verbosity', () => {
    const prompt = compilePersonaPrompt(
      testPersona({ verbosity: 0 }),
      testMeters(),
    );
    expect(prompt).toContain('one short sentence');
  });

  it('instructs rambling at maximum verbosity', () => {
    const prompt = compilePersonaPrompt(
      testPersona({ verbosity: 100 }),
      testMeters(),
    );
    expect(prompt).toContain('Ramble');
  });

  it('says nothing about verbosity in the middle band', () => {
    const prompt = compilePersonaPrompt(
      testPersona({ verbosity: 50 }),
      testMeters(),
    );
    expect(prompt).toBe('');
  });

  it.each([
    [20, 'low'],
    [21, 'mid'],
    [79, 'mid'],
    [80, 'high'],
  ])('treats a verbosity of %i as the %s band', (value, band) => {
    const prompt = compilePersonaPrompt(
      testPersona({ verbosity: value }),
      testMeters(),
    );

    if (band === 'mid') {
      expect(prompt).toBe('');
    } else {
      expect(prompt.length).toBeGreaterThan(0);
    }
  });

  it('gives every axis a distinct instruction at its low versus high band', () => {
    // The direct regression test for the "sliders move, output does not" risk
    // DESIGN.md names: every axis must actually change the compiled prompt.
    for (const axis of PERSONALITY_AXES) {
      const low = compilePersonaPrompt(
        testPersona({ [axis.key]: 0 }),
        testMeters(),
      );
      const high = compilePersonaPrompt(
        testPersona({ [axis.key]: 100 }),
        testMeters(),
      );

      expect(low.length).toBeGreaterThan(0);
      expect(high.length).toBeGreaterThan(0);
      expect(low).not.toBe(high);
    }
  });

  it('folds in a losing-patience instruction when patience is low', () => {
    const withoutIt = compilePersonaPrompt(testPersona(), testMeters());
    const withIt = compilePersonaPrompt(
      testPersona(),
      testMeters({ patience: 30 }),
    );

    expect(withoutIt).toBe('');
    expect(withIt.length).toBeGreaterThan(0);
  });

  it('folds in a losing-conviction instruction when conviction is low', () => {
    const withoutIt = compilePersonaPrompt(testPersona(), testMeters());
    const withIt = compilePersonaPrompt(
      testPersona(),
      testMeters({ conviction: 30 }),
    );

    expect(withoutIt).toBe('');
    expect(withIt.length).toBeGreaterThan(0);
  });

  it('folds in both meter instructions when both are low, distinctly from either alone', () => {
    const patienceOnly = compilePersonaPrompt(
      testPersona(),
      testMeters({ patience: 30 }),
    );
    const both = compilePersonaPrompt(
      testPersona(),
      testMeters({ patience: 30, conviction: 30 }),
    );

    expect(both.length).toBeGreaterThan(patienceOnly.length);
  });

  it.each([
    [30, true],
    [31, false],
  ])(
    'treats a patience of %i as below the low-meter threshold: %s',
    (value, shouldFire) => {
      const prompt = compilePersonaPrompt(
        testPersona(),
        testMeters({ patience: value }),
      );
      expect(prompt.length > 0).toBe(shouldFire);
    },
  );
});

describe('derivePersonalityType', () => {
  it('returns the neutral fallback for a fully neutral persona', () => {
    expect(derivePersonalityType(testPersona())).toBe('The Neutral');
  });

  it('names the high descriptor when one axis is pinned to maximum', () => {
    const type = derivePersonalityType(testPersona({ aggression: 100 }));
    expect(type).toContain('Combative');
  });

  it('names the low descriptor when one axis is pinned to minimum', () => {
    const type = derivePersonalityType(testPersona({ aggression: 0 }));
    expect(type).toContain('Gentle');
  });

  it('gives different names to personas with different dominant axes', () => {
    const aggressive = derivePersonalityType(testPersona({ aggression: 100 }));
    const humorous = derivePersonalityType(testPersona({ humour: 100 }));

    expect(aggressive).not.toBe(humorous);
  });

  it('breaks an exact tie in distance from neutral by registry order', () => {
    // Verbosity precedes aggression in PERSONALITY_AXES, so an equal-distance
    // tie between them names verbosity's descriptor first.
    const type = derivePersonalityType(
      testPersona({ verbosity: 100, aggression: 100 }),
    );
    const verbosityIndex = type.indexOf('Rambling');
    const aggressionIndex = type.indexOf('Combative');

    expect(verbosityIndex).toBeGreaterThanOrEqual(0);
    expect(aggressionIndex).toBeGreaterThan(verbosityIndex);
  });

  it.each([
    [59, true],
    [60, false],
  ])('treats an axis value of %i as neutral: %s', (value, isNeutral) => {
    const type = derivePersonalityType(testPersona({ aggression: value }));
    expect(type === 'The Neutral').toBe(isNeutral);
  });

  it('names every axis when it alone is pinned to its high extreme', () => {
    for (const axis of PERSONALITY_AXES) {
      const type = derivePersonalityType(testPersona({ [axis.key]: 100 }));
      expect(type).toContain(axis.high);
    }
  });
});
