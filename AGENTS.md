<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.

<!-- END:nextjs-agent-rules -->

## Claude rule:

Load skills/react-typescript, skills/conventional-commits, and skills/doc-comments

## Commands

- `npm run dev` — start dev server (Next.js 16, App Router)
- `npm run build` / `npm run start` — production build / serve
- `npm run lint` — ESLint (flat config in `eslint.config.mjs`); `npm run lint:fix` to autofix
- `npm run format` — Prettier write; `npm run format:check` to verify without writing
- `npm test` — run vitest once (it's not in watch mode by default from this script)
- `npx vitest run __tests__/chat.test.ts` — run a single test file
- `npx prisma migrate dev` — create/apply a migration after editing `prisma/schema.prisma`
- `npx prisma generate` — regenerate the Prisma client (needed after any schema change; not wired into a package.json script)

## Architecture

This is an experimental playground app ("The Garden"). Each feature is an independent experiment; they do not share code beyond `app/components/` and `app/lib/moderation/`, the content-safety screening library described below.

| Feature     | Route     | Docs                                                                    |
| ----------- | --------- | ----------------------------------------------------------------------- |
| RAG-light   | `/rag`    | described below                                                         |
| Debate Club | `/debate` | [`docs/debate-club/`](docs/debate-club/) — **read `PROGRESS.md` first** |

**Before working on Debate Club**, read `docs/debate-club/PROGRESS.md` (current state, next task, decision log) and `docs/debate-club/DESIGN.md` (why it works the way it does). They are maintained so a new session needs no verbal handoff — and `PROGRESS.md` is updated as part of each task, before committing.

**Data flow (RAG-light):** `RagForm` (`app/rag/components/RagForm.tsx`, client component) uses `@ai-sdk/react`'s `useChat`/`Chat` with `DefaultChatTransport` pointed at `/api/rag/chat`. Submitting text or a URL posts to `app/api/rag/chat/route.ts`, which:

1. Pulls the latest user text out of the AI SDK message `parts`.
2. If the text is a URL, upserts a `Source` row and fetches page content.
3. Creates a `Request` row (status `pending`), builds a system prompt instructing the model to act as a document analyzer (not a chatbot), and streams a completion via `streamText` from the `ai` SDK using an OpenAI provider.
4. On completion, persists a `Summary` row and flips the `Request` status to `completed`/`failed`, then returns `result.toUIMessageStreamResponse()`.

`app/rag/analyses/page.tsx` lists past `Request`s with their `Source`/`Summary` and can `DELETE` one (the route deletes `Summary` rows first, then the `Request`, due to the FK). It reads through TanStack Query: `app/rag/analysesApi.ts` holds the wire types and the two calls, `useAnalyses`/`useDeleteAnalysis` wrap them, and `AnalysisCard` renders a row. A successful delete **invalidates** the query key rather than splicing local state, so the list is always what the server says still exists.

**Data model** (`prisma/schema.prisma`): `Source` (type `url`/`pdf`/`image`/`text`) 1—\* `Request` (`inputText`, `status`: `pending`/`completed`/`failed`) 1—1 `Summary` (`text`, `insights`).

Debate Club adds one standalone table with no relations: `DebateCooldown` (`scope`: `model`/`gateway`, `target`, `until`, `reason`), unique on `[scope, target]` and upserted per target so it stays bounded at 18 rows. Availability is derived from `(until, now)` and never stored — see [`docs/debate-club/DESIGN.md`](docs/debate-club/DESIGN.md).

**Prisma specifics:** the generated client outputs to `app/generated/prisma` (not `node_modules`), is gitignored, and must be regenerated via `npx prisma generate` whenever the schema changes — tests import from `@/app/generated/prisma/client` and will fail to type-check if it's stale or missing. The app uses Prisma's driver-adapter pattern (`@prisma/adapter-pg` + a `pg.Pool`) rather than the default query engine. Every route handler imports the one shared client from `app/api/prismaClient.ts` — **do not construct a `PrismaClient` inline in a route.** `pg` opens up to 10 sockets per `Pool`, so a pool per route file made the connection ceiling grow with the route count, against a free-tier Postgres that caps direct connections near 60.

**Data fetching (client):** TanStack Query, never `fetch` inside a `useEffect`. `app/components/QueryProvider.tsx` is mounted in the root layout and builds its client from `app/lib/queryClient.ts`. Two of that client's defaults deliberately differ from TanStack's own: **`refetchOnWindowFocus` is `false`** and `retry` is `1`, because every query here ends at a metered upstream and alt-tabbing must not spend quota. A query that genuinely tracks live state opts back in for itself with `refetchOnWindowFocus: true` — do not flip the global default. Network calls live in a plain `*Api.ts` module taking a `fetchImpl` seam, one hook per file beside it, so parsing stays testable without React.

**Error handling (server):** route handlers cannot rethrow, so a `catch` there is the end of the line for an error. Every one calls `logError` from `app/api/logError.ts`, which redacts URL credentials and `sk-` keys before writing — Prisma and `pg` put `DATABASE_URL`, password and all, into their messages. A bare `catch {}` is only acceptable where the throw _is_ the answer (see `isUrl` in the chat route), and that needs a comment saying so.

**Env vars:** `DATABASE_URL` (Postgres), `OPENAI_API_KEY` (optional — falls back to the default `openai` provider from `@ai-sdk/openai` if unset, and also keys the free OpenAI Moderation tier of the content-safety screen), `OPENAI_MODEL` (optional, defaults to `gpt-4o-mini`). The screening tiers beyond OpenAI's are keyed separately and each is skipped entirely when its key is unset: `OPENROUTER_API_KEY` (the Nemotron content-safety tier) and `GEMINI_API_KEY` (the Gemini tier, debate only). Each of those two tiers takes an optional model override — `OPENROUTER_GUARD_MODEL` and `GEMINI_GUARD_MODEL` — because a hosted model id is perishable and a request for a retired one fails open, removing the tier rather than breaking the app. Gemini's default is deliberately a rolling `-latest` alias for that reason; the overrides pin a specific id when reproducibility matters more.

**Content safety** lives in `app/lib/moderation/`, a screening library shared by any feature that generates model text — not debate-specific, despite Debate Club being its first consumer. It holds the local word-list screen (`categories.ts`, `profaneRoots.ts`, `profanityMatcher.ts`, `profanityWordLists.ts`, `doublingTolerantPattern.ts`, `normaliseForScreening.ts`), the pure `screenLocally` tier (`screen.ts`), the three networked tiers in the order they run (`openAiModeration.ts`, then `nemotronGuard.ts`, then `geminiGuard.ts` with its response reader `geminiVerdict.ts`), the shared `fetch` seam (`fetchImpl.ts`), the unreadable-answer signal (`unreadableAnswer.ts`), and the orchestrator (`moderateText.ts`) that runs every tier cheapest first, stopping at the first violation. **Every networked tier fails open**, so with no keys configured the local screen alone decides and the app still runs.

**No screened term is written in this repo.** The local tier's vocabulary is read out of the installed `obscenity` package at module load by `profaneRoots.ts` — the one place that reads it, so the matcher and the test probes cannot drift — with its roots re-anchored to whole words, suffix-expanded and composed with a list of innocent prefixes to recover compounds. The only word lists checked in — in `profanityWordLists.ts` — are ordinary English: suffixes, compound prefixes and the whitelist of innocent words the anchored patterns would otherwise flag. Tests draw their sample terms from the installed dataset at runtime via `__tests__/probeTerms.ts`; **do not write a screened term into a source or test file to reproduce a failure.** The trade is that a local match reports only `LOCAL_SCREEN_CATEGORY` rather than which protected characteristic was attacked, since the dataset carries no such metadata. `app/debate/safety.ts` holds only the debate-specific policy built on top: `SAFETY_PREAMBLE`/`SAFETY_REMINDER` and the retry policy `decideTurnOutcome`. Every networked tier uses a plain `fetch` against an HTTP endpoint rather than a provider package, which also keeps them clear of the provider-spec duplication noted below. One exception to failing open: a tier whose vendor _answered_ with something unparsable blocks rather than passing, because an unreadable answer is a changed contract rather than an outage.

**Testing:** vitest with `environment: "node"` as the default. Route tests (`__tests__/*.test.ts`) mock `@/app/generated/prisma/client`, `@prisma/adapter-pg`, `pg`, and the `ai`/`@ai-sdk/openai` modules, then dynamically `import()` the route handler so the mocks take effect first — follow this pattern for new route tests rather than importing the handler at the top of the file. The `@prisma/adapter-pg` and `pg` mocks look redundant — the suite stays green without them, since the generated-client mock already makes `PrismaClient` ignore its adapter — but **keep them**: they are what stops a real `pg.Pool` from being constructed around the real `DATABASE_URL` inside the test process.

Component and hook tests opt into jsdom **per file**, with `// @vitest-environment jsdom` as the first line of a `.test.tsx`; there is no config-level split, so a `.test.ts` stays on `node`. Render with `@testing-library/react`, query by role or visible text, and wrap hooks in a `QueryClientProvider` built from `createQueryClient()` with `retry` turned off so a failing query settles in one tick. Stub the network with `vi.stubGlobal('fetch', …)` typed as `(url: string, init?: RequestInit)`, so assertions can read back what was actually requested.

**Styling:** Tailwind v4 via the `@tailwindcss/postcss` plugin (no `tailwind.config.*`); `app/rag/components/SubmitButton.tsx` shows the `light-dark()` CSS function pattern used for theme-aware colors.

## Dependency constraints

Three traps that produce confusing failures if you upgrade past them. Each was verified against the installed tree, not assumed.

**AI SDK providers must share a provider-spec major with `ai`.** `ai@6` resolves `@ai-sdk/provider@3.x`; every provider package must too. The current releases of `@ai-sdk/groq`, `@ai-sdk/google` (both `4.x`) and `@openrouter/ai-sdk-provider` (`3.x`) target `@ai-sdk/provider@4.x` / peer `ai ^7`, so **installing any of them unpinned breaks the build**. The caret ranges in `package.json` are deliberate and sufficient — the break is at the major boundary, so `^3` can never resolve to `4.x`. Check alignment with:

```
node -p "require('ai/package.json').dependencies['@ai-sdk/provider']"
```

Moving to `ai@7` means moving every provider together, in one commit.

**Installed providers carry their own copy of the provider spec.** `ai@6` pins `@ai-sdk/provider` to an exact `3.0.10`, while the installed `@ai-sdk/groq@3` and `@ai-sdk/google@3` both require `^3.0.15`, so npm resolves second copies under each provider's own `node_modules/`. Nothing calls either through the AI SDK today, and every screening tier reaches its vendor over plain HTTP rather than crossing that boundary. Check it with:

```
node -p "require('ai/package.json').dependencies['@ai-sdk/provider']"
find node_modules -path "*@ai-sdk/provider/package.json"
```

**`@react-three/fiber@9` peers `react >=19 <19.3`.** Bumping React to 19.3 breaks the build. Upgrade fiber first, or not at all.

**OpenRouter has a zero-dependency fallback.** It is OpenAI-API-compatible, so `createOpenAI({ baseURL: 'https://openrouter.ai/api/v1', apiKey })` from the already-installed `@ai-sdk/openai` works without its own provider package.

## Gotchas

**A stale `.next` can fail `tsc` after any route move.** `tsconfig.json` includes `.next/dev/types/**/*.ts`, and Next's generated route validator still references the old paths, so `npx tsc --noEmit` reports `TS2307` on files you never wrote while `npm run build` passes. Fix: `rm -rf .next`, then rebuild. This is stale codegen, not a real type error.

**Renaming routes needs a repo-wide sweep, not a diff-scoped one.** Neither typechecking nor tests catch a stale route string, because the survivors are JSDoc comments and URL literals inside test fixtures. After any move, grep the whole repo — tracked and untracked — for the old paths and URLs.

## Code Style

The mechanical rules below are enforced, not just documented: **Prettier**
(`prettier.config.mjs`) owns indentation, semicolons and quotes, while
**ESLint** (`eslint.config.mjs`) owns the rules a formatter cannot express —
JSDoc on exports, one component per file, no inline `style` props.
`eslint-config-prettier` is applied last so the two never fight. Run
`npm run format && npm run lint` before committing.

- 2-space indentation.
- Semicolons required.
- Single quotes in JS/TS (`'like this'`); double quotes for JSX attributes (`className="like-this"`).
- Style with Tailwind utility classes, not inline `style` props or separate CSS files.
- Every React component should be exported from its own file.
- Global/shared components should be in top level components directory. Components used for specific routes/features should be nested in the feature directory (see rag > components).
- Follow DRY principles. If a function or component already exists, import it. Don't create it again.
- Every exported function/component gets a JSDoc block directly above it (`@param`/`@returns` for non-trivial signatures) so VS Code's hover tooltip shows useful info at call sites — this matters more than usual here since call sites are often in a different file (route handler vs. component vs. test).
- Always write tests.

## Rules

- Run tests after completing work to ensure there are no regressions or new bugs.
