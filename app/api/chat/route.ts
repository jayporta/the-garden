import { convertToModelMessages, streamText } from "ai";
import { createOpenAI, openai as defaultOpenAI } from "@ai-sdk/openai";
import { PrismaClient } from "@/app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

const prisma = new PrismaClient({
  adapter: new PrismaPg(
    new Pool({ connectionString: process.env.DATABASE_URL }),
  ),
});

const isUrl = (value: string) => {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
};

const getLastUserText = (messages: any[]) => {
  const lastUserMessage = [...messages]
    .reverse()
    .find((message) => message.role === "user");
  if (!lastUserMessage || !Array.isArray(lastUserMessage.parts)) {
    return "";
  }

  return lastUserMessage.parts
    .filter(
      (part: any) => part.type === "text" && typeof part.text === "string",
    )
    .map((part: any) => part.text)
    .join(" ")
    .trim();
};

export async function POST(req: Request) {
  const body = await req.json();
  const messages = Array.isArray(body.messages) ? body.messages : [];
  const userText = getLastUserText(messages);

  // Create or connect source if URL
  let sourceId: string | undefined;
  if (isUrl(userText)) {
    const source = await prisma.source.upsert({
      where: { url: userText, id: crypto.randomUUID() },
      update: { createdAt: new Date() },
      create: {
        type: "url",
        url: userText,
      },
    });
    sourceId = source.id;
  }

  // Create request
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

  let summaryText = "";
  let errorMessage: string | undefined;

  try {
    const result = streamText({
      model: provider(process.env.OPENAI_MODEL ?? "gpt-4o-mini"),
      system: systemInstructions.join("\n\n"),
      messages: modelMessages,
      maxRetries: 0,
    });

    // Collect the full response text
    const reader = result.fullStream.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value.type === "text-delta" && value.text) {
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
      data: { status: "completed" },
    });

    return result.toUIMessageStreamResponse();
  } catch (error) {
    errorMessage = error instanceof Error ? error.message : "Unknown error";

    // Update request status to failed
    await prisma.request.update({
      where: { id: request.id },
      data: { status: "failed" },
    });

    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }
}
