import { useEffect, useRef, useState } from 'react';
import { PlayIcon, SquareIcon } from 'lucide-react';
import { Button } from '~/components/ui/button';
import { cn } from '~/lib/utils';
import {
  CANVAS_DIMS,
  GESTURE_GAP_DURATION,
  type Gesture,
  type GesturePoints
} from '~/tools/stroke_data/types';
import { animateGesture, getSmoothenedPoints, pointsToSvgPath } from '~/tools/stroke_data/utils';

const strokePath = (gesture: Gesture) =>
  pointsToSvgPath(
    getSmoothenedPoints(gesture.points, {
      size: gesture.width,
      simulatePressure: gesture.simulate_pressure
    })
  );

/** While replaying: strokes fully drawn so far, and the outline of the one being drawn. */
type Playback = { done: number; partial: GesturePoints[] | null };

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
  const run = useRef(0);

  useEffect(
    () => () => {
      run.current += 1;
    },
    []
  );

  const play = async () => {
    const id = ++run.current;
    for (let index = 0; index < ordered.length; index++) {
      if (run.current !== id) return;
      setPlayback({ done: index, partial: null });
      await animateGesture(ordered[index]!, (frame) => {
        if (run.current === id) setPlayback({ done: index, partial: frame.partialPoints });
      });
      await new Promise((resolve) => setTimeout(resolve, GESTURE_GAP_DURATION));
    }
    if (run.current === id) setPlayback(null);
  };

  const stop = () => {
    run.current += 1;
    setPlayback(null);
  };

  const visible = playback ? ordered.slice(0, playback.done) : ordered;

  return (
    <div className={cn('group/gesture relative', className)}>
      <svg
        viewBox={`0 0 ${CANVAS_DIMS.width} ${CANVAS_DIMS.height}`}
        className="block aspect-square w-full rounded-lg border border-border/70 bg-white"
        role="img"
        aria-label={`Gesture with ${ordered.length} stroke${ordered.length === 1 ? '' : 's'}`}
      >
        {visible.map((gesture) => (
          <path key={gesture.index} d={strokePath(gesture)} fill={gesture.color} />
        ))}
        {playback?.partial ? (
          <path
            d={pointsToSvgPath(playback.partial)}
            fill={ordered[playback.done]?.color ?? 'black'}
          />
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
