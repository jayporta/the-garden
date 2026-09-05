import { describe, it, expect } from 'vitest';
import { FREE_MODELS, getModel } from '@/app/debate/models';
import {
  NO_COOLDOWNS,
  availableModels,
  isModelAvailable,
  type CooldownMap,
} from '@/app/debate/cooldowns';

const NOW = 1_800_000_000_000;
const HOUR = 60 * 60 * 1000;

/** A `CooldownMap` with only the entries a test cares about. */
function testCooldowns(partial: Partial<CooldownMap>): CooldownMap {
  return { models: {}, gateways: {}, ...partial };
}

describe('isModelAvailable', () => {
  it('treats a model with no cooldown row as available', () => {
    expect(isModelAvailable(getModel('gpt-oss-120b'), NO_COOLDOWNS, NOW)).toBe(
      true,
    );
  });

  it('hides a model whose own cooldown has not expired', () => {
    const cooldowns = testCooldowns({ models: { 'gpt-oss-120b': NOW + HOUR } });

    expect(isModelAvailable(getModel('gpt-oss-120b'), cooldowns, NOW)).toBe(
      false,
    );
  });

  it('hides every model behind a cooled gateway, and no others', () => {
    const cooldowns = testCooldowns({ gateways: { groq: NOW + HOUR } });

    expect(isModelAvailable(getModel('gpt-oss-120b'), cooldowns, NOW)).toBe(
      false,
    );
    expect(isModelAvailable(getModel('gpt-oss-20b'), cooldowns, NOW)).toBe(
      false,
    );
    expect(isModelAvailable(getModel('gemini-2-5-flash'), cooldowns, NOW)).toBe(
      true,
    );
    expect(isModelAvailable(getModel('glm-5-2'), cooldowns, NOW)).toBe(true);
  });

  it('is still cooling one millisecond before expiry', () => {
    const until = NOW + HOUR;
    const cooldowns = testCooldowns({ models: { 'gpt-oss-120b': until } });

    expect(
      isModelAvailable(getModel('gpt-oss-120b'), cooldowns, until - 1),
    ).toBe(false);
  });

  it('is available at the instant of expiry and after', () => {
    const until = NOW + HOUR;
    const cooldowns = testCooldowns({ models: { 'gpt-oss-120b': until } });

    expect(isModelAvailable(getModel('gpt-oss-120b'), cooldowns, until)).toBe(
      true,
    );
    expect(
      isModelAvailable(getModel('gpt-oss-120b'), cooldowns, until + 1),
    ).toBe(true);
  });

  it('ignores a cooldown key that matches no model in the registry', () => {
    const cooldowns = testCooldowns({
      models: { 'retired-model': NOW + HOUR },
    });

    expect(() => availableModels(cooldowns, NOW)).not.toThrow();
    expect(availableModels(cooldowns, NOW)).toHaveLength(FREE_MODELS.length);
  });
});

describe('isModelAvailable — composing a model and its gateway', () => {
  it('keeps the model cooling while its own cooldown outlasts the gateway', () => {
    const cooldowns: CooldownMap = {
      models: { 'gpt-oss-120b': NOW + 2 * HOUR },
      gateways: { groq: NOW + HOUR },
    };

    // At NOW + 90min the gateway has recovered but the model has not.
    expect(
      isModelAvailable(getModel('gpt-oss-120b'), cooldowns, NOW + 1.5 * HOUR),
    ).toBe(false);
  });

  it('keeps the model cooling while its gateway outlasts its own cooldown', () => {
    const cooldowns: CooldownMap = {
      models: { 'gpt-oss-120b': NOW + HOUR },
      gateways: { groq: NOW + 2 * HOUR },
    };

    expect(
      isModelAvailable(getModel('gpt-oss-120b'), cooldowns, NOW + 1.5 * HOUR),
    ).toBe(false);
  });

  it('frees the model only once both have expired', () => {
    const cooldowns: CooldownMap = {
      models: { 'gpt-oss-120b': NOW + HOUR },
      gateways: { groq: NOW + 2 * HOUR },
    };

    expect(
      isModelAvailable(getModel('gpt-oss-120b'), cooldowns, NOW + 2 * HOUR),
    ).toBe(true);
  });
});

describe('availableModels', () => {
  it('returns the whole registry when nothing is cooling', () => {
    expect(availableModels(NO_COOLDOWNS, NOW)).toEqual([...FREE_MODELS]);
  });

  it('preserves registry order, since the reel is ordered', () => {
    const cooldowns = testCooldowns({ models: { 'gpt-oss-120b': NOW + HOUR } });
    const available = availableModels(cooldowns, NOW);

    expect(available.map((model) => model.id)).toEqual(
      FREE_MODELS.filter((model) => model.id !== 'gpt-oss-120b').map(
        (model) => model.id,
      ),
    );
  });

  it('can empty out entirely when every gateway is cooling', () => {
    const cooldowns = testCooldowns({
      gateways: {
        groq: NOW + HOUR,
        google: NOW + HOUR,
        openrouter: NOW + HOUR,
      },
    });

    expect(availableModels(cooldowns, NOW)).toEqual([]);
  });
});
