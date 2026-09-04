<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.

<!-- END:nextjs-agent-rules -->

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

This is an experimental playground app ("The Garden"). Each feature is an independent experiment; they do not share code beyond `app/components/`.

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

`app/rag/analyses/page.tsx` fetches `/api/rag/analyses` (`app/api/rag/analyses/route.ts`) to list past `Request`s with their `Source`/`Summary`, and can `DELETE` one (deletes `Summary` rows first, then the `Request`, due to the FK).

**Data model** (`prisma/schema.prisma`): `Source` (type `url`/`pdf`/`image`/`text`) 1—\* `Request` (`inputText`, `status`: `pending`/`completed`/`failed`) 1—1 `Summary` (`text`, `insights`).

**Prisma specifics:** the generated client outputs to `app/generated/prisma` (not `node_modules`), is gitignored, and must be regenerated via `npx prisma generate` whenever the schema changes — tests import from `@/app/generated/prisma/client` and will fail to type-check if it's stale or missing. The app uses Prisma's driver-adapter pattern (`@prisma/adapter-pg` + a `pg.Pool`) rather than the default query engine, constructed inline in each route (`app/api/*/route.ts`), not from a shared singleton.

**Env vars:** `DATABASE_URL` (Postgres), `OPENAI_API_KEY` (optional — falls back to the default `openai` provider from `@ai-sdk/openai` if unset), `OPENAI_MODEL` (optional, defaults to `gpt-4o-mini`).

**Testing:** vitest with `environment: "node"`. Route tests (`__tests__/*.test.ts`) mock `@/app/generated/prisma/client`, `@prisma/adapter-pg`, `pg`, and the `ai`/`@ai-sdk/openai` modules, then dynamically `import()` the route handler so the mocks take effect first — follow this pattern for new route tests rather than importing the handler at the top of the file.

**Styling:** Tailwind v4 via the `@tailwindcss/postcss` plugin (no `tailwind.config.*`); `app/rag/components/SubmitButton.tsx` shows the `light-dark()` CSS function pattern used for theme-aware colors.

## Dependency constraints

Three traps that produce confusing failures if you upgrade past them. Each was verified against the installed tree, not assumed.

**AI SDK providers must share a provider-spec major with `ai`.** `ai@6` resolves `@ai-sdk/provider@3.x`; every provider package must too. The current releases of `@ai-sdk/groq`, `@ai-sdk/google` (both `4.x`) and `@openrouter/ai-sdk-provider` (`3.x`) target `@ai-sdk/provider@4.x` / peer `ai ^7`, so **installing any of them unpinned breaks the build**. The caret ranges in `package.json` are deliberate and sufficient — the break is at the major boundary, so `^3` can never resolve to `4.x`. Check alignment with:

```
node -p "require('ai/package.json').dependencies['@ai-sdk/provider']"
```

Moving to `ai@7` means moving every provider together, in one commit.

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
