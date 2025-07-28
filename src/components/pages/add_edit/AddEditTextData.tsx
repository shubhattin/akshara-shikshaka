'use client';

import { type Canvas } from 'fabric';
import { useEffect, useRef, useState } from 'react';
import { Button } from '~/components/ui/button';
import { Card } from '~/components/ui/card';
import { Input } from '~/components/ui/input';
import { Label } from '~/components/ui/label';
import { Slider } from '~/components/ui/slider';
import * as fabric from 'fabric';
import { client_q } from '~/api/client';
import { useRouter } from 'next/navigation';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger
} from '~/components/ui/alert-dialog';
import { IoMdAdd } from 'react-icons/io';
import { FiSave } from 'react-icons/fi';
import { MdDeleteOutline, MdPlayArrow, MdStop, MdClear, MdFiberManualRecord } from 'react-icons/md';
import { toast } from 'sonner';
import { cn } from '~/lib/utils';

// Gesture Types
type StrokePoint = {
  x: number;
  y: number;
  timestamp: number;
};

type Stroke = {
  order: number;
  points: StrokePoint[];
};

type Gesture = {
  order: number;
  strokes: Stroke[];
  brush_width: number;
  brush_color: string;
  animation_duration: number;
};

type StrokeData = {
  gestures: Gesture[];
};

type text_data_type = {
  text: string;
  id?: number;
  uuid?: string;
  strokes_json?: StrokeData;
};

type Props =
  | {
      text_data: text_data_type;
      location: 'add';
    }
  | {
      location: 'edit';
      text_data: text_data_type & {
        id: number;
        uuid: string;
      };
    };

export default function AddEditTextData({ text_data, location }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fabricCanvasRef = useRef<Canvas>(null);
  const canceledRef = useRef(false);
  const [text, setText] = useState(text_data.text);
  const [savedText, setSavedText] = useState(text_data.text);
  const [textEditMode, setTextEditMode] = useState(location === 'add' && true);
  const [scaleDownFactor, setScaleDownFactor] = useState(4.5);

  // Gesture Recording State
  const [strokeData, setStrokeData] = useState<StrokeData>(
    text_data.strokes_json || {
      gestures: []
    }
  );
  const [selectedGestureId, setSelectedGestureId] = useState<string | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentStroke, setCurrentStroke] = useState<StrokePoint[]>([]);
  const [recordingStartTime, setRecordingStartTime] = useState<number>(0);
  const [tempStrokes, setTempStrokes] = useState<Stroke[]>([]);
  const [characterPath, setCharacterPath] = useState<fabric.Path | null>(null);

  const initCanvas = async () => {
    if (!canvasRef.current) return;

    // Clean up existing canvas first
    if (fabricCanvasRef.current) {
      fabricCanvasRef.current.dispose();
      fabricCanvasRef.current = null;
    }

    // Dynamic import to avoid SSR issues
    const fabricModule = await import('fabric');
    const fab = (fabricModule as any).fabric || (fabricModule as any).default || fabricModule;
    if (canceledRef.current) return;

    // Check if the canvas element already has a Fabric instance
    // This can happen in React StrictMode
    const existingCanvas = (canvasRef.current as any).__fabric;
    if (existingCanvas) {
      existingCanvas.dispose();
      delete (canvasRef.current as any).__fabric;
    }

    // Initialize Fabric.js canvas
    const canvas = new fab.Canvas(canvasRef.current, {
      width: 400,
      height: 400,
      backgroundColor: '#ffffff',
      isDrawingMode: false // Explicitly disable drawing mode initially
    });

    // Store reference on the canvas element itself for cleanup
    (canvasRef.current as any).__fabric = canvas;

    fabricCanvasRef.current = canvas;
  };

  // Function to approximate gesture points to the character path
  const approximateToCharacterPath = (
    gesturePoints: StrokePoint[],
    charPath: fabric.Path
  ): StrokePoint[] => {
    // Get the path's bounding box
    const pathBounds = charPath.getBoundingRect();
    const pathCenter = {
      x: pathBounds.left + pathBounds.width / 2,
      y: pathBounds.top + pathBounds.height / 2
    };

    // Simple approximation: snap points that are close to the character path
    const snapThreshold = 20; // pixels

    return gesturePoints.map((point) => {
      // Get the path outline points (simplified approach)
      // In a production app, you'd use a more sophisticated algorithm
      // to find the closest point on the actual path curve

      // For now, we'll do a simple distance-based snapping
      const distToCenter = Math.sqrt(
        Math.pow(point.x - pathCenter.x, 2) + Math.pow(point.y - pathCenter.y, 2)
      );

      // If the point is within the character bounds, keep it closer to the path
      if (
        point.x >= pathBounds.left - snapThreshold &&
        point.x <= pathBounds.left + pathBounds.width + snapThreshold &&
        point.y >= pathBounds.top - snapThreshold &&
        point.y <= pathBounds.top + pathBounds.height + snapThreshold
      ) {
        // This is a simplified approximation
        // In reality, you'd want to find the nearest point on the actual path
        return {
          ...point,
          // Add a slight magnetic effect towards the path
          x: point.x,
          y: point.y
        };
      }

      return point;
    });
  };

  const setupGestureRecording = () => {
    if (!fabricCanvasRef.current || !selectedGesture) return;

    const canvas = fabricCanvasRef.current;

    // Enable free drawing mode
    canvas.isDrawingMode = true;
    canvas.freeDrawingBrush = new fabric.PencilBrush(canvas);
    canvas.freeDrawingBrush.color = selectedGesture.brush_color;
    canvas.freeDrawingBrush.width = selectedGesture.brush_width;

    // Clear all previous listeners first
    canvas.off('path:created');

    // Listen for path creation with proper closure
    const handlePathCreated = (e: any) => {
      if (!e.path) return;

      console.log('Path created during recording');

      // Mark the path as gesture visualization
      e.path.set({
        selectable: false,
        evented: false,
        isGestureVisualization: true
      });

      // Extract points from the path
      const pathData = e.path.path;
      const points: StrokePoint[] = [];
      const baseTime = recordingStartTime;

      // Convert SVG path commands to points
      pathData.forEach((cmd: any, index: number) => {
        if (cmd[0] === 'M' || cmd[0] === 'L') {
          points.push({
            x: cmd[1],
            y: cmd[2],
            timestamp: index * 10 // Relative timestamps starting from 0
          });
        } else if (cmd[0] === 'Q' && cmd.length >= 5) {
          // Quadratic bezier curve - add end point
          points.push({
            x: cmd[3],
            y: cmd[4],
            timestamp: index * 10 // Relative timestamps starting from 0
          });
        }
      });

      if (points.length > 1) {
        // Apply path approximation if character path exists
        const approximatedPoints = characterPath
          ? approximateToCharacterPath(points, characterPath)
          : points;

        console.log('Adding stroke with', approximatedPoints.length, 'points');
        setTempStrokes((prev) => {
          const newStrokes = [...prev, { order: prev.length, points: approximatedPoints }];
          console.log('Total temp strokes:', newStrokes.length);
          return newStrokes;
        });
      }
    };

    canvas.on('path:created', handlePathCreated);
  };

  const render_text_path = async (text: string) => {
    const hbjs = await import('~/tools/harfbuzz/index');

    const FONT_URL = '/fonts/regular/Nirmala.ttf';
    await Promise.all([hbjs.preload_harfbuzzjs_wasm(), hbjs.preload_font_from_url(FONT_URL)]);

    const svg_path = await hbjs.get_text_svg_path(text, FONT_URL);
    if (svg_path && fabricCanvasRef.current) {
      const SCALE_FACTOR = !scaleDownFactor || scaleDownFactor !== 0 ? 1 / scaleDownFactor : 1;
      const pathObject = new fabric.Path(svg_path, {
        fill: 'black',
        stroke: '#000000', // black
        strokeWidth: 2,
        selectable: true,
        scaleX: SCALE_FACTOR,
        scaleY: SCALE_FACTOR,
        evented: false,
        lockScalingX: false,
        lockScalingY: false,
        lockRotation: true,
        lockMovementX: false,
        lockMovementY: false
      });

      // clear prev path objects
      fabricCanvasRef.current?.getObjects().forEach((obj) => {
        if (obj instanceof fabric.Path && !obj.get('isGestureVisualization')) {
          fabricCanvasRef.current?.remove(obj);
        }
      });

      // Center the character on canvas
      fabricCanvasRef.current?.centerObject(pathObject);
      fabricCanvasRef.current?.add(pathObject);
      fabricCanvasRef.current?.renderAll();

      // Store the character path for approximation
      setCharacterPath(pathObject);
    }
  };

  const addNewGesture = () => {
    const newGesture: Gesture = {
      order: strokeData.gestures.length,
      strokes: [],
      brush_width: 6,
      brush_color: '#ff0000', // red
      animation_duration: 600
    };
    setStrokeData((prev) => ({
      ...prev,
      gestures: [...prev.gestures, newGesture]
    }));
    clearGestureVisualization();
    setSelectedGestureId(newGesture.order.toString());
  };

  const clearCurrentGesture = () => {
    if (!selectedGestureId) return;
    setStrokeData((prev) => ({
      ...prev,
      gestures: prev.gestures.map((gesture) =>
        gesture.order === parseInt(selectedGestureId, 10) ? { ...gesture, strokes: [] } : gesture
      )
    }));
    clearGestureVisualization();
  };

  const deleteGesture = (gestureOrder: number) => {
    setStrokeData((prev) => ({
      ...prev,
      gestures: prev.gestures.filter((g) => g.order !== gestureOrder)
    }));
    if (selectedGestureId === gestureOrder.toString()) {
      setSelectedGestureId(null);
    }
  };

  const startRecording = () => {
    if (!selectedGestureId || !fabricCanvasRef.current) return;
    setIsRecording(true);
    setRecordingStartTime(Date.now());
    setTempStrokes([]); // Clear temporary strokes
    clearGestureVisualization();

    // Enable drawing mode by disabling object selection
    fabricCanvasRef.current.selection = false;
    fabricCanvasRef.current.forEachObject((obj) => {
      obj.selectable = false;
      obj.evented = false;
    });

    // Set up event handling
    setupGestureRecording();
    fabricCanvasRef.current.renderAll();
  };

  const stopRecording = () => {
    setIsRecording(false);
    setCurrentStroke([]);
    setTempStrokes([]); // Clear temp strokes without saving
    clearGestureVisualization(); // Clear all drawn strokes

    // Restore normal canvas behavior
    if (fabricCanvasRef.current) {
      fabricCanvasRef.current.isDrawingMode = false; // Disable drawing mode
      fabricCanvasRef.current.selection = true;

      // Remove path created listener
      fabricCanvasRef.current.off('path:created');

      fabricCanvasRef.current.forEachObject((obj) => {
        if (!obj.get('isGestureVisualization')) {
          obj.selectable = true;
          obj.evented = false; // Keep character paths non-interactive
        }
      });
      fabricCanvasRef.current.renderAll();
    }
  };

  const saveRecording = () => {
    if (!selectedGestureId || tempStrokes.length === 0) return;

    const strokeCount = tempStrokes.length;

    // Add all temporary strokes to the selected gesture
    setStrokeData((prev) => ({
      ...prev,
      gestures: prev.gestures.map((gesture) =>
        gesture.order === parseInt(selectedGestureId, 10)
          ? {
              ...gesture,
              strokes: [...gesture.strokes, ...tempStrokes]
            }
          : gesture
      )
    }));

    // Clear temporary strokes
    setTempStrokes([]);

    // Stop recording but keep the visualization
    setIsRecording(false);

    // Disable drawing mode
    if (fabricCanvasRef.current) {
      fabricCanvasRef.current.isDrawingMode = false;
      fabricCanvasRef.current.selection = true;
      fabricCanvasRef.current.renderAll();
    }

    toast.success(`Added ${strokeCount} stroke(s) to gesture`);
  };

  const clearGestureVisualization = () => {
    if (!fabricCanvasRef.current) return;

    // Remove only gesture visualization objects (lines), keep the character path
    fabricCanvasRef.current.getObjects().forEach((obj) => {
      if (obj.get('isGestureVisualization')) {
        fabricCanvasRef.current?.remove(obj);
      }
    });
    fabricCanvasRef.current.renderAll();
  };

  const playGesture = async (gestureOrder: number) => {
    const gesture = strokeData.gestures.find((g) => g.order === gestureOrder);
    if (!gesture || !fabricCanvasRef.current) return;

    setIsPlaying(true);
    clearGestureVisualization();

    for (const stroke of gesture.strokes) {
      if (stroke.points.length < 2) continue;

      // Create a path for smooth animation
      let pathString = '';
      stroke.points.forEach((point, index) => {
        if (index === 0) {
          pathString += `M ${point.x} ${point.y}`;
        } else {
          pathString += ` L ${point.x} ${point.y}`;
        }
      });

      // Create the full path but make it invisible initially
      const fullPath = new fabric.Path(pathString, {
        stroke: gesture.brush_color,
        strokeWidth: gesture.brush_width,
        fill: '',
        selectable: false,
        evented: false,
        isGestureVisualization: true,
        opacity: 0
      } as any);

      fabricCanvasRef.current.add(fullPath);

      // Animate the path drawing
      const totalPoints = stroke.points.length;
      const animationSteps = Math.min(totalPoints * 2, 50); // More steps for smoother animation

      for (let step = 1; step <= animationSteps; step++) {
        const progress = step / animationSteps;
        const pointIndex = Math.floor(progress * (totalPoints - 1));

        // Create partial path up to current point
        let partialPath = '';
        for (let i = 0; i <= pointIndex; i++) {
          if (i === 0) {
            partialPath += `M ${stroke.points[i].x} ${stroke.points[i].y}`;
          } else {
            partialPath += ` L ${stroke.points[i].x} ${stroke.points[i].y}`;
          }
        }

        // Add interpolated point for smooth animation
        if (pointIndex < totalPoints - 1) {
          const currentPoint = stroke.points[pointIndex];
          const nextPoint = stroke.points[pointIndex + 1];
          const subProgress = (progress * (totalPoints - 1)) % 1;

          const interpolatedX = currentPoint.x + (nextPoint.x - currentPoint.x) * subProgress;
          const interpolatedY = currentPoint.y + (nextPoint.y - currentPoint.y) * subProgress;

          partialPath += ` L ${interpolatedX} ${interpolatedY}`;
        }

        // Update the path
        fullPath.set('path', fabric.util.parsePath(partialPath));
        fullPath.set('opacity', 1);
        fabricCanvasRef.current.renderAll();

        // Wait based on animation duration
        const delay = gesture.animation_duration / animationSteps;
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }

    setIsPlaying(false);
  };

  const playGestureWithoutClear = async (gesture: Gesture) => {
    if (!fabricCanvasRef.current) return;

    for (const stroke of gesture.strokes) {
      if (stroke.points.length < 2) continue;

      // Create a path for smooth animation
      let pathString = '';
      stroke.points.forEach((point, index) => {
        if (index === 0) {
          pathString += `M ${point.x} ${point.y}`;
        } else {
          pathString += ` L ${point.x} ${point.y}`;
        }
      });

      // Create the full path but make it invisible initially
      const fullPath = new fabric.Path(pathString, {
        stroke: gesture.brush_color,
        strokeWidth: gesture.brush_width,
        fill: '',
        selectable: false,
        evented: false,
        isGestureVisualization: true,
        opacity: 0
      } as any);

      fabricCanvasRef.current.add(fullPath);

      // Animate the path drawing
      const totalPoints = stroke.points.length;
      const animationSteps = Math.min(totalPoints * 2, 50); // More steps for smoother animation

      for (let step = 1; step <= animationSteps; step++) {
        const progress = step / animationSteps;
        const pointIndex = Math.floor(progress * (totalPoints - 1));

        // Create partial path up to current point
        let partialPath = '';
        for (let i = 0; i <= pointIndex; i++) {
          if (i === 0) {
            partialPath += `M ${stroke.points[i].x} ${stroke.points[i].y}`;
          } else {
            partialPath += ` L ${stroke.points[i].x} ${stroke.points[i].y}`;
          }
        }

        // Add interpolated point for smooth animation
        if (pointIndex < totalPoints - 1) {
          const currentPoint = stroke.points[pointIndex];
          const nextPoint = stroke.points[pointIndex + 1];
          const subProgress = (progress * (totalPoints - 1)) % 1;

          const interpolatedX = currentPoint.x + (nextPoint.x - currentPoint.x) * subProgress;
          const interpolatedY = currentPoint.y + (nextPoint.y - currentPoint.y) * subProgress;

          partialPath += ` L ${interpolatedX} ${interpolatedY}`;
        }

        // Update the path
        fullPath.set('path', fabric.util.parsePath(partialPath));
        fullPath.set('opacity', 1);
        fabricCanvasRef.current.renderAll();

        // Wait based on animation duration
        const delay = gesture.animation_duration / animationSteps;
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  };

  const playAllGestures = async () => {
    setIsPlaying(true);
    clearGestureVisualization();

    for (const gesture of strokeData.gestures) {
      if (gesture.strokes.length === 0) continue;
      await playGestureWithoutClear(gesture);
      await new Promise((resolve) => setTimeout(resolve, 100)); // Small delay between gestures
    }

    setIsPlaying(false);
  };

  useEffect(() => {
    canceledRef.current = false;
    initCanvas();
    return () => {
      canceledRef.current = true;
      if (fabricCanvasRef.current) {
        fabricCanvasRef.current.dispose();
        fabricCanvasRef.current = null;
      }
      // Also clean up the reference on the canvas element
      if (canvasRef.current && (canvasRef.current as any).__fabric) {
        delete (canvasRef.current as any).__fabric;
      }
    };
  }, []);

  // Removed useEffect for setupGestureRecording as it will be called directly in startRecording

  useEffect(() => {
    if (savedText.trim().length === 0) return;
    render_text_path(savedText);
  }, [savedText, scaleDownFactor]);

  const selectedGesture = strokeData.gestures.find((g) => g.order.toString() === selectedGestureId);

  // Update brush settings when selected gesture changes during recording
  useEffect(() => {
    if (isRecording && selectedGesture && fabricCanvasRef.current) {
      const canvas = fabricCanvasRef.current;
      if (canvas.freeDrawingBrush) {
        canvas.freeDrawingBrush.color = selectedGesture.brush_color;
        canvas.freeDrawingBrush.width = selectedGesture.brush_width;
      }
    }
  }, [selectedGesture?.brush_color, selectedGesture?.brush_width, isRecording]);

  return (
    <Card className="p-6">
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Label className="font-bold">Text</Label>
          <div className="flex items-center gap-2">
            <Input
              value={text}
              className="w-32"
              disabled={!textEditMode}
              onChange={(e) => setText(e.target.value)}
            />
            {!textEditMode && <Button onClick={() => setTextEditMode(true)}>Edit</Button>}
            {textEditMode && (
              <Button
                onClick={() => {
                  setTextEditMode(false);
                  setSavedText(text);
                }}
              >
                Save
              </Button>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Label className="font-bold">Scale Down Factor</Label>
          <Input
            value={scaleDownFactor}
            className="w-16"
            type="number"
            step={0.5}
            onChange={(e) => {
              const value = Number(e.target.value);
              if (value > 0) {
                setScaleDownFactor(value);
              }
            }}
          />
        </div>

        {/* Gesture Management Section */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label className="font-bold">Gestures</Label>
            <Button onClick={addNewGesture} size="sm" variant="outline">
              <IoMdAdd className="mr-1" />
              Add Gesture
            </Button>
          </div>

          {/* Play All and Clear Controls */}
          {strokeData.gestures.length > 0 && (
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={playAllGestures}
                disabled={
                  isRecording ||
                  isPlaying ||
                  strokeData.gestures.every((g) => g.strokes.length === 0)
                }
              >
                <MdPlayArrow className="mr-1" />
                Play All
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={clearGestureVisualization}
                disabled={isRecording || isPlaying}
              >
                <MdClear className="mr-1" />
                Clear Canvas
              </Button>
            </div>
          )}

          {/* Gesture List */}
          <div className="flex flex-wrap gap-2">
            {strokeData.gestures.map((gesture) => (
              <div
                key={gesture.order}
                className={cn(
                  'flex cursor-pointer items-center gap-2 rounded border p-2 transition-colors',
                  selectedGestureId === gesture.order.toString()
                    ? 'border-primary bg-primary/10'
                    : 'border-border hover:border-primary/50 hover:bg-muted/50'
                )}
                onClick={() => {
                  clearGestureVisualization();
                  if (selectedGestureId === gesture.order.toString()) {
                    setSelectedGestureId(null);
                  } else {
                    setSelectedGestureId(gesture.order.toString());
                  }
                }}
              >
                <span className="text-sm">Gesture {gesture.order + 1}</span>
                <span className="text-xs text-muted-foreground">
                  ({gesture.strokes.length} strokes)
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 w-6 p-0"
                  onClick={(e) => {
                    e.stopPropagation();
                    deleteGesture(gesture.order);
                  }}
                >
                  <MdDeleteOutline className="h-3 w-3" />
                </Button>
              </div>
            ))}
          </div>

          {/* Gesture Controls */}
          {selectedGesture && (
            <div className="space-y-3 rounded-lg border bg-muted/30 p-3">
              <div className="flex items-center justify-between">
                <span className="font-medium">Selected: Gesture {selectedGesture.order + 1}</span>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={clearCurrentGesture}
                    disabled={isRecording || isPlaying}
                  >
                    <MdClear className="mr-1" />
                    Clear
                  </Button>

                  {!isRecording ? (
                    <Button
                      size="sm"
                      variant="default"
                      onClick={startRecording}
                      disabled={isPlaying}
                    >
                      <MdFiberManualRecord className="mr-1 text-red-500" />
                      Record
                    </Button>
                  ) : (
                    <>
                      <Button size="sm" variant="secondary" onClick={stopRecording}>
                        <MdStop className="mr-1" />
                        Cancel
                      </Button>
                      <Button
                        size="sm"
                        variant="default"
                        onClick={saveRecording}
                        disabled={tempStrokes.length === 0}
                      >
                        Done ({tempStrokes.length})
                      </Button>
                    </>
                  )}

                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => playGesture(selectedGesture.order)}
                    disabled={isRecording || isPlaying || selectedGesture.strokes.length === 0}
                  >
                    <MdPlayArrow className="mr-1" />
                    Play
                  </Button>
                </div>
              </div>

              {/* Gesture Settings */}
              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                {/* Brush Color */}
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Brush Color</Label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={selectedGesture.brush_color}
                      onChange={(e) =>
                        setStrokeData((prev) => ({
                          ...prev,
                          gestures: prev.gestures.map((gesture) =>
                            gesture.order === parseInt(selectedGestureId || '0', 10)
                              ? { ...gesture, brush_color: e.target.value }
                              : gesture
                          )
                        }))
                      }
                      className="h-8 w-12 rounded border border-input"
                      disabled={isRecording || isPlaying}
                    />
                    <span className="text-xs text-muted-foreground">
                      {selectedGesture.brush_color}
                    </span>
                  </div>
                </div>

                {/* Brush Width */}
                <div className="space-y-2">
                  <Label className="text-sm font-medium">
                    Brush Width: {selectedGesture.brush_width}px
                  </Label>
                  <Slider
                    value={[selectedGesture.brush_width]}
                    onValueChange={(value) =>
                      setStrokeData((prev) => ({
                        ...prev,
                        gestures: prev.gestures.map((gesture) =>
                          gesture.order === parseInt(selectedGestureId || '0', 10)
                            ? { ...gesture, brush_width: value[0] }
                            : gesture
                        )
                      }))
                    }
                    min={1}
                    max={10}
                    step={1}
                    className="w-full"
                    disabled={isRecording || isPlaying}
                  />
                </div>

                {/* Animation Duration */}
                <div className="space-y-2">
                  <Label className="text-sm font-medium">
                    Animation: {selectedGesture.animation_duration}ms
                  </Label>
                  <Slider
                    value={[selectedGesture.animation_duration]}
                    onValueChange={(value) =>
                      setStrokeData((prev) => ({
                        ...prev,
                        gestures: prev.gestures.map((gesture) =>
                          gesture.order === parseInt(selectedGestureId || '0', 10)
                            ? { ...gesture, animation_duration: value[0] }
                            : gesture
                        )
                      }))
                    }
                    min={50}
                    max={1000}
                    step={10}
                    className="w-full"
                    disabled={isRecording || isPlaying}
                  />
                </div>
              </div>

              {isRecording && (
                <div className="text-sm font-medium text-destructive">
                  🔴 Recording... Draw on the canvas to record strokes
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex justify-center">
          <div
            className={cn(
              'rounded-lg border-2 transition-colors',
              isRecording ? 'border-destructive' : 'border-border'
            )}
          >
            <canvas ref={canvasRef} />
          </div>
        </div>
      </div>
      <SaveEditMode
        text_data={text_data}
        text={text}
        strokeData={strokeData}
        fabricCanvasRef={fabricCanvasRef}
      />
    </Card>
  );
}

const SaveEditMode = ({
  text_data,
  text,
  strokeData,
  fabricCanvasRef
}: {
  text_data: Props['text_data'];
  text: string;
  strokeData: StrokeData;
  fabricCanvasRef: React.RefObject<Canvas | null>;
}) => {
  const is_addition = text_data.id === undefined && text_data.uuid === undefined;

  const router = useRouter();
  const add_text_data_mut = client_q.text_data.add_text_data.useMutation({
    onSuccess(data) {
      toast.success('Text Added');
      router.push(`/edit/${data.id}`);
    }
  });

  const update_text_data_mut = client_q.text_data.edit_text_data.useMutation({
    onSuccess(data) {
      toast.success('Text Updated');
    }
  });

  const delete_text_data_mut = client_q.text_data.delete_text_data.useMutation({
    onSuccess(data) {
      toast.success('Text Deleted');
      router.push('/list');
    }
  });

  const handle_save = () => {
    if (text.trim().length === 0 || !fabricCanvasRef.current) return;

    // Temporarily hide gesture visualization objects
    const gestureObjects = fabricCanvasRef.current
      .getObjects()
      .filter((obj) => obj.get('isGestureVisualization'));
    gestureObjects.forEach((obj) => {
      fabricCanvasRef.current?.remove(obj);
    });

    // Get JSON with only text path objects
    const fabricjs_svg_dump = fabricCanvasRef.current.toJSON();

    // Restore gesture visualization objects
    gestureObjects.forEach((obj) => {
      fabricCanvasRef.current?.add(obj);
    });
    fabricCanvasRef.current.renderAll();

    if (is_addition) {
      add_text_data_mut.mutate({
        text,
        svg_json: fabricjs_svg_dump,
        strokes_json: strokeData
      });
    } else {
      update_text_data_mut.mutate({
        id: text_data.id!,
        uuid: text_data.uuid!,
        text,
        svg_json: fabricjs_svg_dump,
        strokes_json: strokeData
      });
    }
  };

  const handleDelete = async () => {
    if (!is_addition) {
      await delete_text_data_mut.mutateAsync({
        id: text_data.id!,
        uuid: text_data.uuid!
      });
    }
  };

  return (
    <div className="mx-2 mt-2 flex items-center justify-between sm:mx-4">
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button
            disabled={add_text_data_mut.isPending || update_text_data_mut.isPending}
            className="flex text-lg"
            variant={'blue'}
          >
            {is_addition ? (
              <>
                <IoMdAdd className="text-lg" /> {!add_text_data_mut.isPending ? 'Add' : 'Adding...'}
              </>
            ) : (
              <>
                <FiSave className="text-lg" />{' '}
                {!update_text_data_mut.isPending ? 'Save' : 'Saving...'}
              </>
            )}
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Sure to Save</AlertDialogTitle>
            <AlertDialogDescription>
              {is_addition ? 'Are you sure to Add this Text ?' : 'Are you sure to Save this Text ?'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handle_save}>Save</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {!is_addition && (
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button className="flex gap-1 px-1 py-0 text-sm" variant="destructive">
              <MdDeleteOutline className="text-base" />
              Delete
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Sure to Delete</AlertDialogTitle>
              <AlertDialogDescription>Are you sure to Delete this Text ?</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleDelete} className="bg-red-500 hover:bg-red-400">
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  );
};
