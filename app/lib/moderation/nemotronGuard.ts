import 'server-only';

/**
 * The guardrail-model tier: NVIDIA's Nemotron Content Safety, via OpenRouter.
 *
 * Reads what the word lists cannot. The lexicon knows a fixed list of terms and
 * the Moderation API scores its own fixed categories; this is a model trained
 * to judge whether a response is hazardous at all, so it catches an attack on a
 * group that names no listed word. That is most of what a persona instructed to
 * talk down to someone actually produces.
 *
 * Chosen because it is the only *purpose-built* safety classifier with a free
 * route: Llama Guard and `gpt-oss-safeguard` are paid-only on every provider,
 * and ShieldGemma is unlisted. The `:free` variant's OpenRouter entry carries
 * `pricing.prompt` and `pricing.completion` of `"0"`.
 *
 * Uses a plain `fetch` against OpenRouter's OpenAI-compatible endpoint rather
 * than a provider package, matching `openAiModeration.ts`. It also avoids the
 * provider-spec duplication recorded in `AGENTS.md`, where `ai` pins
 * `@ai-sdk/provider` to a version the installed providers do not accept.
 */

import { logError } from '@/app/api/logError';
import type { FetchImpl } from './fetchImpl';
import type { SafetyVerdict } from './screen';
import { UnreadableAnswer, unreadableVerdict } from './unreadableAnswer';

const GUARD_ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions';

/**
 * The classifier asked for a verdict.
 *
 * Overridable because a hosted model id is perishable: `app/debate/models.ts`
 * records six ids that were retired while still listed in a provider's own
 * type union. `OPENROUTER_GUARD_MODEL` allows a swap without a code change.
 */
const DEFAULT_GUARD_MODEL = 'nvidia/nemotron-3.5-content-safety:free';

/** The line the model reports its judgement of the screened response on. */
const RESPONSE_SAFETY_PATTERN = /^\s*Response Safety:\s*(unsafe|safe)\b/im;

/** The line listing what was wrong, when anything was. */
const CATEGORIES_PATTERN = /^\s*Safety Categories:\s*(.+)$/im;

/**
 * A reasoning trace the model may emit before its answer.
 *
 * This endpoint ships with `reasoning.default_enabled: true`, so the answer can
 * arrive behind a `<think>` block. Reasoning is switched off in the request,
 * and this strips it as well, because a parser that depends on a request
 * parameter staying honoured breaks quietly when it stops being.
 */
const REASONING_BLOCK = /<think>[\s\S]*?<\/think>/gi;

/**
 * Reads the assistant message out of a chat-completions body.
 *
 * @param body - The parsed response body.
 * @returns The completion text with any reasoning trace removed.
 */
function readCompletion(body: unknown): string {
  const content = (
    body as
      | { choices?: readonly { message?: { content?: unknown } }[] }
      | null
      | undefined
  )?.choices?.[0]?.message?.content;

  if (typeof content !== 'string') {
    throw new UnreadableAnswer(
      'Nemotron response did not match the expected shape',
    );
  }
  return content.replace(REASONING_BLOCK, '').trim();
}

/**
 * Turns the classifier's answer into a verdict.
 *
 * The model replies in labelled lines: `User Safety:`, `Response Safety:` and
 * `Safety Categories:`. Only the response judgement is read, because the text
 * being screened is generated output rather than somebody's request — the user
 * line answers a question this tier is not asking.
 *
 * Matched by pattern per line rather than by splitting on newlines, so extra
 * lines, reordering or a stray blank line cannot make a judged answer look
 * unreadable. An answer carrying no `Response Safety:` line at all is
 * unreadable and blocks.
 *
 * **This reads the vendor's reply, never the screened text.** The distinction
 * matters because the text is supplied to the model as message content and
 * could contain these very labels. What it cannot do is reach this parser. The
 * residual risk is a model that echoes its input back verbatim instead of
 * judging it, which no parse can tell from a real verdict; the tiers ahead of
 * this one are what make that survivable.
 *
 * @param completion - The completion text, reasoning already stripped.
 * @returns An unsafe verdict naming the categories, or a safe one.
 */
function parseVerdict(completion: string): SafetyVerdict {
  const decision = RESPONSE_SAFETY_PATTERN.exec(completion);
  if (!decision) {
    throw new UnreadableAnswer(
      `Nemotron returned no response-safety verdict: ${completion.slice(0, 60)}`,
    );
  }
  if (decision[1].toLowerCase() === 'safe') {
    return { safe: true };
  }

  const listed = CATEGORIES_PATTERN.exec(completion)?.[1] ?? '';
  const categories = [
    ...new Set(
      listed
        .split(',')
        .map((category) => category.trim().toLowerCase())
        .filter((category) => category.length > 0),
    ),
  ];

  return {
    safe: false,
    // The model's taxonomy is not fully published, so a category is reported as
    // the model spelled it. An unsafe answer that names nothing is still a
    // violation, and falls back to naming the tier rather than coming back
    // empty.
    categories: categories.length > 0 ? categories : ['unsafe'],
    source: 'nemotron',
  };
}

/**
 * Screens generated text with the Nemotron content-safety classifier.
 *
 * **Fails open on availability, blocks on comprehension.** No
 * `OPENROUTER_API_KEY`, a refused request, or an exhausted quota all return a
 * safe verdict with the degradation logged: the tiers ahead of this one have
 * already run, and the free ceiling here is 50 requests a day, so a spent quota
 * is an ordinary condition rather than an emergency. An answer that arrived and
 * could not be read blocks instead — see {@link UnreadableAnswer}.
 *
 * @param text - The generated text to screen.
 * @param fetchImpl - Injectable `fetch`, for tests.
 * @returns The verdict, or a safe one when the tier is unavailable.
 */
export async function screenWithNemotron(
  text: string,
  fetchImpl: FetchImpl = fetch,
): Promise<SafetyVerdict> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    return { safe: true };
  }

  try {
    const response = await fetchImpl(GUARD_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        // `||`, not `??`: an override set to the empty string is a
        // misconfiguration rather than a choice, and `??` would send `model: ''`
        // to the vendor and lose the tier to a 400 it only logs.
        model: process.env.OPENROUTER_GUARD_MODEL || DEFAULT_GUARD_MODEL,
        messages: [
          { role: 'user', content: 'Give your next turn in the debate.' },
          { role: 'assistant', content: text },
        ],
        // The answer is three labelled lines, and the model is not being asked
        // to be creative about them.
        temperature: 0,
        max_tokens: 64,
        // Off so the answer arrives without a `<think>` block. `readCompletion`
        // strips one anyway, because a parser resting on a request parameter
        // being honoured fails quietly when it stops being.
        reasoning: { enabled: false },
      }),
    });

    if (!response.ok) {
      throw new Error(`Nemotron request failed with ${response.status}`);
    }

    return parseVerdict(readCompletion(await response.json()));
  } catch (error) {
    logError('screenWithNemotron', error);
    return error instanceof UnreadableAnswer
      ? unreadableVerdict('nemotron')
      : { safe: true };
  }
}
