'use client';
import { useMemo, useState } from 'react';
import { Chat, useChat } from '@ai-sdk/react';
import { DefaultChatTransport, isTextUIPart, type UIMessage } from 'ai';
import { SubmitButton } from '@/app/rag/components/SubmitButton';

/**
 * Submission form for RAG-light: accepts pasted text, a URL, or a dropped
 * PDF/image, posts it to `/api/rag/chat`, and renders the streamed reply.
 */
export default function RagForm() {
  const [input, setInput] = useState('');
  const [dragging, setDragging] = useState(false);
  const [files, setFiles] = useState<FileList | null>(null);

  const chat = useMemo(
    () =>
      new Chat({
        transport: new DefaultChatTransport({ api: '/api/rag/chat' }),
        messages: [],
      }),
    [],
  );

  const { messages, sendMessage, status, error } = useChat({ chat });

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = e.target.files;
    if (selectedFiles && selectedFiles.length > 0) {
      setFiles(selectedFiles);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const droppedFiles = e.dataTransfer.files;
    if (droppedFiles.length > 0) {
      setFiles(droppedFiles);
    }
  };

  const handleRemove = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    setFiles(null);
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (!input.trim() && !files?.length) {
      return;
    }

    await sendMessage({
      text: input.trim(),
      files: files?.length ? files : undefined,
    });

    setInput('');
    setFiles(null);
  };

  const isLoading = status === 'submitted' || status === 'streaming';

  // `isTextUIPart` is the AI SDK's own type guard, so `part.text` narrows
  // without a cast. Joined without a separator because a message's text parts
  // are contiguous (multiple parts come from multi-step generation).
  const renderMessageText = (message: UIMessage) =>
    message.parts
      .filter(isTextUIPart)
      .map((part) => part.text)
      .join('');

  return (
    <div className="flex flex-col gap-5">
      <form onSubmit={handleSubmit} className="flex flex-col gap-5">
        <div className="flex gap-4 max-w-lg">
          <textarea
            name="entry"
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder="Paste a link or text here"
            disabled={isLoading}
            className="aspect-square border rounded-md text-black flex-1 p-3 disabled:cursor-not-allowed disabled:bg-slate-100"
          />
          <div className="aspect-square flex-1 border rounded-md p-3">
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
                    ? 'border-dashed border-blue-500 bg-blue-50'
                    : 'border-gray-300'
                }`}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
              >
                <input
                  id="file"
                  type="file"
                  name="file"
                  accept=".pdf,image/*"
                  className="hidden"
                  onChange={handleFileChange}
                />
                <label
                  className="h-full flex items-center justify-center"
                  htmlFor="file"
                >
                  {files?.length
                    ? Array.from(files)
                        .map((file) => file.name)
                        .join(', ')
                    : 'Drop file here or choose a PDF/image'}
                </label>
              </div>
            )}
          </div>
        </div>

        <SubmitButton
          theme="primary"
          disabled={isLoading}
          label={isLoading ? 'Processing...' : 'Submit'}
        />
      </form>

      {isLoading ? (
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700 flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-slate-700 animate-pulse" />
          Waiting for OpenAI response...
        </div>
      ) : null}

      <div className="space-y-4">
        {error ? (
          <div className="rounded-md border border-red-300 bg-red-50 p-4 text-sm text-red-700">
            Error: {error.message}
          </div>
        ) : null}

        {messages.map((message) => (
          <div
            key={message.id}
            className={`rounded-xl p-4 ${
              message.role === 'assistant'
                ? 'bg-blue-50 border border-blue-200'
                : 'bg-gray-100 border border-gray-200'
            }`}
          >
            <div className="text-xs font-semibold uppercase text-slate-500">
              {message.role}
            </div>
            <div className="whitespace-pre-wrap text-sm text-slate-900">
              {renderMessageText(message)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
