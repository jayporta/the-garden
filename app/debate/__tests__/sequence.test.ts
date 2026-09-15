import { describe, it, expect } from 'vitest';
import type { PersonaSimParams } from '@/app/debate/personas';
import { FREE_MODELS } from '@/app/debate/models';
import { DEBATE_TOPICS } from '@/app/debate/topics';
import type { SpinResult } from '@/app/debate/spin';
import {
  advance,
  INITIAL_SEQUENCE_STATE,
  DEFAULT_TURN_CAP,
  type SequenceState,
  type SequenceEvent,
} from '@/app/debate/sequence';

/** A spin result to carry through every non-idle stage. */
function testSpin(): SpinResult {
  return {
    leftModelId: FREE_MODELS[0].id,
    topicId: DEBATE_TOPICS[0].id,
    rightModelId: FREE_MODELS[1].id,
  };
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

type DebatingState = Extract<SequenceState, { stage: 'debating' }>;

/** A valid mid-debate state: empty transcript, both meters full, left to speak. */
function testDebatingState(
  overrides: Partial<DebatingState> = {},
): SequenceState {
  return {
    stage: 'debating',
    spin: testSpin(),
    turnCap: DEFAULT_TURN_CAP,
    transcript: [],
    leftMeters: { patience: 100, conviction: 100 },
    rightMeters: { patience: 100, conviction: 100 },
    activeSpeaker: 'left',
    ...overrides,
  };
}

const ALL_EVENTS: SequenceEvent[] = [
  { type: 'button-pressed', spin: testSpin() },
  { type: 'reels-settled' },
  { type: 'current-landed' },
  { type: 'jolt-finished' },
  { type: 'turn-completed', text: 'hello', simParams: testSimParams() },
  { type: 'stop-pressed' },
];

describe('INITIAL_SEQUENCE_STATE', () => {
  it('starts idle', () => {
    expect(INITIAL_SEQUENCE_STATE).toEqual({ stage: 'idle' });
  });
});

describe('DEFAULT_TURN_CAP', () => {
  it('is 10, matching DESIGN.md', () => {
    expect(DEFAULT_TURN_CAP).toBe(10);
  });
});

describe('advance — pre-debate stages', () => {
  it('idle advances to spinning on button-pressed, carrying the spin result', () => {
    const spin = testSpin();
    const result = advance(INITIAL_SEQUENCE_STATE, {
      type: 'button-pressed',
      spin,
    });
    expect(result).toEqual({ stage: 'spinning', spin });
  });

  it('spinning advances to charging on reels-settled, carrying the spin result forward', () => {
    const spin = testSpin();
    const spinning: SequenceState = { stage: 'spinning', spin };
    const result = advance(spinning, { type: 'reels-settled' });
    expect(result).toEqual({ stage: 'charging', spin });
  });

  it('charging advances to jolt on current-landed, carrying the spin result forward', () => {
    const spin = testSpin();
    const charging: SequenceState = { stage: 'charging', spin };
    const result = advance(charging, { type: 'current-landed' });
    expect(result).toEqual({ stage: 'jolt', spin });
  });

  it('jolt advances to debating on jolt-finished, seeding starting meters and left first', () => {
    const spin = testSpin();
    const jolt: SequenceState = { stage: 'jolt', spin };
    const result = advance(jolt, { type: 'jolt-finished' });

    expect(result).toEqual({
      stage: 'debating',
      spin,
      turnCap: DEFAULT_TURN_CAP,
      transcript: [],
      leftMeters: { patience: 100, conviction: 100 },
      rightMeters: { patience: 100, conviction: 100 },
      activeSpeaker: 'left',
    });
  });

  it('jolt-finished honors an explicit turnCap override', () => {
    const jolt: SequenceState = { stage: 'jolt', spin: testSpin() };
    const result = advance(jolt, { type: 'jolt-finished', turnCap: 3 });

    expect(result.stage).toBe('debating');
    expect((result as DebatingState).turnCap).toBe(3);
  });

  it.each([
    ['idle', INITIAL_SEQUENCE_STATE, 'current-landed'],
    ['idle', INITIAL_SEQUENCE_STATE, 'jolt-finished'],
    ['spinning', { stage: 'spinning', spin: testSpin() }, 'button-pressed'],
    ['spinning', { stage: 'spinning', spin: testSpin() }, 'current-landed'],
    ['charging', { stage: 'charging', spin: testSpin() }, 'reels-settled'],
    ['charging', { stage: 'charging', spin: testSpin() }, 'jolt-finished'],
    ['jolt', { stage: 'jolt', spin: testSpin() }, 'reels-settled'],
    ['jolt', { stage: 'jolt', spin: testSpin() }, 'current-landed'],
  ])(
    'does not skip ahead: %s ignores a %s event',
    (_label, state, eventType) => {
      const event = ALL_EVENTS.find((e) => e.type === eventType)!;
      const result = advance(state as SequenceState, event);
      expect(result).toBe(state);
    },
  );
});

describe('advance — debating, turn-completed', () => {
  it('appends a transcript entry for the active speaker and advances to the other side', () => {
    const state = testDebatingState();
    const result = advance(state, {
      type: 'turn-completed',
      text: 'hot dogs are sandwiches',
      simParams: testSimParams(),
    }) as DebatingState;

    expect(result.stage).toBe('debating');
    expect(result.transcript).toEqual([
      { turnNumber: 1, side: 'left', text: 'hot dogs are sandwiches' },
    ]);
    expect(result.activeSpeaker).toBe('right');
  });

  it('applies the speaker conviction and opponent patience effects at neutral sim params', () => {
    const state = testDebatingState();
    const result = advance(state, {
      type: 'turn-completed',
      text: 'x',
      simParams: testSimParams(),
    }) as DebatingState;

    expect(result.leftMeters).toEqual({ patience: 100, conviction: 88 });
    expect(result.rightMeters).toEqual({ patience: 88, conviction: 100 });
  });

  it('ends with turn-cap once the transcript reaches turnCap, not earlier', () => {
    let state = testDebatingState({ turnCap: 2 });

    state = advance(state, {
      type: 'turn-completed',
      text: 'one',
      simParams: testSimParams(),
    }) as SequenceState;
    expect(state.stage).toBe('debating');

    state = advance(state, {
      type: 'turn-completed',
      text: 'two',
      simParams: testSimParams(),
    }) as SequenceState;
    expect(state.stage).toBe('verdict');
    expect(
      (state as Extract<SequenceState, { stage: 'verdict' }>).endReason,
    ).toBe('turn-cap');
  });

  it('records which side is speaking correctly across a fold, alternating left/right', () => {
    let state: SequenceState = testDebatingState({ turnCap: 100 });

    for (let i = 0; i < 6; i++) {
      state = advance(state, {
        type: 'turn-completed',
        text: `turn ${i}`,
        simParams: testSimParams(),
      });
    }

    const debating = state as DebatingState;
    expect(debating.transcript.map((entry) => entry.side)).toEqual([
      'left',
      'right',
      'left',
      'right',
      'left',
      'right',
    ]);
    expect(debating.transcript.map((entry) => entry.turnNumber)).toEqual([
      1, 2, 3, 4, 5, 6,
    ]);
  });

  it('ends with concede once the speaker turn side crosses zero conviction at turn 7', () => {
    // Mirrors meters.ts's own task-5 fragile-persona trajectory exactly:
    // 100 -> 74 -> 48 -> 22 -> 0 across the speaker's own turns 1, 3, 5, 7.
    const fragileParams = testSimParams({
      convictionDecayRate: 1.5,
      landedPointConvictionBoost: 0.5,
    });
    let state: SequenceState = testDebatingState({ turnCap: 100 });

    for (let turn = 1; turn <= 6; turn++) {
      const simParams = turn % 2 === 1 ? fragileParams : testSimParams();
      state = advance(state, {
        type: 'turn-completed',
        text: `t${turn}`,
        simParams,
      });
      expect(state.stage).toBe('debating');
    }

    state = advance(state, {
      type: 'turn-completed',
      text: 't7',
      simParams: fragileParams,
    });

    expect(state.stage).toBe('verdict');
    const verdict = state as Extract<SequenceState, { stage: 'verdict' }>;
    expect(verdict.endReason).toBe('concede');
    expect(verdict.leftMeters.conviction).toBe(0);
  });

  it('ends with concede on behalf of the non-speaking side once the turn-6 floor opens', () => {
    // Left's conviction hits 0 on its own 2nd turn (turn 3), well before turn 6.
    // The debate only ends once turn 6 opens the concession floor, even though
    // right is the one speaking on turn 6 and right's own conviction is fine.
    const leftParams = testSimParams({
      convictionDecayRate: 2.5,
      landedPointConvictionBoost: 0,
    });
    const rightParams = testSimParams();
    let state: SequenceState = testDebatingState({ turnCap: 100 });

    for (let turn = 1; turn <= 5; turn++) {
      const simParams = turn % 2 === 1 ? leftParams : rightParams;
      state = advance(state, {
        type: 'turn-completed',
        text: `t${turn}`,
        simParams,
      });
      expect(state.stage).toBe('debating');
    }

    // Turn 6: right speaks.
    state = advance(state, {
      type: 'turn-completed',
      text: 't6',
      simParams: rightParams,
    });

    expect(state.stage).toBe('verdict');
    const verdict = state as Extract<SequenceState, { stage: 'verdict' }>;
    expect(verdict.endReason).toBe('concede');
    expect(verdict.leftMeters.conviction).toBe(0);
    expect(verdict.rightMeters.conviction).toBe(64);
  });

  it('sets verdict.relationship from the final meters', () => {
    let state: SequenceState = testDebatingState({ turnCap: 1 });
    state = advance(state, {
      type: 'turn-completed',
      text: 't1',
      simParams: testSimParams(),
    });

    const verdict = state as Extract<SequenceState, { stage: 'verdict' }>;
    expect(verdict.stage).toBe('verdict');
    // Left spoke turn 1: rightMeters.patience drops to 88, still Cordial.
    expect(verdict.relationship).toBe('Cordial');
  });
});

describe('advance — debating, stop-pressed', () => {
  it('ends the debate with the reason stop, keeping the transcript and meters as they were', () => {
    let state: SequenceState = testDebatingState();

    for (let turn = 0; turn < 3; turn++) {
      state = advance(state, {
        type: 'turn-completed',
        text: `t${turn}`,
        simParams: testSimParams(),
      });
    }
    const beforeStop = state as DebatingState;

    state = advance(state, { type: 'stop-pressed' });

    expect(state.stage).toBe('verdict');
    const verdict = state as Extract<SequenceState, { stage: 'verdict' }>;
    expect(verdict.endReason).toBe('stop');
    expect(verdict.transcript).toEqual(beforeStop.transcript);
    expect(verdict.leftMeters).toEqual(beforeStop.leftMeters);
    expect(verdict.rightMeters).toEqual(beforeStop.rightMeters);
  });

  it('ignores a stop-pressed event while idle', () => {
    const result = advance(INITIAL_SEQUENCE_STATE, { type: 'stop-pressed' });
    expect(result).toBe(INITIAL_SEQUENCE_STATE);
  });
});

describe('advance — verdict', () => {
  it.each(ALL_EVENTS.map((event) => [event.type, event] as const))(
    'ignores a %s event, returning the same verdict unchanged',
    (_type, event) => {
      const verdict: SequenceState = {
        stage: 'verdict',
        spin: testSpin(),
        transcript: [{ turnNumber: 1, side: 'left', text: 'x' }],
        leftMeters: { patience: 40, conviction: 40 },
        rightMeters: { patience: 40, conviction: 40 },
        relationship: 'Tense',
        endReason: 'turn-cap',
      };

      const result = advance(verdict, event);
      expect(result).toBe(verdict);
    },
  );

  it('does not let a turn resolve after Stop already ended the debate', () => {
    let state: SequenceState = testDebatingState();
    state = advance(state, { type: 'stop-pressed' });
    const verdict = state;

    state = advance(state, {
      type: 'turn-completed',
      text: 'too late',
      simParams: testSimParams(),
    });

    expect(state).toBe(verdict);
  });
});

describe('advance — a full debate, idle to verdict', () => {
  it('walks every stage in order with no skip and ends at the turn cap', () => {
    const spin = testSpin();
    let state: SequenceState = INITIAL_SEQUENCE_STATE;

    state = advance(state, { type: 'button-pressed', spin });
    expect(state.stage).toBe('spinning');

    state = advance(state, { type: 'reels-settled' });
    expect(state.stage).toBe('charging');

    state = advance(state, { type: 'current-landed' });
    expect(state.stage).toBe('jolt');

    state = advance(state, { type: 'jolt-finished' });
    expect(state.stage).toBe('debating');

    for (let turn = 0; turn < DEFAULT_TURN_CAP; turn++) {
      state = advance(state, {
        type: 'turn-completed',
        text: `turn ${turn}`,
        simParams: testSimParams(),
      });
    }

    expect(state.stage).toBe('verdict');
    const verdict = state as Extract<SequenceState, { stage: 'verdict' }>;
    expect(verdict.spin).toEqual(spin);
    expect(verdict.endReason).toBe('turn-cap');
    expect(verdict.transcript.length).toBe(10);
    expect(verdict.leftMeters).toEqual({ patience: 40, conviction: 40 });
    expect(verdict.rightMeters).toEqual({ patience: 40, conviction: 40 });
    expect(verdict.relationship).toBe('Tense');
  });
});
