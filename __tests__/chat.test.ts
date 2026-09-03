import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';

// Mock the AI SDK, keeping real type guards/helpers (isTextUIPart, etc.) intact.
vi.mock('ai', async () => {
  const actual = await vi.importActual<typeof import('ai')>('ai');
  return {
    ...actual,
    streamText: vi.fn(),
    convertToModelMessages: vi.fn(),
  };
});

vi.mock('@ai-sdk/openai', () => ({
  createOpenAI: vi.fn(),
  openai: vi.fn(),
}));

// Mock PrismaClient
const mockSourceUpsert = vi.fn();
const mockSourceCreate = vi.fn();
const mockRequestCreate = vi.fn();
const mockRequestUpdate = vi.fn();
const mockSummaryCreate = vi.fn();

vi.mock('@/app/generated/prisma/client', () => ({
  PrismaClient: vi.fn().mockImplementation(function () {
    return {
      source: {
        upsert: mockSourceUpsert,
        create: mockSourceCreate,
      },
      request: {
        create: mockRequestCreate,
        update: mockRequestUpdate,
      },
      summary: {
        create: mockSummaryCreate,
      },
    };
  }),
}));

vi.mock('@prisma/adapter-pg', () => ({
  PrismaPg: vi.fn(),
}));

vi.mock('pg', () => ({
  Pool: vi.fn(),
}));

/**
 * Builds a fake `streamText` result whose `fullStream` yields a single
 * text-delta chunk, matching the shape `POST` reads via `getReader()`.
 */
const mockStreamTextResult = (text: string) => ({
  fullStream: new ReadableStream({
    start(controller) {
      controller.enqueue({ type: 'text-delta', text });
      controller.close();
    },
  }),
  toUIMessageStreamResponse: vi
    .fn()
    .mockReturnValue(new Response('streamed response')),
});

describe('/api/chat', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequestCreate.mockResolvedValue({ id: 'request-id' });
    mockRequestUpdate.mockResolvedValue({ id: 'request-id' });
    mockSummaryCreate.mockResolvedValue({ id: 'summary-id' });
  });

  it('should upsert a Source and create a Request for URL input', async () => {
    const { streamText, convertToModelMessages } = await import('ai');
    (streamText as unknown as Mock).mockReturnValue(
      mockStreamTextResult('Summary'),
    );
    (convertToModelMessages as unknown as Mock).mockResolvedValue([]);

    mockSourceUpsert.mockResolvedValue({ id: 'source-id' });

    const { POST } = await import('@/app/api/chat/route');

    const request = new Request('http://localhost/api/chat', {
      method: 'POST',
      body: JSON.stringify({
        messages: [
          {
            id: '1',
            role: 'user',
            parts: [{ type: 'text', text: 'https://example.com' }],
          },
        ],
      }),
      headers: { 'Content-Type': 'application/json' },
    });

    const response = await POST(request);

    expect(response.status).toBe(200);
    expect(mockSourceUpsert).toHaveBeenCalledWith({
      where: { url: 'https://example.com' },
      update: { createdAt: expect.any(Date) },
      create: { type: 'url', url: 'https://example.com' },
    });
    expect(mockRequestCreate).toHaveBeenCalledWith({
      data: { inputText: 'https://example.com', sourceId: 'source-id' },
    });
    expect(mockSummaryCreate).toHaveBeenCalledWith({
      data: { requestId: 'request-id', text: 'Summary' },
    });
    expect(mockRequestUpdate).toHaveBeenCalledWith({
      where: { id: 'request-id' },
      data: { status: 'completed' },
    });
  });

  it('should create a Request without a Source for plain text input', async () => {
    const { streamText, convertToModelMessages } = await import('ai');
    (streamText as unknown as Mock).mockReturnValue(
      mockStreamTextResult('Summary'),
    );
    (convertToModelMessages as unknown as Mock).mockResolvedValue([]);

    const { POST } = await import('@/app/api/chat/route');

    const request = new Request('http://localhost/api/chat', {
      method: 'POST',
      body: JSON.stringify({
        messages: [
          {
            id: '1',
            role: 'user',
            parts: [{ type: 'text', text: 'Analyze this text directly' }],
          },
        ],
      }),
      headers: { 'Content-Type': 'application/json' },
    });

    const response = await POST(request);

    expect(response.status).toBe(200);
    expect(mockSourceUpsert).not.toHaveBeenCalled();
    expect(mockSourceCreate).not.toHaveBeenCalled();
    expect(mockRequestCreate).toHaveBeenCalledWith({
      data: { inputText: 'Analyze this text directly', sourceId: undefined },
    });
  });

  it('should store an uploaded file as a Source', async () => {
    const { streamText, convertToModelMessages } = await import('ai');
    (streamText as unknown as Mock).mockReturnValue(
      mockStreamTextResult('Summary'),
    );
    (convertToModelMessages as unknown as Mock).mockResolvedValue([]);

    mockSourceCreate.mockResolvedValue({ id: 'source-id' });

    const { POST } = await import('@/app/api/chat/route');

    const request = new Request('http://localhost/api/chat', {
      method: 'POST',
      body: JSON.stringify({
        messages: [
          {
            id: '1',
            role: 'user',
            parts: [
              {
                type: 'file',
                mediaType: 'application/pdf',
                filename: 'report.pdf',
                url: 'data:application/pdf;base64,AAAA',
              },
            ],
          },
        ],
      }),
      headers: { 'Content-Type': 'application/json' },
    });

    const response = await POST(request);

    expect(response.status).toBe(200);
    expect(mockSourceCreate).toHaveBeenCalledWith({
      data: {
        type: 'pdf',
        filename: 'report.pdf',
        rawText: 'data:application/pdf;base64,AAAA',
      },
    });
    expect(mockRequestCreate).toHaveBeenCalledWith({
      data: { inputText: '', sourceId: 'source-id' },
    });
  });

  it('should mark the Request failed and return 500 on model errors', async () => {
    const { streamText, convertToModelMessages } = await import('ai');
    (streamText as unknown as Mock).mockImplementation(() => {
      throw new Error('Network error');
    });
    (convertToModelMessages as unknown as Mock).mockResolvedValue([]);

    const { POST } = await import('@/app/api/chat/route');

    const request = new Request('http://localhost/api/chat', {
      method: 'POST',
      body: JSON.stringify({
        messages: [
          {
            id: '1',
            role: 'user',
            parts: [{ type: 'text', text: 'https://example.com' }],
          },
        ],
      }),
      headers: { 'Content-Type': 'application/json' },
    });

    const response = await POST(request);
    const result = await response.json();

    expect(response.status).toBe(500);
    expect(result.error).toBe('Network error');
    expect(mockRequestUpdate).toHaveBeenCalledWith({
      where: { id: 'request-id' },
      data: { status: 'failed' },
    });
  });
});
