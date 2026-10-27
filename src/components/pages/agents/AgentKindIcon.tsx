import type { AgentKind } from '~/agents/agent_kinds';
import { AGENT_KIND_META } from '~/agents/agent_kinds';
import { cn } from '~/lib/utils';
import { AGENT_ICONS } from './agent_meta';

const TILE = {
  sm: 'size-5 rounded-md [&_svg]:size-3',
  md: 'size-6 rounded-md [&_svg]:size-3.5',
  lg: 'size-8 rounded-lg [&_svg]:size-4.5'
} as const;

/** Each agent's look: General stays neutral, the Gesture Creator gets a bright gradient tile. */
const KIND_STYLE = {
  general: 'bg-muted text-muted-foreground ring-1 ring-border/70',
  gesture_creator: 'bg-linear-to-br from-emerald-500 via-teal-500 to-sky-500 text-white shadow-sm'
} as const satisfies Record<AgentKind, string>;

/** The agent's icon on a small tile, so the two agents are told apart at a glance. */
export function AgentKindIcon({
  kind,
  size = 'sm',
  className
}: {
  kind: AgentKind;
  size?: keyof typeof TILE;
  className?: string;
}) {
  const Icon = AGENT_ICONS[kind];
  return (
    <span
      role="img"
      aria-label={AGENT_KIND_META[kind].label}
      className={cn(
        'inline-flex shrink-0 items-center justify-center',
        TILE[size],
        KIND_STYLE[kind],
        className
      )}
    >
      <Icon aria-hidden />
    </span>
  );
}
