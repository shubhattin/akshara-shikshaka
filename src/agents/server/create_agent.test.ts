import { describe, expect, it } from 'vitest';
import { proposedGesture } from './create_agent';

const steps = (...results: { toolName: string; output: unknown }[][]) =>
  results.map((toolResults) => ({ toolResults }));

describe('proposedGesture', () => {
  it('stops after a successful proposal', () => {
    expect(
      proposedGesture({
        steps: steps(
          [{ toolName: 'trace_strokes', output: { ok: true } }],
          [{ toolName: 'propose_gesture', output: { ok: true, proposal: {} } }]
        )
      })
    ).toBe(true);
  });

  it('keeps going after a refused proposal, so the agent can fix it', () => {
    expect(
      proposedGesture({
        steps: steps([{ toolName: 'propose_gesture', output: { ok: false, error: 'stale' } }])
      })
    ).toBe(false);
  });

  it('only looks at the latest step', () => {
    expect(
      proposedGesture({
        steps: steps(
          [{ toolName: 'propose_gesture', output: { ok: true, proposal: {} } }],
          [{ toolName: 'trace_strokes', output: { ok: true } }]
        )
      })
    ).toBe(false);
    expect(proposedGesture({ steps: steps() })).toBe(false);
  });
});
