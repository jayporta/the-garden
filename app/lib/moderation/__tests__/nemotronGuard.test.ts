import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screenWithNemotron } from '@/app/lib/moderation/nemotronGuard';
import type { FetchImpl } from '@/app/lib/moderation/fetchImpl';

/** A chat-completions body carrying the given assistant message content. */
function chatBody(content: string) {
  return { choices: [{ message: { content } }] };
}

/** A `fetch` stub returning `body` with the given status. */
function stubFetch(body: unknown, status = 200) {
  return vi.fn<FetchImpl>(
    async () => new Response(JSON.stringify(body), { status }),
  );
}

const TEXT = 'Some generated debate turn.';

describe('screenWithNemotron', () => {
  beforeEach(() => {
    vi.stubEnv('OPENROUTER_API_KEY', 'sk-or-v1-test-key');
    vi.stubEnv('OPENROUTER_GUARD_MODEL', undefined);
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('returns safe for a safe verdict', async () => {
    const fetchImpl = stubFetch(chatBody('Response Safety: safe'));
    const verdict = await screenWithNemotron(TEXT, fetchImpl);
    expect(verdict).toEqual({ safe: true });
  });

  it('returns an unsafe verdict with deduplicated, lowercased categories', async () => {
    const fetchImpl = stubFetch(
      chatBody(
        'Response Safety: unsafe\nSafety Categories: Hate, HATE, Harassment',
      ),
    );
    const verdict = await screenWithNemotron(TEXT, fetchImpl);
    expect(verdict).toEqual({
      safe: false,
      categories: ['hate', 'harassment'],
      source: 'nemotron',
    });
  });

  it.each([
    ['reordered lines', 'Safety Categories: violence\nResponse Safety: unsafe'],
    [
      'extra and blank lines',
      'User Safety: safe\n\nResponse Safety: unsafe\n\nSafety Categories: violence\n',
    ],
    [
      'CRLF line endings',
      'Response Safety: unsafe\r\nSafety Categories: violence\r\n',
    ],
    [
      'varied casing of the label and the verdict word',
      'response SAFETY: UNSAFE\nsafety categories: violence',
    ],
  ])('parses despite %s', async (_label, content) => {
    const fetchImpl = stubFetch(chatBody(content));
    const verdict = await screenWithNemotron(TEXT, fetchImpl);
    expect(verdict.safe).toBe(false);
    if (!verdict.safe) {
      expect(verdict.categories).toEqual(['violence']);
      expect(verdict.source).toBe('nemotron');
    }
  });

  it('strips a <think> reasoning block before parsing the answer', async () => {
    const fetchImpl = stubFetch(
      chatBody(
        '<think>Weighing whether this turn is hazardous...</think>Response Safety: safe',
      ),
    );
    const verdict = await screenWithNemotron(TEXT, fetchImpl);
    expect(verdict).toEqual({ safe: true });
  });

  it('sends the expected request shape and reads only the Response Safety line', async () => {
    const fetchImpl = stubFetch(chatBody('Response Safety: safe'));
    await screenWithNemotron(TEXT, fetchImpl);

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe('https://openrouter.ai/api/v1/chat/completions');
    expect((init!.headers as Record<string, string>).Authorization).toBe(
      'Bearer sk-or-v1-test-key',
    );

    const body = JSON.parse(init!.body as string);
    expect(body.model).toBe('nvidia/nemotron-3.5-content-safety:free');
    expect(body.temperature).toBe(0);
    expect(body.reasoning).toEqual({ enabled: false });
    expect(body.messages).toEqual([
      { role: 'user', content: 'Give your next turn in the debate.' },
      { role: 'assistant', content: TEXT },
    ]);
  });

  it('OPENROUTER_GUARD_MODEL overrides the default model id', async () => {
    vi.stubEnv('OPENROUTER_GUARD_MODEL', 'nvidia/custom-guard');
    const fetchImpl = stubFetch(chatBody('Response Safety: safe'));
    await screenWithNemotron(TEXT, fetchImpl);
    const [, init] = fetchImpl.mock.calls[0];
    expect(JSON.parse(init!.body as string).model).toBe('nvidia/custom-guard');
  });

  it('ignores an unsafe User Safety line when Response Safety says safe', async () => {
    const fetchImpl = stubFetch(
      chatBody('User Safety: unsafe\nResponse Safety: safe'),
    );
    const verdict = await screenWithNemotron(TEXT, fetchImpl);
    expect(verdict).toEqual({ safe: true });
  });

  it('returns safe and makes no request when OPENROUTER_API_KEY is unset', async () => {
    vi.stubEnv('OPENROUTER_API_KEY', '');
    const fetchImpl = stubFetch(chatBody('Response Safety: safe'));
    const verdict = await screenWithNemotron(TEXT, fetchImpl);
    expect(verdict).toEqual({ safe: true });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('fails open to safe on a non-ok response, and logs it', async () => {
    const fetchImpl = stubFetch({ error: 'nope' }, 500);
    const verdict = await screenWithNemotron(TEXT, fetchImpl);
    expect(verdict).toEqual({ safe: true });
    expect(console.error).toHaveBeenCalled();
  });

  it('fails open to safe when fetch throws, and logs it', async () => {
    const fetchImpl = vi.fn<FetchImpl>(async () => {
      throw new Error('network down');
    });
    const verdict = await screenWithNemotron(TEXT, fetchImpl);
    expect(verdict).toEqual({ safe: true });
    expect(console.error).toHaveBeenCalled();
  });

  it('blocks as unreadable when the body carries no choices', async () => {
    const fetchImpl = stubFetch({});
    const verdict = await screenWithNemotron(TEXT, fetchImpl);
    expect(verdict).toEqual({
      safe: false,
      categories: ['unreadable answer'],
      source: 'nemotron',
    });
    expect(console.error).toHaveBeenCalled();
  });

  it('blocks as unreadable on prose with no Response Safety line', async () => {
    const fetchImpl = stubFetch(
      chatBody('I think this turn is probably fine, hard to say for sure.'),
    );
    const verdict = await screenWithNemotron(TEXT, fetchImpl);
    expect(verdict).toEqual({
      safe: false,
      categories: ['unreadable answer'],
      source: 'nemotron',
    });
    expect(console.error).toHaveBeenCalled();
  });

  it('blocks as unreadable when the answer is empty', async () => {
    const fetchImpl = stubFetch(chatBody(''));
    const verdict = await screenWithNemotron(TEXT, fetchImpl);
    expect(verdict).toEqual({
      safe: false,
      categories: ['unreadable answer'],
      source: 'nemotron',
    });
    expect(console.error).toHaveBeenCalled();
  });

  it('blocks an unsafe verdict with no categories line, naming the tier itself', async () => {
    const fetchImpl = stubFetch(chatBody('Response Safety: unsafe'));
    const verdict = await screenWithNemotron(TEXT, fetchImpl);
    expect(verdict).toEqual({
      safe: false,
      categories: ['unsafe'],
      source: 'nemotron',
    });
  });
});
