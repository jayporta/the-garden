import { describe, it, expect } from 'vitest';
import type { PersonaSimParams } from '@/app/debate/personas';
import {
  STARTING_METERS,
  applyTurnEffects,
  hasConceded,
  relationship,
  type Meters,
} from '@/app/debate/meters';

/** A robot's meters, both at the ceiling, overridden per test. */
function testMeters(overrides: Partial<Meters> = {}): Meters {
  return { patience: 100, conviction: 100, ...overrides };
}

/** Neutral sim params — every multiplier at its 1.0 midpoint — overridden per test. */
function testSimParams(
  overrides: Partial<PersonaSimParams> = {},
): PersonaSimParams {
  return {
    convictionDecayRate: 1,
    opponentPatienceDrainRate: 1,
    landedPointConvictionBoost: 1,
    ...overrides,
  };
}

describe('STARTING_METERS', () => {
  it('starts both meters at the ceiling', () => {
    expect(STARTING_METERS).toEqual({ patience: 100, conviction: 100 });
  });
});

describe('applyTurnEffects', () => {
  it('decays the speaker own conviction at neutral sim params', () => {
    const result = applyTurnEffects(
      testMeters(),
      testMeters(),
      testSimParams(),
    );
    expect(result.speaker.conviction).toBe(88);
  });

  it('drains the opponent patience at neutral sim params', () => {
    const result = applyTurnEffects(
      testMeters(),
      testMeters(),
      testSimParams(),
    );
    expect(result.opponent.patience).toBe(88);
  });

  it('leaves the speaker own patience untouched', () => {
    const result = applyTurnEffects(
      testMeters({ patience: 42 }),
      testMeters(),
      testSimParams(),
    );
    expect(result.speaker.patience).toBe(42);
  });

  it('leaves the opponent own conviction untouched', () => {
    const result = applyTurnEffects(
      testMeters(),
      testMeters({ conviction: 42 }),
      testSimParams(),
    );
    expect(result.opponent.conviction).toBe(42);
  });

  it('does not mutate its input meters', () => {
    const speakerInput = testMeters();
    const opponentInput = testMeters();
    const speakerSnapshot = { ...speakerInput };
    const opponentSnapshot = { ...opponentInput };

    applyTurnEffects(speakerInput, opponentInput, testSimParams());

    expect(speakerInput).toEqual(speakerSnapshot);
    expect(opponentInput).toEqual(opponentSnapshot);
  });

  it('keeps speaker and opponent effects distinguishable, guarding against a swapped call', () => {
    const result = applyTurnEffects(
      testMeters({ conviction: 100, patience: 20 }),
      testMeters({ conviction: 20, patience: 100 }),
      testSimParams(),
    );

    // Only the speaker's conviction and the opponent's patience should move.
    expect(result.speaker.conviction).not.toBe(100);
    expect(result.opponent.patience).not.toBe(100);
    expect(result.speaker.patience).toBe(20);
    expect(result.opponent.conviction).toBe(20);
  });

  it.each([
    [
      74,
      testSimParams({
        convictionDecayRate: 1.5,
        landedPointConvictionBoost: 0.5,
      }),
    ],
    // Demonstrates ceiling clamping: the raw sum would be 102.
    [
      100,
      testSimParams({
        convictionDecayRate: 0.5,
        landedPointConvictionBoost: 1.5,
      }),
    ],
  ])('drives conviction from a starting 100 to %i', (expected, simParams) => {
    const result = applyTurnEffects(testMeters(), testMeters(), simParams);
    expect(result.speaker.conviction).toBe(expected);
  });

  it('clamps speaker conviction at the floor rather than going negative', () => {
    const result = applyTurnEffects(
      testMeters({ conviction: 5 }),
      testMeters(),
      testSimParams({
        convictionDecayRate: 1.5,
        landedPointConvictionBoost: 0.5,
      }),
    );
    expect(result.speaker.conviction).toBe(0);
  });

  it.each([
    [94, testSimParams({ opponentPatienceDrainRate: 0.5 })],
    [82, testSimParams({ opponentPatienceDrainRate: 1.5 })],
  ])(
    'drains opponent patience from a starting 100 to %i',
    (expected, simParams) => {
      const result = applyTurnEffects(testMeters(), testMeters(), simParams);
      expect(result.opponent.patience).toBe(expected);
    },
  );

  it('clamps opponent patience at the floor rather than going negative', () => {
    const result = applyTurnEffects(
      testMeters(),
      testMeters({ patience: 5 }),
      testSimParams({ opponentPatienceDrainRate: 1.5 }),
    );
    expect(result.opponent.patience).toBe(0);
  });
});

describe('hasConceded', () => {
  it.each([
    [1, false],
    [5, false],
    [6, true],
  ])(
    'at zero conviction, treats turn %i as conceded: %s',
    (turnNumber, expected) => {
      expect(hasConceded(testMeters({ conviction: 0 }), turnNumber)).toBe(
        expected,
      );
    },
  );

  it.each([
    [0, true],
    [1, false],
  ])(
    'at turn 6, treats a conviction of %i as conceded: %s',
    (conviction, expected) => {
      expect(hasConceded(testMeters({ conviction }), 6)).toBe(expected);
    },
  );

  it('never concedes at full conviction, however late the turn', () => {
    expect(hasConceded(testMeters({ conviction: 100 }), 50)).toBe(false);
  });
});

describe('relationship', () => {
  it('reads Cordial when both robots have high patience', () => {
    expect(relationship(testMeters(), testMeters())).toBe('Cordial');
  });

  it.each([
    [71, 'Cordial'],
    [70, 'Tense'],
    [31, 'Tense'],
    [30, 'Hostile'],
    [1, 'Hostile'],
    [0, 'Blown Up'],
  ])('treats a lowest patience of %i as %s', (patience, expected) => {
    expect(relationship(testMeters({ patience }), testMeters())).toBe(expected);
  });

  it('is governed by the lower patience, not the average', () => {
    // An average of 100 and 0 would land in the Tense band; the actual floor
    // of one robot's patience must dominate instead.
    const result = relationship(
      testMeters({ patience: 100 }),
      testMeters({ patience: 0 }),
    );
    expect(result).toBe('Blown Up');
  });

  it('is unaffected by conviction', () => {
    const result = relationship(
      testMeters({ conviction: 0 }),
      testMeters({ conviction: 0 }),
    );
    expect(result).toBe('Cordial');
  });

  it('is symmetric in argument order', () => {
    const a = testMeters({ patience: 20 });
    const b = testMeters({ patience: 90 });
    expect(relationship(a, b)).toBe(relationship(b, a));
  });
});

describe('a full debate, turn by turn', () => {
  it('does not zero out a stubborn, humble persona across a 10-turn debate', () => {
    const simParams = testSimParams({
      convictionDecayRate: 0.5,
      landedPointConvictionBoost: 1.0,
    });
    let speaker = testMeters();
    const opponent = testMeters();

    for (let turn = 0; turn < 5; turn++) {
      speaker = applyTurnEffects(speaker, opponent, simParams).speaker;
    }

    expect(speaker.conviction).toBe(90);
  });

  it('brings an aggressive, fragile persona to hasConceded before the turn cap', () => {
    const simParams = testSimParams({
      convictionDecayRate: 1.5,
      landedPointConvictionBoost: 0.5,
    });
    let speaker = testMeters();
    const opponent = testMeters();
    let thirdTurnMeters: Meters | undefined;

    for (let turn = 0; turn < 4; turn++) {
      speaker = applyTurnEffects(speaker, opponent, simParams).speaker;
      if (turn === 2) {
        thirdTurnMeters = speaker;
      }
    }

    expect(speaker.conviction).toBe(0);
    expect(hasConceded(speaker, 7)).toBe(true);

    // Not conceded after its 3rd own turn: the conviction floor is not yet
    // hit, and even if it were, the turn-6 floor has not opened yet either.
    expect(thirdTurnMeters?.conviction).toBe(22);
    expect(hasConceded(thirdTurnMeters!, 5)).toBe(false);
  });
});
