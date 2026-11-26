import { z } from 'zod';
import type { ImageView } from './gesture_creator/render_images';

/**
 * Models the admin agents can run, all through OpenRouter: one provider, and every reply reports
 * the actual cost charged (cache discounts included), which the chat adds up.
 */
export const AGENT_MODEL_IDS = [
  'gpt-6-luna',
  'claude-sonnet-5.5',
  'gemini-4-neon',
  'gemini-4-hydrogen',
  'gpt-6.1-sol',
  'claude-opus-5.5'
] as const;

export type AgentModelId = (typeof AGENT_MODEL_IDS)[number];

export type AgentModelConfig = {
  label: string;
  hint: string;
  providerModelId: string;
  /**
   * Reasoning effort of the Gesture Creator on this model (other agents use medium). Medium
   * where an A/B on the same akṣaras traced as well as high for about half the output tokens.
   */
  gestureEffort: 'high' | 'medium';
  /**
   * How the Gesture Creator's images frame the glyph: "crop" (around the ink, 560 px) for models
   * billed by pixels, about half the image tokens; "canvas" (whole canvas, 800 px) for Gemini,
   * which bills every image the same (~1,090 tokens) whatever its size.
   */
  imageView: ImageView;
  /**
   * Gemini only: the image detail it reads (`media_resolution`). Unset keeps the provider's
   * default (~1,090 tokens per image); MEDIUM is about half.
   */
  mediaResolution?: 'MEDIA_RESOLUTION_MEDIUM' | 'MEDIA_RESOLUTION_HIGH';
};

export const AGENT_MODELS = {
  'gemini-4-neon': {
    label: 'Gemini 4 Neon',
    hint: "Google's newest — sharp vision, mid-tier price",
    providerModelId: 'google/gemini-4-neon',
    gestureEffort: 'medium',
    imageView: 'canvas'
  },
  'gemini-4-hydrogen': {
    label: 'Gemini 4 Hydrogen',
    hint: 'Default for gestures — traces complex akṣaras about as well as Neon, ~30% cheaper',
    providerModelId: 'google/gemini-4-hydrogen',
    gestureEffort: 'high',
    imageView: 'canvas'
  },
  'gpt-6-luna': {
    label: 'GPT-6 Luna',
    hint: 'Default for chats — fast and cheap; weaker gesture drafts',
    providerModelId: 'openai/gpt-6-luna',
    gestureEffort: 'high',
    imageView: 'crop'
  },
  'gpt-6.1-sol': {
    label: 'GPT-6.1 Sol',
    hint: 'Stronger reasoning — harder questions',
    providerModelId: 'openai/gpt-6.1-sol',
    gestureEffort: 'high',
    imageView: 'crop'
  },
  'claude-sonnet-5.5': {
    label: 'Claude Sonnet 5.5',
    hint: 'Second choice — strong reasoning and writing',
    providerModelId: 'anthropic/claude-sonnet-5.5',
    gestureEffort: 'medium',
    imageView: 'crop'
  },
  'claude-opus-5.5': {
    label: 'Claude Opus 5.5',
    hint: 'Best quality — heavier analysis',
    providerModelId: 'anthropic/claude-opus-5.5',
    gestureEffort: 'high',
    imageView: 'crop'
  }
} as const satisfies Record<AgentModelId, AgentModelConfig>;

export const agent_model_id_schema = z.enum(AGENT_MODEL_IDS);

/** Stored chats can name a model that no longer exists: fall back to the default instead of crashing. */
export function coerceAgentModelId(id: string): AgentModelId {
  const parsed = agent_model_id_schema.safeParse(id);
  return parsed.success ? parsed.data : AGENT_DEFAULT_MODEL;
}

/** Model a new chat starts with. */
export const AGENT_DEFAULT_MODEL = 'gpt-6-luna' satisfies AgentModelId;

/** Cheap model for chores: chat titles, web search summaries. */
export const AGENT_UTILITY_MODEL = 'gpt-6-luna' satisfies AgentModelId;
