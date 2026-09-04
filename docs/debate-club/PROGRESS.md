# Debate Club — progress log

> **Read this first when resuming.** It records current state, what is next, and
> every decision that would otherwise need re-explaining. The _why_ and the
> _design_ live in [`DESIGN.md`](./DESIGN.md); this file is the running history.
>
> Update it as part of each task, before committing — not retroactively.

**Branch:** `feat/debate-club` (branched from `main` at `c7e61aa`)
**Feature route:** `/debate` (not yet created)

---

## Status

Task descriptions live in [`DESIGN.md`](./DESIGN.md#task-breakdown) — the
authoritative list. This table tracks only which of them are done, so the two
files cannot drift.

| #   | Task                | Status                |
| --- | ------------------- | --------------------- |
| 0   | Merge lint branch   | ✅ done               |
| 1   | Feature docs        | ✅ done               |
| 2   | Pinned deps         | ⬜ next               |
| 3   | Topics/models/spin  | ⬜                    |
| 4   | Personas            | ⬜                    |
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

- **Task 3** — the curated list of OpenRouter `:free` models known to actually
  work, from the other project. Many advertised free models are unreliable.
- **Task 14** — robot artwork. See the asset spec in `DESIGN.md`: identical
  canvas size and registration point per frame, eyes and chest panel on separate
  layers, cord attachment point marked, JSON manifest per robot.
- **Task 15** — palette direction.

## Open questions

- Turn cap default is 10; may need tuning once real transcripts exist.
- Whether a mirror match (same model both sides) should ever be allowed. Current
  plan re-rolls on collision, behind a constant so it can be re-enabled.
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
