/**
 * The one place a server-side failure gets written down.
 *
 * Route handlers cannot rethrow — they owe the caller a response — so a `catch`
 * here is the end of the line for an error rather than a waypoint. Without a
 * log at that point the failure is gone: the client sees a generic 500 and
 * nothing anywhere records what actually broke.
 */

/**
 * Patterns that must never reach a log, with what to replace them by.
 *
 * Both are things this app genuinely holds, not hypotheticals. `pg` and Prisma
 * put the connection string into their error messages, and `DATABASE_URL`
 * carries a password; an OpenAI key can arrive inside an upstream 401 body.
 */
const REDACTIONS: readonly (readonly [RegExp, string])[] = [
  // The `user:password@` half of any URL, whatever the scheme.
  [/(:\/\/[^:/@\s]+:)[^@\s]+@/g, '$1***@'],
  // OpenAI-style keys, which are self-identifying by prefix.
  [/\bsk-[A-Za-z0-9_-]{8,}/g, 'sk-***'],
];

/**
 * Removes anything secret from text bound for a log.
 *
 * @param text - The text to sanitise.
 * @returns `text` with every known secret shape replaced by a placeholder.
 */
function redact(text: string): string {
  return REDACTIONS.reduce(
    (result, [pattern, replacement]) => result.replace(pattern, replacement),
    text,
  );
}

/**
 * Records a failure that has been handled and will not be rethrown.
 *
 * @param context - Where the failure happened, specific enough to find without
 * a stack — a route and method, say (`'GET /api/debate/cooldowns'`).
 * @param error - Whatever was caught. Typed `unknown` because a `catch` binding
 * is not necessarily an `Error`; a non-`Error` throw is reported rather than
 * dropped.
 */
export function logError(context: string, error: unknown): void {
  // The stack already opens with the message, so it is the whole story when
  // there is one. Anything else has to be stringified to say anything at all.
  const detail =
    error instanceof Error ? (error.stack ?? error.message) : String(error);

  console.error(`[${context}] ${redact(detail)}`);
}
