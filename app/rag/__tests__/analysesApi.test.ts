import { describe, it, expect } from 'vitest';
import {
  deleteAnalysis,
  fetchAnalyses,
  type Analysis,
} from '@/app/rag/analysesApi';

const VALID: Analysis = {
  id: '1',
  inputText: 'Test analysis',
  status: 'completed',
  createdAt: '2027-01-15T09:00:00.000Z',
};

/** A `fetch` stand-in that answers once with `body` at `status`. */
function testFetch(body: unknown, status = 200) {
  const calls: [string, RequestInit | undefined][] = [];
  const impl = async (url: string, init?: RequestInit) => {
    calls.push([url, init]);
    return new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    });
  };
  return { impl, calls };
}

describe('fetchAnalyses', () => {
  it('returns the rows the endpoint sent', async () => {
    const { impl, calls } = testFetch([VALID]);

    expect(await fetchAnalyses(impl)).toEqual([VALID]);
    expect(calls[0][0]).toBe('/api/rag/analyses');
  });

  it('throws on a non-OK response rather than yielding an empty list', async () => {
    const { impl } = testFetch({ error: 'Failed to fetch analyses' }, 500);

    await expect(fetchAnalyses(impl)).rejects.toThrow(/500/);
  });

  it('rejects a payload that is not an array', async () => {
    const { impl } = testFetch({ analyses: [] });

    await expect(fetchAnalyses(impl)).rejects.toThrow(/unexpected/i);
  });

  it('rejects a row missing the fields the list renders', async () => {
    const { impl } = testFetch([{ id: '1' }]);

    await expect(fetchAnalyses(impl)).rejects.toThrow(/unexpected/i);
  });

  it('accepts the nulls a nullable Prisma column serialises to', async () => {
    // Guarded by `tsc`, not by this run: the shape below fails to typecheck
    // unless `Analysis` admits `null`, while at runtime the payload passes
    // either way. It is written as a test so the shape is stated somewhere
    // executable, but `npx tsc --noEmit` is what actually enforces it.
    const withNulls: Analysis = {
      ...VALID,
      source: { type: 'pdf', url: null, filename: 'report.pdf' },
      summary: { text: 'a summary', insights: null },
    };
    const { impl } = testFetch([withNulls, { ...VALID, source: null }]);

    expect(await fetchAnalyses(impl)).toHaveLength(2);
  });

  it('accepts a row carrying an optional source and summary', async () => {
    const withRelations: Analysis = {
      ...VALID,
      source: { type: 'url', url: 'https://example.com' },
      summary: { text: 'a summary' },
    };
    const { impl } = testFetch([withRelations]);

    expect(await fetchAnalyses(impl)).toEqual([withRelations]);
  });
});

describe('deleteAnalysis', () => {
  it('sends the id as a DELETE body', async () => {
    const { impl, calls } = testFetch({ success: true });

    await deleteAnalysis('abc', impl);

    const [url, init] = calls[0];
    expect(url).toBe('/api/rag/analyses');
    expect(init?.method).toBe('DELETE');
    expect(JSON.parse(String(init?.body))).toEqual({ id: 'abc' });
  });

  it('throws on a non-OK response, so the row is not dropped from the list', async () => {
    const { impl } = testFetch({ error: 'Failed to delete analysis' }, 500);

    await expect(deleteAnalysis('abc', impl)).rejects.toThrow(/500/);
  });
});
