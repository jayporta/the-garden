import { QueryClient } from '@tanstack/react-query';

/**
 * Builds the app's TanStack Query client.
 *
 * A factory rather than a module-level singleton: on the server a shared client
 * would leak one request's cache into the next, and each test wants a cache of
 * its own.
 *
 * @returns A client carrying this app's defaults.
 */
export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // Off by default. TanStack refetches on window focus out of the box,
        // which suits a dashboard backed by a free database — but every query
        // here ends at a metered upstream, so alt-tabbing back to the page
        // would spend real quota to redraw an unchanged list. A query that
        // genuinely tracks live state turns it back on for itself with
        // `refetchOnWindowFocus: true`.
        refetchOnWindowFocus: false,
        // Three retries against a route that has already logged its failure
        // turns one server error into four. One is enough to ride out a
        // dropped connection.
        retry: 1,
      },
    },
  });
}
