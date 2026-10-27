import type { TextStreamPart, ToolSet } from 'ai';
import { describe, expect, it } from 'vitest';
import { createReplyMeter, openrouterCost } from './cost';

type StreamPart = TextStreamPart<ToolSet>;

const startPart = (): StreamPart => ({ type: 'start' });

const step = (cost: number, input: number, cached: number, output: number): StreamPart => ({
  type: 'finish-step',
  response: { id: 'r1', timestamp: new Date(0), modelId: 'test' },
  usage: {
    inputTokens: input,
    inputTokenDetails: {
      noCacheTokens: input - cached,
      cacheReadTokens: cached,
      cacheWriteTokens: undefined
    },
    outputTokens: output,
    outputTokenDetails: { textTokens: output, reasoningTokens: 0 },
    totalTokens: input + output
  },
  finishReason: 'stop',
  rawFinishReason: undefined,
  providerMetadata: { openrouter: { usage: { cost } } }
});

const webSearchPart = (cost: number): StreamPart => ({
  type: 'tool-result',
  toolCallId: 'ws1',
  toolName: 'web_search',
  input: { query: 'q' },
  output: { summary: '', sources: [], cost },
  dynamic: true
});

describe('openrouterCost', () => {
  it('reads the charged cost and ignores anything else', () => {
    expect(openrouterCost({ openrouter: { usage: { cost: 0.0123 } } })).toBe(0.0123);
    expect(openrouterCost({ openai: { responseId: 'x' } })).toBe(0);
    expect(openrouterCost(undefined)).toBe(0);
  });
});

describe('createReplyMeter', () => {
  it('adds up steps and web searches', () => {
    const meter = createReplyMeter('gpt-6-luna');
    expect(meter(startPart())).toEqual({ model: 'gpt-6-luna' });
    meter(step(0.01, 1000, 800, 50));
    meter(webSearchPart(0.02));
    const last = meter(step(0.005, 1200, 1000, 80));
    expect(last?.cost).toBeCloseTo(0.035);
    expect(last?.usage).toMatchObject({
      inputTokens: 2200,
      cachedInputTokens: 1800,
      outputTokens: 130
    });
  });
});
