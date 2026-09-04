import { describe, it, expect } from 'vitest';
import { DEBATE_TOPICS } from '@/app/debate/topics';
import { FREE_MODELS } from '@/app/debate/models';
import { spin } from '@/app/debate/spin';

/**
 * An rng that yields the given values in order, so a spin is fully determined.
 * Lands each value squarely in the middle of its bucket to avoid depending on
 * floating-point rounding at a bucket boundary.
 */
function testScriptedRng(values: number[]): () => number {
  let index = 0;
  return () => values[index++];
}

/** Midpoint of bucket `index` of `length`, as a value in [0, 1). */
function testBucket(index: number, length: number): number {
  return (index + 0.5) / length;
}

describe('spin', () => {
  it('reads the reels in order: left model, topic, right model', () => {
    const result = spin(testScriptedRng([0, 0, 0]));

    expect(result.leftModelId).toBe(FREE_MODELS[0].id);
    expect(result.topicId).toBe(DEBATE_TOPICS[0].id);
    // The right reel skips the left model, so bucket 0 lands on the next one.
    expect(result.rightModelId).toBe(FREE_MODELS[1].id);
  });

  it('is deterministic for a given rng sequence', () => {
    const values = [0.42, 0.17, 0.83];
    const first = spin(testScriptedRng(values));
    const second = spin(testScriptedRng(values));

    expect(first).toEqual(second);
  });

  it('reaches the last entry of each reel', () => {
    const result = spin(
      testScriptedRng([
        testBucket(FREE_MODELS.length - 1, FREE_MODELS.length),
        testBucket(DEBATE_TOPICS.length - 1, DEBATE_TOPICS.length),
        0,
      ]),
    );

    expect(result.leftModelId).toBe(FREE_MODELS[FREE_MODELS.length - 1].id);
    expect(result.topicId).toBe(DEBATE_TOPICS[DEBATE_TOPICS.length - 1].id);
  });

  it('never lands the same model on both sides, for any reel position', () => {
    for (let left = 0; left < FREE_MODELS.length; left++) {
      for (let right = 0; right < FREE_MODELS.length - 1; right++) {
        const result = spin(
          testScriptedRng([
            testBucket(left, FREE_MODELS.length),
            0,
            testBucket(right, FREE_MODELS.length - 1),
          ]),
        );

        expect(result.rightModelId).not.toBe(result.leftModelId);
      }
    }
  });

  it('reaches every model on the right reel for a given left model', () => {
    const seen = new Set<string>();
    for (let right = 0; right < FREE_MODELS.length - 1; right++) {
      seen.add(
        spin(testScriptedRng([0, 0, testBucket(right, FREE_MODELS.length - 1)]))
          .rightModelId,
      );
    }

    // Every model except the one the left reel took.
    expect(seen.size).toBe(FREE_MODELS.length - 1);
    expect(seen.has(FREE_MODELS[0].id)).toBe(false);
  });

  it('only ever returns ids that exist in the registries', () => {
    const modelIds = new Set(FREE_MODELS.map((model) => model.id));
    const topicIds = new Set(DEBATE_TOPICS.map((topic) => topic.id));

    for (let i = 0; i < 200; i++) {
      const result = spin();
      expect(modelIds.has(result.leftModelId)).toBe(true);
      expect(modelIds.has(result.rightModelId)).toBe(true);
      expect(topicIds.has(result.topicId)).toBe(true);
    }
  });

  it('defaults to Math.random when no rng is supplied', () => {
    expect(() => spin()).not.toThrow();
  });
});
