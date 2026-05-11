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

const extractTextFromHtml = (html: string) => {
  const cleaned = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<!--.*?-->/gs, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return cleaned.slice(0, 3000);
};

const fetchPageContext = async (url: string) => {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; TheGardenBot/1.0)",
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
    });

    if (!res.ok) {
      return `Unable to retrieve the page at ${url}. HTTP status: ${res.status}`;
    }

    const html = await res.text();
    const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    const descriptionMatch = html.match(
      /<meta\s+name=["']description["']\s+content=["']([\s\S]*?)["']\s*\/?>/i,
    );
    const title = titleMatch?.[1]?.trim() ?? "(no title found)";
    const description =
      descriptionMatch?.[1]?.trim() ?? "(no description found)";
    const bodyText = extractTextFromHtml(html);

    return `Web page title: ${title}\nDescription: ${description}\nExtracted page text:\n${bodyText}`;
  } catch (error) {
    return `Unable to retrieve the page at ${url}. Error: ${error instanceof Error ? error.message : "unknown"}`;
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

  const pageContext = isUrl(userText) ? await fetchPageContext(userText) : "";

  // Create or connect source if URL
  let sourceId: string | undefined;
  if (isUrl(userText)) {
    const source = await prisma.source.upsert({
      where: { url: userText },
      update: {},
      create: {
        type: "url",
        url: userText,
        rawText: pageContext,
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

  if (pageContext) {
    systemInstructions.push(
      `The user supplied a URL. Here is the extracted web page context:\n${pageContext}`,
    );
  }

  const modelMessages = await convertToModelMessages(messages);

  const provider = process.env.OPENAI_API_KEY
    ? createOpenAI({ apiKey: process.env.OPENAI_API_KEY })
    : defaultOpenAI;

  let summaryText = "";
  let errorMessage: string | undefined;

  try {
    const result = await streamText({
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
      if (value.type === "text-delta") {
        summaryText += value.delta;
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
