'use client';

import { forwardRef, useMemo } from 'react';
import { Stage, Layer, Path, Line } from 'react-konva';
import type Konva from 'konva';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import { CANVAS_DIMS, GesturePoint } from '~/tools/stroke_data/types';
import {
  character_svg_path_atom,
  main_text_path_visible_atom,
  scale_down_factor_atom,
  animated_gesture_lines_atom,
  temp_points_atom,
  selected_gesture_index_atom,
  gesture_data_atom,
  is_recording_atom,
  is_drawing_atom,
  current_drawing_points_atom,
  not_to_clear_gestures_index_atom
} from './add_edit_state';
import { cn } from '~/lib/utils';

// Utility function to calculate SVG path bounding box
function getSVGPathBounds(pathData: string) {
  try {
    // Create a temporary SVG element to get path bounds
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', pathData);
    svg.appendChild(path);
    document.body.appendChild(svg);

    const bbox = path.getBBox();
    document.body.removeChild(svg);

    return {
      x: bbox.x,
      y: bbox.y,
      width: bbox.width,
      height: bbox.height
    };
  } catch (error) {
    console.warn('Failed to calculate path bounds:', error);
    // Fallback bounds
    return { x: 0, y: 0, width: 100, height: 100 };
  }
}

const KonvaCanvas = forwardRef<Konva.Stage>((_, ref) => {
  // Canvas state from atoms
  const characterSvgPath = useAtomValue(character_svg_path_atom);
  const mainTextPathVisible = useAtomValue(main_text_path_visible_atom);
  const scaleDownFactor = useAtomValue(scale_down_factor_atom);
  const animatedGestureLines = useAtomValue(animated_gesture_lines_atom);
  const [tempPoints, setTempPoints] = useAtom(temp_points_atom);
  const selectedGestureIndex = useAtomValue(selected_gesture_index_atom);
  const gestureData = useAtomValue(gesture_data_atom);
  const isRecording = useAtomValue(is_recording_atom);
  const [isDrawing, setIsDrawing] = useAtom(is_drawing_atom);
  const [currentDrawingPoints, setCurrentDrawingPoints] = useAtom(current_drawing_points_atom);
  const setNotToClearGesturesIndex = useSetAtom(not_to_clear_gestures_index_atom);

  // Get selected gesture for drawing style
  const selectedGesture = gestureData.find((g) => g.index.toString() === selectedGestureIndex);

  // Calculate proper centering for the character path
  const pathCentering = useMemo(() => {
    if (!characterSvgPath) return { offsetX: 0, offsetY: 0 };

    const bounds = getSVGPathBounds(characterSvgPath);
    const scale = !scaleDownFactor || scaleDownFactor !== 0 ? 1 / scaleDownFactor : 1;

    // Calculate the scaled dimensions
    const scaledWidth = bounds.width * scale;
    const scaledHeight = bounds.height * scale;

    // Calculate offset to center the path (accounting for its natural position)
    const offsetX = bounds.width / 2 + bounds.x;
    const offsetY = bounds.height / 2 + bounds.y;

    return { offsetX, offsetY };
  }, [characterSvgPath, scaleDownFactor]);

  // Mouse event handlers for gesture recording
  const onMouseDown = (e: any) => {
    if (!isRecording || !selectedGesture) return;

    setIsDrawing(true);

    const pos = e.target.getStage().getPointerPosition();
    const point: GesturePoint = {
      x: pos.x,
      y: pos.y
    };

    setTempPoints([point]);
    setCurrentDrawingPoints([pos.x, pos.y]);
  };

  const onMouseMove = (e: any) => {
    if (!isRecording || !isDrawing || !selectedGesture) return;

    const pos = e.target.getStage().getPointerPosition();

    const point: GesturePoint = {
      x: pos.x,
      y: pos.y
    };

    setTempPoints((prev) => [...prev, point]);
    setCurrentDrawingPoints((prev) => [...prev, pos.x, pos.y]);
  };

  const onMouseUp = () => {
    if (!isRecording || !isDrawing) return;

    setIsDrawing(false);
    // Keep the temp points for user to save or discard

    if (selectedGesture) {
      setNotToClearGesturesIndex((prev) => new Set(prev).add(selectedGesture.index));
    }
  };

  return (
    <Stage
      width={CANVAS_DIMS.width}
      height={CANVAS_DIMS.height}
      ref={ref}
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      onTouchStart={onMouseDown}
      onTouchMove={onMouseMove}
      onTouchEnd={onMouseUp}
      className={cn('bg-white', isDrawing && 'cursor-crosshair')}
    >
      <Layer>
        {/* Character Text Path */}
        {characterSvgPath && (
          <Path
            data={characterSvgPath}
            fill="black"
            stroke="#000000"
            strokeWidth={2}
            scaleX={!scaleDownFactor || scaleDownFactor !== 0 ? 1 / scaleDownFactor : 1}
            scaleY={!scaleDownFactor || scaleDownFactor !== 0 ? 1 / scaleDownFactor : 1}
            x={CANVAS_DIMS.width / 2}
            y={CANVAS_DIMS.height / 2}
            offsetX={pathCentering.offsetX}
            offsetY={pathCentering.offsetY}
            visible={mainTextPathVisible}
            listening={false}
          />
        )}

        {/* Animated Gesture Lines */}
        {animatedGestureLines.map((line) => (
          <Line
            key={`animated-${line.index}`}
            points={line.points}
            stroke={line.color}
            strokeWidth={line.width}
            lineCap="round"
            lineJoin="round"
            listening={false}
          />
        ))}

        {/* Current Drawing Line (during recording) */}
        {isRecording && isDrawing && currentDrawingPoints.length > 0 && selectedGesture && (
          <Line
            points={currentDrawingPoints}
            stroke={selectedGesture.color}
            strokeWidth={selectedGesture.width}
            lineCap="round"
            lineJoin="round"
            listening={false}
          />
        )}

        {/* Temporary recorded line (before save/cancel) */}
        {isRecording && !isDrawing && tempPoints.length > 0 && selectedGesture && (
          <Line
            points={tempPoints.flatMap((p) => [p.x, p.y])}
            stroke={selectedGesture.color}
            strokeWidth={selectedGesture.width}
            lineCap="round"
            lineJoin="round"
            listening={false}
          />
        )}
      </Layer>
    </Stage>
  );
});

KonvaCanvas.displayName = 'KonvaCanvas';

export default KonvaCanvas;
