import { useId } from 'react';
import { cn } from '~/lib/utils';
import { CANVAS_DIMS, type Gesture } from '~/tools/stroke_data/types';
import { getRevealClipPath, getStrokeRender } from '~/tools/stroke_data/stroke_render';
import type { Playback } from './use_stroke_player';

/** Which strokes are drawn, dimmed, ghosted or being revealed, for one frame. */
function frameLayers(ordered: Gesture[], playback: Playback | null, step: number | null) {
  const stepIndex = playback || step === null ? null : Math.min(step, ordered.length - 1);
  if (playback) {
    return {
      stepIndex,
      visible: ordered.slice(0, playback.done),
      hidden: ordered.slice(playback.done + 1),
      animating: ordered[playback.done]
    };
  }
  const shown = stepIndex !== null ? stepIndex + 1 : ordered.length;
  return {
    stepIndex,
    visible: ordered.slice(0, shown),
    hidden: ordered.slice(shown),
    animating: undefined
  };
}

/** The stroke being drawn, clipped to how much of it is revealed. */
function AnimatingStroke({ stroke, reveal }: { stroke: Gesture; reveal: number | null }) {
  const clipId = useId();
  const render = getStrokeRender(stroke);
  const clip = reveal != null ? getRevealClipPath(render, reveal) : null;
  return (
    <>
      {clip !== null ? (
        <clipPath id={clipId}>
          <path d={clip} />
        </clipPath>
      ) : null}
      <path
        d={render.path}
        fill={stroke.color}
        clipPath={clip !== null ? `url(#${clipId})` : undefined}
      />
    </>
  );
}

/** A red numbered dot at the start of each stroke. */
function StrokeNumbers({ strokes }: { strokes: Gesture[] }) {
  return strokes.map((gesture, order) => {
    const start = gesture.points[0];
    if (!start) return null;
    return (
      <g key={`n-${gesture.index}`} className="pointer-events-none">
        <circle cx={start[0]} cy={start[1]} r={13} fill="#e11d48" opacity={0.9} />
        <text
          x={start[0]}
          y={start[1]}
          dy="0.35em"
          textAnchor="middle"
          fontSize={15}
          fontWeight={700}
          fill="white"
        >
          {order + 1}
        </text>
      </g>
    );
  });
}

/**
 * Strokes (in writing order) on the 400×400 gesture canvas, scaled to fit.
 *
 * - `playback`: mid-replay, strokes drawn so far plus the one being revealed.
 * - `step`: strokes up to this one, the earlier ones dimmed; later ones hidden (or ghosted).
 * - otherwise every stroke, numbered at its start when `showStrokeOrder`.
 */
export function GestureSvg({
  ordered,
  playback = null,
  step = null,
  ghost = false,
  showStrokeOrder = true,
  backgroundSrc,
  className
}: {
  ordered: Gesture[];
  playback?: Playback | null;
  step?: number | null;
  /** Strokes not drawn yet show faintly */
  ghost?: boolean;
  showStrokeOrder?: boolean;
  /** Image drawn under the strokes on the full canvas (e.g. the glyph being traced) */
  backgroundSrc?: string;
  className?: string;
}) {
  const { stepIndex, visible, hidden, animating } = frameLayers(ordered, playback, step);

  return (
    <svg
      viewBox={`0 0 ${CANVAS_DIMS.width} ${CANVAS_DIMS.height}`}
      className={cn(
        'block aspect-square w-full rounded-lg border border-border/70 bg-white',
        className
      )}
      role="img"
      aria-label={`Gesture with ${ordered.length} stroke${ordered.length === 1 ? '' : 's'}`}
    >
      {backgroundSrc ? (
        <image
          href={backgroundSrc}
          x={0}
          y={0}
          width={CANVAS_DIMS.width}
          height={CANVAS_DIMS.height}
        />
      ) : null}
      {ghost
        ? hidden.map((gesture) => (
            <path
              key={`ghost-${gesture.index}`}
              d={getStrokeRender(gesture).path}
              fill={gesture.color}
              opacity={0.12}
            />
          ))
        : null}
      {visible.map((gesture, order) => (
        <path
          key={gesture.index}
          d={getStrokeRender(gesture).path}
          fill={gesture.color}
          opacity={stepIndex !== null && order < stepIndex ? 0.45 : 1}
        />
      ))}
      {animating ? <AnimatingStroke stroke={animating} reveal={playback?.reveal ?? null} /> : null}
      {showStrokeOrder && !playback ? <StrokeNumbers strokes={visible} /> : null}
    </svg>
  );
}
