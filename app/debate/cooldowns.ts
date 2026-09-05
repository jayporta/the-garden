/**
 * Which contestants are currently out of turns.
 *
 * Every model here runs on a free tier with a low ceiling, so hitting a rate
 * limit is a certainty rather than an edge case. A cooled model stays on the
 * reel — it is drawn unlit — but is filtered out of the pool before the spin,
 * so the debate never starts against a contestant that will 429 on turn one.
 *
 * Nothing in this file knows about Prisma or HTTP: it takes a plain map, a
 * clock reading, and answers questions. Recording an observation is the
 * server's job (`app/api/debate/*`), and reading vendor headers is
 * `rateLimitHeaders.ts`. This module is only the policy in between.
 */

import { FREE_MODELS, type FreeModel, type FreeModelEntry } from './models';

/**
 * Every cooldown currently in force, as expiry instants.
 *
 * Keyed by {@link FreeModelId} and {@link ModelGateway} respectively, but typed
 * as plain `string` keys: the map arrives over the wire from a database table
 * that outlives any given registry, so a row for a model since dropped from
 * `FREE_MODELS` must be inert rather than a type error.
 *
 * `until` is epoch milliseconds rather than a `Date` so it survives JSON with
 * no revive step, and so `now` is a plain number in every test. `DateTime` in
 * Postgres, `number` on the wire.
 */
export type CooldownMap = {
  readonly models: Readonly<Record<string, number>>;
  readonly gateways: Readonly<Record<string, number>>;
};

/**
 * Nothing is cooling.
 *
 * Also the fail-open value when the cooldown fetch errors: a DB blip must not
 * brick the app by reporting every contestant as spent. The cost of being wrong
 * this way is one request that 429s and immediately records the truth.
 */
export const NO_COOLDOWNS: CooldownMap = { models: {}, gateways: {} };

/**
 * The body of `GET /api/debate/cooldowns`.
 *
 * Lives here rather than beside the route so the client can type its fetch
 * without importing a module that pulls in `pg`.
 */
export type CooldownsResponse = {
  readonly cooldowns: CooldownMap;
  /**
   * The server's clock when it answered, epoch ms.
   *
   * The client compares this against its own `Date.now()` once and carries the
   * offset. Without it, a user whose laptop clock is ten minutes fast would see
   * every cooldown as already expired and spend the quota proving otherwise.
   */
  readonly serverNow: number;
};

/**
 * The instant a model becomes usable again.
 *
 * Composed as the **later** of the model's own cooldown and its gateway's, not
 * last-write and not gateway-overrides, because either can legitimately be the
 * longer one: OpenRouter's daily reset may be six hours out while one model's
 * `retry-after` is twenty seconds, and a single model may be throttled for a day
 * while its gateway is only briefly capped per-minute. A gateway cooldown is a
 * floor under every model it serves, and never shortens a model's own.
 *
 * @param model - The model to resolve an expiry for.
 * @param cooldowns - Every cooldown in force.
 * @returns Epoch ms, or `0` when neither the model nor its gateway is listed.
 */
function cooldownUntil(model: FreeModel, cooldowns: CooldownMap): number {
  return Math.max(
    cooldowns.models[model.id] ?? 0,
    cooldowns.gateways[model.gateway] ?? 0,
  );
}

/**
 * Whether a model can be asked for a turn right now.
 *
 * The boundary is `until > now` is cooling, `until === now` is available — so
 * the moment a timer fires on an expiry, the model it was waiting for is
 * already usable.
 *
 * @param model - The model to test.
 * @param cooldowns - Every cooldown in force.
 * @param now - The current time as epoch ms. Injected rather than read from
 * `Date.now()` so status is a pure function of its inputs.
 * @returns `true` if neither the model nor its gateway is still cooling.
 */
export function isModelAvailable(
  model: FreeModel,
  cooldowns: CooldownMap,
  now: number,
): boolean {
  return cooldownUntil(model, cooldowns) <= now;
}

/**
 * The pool a spin may draw from.
 *
 * Registry order is preserved because the reel is ordered: a model must not
 * move to a different face just because another one cooled.
 *
 * @param cooldowns - Every cooldown in force.
 * @param now - The current time as epoch ms.
 * @returns The available subset of {@link FREE_MODELS}, possibly empty.
 */
export function availableModels(
  cooldowns: CooldownMap,
  now: number,
): readonly FreeModelEntry[] {
  return FREE_MODELS.filter((model) => isModelAvailable(model, cooldowns, now));
}
