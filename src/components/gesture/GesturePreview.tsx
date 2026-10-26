import { useEffect, useId, useRef, useState } from 'react';
import { PlayIcon, SquareIcon } from 'lucide-react';
import { Button } from '~/components/ui/button';
import { cn } from '~/lib/utils';
import { CANVAS_DIMS, GESTURE_GAP_DURATION, type Gesture } from '~/tools/stroke_data/types';
import { animateGesture, sleep } from '~/tools/stroke_data/animation';
import { getRevealClipPath, getStrokeRender } from '~/tools/stroke_data/stroke_render';

/** While replaying: strokes fully drawn so far, and how much of the next one is revealed. */
type Playback = { done: number; reveal: number | null };

/**
 * A gesture's strokes on the 400×400 gesture canvas, scaled to fit. Static by default (every
 * stroke drawn, numbered in writing order); Play animates them in order with their own timing,
 * as in practice.
 */
export function GesturePreview({
  gestures,
  className,
  showStrokeOrder = true
}: {
  gestures: Gesture[];
  className?: string;
  showStrokeOrder?: boolean;
}) {
  const ordered = [...gestures].sort((a, b) => a.index - b.index);
  const [playback, setPlayback] = useState<Playback | null>(null);
  const controller = useRef<AbortController | null>(null);
  const clipId = useId();

  useEffect(() => () => controller.current?.abort(), []);

  const play = async () => {
    controller.current?.abort();
    const { signal } = (controller.current = new AbortController());
    for (let index = 0; index < ordered.length; index++) {
      setPlayback({ done: index, reveal: 0 });
      const finished = await animateGesture(
        ordered[index]!,
        (frame) => setPlayback({ done: index, reveal: frame.reveal }),
        { signal }
      );
      if (!finished || !(await sleep(GESTURE_GAP_DURATION, signal))) return;
    }
    setPlayback(null);
  };

  const stop = () => {
    controller.current?.abort();
    setPlayback(null);
  };

  const visible = playback ? ordered.slice(0, playback.done) : ordered;
  const animating = playback ? ordered[playback.done] : undefined;
  const animatingRender = animating ? getStrokeRender(animating) : null;
  const animatingClip =
    animatingRender && playback?.reveal != null
      ? getRevealClipPath(animatingRender, playback.reveal)
      : null;

  return (
    <div className={cn('group/gesture relative', className)}>
      <svg
        viewBox={`0 0 ${CANVAS_DIMS.width} ${CANVAS_DIMS.height}`}
        className="block aspect-square w-full rounded-lg border border-border/70 bg-white"
        role="img"
        aria-label={`Gesture with ${ordered.length} stroke${ordered.length === 1 ? '' : 's'}`}
      >
        {visible.map((gesture) => (
          <path key={gesture.index} d={getStrokeRender(gesture).path} fill={gesture.color} />
        ))}
        {animating && animatingRender ? (
          <>
            {animatingClip !== null ? (
              <clipPath id={clipId}>
                <path d={animatingClip} />
              </clipPath>
            ) : null}
            <path
              d={animatingRender.path}
              fill={animating.color}
              clipPath={animatingClip !== null ? `url(#${clipId})` : undefined}
            />
          </>
        ) : null}
        {showStrokeOrder && !playback
          ? ordered.map((gesture, order) => {
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
            })
          : null}
      </svg>
      {ordered.length > 0 ? (
        <Button
          type="button"
          size="icon-xs"
          variant="secondary"
          aria-label={playback ? 'Stop' : 'Play strokes'}
          className="absolute right-1.5 bottom-1.5 shadow-sm"
          onClick={() => (playback ? stop() : void play())}
        >
          {playback ? <SquareIcon className="fill-current" /> : <PlayIcon />}
        </Button>
      ) : null}
    </div>
  );
}
