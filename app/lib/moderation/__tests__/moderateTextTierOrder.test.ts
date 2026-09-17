import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { moderateText } from '@/app/lib/moderation/moderateText';
import { SCREENED_PROBE } from './probeTerms';
import type { FetchImpl } from '@/app/lib/moderation/fetchImpl';

/** A moderation response body with the given categories flagged. */
function flaggedBody(categories: readonly string[]) {
  return {
    results: [
      {
        flagged: true,
        categories: Object.fromEntries(
          categories.map((category) => [category, true]),
        ),
      },
    ],
  };
}

/** A moderation response body that flags nothing. */
const CLEAN_MODERATION_BODY = {
  results: [{ flagged: false, categories: { hate: false, violence: false } }],
};

/** A safe answer from the Nemotron chat-completions endpoint. */
const NEMOTRON_SAFE_BODY = {
  choices: [{ message: { content: 'Response Safety: safe' } }],
};

/**
 * A safe answer from the Gemini generateContent endpoint.
 *
 * The verdict is read from `promptFeedback.safetyRatings` — the rating of the
 * submitted text — not from the candidate, which rates the one-token reply
 * Gemini itself generated.
 */
const GEMINI_SAFE_BODY = {
  promptFeedback: { safetyRatings: [] },
  candidates: [{ finishReason: 'STOP', safetyRatings: [] }],
};

const CLEAN_TEXT = 'Your argument assumes what it sets out to prove.';

/**
 * A `fetch` stub that routes to each vendor's default "safe" body by
 * hostname, so one stub can serve all four tiers. A body passed in
 * `overrides` replaces that vendor's default for the call.
 */
function routedFetch(
  overrides: {
    moderation?: unknown;
    nemotron?: unknown;
    gemini?: unknown;
  } = {},
) {
  return vi.fn<FetchImpl>(async (url) => {
    if (url.includes('openai.com')) {
      return new Response(
        JSON.stringify(overrides.moderation ?? CLEAN_MODERATION_BODY),
        { status: 200 },
      );
    }
    if (url.includes('openrouter.ai')) {
      return new Response(
        JSON.stringify(overrides.nemotron ?? NEMOTRON_SAFE_BODY),
        { status: 200 },
      );
    }
    if (url.includes('googleapis.com')) {
      return new Response(
        JSON.stringify(overrides.gemini ?? GEMINI_SAFE_BODY),
        { status: 200 },
      );
    }
    throw new Error(`unexpected URL: ${url}`);
  });
}

describe('moderateText: tier order and the confidential option', () => {
  beforeEach(() => {
    vi.stubEnv('OPENAI_API_KEY', 'sk-test-key-for-moderation');
    vi.stubEnv('OPENROUTER_API_KEY', 'sk-or-v1-test-key');
    vi.stubEnv('GEMINI_API_KEY', 'AIzaSyTestKeyForGeminiGuard1234567890');
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('runs all four tiers, in order, when everything passes', async () => {
    const fetchImpl = routedFetch();
    const verdict = await moderateText(CLEAN_TEXT, { fetchImpl });
    expect(verdict).toEqual({ safe: true });
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    const urls = fetchImpl.mock.calls.map(([url]) => url);
    expect(urls[0]).toContain('openai.com');
    expect(urls[1]).toContain('openrouter.ai');
    expect(urls[2]).toContain('googleapis.com');
  });

  it('short-circuits at the lexicon: zero fetch calls', async () => {
    const fetchImpl = routedFetch();
    const verdict = await moderateText(`you ${SCREENED_PROBE}`, {
      fetchImpl,
    });
    expect(verdict.safe).toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('short-circuits at the Moderation API: never reaches Nemotron or Gemini', async () => {
    const fetchImpl = routedFetch({ moderation: flaggedBody(['hate']) });
    const verdict = await moderateText(CLEAN_TEXT, { fetchImpl });
    expect(verdict.safe).toBe(false);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('short-circuits at Nemotron: never reaches Gemini', async () => {
    const fetchImpl = routedFetch({
      nemotron: {
        choices: [
          {
            message: {
              content: 'Response Safety: unsafe\nSafety Categories: violence',
            },
          },
        ],
      },
    });
    const verdict = await moderateText(CLEAN_TEXT, { fetchImpl });
    expect(verdict.safe).toBe(false);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('confidential omits the Gemini tier, while the other tiers still run', async () => {
    const fetchImpl = routedFetch();
    const verdict = await moderateText(CLEAN_TEXT, {
      fetchImpl,
      confidential: true,
    });
    expect(verdict).toEqual({ safe: true });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    const urls = fetchImpl.mock.calls.map(([url]) => url);
    expect(urls.some((url) => url.includes('googleapis.com'))).toBe(false);
  });

  it('confidential means a Gemini-only violation is not returned', async () => {
    const fetchImpl = routedFetch({
      gemini: { promptFeedback: { blockReason: 'SAFETY' } },
    });
    const verdict = await moderateText(CLEAN_TEXT, {
      fetchImpl,
      confidential: true,
    });
    expect(verdict).toEqual({ safe: true });
    const urls = fetchImpl.mock.calls.map(([url]) => url);
    expect(urls.some((url) => url.includes('googleapis.com'))).toBe(false);
  });

  it('with every key unset, the lexicon alone decides and no fetch happens', async () => {
    vi.stubEnv('OPENAI_API_KEY', '');
    vi.stubEnv('OPENROUTER_API_KEY', '');
    vi.stubEnv('GEMINI_API_KEY', '');
    const fetchImpl = routedFetch();

    const safeVerdict = await moderateText(CLEAN_TEXT, { fetchImpl });
    expect(safeVerdict).toEqual({ safe: true });
    expect(fetchImpl).not.toHaveBeenCalled();

    const unsafeVerdict = await moderateText(`you ${SCREENED_PROBE}`, {
      fetchImpl,
    });
    expect(unsafeVerdict.safe).toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
