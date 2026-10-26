import type { UIMessage } from 'ai';
import type {
  InspectGlyphInput,
  InspectGlyphOutput,
  ProposeGestureInput,
  ProposeGestureOutput,
  TraceStrokesInput,
  TraceStrokesOutput
} from './gesture_creator/schemas';
import type { AgentModelId } from './models';

/**
 * Wire types shared by the server tools and the chat UI. Kept free of runtime imports so the
 * client never pulls server code in.
 */

export type SqlQueryInput = {
  /** Few-word label shown on the collapsed tool row, e.g. "Gestures per script". */
  purpose: string;
  query: string;
};

/** Cell as JSON text for the model: dates ISO, bigints and JSON values as text. */
export type SqlCell = string | number | boolean | null;

export type SqlQueryOutput = {
  columns: string[];
  rows: SqlCell[][];
  row_count: number;
  /** More rows (or bytes) existed than were returned. */
  truncated: boolean;
  duration_ms: number;
};

export type WebSearchInput = { query: string };

export type WebSearchOutput = {
  summary: string;
  sources: { url: string; title?: string }[];
};

export type AgentUITools = {
  sql_query: { input: SqlQueryInput; output: SqlQueryOutput };
  web_search: { input: WebSearchInput; output: WebSearchOutput };
  // Gesture Creator, executed in the browser
  inspect_glyph: { input: InspectGlyphInput; output: InspectGlyphOutput };
  trace_strokes: { input: TraceStrokesInput; output: TraceStrokesOutput };
  propose_gesture: { input: ProposeGestureInput; output: ProposeGestureOutput };
};

export type AgentMessageMetadata = {
  model?: AgentModelId;
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
    cachedInputTokens?: number;
    reasoningTokens?: number;
  };
};

/**
 * A gesture the admin mentioned with `@` in a user message. The client sends the reference;
 * the server fills `context` (the gesture described for the model) once, when the message is
 * first received, so history stays byte-stable for prompt caching.
 */
export type GestureRefData = {
  id: number;
  text: string;
  script_id: number;
  context?: string;
};

export type AgentDataTypes = { gesture_ref: GestureRefData };

export type AgentUIMessage = UIMessage<AgentMessageMetadata, AgentDataTypes, AgentUITools>;
