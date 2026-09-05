// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { cleanup, renderHook, waitFor } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { createQueryClient } from '@/app/lib/queryClient';
import { useAnalyses } from '@/app/rag/useAnalyses';

const ROW = {
  id: '1',
  inputText: 'Test analysis',
  status: 'completed',
  createdAt: '2027-01-15T09:00:00.000Z',
};

/**
 * Wraps a hook in the app's own query client, with retries off so a failing
 * query settles in one tick instead of waiting out a backoff.
 */
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

/** Answers every request with `body` at `status`. */
function testStubFetch(body: unknown, status = 200) {
  // Typed like `fetch` itself, so assertions can read back the url the code
  // under test actually requested.
  const impl = vi.fn(async (url: string, init?: RequestInit) => {
    void url;
    void init;
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

describe('useAnalyses', () => {
  it('exposes the rows the endpoint returned', async () => {
    testStubFetch([ROW]);

    const { result } = renderHook(() => useAnalyses(), {
      wrapper: testWrapper(),
    });

    await waitFor(() => expect(result.current.isPending).toBe(false));
    expect(result.current.data).toEqual([ROW]);
  });

  it('reports an error instead of an empty list when the endpoint fails', async () => {
    testStubFetch({ error: 'Failed to fetch analyses' }, 500);

    const { result } = renderHook(() => useAnalyses(), {
      wrapper: testWrapper(),
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    // An empty list and a broken endpoint must not render the same way.
    expect(result.current.data).toBeUndefined();
    expect(result.current.error?.message).toMatch(/500/);
  });

  it('asks the analyses endpoint for its data', async () => {
    const impl = testStubFetch([]);

    const { result } = renderHook(() => useAnalyses(), {
      wrapper: testWrapper(),
    });

    await waitFor(() => expect(result.current.isPending).toBe(false));
    expect(impl.mock.calls[0][0]).toBe('/api/rag/analyses');
  });
});
