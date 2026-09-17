import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { moderateText } from '@/app/lib/moderation/moderateText';
import { SCREENED_PROBE } from './probeTerms';

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
const cleanBody = {
  results: [{ flagged: false, categories: { hate: false, violence: false } }],
};

/** A `fetch` stub returning `body` with the given status. */
function stubFetch(body: unknown, status = 200) {
  return vi.fn(async () => new Response(JSON.stringify(body), { status }));
}

const CLEAN_TEXT = 'Your argument assumes what it sets out to prove.';

describe('moderateText', () => {
  beforeEach(() => {
    vi.stubEnv('OPENAI_API_KEY', 'sk-test-key-for-moderation');
    // The guardrail tiers are pinned off so these cases exercise the lexicon
    // and the Moderation API alone. Without this they would pass or fail
    // depending on whether the machine running them has those keys exported.
    vi.stubEnv('OPENROUTER_API_KEY', '');
    vi.stubEnv('GEMINI_API_KEY', '');
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('returns safe when the lexicon passes and the API flags nothing', async () => {
    const fetchImpl = stubFetch(cleanBody);
    const verdict = await moderateText(CLEAN_TEXT, { fetchImpl });
    expect(verdict).toEqual({ safe: true });
  });

  it('maps flagged categories onto the verdict', async () => {
    const fetchImpl = stubFetch(flaggedBody(['hate', 'harassment']));
    const verdict = await moderateText(CLEAN_TEXT, { fetchImpl });
    expect(verdict).toEqual({
      safe: false,
      categories: ['hate', 'harassment'],
      source: 'moderation',
    });
  });

  it('reports only the categories actually set true', async () => {
    const fetchImpl = stubFetch({
      results: [{ flagged: true, categories: { hate: true, violence: false } }],
    });
    const verdict = await moderateText(CLEAN_TEXT, { fetchImpl });
    expect(verdict).toEqual({
      safe: false,
      categories: ['hate'],
      source: 'moderation',
    });
  });

  it('short-circuits on a lexicon hit without calling the API', async () => {
    const fetchImpl = stubFetch(cleanBody);
    const verdict = await moderateText(`you ${SCREENED_PROBE}`, {
      fetchImpl,
    });
    expect(verdict.safe).toBe(false);
    if (!verdict.safe) {
      expect(verdict.source).toBe('lexicon');
    }
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('posts the text to the moderation endpoint with the key and model', async () => {
    const fetchImpl = stubFetch(cleanBody);
    await moderateText(CLEAN_TEXT, { fetchImpl });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toBe('https://api.openai.com/v1/moderations');
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>).Authorization).toBe(
      'Bearer sk-test-key-for-moderation',
    );
    const body = JSON.parse(init.body as string);
    expect(body.model).toBe('omni-moderation-latest');
    expect(body.input).toBe(CLEAN_TEXT);
  });

  it('degrades to the lexicon verdict on a non-200, and logs it', async () => {
    const fetchImpl = stubFetch({ error: 'nope' }, 500);
    const verdict = await moderateText(CLEAN_TEXT, { fetchImpl });
    expect(verdict).toEqual({ safe: true });
    expect(console.error).toHaveBeenCalled();
  });

  it('degrades to the lexicon verdict when fetch throws, and logs it', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error('network down');
    });
    const verdict = await moderateText(CLEAN_TEXT, { fetchImpl });
    expect(verdict).toEqual({ safe: true });
    expect(console.error).toHaveBeenCalled();
  });

  it('degrades to the lexicon verdict on a malformed body, and logs it', async () => {
    const fetchImpl = stubFetch({ unexpected: true });
    const verdict = await moderateText(CLEAN_TEXT, { fetchImpl });
    expect(verdict).toEqual({ safe: true });
    expect(console.error).toHaveBeenCalled();
  });

  it('skips the API entirely when no key is set, without logging an error', async () => {
    vi.stubEnv('OPENAI_API_KEY', '');
    const fetchImpl = stubFetch(cleanBody);
    const verdict = await moderateText(CLEAN_TEXT, { fetchImpl });
    expect(verdict).toEqual({ safe: true });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(console.error).not.toHaveBeenCalled();
  });

  it('still catches a lexicon hit with no key, the no-key safety floor', async () => {
    vi.stubEnv('OPENAI_API_KEY', '');
    const fetchImpl = stubFetch(cleanBody);
    const verdict = await moderateText(`you ${SCREENED_PROBE}`, {
      fetchImpl,
    });
    expect(verdict.safe).toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('never leaks the API key into the log on failure', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error('failed with sk-test-key-for-moderation in the message');
    });
    await moderateText(CLEAN_TEXT, { fetchImpl });
    const logged = vi.mocked(console.error).mock.calls.flat().join(' ');
    expect(logged).not.toContain('sk-test-key-for-moderation');
    expect(logged).toContain('sk-***');
  });
});
