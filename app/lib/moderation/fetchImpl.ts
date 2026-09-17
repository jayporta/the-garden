/**
 * The `fetch` seam every server-side network call in this app is written
 * against.
 *
 * Kept in one place so the screening tiers, which each reach a different
 * vendor, share one contract rather than declaring the same type apiece. Tests
 * pass a stub and assert what was requested without a network.
 */

/** An injectable `fetch`, narrowed to the two arguments this app passes. */
export type FetchImpl = (url: string, init?: RequestInit) => Promise<Response>;
