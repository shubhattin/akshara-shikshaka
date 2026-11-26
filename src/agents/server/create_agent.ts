import { Effect } from 'effect';
import { stepCountIs, ToolLoopAgent, type Tool } from 'ai';
import { AiProvider } from '~/effect/ai';
import type { AgentKind } from '~/agents/agent_kinds';
import type { FocusContext } from '~/agents/focus';
import {
  AGENT_MODELS,
  AGENT_UTILITY_MODEL,
  type AgentModelConfig,
  type AgentModelId
} from '~/agents/models';
import { agentInstructionSections, toSystemMessages } from '~/agents/prompts/instructions';
import { sqlQueryTool } from '~/agents/tools/sql_query';
import { createWebSearchTool } from '~/agents/tools/web_search';
import { createGestureCreatorTools } from '~/agents/tools/gesture_creator_tools';
import type { ProposeGestureOutput } from '~/agents/gesture_creator/schemas';
import type { AgentUIMessage, AgentUITools } from '~/agents/ui_message';
import { withHistoryCacheBreakpoint } from './chat_messages';

/** The tools as the UI message type knows them; the Gesture Creator's only in its chats. */
export type AgentTools = {
  [Name in keyof AgentUITools]?: Tool<AgentUITools[Name]['input'], AgentUITools[Name]['output']>;
};

/** Tool calls + replies per user turn. */
const MAX_STEPS = 25;

/** What the stop condition reads of a step: its tool results. */
type StepToolResults = {
  toolResults: readonly ({ toolName: string; output: unknown } | undefined)[];
};

/** The last step proposed a gesture successfully (a refused proposal lets the agent fix it). */
export const proposedGesture = ({ steps }: { steps: readonly StepToolResults[] }) =>
  steps.at(-1)?.toolResults.some(
    (result) =>
      result?.toolName === 'propose_gesture' &&
      // SAFETY: propose_gesture's output is ProposeGestureOutput (its tool's output type).
      (result.output as ProposeGestureOutput).ok
  ) ?? false;

export const resolveAgentModel = Effect.fn('agents.resolve_model')(function* (
  modelId: AgentModelId
) {
  const ai = yield* AiProvider;
  return ai.openrouterModel(AGENT_MODELS[modelId].providerModelId);
});

export const createAgent = Effect.fn('agents.create_agent')(function* (
  modelId: AgentModelId,
  kind: AgentKind,
  /** The conversation so far (the Gesture Creator's proposals refer back to its traces). */
  history: () => readonly AgentUIMessage[] = () => [],
  /** A focused chat's gesture: the tools refuse every other one. */
  focus: FocusContext | null = null,
  /**
   * End the reply once a proposal succeeds (batch runs: the card shows the proposal's summary,
   * so a closing message would only be paid for and never read).
   */
  endAtProposal = false
) {
  const model = yield* resolveAgentModel(modelId);
  const searchModel = yield* resolveAgentModel(AGENT_UTILITY_MODEL);
  const tools: AgentTools = {
    sql_query: sqlQueryTool,
    web_search: createWebSearchTool(
      searchModel,
      // Stroke-order pages are rare and a native search costs more than a whole traced reply:
      // the Gesture Creator gets one fixed-price lookup per reply.
      kind === 'gesture_creator' ? { engine: 'exa', maxResults: 3, maxCalls: 1 } : {}
    )
  };
  if (kind === 'gesture_creator') {
    Object.assign(
      tools,
      createGestureCreatorTools(history, focus?.gesture.id ?? null, AGENT_MODELS[modelId].imageView)
    );
  }
  // The Gesture Creator draws from the glyph alone: no database reads, so it cannot look up the
  // strokes saved for a gesture. sql_query stays registered so older chats that used it still
  // validate.
  const activeTools =
    kind === 'gesture_creator'
      ? // SAFETY: Object.keys of the tools record yields exactly its tool names.
        (Object.keys(tools) as (keyof AgentTools)[]).filter((name) => name !== 'sql_query')
      : undefined;
  // Tracing is spatial work: give the creator more room to think (per model: some trace as well
  // with less, and their reasoning tokens are most of the reply's output).
  const config: AgentModelConfig = AGENT_MODELS[modelId];
  const effort = kind === 'gesture_creator' ? config.gestureEffort : 'medium';
  const openrouter = config.mediaResolution
    ? { reasoning: { effort }, media_resolution: config.mediaResolution }
    : { reasoning: { effort } };
  const agent = new ToolLoopAgent({
    model,
    instructions: toSystemMessages(agentInstructionSections(kind, focus)),
    tools,
    activeTools,
    stopWhen: endAtProposal ? [stepCountIs(MAX_STEPS), proposedGesture] : stepCountIs(MAX_STEPS),
    // Move the cache breakpoint onto each step's newest message (the route marks the first step).
    prepareStep: ({ stepNumber, messages }) =>
      stepNumber === 0 ? {} : { messages: withHistoryCacheBreakpoint(messages) },
    providerOptions: { openrouter }
  });
  return { agent, tools };
});
