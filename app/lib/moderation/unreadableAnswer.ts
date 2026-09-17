/**
 * The failure a screening tier must not treat as approval.
 *
 * Availability and comprehension are different failures and deserve opposite
 * handling. A vendor that cannot be reached leaves its tier absent, and the
 * tiers that did run decide — that is the fail-open posture every networked
 * tier here shares. A vendor that *answered* with something this code cannot
 * parse is not an outage: it reached a verdict and the reading of it failed.
 * Approving on that would let a changed response contract silently clear every
 * screened turn, and it is also the injection route, since screened text
 * reaches a guard model as message content and can try to talk it off-format.
 *
 * So a tier throws this, catches it separately from any other error, and
 * blocks.
 */

import type { SafetyVerdict, SafetySource } from './screen';

/** Raised when a vendor answered but the answer could not be understood. */
export class UnreadableAnswer extends Error {}

/**
 * The verdict an unreadable answer produces.
 *
 * Named by the tier that could not read its vendor, so a log or a censor
 * screen says which upstream changed shape rather than only that something did.
 *
 * @param source - The tier whose answer could not be parsed.
 * @returns An unsafe verdict attributed to that tier.
 */
export function unreadableVerdict(source: SafetySource): SafetyVerdict {
  return {
    safe: false,
    categories: ['unreadable answer'],
    source,
  };
}
