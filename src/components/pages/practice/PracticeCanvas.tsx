'use client';

import { forwardRef, useEffect, useState } from 'react';
import { Stage, Layer, Path } from 'react-konva';
import type Konva from 'konva';
import { useAtom, useAtomValue } from 'jotai';
import type { GesturePoints, Gesture } from '~/tools/stroke_data/types';
import { CANVAS_DIMS } from '~/tools/stroke_data/types';
import { getSmoothenedPoints, pointsToSvgPath } from '~/tools/stroke_data/utils';
import {
  scaling_factor_atom,
  animated_gesture_lines_atom,
  current_gesture_points_atom,
  is_recording_stroke_atom,
  is_drawing_atom,
  current_gesture_index_atom,
  canvas_current_mode,
  USER_GESTURE_COLOR,
  completed_gestures_count_atom
} from './practice_state';
import { cn } from '~/lib/utils';

interface PracticeKonvaCanvasProps {
  gestureData: Gesture[];
  onUserStroke: (points: GesturePoints[]) => void;
}

const PracticeKonvaCanvas = forwardRef<Konva.Stage, PracticeKonvaCanvasProps>(
  ({ gestureData, onUserStroke }, ref) => {
    // Canvas state from atoms
    const scalingFactor = useAtomValue(scaling_factor_atom);
    const animatedGestureLines = useAtomValue(animated_gesture_lines_atom);
    const [currentGesturePoints, setCurrentGesturePoints] = useAtom(current_gesture_points_atom);
    const [isRecordingStroke, setIsRecordingStroke] = useAtom(is_recording_stroke_atom);
    const isDrawing = useAtomValue(is_drawing_atom);
    const canvasCurrentMode = useAtomValue(canvas_current_mode);

    const [completedGesturesCount] = useAtom(completed_gestures_count_atom);

    // Get current gesture for brush settings
    const currentGestureIndex = useAtomValue(current_gesture_index_atom);
    const currentGesture = gestureData[currentGestureIndex];

    // Calculate responsive canvas dimensions
    const canvasWidth = CANVAS_DIMS.width * scalingFactor;
    const canvasHeight = CANVAS_DIMS.height * scalingFactor;

    // Mouse/touch event handlers for drawing
    const handleStageMouseDown = (e: any) => {
      if (!isDrawing || !isDrawing) return;

      setIsRecordingStroke(true);

      const pos = e.target.getStage().getPointerPosition();
      // Scale coordinates back to logical space
      const scaledPos = {
        x: pos.x / scalingFactor,
        y: pos.y / scalingFactor
      };

      setCurrentGesturePoints([[scaledPos.x, scaledPos.y]]);
    };

    const handleStageMouseMove = (e: any) => {
      if (!isDrawing || !isDrawing || !isRecordingStroke) return;

      const pos = e.target.getStage().getPointerPosition();
      // Scale coordinates back to logical space
      const scaledPos = {
        x: pos.x / scalingFactor,
        y: pos.y / scalingFactor
      };

      setCurrentGesturePoints((prev) => [...prev, [scaledPos.x, scaledPos.y]]);
    };

    const handleStageMouseUp = () => {
      if (!isDrawing || !isRecordingStroke) return;

      setIsRecordingStroke(false);

      // Apply final smoothing with stroke correction for better results
      let finalGesturePoints: GesturePoints[] = currentGesturePoints;
      // compare the original points recorded for accuarcy and not the smoothened points

      if (finalGesturePoints.length > 1) {
        onUserStroke(finalGesturePoints);
      }
    };

    // Prevent pull-to-refresh and other navigation gestures on mobile
    useEffect(() => {
      // Set body overflow to prevent page scroll when in practice mode
      if (canvasCurrentMode === 'practicing' && completedGesturesCount !== gestureData.length) {
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

      if (canvasCurrentMode !== 'practicing' || completedGesturesCount === gestureData.length) {
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
    }, [canvasCurrentMode, completedGesturesCount, gestureData.length]);

    return (
      <div
        className={cn(
          'inline-block touch-none select-none',
          canvasCurrentMode === 'practicing' && 'cursor-crosshair'
        )}
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
          width={canvasWidth}
          height={canvasHeight}
          scale={{ x: scalingFactor, y: scalingFactor }}
          ref={ref}
          onMouseDown={handleStageMouseDown}
          onMouseMove={handleStageMouseMove}
          onMouseUp={handleStageMouseUp}
          onTouchStart={handleStageMouseDown}
          onTouchMove={handleStageMouseMove}
          onTouchEnd={handleStageMouseUp}
          className="bg-white"
        >
          <Layer>
            {/* Animated Gesture Paths (guidance and completed strokes) */}
            {animatedGestureLines.map((line, index) => (
              <Path
                key={`gesture-path-${line.index}-${index}`}
                data={pointsToSvgPath(
                  line.isAnimatedPath
                    ? line.points
                    : getSmoothenedPoints(line.points, {
                        size: line.width,
                        simulatePressure: line.simulate_pressure
                      })
                )}
                fill={line.color}
                strokeEnabled={false}
                listening={false}
              />
            ))}

            {/* Current Drawing Stroke (while user is drawing) */}
            {currentGesturePoints.length > 2 && currentGesture && (
              <Path
                data={pointsToSvgPath(
                  getSmoothenedPoints(currentGesturePoints, {
                    size: currentGesture.width || 6,
                    simulatePressure: currentGesture.simulate_pressure
                  }) as GesturePoints[]
                )}
                fill={USER_GESTURE_COLOR}
                strokeEnabled={false}
                listening={false}
              />
            )}
          </Layer>
        </Stage>
      </div>
    );
  }
);

PracticeKonvaCanvas.displayName = 'PracticeKonvaCanvas';

export default PracticeKonvaCanvas;
