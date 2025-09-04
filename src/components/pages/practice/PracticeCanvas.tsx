'use client';

import { forwardRef, useEffect, useState } from 'react';
import { Stage, Layer, Line } from 'react-konva';
import type Konva from 'konva';
import { useAtom, useAtomValue } from 'jotai';
import type { GesturePoint, Gesture } from '~/tools/stroke_data/types';
import { CANVAS_DIMS } from '~/tools/stroke_data/types';
import {
  scaling_factor_atom,
  animated_gesture_lines_atom,
  drawing_points_atom,
  is_recording_stroke_atom,
  is_drawing_atom,
  current_gesture_index_atom
} from './practice_state';
import { cn } from '~/lib/utils';

interface PracticeKonvaCanvasProps {
  gestureData: Gesture[];
  onUserStroke: (points: GesturePoint[]) => void;
}

const PracticeKonvaCanvas = forwardRef<Konva.Stage, PracticeKonvaCanvasProps>(
  ({ gestureData, onUserStroke }, ref) => {
    // Canvas state from atoms
    const scalingFactor = useAtomValue(scaling_factor_atom);
    const animatedGestureLines = useAtomValue(animated_gesture_lines_atom);
    const [drawingPoints, setDrawingPoints] = useAtom(drawing_points_atom);
    const [isRecordingStroke, setIsRecordingStroke] = useAtom(is_recording_stroke_atom);
    const isDrawing = useAtomValue(is_drawing_atom);

    // Local state for tracking stroke
    const [strokeStartTime, setStrokeStartTime] = useState(0);

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
      setStrokeStartTime(Date.now());

      const pos = e.target.getStage().getPointerPosition();
      // Scale coordinates back to logical space
      const scaledPos = {
        x: pos.x / scalingFactor,
        y: pos.y / scalingFactor
      };

      setDrawingPoints([scaledPos.x, scaledPos.y]);
    };

    const handleStageMouseMove = (e: any) => {
      if (!isDrawing || !isDrawing || !isRecordingStroke) return;

      const pos = e.target.getStage().getPointerPosition();
      // Scale coordinates back to logical space
      const scaledPos = {
        x: pos.x / scalingFactor,
        y: pos.y / scalingFactor
      };

      setDrawingPoints((prev) => [...prev, scaledPos.x, scaledPos.y]);
    };

    const handleStageMouseUp = () => {
      if (!isDrawing || !isRecordingStroke) return;

      setIsRecordingStroke(false);

      // Convert drawing points to GesturePoint format
      const gesturePoints: GesturePoint[] = [];
      const baseTime = strokeStartTime;

      for (let i = 0; i < drawingPoints.length; i += 2) {
        const x = drawingPoints[i];
        const y = drawingPoints[i + 1];

        gesturePoints.push([x, y]);
      }

      // Clear drawing points and notify parent
      setDrawingPoints([]);

      if (gesturePoints.length > 1) {
        onUserStroke(gesturePoints);
      }
    };

    return (
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
        className={cn('bg-white', isRecordingStroke && 'cursor-crosshair')}
      >
        <Layer>
          {/* Animated Gesture Lines (guidance and completed strokes) */}
          {animatedGestureLines.map((line, index) => (
            <Line
              key={`gesture-line-${line.index}-${index}`}
              points={line.points_flat} // No scaling needed - Stage handles it
              stroke={line.color}
              strokeWidth={line.width} // No scaling needed - Stage handles it
              lineCap="round"
              lineJoin="round"
              listening={false}
              opacity={
                line.gesture_type === 'user_gesture'
                  ? 0.8
                  : line.gesture_type === 'current_animated_gesture'
                    ? 1
                    : 0.6
              }
              dash={
                line.gesture_type === 'current_animated_gesture'
                  ? []
                  : line.gesture_type === 'user_gesture'
                    ? []
                    : [5, 5]
              }
            />
          ))}

          {/* Current Drawing Stroke (while user is drawing) */}
          {isDrawing &&
            isDrawing &&
            isRecordingStroke &&
            drawingPoints.length > 0 &&
            currentGesture && (
              <Line
                points={drawingPoints} // No scaling needed - Stage handles it
                stroke="#0066cc"
                strokeWidth={currentGesture.width || 6}
                lineCap="round"
                lineJoin="round"
                listening={false}
              />
            )}
        </Layer>
      </Stage>
    );
  }
);

PracticeKonvaCanvas.displayName = 'PracticeKonvaCanvas';

export default PracticeKonvaCanvas;
