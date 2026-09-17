import { describe, it, expect } from 'vitest';
import { buildTurnSystemPrompt } from '@/app/debate/systemPrompt';
import { SAFETY_PREAMBLE, SAFETY_REMINDER } from '@/app/debate/safety';
import {
  PERSONALITY_AXES,
  compilePersonaPrompt,
  type Persona,
} from '@/app/debate/personas';
import type { Meters } from '@/app/debate/meters';
import { DEBATE_TOPICS } from '@/app/debate/topics';

/** A persona with every axis at the neutral midpoint, overridden per test. */
function testPersona(overrides: Partial<Persona> = {}): Persona {
  const neutral = Object.fromEntries(
    PERSONALITY_AXES.map((axis) => [axis.key, 50]),
  ) as Persona;
  return { ...neutral, ...overrides };
}

/** Healthy meters (no low-meter prompt instructions fire), overridden per test. */
function testMeters(overrides: Partial<Meters> = {}): Meters {
  return { patience: 100, conviction: 100, ...overrides };
}

/** Every dial and meter pushed to its most hostile setting. */
function hostilePersona(): Persona {
  return testPersona({ aggression: 100, ego: 100, humour: 100 });
}

const topic = DEBATE_TOPICS[0];

describe('buildTurnSystemPrompt', () => {
  it('leads with the safety preamble for a neutral persona', () => {
    const prompt = buildTurnSystemPrompt({
      persona: testPersona(),
      meters: testMeters(),
      topic,
      side: 'left',
      stance: 'for',
    });
    expect(prompt.startsWith(SAFETY_PREAMBLE)).toBe(true);
  });

  it('still leads with the preamble for a maximally hostile persona', () => {
    const prompt = buildTurnSystemPrompt({
      persona: hostilePersona(),
      meters: testMeters({ patience: 0, conviction: 0 }),
      topic,
      side: 'right',
      stance: 'against',
    });
    expect(prompt.startsWith(SAFETY_PREAMBLE)).toBe(true);
  });

  it('includes the topic statement', () => {
    const prompt = buildTurnSystemPrompt({
      persona: testPersona(),
      meters: testMeters(),
      topic,
      side: 'left',
      stance: 'for',
    });
    expect(prompt).toContain(topic.statement);
  });

  it('states the assigned stance, and the two stances read differently', () => {
    const shared = {
      persona: testPersona(),
      meters: testMeters(),
      topic,
      side: 'left',
    } as const;
    const forPrompt = buildTurnSystemPrompt({ ...shared, stance: 'for' });
    const againstPrompt = buildTurnSystemPrompt({
      ...shared,
      stance: 'against',
    });
    expect(forPrompt).not.toBe(againstPrompt);
  });

  it('carries every persona line compilePersonaPrompt produces', () => {
    const persona = hostilePersona();
    const meters = testMeters({ patience: 0, conviction: 0 });
    const compiled = compilePersonaPrompt(persona, meters);
    const prompt = buildTurnSystemPrompt({
      persona,
      meters,
      topic,
      side: 'left',
      stance: 'for',
    });
    for (const line of compiled.split('\n')) {
      expect(prompt).toContain(line);
    }
  });

  it('omits the persona block entirely when a neutral persona compiles to nothing', () => {
    const persona = testPersona();
    const meters = testMeters();
    expect(compilePersonaPrompt(persona, meters)).toBe('');
    const prompt = buildTurnSystemPrompt({
      persona,
      meters,
      topic,
      side: 'left',
      stance: 'for',
    });
    expect(prompt).not.toContain('\n\n\n');
    expect(prompt.trim()).toBe(prompt);
  });

  it('leaves out the reminder unless the turn is being regenerated', () => {
    const prompt = buildTurnSystemPrompt({
      persona: testPersona(),
      meters: testMeters(),
      topic,
      side: 'left',
      stance: 'for',
    });
    expect(prompt).not.toContain(SAFETY_REMINDER);
  });

  it('appends the reminder when the turn is being regenerated', () => {
    const prompt = buildTurnSystemPrompt({
      persona: testPersona(),
      meters: testMeters(),
      topic,
      side: 'left',
      stance: 'for',
      reinforceSafety: true,
    });
    expect(prompt).toContain(SAFETY_REMINDER);
    expect(prompt.startsWith(SAFETY_PREAMBLE)).toBe(true);
  });

  it('separates its sections with a blank line, matching the rag route', () => {
    const prompt = buildTurnSystemPrompt({
      persona: hostilePersona(),
      meters: testMeters(),
      topic,
      side: 'left',
      stance: 'for',
    });
    expect(prompt).toContain('\n\n');
  });
});
