'use client';

import { forwardRef, useLayoutEffect, useRef, useState } from 'react';
import { Stage, Layer, Line, Text } from 'react-konva';
import type Konva from 'konva';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import { CANVAS_DIMS, GesturePoint } from '~/tools/stroke_data/types';
import {
  main_text_path_visible_atom,
  font_size_atom,
  animated_gestures_atom,
  selected_gesture_index_atom,
  gesture_data_atom,
  is_recording_atom,
  is_drawing_atom,
  current_gesture_recording_points_atom,
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
  const animatedGestures = useAtomValue(animated_gestures_atom);
  const selectedGestureIndex = useAtomValue(selected_gesture_index_atom);
  const gestureData = useAtomValue(gesture_data_atom);
  const isRecording = useAtomValue(is_recording_atom);
  const [isDrawing, setIsDrawing] = useAtom(is_drawing_atom);
  const [currentGestureRecordingPoints, setCurrentGestureRecordingPoints] = useAtom(
    current_gesture_recording_points_atom
  );
  const setNotToClearGesturesIndex = useSetAtom(not_to_clear_gestures_index_atom);

  // Get selected gesture for drawing style
  const selectedGesture = gestureData.find((g) => g.index.toString() === selectedGestureIndex);
  const [fontFamily] = useAtom(font_family_atom);
  const [fontLoaded] = useAtom(font_loaded_atom);

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
    setCurrentGestureRecordingPoints([point]);
  };

  const onMouseMove = (e: any) => {
    if (!isRecording || !isDrawing || !selectedGesture) return;

    const pos = e.target.getStage().getPointerPosition();

    const point: GesturePoint = [pos.x, pos.y];
    setCurrentGestureRecordingPoints((prev) => [...prev, point]);
  };

  const onMouseUp = () => {
    if (!isRecording || !isDrawing) return;

    setIsDrawing(false);
    // Keep the temp points for user to save or discard

    if (selectedGesture && gestureData.length === selectedGesture.index + 1) {
      // ^ only if last
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
        {animatedGestures.map((gesture) => (
          <Line
            key={`animated-${gesture.index}`}
            points={gesture.points_flat}
            stroke={gesture.color}
            strokeWidth={gesture.width}
            lineCap="round"
            lineJoin="round"
            listening={false}
            tension={1}
          />
        ))}

        {/* Current Drawing Line (during recording) */}
        {currentGestureRecordingPoints.length > 0 && selectedGesture && (
          <Line
            points={currentGestureRecordingPoints.flatMap((p) => [p[0], p[1]])}
            stroke={selectedGesture.color}
            strokeWidth={selectedGesture.width}
            lineCap="round"
            lineJoin="round"
            listening={false}
            tension={1}
          />
        )}
      </Layer>
    </Stage>
  );
});

KonvaCanvas.displayName = 'KonvaCanvas';

export default KonvaCanvas;
