import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTRPC } from '~/api/client';
import type { AgentKind } from '~/agents/agent_kinds';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger
} from '~/components/ui/accordion';
import {
  CodeBlock,
  CodeBlockActions,
  CodeBlockContent,
  CodeBlockCopyButton,
  CodeBlockHeader,
  CodeBlockTitle
} from '~/components/ui/code-block';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from '~/components/ui/dialog';
import { Skeleton } from '~/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '~/components/ui/tabs';
import { AgentMarkdown } from '../chat/AgentMarkdown';

const approxTokens = (text: string) => Math.round(text.length / 3.5);

const STYLE_GUIDES_TAB = 'style_guides';
/** Open on first view; the others stay folded until clicked. */
const OPEN_GUIDE = 'Devanagari';

type StyleGuide = { scripts: string[]; markdown: string };

/** The script style guides: one folded section each, rendered as Markdown. */
function StyleGuides({ guides }: { guides: StyleGuide[] }) {
  return (
    <div className="h-full overflow-y-auto rounded-lg border border-border/70 px-4 py-3">
      <p className="text-sm text-muted-foreground">
        Not part of the system prompt. Each script's guide is sent once per chat, with the first @
        mention of a gesture in that script.
      </p>
      <Accordion multiple defaultValue={[OPEN_GUIDE]} className="mt-2">
        {guides.map((guide) => (
          <AccordionItem key={guide.scripts[0]} value={guide.scripts[0]}>
            <AccordionTrigger className="items-center gap-3 font-semibold">
              <span className="flex-1">{guide.scripts.join(' / ')}</span>
              <span className="text-xs font-normal text-muted-foreground">
                ~{approxTokens(guide.markdown).toLocaleString()} tokens
              </span>
            </AccordionTrigger>
            <AccordionContent className="pb-4">
              <AgentMarkdown>{guide.markdown}</AgentMarkdown>
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </div>
  );
}

/** Everything the agent reads before the conversation, one tab per section. */
export function ContextDialog({
  open,
  onOpenChange,
  agentKind
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  agentKind: AgentKind;
}) {
  const trpc = useTRPC();
  const context_q = useQuery(
    trpc.agents.get_context.queryOptions({ agent_kind: agentKind }, { enabled: open })
  );
  const sections = context_q.data?.sections ?? [];
  const guides = context_q.data?.style_guides ?? [];
  const [tab, setTab] = useState<string | null>(null);
  const activeTab = tab ?? sections[0]?.id ?? 'system_prompt';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[min(88dvh,56rem)] flex-col gap-0 p-0 sm:max-w-4xl">
        <DialogHeader className="gap-1 border-b border-border/70 p-4 pr-12">
          <DialogTitle>Agent context</DialogTitle>
          <DialogDescription>
            What the agent reads before your messages, in this order.
          </DialogDescription>
        </DialogHeader>

        {context_q.isPending ? (
          <div className="flex flex-col gap-2 p-4">
            <Skeleton className="h-8 w-80" />
            <Skeleton className="h-96 w-full" />
          </div>
        ) : (
          <Tabs
            value={activeTab}
            onValueChange={(value) => setTab(String(value))}
            className="flex min-h-0 flex-1 flex-col gap-3 p-4"
          >
            <TabsList>
              {sections.map((section, index) => (
                <TabsTrigger key={section.id} value={section.id}>
                  {index + 1}. {section.title}
                </TabsTrigger>
              ))}
              {guides.length > 0 && (
                <TabsTrigger value={STYLE_GUIDES_TAB}>
                  {sections.length + 1}. Style guides
                </TabsTrigger>
              )}
            </TabsList>
            {sections.map((section) => (
              <TabsContent key={section.id} value={section.id} className="min-h-0 flex-1">
                <CodeBlock size="sm" className="h-full">
                  <CodeBlockHeader>
                    <CodeBlockTitle>
                      {section.title} · ~{approxTokens(section.content).toLocaleString()} tokens
                    </CodeBlockTitle>
                    <CodeBlockActions>
                      <CodeBlockCopyButton value={section.content} />
                    </CodeBlockActions>
                  </CodeBlockHeader>
                  <CodeBlockContent wrap className="min-h-0 flex-1">
                    {section.content}
                  </CodeBlockContent>
                </CodeBlock>
              </TabsContent>
            ))}
            {guides.length > 0 && (
              <TabsContent value={STYLE_GUIDES_TAB} className="min-h-0 flex-1">
                <StyleGuides guides={guides} />
              </TabsContent>
            )}
          </Tabs>
        )}
      </DialogContent>
    </Dialog>
  );
}
