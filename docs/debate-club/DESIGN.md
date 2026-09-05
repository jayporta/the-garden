# Debate Club — a retro game show where two robots argue

> **Living design doc.** Why the feature exists and how it is meant to work.
> For current state — what is done, in flight, and next — see
> [`PROGRESS.md`](./PROGRESS.md). Read both before picking up this feature; they
> are written so a new session needs no verbal handoff.

## Context

The Garden is an experimentation playground with one existing feature, RAG-light
at `/rag`. This adds a second, independent experiment at `/debate`.

**The vision.** A video game styled as an old-time game show. Two robot
contestants stand left and right; a slot machine sits centre stage. The user
slams a big red button and three reels spin, landing on a left LLM, a debate
topic, and a right LLM. Electricity then discharges from the machine, runs along
the wall, down a thin tube and through a cord plugged into each robot's back.
The robots jolt as the personality is _installed_. Then they argue — speech
bubbles appear, and each robot's eyes glow brighter while it speaks.

Topics are hard-coded so the app can never be steered onto sensitive ground. The
constraint doubles as a feature: low-stakes topics are funnier, and they suit the
game-show framing.

Micro-frontend work discussed earlier is out of scope — separate greenfield repo.

---

## Working agreement

How we build this, agreed up front.

**Small, reviewable increments.** Every task below is scoped to be read and
understood in one sitting. No task bundles unrelated concerns. Logic lands before
visuals so there is always something working to look at.

**History is maintained in the repo, not in chat.** `docs/debate-club/PROGRESS.md`
records what is done, what is in flight, what is next, and any decision that
would otherwise need re-explaining. It is updated as part of each task, not
retroactively. A pointer goes in `AGENTS.md` so it is found automatically.

**Per-task loop.** Every task follows the same cycle:

```
implement → Sonnet reviewer subagent → fix → re-review until clear
         → update PROGRESS.md → YOU review the diff → commit
```

The user sees the diff before every commit — no task is committed on the
reviewer's approval alone. Commits use Conventional Commits via the
`conventional-commits` skill.

**Reviewer runs on Sonnet**, and loops until it reports clear, against this
checklist:

| Check                  | Looking for                                          |
| ---------------------- | ---------------------------------------------------- |
| Bugs                   | Logic errors, unhandled states, race conditions      |
| Bad practice           | Framework misuse, anti-patterns, ignored conventions |
| Scalability            | What breaks at 10× turns, models, or personas        |
| Orphaned code          | Dead exports, unused files, stale comments           |
| Single source of truth | The same fact defined in two places                  |
| Performance            | Re-renders, per-frame allocation, bundle weight      |

The single-source-of-truth check matters more than usual here: model ids,
personality axes, meter names and sequence states are each referenced from
several layers, and are exactly the things that drift into duplicate definitions.

---

## Art direction

Form comes from the supplied reference; **palette does not**.

**Shape language** (from the reference): retro tin toy. Boxy riveted head and
torso. Large round white eyes with dark pupils. Grille mouth. Corrugated
accordion-tube arms and legs. Segmented mechanical fingers. Rounded shoes. A
control panel on the chest. Bold ink outline with crosshatch/stipple shading.

**Palette: bright and fun, not the reference's sepia.** Deferred — decided when
placeholders are replaced, not now.

**Not doing:** no film grade (no grain, vignette or sepia post pass), no pie-cut
eyes, not Cuphead rubber hose. The post chain carries **bloom only**, for the eye
glow and the electricity.

### The chest panel is the UI

The reference robot's chest already carries two toggle switches, two sliders and
two round gauges. Rather than floating HTML controls beside the robot, **the
robot's own panel is the interface**:

- **Chest sliders → personality axes.** Drag them on the robot itself.
- **Chest gauges → live meters.** Needles swing as Patience and Conviction move.
- **Toggle switches → per-robot options** (e.g. lock a stance, mute).
- **Head knob → spare dial**, unassigned for now.

This is the strongest idea to come out of the reference art and it should shape
the layout: no separate settings panel, the character _is_ the control surface.
Until the art exists the panel is a labelled grey rectangle with real working
controls — the interaction is built first, the skin arrives later.

### Complexity ladder

Authentic retro-cartoon motion is frame-by-frame, not tweened. Tweening a static
drawing gives clean modern motion, which reads wrong.

| Tier | Work                            | Notes                                   |
| ---- | ------------------------------- | --------------------------------------- |
| 1    | Static robots                   | Not the style                           |
| 2    | idle + jolt + talk loops @12fps | **Target**                              |
| 3    | Line boil on every frame        | Authentic; roughly doubles drawing time |
| 4    | Accordion-limb follow-through   | Many more frames per robot              |
| 5    | Lip-sync to token stream        | Not worth it; mouth is tiny on screen   |

Target Tier 2, leave room for Tier 3. With no film grade, frame timing carries
the period feel alone — which makes locking playback to 12fps more important,
not less.

### Asset spec (for the drawings you'll make elsewhere)

Per robot, horizontal sprite-sheet strips, transparent PNG:

| State   | Frames | Playback                                             |
| ------- | ------ | ---------------------------------------------------- |
| `idle`  | 4–8    | loop, 12fps                                          |
| `jolt`  | 4–6    | one-shot on electricity impact                       |
| `talk`  | 2–4    | loop while streaming                                 |
| `eyes`  | 1      | **separate layer**; brightness driven by bloom       |
| `panel` | 1      | **separate layer**; controls drawn by the app on top |

Requirements that matter to the code:

- **Identical canvas size and registration point on every frame.** Inconsistent
  anchors are the most common sprite-sheet failure and read as a broken robot.
- Eyes and chest panel on their own layers so the app can light and drive them.
- Mark the **cord attachment point** on the back (pixel coords) so the
  electricity path terminates exactly.
- Sheets ≤ 2048px per side.
- A JSON manifest per robot: frame size, count, fps, anchor, panel rect.

---

## Why WebGL and not a CSS animation library

Recorded so the choice survives.

1. **The electricity is a shader problem.** Arcing, flickering, branching current
   along a path is procedural noise in a fragment shader. CSS gives you an
   animated gradient — a moving stripe, not electricity.
2. **Real bloom.** Glowing eyes and live current need bloom that samples and
   blurs bright pixels across the frame. `filter: drop-shadow` is a per-element
   halo and cannot composite light across a scene.
3. **One compositing space.** Robots, machine and current share lighting and post.
   A DOM robot beside a WebGL machine shows a seam.
4. **Reels are cylinders.** Real perspective, not a list behind a mask.
5. **Sprite playback is cheap on the GPU.**

**Points 1 and 2 are load-bearing.** With the film grade dropped, the case rests
on the electricity shader and real bloom — both things CSS genuinely cannot do,
rather than does worse. That is still enough, but it is a narrower case than
before: if the electricity effect is ever cut, revisit this. Reels alone would
not justify WebGL.

---

## Decisions

| Question      | Decision                                          |
| ------------- | ------------------------------------------------- |
| Entry point   | Three-reel slot machine: LLM · topic · LLM        |
| Rendering     | react-three-fiber, one scene, bloom-only post     |
| Art form      | Retro tin toy per reference; sprite sheets @12fps |
| Palette       | Bright and fun; **deferred**                      |
| Controls      | The robot's chest panel                           |
| DOM animation | `motion` — no hand-written CSS keyframes          |
| Gateways      | Groq, Google, OpenRouter                          |
| Sim depth     | Traits + decaying needs + relationship score      |

---

## Dependencies

Verified against installed `ai@6.0.177` and `react@19.2.4`.

```
npm i three@0.185.1 @react-three/fiber@9.7.0 @react-three/drei@10.7.8 \
      @react-three/postprocessing@3.1.1 motion@13.2.0
npm i @ai-sdk/groq@3.0.64 @ai-sdk/google@3.0.121 \
      @openrouter/ai-sdk-provider@2.10.0
```

- **Never install the AI providers unpinned.** `@ai-sdk/groq@4.x`,
  `@ai-sdk/google@4.x` and `@openrouter/ai-sdk-provider@3.x` all target a newer
  `ai` major (provider spec `4.x` / peer `ai ^7`). The pins share the spec major
  with the installed `@ai-sdk/openai@3.0.63`.
- **`@react-three/fiber@9.7.0` peers `react >=19 <19.3`.** React 19.2.4 is fine;
  a bump to 19.3 breaks the build. Record in AGENTS.md.
- OpenRouter fallback: it is OpenAI-API-compatible, so the installed
  `@ai-sdk/openai` reaches it via `createOpenAI({ baseURL: '…/api/v1', apiKey })`
  with no new dependency.

---

## Architecture

`spin(rng)` decides all three results **before** any animation; reels ease to a
known stop. Randomisation stays pure and testable, not entangled with frames.

Client drives the turn loop; the server is stateless. Chosen model, persona and
current meters travel with each request.

**Stop conditions:** turn cap (default 10), Stop pressed, or Conviction hits 0.

**Streaming:** `result.toTextStreamResponse()` — no `useChat` here; a plain text
stream read via `response.body.getReader()` is far simpler for two agents.

### Sequence

```
idle       robots idle-loop · button pulses · reels still
  ↓ press
spinning   button depresses · reels stagger-settle L → C → R
  ↓ last reel lands
charging   current: machine → wall → tube → split → both cords → backs
  ↓ impact
jolt       one-shot jolt frames · bloom spike · eyes ramp up
  ↓
debating   bubble on active robot · eyes pulse · talk-loop while streaming
  ↓ cap / Stop / concede
verdict    relationship result · current fades · eyes dim
```

Modelled as a pure state machine in `sequence.ts`; visuals subscribe to it.

### Cooldowns — the free tier is the hard constraint

Every model here runs on a free tier with a low ceiling, and OpenRouter allows
50 requests a day without credits against a 10-turn debate costing ~10. Hitting
a rate limit is a certainty, not an edge case, so a spent model must leave the
pool rather than kill a debate on a 429.

| Decision                           | Why                                                                                                                                                                                                                                                                          |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Reactive, not predictive           | No vendor states clearly whether a limit is per-model or account-wide, so any local tally guesses. `retry-after` and `x-ratelimit-*` report what actually happened.                                                                                                          |
| Postgres, not `localStorage`       | A cooldown can run for hours and the user will not be on the page when it lifts. Storage can be cleared or blocked, React state dies on navigation, and the quota is an account-wide server fact.                                                                            |
| No push channel                    | Next 16 App Router closes a route's connection on timeout or after the response, and SSE has no documented disconnect handling. An absent client cannot be pushed to; a present one sets its own timer.                                                                      |
| Store `until`, derive status       | Status is a function of `(until, now)`. A persisted status string goes stale the instant the clock passes expiry.                                                                                                                                                            |
| `now` injected everywhere          | Matches the feature's only existing precedent for nondeterminism, `spin(rng = Math.random)`. No test here mocks time.                                                                                                                                                        |
| Scope is per gateway               | A 429 on OpenRouter likely means all of its models are spent, since the ceiling is account-wide. The same rule on Groq or Google would be wrong — their free limits are per model, so a blanket rule would take Gemini 2.5 Flash Lite offline because Flash hit its own cap. |
| Model and gateway compose as `max` | Either can legitimately be the longer one. A gateway cooldown is a floor under every model it serves, and never shortens a model's own.                                                                                                                                      |

**Schema.** One table, scope-discriminated, because a model cooldown and a
gateway cooldown are the same fact at two granularities:

```prisma
model DebateCooldown {
  id        String   @id @default(uuid())
  scope     String   // "model", "gateway"
  target    String   // FreeModelId when scope="model"; ModelGateway when "gateway"
  until     DateTime // status is derived from (until, now) — never stored
  reason    String   // "retry-after", "quota-header", "gateway-default"
  createdAt DateTime @default(now())

  @@unique([scope, target])
}
```

`scope` and `reason` are plain `String` columns with their legal values in a
comment, not a Prisma `enum` or a `CHECK` constraint. That is the convention
`Source.type` and `Request.status` already set, and the read path treats an
unrecognised scope as inert rather than trusting it. Reviewed and deliberately
kept — revisit only if a writer ever appears outside the turn route.

Bounded at 18 rows forever (15 models + 3 gateways) with no pruning job, which
is why it is upserted per target rather than appended. An append-only history
would risk filling a free-tier row cap on any write-path bug. No
`@@index([until])` — at 18 rows a sequential scan wins, and an unused index is
noise.

**Boundary.** Everything pure lives in `app/debate/*.ts`; everything touching
Prisma lives in `app/api/debate/**/route.ts`. That is what this codebase already
does — there is no repository layer — and it guarantees no client bundle can
transitively pull in `pg`, with no new machinery.

**`GET /api/debate/cooldowns` is the only cooldown endpoint, and is read-only.**
A client-writable cooldown would be a one-request denial of service against the
app's own quota state, and it contradicts the reactive trigger: a cooldown is a
fact a vendor stated, not a claim a client can make. Writes happen only inside
the turn route, which has the vendor's response in hand — a pre-flight re-check
returning **409** (not 429; the vendor did not refuse, we did), and on a real 429
a record plus the observation echoed in the body so the client merges it with no
round trip.

**The mirror match.** When exactly one model survives, it faces itself rather
than the app going dark — good versus evil, personalities locked and read-only
on both chest panels, evil rendered as a palette swap on the same sprite sheets.
This reverses task 3's "mirror matches are structurally impossible", which was
right for a fixed 15-model registry but degrades to "unspinnable" once the pool
shrinks.

### Personality system

Six axes, `0..100`, each visible in a transcript.

| Axis         | 0           | 100       |
| ------------ | ----------- | --------- |
| Verbosity    | Terse       | Rambling  |
| Aggression   | Gentle      | Combative |
| Formality    | Casual      | Academic  |
| Ego          | Humble      | Arrogant  |
| Stubbornness | Persuadable | Immovable |
| Humour       | Dry         | Silly     |

Two consumers, which is what stops the sliders being a dressed-up prompt box:

1. `compilePersonaPrompt(persona, meters)` — maps axes to prompt language by band
   (Verbosity `0-20` → "Answer in one short sentence"; `80-100` → "Ramble"),
   folding in meters ("You are losing patience — interrupt, be curt").
2. `deriveSimParams(persona)` — maps the same values to simulation constants.
   Stubbornness slows Conviction decay; Aggression drains the _other_ agent's
   Patience faster; Ego sets how much a landed point inflates it.

`derivePersonalityType(persona)` gives a live name while dragging. Personas
persist to `localStorage`.

### Speech bubbles stay DOM

Generated text is long, wraps unpredictably, and must be selectable and
screen-readable. Bubbles render as DOM over the canvas via drei's `<Html>`,
styled with Tailwind. Only the bubble outline and tail are worth drawing.

---

## Files

Feature-colocated per CLAUDE.md. `components/scene/` groups the WebGL layer —
one cohesive subsystem, not a kind grab-bag.

```
app/debate/
  page.tsx                    server entry, renders DebateClient
  layout.tsx                  server component
  components/
    DebateClient.tsx          'use client'; dynamic-imports Stage ssr:false
  useCooldowns.ts             'use client'; TanStack query over the cooldowns
                              route
    scene/
      Stage.tsx               <Canvas>, lighting, EffectComposer (bloom only)
      Robot.tsx               sprite playback, eye-glow + panel layers
      ChestPanel.tsx          sliders/gauges/switches drawn over the panel rect
      SlotMachine3D.tsx       cabinet + three reels
      Reel.tsx                one cylinder (drei <Text> on faces)
      StartButton.tsx         big red button
      Electricity.tsx         shader-driven current along a path
      electricity.glsl.ts     noise/arc fragment shader
    SpeechBubble.tsx          drei <Html> overlay
    DebateHud.tsx             transcript, relationship, Stop
  sequence.ts                 pure state machine
  sprites.ts                  sheet manifest, frame timing, anchors, panel rect
  models.ts                   FREE_MODELS {id,label,author,gateway,modelId}
  spin.ts                     spin(rng, pool) -> SpinResult | null
  cooldowns.ts                availability predicates over a CooldownMap
  rateLimitHeaders.ts         vendor rate-limit headers -> a CooldownObservation
  personas.ts                 Persona, PERSONALITY_AXES, compilePersonaPrompt,
                              derivePersonalityType, deriveSimParams
  meters.ts                   Meters, applyTurnEffects, hasConceded, relationship
  topics.ts                   DEBATE_TOPICS, typed const
  art_references/             reference art the sprite sheets are drawn from
  __tests__/                  sequence · spin · personas · meters ·
                              cooldowns · rateLimitHeaders

app/api/prismaClient.ts       the one shared PrismaClient + pg.Pool
app/api/debate/turn/route.ts  POST one turn; resolves gateway from registry
app/api/debate/cooldowns/route.ts  GET cooldowns in force (read-only)
__tests__/debateTurn.test.ts       route test (matches existing convention)
__tests__/debateCooldowns.test.ts  route test

docs/debate-club/
  DESIGN.md                   this document
  PROGRESS.md                 running history
```

Route tests stay in top-level `__tests__/`; pure-module tests sit beside their
code. Both match vitest's default include glob — `vitest.config.ts` sets no
custom `include`, so nothing silently stops running.

Add `/debate` to `links` in `app/components/Nav.tsx` (currently `/rag` only;
`/rag/analyses` is already unlinked there).

---

## Task breakdown

Each task is one reviewable unit, one subagent review, one conventional commit.
Tasks 1–9 need no artwork and no WebGL; the app is fully playable by task 9.

**Renumbered on 2026-09-04.** The cooldown core was inserted as task 7 and
everything below it shifted by one, so any note written before that date
referring to "task 7" (the turn route) now means task 8, and "task 8" (grey-box
`/debate`) now means task 9.

| #   | Task                                                                                                                             | Commit type |
| --- | -------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| 1   | `docs/debate-club/` DESIGN + PROGRESS; AGENTS.md pointer                                                                         | `docs`      |
| 2   | Pinned deps installed; AGENTS.md records the version traps                                                                       | `build`     |
| 3   | `topics.ts`, `models.ts`, `spin.ts` + tests                                                                                      | `feat`      |
| 4   | `personas.ts` + tests                                                                                                            | `feat`      |
| 5   | `meters.ts` + tests                                                                                                              | `feat`      |
| 6   | `sequence.ts` state machine + tests                                                                                              | `feat`      |
| 7   | Cooldown core: schema, `cooldowns.ts`, `rateLimitHeaders.ts`, `spin(rng, pool)`, GET route                                       | `feat`      |
| 8   | `/api/debate/turn` + route test — plus the pre-flight 409 and the cooldown write paths                                           | `feat`      |
| 9   | Grey-box `/debate`: button, instant spin, live debate, HUD, Nav link — plus `layout.tsx`, the provider, unlit faces, dark button | `feat`      |
| 10  | Chest-panel controls (sliders/gauges) + `localStorage`                                                                           | `feat`      |
| 11  | r3f `Stage`: canvas, camera, lighting, grey-box robots + cabinet                                                                 | `feat`      |
| 12  | Reel cylinders + stagger-settle animation — plus the evil palette swap                                                           | `feat`      |
| 13  | Electricity shader + bloom + jolt                                                                                                | `feat`      |
| 14  | Speech bubbles via drei `<Html>`                                                                                                 | `feat`      |
| 15  | Sprite-sheet integration — **blocked on your artwork**                                                                           | `feat`      |
| 16  | Palette pass — **deferred, your call**                                                                                           | `style`     |

The client-side half of cooldowns waits for task 9 rather than landing with
task 7: it has no consumer until there is a UI, and building it earlier is
orphaned code. It will be a **TanStack Query hook**, `useCooldowns`, over
`GET /api/debate/cooldowns` — not a hand-rolled context with its own fetch and
expiry timer. TanStack owns the request, the cache and the refetch; what remains
is the derivation, which already lives in `cooldowns.ts`.

That hook must set `refetchOnWindowFocus: true` for itself, overriding the app
default in `app/lib/queryClient.ts`. Cooldowns are the one thing here that goes
stale on its own while the tab is in the background, and re-reading them is a
cheap query against our own database rather than a metered upstream call.

---

## Models registry

`FREE_MODELS` holds Groq, Google and curated OpenRouter `:free` entries. Each
entry carries its **gateway** — the service the request is sent to — so the route
resolves the right client — and its **author**, the lab that trained it.

No count is quoted here on purpose. The registry is its own count, and
`PROGRESS.md` records what was verified and when; restating the number in this
document is how the task list drifted at task 1.

Gateway is deliberately not called _provider_: Groq and OpenRouter train no
models of their own. Groq hosts other labs' open weights, and OpenRouter is an
aggregator that forwards to whichever provider serves a model. Only Google both
trains and serves. The field names the transport, not the author.

The two sides are never the same model. **This is done by exclusion, not by
re-rolling**, which is a deliberate change from the original plan: the right
reel draws from the models _minus_ the left one and shifts past it. The
distribution over the non-left models is identical, but it always terminates in
a single draw, where re-rolling on collision has no upper bound. Mirror matches
are therefore structurally impossible rather than retried away — re-enabling
them means changing the draw, not flipping a constant.

**Every roster here is perishable, and none of them may be assumed.** The AI SDK
model-id unions are not a liveness signal: `GroqChatModelId` and
`GoogleGenerativeAIModelId` both end in `| (string & {})`, so they accept any
string, and they still list models the vendors retired long ago. Checking the
vendors' own docs at task 3 killed six of eight Groq ids and one of three Google
ids. Re-check against vendor deprecation pages and
`https://openrouter.ai/api/v1/models` rather than trusting this list to age.

### Free-tier budget is a design constraint

All three gateways are usable without a paid plan, but the ceilings differ by
two orders of magnitude and they shape the turn cap:

| Gateway    | Free ceiling                                                                 |
| ---------- | ---------------------------------------------------------------------------- |
| OpenRouter | **50 requests/day** without credits (1,000 with $10 of credit, ever), 20/min |
| Groq       | 10–30 RPM, 100–14.4K requests/day, varies by model                           |
| Google     | Free tier needs no billing account                                           |

One debate at the default 10-turn cap costs ~10 requests. On OpenRouter's
no-credit tier that is **five debates a day** before the reels start returning
429s. Two consequences. The rate-limit handling in _Risks_ is a certainty rather
than a precaution — which is what _Cooldowns_ above, task 7, exists for. And the
spin should arguably not be free to land two OpenRouter models when a cheaper
gateway is available; that one is still open, and deliberately outside task 7,
which keeps the draw uniform over whatever the cooldowns leave rather than
weighting it by gateway.

## Env vars

```
GROQ_API_KEY=...
GOOGLE_GENERATIVE_AI_API_KEY=...
OPENROUTER_API_KEY=...
```

Route returns a clear 400 naming a missing key rather than throwing.

---

## Risks

1. **Agreement collapse.** Free models converge on "great point, I agree" within
   ~4 turns. Assign a hard stance, forbid conceding before turn 6, let high
   Aggression and Stubbornness manufacture friction.
2. **Slider indifference.** Sliders move, output doesn't. Bands must emit
   categorically different instructions, not adjectives.
3. **Sprite jitter.** Inconsistent frame registration reads as a broken robot.
4. **Smooth-motion trap.** Lock sprite playback to 12fps even though the scene
   renders at 60, or the period feel dies.
5. **Rate limits.** Free tiers throttle, and on this budget they certainly will.
   Handled by the cooldown system: spent models leave the pool before the spin,
   and stay on the reel drawn unlit.

   A 429 **mid-debate** ends that debate in a terminal state — "this contestant
   is disqualified, out of turns until 14:32" — with the partial transcript kept
   and marked incomplete. Not the paused-and-resumable state an earlier draft of
   this document promised: a cooldown can run for hours, so "resume" is a button
   that stays dark. Not a substitute model either, because swapping a contestant
   silently changes what the transcript means — the persona was installed into
   one specific model, and half a transcript from each is not a debate anyone can
   read. The game-show framing gives the honest option a natural voice.

6. **Per-frame allocation.** r3f `useFrame` runs 60×/sec; allocating vectors or
   objects there causes GC stutter. Explicit review-checklist item.

## Phase 2 (not now)

Persist personas and debates: `Persona`, `Debate` (topic, models, status) →
`DebateMessage` (turn, speaker, text), mirroring the existing
`Source → Request → Summary` shape, plus an archive page modelled on
`app/rag/analyses/page.tsx`.

---

## Verification

1. `npm run dev`, open `/debate` — no SSR error from the canvas.
2. Chest sliders update the personality-type name live; personas survive reload.
3. Press the red button: reels spin, stagger-settle, land on model / topic /
   model. A DOM live region announces the same three results.
4. Electricity runs machine → wall → tube → cord → both robots; both jolt; eyes
   ramp. Sequence states fire in order with no skipped stage.
5. Debate auto-starts: agents alternate, text streams into bubbles, the speaking
   robot's eyes brighten, chest gauges move, halts at the turn cap.
6. **Slider efficacy check:** same topic at Verbosity 0 / Aggression 0 versus
   100 / 100 — transcripts must differ obviously, or the bands are too timid.
7. Reduced motion enabled — spin and current skipped, result still lands.
8. Stop mid-debate — loop stops before the next turn fires.
9. Remove `GROQ_API_KEY` — clear error naming the key, not a crash.
10. `npm test` — existing 9 tests pass, plus `sequence`, `spin`,
    `applyTurnEffects`, `deriveSimParams`, `compilePersonaPrompt`, `cooldowns`,
    `rateLimitHeaders`.
11. `npm run lint` and `npm run format:check` — both exit 0.
12. Seed a gateway cooldown (`openrouter`, `+1h`): `GET /api/debate/cooldowns`
    returns it, and the OpenRouter faces on both reels go unlit.
13. Seed cooldowns leaving exactly one model: the button stays lit and spins a
    mirror match. Leave none: the button goes dark.

## Notes

- Task 0: merge `chore/lint-format-agents-style` into `main`, then branch this
  work from the updated `main`.
- `/debate` and the personality-type names are placeholders.
