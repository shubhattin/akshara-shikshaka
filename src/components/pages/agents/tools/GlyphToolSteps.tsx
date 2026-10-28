import { CheckCircle2Icon, PenLineIcon, ScanSearchIcon, TriangleAlertIcon } from 'lucide-react';
import {
  TraceCollapsible,
  TraceCollapsibleContent,
  TraceCollapsibleTrigger,
  TraceDescription,
  TraceIcon,
  TraceLine,
  TraceTitle
} from '~/components/ui/trace';
import type { AgentToolPart } from '../chat/message_parts';
import { HarnessImages } from './HarnessImages';

const pct = (v: number) => `${Math.round(v * 100)}%`;

function Pending({
  icon,
  running,
  label,
  stopped
}: {
  icon: React.ReactNode;
  running: boolean;
  label: string;
  stopped: string;
}) {
  return (
    <TraceLine status={running ? 'running' : 'error'}>
      <TraceIcon>{icon}</TraceIcon>
      <TraceTitle>{running ? label : stopped}</TraceTitle>
    </TraceLine>
  );
}

/** inspect_glyph: the rendered glyph, its skeleton graph and the saved strokes. */
export function InspectGlyphStep({
  part,
  streaming
}: {
  part: AgentToolPart<'inspect_glyph'>;
  streaming: boolean;
}) {
  const icon = <ScanSearchIcon />;
  if (part.state === 'output-error') {
    return (
      <TraceCollapsible>
        <TraceCollapsibleTrigger>
          <TraceLine status="error">
            <TraceIcon>{icon}</TraceIcon>
            <TraceTitle>Couldn’t inspect the glyph</TraceTitle>
          </TraceLine>
        </TraceCollapsibleTrigger>
        <TraceCollapsibleContent>
          <p className="text-xs text-destructive">{part.errorText}</p>
        </TraceCollapsibleContent>
      </TraceCollapsible>
    );
  }
  if (part.state !== 'output-available') {
    return (
      <Pending
        icon={icon}
        running={streaming}
        label="Rendering the glyph…"
        stopped="Inspection interrupted"
      />
    );
  }
  const out = part.output;
  return (
    <TraceCollapsible>
      <TraceCollapsibleTrigger>
        <TraceLine>
          <TraceIcon>{icon}</TraceIcon>
          <TraceTitle>
            Inspected {out.text} <span className="text-muted-foreground">#{out.gesture_id}</span>
          </TraceTitle>
          <TraceDescription>
            {out.nodes.length} nodes · {out.edges.length} edges
            {out.dots.length ? ` · ${out.dots.length} dots` : ''}
            {out.knots?.length ? ` · ${out.knots.length} knots` : ''}
          </TraceDescription>
        </TraceLine>
      </TraceCollapsibleTrigger>
      <TraceCollapsibleContent className="flex flex-col gap-2">
        <p className="text-xs text-muted-foreground">
          {out.script} · {out.font_family.replaceAll('_', ' ')} · size {out.font_size} · stroke
          width ≈ {out.stroke_width}px
        </p>
        <HarnessImages images={out.images} />
      </TraceCollapsibleContent>
    </TraceCollapsible>
  );
}

/** trace_strokes: the draft, its writing order and the self-checks. */
export function TraceStrokesStep({
  part,
  streaming
}: {
  part: AgentToolPart<'trace_strokes'>;
  streaming: boolean;
}) {
  const icon = <PenLineIcon />;
  const strokeCount = part.input?.strokes?.length ?? 0;
  if (part.state === 'output-error') {
    return (
      <TraceCollapsible>
        <TraceCollapsibleTrigger>
          <TraceLine status="error">
            <TraceIcon>{icon}</TraceIcon>
            <TraceTitle>Trace failed</TraceTitle>
          </TraceLine>
        </TraceCollapsibleTrigger>
        <TraceCollapsibleContent>
          <p className="text-xs break-words text-destructive">{part.errorText}</p>
        </TraceCollapsibleContent>
      </TraceCollapsible>
    );
  }
  if (part.state !== 'output-available') {
    return (
      <Pending
        icon={icon}
        running={streaming}
        label={strokeCount ? `Tracing ${strokeCount} strokes…` : 'Planning strokes…'}
        stopped="Trace interrupted"
      />
    );
  }
  const out = part.output;
  return (
    <TraceCollapsible>
      <TraceCollapsibleTrigger>
        <TraceLine>
          <TraceIcon>{icon}</TraceIcon>
          <TraceTitle>
            Traced {out.strokes.length} stroke{out.strokes.length === 1 ? '' : 's'}
          </TraceTitle>
          <TraceDescription className="flex items-center gap-1">
            {out.ok ? (
              <CheckCircle2Icon className="size-3.5 text-emerald-600" />
            ) : (
              <TriangleAlertIcon className="size-3.5 text-amber-600" />
            )}
            covers {pct(out.coverage)}
          </TraceDescription>
        </TraceLine>
      </TraceCollapsibleTrigger>
      <TraceCollapsibleContent className="flex flex-col gap-2">
        {part.input?.note ? (
          <p className="text-xs text-muted-foreground">{part.input.note}</p>
        ) : null}
        <HarnessImages images={out.images} />
        {out.issues.length > 0 ? (
          <ul className="flex list-disc flex-col gap-0.5 pl-4 text-xs text-muted-foreground">
            {out.issues.map((issue) => (
              <li key={issue}>{issue}</li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-muted-foreground">No issues found by the self-checks.</p>
        )}
      </TraceCollapsibleContent>
    </TraceCollapsible>
  );
}
