import { describe, it, expect, vi, afterEach } from 'vitest';
import { logError } from '@/app/api/logError';

/** Captures `console.error` for one test, returning the arguments it received. */
function testCaptureConsoleError() {
  return vi.spyOn(console, 'error').mockImplementation(() => {});
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('logError', () => {
  it('writes the context and the error message to console.error', () => {
    const spy = testCaptureConsoleError();

    logError('GET /api/debate/cooldowns', new Error('connection refused'));

    expect(spy).toHaveBeenCalledOnce();
    const line = spy.mock.calls[0].join(' ');
    expect(line).toContain('GET /api/debate/cooldowns');
    expect(line).toContain('connection refused');
  });

  it('keeps the stack, so a thrown error stays traceable', () => {
    const spy = testCaptureConsoleError();
    const error = new Error('boom');

    logError('ctx', error);

    expect(spy.mock.calls[0].join(' ')).toContain(error.stack);
  });

  it('reports a non-Error throw rather than swallowing it', () => {
    const spy = testCaptureConsoleError();

    logError('ctx', 'a bare string was thrown');

    expect(spy.mock.calls[0].join(' ')).toContain('a bare string was thrown');
  });

  it('redacts the password out of a connection string', () => {
    const spy = testCaptureConsoleError();

    logError(
      'ctx',
      new Error(
        'failed to connect to postgresql://garden:hunter2@db.example.com:5432/garden',
      ),
    );

    const line = spy.mock.calls[0].join(' ');
    expect(line).not.toContain('hunter2');
    expect(line).toContain(
      'postgresql://garden:***@db.example.com:5432/garden',
    );
  });

  it('redacts a whole password containing the @ that delimits it', () => {
    const spy = testCaptureConsoleError();

    logError(
      'ctx',
      new Error(
        'failed to connect to postgresql://garden:hunt@er2@db.example.com:5432/garden',
      ),
    );

    const line = spy.mock.calls[0].join(' ');
    // Stopping at the first `@` would leave `er2` behind.
    expect(line).not.toContain('hunt');
    expect(line).not.toContain('er2');
    expect(line).toContain(
      'postgresql://garden:***@db.example.com:5432/garden',
    );
  });

  it('redacts an API key that rode along in a message', () => {
    const spy = testCaptureConsoleError();

    logError('ctx', new Error('401 from key sk-abcd1234efgh5678ijkl'));

    const line = spy.mock.calls[0].join(' ');
    expect(line).not.toContain('sk-abcd1234efgh5678ijkl');
    expect(line).toContain('sk-***');
  });

  it('redacts an OpenRouter key, which shares the OpenAI prefix', () => {
    const spy = testCaptureConsoleError();

    logError('ctx', new Error('401 from key sk-or-v1-abcd1234efgh5678'));

    const line = spy.mock.calls[0].join(' ');
    expect(line).not.toContain('abcd1234efgh5678');
    expect(line).toContain('sk-***');
  });

  it('redacts a Google key, whose prefix the OpenAI pattern does not reach', () => {
    const spy = testCaptureConsoleError();

    logError('ctx', new Error('403 from key AIzaSyAbCdEf0123456789xyz'));

    const line = spy.mock.calls[0].join(' ');
    expect(line).not.toContain('AIzaSyAbCdEf0123456789xyz');
    expect(line).toContain('AIza***');
  });

  it('redacts a Google key issued with the newer dotted prefix', () => {
    const spy = testCaptureConsoleError();

    logError(
      'ctx',
      new Error('403 from key AQ.Ab8RN6J_0cD1eF2gH3iJ4kL5mN6oP7qR8sT9uV0wX1yZ'),
    );

    const line = spy.mock.calls[0].join(' ');
    expect(line).not.toContain('Ab8RN6J_0cD1eF2gH3iJ4kL5mN6oP7qR8sT9uV0wX1yZ');
    expect(line).toContain('AQ.***');
  });

  it('redacts every vendor key present in one message', () => {
    const spy = testCaptureConsoleError();

    logError(
      'ctx',
      new Error('sk-abcd1234efgh5678ijkl then AIzaSyAbCdEf0123456789'),
    );

    const line = spy.mock.calls[0].join(' ');
    expect(line).not.toContain('abcd1234efgh5678ijkl');
    expect(line).not.toContain('AIzaSyAbCdEf0123456789');
    expect(line).toContain('sk-***');
    expect(line).toContain('AIza***');
  });

  it('leaves an ordinary message untouched', () => {
    const spy = testCaptureConsoleError();

    logError('ctx', new Error('Analysis ID is required'));

    expect(spy.mock.calls[0].join(' ')).toContain('Analysis ID is required');
  });
});
