'use client';

import { forwardRef, useLayoutEffect, useRef, useState } from 'react';
import { Stage, Layer, Line, Text } from 'react-konva';
import type Konva from 'konva';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import { CANVAS_DIMS, GesturePoint } from '~/tools/stroke_data/types';
import {
  main_text_path_visible_atom,
  font_size_atom,
  animated_gesture_lines_atom,
  temp_points_atom,
  selected_gesture_index_atom,
  gesture_data_atom,
  is_recording_atom,
  is_drawing_atom,
  current_drawing_points_atom,
  not_to_clear_gestures_index_atom,
  text_atom,
  font_family_atom,
  font_loaded_atom
} from './add_edit_state';
import { cn } from '~/lib/utils';

const KonvaCanvas = forwardRef<Konva.Stage>((_, ref) => {
  // Canvas state from atoms
  const mainTextPathVisible = useAtomValue(main_text_path_visible_atom);
  const text = useAtomValue(text_atom);
  const fontSize = useAtomValue(font_size_atom);
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
  const [fontFamily, setFontFamily] = useAtom(font_family_atom);
  const [fontLoaded, setFontLoaded] = useAtom(font_loaded_atom);

  const currentFontLoaded = fontLoaded.get(fontFamily) ?? false;

  // Accurately center the character using measured text box
  const textRef = useRef<Konva.Text | null>(null);
  const [textBox, setTextBox] = useState<{ width: number; height: number }>({
    width: 0,
    height: 0
  });

  useLayoutEffect(() => {
    const node = textRef.current;
    if (!node) return;
    // Ensure layout is up to date before measuring
    node.getLayer()?.batchDraw();
    const measured = node.getClientRect({ skipShadow: true, skipStroke: true });
    if (measured.width !== textBox.width || measured.height !== textBox.height) {
      setTextBox({ width: measured.width, height: measured.height });
    }
  }, [text, fontSize]);

  // Mouse event handlers for gesture recording
  const onMouseDown = (e: any) => {
    if (!isRecording || !selectedGesture) return;

    setIsDrawing(true);

    const pos = e.target.getStage().getPointerPosition();
    const point: GesturePoint = [pos.x, pos.y];

    setTempPoints([point]);
    setCurrentDrawingPoints([pos.x, pos.y]);
  };

  const onMouseMove = (e: any) => {
    if (!isRecording || !isDrawing || !selectedGesture) return;

    const pos = e.target.getStage().getPointerPosition();

    const point: GesturePoint = [pos.x, pos.y];

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
      className={cn('bg-white', isRecording && 'cursor-crosshair')}
    >
      <Layer>
        {/* Character Text */}
        <Text
          ref={textRef}
          x={CANVAS_DIMS.width / 2}
          y={CANVAS_DIMS.height / 2}
          text={text}
          fontSize={fontSize * 15}
          fontFamily={currentFontLoaded ? fontFamily : 'Arial'}
          fill="black"
          visible={mainTextPathVisible}
          offsetX={textBox.width / 2}
          offsetY={textBox.height / 2 - textBox.height * 0.06}
          draggable={!isRecording && !isDrawing}
        />

        {/* Animated Gesture Lines */}
        {animatedGestureLines.map((line) => (
          <Line
            key={`animated-${line.index}`}
            points={line.points_flat}
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
            points={tempPoints.flatMap((p) => [p[0], p[1]])}
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
