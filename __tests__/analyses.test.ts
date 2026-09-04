import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock PrismaClient
const mockFindMany = vi.fn();
const mockDeleteMany = vi.fn();
const mockDelete = vi.fn();

vi.mock('@/app/generated/prisma/client', () => ({
  PrismaClient: vi.fn().mockImplementation(function () {
    return {
      request: {
        findMany: mockFindMany,
        delete: mockDelete,
      },
      summary: {
        deleteMany: mockDeleteMany,
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

describe('/api/rag/analyses', () => {
  let GET: typeof import('@/app/api/rag/analyses/route').GET;
  let DELETE: typeof import('@/app/api/rag/analyses/route').DELETE;

  beforeEach(async () => {
    vi.clearAllMocks();
    ({ GET, DELETE } = await import('@/app/api/rag/analyses/route'));
  });

  describe('GET', () => {
    it('should return analyses with success', async () => {
      const mockAnalyses = [
        {
          id: '1',
          inputText: 'Test analysis',
          status: 'completed',
          createdAt: new Date(),
          source: { type: 'url', url: 'https://example.com' },
          summary: { text: 'Summary text', insights: 'Insights' },
        },
      ];

      mockFindMany.mockResolvedValue(mockAnalyses);

      const response = await GET();
      const result = await response.json();

      expect(response.status).toBe(200);
      // Response.json() serializes Date fields to ISO strings.
      expect(result).toEqual([
        {
          ...mockAnalyses[0],
          createdAt: mockAnalyses[0].createdAt.toISOString(),
        },
      ]);
      expect(mockFindMany).toHaveBeenCalledWith({
        include: {
          source: true,
          summary: true,
        },
        orderBy: {
          createdAt: 'desc',
        },
      });
    });

    it('should handle database errors', async () => {
      mockFindMany.mockRejectedValue(new Error('Database error'));

      const response = await GET();
      const result = await response.json();

      expect(response.status).toBe(500);
      expect(result).toEqual({ error: 'Failed to fetch analyses' });
    });
  });

  describe('DELETE', () => {
    it('should delete analysis successfully', async () => {
      const request = new Request('http://localhost/api/rag/analyses', {
        method: 'DELETE',
        body: JSON.stringify({ id: 'test-id' }),
        headers: { 'Content-Type': 'application/json' },
      });

      mockDeleteMany.mockResolvedValue({ count: 1 });
      mockDelete.mockResolvedValue({ id: 'test-id' });

      const response = await DELETE(request);
      const result = await response.json();

      expect(response.status).toBe(200);
      expect(result).toEqual({ success: true });
      expect(mockDeleteMany).toHaveBeenCalledWith({
        where: { requestId: 'test-id' },
      });
      expect(mockDelete).toHaveBeenCalledWith({
        where: { id: 'test-id' },
      });
    });

    it('should return error for missing id', async () => {
      const request = new Request('http://localhost/api/rag/analyses', {
        method: 'DELETE',
        body: JSON.stringify({}),
        headers: { 'Content-Type': 'application/json' },
      });

      const response = await DELETE(request);
      const result = await response.json();

      expect(response.status).toBe(400);
      expect(result).toEqual({ error: 'Analysis ID is required' });
    });

    it('should handle delete errors', async () => {
      const request = new Request('http://localhost/api/rag/analyses', {
        method: 'DELETE',
        body: JSON.stringify({ id: 'test-id' }),
        headers: { 'Content-Type': 'application/json' },
      });

      mockDeleteMany.mockRejectedValue(new Error('Delete failed'));

      const response = await DELETE(request);
      const result = await response.json();

      expect(response.status).toBe(500);
      expect(result).toEqual({ error: 'Failed to delete analysis' });
    });
  });
});
