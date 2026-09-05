'use client';

import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import {
  ANALYSES_QUERY_KEY,
  fetchAnalyses,
  type Analysis,
} from './analysesApi';

/**
 * Subscribes to the list of past analyses.
 *
 * @returns The query state: `data` once loaded, `isPending` while in flight,
 * and `error` if the request or its payload was rejected. An empty list and a
 * failed request are distinguishable, which is the point of not defaulting
 * `data` to `[]`.
 */
export function useAnalyses(): UseQueryResult<Analysis[], Error> {
  return useQuery({
    queryKey: ANALYSES_QUERY_KEY,
    // Wrapped rather than passed by reference: TanStack calls `queryFn` with a
    // context object, which `fetchAnalyses` would take as its transport.
    queryFn: () => fetchAnalyses(),
  });
}
