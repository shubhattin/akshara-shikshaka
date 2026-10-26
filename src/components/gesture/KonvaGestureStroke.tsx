import { Group, Path } from 'react-konva';
import {
  getRevealClipPath,
  getStrokeRender,
  type StrokeStyle
} from '~/tools/stroke_data/stroke_render';

/**
 * A recorded stroke on a Konva layer. While `reveal` is set, the full outline is clipped to the
 * part of the stroke the pen has covered so far (see `getStrokeRender`).
 */
export function KonvaGestureStroke({
  stroke,
  color,
  reveal
}: {
  stroke: StrokeStyle;
  color: string;
  reveal?: number;
}) {
  // react-konva's custom renderer is incompatible with React Compiler memoization.
  'use no memo';

  const render = getStrokeRender(stroke);
  const clip = reveal === undefined ? null : getRevealClipPath(render, reveal);
  const path = (
    <Path
      data={render.path}
      fill={color}
      strokeEnabled={false}
      listening={false}
      perfectDrawEnabled={false}
    />
  );
  if (clip === null) return path;
  return (
    <Group listening={false} clipFunc={() => [new Path2D(clip)]}>
      {path}
    </Group>
  );
}
