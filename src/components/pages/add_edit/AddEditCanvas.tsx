'use client';

import { forwardRef, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Stage, Layer, Path, Text } from 'react-konva';
import type Konva from 'konva';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import { CANVAS_DIMS, GesturePoint } from '~/tools/stroke_data/types';
import {
  gesturePointsToPath,
  smoothRawPoints,
  smoothGesturePointsRealtime
} from '~/tools/stroke_data/utils';
import {
  main_text_path_visible_atom,
  font_size_atom,
  canvas_gestures_path_atom,
  selected_gesture_index_atom,
  gesture_data_atom,
  is_recording_atom,
  is_drawing_atom,
  current_gesture_recording_points_atom,
  not_to_clear_gestures_index_atom,
  text_atom,
  font_family_atom,
  font_loaded_atom,
  canvas_text_center_offset_atoms
} from './add_edit_state';
import { cn } from '~/lib/utils';

const KonvaCanvas = forwardRef<Konva.Stage>((_, ref) => {
  // Canvas state from atoms
  const mainTextPathVisible = useAtomValue(main_text_path_visible_atom);
  const text = useAtomValue(text_atom);
  const fontSize = useAtomValue(font_size_atom);
  const canvasGesturesPath = useAtomValue(canvas_gestures_path_atom);
  const selectedGestureIndex = useAtomValue(selected_gesture_index_atom);
  const gestureData = useAtomValue(gesture_data_atom);
  const isRecording = useAtomValue(is_recording_atom);
  const [isDrawing, setIsDrawing] = useAtom(is_drawing_atom);
  const [currentGestureRecordingPoints, setCurrentGestureRecordingPoints] = useAtom(
    current_gesture_recording_points_atom
  );
  const setNotToClearGesturesIndex = useSetAtom(not_to_clear_gestures_index_atom);

  // Get selected gesture for drawing style
  const selectedGesture = gestureData.find((g) => g.index === selectedGestureIndex);
  const [fontFamily] = useAtom(font_family_atom);
  const [fontLoaded] = useAtom(font_loaded_atom);

  const currentFontLoaded = fontLoaded.get(fontFamily) ?? false;

  // Accurately center the character using measured text box
  const textRef = useRef<Konva.Text | null>(null);
  const [textBox, setTextBox] = useState<{ width: number; height: number }>({
    width: 0,
    height: 0
  });
  const [canvasTextCenterOffset, setCanvasTextCenterOffset] = useAtom(
    canvas_text_center_offset_atoms
  );

  const BASE_TEXT_CORRDINATES = [
    CANVAS_DIMS.width / 2 - textBox.width / 2 + canvasTextCenterOffset[0],
    CANVAS_DIMS.height / 2 - textBox.height / 2 + textBox.height * 0.06 + canvasTextCenterOffset[1]
  ];

  // version of useEffect that runs before brower repaints the screen
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

  // Handle text drag end to update offset
  const handleTextDragEnd = (e: any) => {
    const textNode = e.target;
    const newX = textNode.x();
    const newY = textNode.y();
    // Calculate the offset from the original center position
    const centerX = CANVAS_DIMS.width / 2 - textBox.width / 2;
    const centerY = CANVAS_DIMS.height / 2 - textBox.height / 2 + textBox.height * 0.06;
    const offsetX = newX - centerX;
    const offsetY = newY - centerY;
    // Update the offset state
    setCanvasTextCenterOffset([offsetX, offsetY]);
  };

  // Mouse event handlers for gesture recording
  const onMouseDown = (e: any) => {
    if (!isRecording || !selectedGesture) return;

    setIsDrawing(true);

    const pos = e.target.getStage().getPointerPosition();
    const point: GesturePoint = ['M', pos.x, pos.y]; // Move command for start point
    setCurrentGestureRecordingPoints([point]);
  };

  const onMouseMove = (e: any) => {
    if (!isRecording || !isDrawing || !selectedGesture) return;

    const pos = e.target.getStage().getPointerPosition();

    const point: GesturePoint = ['L', pos.x, pos.y]; // Line command for subsequent points
    setCurrentGestureRecordingPoints((prev) => [...prev, point]);
  };

  const onMouseUp = () => {
    if (!isRecording || !isDrawing) return;

    setIsDrawing(false);
    // Keep the temp points for user to save or discard

    const smoothedPoints = smoothRawPoints([...currentGestureRecordingPoints]);
    setCurrentGestureRecordingPoints(smoothedPoints);

    if (selectedGesture && gestureData.length === selectedGesture.index + 1) {
      // ^ only if last gesture in the list
      setNotToClearGesturesIndex((prev) => new Set(prev).add(selectedGesture.index));
    }
  };

  // Prevent pull-to-refresh and other navigation gestures on mobile
  useEffect(() => {
    // Set body overflow to prevent page scroll when recording
    if (isRecording) {
      document.body.style.overflow = 'hidden';
      document.body.style.position = 'fixed';
      document.body.style.width = '100%';
      document.body.style.height = '100%';
    } else {
      document.body.style.overflow = '';
      document.body.style.position = '';
      document.body.style.width = '';
      document.body.style.height = '';
    }

    if (!isRecording) {
      return;
    }

    const isDrawingCanvas = (target: Element | null): boolean => {
      return !!(
        target &&
        (target.closest('[data-drawing-canvas]') ||
          target.hasAttribute('data-drawing-canvas') ||
          target.closest('canvas') ||
          target.tagName === 'CANVAS')
      );
    };

    const preventTouchNavigation = (e: TouchEvent) => {
      // Prevent all browser navigation gestures when touching the drawing canvas
      if (isDrawingCanvas(e.target as Element)) {
        e.preventDefault();
        e.stopPropagation();
      }
    };

    const preventGestureZoom = (e: Event) => {
      // Prevent pinch-to-zoom and other gesture events on the canvas
      if (isDrawingCanvas(e.target as Element)) {
        e.preventDefault();
      }
    };

    const preventContextMenu = (e: Event) => {
      // Prevent long press context menu on mobile
      if (isDrawingCanvas(e.target as Element)) {
        e.preventDefault();
      }
    };

    const preventDoubleClickZoom = (e: Event) => {
      // Prevent double-click zoom on mobile
      if (isDrawingCanvas(e.target as Element)) {
        e.preventDefault();
      }
    };

    // Add event listeners with passive: false to allow preventDefault
    document.addEventListener('touchstart', preventTouchNavigation, { passive: false });
    document.addEventListener('touchmove', preventTouchNavigation, { passive: false });
    document.addEventListener('touchend', preventTouchNavigation, { passive: false });
    document.addEventListener('gesturestart', preventGestureZoom, { passive: false });
    document.addEventListener('gesturechange', preventGestureZoom, { passive: false });
    document.addEventListener('gestureend', preventGestureZoom, { passive: false });
    document.addEventListener('contextmenu', preventContextMenu, { passive: false });
    document.addEventListener('dblclick', preventDoubleClickZoom, { passive: false });

    return () => {
      // Reset body styles
      document.body.style.overflow = '';
      document.body.style.position = '';
      document.body.style.width = '';
      document.body.style.height = '';

      // Remove event listeners
      document.removeEventListener('touchstart', preventTouchNavigation);
      document.removeEventListener('touchmove', preventTouchNavigation);
      document.removeEventListener('touchend', preventTouchNavigation);
      document.removeEventListener('gesturestart', preventGestureZoom);
      document.removeEventListener('gesturechange', preventGestureZoom);
      document.removeEventListener('gestureend', preventGestureZoom);
      document.removeEventListener('contextmenu', preventContextMenu);
      document.removeEventListener('dblclick', preventDoubleClickZoom);
    };
  }, [isRecording]);

  return (
    <div
      className={cn('inline-block touch-none select-none', isRecording && 'cursor-crosshair')}
      style={{
        // Critical: Prevent all browser touch gestures on this container
        touchAction: 'none',
        WebkitTouchCallout: 'none',
        WebkitUserSelect: 'none',
        userSelect: 'none',
        // Prevent iOS Safari bounce and zoom
        WebkitOverflowScrolling: 'touch',
        overscrollBehavior: 'none',
        // Prevent context menu on long press
        WebkitTapHighlightColor: 'transparent'
      }}
      data-drawing-canvas="true"
    >
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
        className="bg-white"
      >
        <Layer>
          {/* Character Text */}
          <Text
            ref={textRef}
            x={BASE_TEXT_CORRDINATES[0]}
            y={BASE_TEXT_CORRDINATES[1]}
            text={text}
            fontSize={fontSize * 15}
            fontFamily={currentFontLoaded ? fontFamily : 'Arial'}
            fill="black"
            visible={mainTextPathVisible}
            // offsetX={textBox.width / 2}
            // offsetY={textBox.height / 2 - textBox.height * 0.06}
            draggable={!isRecording && !isDrawing}
            onDragEnd={handleTextDragEnd}
          />
          {/* ^ the offset is being subracted from the x and y coordinates of the text */}

          {/* Animated Gesture Paths */}
          {canvasGesturesPath
            .filter((g) => !(isRecording && g.index === selectedGestureIndex))
            // ^ not displaying the current gesture even if marked while recording
            .map((gesture) => (
              <Path
                key={`animated-${gesture.index}`}
                data={gesture.path_string}
                stroke={gesture.color}
                strokeWidth={gesture.width}
                lineCap="round"
                lineJoin="round"
                listening={false}
              />
            ))}

          {/* Current Drawing Path (during recording) */}
          {currentGestureRecordingPoints.length > 0 && selectedGesture && (
            <Path
              data={gesturePointsToPath(
                isRecording
                  ? smoothGesturePointsRealtime(currentGestureRecordingPoints)
                  : currentGestureRecordingPoints
              )}
              stroke={selectedGesture.color}
              strokeWidth={selectedGesture.width}
              lineCap="round"
              lineJoin="round"
              listening={false}
            />
          )}
        </Layer>
      </Stage>
    </div>
  );
});

KonvaCanvas.displayName = 'KonvaCanvas';

export default KonvaCanvas;
