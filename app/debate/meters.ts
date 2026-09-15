/**
 * The two live "decaying needs" gauges each robot carries through a debate:
 * Patience (tolerance of the other side) and Conviction (certainty in its own
 * position).
 *
 * `applyTurnEffects` is a pure function, applied client-side after each
 * turn's text finishes streaming — the server that generated the text never
 * sees or updates meters. This module imports `PersonaSimParams` from
 * `./personas` (a type-only import, erased at compile time) while
 * `personas.ts` in turn imports {@link Meters} from here for
 * `compilePersonaPrompt`'s signature. Both directions are `import type`, so
 * there is no runtime circular dependency — only a type-level relationship
 * the compiler resolves without difficulty.
 */

import type { PersonaSimParams } from './personas';

/** One robot's live simulation state, each field `0..100`. */
export type Meters = {
  readonly patience: number;
  readonly conviction: number;
};

/**
 * Both meters at the ceiling — what every robot has right after the jolt,
 * before its first turn. Persona-independent: installing a personality does
 * not change where the needles start, only how fast they move.
 */
export const STARTING_METERS: Meters = { patience: 100, conviction: 100 };

/** The bounds every meter value is clamped into. */
const METER_MIN = 0;
const METER_MAX = 100;

/** Clamps a computed meter value into `[METER_MIN, METER_MAX]`. */
function clampMeter(value: number): number {
  return Math.min(METER_MAX, Math.max(METER_MIN, value));
}

/**
 * How much a turn erodes the speaker's own conviction, before Stubbornness's
 * {@link PersonaSimParams.convictionDecayRate} multiplier is applied.
 */
const BASE_CONVICTION_DECAY_PER_TURN = 20;

/**
 * How much a turn raises the speaker's own conviction for having made its
 * case, before Ego's {@link PersonaSimParams.landedPointConvictionBoost}
 * multiplier is applied. There is no judge anywhere in this app to gate this
 * on the turn's actual content — every completed turn counts as landing a
 * point, mechanically, which is also what lets Risk #1 ("agreement
 * collapse") be fought by persona sliders alone rather than a scoring model
 * this codebase has nowhere else to run.
 */
const BASE_LANDED_POINT_BOOST_PER_TURN = 8;

/**
 * How much a turn drains the *opponent's* patience, before Aggression's
 * {@link PersonaSimParams.opponentPatienceDrainRate} multiplier is applied.
 */
const BASE_PATIENCE_DRAIN_PER_TURN = 12;

/** Both robots' meters after one turn's effects are applied. */
export type TurnEffectsResult = {
  readonly speaker: Meters;
  readonly opponent: Meters;
};

/**
 * Applies one completed turn's effects to both robots' meters.
 *
 * Called once per turn, from the speaker's perspective: the speaker's own
 * conviction decays and is boosted by having spoken, and the opponent's
 * patience drains. The speaker's own patience and the opponent's own
 * conviction are untouched — patience models tolerance of the *other* robot,
 * so only the other robot's turn can spend it.
 *
 * At neutral sim params (every multiplier at `1.0`) both touched fields move
 * by the same amount per turn — `8 - 20` and `-12` are equal by construction
 * of the chosen base magnitudes, not a hidden coupling between the two
 * fields.
 *
 * @param speakerMeters - The meters of the robot that just finished speaking.
 * @param opponentMeters - The meters of the robot that did not speak this turn.
 * @param simParams - The speaker's {@link PersonaSimParams}, from `deriveSimParams`.
 * @returns Both robots' meters after this turn, each clamped to `[0, 100]`.
 */
export function applyTurnEffects(
  speakerMeters: Meters,
  opponentMeters: Meters,
  simParams: PersonaSimParams,
): TurnEffectsResult {
  const speakerConviction = clampMeter(
    speakerMeters.conviction +
      BASE_LANDED_POINT_BOOST_PER_TURN * simParams.landedPointConvictionBoost -
      BASE_CONVICTION_DECAY_PER_TURN * simParams.convictionDecayRate,
  );
  const opponentPatience = clampMeter(
    opponentMeters.patience -
      BASE_PATIENCE_DRAIN_PER_TURN * simParams.opponentPatienceDrainRate,
  );

  return {
    speaker: { ...speakerMeters, conviction: speakerConviction },
    opponent: { ...opponentMeters, patience: opponentPatience },
  };
}

/**
 * The earliest turn {@link hasConceded} is allowed to return `true`.
 *
 * Risk #1 ("agreement collapse") in DESIGN.md: free models converge on
 * agreement within a few turns unless conceding is forbidden early, so this
 * floor holds regardless of how low conviction has fallen before it.
 */
const CONCESSION_UNLOCK_TURN = 6;

/**
 * Whether a robot has run out of conviction and the debate is allowed to end
 * because of it.
 *
 * @param meters - The robot's current meters.
 * @param turnNumber - The current turn, 1-indexed: turn 1 is the first turn
 * spoken by either robot. Neither DESIGN.md's architecture nor its sequence
 * diagram names a numbering convention, so this is this module's own stated
 * assumption.
 * @returns `true` once conviction has hit its floor, from turn
 * {@link CONCESSION_UNLOCK_TURN} onward; unconditionally `false` before it.
 */
export function hasConceded(meters: Meters, turnNumber: number): boolean {
  if (turnNumber < CONCESSION_UNLOCK_TURN) {
    return false;
  }
  return meters.conviction <= 0;
}

/** The closed set of relationship flavour-text values {@link relationship} returns. */
export type RelationshipLabel = 'Cordial' | 'Tense' | 'Hostile' | 'Blown Up';

/** A lowest-patience at or below this reads as the exchange having blown up. */
const RELATIONSHIP_BLOWN_UP_MAX = 0;
/** A lowest-patience at or below this reads as Hostile. Matches `personas.ts`'s
 * own low-meter prompt threshold, so this label turns Hostile exactly when a
 * robot's own prompt starts being told it is losing patience. */
const RELATIONSHIP_HOSTILE_MAX = 30;
/** A lowest-patience at or below this reads as Tense. */
const RELATIONSHIP_TENSE_MAX = 70;

/**
 * Flavour text for how civil the exchange currently is, read live during the
 * `debating` sequence stage and shown again at `verdict`.
 *
 * Governed by whichever robot has the *lower* patience, not an average and
 * not conviction: patience represents tolerance of the other side, which is
 * what "relationship" plausibly means for two robots arguing, and one robot
 * running out of patience sours the exchange regardless of how composed the
 * other still is — an average would let a calm robot mask its opponent's
 * fury.
 *
 * @param a - One robot's current meters.
 * @param b - The other robot's current meters.
 * @returns A label, symmetric in `a`/`b` — argument order never changes the
 * result.
 */
export function relationship(a: Meters, b: Meters): RelationshipLabel {
  const lowestPatience = Math.min(a.patience, b.patience);

  if (lowestPatience <= RELATIONSHIP_BLOWN_UP_MAX) {
    return 'Blown Up';
  }
  if (lowestPatience <= RELATIONSHIP_HOSTILE_MAX) {
    return 'Hostile';
  }
  if (lowestPatience <= RELATIONSHIP_TENSE_MAX) {
    return 'Tense';
  }
  return 'Cordial';
}
