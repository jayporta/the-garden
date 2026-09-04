import { describe, it, expect } from 'vitest';
import { DEBATE_TOPICS, getTopic } from '@/app/debate/topics';

describe('DEBATE_TOPICS', () => {
  it('is non-empty so a reel always has something to land on', () => {
    expect(DEBATE_TOPICS.length).toBeGreaterThan(0);
  });

  it('has unique ids', () => {
    const ids = DEBATE_TOPICS.map((topic) => topic.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('gives every topic a label short enough for a reel face', () => {
    for (const topic of DEBATE_TOPICS) {
      expect(topic.label.length).toBeLessThanOrEqual(24);
    }
  });

  it('states every topic as a proposition that can be argued for or against', () => {
    for (const topic of DEBATE_TOPICS) {
      expect(topic.statement.endsWith('.')).toBe(true);
    }
  });
});

describe('getTopic', () => {
  it('returns the topic matching an id', () => {
    const [first] = DEBATE_TOPICS;
    expect(getTopic(first.id)).toEqual(first);
  });

  it('throws a message naming the unknown id', () => {
    // @ts-expect-error deliberately probing an id outside the union
    expect(() => getTopic('no-such-topic')).toThrow('no-such-topic');
  });
});
