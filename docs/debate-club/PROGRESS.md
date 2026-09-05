# Debate Club — progress log

> **Read this first when resuming.** It records current state, what is next, and
> every decision that would otherwise need re-explaining. The _why_ and the
> _design_ live in [`DESIGN.md`](./DESIGN.md); this file is the running history.
>
> Update it as part of each task, before committing — not retroactively.

**Branch:** none — solo project, so work lands directly on `main`.
**Feature route:** `/debate` (module directory exists; the page itself lands at task 9)

---

## Status

Task descriptions live in [`DESIGN.md`](./DESIGN.md#task-breakdown) — the
authoritative list. This table tracks only which of them are done, so the two
files cannot drift.

**Renumbered on 2026-09-04**, when the cooldown core was inserted as task 7.
Everything from the old task 7 down shifted by one. Any note written before that
date saying "task 7" means the turn route, now task 8; "task 8" means grey-box
`/debate`, now task 9.

| #   | Task                | Status                |
| --- | ------------------- | --------------------- |
| 0   | Merge lint branch   | ✅ done               |
| 1   | Feature docs        | ✅ done               |
| 2   | Pinned deps         | ✅ done               |
| 3   | Topics/models/spin  | ✅ done               |
| 4   | Personas            | ⬜ next               |
| 5   | Meters              | ⬜                    |
| 6   | Sequence machine    | ⬜                    |
| 7   | Cooldown core       | ✅ done               |
| 8   | Turn API route      | ⬜                    |
| 9   | Grey-box `/debate`  | ⬜                    |
| 10  | Chest panel         | ⬜                    |
| 11  | r3f Stage           | ⬜                    |
| 12  | Reel cylinders      | ⬜                    |
| 13  | Electricity + bloom | ⬜                    |
| 14  | Speech bubbles      | ⬜                    |
| 15  | Sprite sheets       | 🔒 blocked on artwork |
| 16  | Palette pass        | 🔒 deferred           |

Task 7 landed out of order, ahead of tasks 4–6. It had to: it changes `spin`'s
signature and the schema, and doing that after three more modules were built on
the old shape would have meant reworking them.

**The app is fully playable at task 9** — no artwork or WebGL required before
then. Tasks 11–14 add the visual layer on top of working logic.

---

## Working agreement

Per task: implement → Sonnet reviewer subagent → fix → re-review until clear →
update this file → **user reviews the diff** → commit.

Commits follow Conventional Commits. Nothing is committed without the user
seeing the diff first — reviewer approval alone is not sufficient.

Reviewer checklist: bugs · bad practice · scalability · orphaned code and
comments · single source of truth · performance.

---

## Decision log

Decisions that are expensive to rediscover.

**Scope**

- The Garden stays **Next.js + Prisma + TypeScript**. An earlier discussion
  explored replacing Prisma with Go and splitting the app into micro-frontends;
  that idea moved to a **separate greenfield repo** and is not happening here.
- Debate Club is a second, independent experiment alongside RAG-light. It does
  not touch `/rag`.

**Dependencies — verified, and the pins are load-bearing**

- `@ai-sdk/groq@4.x`, `@ai-sdk/google@4.x` and `@openrouter/ai-sdk-provider@3.x`
  all target `@ai-sdk/provider@4.x` / peer `ai ^7`. The installed `ai@6.0.177`
  is on provider `3.x`. **Installing any of them unpinned breaks the build.**
  Use `@ai-sdk/groq@3.0.64`, `@ai-sdk/google@3.0.121`,
  `@openrouter/ai-sdk-provider@2.10.0`.
- `@react-three/fiber@9.7.0` peers `react >=19 <19.3`. Installed React is
  19.2.4. **Bumping React to 19.3 will break the build.**
- OpenRouter escape hatch: it is OpenAI-API-compatible, so the already-installed
  `@ai-sdk/openai` can reach it via `createOpenAI({ baseURL, apiKey })` with no
  extra dependency.

**Models**

- The OpenRouter roster was **not** taken from the user's other project. That
  project generates games, so its curated list excludes text-only models — the
  wrong filter for a debate. The list here came from a live read of
  `https://openrouter.ai/api/v1/models` instead.
- OpenRouter's `:free` roster turns over often. Re-read the endpoint when models
  start failing rather than assuming `FREE_MODELS` is still current.

**Architecture**

- `spin(rng)` decides all three reel results _before_ any animation runs. The
  animation eases to a known stop. Keeps randomisation pure and testable.
- Client drives the turn loop; the server is stateless. Persona and current
  meters travel with each request.
- Streaming uses `toTextStreamResponse()`, not `toUIMessageStreamResponse()` —
  there is no `useChat` here.
- Meters are applied by a pure client-side function, so simulation logic is unit
  testable without mocking a server.
- **Mirror matches are back on, reversing task 3.** That task made them
  structurally impossible by drawing the right reel from the pool minus the left
  model, which was right for a fixed 15-model registry. With a pool that shrinks
  as models cool, "impossible" degrades into "unspinnable", so a pool of one now
  spins that model against itself — good versus evil, personalities locked. The
  draw still always terminates in one pass; the change is a branch on pool size,
  not a re-roll loop.
- **Cooldowns are reactive, never predicted.** No vendor documents whether a
  free ceiling is per-model or account-wide precisely enough to tally locally,
  so `retry-after` and `x-ratelimit-*` are the only honest signal.
- **A model's cooldown and its gateway's compose as `max`, not last-write.**
  Either can legitimately be the longer one: OpenRouter's daily reset may be six
  hours out while one model's `retry-after` is twenty seconds. A gateway
  cooldown is a floor under every model it serves, and never shortens a
  model's own.
- **Rate-limit scope is decided per gateway.** A 429 on OpenRouter cools the
  whole gateway, because its free ceiling is account-wide. On Groq and Google it
  cools only that model, because theirs are per model — the same blanket rule
  would take Gemini 2.5 Flash Lite offline because Flash hit its own cap.
- **The cooldown API is GET-only, deliberately.** A client-writable cooldown is
  a one-request denial of service against the app's own quota state, and it
  contradicts the reactive trigger — a cooldown is a fact a vendor stated, not a
  claim a client can make. Writes happen only inside the turn route.
- **A 429 mid-debate ends the debate**, showing which contestant is spent and
  until when, with the partial transcript kept. Not resumable (a cooldown can
  run for hours) and not substituted (the persona was installed into one
  specific model; half a transcript from each is not a debate anyone can read).
  This replaces DESIGN.md Risk §5's original "paused debate the user can
  resume", which was written before cooldowns were real.
- **One shared Prisma client**, `app/api/prismaClient.ts`, replacing the inline
  `pg.Pool` each route used to build. `pg` opens up to 10 sockets per pool, so
  the ceiling grew with the route count: the two RAG routes plus Debate Club's
  turn and cooldown routes would have reached 40 against a free-tier Postgres
  that caps direct connections near 60. This is a stated colocation exception —
  a pool is process-wide, and a factory handing out per-caller clients would
  defeat its own purpose.

**Art**

- Form follows the supplied reference: retro tin toy, boxy riveted head, round
  white eyes with dark pupils, corrugated accordion limbs, chest control panel.
- **Palette does not follow the reference.** Bright and fun, not sepia. Deferred
  to task 16.
- **Not doing:** film grade (no grain/vignette/sepia post pass), pie-cut eyes,
  Cuphead rubber hose. Post chain is **bloom only**.
- **The robot's chest panel is the UI.** Personality sliders and live meter
  gauges are drawn on the robot itself, not in a separate settings panel.
- Sprite sheets, not tweened stills — playback locked to 12fps. Without a film
  grade, frame timing is the only thing carrying the period feel.

**Why WebGL rather than a CSS animation library**

- Load-bearing reasons are exactly two: the electricity is a fragment shader
  (CSS gives a moving gradient, not arcing current), and the eye glow needs real
  bloom that composites across the frame. Reels alone would _not_ justify it.
- If the electricity effect is ever cut, revisit this choice.

---

## Blocked on the user

- **Task 15** — robot artwork. See the asset spec in `DESIGN.md`: identical
  canvas size and registration point per frame, eyes and chest panel on separate
  layers, cord attachment point marked, JSON manifest per robot.
- **Task 16** — palette direction.

## Open questions

- Turn cap default is 10; may need tuning once real transcripts exist.
- Every OpenRouter free model advertises a `reasoning` parameter, and several
  are reasoning-first models. If their thinking traces come back in the response
  body they will land in the speech bubbles as debate text. Task 8 should
  suppress reasoning output or strip it, and this wants checking against a real
  response rather than assuming the provider hides it.
- `getTopic`/`getModel` throw on an unknown id, which is safe while every caller
  is internal and the id types are closed unions. Task 8 breaks that assumption:
  `/api/debate/turn` parses ids off a request body, where they arrive as untyped
  `string` at a trust boundary and a cast is unchecked. That route needs its own
  runtime membership check turning a bad id into a 400, not the bare throw.

---

## Log

**Task 0 — merged lint/format work to `main`.** `chore/lint-format-agents-style`
fast-forwarded to `main` at `c7e61aa` and pushed. That commit added Prettier and
ESLint enforcement of the AGENTS.md style rules; `npm run lint` now runs with
`--max-warnings=0`. Baseline at branch point: 2 test files, 9 tests, lint and
build clean.

**Task 1 — feature docs established.** Added `docs/debate-club/DESIGN.md` (the
approved design) and this file, plus a feature table in `AGENTS.md` pointing at
both. Review caught two things, both fixed before commit: this Status table
originally still said task 1 was in progress, and the full 15-task list was
restated in both DESIGN.md and PROGRESS.md and had already drifted in two
places. The task list now lives only in DESIGN.md; this file tracks status
alone.

**Interlude — colocated the RAG feature.** Unplanned, inserted between tasks 1
and 2 at the user's request. `SubmitButton` and the analyses page moved under
`app/rag/`, and the two route handlers gained a feature segment
(`app/api/rag/...`). URLs changed: `/analyses` → `/rag/analyses`, `/api/chat` →
`/api/rag/chat`, `/api/analyses` → `/api/rag/analyses`. Test count unchanged at 9. Debate Club follows the same shape: `app/debate/` and `app/api/debate/`.

**Interlude — rewrote commit messages to Conventional Commits.** All ten commits
were rewritten via `git filter-branch --msg-filter`; trees verified identical
pairwise, author dates preserved. **Every SHA before this point changed** — any
older note referencing a pre-rewrite hash is stale. `main` was force-pushed.
Backup tags `backup/pre-msg-rewrite-*` still point at the original commits.

**Task 2 — pinned dependencies.** Installed the AI providers
(`@ai-sdk/groq`, `@ai-sdk/google`, `@openrouter/ai-sdk-provider`) and the WebGL
stack (`three`, `@react-three/fiber`, `@react-three/drei`,
`@react-three/postprocessing`, `motion`). Verified every AI package resolves
`@ai-sdk/provider@3.x`, matching `ai@6`. Caret ranges are deliberate rather than
exact pins: the incompatibility sits at the major boundary, so `^3` cannot reach
the breaking `4.x`. AGENTS.md gains _Dependency constraints_ and _Gotchas_
sections recording these, the r3f React ceiling, the stale-`.next` typecheck
failure, and the repo-wide-sweep rule for route moves.

**Task 3 — topics, models and the spin.** Added `app/debate/topics.ts` (12
hard-coded low-stakes propositions), `app/debate/models.ts` (`FREE_MODELS`, 15
entries) and `app/debate/spin.ts`, with tests beside them in
`app/debate/__tests__/`. Test count 9 → 31.

Both registries use `as const satisfies readonly T[]`, which validates each
entry's shape while keeping the literal `id` types, so `DebateTopicId` and
`FreeModelId` are unions rather than `string`.

`DEBATE_TOPICS` is a **placeholder the user intends to edit by hand** — add and
remove freely; nothing derives from the specific topics.

**Deviation from DESIGN.md, deliberate:** the design says re-roll the right reel
on collision. `spin` instead draws the right model from the pool _minus_ the
left one and shifts past it. Same uniform distribution over the non-left models,
but it always terminates in one draw — re-rolling has no upper bound and would
exhaust a scripted test rng. Mirror matches are therefore structurally
impossible rather than retried away; re-enabling them means changing the draw,
not flipping a constant, so the `ALLOW_MIRROR_MATCH` constant the design
anticipated was not added.

**`provider` was renamed to `gateway`, and `author` added.** The user pushed
back on calling Groq, Google and OpenRouter all "providers", and was right — the
field conflated two things. Groq trains nothing; it hosts other labs' open
weights. OpenRouter trains nothing either; it aggregates. Only Google both
trains and serves. `gateway` names the transport (which SDK client the route
builds), `author` names the lab. Gemma 4 makes the split concrete: authored by
Google, reached through OpenRouter.

**Every model id was then verified live, and most of them failed.** The user
asked for this before trusting the list, and it was the right call — the
original 22 dropped to 15:

- The AI SDK unions are worthless as a liveness signal. Both `GroqChatModelId`
  and `GoogleGenerativeAIModelId` end in `| (string & {})`, so they accept any
  string; they are autocomplete, not validation, and they still carry ids the
  vendors retired long ago.
- Groq: **6 of 8 dropped.** `gemma2-9b-it` shut down 2025-10-08,
  `llama-4-maverick` 2026-03-09, `kimi-k2-instruct-0905` 2026-04-15,
  `llama-4-scout` 2026-07-17, and `llama-3.3-70b-versatile` /
  `llama-3.1-8b-instant` 2026-08-16 — the last two only 19 days before this task.
  Only `openai/gpt-oss-120b` and `openai/gpt-oss-20b` survive on the free tier.
- Google: **1 of 3 dropped.** `gemini-2.0-flash` is shut down. `gemini-2.5-flash`
  and `gemini-2.5-flash-lite` remain free.
- OpenRouter: **11 of 18 kept**, each confirmed via `/models/{id}/endpoints` to
  have a serving endpoint at status 0 and 97%+ uptime. Dropped seven as unfit to
  debate — two Poolside coding agents, Cohere North Mini Code, a finance-tuned
  Ling, an NVIDIA content-safety guardrail, a Dots preview expiring 2026-09-30,
  and an NVIDIA perception sub-agent that was also deranked (status −2).

The OpenRouter list came from a live catalogue read, **not** from the user's
other project — that project generates games, so its curation drops text-only
models, the wrong filter here.

All three gateways are free without a subscription; Google's free tier needs no
billing account at all. The ceilings differ enormously though, and OpenRouter's
50 requests/day without credits works out to about five 10-turn debates a day.
See _Free-tier budget is a design constraint_ in DESIGN.md.

The user also added `app/debate/art_references/bot.jpeg`, the robot reference
that tasks 11–15 draw from.

Reviewer found no blockers. Its one nit was a test asserting less than its name
promised (`modelId`/`label` distinctness was named but never checked); the
assertion was added and confirmed to fail when deliberately broken.

**Interlude — one shared Prisma client.** Unplanned but scheduled: the open
question that said to revisit the inline `pg.Pool` once a second feature had
routes came due, since the cooldown work adds one and the turn route will add
another. `app/api/prismaClient.ts` now owns the single
`PrismaClient` and its `pg.Pool`; both RAG routes import it instead of
constructing their own. Test count unchanged at 31 — the existing route tests
already mock `@/app/generated/prisma/client`, `@prisma/adapter-pg` and `pg`, the
three modules the new file imports, so they needed no edit.

The dev-only HMR cache is gated on `NODE_ENV === 'development'`, deliberately
not on `!== 'production'` as the common Prisma recipe writes it. Under vitest
`NODE_ENV` is `test`, and caching a client on `globalThis` there would hand the
second route test file in a worker the _first_ file's mocked client — and the
two files mock different Prisma methods. Only Next's dev server reloads modules,
so only it gets the handle.

**Task 7 — the cooldown core.** Inserted ahead of tasks 4–6, because it changes
`spin`'s signature and the Prisma schema, and building three more modules on the
old shape first would only have meant reworking them. Everything from the old
task 7 down was renumbered; see the note above the Status table. Test count
38 → 91.

Three exports written during this task were cut before it landed rather than
committed and removed later: `nextExpiry` (a countdown timer nothing plans),
`observeQuotaExhaustion` (a pre-emptive cooldown on the _success_ path, which
took `MIN_RECORDABLE_MS` and the `remainingHeader` policy field with it) and the
export of `canSpin`, now private to `spin.ts` where its only caller is. The line
drawn: an export whose consumer is named in `DESIGN.md` is scaffolding for the
next task, an export whose consumer was imagined while writing it is
speculation. `observeRateLimit` stays — the reactive 429 trigger is the
documented mechanism task 8 consumes.

Added `DebateCooldown` (migration `20260904215359_debate_cooldown`),
`app/debate/cooldowns.ts` (availability predicates over a `CooldownMap`),
`app/debate/rateLimitHeaders.ts` (vendor headers → a `CooldownObservation`) and
`GET /api/debate/cooldowns`. `spin` gained a second parameter.

**A latent crash was fixed, not merely guarded against.** `spin` drew the right
reel with `pickIndex(pool.length - 1, rng)`. At a pool of one that is
`pickIndex(0, rng)` → `Math.min(0, -1)` → `-1`, and `pool[-1].id` throws a
`TypeError`. It was unreachable only because `FREE_MODELS.length` was fixed at
15; the moment the pool could shrink it went live. That index is now the mirror
match instead.

`spin` is **overloaded** rather than simply returning `SpinResult | null`:
called with no pool it cannot return null, because `FREE_MODELS` is a literal
tuple and so provably non-empty. That keeps all seven task-3 spin tests
byte-identical — which is itself the evidence that the default path is
untouched — while the pool-taking form is honest about the empty case.

**Things that would otherwise have been silent bugs.** Groq's reset headers are
Go durations (`7.66s`, `2m59.56s`, `1h2m3s`), not numbers and not dates, so
`Number()` yields `NaN` and loses the cooldown; the unit alternation has to try
`ms` before `m` or `500ms` parses as 500 minutes. `Retry-After` has two legal
forms, and the digits-only check must run first because `Date.parse('60')`
returns the year 2060 rather than failing. OpenRouter's `x-ratelimit-reset` has
moved between seconds and milliseconds across API versions, and reading seconds
as milliseconds yields a 1970 instant that clamps to the floor — producing
exactly the tight retry loop the clamp exists to prevent — so it accepts either.
Every `until` is clamped into `[now + 1s, now + 25h]` so a garbage or hostile
header cannot brick a model for a year.

The `GATEWAY_RATE_LIMIT_POLICY` table is **annotated** `Record<ModelGateway, …>`
rather than `as const satisfies` it. `satisfies` preserves the literal types,
which erases the optional properties on the gateways that do not set them — the
Google entry has no `reset` at all, so reading it off the union is a type error.
The annotation keeps the exhaustiveness check that makes adding a gateway fail
the typecheck until its policy exists.

**Verified against the real database, not only the mocks.** Seeded an
`openrouter` gateway row and a `gpt-oss-120b` model row, ran `npm run dev`, and
confirmed `GET /api/debate/cooldowns` returns both as epoch ms with a
`serverNow`. Feeding that live payload into `availableModels` dropped the pool
from 15 to 3, a one-model pool spun a mirror match, and an empty pool returned
`null`. Seed rows deleted afterwards.

Not built yet, and deliberately: the provider, `layout.tsx` and the expiry timer
wait for task 9, since they have no consumer until there is a UI. Neither the
provider nor the timer will be unit tested — `environment: 'node'` with no jsdom,
and adding one is a real dependency change — so the standing rule is that any
logic that appears in the provider moves into `cooldowns.ts` instead.

---

## 2026-09-04 — conventions pass, and TanStack for data fetching

Not a numbered task. A follow-up after the global `CLAUDE.md` was rewritten to
point at the `react-typescript` skill, which contradicts what task 7 was written
against on three points. Landed as five commits rather than one, because the
pieces are independent of each other. Test count 31 → 113 across the pass.

**Errors are no longer suppressed** (`fix(api)`). Four route handlers caught,
returned a 500 and recorded nothing, which made the cause unrecoverable — the
client is told only "Failed to fetch cooldowns" on purpose. `app/api/logError.ts`
is now the one place a handled server-side failure is written down, and it
redacts before it writes: `pg` and Prisma put the connection string into their
error messages and `DATABASE_URL` carries a password. The `catch` inside `isUrl`
was left bare and commented — `URL` throwing there _is_ the answer to the
question the predicate asks.

**Three speculative exports were cut**, folded into the task 7 commit rather
than committed and removed a commit later, since they had never been committed
at all. Recorded in the task 7 entry above.

**Comments were de-historicised** per the skill's "no development history,
timeless" rule. `FreeModel.author` no longer narrates that it was added ahead of
its consumer at your request, and `prismaClient.ts` no longer cites a colocation
rule that the `CLAUDE.md` rewrite deleted, or describes the connection ceiling
in the past tense.

**TanStack Query replaces `fetch` + `useEffect`** (`chore(deps)`, then
`feat(rag)`). `app/rag/analyses/page.tsx` was the only place in the app fetching
that way. `refetchOnWindowFocus` is **off** in the app defaults and `retry` is 1,
both against TanStack's own defaults, because every query here ends at a metered
upstream. The task 9 cooldowns hook is the first that should opt back in.

**jsdom and Testing Library were added**, which the task 7 note called a real
dependency change and deferred. It was: the conversion cannot be tested at all
without a React environment. Scoped per file by `// @vitest-environment jsdom`
so the default stays `node` and no config changed. React stayed pinned at
19.2.4, so the `@react-three/fiber@9` ceiling still holds. This unblocks the
task 9 HUD tests too.

### Open question, carried forward

`AGENTS.md` tells route tests to mock `@prisma/adapter-pg` and `pg`. Those mocks
are **not load-bearing** — deleting them leaves the suite green — because
`@/app/generated/prisma/client` is already mocked, so `PrismaClient` is a
`vi.fn` that ignores its `adapter`, `PrismaPg`'s constructor only stores the
pool, and `pg.Pool` opens no socket until a query. The skill's "never assert
something that cannot fail" says delete them; the counter-argument is that
deleting means a real `pg.Pool` holding the real `DATABASE_URL` gets constructed
during tests. Undecided, so left in place and unchanged.
