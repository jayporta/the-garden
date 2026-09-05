import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockFindMany = vi.fn();

vi.mock('@/app/generated/prisma/client', () => ({
  PrismaClient: vi.fn().mockImplementation(function () {
    return {
      debateCooldown: {
        findMany: mockFindMany,
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

describe('/api/debate/cooldowns', () => {
  let GET: typeof import('@/app/api/debate/cooldowns/route').GET;

  beforeEach(async () => {
    vi.clearAllMocks();
    ({ GET } = await import('@/app/api/debate/cooldowns/route'));
  });

  it('groups rows into the model and gateway maps', async () => {
    const until = new Date('2027-01-15T09:00:00.000Z');
    mockFindMany.mockResolvedValue([
      { scope: 'model', target: 'gpt-oss-120b', until },
      { scope: 'gateway', target: 'openrouter', until },
    ]);

    const body = await (await GET()).json();

    expect(body.cooldowns).toEqual({
      models: { 'gpt-oss-120b': until.getTime() },
      gateways: { openrouter: until.getTime() },
    });
  });

  it('reports expiry as epoch ms, so the client needs no revive step', async () => {
    const until = new Date('2027-01-15T09:00:00.000Z');
    mockFindMany.mockResolvedValue([
      { scope: 'model', target: 'gpt-oss-120b', until },
    ]);

    const body = await (await GET()).json();

    expect(body.cooldowns.models['gpt-oss-120b']).toBe(1_800_003_600_000);
  });

  it('drops expired rows at the database rather than in memory', async () => {
    mockFindMany.mockResolvedValue([]);

    await GET();

    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { until: { gt: expect.any(Date) } },
      }),
    );
  });

  it('returns empty maps when nothing is cooling', async () => {
    mockFindMany.mockResolvedValue([]);

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.cooldowns).toEqual({ models: {}, gateways: {} });
  });

  it('reports its own clock, so the client can correct for skew', async () => {
    mockFindMany.mockResolvedValue([]);
    const before = Date.now();

    const body = await (await GET()).json();

    expect(body.serverNow).toBeGreaterThanOrEqual(before);
    expect(body.serverNow).toBeLessThanOrEqual(Date.now());
  });

  it('ignores a row whose scope is neither model nor gateway', async () => {
    mockFindMany.mockResolvedValue([
      { scope: 'planet', target: 'jupiter', until: new Date() },
    ]);

    const body = await (await GET()).json();

    expect(body.cooldowns).toEqual({ models: {}, gateways: {} });
  });

  it('returns 500 when the query fails', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockFindMany.mockRejectedValue(new Error('connection refused'));

    const response = await GET();

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      error: 'Failed to fetch cooldowns',
    });
    logged.mockRestore();
  });

  it('records why the query failed, rather than swallowing it', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockFindMany.mockRejectedValue(new Error('connection refused'));

    await GET();

    // The client is told only 'Failed to fetch cooldowns', so this log is the
    // single place the real cause survives.
    expect(logged).toHaveBeenCalledOnce();
    expect(logged.mock.calls[0].join(' ')).toContain('connection refused');
    logged.mockRestore();
  });
});
