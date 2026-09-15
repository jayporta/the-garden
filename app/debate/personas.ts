/**
 * The personality dials that shape both a contestant's speech and its
 * simulation behaviour.
 *
 * Six axes, each `0..100`, are the single source both {@link compilePersonaPrompt}
 * and {@link deriveSimParams} read from — the two consumers that stop the
 * sliders being a dressed-up prompt box. Neither validates or clamps a
 * {@link Persona}'s values; that is the responsibility of whatever constructs
 * one (the chest-panel sliders), the same trust-boundary posture `models.ts`
 * and `topics.ts` take with their own ids.
 */

import type { Meters } from './meters';

/** Metadata for one personality axis, describing its endpoints. */
export type PersonalityAxis = {
  readonly key: string;
  /** Shown in the transcript and on the chest panel. */
  readonly label: string;
  /** What a value near 0 reads as. */
  readonly low: string;
  /** What a value near 100 reads as. */
  readonly high: string;
};

/**
 * The six personality axes, in the order DESIGN.md's table declares them.
 * `as const satisfies` validates every entry's shape while preserving the
 * literal `key` types, so {@link PersonalityAxisKey} is a union rather than
 * `string`.
 */
export const PERSONALITY_AXES = [
  { key: 'verbosity', label: 'Verbosity', low: 'Terse', high: 'Rambling' },
  { key: 'aggression', label: 'Aggression', low: 'Gentle', high: 'Combative' },
  { key: 'formality', label: 'Formality', low: 'Casual', high: 'Academic' },
  { key: 'ego', label: 'Ego', low: 'Humble', high: 'Arrogant' },
  {
    key: 'stubbornness',
    label: 'Stubbornness',
    low: 'Persuadable',
    high: 'Immovable',
  },
  { key: 'humour', label: 'Humour', low: 'Dry', high: 'Silly' },
] as const satisfies readonly PersonalityAxis[];

/** The key of any axis in {@link PERSONALITY_AXES}. */
export type PersonalityAxisKey = (typeof PERSONALITY_AXES)[number]['key'];

/**
 * One full set of dial positions, one `0..100` value per axis in
 * {@link PERSONALITY_AXES}.
 */
export type Persona = Readonly<Record<PersonalityAxisKey, number>>;

/**
 * The simulation constants a persona's axes resolve to.
 *
 * Each field is a multiplier around a baseline of `1.0` — the base decay,
 * drain and boost amounts belong to `meters.ts`'s `applyTurnEffects`; this
 * only supplies the per-persona modifier.
 */
export type PersonaSimParams = {
  readonly convictionDecayRate: number;
  readonly opponentPatienceDrainRate: number;
  readonly landedPointConvictionBoost: number;
};

/** The multiplier range every {@link PersonaSimParams} field scales across. */
const SIM_PARAM_RANGE = { min: 0.5, max: 1.5 } as const;

/** Linearly maps a `0..100` axis value onto `[low, high]`. */
function scaleAxis(value: number, low: number, high: number): number {
  return low + ((high - low) * value) / 100;
}

/**
 * Maps a persona's axes to simulation constants.
 *
 * Only three axes have a mechanical effect — Stubbornness, Aggression and
 * Ego, exactly the three DESIGN.md names. Verbosity, Formality and Humour are
 * prompt-only flavour axes with no simulation weight; that is a deliberate
 * scope decision, not an oversight.
 *
 * @param persona - The dial positions to derive constants from.
 * @returns The conviction-decay, opponent-patience-drain and landed-point
 * multipliers a turn should apply.
 */
export function deriveSimParams(persona: Persona): PersonaSimParams {
  const { min, max } = SIM_PARAM_RANGE;
  return {
    // Stubbornness inverts the usual low-to-high direction: immovable (100)
    // means conviction erodes slowly, so the axis's high end pairs with the
    // range's low end.
    convictionDecayRate: scaleAxis(persona.stubbornness, max, min),
    opponentPatienceDrainRate: scaleAxis(persona.aggression, min, max),
    landedPointConvictionBoost: scaleAxis(persona.ego, min, max),
  };
}

/** A `0..100` value at or below this reads as the axis's low band. */
const LOW_BAND_MAX = 20;
/** A `0..100` value at or above this reads as the axis's high band. */
const HIGH_BAND_MIN = 80;

type PromptBand = 'low' | 'mid' | 'high';

/**
 * Bands a `0..100` axis value per DESIGN.md's thresholds. The middle band
 * intentionally maps to no instruction at all, rather than a watered-down
 * hint — the risk DESIGN.md names is sliders moving without the output
 * changing, and a vague middle instruction would reintroduce exactly that.
 */
function bandOf(value: number): PromptBand {
  if (value <= LOW_BAND_MAX) {
    return 'low';
  }
  if (value >= HIGH_BAND_MIN) {
    return 'high';
  }
  return 'mid';
}

/**
 * The prompt instruction for each axis at its low and high bands.
 *
 * `satisfies` against `Record<PersonalityAxisKey, ...>` makes adding a
 * seventh axis to {@link PERSONALITY_AXES} fail the typecheck here until this
 * table gains an entry too — the same exhaustiveness reasoning
 * `rateLimitHeaders.ts`'s `GATEWAY_RATE_LIMIT_POLICY` uses.
 *
 * The copy itself is a first draft; DESIGN.md already flags the exact prompt
 * language as something to tune once real transcripts exist.
 */
const AXIS_PROMPT_BANDS = {
  verbosity: {
    low: 'Answer in one short sentence.',
    high: 'Ramble. Take the long way to the point, with asides.',
  },
  aggression: {
    low: 'Stay gentle. Concede small points readily.',
    high: "Be combative. Attack the opponent's argument, not just defend your own.",
  },
  formality: {
    low: 'Talk casually, like a bar argument.',
    high: 'Speak with academic precision. Structure claims as premises and conclusions.',
  },
  ego: {
    low: "Stay humble. Hedge your claims and credit the other side's point.",
    high: 'Be arrogant. Talk down to the opponent and oversell your own certainty.',
  },
  stubbornness: {
    low: 'Be persuadable. Update your position when the other side scores a point.',
    high: 'Be immovable. Restate your position no matter what is said.',
  },
  humour: {
    low: 'Keep it dry. Deadpan delivery, no jokes.',
    high: 'Be silly. Crack jokes and use absurd comparisons.',
  },
} as const satisfies Readonly<
  Record<PersonalityAxisKey, { readonly low: string; readonly high: string }>
>;

/** A `0..100` meter at or below this triggers its low-meter prompt line. */
const LOW_METER_THRESHOLD = 30;

const LOSING_PATIENCE_INSTRUCTION =
  'You are losing patience. Interrupt, be curt.';
const LOSING_CONVICTION_INSTRUCTION =
  'Your resolve is cracking. Sound less certain, hedge more.';

/**
 * Compiles a persona and its current meters into prompt instructions.
 *
 * Every axis outside the middle band contributes one line; a fully neutral
 * persona with healthy meters compiles to `''`, which is the expected
 * behaviour (this text is spliced into a larger system prompt by the turn
 * route) rather than a case to guard against.
 *
 * @param persona - The dial positions to compile.
 * @param meters - The contestant's current Patience and Conviction.
 * @returns Newline-separated instructions, low-meter lines last.
 */
export function compilePersonaPrompt(persona: Persona, meters: Meters): string {
  const lines: string[] = [];

  for (const axis of PERSONALITY_AXES) {
    const band = bandOf(persona[axis.key]);
    if (band !== 'mid') {
      lines.push(AXIS_PROMPT_BANDS[axis.key][band]);
    }
  }

  if (meters.patience <= LOW_METER_THRESHOLD) {
    lines.push(LOSING_PATIENCE_INSTRUCTION);
  }
  if (meters.conviction <= LOW_METER_THRESHOLD) {
    lines.push(LOSING_CONVICTION_INSTRUCTION);
  }

  return lines.join('\n');
}

/** A distance from the neutral midpoint below which an axis stays silent. */
const NEUTRAL_BAND = 10;
/** The midpoint every axis is measured against. */
const NEUTRAL_MIDPOINT = 50;
/** Returned when no axis is far enough from neutral to name the persona. */
const NEUTRAL_PERSONALITY_TYPE = 'The Neutral';
/** How many of the most extreme axes make it into the name. */
const MAX_NAMED_AXES = 2;

/**
 * Names a persona from its one or two most extreme axes, for a live label
 * while dragging sliders.
 *
 * Deliberately simple flavour text rather than an archetype classifier: rank
 * axes by distance from neutral, take up to the two most extreme, and join
 * their descriptors. Ties break by {@link PERSONALITY_AXES}'s declared order,
 * since `Array.prototype.sort` is stable.
 *
 * @param persona - The dial positions to name.
 * @returns A short label such as `"The Combative Rambling"`, or
 * {@link NEUTRAL_PERSONALITY_TYPE} when every axis sits near the midpoint.
 */
export function derivePersonalityType(persona: Persona): string {
  const dominant = PERSONALITY_AXES.map((axis) => {
    const value = persona[axis.key];
    const distance = Math.abs(value - NEUTRAL_MIDPOINT);
    return {
      descriptor: value >= NEUTRAL_MIDPOINT ? axis.high : axis.low,
      distance,
    };
  })
    .filter((entry) => entry.distance >= NEUTRAL_BAND)
    .sort((a, b) => b.distance - a.distance)
    .slice(0, MAX_NAMED_AXES);

  if (dominant.length === 0) {
    return NEUTRAL_PERSONALITY_TYPE;
  }
  return `The ${dominant.map((entry) => entry.descriptor).join(' ')}`;
}
