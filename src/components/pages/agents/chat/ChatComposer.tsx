import { useRef, useState, type ReactNode } from 'react';
import { ArrowUpIcon, AtSignIcon, SquareIcon } from 'lucide-react';
import type { GestureRefData } from '~/agents/ui_message';
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupTextarea
} from '~/components/ui/input-group';
import { Tooltip, TooltipContent, TooltipTrigger } from '~/components/ui/tooltip';
import { GestureMentionMenu } from '../mentions/GestureMentionMenu';
import { GestureRefChips } from '../mentions/GestureRefChips';
import { useGestureMentions } from '../mentions/use_gesture_mentions';

export type ComposerMessage = { text: string; refs: GestureRefData[] };

/**
 * Message field: Enter sends, Shift+Enter adds a line, Stop while the agent replies.
 * `@` mentions a gesture (any script), attaching it as context.
 */
export function ChatComposer({
  onSend,
  onStop,
  busy,
  placeholder = 'Message the agent…',
  toolbar,
  autoFocus,
  stopLabel = 'Stop'
}: {
  onSend: (message: ComposerMessage) => void;
  onStop?: () => void;
  busy: boolean;
  placeholder?: string;
  /** Left side of the bottom bar (e.g. the model picker). */
  toolbar?: ReactNode;
  autoFocus?: boolean;
  stopLabel?: string;
}) {
  const [text, setText] = useState('');
  const formRef = useRef<HTMLFormElement>(null);
  const groupRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const mentions = useGestureMentions({ text, setText, textareaRef });
  const canSend = text.trim().length > 0 && !busy;

  return (
    <form
      ref={formRef}
      className="w-full"
      onSubmit={(event) => {
        event.preventDefault();
        if (!canSend) return;
        onSend({ text: text.trim(), refs: mentions.refs });
        setText('');
        mentions.clear();
      }}
    >
      <InputGroup
        ref={groupRef}
        className="rounded-2xl shadow-sm"
        style={{ backgroundColor: 'var(--color-card)' }}
      >
        {mentions.refs.length > 0 ? (
          <InputGroupAddon align="block-start" className="cursor-default px-3 pt-2.5">
            <GestureRefChips refs={mentions.refs} onRemove={mentions.removeRef} />
          </InputGroupAddon>
        ) : null}
        <InputGroupTextarea
          ref={textareaRef}
          value={text}
          onChange={(event) => {
            setText(event.currentTarget.value);
            mentions.syncCaret(event.currentTarget);
          }}
          onSelect={(event) => mentions.syncCaret(event.currentTarget)}
          placeholder={placeholder}
          aria-label="Message"
          autoFocus={autoFocus}
          rows={3}
          style={{ fieldSizing: 'fixed' }}
          className="max-h-60 min-h-14 resize-none overflow-y-auto px-3.5 pt-3 text-base md:text-[15px]"
          {...mentions.textareaAria}
          onKeyDown={(event) => {
            if (mentions.handleKeyDown(event)) return;
            if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault();
              formRef.current?.requestSubmit();
            }
          }}
        />
        <InputGroupAddon align="block-end" className="gap-1 px-2 pb-2">
          {toolbar}
          <Tooltip>
            <TooltipTrigger
              render={
                <InputGroupButton
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  className="ml-auto rounded-full text-muted-foreground"
                  aria-label="Mention a gesture"
                  onClick={mentions.startMention}
                />
              }
            >
              <AtSignIcon />
            </TooltipTrigger>
            <TooltipContent>Mention a gesture (@)</TooltipContent>
          </Tooltip>
          {busy && onStop ? (
            <InputGroupButton
              type="button"
              variant="outline"
              size="icon-sm"
              className="rounded-full"
              aria-label={stopLabel}
              title={stopLabel}
              onClick={onStop}
            >
              <SquareIcon className="size-3 fill-current" />
            </InputGroupButton>
          ) : (
            <InputGroupButton
              type="submit"
              variant="default"
              size="icon-sm"
              className="rounded-full transition-opacity duration-300 disabled:opacity-70"
              disabled={!canSend}
              aria-label="Send"
            >
              <ArrowUpIcon />
            </InputGroupButton>
          )}
        </InputGroupAddon>
      </InputGroup>
      <GestureMentionMenu anchor={groupRef} {...mentions.menu} />
    </form>
  );
}
