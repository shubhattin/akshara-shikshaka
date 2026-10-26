import type { Gesture, GesturePoints } from './types';

/** A stroke being recorded: points plus per-point capture metadata */
export type StrokeRecording = {
  points: GesturePoints[];
  /** `Event.timeStamp` of each point */
  times: number[];
  /** Pen/stylus pressure of each point, `null` when the input reports none */
  pressures: (number | null)[];
};

export const EMPTY_RECORDING: StrokeRecording = { points: [], times: [], pressures: [] };

declare global {
  interface Touch {
    /** Safari only: `stylus` for Apple Pencil */
    readonly touchType?: 'direct' | 'stylus';
  }
}

/** The DOM events Konva hands its pointer handlers */
export type InputEvent = MouseEvent | TouchEvent | PointerEvent;

/**
 * Pressure only means something from a pen: mouse reports a constant 0.5 while pressed and touch
 * screens report 0 or 1, so those are left out rather than stored as fake data.
 */
function readPenPressure(evt: InputEvent): number | null {
  if ('touches' in evt) {
    const touch = evt.touches[0] ?? evt.changedTouches[0];
    return touch?.touchType === 'stylus' ? touch.force : null;
  }
  if ('pointerType' in evt) return evt.pointerType === 'pen' ? evt.pressure : null;
  return null;
}

/** Adds a sample, skipping exact repeats of the previous point (they carry no shape) */
export function appendSample(
  recording: StrokeRecording,
  point: GesturePoints,
  evt: InputEvent
): StrokeRecording {
  const last = recording.points.at(-1);
  if (last && last[0] === point[0] && last[1] === point[1]) return recording;
  return {
    points: [...recording.points, point],
    times: [...recording.times, evt.timeStamp],
    pressures: [...recording.pressures, readPenPressure(evt)]
  };
}

/**
 * The recording as stored gesture fields. Every key is always present (pressures `undefined`
 * unless every point had one) so spreading it over a gesture replaces the previous recording.
 */
export function recordingToGesture(
  recording: StrokeRecording
): Required<Pick<Gesture, 'points' | 'timings'>> & Pick<Gesture, 'pressures'> {
  const start = recording.times[0] ?? 0;
  const { pressures } = recording;
  const hasPressure = (values: (number | null)[]): values is number[] =>
    values.length > 0 && values.every((p) => p !== null);
  return {
    points: recording.points,
    timings: recording.times.map((t) => Math.round(t - start)),
    pressures: hasPressure(pressures)
      ? pressures.map((p) => Math.round(p * 1000) / 1000)
      : undefined
  };
}
