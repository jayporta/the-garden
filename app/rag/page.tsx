import RagForm from "@/app/rag/components/RagForm";

export default function Page() {
  return (
    <div className="flex flex-col gap-4 mt-4">
      <h1 className="text-2xl font-bold">Retrieval-Augmented Generation (light)</h1>
      <RagForm />
    </div>
  );
}
