'use client';

import { useCallback, useEffect, useState } from 'react';

interface Analysis {
  id: string;
  inputText: string;
  status: string;
  createdAt: string;
  source?: {
    type: string;
    url?: string;
    filename?: string;
  };
  summary?: {
    text: string;
    insights?: string;
  };
}

/**
 * Lists every past analysis and lets one be deleted.
 */
export default function AnalysesPage() {
  const [analyses, setAnalyses] = useState<Analysis[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Declared before the effect that calls it: React's rules-of-hooks lint
  // rejects reading a `const` binding above its declaration.
  const fetchAnalyses = useCallback(async () => {
    try {
      const res = await fetch('/api/analyses');
      if (!res.ok) throw new Error('Failed to fetch analyses');
      const data = await res.json();
      setAnalyses(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, []);

  // TODO: fetch this list in a Server Component and pass it down, keeping only
  // the delete button as a client component. That is the App Router-idiomatic
  // fix for the rule below; the effect-plus-setState pattern here predates this
  // lint config, so it is suppressed rather than silently rewritten as part of
  // a formatting change.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchAnalyses();
  }, [fetchAnalyses]);

  const deleteAnalysis = async (id: string) => {
    if (!confirm('Are you sure you want to delete this analysis?')) return;

    try {
      const res = await fetch('/api/analyses', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });

      if (!res.ok) throw new Error('Failed to delete analysis');

      // Remove from local state
      setAnalyses(analyses.filter((analysis) => analysis.id !== id));
    } catch (err) {
      alert(
        'Error deleting analysis: ' +
          (err instanceof Error ? err.message : 'Unknown error'),
      );
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-lg">Loading analyses...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-red-600">Error: {error}</div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6">
      <h1 className="text-3xl font-bold mb-6">Past Analyses</h1>

      {analyses.length === 0 ? (
        <div className="text-gray-500">No analyses found.</div>
      ) : (
        <div className="space-y-6">
          {analyses.map((analysis) => (
            <div
              key={analysis.id}
              className="border rounded-lg p-4 shadow-sm bg-white"
            >
              <div className="flex justify-between items-start mb-2">
                <div className="text-sm text-gray-600">
                  {new Date(analysis.createdAt).toLocaleString()}
                </div>
                <div className="flex items-center gap-2">
                  <div
                    className={`px-2 py-1 rounded text-xs font-medium ${
                      analysis.status === 'completed'
                        ? 'bg-green-100 text-green-800'
                        : analysis.status === 'failed'
                          ? 'bg-red-100 text-red-800'
                          : 'bg-yellow-100 text-yellow-800'
                    }`}
                  >
                    {analysis.status}
                  </div>
                  <button
                    onClick={() => deleteAnalysis(analysis.id)}
                    className="px-3 py-1 bg-red-600 text-white text-xs rounded hover:bg-red-700"
                  >
                    Delete
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

              {analysis.summary && analysis.summary.text && (
                <div>
                  <h3 className="font-semibold text-lg mb-1">Summary</h3>
                  <p className="text-gray-800 whitespace-pre-wrap">
                    {analysis.summary.text}
                  </p>
                  {analysis.summary.insights && (
                    <div className="mt-2">
                      <h4 className="font-medium">Insights</h4>
                      <p className="text-gray-700">
                        {analysis.summary.insights}
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
