'use client';

import { QueryClientProvider } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { createQueryClient } from '@/app/lib/queryClient';

/**
 * Puts a TanStack Query client in scope for every client component below it.
 *
 * The client is built in a lazy `useState` initialiser rather than at module
 * scope. A module-scope client would be created once per server process and
 * shared by every user's request; building it in the render body instead would
 * throw the cache away on each re-render. `useState` gives exactly one client
 * per mounted tree.
 *
 * Takes the tree that may use queries and mutations as its `children`.
 */
export default function QueryProvider({ children }: { children: ReactNode }) {
  const [queryClient] = useState(createQueryClient);

  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}
