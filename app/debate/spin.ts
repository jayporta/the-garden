/**
 * The slot machine's randomisation.
 *
 * `spin` decides all three reel results up front, before any animation runs;
 * the reels then ease to a stop that is already known. Keeping the draw pure and
 * frame-independent is what makes it testable.
 *
 * The pool arrives pre-filtered — `spin` does not know what a cooldown is.
 * Deciding *which* models are eligible is policy and lives in `cooldowns.ts`;
 * drawing from whatever survives is mechanism and lives here.
 */

import { DEBATE_TOPICS, type DebateTopicId } from './topics';
import { FREE_MODELS, type FreeModelEntry, type FreeModelId } from './models';

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
 * Whether there is anything left to spin.
 *
 * One model is enough — it faces itself. Only an empty pool has no draw.
 *
 * @param pool - The models still available.
 * @returns `true` if {@link spin} would return a result rather than `null`.
 */
function canSpin(pool: readonly FreeModelEntry[]): boolean {
  return pool.length > 0;
}

/**
 * Spins all three reels over the whole model registry.
 *
 * @param rng - Source of randomness, returning a value in `[0, 1)`. Injectable
 * so tests can pin the outcome; defaults to `Math.random`.
 * @returns The model, topic and model the three reels land on. Never `null`:
 * {@link FREE_MODELS} is a literal tuple, so it cannot be empty.
 */
export function spin(rng?: () => number): SpinResult;
/**
 * Spins all three reels over the models the cooldowns have left available.
 *
 * @param rng - Source of randomness, returning a value in `[0, 1)`.
 * @param pool - The models the outer reels may land on, pre-filtered by
 * `availableModels`.
 * @returns The model, topic and model the three reels land on, or `null` if
 * `pool` is empty. `null` rather than a throw because an exhausted pool is the
 * exact runtime state this feature exists to represent, unlike `getModel`,
 * where a bad id genuinely is a bug.
 */
export function spin(
  rng: () => number,
  pool: readonly FreeModelEntry[],
): SpinResult | null;
/**
 * Draws in reel order — left model, topic, right model — so a scripted rng maps
 * predictably onto the three results, and always draws exactly three times so
 * the mapping does not shift with the pool size.
 *
 * Topics never cool down, so the topic reel always draws from all of
 * {@link DEBATE_TOPICS}.
 *
 * @param rng - Source of randomness, returning a value in `[0, 1)`.
 * @param pool - The models the outer reels may land on.
 * @returns Where the three reels rest, or `null` if `pool` is empty.
 */
export function spin(
  rng: () => number = Math.random,
  // Non-empty by construction — `FREE_MODELS` is a literal tuple — which is
  // what lets the no-pool overload above promise a non-null result.
  pool: readonly FreeModelEntry[] = FREE_MODELS,
): SpinResult | null {
  if (!canSpin(pool)) {
    return null;
  }

  const leftIndex = pickIndex(pool.length, rng);
  const topicIndex = pickIndex(DEBATE_TOPICS.length, rng);

  // The right reel draws from the models *minus* the left one, then shifts past
  // it, so the two sides can never be the same model. Excluding up front always
  // terminates in a single draw, where re-rolling until the two differ has no
  // upper bound on how many draws it takes.
  //
  // A pool of one has nothing to exclude, and `pickIndex(0, rng)` would return
  // -1 and index off the front of the array. That model faces itself instead —
  // the mirror match — and the draw is still spent so the rng sequence a caller
  // scripts means the same thing at every pool size.
  let rightIndex = leftIndex;
  if (pool.length > 1) {
    rightIndex = pickIndex(pool.length - 1, rng);
    if (rightIndex >= leftIndex) {
      rightIndex++;
    }
  } else {
    rng();
  }

  return {
    leftModelId: pool[leftIndex].id,
    topicId: DEBATE_TOPICS[topicIndex].id,
    rightModelId: pool[rightIndex].id,
  };
}
