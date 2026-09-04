# Debate Club — progress log

> **Read this first when resuming.** It records current state, what is next, and
> every decision that would otherwise need re-explaining. The _why_ and the
> _design_ live in [`DESIGN.md`](./DESIGN.md); this file is the running history.
>
> Update it as part of each task, before committing — not retroactively.

**Branch:** none — solo project, so work lands directly on `main`.
**Feature route:** `/debate` (module directory exists; the page itself lands at task 8)

---

## Status

Task descriptions live in [`DESIGN.md`](./DESIGN.md#task-breakdown) — the
authoritative list. This table tracks only which of them are done, so the two
files cannot drift.

| #   | Task                | Status                |
| --- | ------------------- | --------------------- |
| 0   | Merge lint branch   | ✅ done               |
| 1   | Feature docs        | ✅ done               |
| 2   | Pinned deps         | ✅ done               |
| 3   | Topics/models/spin  | ✅ done               |
| 4   | Personas            | ⬜ next               |
| 5   | Meters              | ⬜                    |
| 6   | Sequence machine    | ⬜                    |
| 7   | Turn API route      | ⬜                    |
| 8   | Grey-box `/debate`  | ⬜                    |
| 9   | Chest panel         | ⬜                    |
| 10  | r3f Stage           | ⬜                    |
| 11  | Reel cylinders      | ⬜                    |
| 12  | Electricity + bloom | ⬜                    |
| 13  | Speech bubbles      | ⬜                    |
| 14  | Sprite sheets       | 🔒 blocked on artwork |
| 15  | Palette pass        | 🔒 deferred           |

**The app is fully playable at task 8** — no artwork or WebGL required before
then. Tasks 10–13 add the visual layer on top of working logic.

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

**Art**

- Form follows the supplied reference: retro tin toy, boxy riveted head, round
  white eyes with dark pupils, corrugated accordion limbs, chest control panel.
- **Palette does not follow the reference.** Bright and fun, not sepia. Deferred
  to task 15.
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

- **Task 14** — robot artwork. See the asset spec in `DESIGN.md`: identical
  canvas size and registration point per frame, eyes and chest panel on separate
  layers, cord attachment point marked, JSON manifest per robot.
- **Task 15** — palette direction.

## Open questions

- Turn cap default is 10; may need tuning once real transcripts exist.
- Every OpenRouter free model advertises a `reasoning` parameter, and several
  are reasoning-first models. If their thinking traces come back in the response
  body they will land in the speech bubbles as debate text. Task 7 should
  suppress reasoning output or strip it, and this wants checking against a real
  response rather than assuming the provider hides it.
- `getTopic`/`getModel` throw on an unknown id, which is safe while every caller
  is internal and the id types are closed unions. Task 7 breaks that assumption:
  `/api/debate/turn` parses ids off a request body, where they arrive as untyped
  `string` at a trust boundary and a cast is unchecked. That route needs its own
  runtime membership check turning a bad id into a 400, not the bare throw.
- Each route handler builds its own inline `pg.Pool` + Prisma adapter. That is
  the documented pattern today, but once `app/api/debate/*` lands there will be
  two features duplicating it, and a pool per route file will start to look like
  something that wants a shared connection factory. Revisit at task 7.

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
that tasks 10–14 draw from.

Reviewer found no blockers. Its one nit was a test asserting less than its name
promised (`modelId`/`label` distinctness was named but never checked); the
assertion was added and confirmed to fail when deliberately broken.
