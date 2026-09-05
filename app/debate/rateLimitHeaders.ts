/**
 * Turning a vendor's rate-limit headers into a cooldown we can record.
 *
 * The trigger is reactive, never predictive. No vendor documents whether its
 * free ceiling is per-model or account-wide in enough detail to tally locally,
 * so any count we kept would be a guess; `retry-after` and the `x-ratelimit-*`
 * family report what actually happened. This module only reads them.
 *
 * Pure by construction — a model, a bag of headers and a clock reading in, an
 * observation out. Writing that observation to Postgres is the turn route's
 * job, and deciding what a recorded cooldown means for the reel is
 * `cooldowns.ts`.
 */

import type { FreeModel, ModelGateway } from './models';

/** Response headers, as either `fetch` or the AI SDK hands them over. */
export type RateLimitHeaders = Readonly<Record<string, string | undefined>>;

/** Whether a cooldown covers one model or every model behind a gateway. */
export type CooldownScope = 'model' | 'gateway';

/** Which header a cooldown was derived from. Mirrors `DebateCooldown.reason`. */
export type CooldownReason = 'retry-after' | 'quota-header' | 'gateway-default';

/** One rate limit, as observed — ready to be upserted as a `DebateCooldown`. */
export type CooldownObservation = {
  readonly scope: CooldownScope;
  /** A `FreeModelId` when `scope` is `model`, a `ModelGateway` when `gateway`. */
  readonly target: string;
  /** Epoch ms. Always in `[now + MIN_COOLDOWN_MS, now + MAX_COOLDOWN_MS]`. */
  readonly until: number;
  readonly reason: CooldownReason;
};

/**
 * The shortest cooldown worth recording, so a header of `0` — or a clock skewed
 * far enough that a reset looks like the past — cannot produce a hot retry loop
 * against a 50-requests-a-day budget.
 */
export const MIN_COOLDOWN_MS = 1000;

/**
 * The longest cooldown worth recording. The widest legitimate window here is
 * OpenRouter's daily reset, so anything past a day and change is a garbage or
 * hostile header, and must not be able to take a model offline for a year.
 */
export const MAX_COOLDOWN_MS = 25 * 60 * 60 * 1000;

/** How one gateway reports its limits, and what to assume when it doesn't. */
type GatewayRateLimitPolicy = {
  /**
   * Whether a refusal condemns the one model or the whole gateway.
   *
   * This is per gateway and never global. A 429 from OpenRouter most likely
   * means the account-wide free allowance is spent, so all of its models are
   * gone. Applying that same rule to Groq or Google would be wrong — their free
   * limits are per model, and a blanket rule would take Gemini 2.5 Flash Lite
   * offline because Flash hit its own separate cap.
   */
  readonly limitScope: CooldownScope;
  /** Header naming when the window resets, paired with how to read it. */
  readonly reset?: {
    readonly header: string;
    readonly format: 'go-duration' | 'epoch-timestamp';
  };
  /**
   * What to assume when no header is usable.
   * @param now - The current time as epoch ms.
   * @returns The instant to cool until, as epoch ms.
   */
  readonly defaultUntil: (now: number) => number;
};

/**
 * Midnight UTC after `now` — when OpenRouter's free daily allowance rolls over.
 * @param now - The current time as epoch ms.
 * @returns The next UTC midnight, as epoch ms.
 */
function nextUtcMidnight(now: number): number {
  const date = new Date(now);
  return Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate() + 1,
  );
}

/**
 * The per-gateway rules.
 *
 * The `Record<ModelGateway, …>` annotation is enforcement rather than
 * decoration: adding a gateway to `MODEL_GATEWAYS` fails the typecheck here
 * until its policy exists, so a new gateway cannot quietly inherit someone
 * else's limit semantics. Annotated rather than `satisfies`, because the
 * literal types `satisfies` preserves would erase the optional properties on
 * the gateways that do not set them.
 */
const GATEWAY_RATE_LIMIT_POLICY: Record<ModelGateway, GatewayRateLimitPolicy> =
  {
    groq: {
      limitScope: 'model',
      reset: { header: 'x-ratelimit-reset-requests', format: 'go-duration' },
      defaultUntil: (now) => now + 60 * 1000,
    },
    google: {
      // Google sends no rate-limit headers on the Generative Language API, so
      // every Google cooldown falls through to the default.
      limitScope: 'model',
      defaultUntil: (now) => now + 60 * 1000,
    },
    openrouter: {
      limitScope: 'gateway',
      reset: { header: 'x-ratelimit-reset', format: 'epoch-timestamp' },
      defaultUntil: nextUtcMidnight,
    },
  };

/**
 * Reads a header without trusting its casing.
 *
 * HTTP header names are case-insensitive, and these arrive as a plain object
 * from `APICallError.responseHeaders` rather than through a `Headers` instance
 * that would normalise them.
 *
 * @param headers - The response headers.
 * @param name - The lowercase header name to look for.
 * @returns The value, or `undefined` if the header is absent.
 */
function readHeader(
  headers: RateLimitHeaders,
  name: string,
): string | undefined {
  const direct = headers[name];
  if (direct !== undefined) {
    return direct;
  }

  return Object.entries(headers).find(
    ([key]) => key.toLowerCase() === name,
  )?.[1];
}

/**
 * Parses `Retry-After`, which RFC 9110 defines in two forms.
 *
 * The digits-only check must come first: `Date.parse('60')` does not fail, it
 * returns the year 2060.
 *
 * @param value - The raw header value.
 * @param now - The current time as epoch ms.
 * @returns The instant to wait until, or `null` if neither form parses.
 */
function parseRetryAfter(value: string, now: number): number | null {
  const trimmed = value.trim();

  if (/^\d+$/.test(trimmed)) {
    return now + Number(trimmed) * 1000;
  }

  const parsed = Date.parse(trimmed);
  return Number.isNaN(parsed) ? null : parsed;
}

/** Milliseconds in each unit Go's `time.Duration` can print. */
const GO_DURATION_UNIT_MS: Readonly<Record<string, number>> = {
  ns: 1e-6,
  us: 1e-3,
  µs: 1e-3,
  ms: 1,
  s: 1000,
  m: 60 * 1000,
  h: 60 * 60 * 1000,
};

/** One `<number><unit>` segment. `ms` precedes `m` so `500ms` is not `500m`. */
const GO_DURATION_SEGMENT = /(\d+(?:\.\d+)?)(ns|us|µs|ms|s|m|h)/g;

/**
 * A whole Go duration: one or more segments and nothing else.
 *
 * Go can print a negative duration, but a *reset* header never legitimately is
 * one. Rejecting the sign sends `-5s` down the ladder to the gateway default
 * rather than recording it as vendor data that happens to clamp to the floor —
 * a one-second cooldown where a minute is the safer reading.
 */
const GO_DURATION = /^(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h))+$/;

/**
 * Parses a Go `time.Duration` string, which is what Groq's reset headers are.
 *
 * They are neither numbers nor dates — `7.66s`, `2m59.56s` and `1h2m3s` are all
 * legal — so a naive `Number()` yields `NaN` and silently loses the cooldown.
 *
 * @param value - The raw header value.
 * @returns The duration in milliseconds, or `null` if it is not a Go duration.
 */
function parseGoDuration(value: string): number | null {
  const trimmed = value.trim();
  if (!GO_DURATION.test(trimmed)) {
    return null;
  }

  let total = 0;
  for (const [, amount, unit] of trimmed.matchAll(GO_DURATION_SEGMENT)) {
    total += Number(amount) * GO_DURATION_UNIT_MS[unit];
  }

  return total;
}

/**
 * Parses a Unix timestamp that may be in either seconds or milliseconds.
 *
 * OpenRouter documents `x-ratelimit-reset` as milliseconds, but the unit has
 * moved between API versions, and reading seconds as milliseconds yields a 1970
 * instant — which clamps to the floor and produces exactly the tight retry loop
 * the clamp exists to prevent. Anything below `1e12` predates 2001 as
 * milliseconds and so is far more plausibly seconds.
 *
 * @param value - The raw header value.
 * @returns The instant as epoch ms, or `null` if it is not a number.
 */
function parseEpochTimestamp(value: string): number | null {
  const trimmed = value.trim();
  if (!/^\d+$/.test(trimmed)) {
    return null;
  }

  const parsed = Number(trimmed);
  return parsed < 1e12 ? parsed * 1000 : parsed;
}

/**
 * Reads a gateway's reset header into an absolute instant.
 *
 * @param policy - The gateway's rules.
 * @param headers - The response headers.
 * @param now - The current time as epoch ms.
 * @returns The instant the window resets, or `null` if the header is absent or
 * unreadable.
 */
function readResetHeader(
  policy: GatewayRateLimitPolicy,
  headers: RateLimitHeaders,
  now: number,
): number | null {
  if (!policy.reset) {
    return null;
  }

  const raw = readHeader(headers, policy.reset.header);
  if (raw === undefined) {
    return null;
  }

  if (policy.reset.format === 'go-duration') {
    const duration = parseGoDuration(raw);
    return duration === null ? null : now + duration;
  }

  return parseEpochTimestamp(raw);
}

/**
 * Holds an instant inside the range we are willing to record.
 * @param until - The candidate instant, as epoch ms.
 * @param now - The current time as epoch ms.
 * @returns `until`, moved inside `[now + MIN_COOLDOWN_MS, now + MAX_COOLDOWN_MS]`.
 */
function clampUntil(until: number, now: number): number {
  return Math.min(
    Math.max(until, now + MIN_COOLDOWN_MS),
    now + MAX_COOLDOWN_MS,
  );
}

/**
 * Records the cooldown a 429 implies.
 *
 * Always yields an observation: the vendor refused, so *something* must be
 * recorded even when it explained nothing. The ladder is `retry-after`, then
 * the gateway's own reset header, then the gateway default.
 *
 * @param model - The model whose request was refused.
 * @param headers - The 429's response headers.
 * @param now - The current time as epoch ms.
 * @returns The cooldown to upsert.
 */
export function observeRateLimit(
  model: FreeModel,
  headers: RateLimitHeaders,
  now: number,
): CooldownObservation {
  const policy = GATEWAY_RATE_LIMIT_POLICY[model.gateway];

  const retryAfter = readHeader(headers, 'retry-after');
  const fromRetryAfter =
    retryAfter === undefined ? null : parseRetryAfter(retryAfter, now);
  const fromReset =
    fromRetryAfter === null ? readResetHeader(policy, headers, now) : null;

  const [until, reason]: [number, CooldownReason] =
    fromRetryAfter !== null
      ? [fromRetryAfter, 'retry-after']
      : fromReset !== null
        ? [fromReset, 'quota-header']
        : [policy.defaultUntil(now), 'gateway-default'];

  return {
    scope: policy.limitScope,
    target: policy.limitScope === 'gateway' ? model.gateway : model.id,
    until: clampUntil(until, now),
    reason,
  };
}
