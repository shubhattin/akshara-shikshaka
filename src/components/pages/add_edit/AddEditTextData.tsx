'use client';

import { type Canvas } from 'fabric';
import { useEffect, useRef, useState } from 'react';
import { Button } from '~/components/ui/button';
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
import {
  MdDeleteOutline,
  MdPlayArrow,
  MdStop,
  MdClear,
  MdFiberManualRecord,
  MdDragHandle,
  MdReplay
} from 'react-icons/md';
import { toast } from 'sonner';
import { cn } from '~/lib/utils';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy
} from '@dnd-kit/sortable';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { atom, useAtom, useAtomValue } from 'jotai';
import { useHydrateAtoms } from 'jotai/utils';
import { Switch } from '@/components/ui/switch';
import type { GesturePoint, Gesture } from '~/tools/stroke_data/types';
import { GESTURE_FLAGS, CANVAS_DIMS, GESTURE_GAP_DURATION } from '~/tools/stroke_data/types';
import { playGestureWithoutClear } from '~/tools/stroke_data/utils';

type text_data_type = {
  text: string;
  id?: number;
  uuid?: string;
  gestures?: Gesture[] | null;
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

const DEFAULT_GESTURE_BRUSH_WIDTH = 8;
const DEFAULT_GESTURE_BRUSH_COLOR = '#ff0000'; // red
const DEFAULT_GESTURE_ANIMATION_DURATION = 600;
const DEFAULT_SCALE_DOWN_FACTOR = 4.5;

const text_atom = atom('');
const text_edit_mode_atom = atom(false);
const scale_down_factor_atom = atom(DEFAULT_SCALE_DOWN_FACTOR);
const gesture_data_atom = atom<Gesture[]>([]);
const selected_gesture_order_atom = atom<string | null>(null);
const is_recording_atom = atom(false);
const is_playing_atom = atom(false);
const current_points_atom = atom<GesturePoint[]>([]);
const recording_start_time_atom = atom<number>(0);
const temp_points_atom = atom<GesturePoint[]>([]);
const character_path_atom = atom<fabric.Path | null>(null);
const main_text_path_visible_atom = atom(true);

export default function AddEditTextDataWrapper(props: Props) {
  useHydrateAtoms([
    [text_atom, props.text_data.text],
    [text_edit_mode_atom, props.location === 'add' && true],
    [scale_down_factor_atom, DEFAULT_SCALE_DOWN_FACTOR],
    [gesture_data_atom, props.text_data.gestures ?? []],
    [selected_gesture_order_atom, null],
    [is_recording_atom, false],
    [is_playing_atom, false]
  ]);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fabricCanvasRef = useRef<Canvas>(null);

  return (
    <>
      <AddEditTextData {...props} canvasRef={canvasRef} fabricCanvasRef={fabricCanvasRef} />
      <SaveEditMode fabricCanvasRef={fabricCanvasRef} text_data={props.text_data} />
    </>
  );
}

function AddEditTextData({
  text_data,
  canvasRef,
  fabricCanvasRef
}: Props & {
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  fabricCanvasRef: React.RefObject<Canvas | null>;
}) {
  const [textIntermediate, setIntermediateText] = useState(text_data.text);
  const [text, setText] = useAtom(text_atom);
  const [textEditMode, setTextEditMode] = useAtom(text_edit_mode_atom);
  const [scaleDownFactor, setScaleDownFactor] = useAtom(scale_down_factor_atom);
  const [mainTextPathVisible, setMainTextPathVisible] = useAtom(main_text_path_visible_atom);

  // Gesture Recording State
  const [gestureData, setGestureData] = useAtom(gesture_data_atom);
  const [selectedGestureOrder, setSelectedGestureOrder] = useAtom(selected_gesture_order_atom);
  const [isRecording] = useAtom(is_recording_atom);
  const [isPlaying, setIsPlaying] = useAtom(is_playing_atom);
  const [, setCharacterPath] = useAtom(character_path_atom);

  // Drag and Drop Sensors
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates
    })
  );

  // Handle gesture reordering
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const activeOrder = parseInt(active.id.toString(), 10);
      const isSelectedBeingMoved = selectedGestureOrder === active.id.toString();

      setGestureData((prev: Gesture[]) => {
        const oldIndex = prev.findIndex((g) => g.order === activeOrder);
        const newIndex = prev.findIndex((g) => g.order.toString() === over.id);

        if (oldIndex === -1 || newIndex === -1) return prev;

        // Reorder the gestures array
        const newGestures = arrayMove(prev, oldIndex, newIndex);

        // Update the order property for each gesture to reflect new positions
        const updatedGestures = newGestures.map((gesture, index) => ({
          ...gesture,
          order: index
        }));

        return updatedGestures;
      });

      // Update selectedGestureId if the selected gesture was moved
      if (isSelectedBeingMoved) {
        const oldIndex = gestureData.findIndex((g) => g.order === activeOrder);
        const newIndex = gestureData.findIndex((g) => g.order.toString() === over.id);

        if (oldIndex !== -1 && newIndex !== -1) {
          const newGestures = arrayMove(gestureData, oldIndex, newIndex);
          // The selected gesture will now be at position newIndex, so its new order is newIndex
          setSelectedGestureOrder(newIndex.toString());
        }
      }
    }
  };

  const initCanvas = async () => {
    if (!canvasRef.current) return;

    // Clean up existing canvas first
    if (fabricCanvasRef.current) {
      fabricCanvasRef.current.dispose();
      fabricCanvasRef.current = null;
    }

    // Check if the canvas element already has a Fabric instance
    // This can happen in React StrictMode
    const existingCanvas = (canvasRef.current as any).__fabric;
    if (existingCanvas) {
      existingCanvas.dispose();
      delete (canvasRef.current as any).__fabric;
    }

    // Initialize Fabric.js canvas
    const canvas = new fabric.Canvas(canvasRef.current, {
      width: CANVAS_DIMS.width,
      height: CANVAS_DIMS.height,
      backgroundColor: '#ffffff',
      isDrawingMode: false // Explicitly disable drawing mode initially
    });

    // Store reference on the canvas element itself for cleanup
    (canvasRef.current as any).__fabric = canvas;

    fabricCanvasRef.current = canvas;
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
      pathObject.set(GESTURE_FLAGS.isMainCharacterPath, true);

      // clear prev path objects
      fabricCanvasRef.current?.getObjects().forEach((obj) => {
        if (obj instanceof fabric.Path && !obj.get(GESTURE_FLAGS.isGestureVisualization)) {
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
      order: gestureData.length,
      points: [],
      brush_width: DEFAULT_GESTURE_BRUSH_WIDTH,
      brush_color: DEFAULT_GESTURE_BRUSH_COLOR, // red
      animation_duration: DEFAULT_GESTURE_ANIMATION_DURATION
    };
    setGestureData((prev: Gesture[]) => [...prev, newGesture]);
    clearGestureVisualization();
    setSelectedGestureOrder(newGesture.order.toString());
  };

  const deleteGesture = (gestureOrder: number) => {
    setGestureData((prev: Gesture[]) => prev.filter((g) => g.order !== gestureOrder));
    if (selectedGestureOrder === gestureOrder.toString()) {
      setSelectedGestureOrder(null);
    }
  };

  const clearGestureVisualization = () => {
    if (!fabricCanvasRef.current) return;

    // Remove only gesture visualization objects (lines), keep the character path
    fabricCanvasRef.current.getObjects().forEach((obj) => {
      if (obj.get(GESTURE_FLAGS.isGestureVisualization)) {
        fabricCanvasRef.current?.remove(obj);
      }
    });
    fabricCanvasRef.current.renderAll();
  };

  const playAllGestures = async () => {
    setIsPlaying(true);
    clearGestureVisualization();

    for (const gesture of gestureData) {
      if (gesture.points.length === 0) continue;
      await playGestureWithoutClear(gesture, fabricCanvasRef);
      await new Promise((resolve) => setTimeout(resolve, GESTURE_GAP_DURATION)); // Small delay between gestures
    }

    setIsPlaying(false);
  };

  useEffect(() => {
    if (typeof window === 'undefined') return;
    initCanvas();
    return () => {
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

  useEffect(() => {
    if (!fabricCanvasRef.current) return;
    // get object by its isMainCharacterPath flag
    const mainCharacterPath = fabricCanvasRef.current
      .getObjects()
      .find((obj) => obj.get(GESTURE_FLAGS.isMainCharacterPath));
    if (mainCharacterPath) {
      mainCharacterPath.visible = mainTextPathVisible;
      fabricCanvasRef.current.renderAll();
    }
  }, [mainTextPathVisible]);

  // Removed useEffect for setupGestureRecording as it will be called directly in startRecording

  useEffect(() => {
    if (text.trim().length === 0) return;
    render_text_path(text);
  }, [text, scaleDownFactor]);

  const selectedGesture = gestureData.find((g) => g.order.toString() === selectedGestureOrder);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Label className="font-bold">Text</Label>
        <div className="flex items-center gap-2">
          <Input
            value={textIntermediate}
            className="w-32"
            disabled={!textEditMode}
            onChange={(e) => setIntermediateText(e.target.value)}
          />
          {!textEditMode && <Button onClick={() => setTextEditMode(true)}>Edit</Button>}
          {textEditMode && (
            <Button
              onClick={() => {
                setTextEditMode(false);
                setText(textIntermediate);
              }}
            >
              Save
            </Button>
          )}
        </div>
        <Label className="flex items-center gap-2">
          Main Character Path
          <Switch
            checked={mainTextPathVisible}
            onCheckedChange={setMainTextPathVisible}
            className=""
          />
        </Label>
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
        <Button onClick={addNewGesture} size="sm" variant="outline">
          <IoMdAdd className="mr-1" />
          Add Gesture
        </Button>
        {/* Play All and Clear Controls */}
        {gestureData.length > 0 && (
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={playAllGestures}
              disabled={isRecording || isPlaying || gestureData.every((g) => g.points.length === 0)}
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
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext
            items={gestureData.map((g) => g.order.toString())}
            strategy={verticalListSortingStrategy}
          >
            <div className="flex flex-col gap-2">
              {gestureData.map((gesture) => (
                <SortableGestureItem
                  key={gesture.order}
                  gesture={gesture}
                  selectedGestureId={selectedGestureOrder}
                  onSelect={(gestureId) => {
                    clearGestureVisualization();
                    setSelectedGestureOrder(gestureId);
                  }}
                  onDelete={deleteGesture}
                  disabled={isRecording || isPlaying}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>

        {/* Gesture Controls */}
        {selectedGesture && (
          <SelectedGestureControls
            selectedGesture={selectedGesture}
            fabricCanvasRef={fabricCanvasRef}
          />
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
  );
}

const SelectedGestureControls = ({
  selectedGesture,
  fabricCanvasRef
}: {
  selectedGesture: Gesture;
  fabricCanvasRef: React.RefObject<Canvas | null>;
}) => {
  const [isRecording, setIsRecording] = useAtom(is_recording_atom);
  const [isPlaying, setIsPlaying] = useAtom(is_playing_atom);
  const [tempPoints, setTempPoints] = useAtom(temp_points_atom);
  const [selectedGestureOrder] = useAtom(selected_gesture_order_atom);
  const [gestureData, setGestureData] = useAtom(gesture_data_atom);
  const [recordingStartTime, setRecordingStartTime] = useAtom(recording_start_time_atom);
  const [, setCurrentPoints] = useAtom(current_points_atom);
  const [characterPath] = useAtom(character_path_atom);

  // Function to approximate gesture points to the character path
  const approximateToCharacterPath = (
    gesturePoints: GesturePoint[],
    charPath: fabric.Path
  ): GesturePoint[] => {
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
    canvas.off('path:created', handlePathCreated);

    canvas.on('path:created', handlePathCreated);
  };

  // Listen for path creation with proper closure
  const handlePathCreated = (e: any) => {
    if (!e.path) return;

    console.log('Path created during recording');

    // Mark the path as gesture visualization
    e.path.set({
      selectable: false,
      evented: false,
      [GESTURE_FLAGS.isGestureVisualization]: true
    });

    // Extract points from the path
    const pathData = e.path.path;
    const points: GesturePoint[] = [];
    const baseTime = recordingStartTime;

    // Convert SVG path commands to points
    pathData.forEach((cmd: any, index: number) => {
      if (cmd[0] === 'M' && cmd.length >= 3) {
        points.push({
          x: cmd[1],
          y: cmd[2],
          timestamp: index * 10,
          cmd: 'M'
        });
      } else if (cmd[0] === 'L' && cmd.length >= 3) {
        points.push({
          x: cmd[1],
          y: cmd[2],
          timestamp: index * 10,
          cmd: 'L'
        });
      } else if (cmd[0] === 'Q' && cmd.length >= 5) {
        // Quadratic bezier. curve - store control and end point
        points.push({
          x: cmd[3],
          y: cmd[4],
          timestamp: index * 10,
          cmd: 'Q',
          cx: cmd[1],
          cy: cmd[2]
        });
      }
    });

    // Syntax
    // M x y : Move to x,y
    // L x y : Line to x,y
    // Q x1 y1 x2 y2 : Quadratic bezier curve to x2,y2 from x1,y1
    // C x1 y1 x2 y2 x3 y3 : Cubic bezier curve to x3,y3 from x1,y1 via x2,y2

    if (points.length > 1) {
      // Apply path approximation if character path exists
      const approximatedPoints = characterPath
        ? approximateToCharacterPath(points, characterPath)
        : points;

      console.log('Adding points:', approximatedPoints.length, 'points');
      setTempPoints(approximatedPoints);
    }

    // Disable drawing and keep recording UI active (user can Cancel or Done)
    if (fabricCanvasRef.current) {
      fabricCanvasRef.current.isDrawingMode = false;
      // stop listening further until user taps Record Again
      fabricCanvasRef.current.off('path:created', handlePathCreated);
      fabricCanvasRef.current.renderAll();
    }
  };
  const startRecording = () => {
    if (!selectedGestureOrder || !fabricCanvasRef.current) return;
    setIsRecording(true);
    setRecordingStartTime(Date.now());
    setTempPoints([]); // Clear temporary points
    clearGestureVisualization();

    // Enable drawing mode by disabling object selection
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
    setCurrentPoints([]);
    setTempPoints([]); // Clear temp points without saving
    clearGestureVisualization(); // Clear all drawn paths

    // Restore normal canvas behavior
    if (fabricCanvasRef.current) {
      fabricCanvasRef.current.isDrawingMode = false; // Disable drawing mode

      // Remove path created listener
      fabricCanvasRef.current.off('path:created', handlePathCreated);

      fabricCanvasRef.current.forEachObject((obj) => {
        if (!obj.get(GESTURE_FLAGS.isGestureVisualization)) {
          obj.selectable = true;
          obj.evented = false; // Keep character paths non-interactive
        }
      });
      fabricCanvasRef.current.renderAll();
    }
  };

  const saveRecording = () => {
    if (!selectedGestureOrder || tempPoints.length === 0) return;

    const pointCount = tempPoints.length;

    // Set the points for the selected gesture (overwrite previous points)
    setGestureData((prev: Gesture[]) =>
      prev.map((gesture) =>
        gesture.order === parseInt(selectedGestureOrder, 10)
          ? {
              ...gesture,
              points: tempPoints
            }
          : gesture
      )
    );

    // Clear temporary points
    setTempPoints([]);

    // Stop recording but keep the visualization
    setIsRecording(false);

    // Disable drawing mode
    if (fabricCanvasRef.current) {
      fabricCanvasRef.current.isDrawingMode = false;
      fabricCanvasRef.current.renderAll();
    }

    toast.success(`Recorded ${pointCount} points for gesture`);
  };

  const clearGestureVisualization = () => {
    if (!fabricCanvasRef.current) return;

    // Remove only gesture visualization objects (lines), keep the character path
    fabricCanvasRef.current.getObjects().forEach((obj) => {
      if (obj.get(GESTURE_FLAGS.isGestureVisualization)) {
        fabricCanvasRef.current!.remove(obj);
      }
    });
    fabricCanvasRef.current.renderAll();
  };

  const playGesture = async (gestureOrder: number) => {
    const gesture = gestureData.find((g) => g.order === gestureOrder);
    if (!gesture || !fabricCanvasRef.current) return;

    setIsPlaying(true);
    clearGestureVisualization();

    await playGestureWithoutClear(gesture, fabricCanvasRef);

    setIsPlaying(false);
  };

  const clearCurrentGesturePoints = () => {
    if (!selectedGestureOrder) return;
    setGestureData((prev: Gesture[]) =>
      prev.map((gesture) =>
        gesture.order === parseInt(selectedGestureOrder, 10) ? { ...gesture, points: [] } : gesture
      )
    );
    clearGestureVisualization();
  };

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
    <div className="space-y-3 rounded-lg border bg-muted/30 p-3">
      <div className="flex items-center justify-between">
        <span className="font-medium">Selected: Gesture {selectedGesture.order + 1}</span>
        <div className="flex gap-2">
          {!isRecording && (
            <Button
              size="sm"
              variant="outline"
              onDoubleClick={clearCurrentGesturePoints}
              disabled={isRecording || isPlaying || selectedGesture.points.length === 0}
              className="text-sm"
            >
              <MdClear className="mr-1" />
              Clear Gesture
            </Button>
          )}
          {!isRecording ? (
            <Button size="sm" variant="default" onClick={startRecording} disabled={isPlaying}>
              <MdFiberManualRecord className="mr-1 text-red-500" />
              Record
            </Button>
          ) : (
            <>
              {/* Record Again (re-enable drawing). Shown only during recording */}
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  if (!fabricCanvasRef.current) return;
                  // clear previous temp points but keep visualization clearing to start fresh
                  setTempPoints([]);
                  clearGestureVisualization(); // Clear canvas for fresh start
                  // Re-enable drawing and reattach listener
                  fabricCanvasRef.current.isDrawingMode = true;
                  fabricCanvasRef.current.off('path:created', handlePathCreated);
                  fabricCanvasRef.current.on('path:created', handlePathCreated);
                  fabricCanvasRef.current.renderAll();
                }}
                disabled={tempPoints.length === 0}
              >
                <MdReplay className="mr-1" />
                Record Again
              </Button>
              <Button size="sm" variant="secondary" onClick={stopRecording}>
                <MdStop className="mr-1" />
                Cancel
              </Button>
              <Button
                size="sm"
                variant="default"
                onClick={saveRecording}
                disabled={tempPoints.length === 0}
              >
                Done
              </Button>
            </>
          )}

          {!isRecording && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => playGesture(selectedGesture.order)}
              disabled={isRecording || isPlaying || selectedGesture.points.length === 0}
            >
              <MdPlayArrow className="mr-1" />
              Play
            </Button>
          )}
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
                setGestureData((prev: Gesture[]) =>
                  prev.map((gesture) =>
                    gesture.order === parseInt(selectedGestureOrder || '0', 10)
                      ? { ...gesture, brush_color: e.target.value }
                      : gesture
                  )
                )
              }
              className="h-8 w-12 rounded border border-input"
              disabled={isRecording || isPlaying}
            />
            <span className="text-xs text-muted-foreground">{selectedGesture.brush_color}</span>
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
              setGestureData((prev: Gesture[]) =>
                prev.map((gesture) =>
                  gesture.order === parseInt(selectedGestureOrder || '0', 10)
                    ? { ...gesture, brush_width: value[0] }
                    : gesture
                )
              )
            }
            min={4}
            max={14}
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
              setGestureData((prev: Gesture[]) =>
                prev.map((gesture) =>
                  gesture.order === parseInt(selectedGestureOrder || '0', 10)
                    ? { ...gesture, animation_duration: value[0] }
                    : gesture
                )
              )
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
          🔴 Recording... Draw on the canvas to record gesture
        </div>
      )}
    </div>
  );
};

// Sortable Gesture Item Component
type SortableGestureItemProps = {
  gesture: Gesture;
  selectedGestureId: string | null;
  onSelect: (gestureId: string | null) => void;
  onDelete: (gestureOrder: number) => void;
  disabled?: boolean;
};

function SortableGestureItem({
  gesture,
  selectedGestureId,
  onSelect,
  onDelete,
  disabled = false
}: SortableGestureItemProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: gesture.order.toString(),
    disabled: disabled
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'flex cursor-pointer items-center gap-2 rounded border p-2 transition-colors',
        selectedGestureId === gesture.order.toString()
          ? 'border-primary bg-primary/10'
          : 'border-border hover:border-primary/50 hover:bg-muted/50',
        isDragging && 'z-10 shadow-lg'
      )}
      onClick={() => {
        if (!disabled) {
          if (selectedGestureId === gesture.order.toString()) {
            onSelect(null);
          } else {
            onSelect(gesture.order.toString());
          }
        }
      }}
    >
      <div
        {...attributes}
        {...listeners}
        className="cursor-grab rounded p-1 hover:cursor-grabbing hover:bg-muted"
        onClick={(e) => e.stopPropagation()}
      >
        <MdDragHandle className="h-4 w-4 text-muted-foreground" />
      </div>
      <span className="text-sm">Gesture {gesture.order + 1}</span>
      <Button
        size="sm"
        variant="ghost"
        className="h-6 w-6 p-0"
        onClick={(e) => {
          e.stopPropagation();
          onDelete(gesture.order);
        }}
        disabled={disabled}
      >
        <MdDeleteOutline className="h-3 w-3" />
      </Button>
    </div>
  );
}

const SaveEditMode = ({
  fabricCanvasRef,
  text_data
}: {
  fabricCanvasRef: React.RefObject<Canvas | null>;
  text_data: text_data_type;
}) => {
  const text = useAtomValue(text_atom);
  const gestureData = useAtomValue(gesture_data_atom);

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

    // make character path visible if hidden
    const mainCharacterPath = fabricCanvasRef.current
      .getObjects()
      .find((obj) => obj.get(GESTURE_FLAGS.isMainCharacterPath));
    if (mainCharacterPath) {
      mainCharacterPath.visible = true;
    }

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
        gestures: gestureData
      });
    } else {
      update_text_data_mut.mutate({
        id: text_data.id!,
        uuid: text_data.uuid!,
        text,
        gestures: gestureData
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
