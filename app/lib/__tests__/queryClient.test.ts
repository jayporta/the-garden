import { describe, it, expect } from 'vitest';
import { createQueryClient } from '@/app/lib/queryClient';

describe('createQueryClient', () => {
  it('does not refetch when the window regains focus', () => {
    const queries = createQueryClient().getDefaultOptions().queries;

    // Refetch-on-focus is TanStack's default and is wrong as a blanket policy
    // here: every query in this app is backed by a metered upstream, so
    // alt-tabbing would spend quota. Individual queries opt in.
    expect(queries?.refetchOnWindowFocus).toBe(false);
  });

  it('lets a single query opt back in without touching the default', () => {
    const client = createQueryClient();

    client.setQueryDefaults(['live'], { refetchOnWindowFocus: true });

    expect(client.getQueryDefaults(['live']).refetchOnWindowFocus).toBe(true);
    expect(client.getDefaultOptions().queries?.refetchOnWindowFocus).toBe(
      false,
    );
  });

  it('creates an independent client per call, so tests cannot share a cache', () => {
    expect(createQueryClient()).not.toBe(createQueryClient());
  });
});
