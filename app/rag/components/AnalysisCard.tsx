import type { Analysis } from '@/app/rag/analysesApi';

/** Tailwind classes for each `Request.status`, falling back to the pending look. */
const STATUS_STYLES: Record<string, string> = {
  completed: 'bg-green-100 text-green-800',
  failed: 'bg-red-100 text-red-800',
};

/**
 * One past analysis: its input, where it came from, and its summary.
 *
 * Presentational only. It is handed a delete callback rather than owning the
 * mutation, so the list can show a single failure message for whichever row
 * failed instead of each card carrying its own copy.
 *
 * Takes the row to show as `analysis`, a callback that receives its id when
 * Delete is pressed as `onDelete`, and whether that delete is in flight as
 * `isDeleting`.
 */
export default function AnalysisCard({
  analysis,
  onDelete,
  isDeleting,
}: {
  analysis: Analysis;
  onDelete: (id: string) => void;
  isDeleting: boolean;
}) {
  return (
    <div className="border rounded-lg p-4 shadow-sm bg-white">
      <div className="flex justify-between items-start mb-2">
        <div className="text-sm text-gray-600">
          {new Date(analysis.createdAt).toLocaleString()}
        </div>
        <div className="flex items-center gap-2">
          <div
            className={`px-2 py-1 rounded text-xs font-medium ${
              STATUS_STYLES[analysis.status] ?? 'bg-yellow-100 text-yellow-800'
            }`}
          >
            {analysis.status}
          </div>
          <button
            onClick={() => onDelete(analysis.id)}
            disabled={isDeleting}
            className="px-3 py-1 bg-red-600 text-white text-xs rounded hover:bg-red-700 disabled:opacity-50"
          >
            {isDeleting ? 'Deleting...' : 'Delete'}
          </button>
        </div>
      </div>

      <div className="mb-3">
        <h3 className="font-semibold text-lg mb-1">Input</h3>
        <p className="text-gray-800">{analysis.inputText}</p>
        {analysis.source && (
          <div className="mt-2 text-sm text-gray-600">
            Source: {analysis.source.type}
            {analysis.source.url && (
              <span>
                {' '}
                -{' '}
                <a
                  href={analysis.source.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 underline"
                >
                  {analysis.source.url}
                </a>
              </span>
            )}
            {analysis.source.filename && (
              <span> - {analysis.source.filename}</span>
            )}
          </div>
        )}
      </div>

      {analysis.summary?.text && (
        <div>
          <h3 className="font-semibold text-lg mb-1">Summary</h3>
          <p className="text-gray-800 whitespace-pre-wrap">
            {analysis.summary.text}
          </p>
          {analysis.summary.insights && (
            <div className="mt-2">
              <h4 className="font-medium">Insights</h4>
              <p className="text-gray-700">{analysis.summary.insights}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
