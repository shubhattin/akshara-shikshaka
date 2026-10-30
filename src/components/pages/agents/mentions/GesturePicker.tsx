import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTRPC } from '~/api/client';
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList
} from '~/components/ui/command';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '~/components/ui/select';
import { Skeleton } from '~/components/ui/skeleton';
import { get_script_from_id } from '~/state/lang_list';
import {
  buildMentionIndex,
  searchMentions,
  type MentionableGesture,
  type MentionScriptFilter
} from './mention_search';

const RESULT_LIMIT = 60;

const scriptName = (id: number) => get_script_from_id(id) ?? `Script ${id}`;

/**
 * Pick one gesture (any script) by akṣara, romanization ("ka" → क), id or category: the
 * gesture a focused chat will work on.
 */
export function GesturePicker({ onPick }: { onPick: (gesture: MentionableGesture) => void }) {
  const trpc = useTRPC();
  const list_q = useQuery(
    trpc.agents.list_mentionable_gestures.queryOptions(undefined, { staleTime: 5 * 60_000 })
  );
  const [query, setQuery] = useState('');
  const [script, setScript] = useState<MentionScriptFilter>('all');
  const index = useMemo(() => (list_q.data ? buildMentionIndex(list_q.data) : null), [list_q.data]);
  const scriptItems = useMemo(
    () => [
      { value: 'all', label: 'All scripts' },
      ...[...new Set((list_q.data ?? []).map((gesture) => gesture.script_id))].map((id) => ({
        value: String(id),
        label: scriptName(id)
      }))
    ],
    [list_q.data]
  );
  const results = index
    ? searchMentions(index, {
        query,
        script,
        category: 'all',
        exclude: new Set(),
        limit: RESULT_LIMIT
      }).results
    : [];

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2">
        <Select
          items={scriptItems}
          value={script === 'all' ? 'all' : String(script)}
          onValueChange={(value) => {
            if (value) setScript(value === 'all' ? 'all' : Number(value));
          }}
        >
          <SelectTrigger size="sm" className="w-44" aria-label="Filter by script">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {scriptItems.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <Command shouldFilter={false} className="rounded-xl border border-border/70">
        <CommandInput
          value={query}
          onValueChange={setQuery}
          placeholder="Search an akṣara: क, ka, #12, category…"
          autoFocus
        />
        <CommandList className="max-h-72">
          {list_q.isPending ? (
            <div className="flex flex-col gap-1.5 p-2">
              {Array.from({ length: 4 }, (_, i) => (
                <Skeleton key={i} className="h-8 w-full" />
              ))}
            </div>
          ) : (
            <>
              <CommandEmpty>No gesture matches.</CommandEmpty>
              {results.map((gesture) => (
                <CommandItem
                  key={gesture.id}
                  value={String(gesture.id)}
                  onSelect={() => onPick(gesture)}
                >
                  <span className="w-8 text-center text-lg leading-none">{gesture.text}</span>
                  <span className="min-w-0 flex-1 truncate">
                    {scriptName(gesture.script_id)}
                    <span className="ml-1.5 text-xs text-muted-foreground">
                      {gesture.roman} · #{gesture.id}
                      {gesture.category ? ` · ${gesture.category}` : ''}
                    </span>
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {gesture.strokes > 0 ? `${gesture.strokes} strokes` : 'no strokes'}
                  </span>
                </CommandItem>
              ))}
            </>
          )}
        </CommandList>
      </Command>
    </div>
  );
}
