import RagForm from '@/app/rag/components/RagForm';
import Link from 'next/link';

/**
 * The `/rag` route: RAG-light submission form plus a link to past analyses.
 */
export default function Page() {
  return (
    <div className="flex flex-col gap-4 mt-4">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">
          Retrieval-Augmented Generation (light)
        </h1>
        <Link
          href="/rag/analyses"
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
        >
          View Past Analyses
        </Link>
      </div>
      <RagForm />
    </div>
  );
}
