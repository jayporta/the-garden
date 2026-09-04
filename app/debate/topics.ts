/**
 * The debate topics the centre reel can land on.
 *
 * Topics are hard-coded rather than user-supplied so the app can never be
 * steered onto sensitive ground. The constraint doubles as a feature: low-stakes
 * topics are funnier, and they suit the game-show framing.
 */

/** One argueable proposition, plus the short text drawn on the reel face. */
export type DebateTopic = {
  readonly id: string;
  /** Reel-face text. Kept short — it is drawn on a cylinder, not wrapped. */
  readonly label: string;
  /** The proposition itself. One robot argues for it, the other against. */
  readonly statement: string;
};

/**
 * The centre reel's faces. `as const satisfies` keeps the literal `id` types
 * (so `DebateTopicId` is a union, not `string`) while still type-checking the
 * shape of every entry.
 */
export const DEBATE_TOPICS = [
  {
    id: 'hot-dog-sandwich',
    label: 'Hot dog = sandwich',
    statement: 'A hot dog is a sandwich.',
  },
  {
    id: 'pineapple-pizza',
    label: 'Pineapple on pizza',
    statement: 'Pineapple belongs on pizza.',
  },
  {
    id: 'cereal-soup',
    label: 'Cereal is soup',
    statement: 'Cereal is a soup.',
  },
  {
    id: 'straw-holes',
    label: 'A straw has one hole',
    statement: 'A straw has exactly one hole.',
  },
  {
    id: 'water-wet',
    label: 'Water is wet',
    statement: 'Water is wet.',
  },
  {
    id: 'toilet-paper-over',
    label: 'TP hangs over',
    statement: 'Toilet paper must hang over the roll, never under.',
  },
  {
    id: 'gif-hard-g',
    label: 'GIF has a hard G',
    statement: 'GIF is pronounced with a hard G.',
  },
  {
    id: 'pop-tart-ravioli',
    label: 'Pop-Tart = ravioli',
    statement: 'A Pop-Tart is ravioli.',
  },
  {
    id: 'socks-with-sandals',
    label: 'Socks with sandals',
    statement: 'Socks with sandals is acceptable footwear.',
  },
  {
    id: 'milk-before-cereal',
    label: 'Milk before cereal',
    statement: 'Milk goes in the bowl before the cereal.',
  },
  {
    id: 'tomato-fruit-salad',
    label: 'Tomato in fruit salad',
    statement: 'A tomato belongs in a fruit salad.',
  },
  {
    id: 'diagonal-sandwich-cut',
    label: 'Diagonal sandwich cut',
    statement: 'A sandwich must be cut on the diagonal.',
  },
] as const satisfies readonly DebateTopic[];

/** The id of any topic in {@link DEBATE_TOPICS}. */
export type DebateTopicId = (typeof DEBATE_TOPICS)[number]['id'];

/**
 * Looks up a topic by id.
 *
 * @param id - The id of the topic to resolve.
 * @returns The matching topic.
 * @throws If no topic carries that id — a bad id is a bug, not a runtime state
 * the caller should have to branch on.
 */
export function getTopic(id: DebateTopicId): DebateTopic {
  const topic = DEBATE_TOPICS.find((candidate) => candidate.id === id);
  if (!topic) {
    throw new Error(`Unknown debate topic: ${id}`);
  }
  return topic;
}
