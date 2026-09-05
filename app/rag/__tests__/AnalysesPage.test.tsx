// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { createQueryClient } from '@/app/lib/queryClient';
import AnalysesPage from '@/app/rag/analyses/page';

const ROW = {
  id: '1',
  inputText: 'Explain the Garden',
  status: 'completed',
  createdAt: '2027-01-15T09:00:00.000Z',
  summary: { text: 'A playground app.' },
};

/** Renders the page under a fresh query client with retries off. */
function testRenderPage() {
  const client = createQueryClient();
  const defaults = client.getDefaultOptions();
  client.setDefaultOptions({
    ...defaults,
    queries: { ...defaults.queries, retry: false },
  });

  return render(
    <QueryClientProvider client={client}>
      <AnalysesPage />
    </QueryClientProvider>,
  );
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

describe('AnalysesPage', () => {
  it('lists the analyses once they load', async () => {
    testStubFetchSequence([[[ROW], 200]]);

    testRenderPage();

    expect(screen.getByText(/loading analyses/i)).toBeTruthy();
    await waitFor(() =>
      expect(screen.getByText('Explain the Garden')).toBeTruthy(),
    );
    expect(screen.getByText('A playground app.')).toBeTruthy();
  });

  it('says so when there is nothing to show', async () => {
    testStubFetchSequence([[[], 200]]);

    testRenderPage();

    await waitFor(() => expect(screen.getByText(/no analyses/i)).toBeTruthy());
  });

  it('shows the failure instead of an empty list when the fetch breaks', async () => {
    testStubFetchSequence([[{ error: 'Failed to fetch analyses' }, 500]]);

    testRenderPage();

    // The "no analyses found" copy would be a lie here.
    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy());
    expect(screen.queryByText(/no analyses/i)).toBeNull();
  });

  it('deletes a row and refetches the list', async () => {
    vi.stubGlobal('confirm', () => true);
    const impl = testStubFetchSequence([
      [[ROW], 200],
      [{ success: true }, 200],
      [[], 200],
    ]);

    testRenderPage();
    await waitFor(() =>
      expect(screen.getByText('Explain the Garden')).toBeTruthy(),
    );

    screen.getByRole('button', { name: /delete/i }).click();

    await waitFor(() => expect(screen.getByText(/no analyses/i)).toBeTruthy());
    expect(impl.mock.calls[1][1]?.method).toBe('DELETE');
    // Three calls, not two: the list is re-read from the server rather than
    // spliced locally, so a delete that half-failed cannot leave the UI lying.
    await waitFor(() => expect(impl).toHaveBeenCalledTimes(3));
    expect(impl.mock.calls[2][1]?.method).toBeUndefined();
  });

  it('does not call the endpoint when the confirmation is declined', async () => {
    vi.stubGlobal('confirm', () => false);
    const impl = testStubFetchSequence([[[ROW], 200]]);

    testRenderPage();
    await waitFor(() =>
      expect(screen.getByText('Explain the Garden')).toBeTruthy(),
    );

    screen.getByRole('button', { name: /delete/i }).click();

    await waitFor(() => expect(impl).toHaveBeenCalledOnce());
  });

  it('reports a failed delete in the page rather than a browser alert', async () => {
    vi.stubGlobal('confirm', () => true);
    testStubFetchSequence([
      [[ROW], 200],
      [{ error: 'Failed to delete analysis' }, 500],
    ]);

    testRenderPage();
    await waitFor(() =>
      expect(screen.getByText('Explain the Garden')).toBeTruthy(),
    );

    screen.getByRole('button', { name: /delete/i }).click();

    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toMatch(/500/),
    );
    // The row is still listed, because the server still has it.
    expect(screen.getByText('Explain the Garden')).toBeTruthy();
  });
});
