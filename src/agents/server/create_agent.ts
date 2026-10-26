import { Effect } from 'effect';
import { stepCountIs, ToolLoopAgent, type Tool } from 'ai';
import { AiProvider } from '~/effect/ai';
import type { AgentKind } from '~/agents/agent_kinds';
import { AGENT_MODELS, AGENT_UTILITY_MODEL, type AgentModelId } from '~/agents/models';
import { agentInstructionSections, toSystemMessages } from '~/agents/prompts/instructions';
import { sqlQueryTool } from '~/agents/tools/sql_query';
import { createWebSearchTool } from '~/agents/tools/web_search';
import { gestureCreatorTools } from '~/agents/tools/gesture_creator_tools';
import type { AgentUITools } from '~/agents/ui_message';

/** The tools as the UI message type knows them; the Gesture Creator's only in its chats. */
export type AgentTools = {
  [Name in keyof AgentUITools]?: Tool<AgentUITools[Name]['input'], AgentUITools[Name]['output']>;
};

/** Tool calls + replies per user turn. */
const MAX_STEPS = 25;

export const resolveAgentModel = Effect.fn('agents.resolve_model')(function* (
  modelId: AgentModelId
) {
  const ai = yield* AiProvider;
  const meta = AGENT_MODELS[modelId];
  return meta.provider === 'openai'
    ? ai.openaiModel(meta.providerModelId)
    : ai.openrouterModel(meta.providerModelId);
});

export const createAgent = Effect.fn('agents.create_agent')(function* (
  modelId: AgentModelId,
  kind: AgentKind
) {
  const model = yield* resolveAgentModel(modelId);
  const searchModel = yield* resolveAgentModel(AGENT_UTILITY_MODEL);
  const tools: AgentTools = {
    sql_query: sqlQueryTool,
    web_search: createWebSearchTool(searchModel),
    ...(kind === 'gesture_creator' ? gestureCreatorTools : {})
  };
  // Tracing is spatial work: give the creator more room to think.
  const effort = kind === 'gesture_creator' ? 'high' : 'medium';
  const agent = new ToolLoopAgent({
    model,
    instructions: toSystemMessages(agentInstructionSections(kind)),
    tools,
    stopWhen: stepCountIs(MAX_STEPS),
    providerOptions: {
      openai: { reasoningEffort: effort, reasoningSummary: 'auto' },
      openrouter: { reasoning: { effort } }
    }
  });
  return { agent, tools };
});
