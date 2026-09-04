import { PrismaClient } from '@/app/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

// Colocation exception (CLAUDE.md): a connection pool is a process-wide
// resource, not a per-feature one. Sharing it is the entire point — a module
// that handed each caller its own client would defeat itself — so this cannot
// live inside `app/rag/` or `app/debate/`. The file holds exactly one thing.
//
// `pg` opens up to `max: 10` sockets per Pool. With a Pool constructed inline
// per route file the connection ceiling grew with the route count: the two RAG
// routes plus Debate Club's turn and cooldown routes would reach for up to 40
// against a free-tier Postgres that caps direct connections near 60.

/**
 * Builds a Prisma client on the driver-adapter path (`@prisma/adapter-pg` over
 * a `pg.Pool`) rather than Prisma's default query engine.
 * @returns A client owning one fresh connection pool.
 */
const createPrismaClient = () =>
  new PrismaClient({
    adapter: new PrismaPg(
      new Pool({ connectionString: process.env.DATABASE_URL }),
    ),
  });

// Next's dev server re-evaluates a route module on every edit. Without a handle
// that outlives the module instance, each hot update would strand the previous
// Pool with its sockets still open — the same exhaustion this file exists to
// prevent, arriving faster.
//
// Gated on `development` specifically, not on `!== 'production'`: under vitest
// NODE_ENV is `test`, and a cache there would hand the second route test file
// in a worker the *first* file's mocked client, since the mocks differ per
// file. Only Next's dev server reloads modules, so only it needs the handle.
const globalForPrisma = globalThis as typeof globalThis & {
  prismaClient?: PrismaClient;
};

/**
 * The application's single Prisma client, backed by one shared `pg.Pool`.
 *
 * Import this from every route handler; do not construct a `PrismaClient`
 * inline. Route tests keep working unchanged because they already mock
 * `@/app/generated/prisma/client`, `@prisma/adapter-pg` and `pg` — the three
 * modules this file imports.
 */
export const prisma = globalForPrisma.prismaClient ?? createPrismaClient();

if (process.env.NODE_ENV === 'development') {
  globalForPrisma.prismaClient = prisma;
}
