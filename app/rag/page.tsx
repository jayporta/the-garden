import RagForm from "@/app/rag/components/RagForm";

export default function Page() {
  return (
    <div>
      Retrieval-Augmented Generation (light)
      <form
        action={async (formData: FormData) => {
          "use server";
          // Logic to handle links, PDFs, or text snippets
          const entry = formData.get("entry");
          console.log(entry);
        }}
        className="flex flex-col gap-4 mt-4"
      >
        <RagForm />
      </form>
    </div>
  );
}
