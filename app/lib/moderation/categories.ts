/**
 * The characteristics a robot may never attack.
 *
 * {@link SAFETY_PREAMBLE} names each of them explicitly rather than gesturing
 * at "offensive language" and hoping the model shares the definition. They
 * describe what the prompt forbids; the local screen reports
 * {@link LOCAL_SCREEN_CATEGORY} instead, and the networked tiers report
 * whichever categories their own vendor returns.
 */
export const PROTECTED_CATEGORIES = [
  'race',
  'ethnicity',
  'nationality',
  'religion',
  'gender identity',
  'sexual orientation',
  'disability',
  'age',
] as const;

/** One of the characteristics in {@link PROTECTED_CATEGORIES}. */
export type ProtectedCategory = (typeof PROTECTED_CATEGORIES)[number];

/**
 * The category the local screen reports for any match.
 *
 * Not a member of {@link PROTECTED_CATEGORIES}. The local tier matches against
 * a third-party word list that covers slurs and ordinary swearing alike and
 * carries no characteristic metadata, so naming a protected characteristic here
 * would be a guess. A tier that can tell the difference says so itself.
 */
export const LOCAL_SCREEN_CATEGORY = 'screened term';
