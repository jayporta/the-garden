import { describe, it, expect } from 'vitest';
import { FREE_MODELS, getModel, MODEL_GATEWAYS } from '@/app/debate/models';
import {
  MAX_COOLDOWN_MS,
  MIN_COOLDOWN_MS,
  observeRateLimit,
} from '@/app/debate/rateLimitHeaders';

/** 2027-01-15T08:00:00Z — a fixed instant, so UTC-midnight maths is checkable. */
const NOW = 1_800_000_000_000;
const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;

const GROQ_MODEL = getModel('gpt-oss-120b');
const GOOGLE_MODEL = getModel('gemini-2-5-flash');
const OPENROUTER_MODEL = getModel('glm-5-2');

/** Midnight UTC following `now`. */
function testNextUtcMidnight(now: number): number {
  const date = new Date(now);
  return Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate() + 1,
  );
}

describe('observeRateLimit — retry-after', () => {
  it('reads the delta-seconds form', () => {
    const observation = observeRateLimit(
      GROQ_MODEL,
      { 'retry-after': '90' },
      NOW,
    );

    expect(observation.until).toBe(NOW + 90 * SECOND);
    expect(observation.reason).toBe('retry-after');
  });

  it('reads the HTTP-date form', () => {
    const until = NOW + 2 * HOUR;
    const observation = observeRateLimit(
      GROQ_MODEL,
      { 'retry-after': new Date(until).toUTCString() },
      NOW,
    );

    // toUTCString drops sub-second precision, so compare at second resolution.
    expect(observation.until).toBe(Math.floor(until / SECOND) * SECOND);
    expect(observation.reason).toBe('retry-after');
  });

  it('takes precedence over the gateway reset header', () => {
    const observation = observeRateLimit(
      GROQ_MODEL,
      { 'retry-after': '90', 'x-ratelimit-reset-requests': '10m' },
      NOW,
    );

    expect(observation.until).toBe(NOW + 90 * SECOND);
  });

  it('is matched case-insensitively, since header casing is not guaranteed', () => {
    const observation = observeRateLimit(
      GROQ_MODEL,
      { 'Retry-After': '90' },
      NOW,
    );

    expect(observation.until).toBe(NOW + 90 * SECOND);
  });

  it('falls through to the gateway default when unparseable', () => {
    const observation = observeRateLimit(
      GROQ_MODEL,
      { 'retry-after': 'soon-ish' },
      NOW,
    );

    expect(observation.reason).toBe('gateway-default');
  });
});

describe("observeRateLimit — Groq's Go-duration reset header", () => {
  it.each([
    ['7.66s', 7660],
    // If `ms` were read as `m`, this would be 25 hours after the clamp.
    ['1500ms', 1500],
    ['2m59.56s', 2 * MINUTE + 59560],
    ['1h2m3s', HOUR + 2 * MINUTE + 3 * SECOND],
    ['0s', MIN_COOLDOWN_MS],
  ])('reads %s', (header, expectedOffset) => {
    const observation = observeRateLimit(
      GROQ_MODEL,
      { 'x-ratelimit-reset-requests': header },
      NOW,
    );

    expect(observation.until).toBe(NOW + expectedOffset);
  });

  it.each(['', '60', 'tomorrow', '1x2y', '-5s', '--5s'])(
    'falls back to the gateway default on unparseable input %o',
    (header) => {
      const observation = observeRateLimit(
        GROQ_MODEL,
        { 'x-ratelimit-reset-requests': header },
        NOW,
      );

      expect(observation.reason).toBe('gateway-default');
      expect(observation.until).toBe(NOW + MINUTE);
    },
  );
});

describe('observeRateLimit — scope is per gateway, never global', () => {
  it('takes only the model offline on Groq, whose free limits are per model', () => {
    const observation = observeRateLimit(GROQ_MODEL, {}, NOW);

    expect(observation.scope).toBe('model');
    expect(observation.target).toBe('gpt-oss-120b');
  });

  it('takes only the model offline on Google', () => {
    const observation = observeRateLimit(GOOGLE_MODEL, {}, NOW);

    expect(observation.scope).toBe('model');
    expect(observation.target).toBe('gemini-2-5-flash');
  });

  it('takes the whole gateway offline on OpenRouter, whose ceiling is account-wide', () => {
    const observation = observeRateLimit(OPENROUTER_MODEL, {}, NOW);

    expect(observation.scope).toBe('gateway');
    expect(observation.target).toBe('openrouter');
  });

  it('gives every gateway in the registry a usable policy', () => {
    const covered = new Set<string>();

    for (const model of FREE_MODELS) {
      expect(observeRateLimit(model, {}, NOW).until).toBeGreaterThan(NOW);
      covered.add(model.gateway);
    }

    expect([...covered].sort()).toEqual([...MODEL_GATEWAYS].sort());
  });
});

describe('observeRateLimit — gateway defaults', () => {
  it('waits a minute on Groq when no header says otherwise', () => {
    expect(observeRateLimit(GROQ_MODEL, {}, NOW).until).toBe(NOW + MINUTE);
  });

  it('waits a minute on Google', () => {
    expect(observeRateLimit(GOOGLE_MODEL, {}, NOW).until).toBe(NOW + MINUTE);
  });

  it('waits until the next UTC midnight on OpenRouter, whose free allowance is daily', () => {
    expect(observeRateLimit(OPENROUTER_MODEL, {}, NOW).until).toBe(
      testNextUtcMidnight(NOW),
    );
  });
});

describe("observeRateLimit — OpenRouter's epoch reset header", () => {
  it('reads a millisecond timestamp', () => {
    const until = NOW + 3 * HOUR;
    const observation = observeRateLimit(
      OPENROUTER_MODEL,
      { 'x-ratelimit-reset': String(until) },
      NOW,
    );

    expect(observation.until).toBe(until);
  });

  it('reads a second timestamp as seconds rather than as a 1970 instant', () => {
    const until = NOW + 3 * HOUR;
    const observation = observeRateLimit(
      OPENROUTER_MODEL,
      { 'x-ratelimit-reset': String(Math.floor(until / SECOND)) },
      NOW,
    );

    expect(observation.until).toBe(Math.floor(until / SECOND) * SECOND);
  });
});

describe('observeRateLimit — clamping a header we do not control', () => {
  it('never records less than a second, so a zero cannot cause a hot retry loop', () => {
    const observation = observeRateLimit(
      GROQ_MODEL,
      { 'retry-after': '0' },
      NOW,
    );

    expect(observation.until).toBe(NOW + MIN_COOLDOWN_MS);
  });

  it('never records a past instant', () => {
    const observation = observeRateLimit(
      GROQ_MODEL,
      { 'retry-after': new Date(NOW - HOUR).toUTCString() },
      NOW,
    );

    expect(observation.until).toBe(NOW + MIN_COOLDOWN_MS);
  });

  it('never records more than a day and change, so a bad header cannot brick a model', () => {
    const observation = observeRateLimit(
      GROQ_MODEL,
      { 'retry-after': '99999999' },
      NOW,
    );

    expect(observation.until).toBe(NOW + MAX_COOLDOWN_MS);
  });
});
