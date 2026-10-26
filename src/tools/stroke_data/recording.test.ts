import { describe, expect, it } from 'vitest';
import { appendSample, EMPTY_RECORDING, recordingToGesture, type InputEvent } from './recording';

const mouse = (timeStamp: number): InputEvent =>
  // SAFETY: test double carrying only the fields appendSample reads.
  ({ timeStamp }) as MouseEvent;
const pen = (timeStamp: number, pressure: number): InputEvent =>
  // SAFETY: test double carrying only the fields appendSample reads.
  ({ timeStamp, pointerType: 'pen', pressure }) as PointerEvent;
const touch = (timeStamp: number, force: number, touchType?: 'stylus'): InputEvent =>
  // SAFETY: test double carrying only the fields appendSample reads; Touch can't be built in Node.
  // oxlint-disable-next-line anti-slop/no-chained-type-assertions -- partial DOM test double
  ({ timeStamp, touches: [{ force, touchType }], changedTouches: [] }) as unknown as TouchEvent;

describe('stroke recording', () => {
  it('stores timings relative to the first point and drops repeated points', () => {
    let rec = appendSample(EMPTY_RECORDING, [10, 10], mouse(1000.4));
    rec = appendSample(rec, [10, 10], mouse(1008));
    rec = appendSample(rec, [12, 11], mouse(1016.7));
    expect(recordingToGesture(rec)).toEqual({
      points: [
        [10, 10],
        [12, 11]
      ],
      timings: [0, 16],
      pressures: undefined
    });
  });

  it('keeps pen and Apple Pencil pressure, not mouse or finger', () => {
    const penRec = appendSample(
      appendSample(EMPTY_RECORDING, [0, 0], pen(0, 0.3)),
      [1, 1],
      pen(8, 0.61234)
    );
    expect(recordingToGesture(penRec).pressures).toEqual([0.3, 0.612]);

    const pencil = appendSample(EMPTY_RECORDING, [0, 0], touch(0, 0.4, 'stylus'));
    expect(recordingToGesture(pencil).pressures).toEqual([0.4]);

    const finger = appendSample(EMPTY_RECORDING, [0, 0], touch(0, 1));
    expect(recordingToGesture(finger).pressures).toBeUndefined();

    // A stroke with any point lacking pressure stores none
    const mixed = appendSample(
      appendSample(EMPTY_RECORDING, [0, 0], pen(0, 0.3)),
      [1, 1],
      mouse(8)
    );
    expect(recordingToGesture(mixed).pressures).toBeUndefined();
  });
});
