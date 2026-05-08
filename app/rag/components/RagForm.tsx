"use client";
import { useState } from "react";
import { SubmitButton } from "@/app/components/SubmitButton";

export default function RagForm() {
  const [dragging, setDragging] = useState(false);
  const [files, setFiles] = useState<FileList | null>(null);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      setFiles(files);
    }
  };

  const handleRemove = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    setFiles(null);
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex gap-4">
        <textarea
          name="entry"
          placeholder="Paste a link or text here"
          className="aspect-square border rounded-md text-black flex-1"
        />
        <div className="aspect-square flex-1 border rounded-md">
          {!dragging && files?.length ? (
            <button
              className="flex-1 justify-center items-center bg-green-100 h-full w-full"
              onClick={handleRemove}
            >
              Remove
            </button>
          ) : (
            <div
              className={`h-full ${
                dragging
                  ? "border-dashed border-blue-500 bg-blue-50"
                  : "border-gray-300"
              }`}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
            >
              <input
                // ref={fileInputRef}
                id="file"
                type="file"
                name="file"
                accept=".pdf"
                className="hidden"
              />
              <label className="h-full" htmlFor="file">
                Drop file here
              </label>
            </div>
          )}
        </div>
      </div>
      <SubmitButton theme="primary" />
    </div>
  );
}
