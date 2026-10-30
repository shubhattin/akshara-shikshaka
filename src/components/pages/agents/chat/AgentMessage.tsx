import { Fragment } from 'react';
import { isToolUIPart } from 'ai';
import { BotIcon } from 'lucide-react';
import { mentionToken, messageGestureRefs } from '~/agents/gesture_refs';
import type { AgentUIMessage } from '~/agents/ui_message';
import { Bubble, BubbleContent } from '~/components/ui/bubble';
import { Message, MessageContent } from '~/components/ui/message';
import { Trace, TraceIcon, TraceLine, TraceTitle } from '~/components/ui/trace';
import { DraftEditor } from '../gesture/DraftEditor';
import { draftFromTrace } from '../gesture/draft_state';
import { SentDraftEdit } from '../gesture/SentDraftEdit';
import { NoteSuggestionCard } from '../gesture/NoteSuggestionCard';
import { SentSavedView } from '../gesture/SavedViewDialog';
import { GestureProposalCard } from '../gesture/GestureProposalCard';
import { GestureRefChips } from '../mentions/GestureRefChips';
import { InspectGlyphStep, TraceStrokesStep } from '../tools/GlyphToolSteps';
import { ReasoningStep } from '../tools/ReasoningStep';
import { SqlQueryStep } from '../tools/SqlQueryStep';
import { WebSearchStep } from '../tools/WebSearchStep';
import { AgentMarkdown } from './AgentMarkdown';
import { CopyReplyButton, ReplyCost } from './ChatCost';
import { useAgentChatContext } from './agent_chat_context';
import { groupParts, messageText, type AgentPart, type StepPart } from './message_parts';

function StepRow({ part, streaming }: { part: StepPart; streaming: boolean }) {
  switch (part.type) {
    case 'reasoning':
      return <ReasoningStep text={part.text} running={streaming && part.state === 'streaming'} />;
    case 'tool-sql_query':
      return <SqlQueryStep part={part} streaming={streaming} />;
    case 'tool-web_search':
      return <WebSearchStep part={part} streaming={streaming} />;
    case 'tool-inspect_glyph':
      return <InspectGlyphStep part={part} streaming={streaming} />;
    case 'tool-trace_strokes':
      return <TraceStrokesStep part={part} streaming={streaming} />;
  }
}

export function ThinkingLine() {
  return (
    <TraceLine status="running">
      <TraceIcon>
        <BotIcon />
      </TraceIcon>
      <TraceTitle>Working</TraceTitle>
    </TraceLine>
  );
}

/** Message text with each mentioned gesture's `@akṣara#id` highlighted. */
function MentionText({ text, tokens }: { text: string; tokens: string[] }) {
  if (tokens.length === 0) return text;
  const escaped = tokens.map((token) => token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const pieces = text.split(new RegExp(`(${escaped.join('|')})`, 'gu'));
  return pieces.map((piece, index) =>
    tokens.includes(piece) ? (
      <span key={index} className="font-medium text-primary">
        {piece}
      </span>
    ) : (
      <Fragment key={index}>{piece}</Fragment>
    )
  );
}

/** The latest trace in a run of steps, if it is the chat's newest draft. */
function latestTraceIn(parts: StepPart[], latestDraftId: string | null) {
  if (!latestDraftId) return null;
  for (const part of parts) {
    if (
      part.type === 'tool-trace_strokes' &&
      part.state === 'output-available' &&
      part.toolCallId === latestDraftId
    ) {
      return draftFromTrace(part.toolCallId, part.input, part.output);
    }
  }
  return null;
}

type DraftEditPart = Extract<AgentPart, { type: 'data-draft_edit' }>;
type SavedViewPart = Extract<AgentPart, { type: 'data-saved_view' }>;

/** The admin's draft edit in their message, as sent (editable again while it is the newest draft). */
function UserDraftEdit({ part }: { part: DraftEditPart }) {
  const { latestDraftId } = useAgentChatContext();
  return <SentDraftEdit edit={part.data} latest={part.data.edit_id === latestDraftId} />;
}

export function UserMessage({ message }: { message: AgentUIMessage }) {
  const refs = messageGestureRefs(message);
  const text = messageText(message);
  const edit = message.parts.find((part): part is DraftEditPart => part.type === 'data-draft_edit');
  const savedView = message.parts.find(
    (part): part is SavedViewPart => part.type === 'data-saved_view'
  );
  return (
    <Message align="end">
      <MessageContent className="w-full items-end gap-1.5">
        <GestureRefChips refs={refs} className="justify-end" />
        {edit ? <UserDraftEdit part={edit} /> : null}
        {savedView ? <SentSavedView part={savedView} message={message} /> : null}
        {text.trim() ? (
          <Bubble align="end" variant="muted">
            <BubbleContent className="whitespace-pre-wrap">
              <MentionText text={text} tokens={refs.map(mentionToken)} />
            </BubbleContent>
          </Bubble>
        ) : null}
      </MessageContent>
    </Message>
  );
}

/** One agent turn: step traces and replies, in the order they happened. */
export function AssistantMessage({
  message,
  streaming
}: {
  message: AgentUIMessage;
  streaming: boolean;
}) {
  const { agentKind, latestDraftId } = useAgentChatContext();
  const groups = groupParts(message.parts);
  // Between steps (a tool finished, the next step has not streamed yet) show that work continues.
  const lastPart = message.parts.filter((part) => part.type !== 'step-start').at(-1);
  const waiting =
    streaming &&
    (!lastPart ||
      (isToolUIPart(lastPart) &&
        (lastPart.state === 'output-available' || lastPart.state === 'output-error')) ||
      (lastPart.type === 'reasoning' && lastPart.state === 'done'));

  return (
    <Message>
      <MessageContent className="w-full gap-3">
        {groups.map((group, index) => {
          const isLast = index === groups.length - 1;
          switch (group.kind) {
            case 'steps': {
              const draft =
                agentKind === 'gesture_creator' ? latestTraceIn(group.parts, latestDraftId) : null;
              return (
                <Fragment key={group.key}>
                  <Trace>
                    {group.parts.map((part, partIndex) => (
                      <StepRow key={partIndex} part={part} streaming={streaming} />
                    ))}
                  </Trace>
                  {draft ? <DraftEditor key={draft.id} source={draft} title="Draft" /> : null}
                </Fragment>
              );
            }
            case 'text':
              return (
                <AgentMarkdown key={group.key} streaming={streaming && isLast}>
                  {group.text}
                </AgentMarkdown>
              );
            case 'proposal':
              return (
                <GestureProposalCard key={group.key} part={group.part} streaming={streaming} />
              );
            case 'note':
              return <NoteSuggestionCard key={group.key} part={group.part} />;
          }
        })}
        {waiting ? <ThinkingLine /> : null}
        {!streaming ? (
          <div className="flex items-center gap-0.5">
            <ReplyCost metadata={message.metadata} />
            <CopyReplyButton text={messageText(message)} />
          </div>
        ) : null}
      </MessageContent>
    </Message>
  );
}
