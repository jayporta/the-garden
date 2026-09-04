import { describe, it, expect } from 'vitest';
import { FREE_MODELS, MODEL_GATEWAYS, getModel } from '@/app/debate/models';

describe('FREE_MODELS', () => {
  it('holds at least two models, which spin() needs to avoid a mirror match', () => {
    expect(FREE_MODELS.length).toBeGreaterThanOrEqual(2);
  });

  it('has unique ids', () => {
    const ids = FREE_MODELS.map((model) => model.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('names a known gateway for every model', () => {
    for (const model of FREE_MODELS) {
      expect(MODEL_GATEWAYS).toContain(model.gateway);
    }
  });

  it('carries a gateway-native modelId distinct from the display label', () => {
    for (const model of FREE_MODELS) {
      expect(model.modelId.length).toBeGreaterThan(0);
      expect(model.label.length).toBeGreaterThan(0);
      expect(model.modelId).not.toBe(model.label);
    }
  });

  it('records the lab that built every model', () => {
    for (const model of FREE_MODELS) {
      expect(model.author.length).toBeGreaterThan(0);
    }
  });

  it('has a gateway serving models from more than one lab', () => {
    // The point of separating author from gateway: an aggregator forwards to
    // whoever serves a model, so its entries carry many authors. If `author`
    // were just a restatement of `gateway`, no gateway could exceed one lab.
    // Asserted structurally rather than against a named model, because the
    // roster is deliberately perishable and gets pruned as models retire.
    const labsByGateway = new Map<string, Set<string>>();
    for (const model of FREE_MODELS) {
      const labs = labsByGateway.get(model.gateway) ?? new Set<string>();
      labs.add(model.author);
      labsByGateway.set(model.gateway, labs);
    }
    const widest = Math.max(...[...labsByGateway.values()].map((s) => s.size));

    expect(widest).toBeGreaterThan(1);
  });

  it('gives every model a label short enough for a reel face', () => {
    for (const model of FREE_MODELS) {
      expect(model.label.length).toBeLessThanOrEqual(24);
    }
  });
});

describe('getModel', () => {
  it('returns the model matching an id', () => {
    const [first] = FREE_MODELS;
    expect(getModel(first.id)).toEqual(first);
  });

  it('throws a message naming the unknown id', () => {
    // @ts-expect-error deliberately probing an id outside the union
    expect(() => getModel('no-such-model')).toThrow('no-such-model');
  });
});
