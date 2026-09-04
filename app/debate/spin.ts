/**
 * The slot machine's randomisation.
 *
 * `spin` decides all three reel results up front, before any animation runs;
 * the reels then ease to a stop that is already known. Keeping the draw pure and
 * frame-independent is what makes it testable.
 */

import { DEBATE_TOPICS, type DebateTopicId } from './topics';
import { FREE_MODELS, type FreeModelId } from './models';

/** Where the three reels come to rest. */
export type SpinResult = {
  readonly leftModelId: FreeModelId;
  readonly topicId: DebateTopicId;
  readonly rightModelId: FreeModelId;
};

/**
 * Chooses an index in `[0, length)` from one rng draw.
 *
 * @param length - How many faces the reel has.
 * @param rng - Source of randomness, returning a value in `[0, 1)`.
 * @returns The chosen index, clamped so an rng that returns exactly 1 cannot
 * run off the end of the reel.
 */
function pickIndex(length: number, rng: () => number): number {
  return Math.min(Math.floor(rng() * length), length - 1);
}

/**
 * Spins all three reels.
 *
 * Draws in reel order — left model, topic, right model — so a scripted rng maps
 * predictably onto the three results.
 *
 * @param rng - Source of randomness, returning a value in `[0, 1)`. Injectable
 * so tests can pin the outcome; defaults to `Math.random`.
 * @returns The model, topic and model the three reels land on.
 */
export function spin(rng: () => number = Math.random): SpinResult {
  const leftIndex = pickIndex(FREE_MODELS.length, rng);
  const topicIndex = pickIndex(DEBATE_TOPICS.length, rng);

  // The right reel draws from the models *minus* the left one, then shifts past
  // it, so the two sides can never be the same model. Excluding up front always
  // terminates in a single draw, where re-rolling until the two differ has no
  // upper bound on how many draws it takes.
  let rightIndex = pickIndex(FREE_MODELS.length - 1, rng);
  if (rightIndex >= leftIndex) {
    rightIndex++;
  }

  return {
    leftModelId: FREE_MODELS[leftIndex].id,
    topicId: DEBATE_TOPICS[topicIndex].id,
    rightModelId: FREE_MODELS[rightIndex].id,
  };
}
