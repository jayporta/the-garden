import { logError } from '@/app/api/logError';
import { prisma } from '@/app/api/prismaClient';

/**
 * The body every failed analysis returns, whatever actually went wrong.
 *
 * Fixed on purpose. The errors reaching this path carry `DATABASE_URL` from
 * `pg` and Prisma, or a vendor key echoed back inside an upstream 401, so the
 * redacted log is the only place allowed to record the cause.
 */
const FAILURE_MESSAGE = 'Failed to analyze input';

/**
 * Logs a failed analysis, marks its `Request` failed, and builds the 500.
 *
 * Marking the row is best-effort: what failed is often the database itself, so
 * a throw from the update is logged and swallowed rather than allowed to
 * displace the response the caller is owed.
 *
 * @param context - Where the failure happened, passed through to `logError`.
 * @param error - Whatever was caught.
 * @param requestId - The `Request` to mark failed, when one was created before
 * the throw. Omitted when the failure came first, leaving nothing to mark.
 * @returns A 500 whose body carries no detail of the cause.
 */
export async function failRequest(
  context: string,
  error: unknown,
  requestId?: string,
): Promise<Response> {
  logError(context, error);

  if (requestId) {
    try {
      await prisma.request.update({
        where: { id: requestId },
        data: { status: 'failed' },
      });
    } catch (updateError) {
      logError(`${context} (marking request failed)`, updateError);
    }
  }

  return new Response(JSON.stringify({ error: FAILURE_MESSAGE }), {
    status: 500,
    headers: { 'content-type': 'application/json' },
  });
}
