/**
 * Composes the whole system prompt for one debate turn.
 *
 * This exists so the guardrail is structurally hard to skip. The turn route
 * calls one function that always emits {@link SAFETY_PREAMBLE} first, rather
 * than assembling a prompt by hand at the model-call site and leaving the
 * preamble to be remembered. It is also the composition the turn route would
 * otherwise invent inline.
 *
 * Sections join with a blank line, the same shape `app/api/rag/chat/route.ts`
 * already uses for its `systemInstructions` array.
 */

import { SAFETY_PREAMBLE, SAFETY_REMINDER } from './safety';
import { compilePersonaPrompt, type Persona } from './personas';
import type { Meters } from './meters';
import type { DebateTopic } from './topics';
import type { Side } from './sequence';

/** Which way a contestant was assigned to argue. */
export type TurnStance = 'for' | 'against';

/** Everything one turn's system prompt is built from. */
export type TurnSystemPromptInput = {
  /** The speaking contestant's dial positions. */
  readonly persona: Persona;
  /** That contestant's Patience and Conviction as of this turn. */
  readonly meters: Meters;
  /** The proposition being debated. */
  readonly topic: DebateTopic;
  /** Which contestant is speaking. */
  readonly side: Side;
  /** Which way this contestant was assigned to argue. */
  readonly stance: TurnStance;
  /**
   * Appends {@link SAFETY_REMINDER}; set only on the one regeneration attempt.
   * @defaultValue `false`
   */
  readonly reinforceSafety?: boolean;
};

/** The instruction naming which way to argue, per stance. */
const STANCE_INSTRUCTIONS: Readonly<Record<TurnStance, string>> = {
  for: 'You are arguing FOR this proposition. Defend it.',
  against: 'You are arguing AGAINST this proposition. Refute it.',
};

/**
 * The framing that keeps a reply usable as speech-bubble text.
 *
 * Reasoning-first models are an open question for the turn route, so this asks
 * for the spoken turn alone and nothing around it.
 */
function buildRoleInstruction(side: Side): string {
  return `You are the ${side}-hand contestant on a televised debate game show.
Reply with your next spoken turn and nothing else: no stage directions, no narration, no speaker label.`;
}

/**
 * Builds the system prompt for one turn, safety rules first.
 *
 * The persona block is omitted rather than included empty when a neutral
 * persona with healthy meters compiles to `''`, which keeps
 * {@link compilePersonaPrompt}'s documented contract intact instead of pushing
 * a special case down into it.
 *
 * @param input - The contestant, its current meters, and the debate it is in.
 * @param input.persona - The speaking contestant's dial positions.
 * @param input.meters - That contestant's Patience and Conviction as of this turn.
 * @param input.topic - The proposition being debated.
 * @param input.side - Which contestant is speaking.
 * @param input.stance - Which way this contestant was assigned to argue.
 * @param input.reinforceSafety - Appends {@link SAFETY_REMINDER}; set only on
 * the one regeneration attempt.
 * @returns The assembled system prompt, always beginning with
 * {@link SAFETY_PREAMBLE}.
 */
export function buildTurnSystemPrompt({
  persona,
  meters,
  topic,
  side,
  stance,
  reinforceSafety = false,
}: TurnSystemPromptInput): string {
  const sections = [
    SAFETY_PREAMBLE,
    buildRoleInstruction(side),
    `The proposition: ${topic.statement}\n${STANCE_INSTRUCTIONS[stance]}`,
    compilePersonaPrompt(persona, meters),
    reinforceSafety ? SAFETY_REMINDER : '',
  ];

  return sections.filter((section) => section.length > 0).join('\n\n');
}
