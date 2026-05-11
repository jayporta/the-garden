import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the AI SDK
vi.mock("ai", () => ({
  streamText: vi.fn(),
  convertToModelMessages: vi.fn(),
}));

vi.mock("@ai-sdk/openai", () => ({
  createOpenAI: vi.fn(),
  openai: vi.fn(),
}));

// Mock PrismaClient
const mockCreate = vi.fn();
const mockUpdate = vi.fn();

vi.mock("@/app/generated/prisma/client", () => ({
  PrismaClient: vi.fn().mockImplementation(() => ({
    source: {
      create: mockCreate,
    },
    request: {
      create: mockCreate,
      update: mockUpdate,
    },
    summary: {
      create: mockCreate,
    },
  })),
}));

vi.mock("@prisma/adapter-pg", () => ({
  PrismaPg: vi.fn(),
}));

vi.mock("pg", () => ({
  Pool: vi.fn(),
}));

// Mock fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe("/api/chat", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should handle URL input and create database records", async () => {
    // Mock fetch response for URL content
    mockFetch.mockResolvedValue({
      ok: true,
      text: () => Promise.resolve("<html><body>Test content</body></html>"),
    });

    // Mock AI stream
    const mockStream = {
      toDataStreamResponse: vi
        .fn()
        .mockReturnValue(new Response("streamed response")),
    };
    const { streamText } = await import("ai");
    (streamText as any).mockResolvedValue(mockStream);

    // Mock database operations
    mockCreate.mockResolvedValue({ id: "source-id" });
    mockUpdate.mockResolvedValue({ id: "request-id" });

    const { POST } = await import("@/app/api/chat/route");

    const request = new Request("http://localhost/api/chat", {
      method: "POST",
      body: JSON.stringify({
        messages: [{ role: "user", content: "Analyze https://example.com" }],
      }),
      headers: { "Content-Type": "application/json" },
    });

    const response = await POST(request);

    expect(response.status).toBe(200);
    expect(mockFetch).toHaveBeenCalledWith("https://example.com");
    expect(mockCreate).toHaveBeenCalled(); // Source created
    expect(mockUpdate).toHaveBeenCalled(); // Request updated
  });

  it("should handle non-URL input", async () => {
    const mockStream = {
      toDataStreamResponse: vi
        .fn()
        .mockReturnValue(new Response("streamed response")),
    };
    const { streamText } = await import("ai");
    (streamText as any).mockResolvedValue(mockStream);

    mockCreate.mockResolvedValue({ id: "request-id" });

    const { POST } = await import("@/app/api/chat/route");

    const request = new Request("http://localhost/api/chat", {
      method: "POST",
      body: JSON.stringify({
        messages: [{ role: "user", content: "Analyze this text directly" }],
      }),
      headers: { "Content-Type": "application/json" },
    });

    const response = await POST(request);

    expect(response.status).toBe(200);
    expect(mockFetch).not.toHaveBeenCalled();
    expect(mockCreate).toHaveBeenCalled();
  });

  it("should handle errors gracefully", async () => {
    mockFetch.mockRejectedValue(new Error("Network error"));

    const { POST } = await import("@/app/api/chat/route");

    const request = new Request("http://localhost/api/chat", {
      method: "POST",
      body: JSON.stringify({
        messages: [{ role: "user", content: "Analyze https://example.com" }],
      }),
      headers: { "Content-Type": "application/json" },
    });

    const response = await POST(request);
    const result = await response.json();

    expect(response.status).toBe(500);
    expect(result.error).toBeDefined();
  });
});
