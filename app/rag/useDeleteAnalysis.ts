'use client';

import {
  useMutation,
  useQueryClient,
  type UseMutationResult,
} from '@tanstack/react-query';
import { ANALYSES_QUERY_KEY, deleteAnalysis } from './analysesApi';

/**
 * Deletes one analysis, then refetches the list.
 *
 * Invalidating rather than splicing the row out of the cache: the server is the
 * single source of truth for what still exists, and a delete that half-failed
 * server-side would otherwise leave the UI confidently wrong until a reload.
 *
 * @returns The mutation, whose `mutate` takes the id of the row to delete.
 */
export function useDeleteAnalysis(): UseMutationResult<void, Error, string> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => deleteAnalysis(id),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ANALYSES_QUERY_KEY }),
  });
}
