/**
 * The pure state machine driving one debate, from the idle slot machine
 * through to a verdict. Visuals subscribe to this state; this module has no
 * I/O of its own — it never fetches a turn's text (task 9's turn route does
 * that) and never renders anything (task 10's components do that).
 *
 * DESIGN.md's own reviewer checklist singles out "sequence states" as a
 * single-source-of-truth risk: every layer that cares what stage a debate is
 * in must import {@link SequenceState} from here rather than redeclare it.
 *
 * An event that does not apply to the current stage (a stray `stop-pressed`
 * while `idle`, say) is ignored: {@link advance} returns the exact same
 * object reference, not a structurally-equal copy, so a `useReducer`
 * subscriber gets a free no-op re-render bail-out.
 */

import {
  applyTurnEffects,
  hasConceded,
  relationship,
  STARTING_METERS,
  type Meters,
  type RelationshipLabel,
} from './meters';
import type { PersonaSimParams } from './personas';
import type { SpinResult } from './spin';

/** Which robot: the left reel's model or the right reel's. */
export type Side = 'left' | 'right';

/** One completed turn, in the order it was spoken. */
export type TranscriptEntry = {
  /** 1-indexed across both robots, matching `meters.ts`'s `hasConceded` convention. */
  readonly turnNumber: number;
  readonly side: Side;
  readonly text: string;
};

/** Why a debate ended, captured at the transition into `verdict` since it
 * cannot be recovered from the final meters alone. */
export type SequenceEndReason = 'turn-cap' | 'stop' | 'concede';

/**
 * Every stage a debate can be in, each carrying only the data that stage
 * actually needs. `spin` is carried unchanged from `button-pressed` onward,
 * since {@link SpinResult} is decided before any animation runs.
 */
export type SequenceState =
  | { readonly stage: 'idle' }
  | { readonly stage: 'spinning'; readonly spin: SpinResult }
  | { readonly stage: 'charging'; readonly spin: SpinResult }
  | { readonly stage: 'jolt'; readonly spin: SpinResult }
  | {
      readonly stage: 'debating';
      readonly spin: SpinResult;
      readonly turnCap: number;
      readonly transcript: readonly TranscriptEntry[];
      readonly leftMeters: Meters;
      readonly rightMeters: Meters;
      /** Whose bubble is live right now, and so whose turn is next. */
      readonly activeSpeaker: Side;
    }
  | {
      readonly stage: 'verdict';
      readonly spin: SpinResult;
      readonly transcript: readonly TranscriptEntry[];
      readonly leftMeters: Meters;
      readonly rightMeters: Meters;
      readonly relationship: RelationshipLabel;
      readonly endReason: SequenceEndReason;
    };

/** Every trigger a subscriber can dispatch, one per diagram arrow. */
export type SequenceEvent =
  | { readonly type: 'button-pressed'; readonly spin: SpinResult }
  | { readonly type: 'reels-settled' }
  | { readonly type: 'current-landed' }
  | {
      readonly type: 'jolt-finished';
      /** Overrides {@link DEFAULT_TURN_CAP} for this debate. */
      readonly turnCap?: number;
    }
  | {
      readonly type: 'turn-completed';
      readonly text: string;
      /** The active speaker's sim params; the speaker itself is read off state. */
      readonly simParams: PersonaSimParams;
    }
  | { readonly type: 'stop-pressed' };

/** DESIGN.md: "Stop conditions: turn cap (default 10)..." Overridable per debate via `jolt-finished`. */
export const DEFAULT_TURN_CAP = 10;

/** The one canonical idle value. Restart a finished debate by reassigning
 * state to this constant rather than dispatching an event — nothing about
 * starting over depends on the verdict being discarded. */
export const INITIAL_SEQUENCE_STATE: SequenceState = { stage: 'idle' };

/** The side that did not just speak. */
function otherSide(side: Side): Side {
  return side === 'left' ? 'right' : 'left';
}

type DebatingState = Extract<SequenceState, { stage: 'debating' }>;

/** Handles a `turn-completed` event: folds its effects into the transcript
 * and both robots' meters, then checks whether the debate is over. */
function advanceDebating(
  state: DebatingState,
  event: SequenceEvent & { type: 'turn-completed' },
): SequenceState {
  const speaker = state.activeSpeaker;
  const opponent = otherSide(speaker);
  const turnNumber = state.transcript.length + 1;
  const transcript = [
    ...state.transcript,
    { turnNumber, side: speaker, text: event.text },
  ];

  const speakerMeters =
    speaker === 'left' ? state.leftMeters : state.rightMeters;
  const opponentMeters =
    speaker === 'left' ? state.rightMeters : state.leftMeters;
  const effects = applyTurnEffects(
    speakerMeters,
    opponentMeters,
    event.simParams,
  );

  const leftMeters = speaker === 'left' ? effects.speaker : effects.opponent;
  const rightMeters = speaker === 'left' ? effects.opponent : effects.speaker;

  // Checked against both sides, not just the speaker: a robot's conviction
  // can already sit at 0 from an earlier turn, reached before the turn-6
  // floor opened, while a later turn belongs to the other side.
  const concede =
    hasConceded(leftMeters, turnNumber) || hasConceded(rightMeters, turnNumber);
  const capReached = transcript.length >= state.turnCap;

  if (concede || capReached) {
    return {
      stage: 'verdict',
      spin: state.spin,
      transcript,
      leftMeters,
      rightMeters,
      relationship: relationship(leftMeters, rightMeters),
      endReason: concede ? 'concede' : 'turn-cap',
    };
  }

  return {
    stage: 'debating',
    spin: state.spin,
    turnCap: state.turnCap,
    transcript,
    leftMeters,
    rightMeters,
    activeSpeaker: opponent,
  };
}

/**
 * Advances a debate's state machine by one event.
 *
 * @param state - The current stage.
 * @param event - The trigger to apply.
 * @returns The next stage, or the exact same `state` reference if `event`
 * does not apply to it.
 */
export function advance(
  state: SequenceState,
  event: SequenceEvent,
): SequenceState {
  switch (state.stage) {
    case 'idle':
      if (event.type === 'button-pressed') {
        return { stage: 'spinning', spin: event.spin };
      }
      return state;

    case 'spinning':
      if (event.type === 'reels-settled') {
        return { stage: 'charging', spin: state.spin };
      }
      return state;

    case 'charging':
      if (event.type === 'current-landed') {
        return { stage: 'jolt', spin: state.spin };
      }
      return state;

    case 'jolt':
      if (event.type === 'jolt-finished') {
        return {
          stage: 'debating',
          spin: state.spin,
          turnCap: event.turnCap ?? DEFAULT_TURN_CAP,
          transcript: [],
          leftMeters: STARTING_METERS,
          rightMeters: STARTING_METERS,
          activeSpeaker: 'left',
        };
      }
      return state;

    case 'debating':
      if (event.type === 'turn-completed') {
        return advanceDebating(state, event);
      }
      if (event.type === 'stop-pressed') {
        return {
          stage: 'verdict',
          spin: state.spin,
          transcript: state.transcript,
          leftMeters: state.leftMeters,
          rightMeters: state.rightMeters,
          relationship: relationship(state.leftMeters, state.rightMeters),
          endReason: 'stop',
        };
      }
      return state;

    case 'verdict':
      return state;
  }
}
