import { useEffect, useRef, useState } from 'react';
import { GESTURE_GAP_DURATION, type Gesture } from '~/tools/stroke_data/types';
import { animateGesture, sleep } from '~/tools/stroke_data/animation';

/** While replaying: strokes fully drawn so far, and how much of the next one is revealed. */
export type Playback = { done: number; reveal: number | null };

/** Strokes in writing order. */
export const orderedStrokes = (gestures: Gesture[]) =>
  [...gestures].sort((a, b) => a.index - b.index);

/**
 * Replays strokes in order with their own timing (as in practice), `speed` times faster. Only one
 * replay runs at a time; a new `play` or `stop` cancels the running one.
 */
export function useStrokePlayer(ordered: Gesture[], speed = 1) {
  const [playback, setPlayback] = useState<Playback | null>(null);
  const controller = useRef<AbortController | null>(null);

  useEffect(() => () => controller.current?.abort(), []);

  const play = async (from = 0) => {
    controller.current?.abort();
    const { signal } = (controller.current = new AbortController());
    for (let index = Math.max(0, from); index < ordered.length; index++) {
      setPlayback({ done: index, reveal: 0 });
      const finished = await animateGesture(
        ordered[index]!,
        (frame) => setPlayback({ done: index, reveal: frame.reveal }),
        { signal, speed }
      );
      if (!finished || !(await sleep(GESTURE_GAP_DURATION / speed, signal))) return;
    }
    setPlayback(null);
  };

  const stop = () => {
    controller.current?.abort();
    setPlayback(null);
  };

  return { playback, play, stop };
}
