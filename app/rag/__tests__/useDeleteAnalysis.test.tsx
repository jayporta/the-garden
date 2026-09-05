// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { cleanup, renderHook, waitFor } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { createQueryClient } from '@/app/lib/queryClient';
import { useAnalyses } from '@/app/rag/useAnalyses';
import { useDeleteAnalysis } from '@/app/rag/useDeleteAnalysis';

const FIRST = {
  id: '1',
  inputText: 'first',
  status: 'completed',
  createdAt: '2027-01-15T09:00:00.000Z',
};
const SECOND = { ...FIRST, id: '2', inputText: 'second' };

/** Wraps hooks in the app's query client, with retries off. */
function testWrapper() {
  const client = createQueryClient();
  const defaults = client.getDefaultOptions();
  client.setDefaultOptions({
    ...defaults,
    queries: { ...defaults.queries, retry: false },
  });

  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
  };
}

/** Answers each request from `responses` in order. */
function testStubFetchSequence(responses: [unknown, number][]) {
  let index = 0;
  // Typed like `fetch` itself, so assertions can read back the url and init
  // the code under test actually passed.
  const impl = vi.fn(async (url: string, init?: RequestInit) => {
    void url;
    void init;
    const [body, status] = responses[Math.min(index++, responses.length - 1)];
    return new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    });
  });
  vi.stubGlobal('fetch', impl);
  return impl;
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('useDeleteAnalysis', () => {
  it('refreshes the list from the server once a delete succeeds', async () => {
    testStubFetchSequence([
      [[FIRST, SECOND], 200],
      [{ success: true }, 200],
      [[SECOND], 200],
    ]);
    const wrapper = testWrapper();

    const { result } = renderHook(
      () => ({ list: useAnalyses(), remove: useDeleteAnalysis() }),
      { wrapper },
    );

    await waitFor(() => expect(result.current.list.data).toHaveLength(2));

    result.current.remove.mutate('1');

    // The deleted row leaves because the server was asked again, not because
    // it was spliced out of local state.
    await waitFor(() => expect(result.current.list.data).toEqual([SECOND]));
  });

  it('surfaces a failed delete and leaves the list alone', async () => {
    testStubFetchSequence([
      [[FIRST, SECOND], 200],
      [{ error: 'Failed to delete analysis' }, 500],
    ]);
    const wrapper = testWrapper();

    const { result } = renderHook(
      () => ({ list: useAnalyses(), remove: useDeleteAnalysis() }),
      { wrapper },
    );

    await waitFor(() => expect(result.current.list.data).toHaveLength(2));

    result.current.remove.mutate('1');

    await waitFor(() => expect(result.current.remove.isError).toBe(true));
    expect(result.current.list.data).toEqual([FIRST, SECOND]);
  });
});
