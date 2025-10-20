'use client';

import { forwardRef, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Stage, Layer, Line, Text, Path } from 'react-konva';
import type Konva from 'konva';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import { CANVAS_DIMS, GesturePoints } from '~/tools/stroke_data/types';
import { getSmoothenedPoints, pointsToSvgPath } from '~/tools/stroke_data/utils';
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
} from './gesture_add_edit_state';
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
    // Avoid measuring when text is hidden to prevent zero sizes overriding state
    if (!mainTextPathVisible) return;
    // Ensure layout is up to date before measuring
    node.getLayer()?.batchDraw();
    const measured = node.getClientRect({ skipShadow: true, skipStroke: true });
    if (measured.width !== textBox.width || measured.height !== textBox.height) {
      setTextBox({ width: measured.width, height: measured.height });
    }
  }, [text, fontSize, fontFamily, currentFontLoaded, mainTextPathVisible]);

  // Container ref used to keep the canvas within the viewport
  const containerRef = useRef<HTMLDivElement | null>(null);
  // Track scroll position when locking body to avoid jump-to-top
  const lockedScrollYRef = useRef<number>(0);

  const lockScroll = () => {
    lockedScrollYRef.current = window.scrollY || window.pageYOffset || 0;
    // Preserve current scroll position and prevent background scroll without jumping
    document.body.style.position = 'fixed';
    document.body.style.top = `-${lockedScrollYRef.current}px`;
    document.body.style.left = '0';
    document.body.style.right = '0';
    document.body.style.width = '100%';
    document.body.style.overflow = 'hidden';
  };

  const unlockScroll = () => {
    const top = document.body.style.top;
    document.body.style.position = '';
    document.body.style.top = '';
    document.body.style.left = '';
    document.body.style.right = '';
    document.body.style.width = '';
    document.body.style.overflow = '';
    const y = top ? Math.abs(parseInt(top, 10)) : lockedScrollYRef.current;
    window.scrollTo(0, y);
  };

  // Handle text drag end to update offset
  const handleTextDragEnd = (e: any) => {
    const textNode = e.target;
    const newX = textNode.x();
    const newY = textNode.y();
    // Calculate the offset from the original center position
    const centerX = CANVAS_DIMS.width / 2 - textBox.width / 2;
    const centerY = CANVAS_DIMS.height / 2 - textBox.height / 2 + textBox.height * 0.06;
    const offsetX = Math.round(newX - centerX);
    const offsetY = Math.round(newY - centerY);
    // Update the offset state
    setCanvasTextCenterOffset([offsetX, offsetY]);
  };

  type KonvaMouseTouchEvent =
    | Konva.KonvaEventObject<MouseEvent>
    | Konva.KonvaEventObject<TouchEvent>;

  // Mouse event handlers for gesture recording
  const onMouseDown = (e: KonvaMouseTouchEvent) => {
    if (!isRecording || !selectedGesture) return;

    setIsDrawing(true);

    const pos = e.currentTarget.getStage()?.getPointerPosition();
    if (!pos) return;
    const point: GesturePoints = [pos.x, pos.y];
    setCurrentGestureRecordingPoints([point]);
  };

  const onMouseMove = (e: KonvaMouseTouchEvent) => {
    if (!isRecording || !isDrawing || !selectedGesture) return;

    const pos = e.currentTarget.getStage()?.getPointerPosition();
    if (!pos) return;

    const point: GesturePoints = [pos.x, pos.y];
    setCurrentGestureRecordingPoints((prev) => [...prev, point]);
  };

  const onMouseUp = (e: KonvaMouseTouchEvent) => {
    if (!isRecording || !isDrawing) return;

    setIsDrawing(false);
    // Keep the temp points for user to save or discard

    if (selectedGesture && gestureData.length === selectedGesture.index + 1) {
      // ^ only if last gesture in the list
      setNotToClearGesturesIndex((prev) => new Set(prev).add(selectedGesture.index));
    }
  };

  // Prevent pull-to-refresh and other navigation gestures on mobile
  useEffect(() => {
    if (!isRecording) return;

    // Lock page scroll without jumping to top
    lockScroll();

    // Ensure the full canvas is brought into view when recording starts
    requestAnimationFrame(() => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const fullyInView =
        rect.top >= 0 &&
        rect.left >= 0 &&
        rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) &&
        rect.right <= (window.innerWidth || document.documentElement.clientWidth);
      if (!fullyInView) {
        containerRef.current.scrollIntoView({
          block: 'center',
          inline: 'center',
          behavior: 'smooth'
        });
      }
    });

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
      // Unlock page scroll and restore previous position
      unlockScroll();

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
      ref={containerRef}
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
            x={Math.round(BASE_TEXT_CORRDINATES[0])}
            y={Math.round(BASE_TEXT_CORRDINATES[1])}
            text={text}
            fontSize={fontSize * 15}
            fontFamily={currentFontLoaded ? fontFamily : 'Arial'}
            fill="black"
            visible={mainTextPathVisible}
            // offsetX={textBox.width / 2}
            // offsetY={textBox.height / 2 - textBox.height * 0.06}
            draggable={
              !isRecording &&
              !isDrawing &&
              currentFontLoaded &&
              textBox.width > 0 &&
              textBox.height > 0
            }
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
                // points={flattenPoints(gesture.points)}
                data={pointsToSvgPath(
                  gesture.isAnimatedPath
                    ? gesture.points
                    : getSmoothenedPoints(gesture.points, {
                        size: gesture.width,
                        simulatePressure: gesture.simulate_pressure
                      })
                  // to prevent smoothening multiple times which distorts the path
                )}
                fill={gesture.color}
                strokeEnabled={false}
                listening={false}
              />
            ))}

          {/* Current Drawing Path (during recording) */}
          {currentGestureRecordingPoints.length > 2 && selectedGesture && (
            <Path
              data={pointsToSvgPath(
                getSmoothenedPoints(currentGestureRecordingPoints, {
                  size: selectedGesture.width,
                  simulatePressure: selectedGesture.simulate_pressure
                })
              )}
              fill={selectedGesture.color}
              strokeEnabled={false}
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
