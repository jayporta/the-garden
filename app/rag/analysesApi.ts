/**
 * The wire format of `/api/rag/analyses`, and the calls that read and write it.
 *
 * Kept apart from the hooks so the parsing has no React in it: what comes back
 * from the network is `unknown` until a guard says otherwise, and that check is
 * plain data-in, data-out.
 */

/**
 * One past analysis, as the list renders it.
 *
 * The optional members are typed `| null` as well as optional because that is
 * what the endpoint sends: a nullable Prisma column serialises to `null`, not
 * to an absent key, and a `Request` with no `sourceId` carries `source: null`.
 * Only the fields this app reads are listed — the route returns whole rows,
 * including a base64 `rawText` that nothing here renders.
 */
export type Analysis = {
  readonly id: string;
  readonly inputText: string;
  readonly status: string;
  /** ISO 8601, because `Date` does not survive JSON. */
  readonly createdAt: string;
  readonly source?: {
    readonly type: string;
    readonly url?: string | null;
    readonly filename?: string | null;
  } | null;
  readonly summary?: {
    readonly text: string;
    readonly insights?: string | null;
  } | null;
};

/** The cache key every analyses query and invalidation agrees on. */
export const ANALYSES_QUERY_KEY = ['rag', 'analyses'] as const;

/**
 * The subset of `fetch` these calls use, so a test can pass its own.
 *
 * A seam rather than a module mock: the calls stay real, and only the transport
 * is swapped.
 */
export type FetchImpl = (url: string, init?: RequestInit) => Promise<Response>;

/** Calls the real `fetch`, bound so it is not invoked detached from its global. */
const defaultFetch: FetchImpl = (url, init) => globalThis.fetch(url, init);

/**
 * Narrows one decoded JSON value to an {@link Analysis}.
 *
 * @param value - A value straight off the network, of no known type.
 * @returns `true` if every field the list reads is present and a string.
 */
function isAnalysis(value: unknown): value is Analysis {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const row = value as Record<string, unknown>;
  return (
    typeof row.id === 'string' &&
    typeof row.inputText === 'string' &&
    typeof row.status === 'string' &&
    typeof row.createdAt === 'string'
  );
}

/**
 * Reads a response body, failing loudly on a status or a shape we did not expect.
 *
 * @param response - The response to read.
 * @param what - What was being fetched, for the error message.
 * @returns The decoded body, still untyped.
 * @throws If the status is not OK. The message carries the status, because the
 * body of a failed route here is a generic string that says nothing.
 */
async function readJson(response: Response, what: string): Promise<unknown> {
  if (!response.ok) {
    throw new Error(`${what} failed with status ${response.status}`);
  }
  return response.json();
}

/**
 * Fetches every past analysis, newest first.
 *
 * @param fetchImpl - Transport to use; defaults to the global `fetch`.
 * @returns The analyses the endpoint returned.
 * @throws If the request fails, or the body is not an array of analyses. A
 * malformed payload throws rather than being filtered down to what parses,
 * because a silently short list looks exactly like a successful empty one.
 */
export async function fetchAnalyses(
  fetchImpl: FetchImpl = defaultFetch,
): Promise<Analysis[]> {
  const body = await readJson(
    await fetchImpl('/api/rag/analyses'),
    'Fetching analyses',
  );

  if (!Array.isArray(body) || !body.every(isAnalysis)) {
    throw new Error('Fetching analyses returned an unexpected payload');
  }

  return body;
}

/**
 * Deletes one analysis and its summary.
 *
 * @param id - The `Request` row to delete.
 * @param fetchImpl - Transport to use; defaults to the global `fetch`.
 * @throws If the request fails, so the caller does not drop the row from a
 * list it is still on the server.
 */
export async function deleteAnalysis(
  id: string,
  fetchImpl: FetchImpl = defaultFetch,
): Promise<void> {
  await readJson(
    await fetchImpl('/api/rag/analyses', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    }),
    'Deleting the analysis',
  );
}
