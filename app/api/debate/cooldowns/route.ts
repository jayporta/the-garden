import { logError } from '@/app/api/logError';
import { prisma } from '@/app/api/prismaClient';
import type { CooldownsResponse } from '@/app/debate/cooldowns';

/**
 * Reports every rate limit currently in force.
 *
 * The only cooldown endpoint, and deliberately read-only. A client-writable
 * cooldown would be a one-request denial of service against the app's own quota
 * state, and it contradicts the reactive trigger: a cooldown is a fact a vendor
 * stated, not a claim a client can make. Writes happen inside the turn route,
 * where the vendor's response is in hand.
 *
 * Route handlers are uncached by default in Next 16 and Cache Components is
 * off, so no `dynamic` export is needed here; the client still fetches with
 * `cache: 'no-store'`.
 *
 * @returns `{ cooldowns, serverNow }`, or a 500 error payload.
 */
export async function GET() {
  try {
    const now = new Date();
    const rows = await prisma.debateCooldown.findMany({
      // Expired rows are dropped here rather than in memory: the client should
      // never have to reason about a row that has already lapsed.
      where: { until: { gt: now } },
      select: { scope: true, target: true, until: true },
    });

    const models: Record<string, number> = {};
    const gateways: Record<string, number> = {};

    for (const row of rows) {
      // Matched explicitly, so a row written by a future version of this app
      // with a scope this one does not know about is inert rather than
      // silently filed under models.
      if (row.scope === 'model') {
        models[row.target] = row.until.getTime();
      } else if (row.scope === 'gateway') {
        gateways[row.target] = row.until.getTime();
      }
    }

    return Response.json({
      cooldowns: { models, gateways },
      serverNow: now.getTime(),
    } satisfies CooldownsResponse);
  } catch (error) {
    // The caller gets a generic message on purpose — a client can do nothing
    // with a Postgres error — so the log is the only record of the cause.
    logError('GET /api/debate/cooldowns', error);
    return Response.json(
      { error: 'Failed to fetch cooldowns' },
      { status: 500 },
    );
  }
}
