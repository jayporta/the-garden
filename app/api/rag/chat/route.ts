import {
  convertToModelMessages,
  isFileUIPart,
  isTextUIPart,
  streamText,
  type FileUIPart,
  type UIMessage,
} from 'ai';
import { createOpenAI, openai as defaultOpenAI } from '@ai-sdk/openai';
import { PrismaClient } from '@/app/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

const prisma = new PrismaClient({
  adapter: new PrismaPg(
    new Pool({ connectionString: process.env.DATABASE_URL }),
  ),
});

/**
 * Checks whether a string is an absolute http(s) URL.
 * @param value - The string to test.
 * @returns `true` if `value` parses as an `http:`/`https:` URL.
 */
const isUrl = (value: string) => {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
};

/**
 * Finds the most recent user-authored message in a chat history.
 * @param messages - The full message history from the request body.
 */
const getLastUserMessage = (messages: UIMessage[]) =>
  [...messages].reverse().find((message) => message.role === 'user');

/**
 * Concatenates the text parts of a message into a single trimmed string.
 * @param message - The message to read text from, if any.
 */
const getMessageText = (message: UIMessage | undefined) =>
  (message?.parts ?? [])
    .filter(isTextUIPart)
    .map((part) => part.text)
    .join(' ')
    .trim();

/**
 * Returns the first uploaded file attached to a message, if any.
 * @param message - The message to read file parts from, if any.
 */
const getMessageFile = (message: UIMessage | undefined) =>
  (message?.parts ?? []).find(isFileUIPart);

/**
 * Maps an uploaded file's IANA media type to a `Source.type` value.
 * @param file - The uploaded file part.
 */
const sourceTypeForFile = (file: FileUIPart) => {
  if (file.mediaType === 'application/pdf') return 'pdf';
  if (file.mediaType.startsWith('image/')) return 'image';
  return 'text';
};

/**
 * Analyzes a submitted URL, file, or block of text.
 *
 * Persists a `Source` (for URLs and uploads) and a `Request`, streams a
 * completion from OpenAI, then saves the `Summary` and flips the request to
 * `completed`/`failed`.
 * @param req - Request whose JSON body holds the AI SDK `messages` array.
 * @returns A UI message stream response, or a 500 error payload.
 */
export async function POST(req: Request) {
  const body = await req.json();
  const messages: UIMessage[] = Array.isArray(body.messages)
    ? body.messages
    : [];
  const lastUserMessage = getLastUserMessage(messages);
  const userText = getMessageText(lastUserMessage);
  const userFile = getMessageFile(lastUserMessage);

  // Create or connect a Source for URL or uploaded-file submissions.
  let sourceId: string | undefined;
  if (isUrl(userText)) {
    const source = await prisma.source.upsert({
      where: { url: userText },
      update: { createdAt: new Date() },
      create: {
        type: 'url',
        url: userText,
      },
    });
    sourceId = source.id;
  } else if (userFile) {
    const source = await prisma.source.create({
      data: {
        type: sourceTypeForFile(userFile),
        filename: userFile.filename,
        rawText: userFile.url,
      },
    });
    sourceId = source.id;
  }

  // Create request (createdAt is stamped automatically via the schema default)
  const request = await prisma.request.create({
    data: {
      inputText: userText,
      sourceId,
    },
  });

  const systemInstructions = [
    `
    You are a document analysis assistant. Do not behave like a casual chat bot.
    Always read the user's submission and provide a concise summary, key findings, and an analytical perspective.
    - For plain text, summarize the key points, tone, and any useful actions or insights.
    - For URLs, summarize the linked page using the page content fetched from the URL.
    - For PDF or image attachments, base your response on the attached content and summarize what was read.
    - Keep the response focused on analysis, not on small talk.
    `,
  ];

  if (isUrl(userText)) {
    systemInstructions.push(
      `The user supplied a URL. Visit the URL and summarize what is on the page ${userText}`,
    );
  }

  const modelMessages = await convertToModelMessages(messages);

  const provider = process.env.OPENAI_API_KEY
    ? createOpenAI({ apiKey: process.env.OPENAI_API_KEY })
    : defaultOpenAI;

  let summaryText = '';
  let errorMessage: string | undefined;

  try {
    const result = streamText({
      model: provider(process.env.OPENAI_MODEL ?? 'gpt-4o-mini'),
      system: systemInstructions.join('\n\n'),
      messages: modelMessages,
      maxRetries: 0,
    });

    // Collect the full response text
    const reader = result.fullStream.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value.type === 'text-delta' && value.text) {
        summaryText += value.text;
      }
    }

    // Save summary
    await prisma.summary.create({
      data: {
        requestId: request.id,
        text: summaryText,
      },
    });

    // Update request status
    await prisma.request.update({
      where: { id: request.id },
      data: { status: 'completed' },
    });

    return result.toUIMessageStreamResponse();
  } catch (error) {
    errorMessage = error instanceof Error ? error.message : 'Unknown error';

    // Update request status to failed
    await prisma.request.update({
      where: { id: request.id },
      data: { status: 'failed' },
    });

    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { 'content-type': 'application/json' },
    });
  }
}
