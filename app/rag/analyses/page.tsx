'use client';

import AnalysisCard from '@/app/rag/components/AnalysisCard';
import { useAnalyses } from '@/app/rag/useAnalyses';
import { useDeleteAnalysis } from '@/app/rag/useDeleteAnalysis';

/**
 * Lists every past analysis and lets one be deleted.
 *
 * All the data handling lives in {@link useAnalyses} and
 * {@link useDeleteAnalysis}; what is left here is which of the four states the
 * list can be in gets rendered.
 */
export default function AnalysesPage() {
  const { data: analyses, isPending, error } = useAnalyses();
  const remove = useDeleteAnalysis();

  /**
   * Asks before deleting, then hands the row to the mutation.
   * @param id - The analysis to delete.
   */
  const requestDelete = (id: string) => {
    if (!confirm('Are you sure you want to delete this analysis?')) {
      return;
    }
    remove.mutate(id);
  };

  if (isPending) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-lg">Loading analyses...</div>
      </div>
    );
  }

  // Kept distinct from the empty list below. Telling someone they have no
  // analyses when the server is down is a different, wrong answer.
  if (error) {
    return (
      <div
        role="alert"
        className="flex items-center justify-center min-h-screen"
      >
        <div className="text-red-600">
          We could not load your analyses. {error.message}
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6">
      <h1 className="text-3xl font-bold mb-6">Past Analyses</h1>

      {remove.error && (
        <div
          role="alert"
          className="mb-4 rounded border border-red-300 bg-red-50 p-3 text-red-700"
        >
          We could not delete that analysis, so it is still in the list.{' '}
          {remove.error.message}
        </div>
      )}

      {analyses.length === 0 ? (
        <div className="text-gray-500">No analyses found.</div>
      ) : (
        <div className="space-y-6">
          {analyses.map((analysis) => (
            <AnalysisCard
              key={analysis.id}
              analysis={analysis}
              onDelete={requestDelete}
              isDeleting={remove.isPending && remove.variables === analysis.id}
            />
          ))}
        </div>
      )}
    </div>
  );
}
