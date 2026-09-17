import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screenWithGemini } from '@/app/lib/moderation/geminiGuard';
import type { FetchImpl } from '@/app/lib/moderation/fetchImpl';

/**
 * A `generateContent` body carrying the given ratings on `promptFeedback` —
 * the field that rates the submitted text. Pass `finishReason` to also
 * include a candidate reporting it (Gemini's own one-token reply always
 * finishes on `MAX_TOKENS` at this tier's `maxOutputTokens: 1`, but any
 * non-`SAFETY` reason exercises the same path); omit it to build a body with
 * no `candidates` entry at all, which a screen must still be able to read.
 */
function promptRatingsBody(
  ratings: readonly { category: string; probability: string | null }[],
  finishReason?: string,
) {
  return {
    promptFeedback: { safetyRatings: ratings },
    ...(finishReason === undefined
      ? {}
      : { candidates: [{ finishReason, safetyRatings: [] }] }),
  };
}

/**
 * A `generateContent` body carrying ratings only on the first candidate's
 * `safetyRatings`.
 *
 * Candidate ratings score the reply Gemini generated, not the submitted text,
 * so a screen must not read them as a verdict on what it was asked to screen.
 */
function candidateOnlyRatingsBody(
  ratings: readonly { category: string; probability: string }[],
  finishReason = 'STOP',
) {
  return { candidates: [{ finishReason, safetyRatings: ratings }] };
}

/** A `fetch` stub returning `body` with the given status. */
function stubFetch(body: unknown, status = 200) {
  return vi.fn<FetchImpl>(
    async () => new Response(JSON.stringify(body), { status }),
  );
}

const TEXT = 'Some generated debate turn.';
const API_KEY = 'AIzaSyTestKeyForGeminiGuard1234567890';
const DEFAULT_URL =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-lite-latest:generateContent';

describe('screenWithGemini', () => {
  beforeEach(() => {
    vi.stubEnv('GEMINI_API_KEY', API_KEY);
    vi.stubEnv('GEMINI_GUARD_MODEL', undefined);
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('blocks when the ratings array is absent rather than empty', async () => {
    // Ratings come back only for categories the request named, so their absence
    // means this tier did not run, which is not the same as nothing being
    // flagged. Reading it as clean is how a screen is lost without anyone
    // noticing.
    const fetchImpl = stubFetch({ candidates: [{ finishReason: 'STOP' }] });
    await expect(screenWithGemini(TEXT, fetchImpl)).resolves.toEqual({
      safe: false,
      categories: ['unreadable answer'],
      source: 'gemini',
    });
  });

  it('accepts an empty ratings array as a judgement of clean', async () => {
    // The field came back and reported nothing, which is different from the
    // field not coming back at all.
    const fetchImpl = stubFetch(promptRatingsBody([], 'STOP'));
    await expect(screenWithGemini(TEXT, fetchImpl)).resolves.toEqual({
      safe: true,
    });
  });

  it('blocks on a probability it does not recognise', async () => {
    // Only NEGLIGIBLE and LOW pass. A severity Google adds later, or a
    // malformed value, must not read as clean by virtue of not being on a
    // blocking list.
    for (const probability of ['CRITICAL', 'VERY_HIGH', 'unknown', '']) {
      const fetchImpl = stubFetch(
        promptRatingsBody(
          [{ category: 'HARM_CATEGORY_HATE_SPEECH', probability }],
          'STOP',
        ),
      );
      const verdict = await screenWithGemini(TEXT, fetchImpl);
      expect(verdict.safe, probability).toBe(false);
    }
  });

  it('blocks on a rating whose probability is not a string at all', async () => {
    const fetchImpl = stubFetch(
      promptRatingsBody(
        [{ category: 'HARM_CATEGORY_HATE_SPEECH', probability: null }],
        'STOP',
      ),
    );
    expect((await screenWithGemini(TEXT, fetchImpl)).safe).toBe(false);
  });

  it('returns safe when every rating is NEGLIGIBLE or LOW', async () => {
    const fetchImpl = stubFetch(
      promptRatingsBody(
        [
          { category: 'HARM_CATEGORY_HATE_SPEECH', probability: 'NEGLIGIBLE' },
          { category: 'HARM_CATEGORY_HARASSMENT', probability: 'LOW' },
        ],
        'STOP',
      ),
    );
    const verdict = await screenWithGemini(TEXT, fetchImpl);
    expect(verdict).toEqual({ safe: true });
  });

  it.each(['MEDIUM', 'HIGH'])('blocks a %s rating', async (probability) => {
    const fetchImpl = stubFetch(
      promptRatingsBody(
        [{ category: 'HARM_CATEGORY_HATE_SPEECH', probability }],
        'STOP',
      ),
    );
    const verdict = await screenWithGemini(TEXT, fetchImpl);
    expect(verdict).toEqual({
      safe: false,
      categories: ['hate speech'],
      source: 'gemini',
    });
  });

  it('humanises and deduplicates category names', async () => {
    const fetchImpl = stubFetch(
      promptRatingsBody(
        [
          { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', probability: 'HIGH' },
          {
            category: 'HARM_CATEGORY_DANGEROUS_CONTENT',
            probability: 'MEDIUM',
          },
        ],
        'STOP',
      ),
    );
    const verdict = await screenWithGemini(TEXT, fetchImpl);
    expect(verdict).toEqual({
      safe: false,
      categories: ['dangerous content'],
      source: 'gemini',
    });
  });

  it('blocks on finishReason SAFETY even with an empty ratings list', async () => {
    const fetchImpl = stubFetch(promptRatingsBody([], 'SAFETY'));
    const verdict = await screenWithGemini(TEXT, fetchImpl);
    expect(verdict).toEqual({
      safe: false,
      categories: ['safety'],
      source: 'gemini',
    });
  });

  it('produces a verdict from promptFeedback ratings when candidates is absent entirely', async () => {
    // Requirement 3a: a screen must not depend on a candidate existing at all.
    const fetchImpl = stubFetch(
      promptRatingsBody([
        { category: 'HARM_CATEGORY_HATE_SPEECH', probability: 'HIGH' },
      ]),
    );
    const verdict = await screenWithGemini(TEXT, fetchImpl);
    expect(verdict).toEqual({
      safe: false,
      categories: ['hate speech'],
      source: 'gemini',
    });
  });

  it('reads prompt ratings normally when finishReason is MAX_TOKENS: clean text passes', async () => {
    // MAX_TOKENS is the ordinary finish reason at this tier's
    // `maxOutputTokens: 1` — it must not be mistaken for a safety stop.
    const fetchImpl = stubFetch(
      promptRatingsBody(
        [{ category: 'HARM_CATEGORY_HATE_SPEECH', probability: 'NEGLIGIBLE' }],
        'MAX_TOKENS',
      ),
    );
    const verdict = await screenWithGemini(TEXT, fetchImpl);
    expect(verdict).toEqual({ safe: true });
  });

  it('reads prompt ratings normally when finishReason is MAX_TOKENS: flagged text blocks', async () => {
    const fetchImpl = stubFetch(
      promptRatingsBody(
        [{ category: 'HARM_CATEGORY_HATE_SPEECH', probability: 'HIGH' }],
        'MAX_TOKENS',
      ),
    );
    const verdict = await screenWithGemini(TEXT, fetchImpl);
    expect(verdict).toEqual({
      safe: false,
      categories: ['hate speech'],
      source: 'gemini',
    });
  });

  it('does not read a rating that exists only on the candidate as the verdict', async () => {
    // Requirement 2: the candidate rates Gemini's own one-token reply, not the
    // submitted text. A HIGH rating there must not surface as a category —
    // and must not be silently read as clean either, since the tier that ran
    // produced no signal about the text it was asked to screen.
    const fetchImpl = stubFetch(
      candidateOnlyRatingsBody([
        { category: 'HARM_CATEGORY_HATE_SPEECH', probability: 'HIGH' },
      ]),
    );
    const verdict = await screenWithGemini(TEXT, fetchImpl);
    expect(verdict).toEqual({
      safe: false,
      categories: ['unreadable answer'],
      source: 'gemini',
    });
  });

  it('blocks on promptFeedback.blockReason, lowercased, without a candidate', async () => {
    const fetchImpl = stubFetch({ promptFeedback: { blockReason: 'SAFETY' } });
    const verdict = await screenWithGemini(TEXT, fetchImpl);
    expect(verdict).toEqual({
      safe: false,
      categories: ['safety'],
      source: 'gemini',
    });
  });

  it('sends the key only in the x-goog-api-key header, never in the URL', async () => {
    const fetchImpl = stubFetch(promptRatingsBody([], 'STOP'));
    await screenWithGemini(TEXT, fetchImpl);

    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe(DEFAULT_URL);
    expect(url).not.toContain('key=');
    expect(url).not.toContain(API_KEY);
    expect((init!.headers as Record<string, string>)['x-goog-api-key']).toBe(
      API_KEY,
    );
  });

  it('requests safetySettings for all four harm categories at BLOCK_LOW_AND_ABOVE', async () => {
    const fetchImpl = stubFetch(promptRatingsBody([], 'STOP'));
    await screenWithGemini(TEXT, fetchImpl);

    const [, init] = fetchImpl.mock.calls[0];
    const body = JSON.parse(init!.body as string);
    expect(body.safetySettings).toEqual([
      {
        category: 'HARM_CATEGORY_HATE_SPEECH',
        threshold: 'BLOCK_LOW_AND_ABOVE',
      },
      {
        category: 'HARM_CATEGORY_HARASSMENT',
        threshold: 'BLOCK_LOW_AND_ABOVE',
      },
      {
        category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT',
        threshold: 'BLOCK_LOW_AND_ABOVE',
      },
      {
        category: 'HARM_CATEGORY_DANGEROUS_CONTENT',
        threshold: 'BLOCK_LOW_AND_ABOVE',
      },
    ]);
  });

  it('GEMINI_GUARD_MODEL overrides the model and the generated URL', async () => {
    vi.stubEnv('GEMINI_GUARD_MODEL', 'gemini-custom-model');
    const fetchImpl = stubFetch(promptRatingsBody([], 'STOP'));
    await screenWithGemini(TEXT, fetchImpl);
    const [url] = fetchImpl.mock.calls[0];
    expect(url).toBe(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-custom-model:generateContent',
    );
  });

  it('returns safe and makes no request when GEMINI_API_KEY is unset', async () => {
    vi.stubEnv('GEMINI_API_KEY', '');
    const fetchImpl = stubFetch(promptRatingsBody([], 'STOP'));
    const verdict = await screenWithGemini(TEXT, fetchImpl);
    expect(verdict).toEqual({ safe: true });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('fails open to safe on a non-ok response, and logs it', async () => {
    const fetchImpl = stubFetch({ error: 'nope' }, 500);
    const verdict = await screenWithGemini(TEXT, fetchImpl);
    expect(verdict).toEqual({ safe: true });
    expect(console.error).toHaveBeenCalled();
  });

  it('fails open to safe when fetch throws, and logs it', async () => {
    const fetchImpl = vi.fn<FetchImpl>(async () => {
      throw new Error('network down');
    });
    const verdict = await screenWithGemini(TEXT, fetchImpl);
    expect(verdict).toEqual({ safe: true });
    expect(console.error).toHaveBeenCalled();
  });

  it('blocks as unreadable when the body has neither a candidate nor a block reason', async () => {
    const fetchImpl = stubFetch({});
    const verdict = await screenWithGemini(TEXT, fetchImpl);
    expect(verdict).toEqual({
      safe: false,
      categories: ['unreadable answer'],
      source: 'gemini',
    });
    expect(console.error).toHaveBeenCalled();
  });
});
