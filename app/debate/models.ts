/**
 * The registry of free-tier models the outer reels can land on.
 *
 * Each entry carries its gateway so the turn route can resolve the right client
 * from the id alone. This is the single source of truth for which models exist —
 * the reels, the route and the transcript all read from here.
 */

/**
 * The services a model can be reached through.
 *
 * A gateway is *how we reach a model*, which is a different question from *who
 * built it*. Groq trains nothing — it hosts other labs' open models on its own
 * hardware. OpenRouter trains nothing either; it is an aggregator that forwards
 * to whichever provider is serving a model, so one model can be reachable
 * through several gateways. Google is the only entry here that both trains and
 * serves. {@link FreeModel.author} records the lab; this records the transport.
 */
export const MODEL_GATEWAYS = ['groq', 'google', 'openrouter'] as const;

/** One of the services in {@link MODEL_GATEWAYS}. */
export type ModelGateway = (typeof MODEL_GATEWAYS)[number];

/** One selectable contestant: a gateway plus the id that gateway knows it by. */
export type FreeModel = {
  /** Stable app-level id. Survives a gateway renaming its model. */
  readonly id: string;
  /** Reel-face text. Kept short — it is drawn on a cylinder, not wrapped. */
  readonly label: string;
  /**
   * The lab that trained the model, which is often not the gateway.
   *
   * Held separately from {@link gateway} so neither is read as the other:
   * Gemma 4 is authored by Google and served through OpenRouter.
   */
  readonly author: string;
  readonly gateway: ModelGateway;
  /** The id this gateway's own API expects. */
  readonly modelId: string;
};

/**
 * The outer reels' faces. Every entry was checked to be both **live** and
 * **free** on 2026-09-04, because neither is safe to assume:
 *
 * - The AI SDK's `GroqChatModelId` and `GoogleGenerativeAIModelId` unions end in
 *   `| (string & {})`, so they accept any string. They are autocomplete hints,
 *   **not** a validity check, and they list models the services retired long
 *   ago. Reading ids off them proves nothing.
 * - Checked against each vendor's own deprecation and model docs, six Groq ids
 *   and one Google id turned out to be shut down or moved behind an enterprise
 *   plan, and were dropped.
 * - OpenRouter entries were taken from a live read of
 *   `https://openrouter.ai/api/v1/models`, filtered to `:free` ids, then each
 *   confirmed through `/models/{id}/endpoints` to have a serving endpoint at
 *   status 0 with 97%+ 30-minute uptime. Coding agents, a finance-tuned model, a
 *   moderation guardrail and a deranked perception sub-agent were dropped as
 *   unfit to debate.
 *
 * All three rosters are perishable. Re-run these checks rather than trusting
 * this list to age well — see `docs/debate-club/PROGRESS.md`.
 */
export const FREE_MODELS = [
  {
    id: 'gpt-oss-120b',
    label: 'GPT-OSS 120B',
    author: 'OpenAI',
    gateway: 'groq',
    modelId: 'openai/gpt-oss-120b',
  },
  {
    id: 'gpt-oss-20b',
    label: 'GPT-OSS 20B',
    author: 'OpenAI',
    gateway: 'groq',
    modelId: 'openai/gpt-oss-20b',
  },
  {
    id: 'gemini-2-5-flash',
    label: 'Gemini 2.5 Flash',
    author: 'Google',
    gateway: 'google',
    modelId: 'gemini-2.5-flash',
  },
  {
    id: 'gemini-2-5-flash-lite',
    label: 'Gemini 2.5 Flash Lite',
    author: 'Google',
    gateway: 'google',
    modelId: 'gemini-2.5-flash-lite',
  },
  {
    id: 'glm-5-2',
    label: 'GLM 5.2',
    author: 'Z.ai',
    gateway: 'openrouter',
    modelId: 'z-ai/glm-5.2:free',
  },
  {
    id: 'minimax-m3',
    label: 'MiniMax M3',
    author: 'MiniMax',
    gateway: 'openrouter',
    modelId: 'minimax/minimax-m3:free',
  },
  {
    id: 'minimax-m2-7',
    label: 'MiniMax M2.7',
    author: 'MiniMax',
    gateway: 'openrouter',
    modelId: 'minimax/minimax-m2.7:free',
  },
  {
    id: 'gemma-4-31b',
    label: 'Gemma 4 31B',
    author: 'Google',
    gateway: 'openrouter',
    modelId: 'google/gemma-4-31b-it:free',
  },
  {
    id: 'gemma-4-26b',
    label: 'Gemma 4 26B',
    author: 'Google',
    gateway: 'openrouter',
    modelId: 'google/gemma-4-26b-a4b-it:free',
  },
  {
    id: 'nemotron-3-ultra',
    label: 'Nemotron 3 Ultra',
    author: 'NVIDIA',
    gateway: 'openrouter',
    modelId: 'nvidia/nemotron-3-ultra-550b-a55b:free',
  },
  {
    id: 'nemotron-3-super',
    label: 'Nemotron 3 Super',
    author: 'NVIDIA',
    gateway: 'openrouter',
    modelId: 'nvidia/nemotron-3-super-120b-a12b:free',
  },
  {
    id: 'nemotron-3-5-lightning',
    label: 'Nemotron 3.5 Lightning',
    author: 'NVIDIA',
    gateway: 'openrouter',
    modelId: 'nvidia/nemotron-3.5-lightning:free',
  },
  {
    id: 'inkling',
    label: 'Inkling',
    author: 'Thinking Machines',
    gateway: 'openrouter',
    modelId: 'thinkingmachines/inkling:free',
  },
  {
    id: 'inkling-small',
    label: 'Inkling Small',
    author: 'Thinking Machines',
    gateway: 'openrouter',
    modelId: 'thinkingmachines/inkling-small:free',
  },
  {
    id: 'lfm-2-5-2-6b',
    label: 'LFM2.5 2.6B',
    author: 'Liquid AI',
    gateway: 'openrouter',
    modelId: 'liquid/lfm-2.5-2.6b:free',
  },
] as const satisfies readonly FreeModel[];

/** The id of any model in {@link FREE_MODELS}. */
export type FreeModelId = (typeof FREE_MODELS)[number]['id'];

/**
 * One entry of {@link FREE_MODELS}, with its literal `id` type preserved.
 *
 * The type a *subset* of the registry is carried in — a pool the cooldowns have
 * filtered, say. Typing such a pool as `readonly FreeModel[]` instead would
 * widen `id` back to `string`, silently breaking the closed {@link FreeModelId}
 * union that {@link getModel} and `spin`'s result depend on.
 */
export type FreeModelEntry = (typeof FREE_MODELS)[number];

/**
 * Looks up a model by id.
 *
 * @param id - The id of the model to resolve.
 * @returns The matching model.
 * @throws If no model carries that id — a bad id is a bug, not a runtime state
 * the caller should have to branch on.
 */
export function getModel(id: FreeModelId): FreeModel {
  const model = FREE_MODELS.find((candidate) => candidate.id === id);
  if (!model) {
    throw new Error(`Unknown debate model: ${id}`);
  }
  return model;
}
