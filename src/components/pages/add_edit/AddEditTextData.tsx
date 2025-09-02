'use client';

import { useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { Button } from '~/components/ui/button';
import { Input } from '~/components/ui/input';
import { Label } from '~/components/ui/label';
import { Slider } from '~/components/ui/slider';
import type Konva from 'konva';
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
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import { useHydrateAtoms } from 'jotai/utils';
import { Switch } from '@/components/ui/switch';
import type { GesturePoint, Gesture } from '~/tools/stroke_data/types';
import { CANVAS_DIMS, GESTURE_GAP_DURATION } from '~/tools/stroke_data/types';
import { animateGesture } from '~/tools/stroke_data/utils';
import {
  text_atom,
  text_edit_mode_atom,
  scale_down_factor_atom,
  gesture_data_atom,
  selected_gesture_order_atom,
  is_recording_atom,
  is_playing_atom,
  character_svg_path_atom,
  main_text_path_visible_atom,
  animated_gesture_lines_atom,
  DEFAULTS,
  is_drawing_atom,
  current_drawing_points_atom,
  not_to_clear_gestures_order_atom,
  temp_points_atom
} from './add_edit_state';
import { Checkbox } from '~/components/ui/checkbox';

// Dynamic import for KonvaCanvas to avoid SSR issues
const KonvaCanvas = dynamic(() => import('./AddEditCanvas'), {
  ssr: false,
  loading: () => (
    <div
      className="flex items-center justify-center rounded-lg border-2 bg-gray-50"
      style={{ width: CANVAS_DIMS.width, height: CANVAS_DIMS.height }}
    >
      <div className="text-gray-500">Loading...</div>
    </div>
  )
});

// Client-side only wrapper to prevent hydration mismatches
const ClientOnly = ({
  children,
  fallback = null
}: {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}) => {
  const [hasMounted, setHasMounted] = useState(false);

  useEffect(() => {
    setHasMounted(true);
  }, []);

  if (!hasMounted) {
    return <>{fallback}</>;
  }

  return <>{children}</>;
};

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

// All atoms and constants are now imported from shared-state.ts

export default function AddEditTextDataWrapper(props: Props) {
  useHydrateAtoms([
    [text_atom, props.text_data.text],
    [text_edit_mode_atom, props.location === 'add' && true],
    [scale_down_factor_atom, DEFAULTS.SCALE_DOWN_FACTOR],
    [gesture_data_atom, props.text_data.gestures ?? []],
    [selected_gesture_order_atom, null],
    [is_recording_atom, false],
    [is_playing_atom, false],
    [is_drawing_atom, false],
    [current_drawing_points_atom, []]
  ]);
  const stageRef = useRef<Konva.Stage | null>(null);

  return (
    <>
      <AddEditTextData {...props} stageRef={stageRef} />
      <SaveEditMode stageRef={stageRef} text_data={props.text_data} />
    </>
  );
}

function AddEditTextData({
  text_data,
  stageRef
}: Props & {
  stageRef: React.RefObject<Konva.Stage | null>;
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
  const setCharacterSvgPath = useSetAtom(character_svg_path_atom);
  const setAnimatedGestureLines = useSetAtom(animated_gesture_lines_atom);

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

  // Konva doesn't need manual initialization like Fabric
  // The Stage component handles everything declaratively

  const render_text_path = async (text: string) => {
    const hbjs = await import('~/tools/harfbuzz/index');

    const FONT_URL = '/fonts/regular/Nirmala.ttf';
    await Promise.all([hbjs.preload_harfbuzzjs_wasm(), hbjs.preload_font_from_url(FONT_URL)]);

    const svg_path = await hbjs.get_text_svg_path(text, FONT_URL);
    if (svg_path) {
      // Store the SVG path data in state - Konva Path component will use it
      setCharacterSvgPath(svg_path);
    }
  };

  const addNewGesture = () => {
    const newGesture: Gesture = {
      order: gestureData.length,
      points: [],
      brush_width: DEFAULTS.GESTURE_BRUSH_WIDTH,
      brush_color: DEFAULTS.GESTURE_BRUSH_COLOR, // red
      animation_duration: DEFAULTS.GESTURE_ANIMATION_DURATION
    };
    setGestureData((prev: Gesture[]) => [...prev, newGesture]);
    clearGestureVisualization();
    setSelectedGestureOrder(newGesture.order.toString());
  };

  const clearGestureVisualization = () => {
    // Clear animated gesture lines from state
    setAnimatedGestureLines([]);
  };

  const playAllGestures = async () => {
    setIsPlaying(true);
    clearGestureVisualization();

    for (const gesture of gestureData) {
      if (gesture.points.length === 0) continue;
      await playGestureWithKonva(gesture);
      await new Promise((resolve) => setTimeout(resolve, GESTURE_GAP_DURATION)); // Small delay between gestures
    }

    setIsPlaying(false);
  };

  // Konva-based gesture animation using framework-agnostic helper
  const playGestureWithKonva = async (gesture: Gesture): Promise<void> => {
    const gestureLineId = gesture.order;

    // Initialize the gesture line in state
    setAnimatedGestureLines((prev) => [
      ...prev.filter((line) => line.order !== gestureLineId),
      {
        order: gestureLineId,
        points: [],
        color: gesture.brush_color,
        width: gesture.brush_width
      }
    ]);

    // Use the framework-agnostic animation helper
    await animateGesture(gesture, (frame) => {
      // Convert points to flat array for Konva Line component
      const flatPoints = frame.partialPoints.flatMap((p) => [p.x, p.y]);

      setAnimatedGestureLines((prev) =>
        prev.map((line) => (line.order === gestureLineId ? { ...line, points: flatPoints } : line))
      );
    });
  };

  // No manual canvas initialization needed with Konva

  // Text path visibility is now handled declaratively via mainTextPathVisible state

  // Gesture recording is now handled via Stage mouse events

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
        <ClientOnly>
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={gestureData.map((g) => g.order.toString())}
              strategy={verticalListSortingStrategy}
            >
              <div className="flex flex-col gap-2">
                {gestureData.map((gesture) => (
                  <SortableGestureItem key={gesture.order} gesture={gesture} />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        </ClientOnly>

        {/* Gesture Controls */}
        {selectedGesture && (
          <SelectedGestureControls
            selectedGesture={selectedGesture}
            playGestureWithKonva={playGestureWithKonva}
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
          <KonvaCanvas ref={stageRef} />
        </div>
      </div>
    </div>
  );
}

const SelectedGestureControls = ({
  selectedGesture,
  playGestureWithKonva
}: {
  selectedGesture: Gesture;
  playGestureWithKonva: (gesture: Gesture) => Promise<void>;
}) => {
  const [isRecording, setIsRecording] = useAtom(is_recording_atom);
  const [isPlaying, setIsPlaying] = useAtom(is_playing_atom);
  const [tempPoints, setTempPoints] = useAtom(temp_points_atom);
  const [selectedGestureOrder] = useAtom(selected_gesture_order_atom);
  const [gestureData, setGestureData] = useAtom(gesture_data_atom);
  const setAnimatedGestureLines = useSetAtom(animated_gesture_lines_atom);

  // Recording is now handled by Stage mouse events in the parent component

  // Path handling is now done directly via mouse events in the parent component
  const startRecording = () => {
    if (!selectedGestureOrder) return;
    setIsRecording(true);
    setTempPoints([]); // Clear temporary points
    clearGestureVisualization();
  };

  const stopRecording = () => {
    setIsRecording(false);
    setTempPoints([]); // Clear temp points without saving
    clearGestureVisualization(); // Clear all drawn paths
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

    toast.success(`Recorded ${pointCount} points for gesture`);
  };

  const clearGestureVisualization = () => {
    // Clear animated gesture lines from state
    setAnimatedGestureLines([]);
  };

  const playGesture = async (gestureOrder: number) => {
    const gesture = gestureData.find((g) => g.order === gestureOrder);
    if (!gesture) return;

    setIsPlaying(true);
    clearGestureVisualization();

    // Use the Konva animation function from parent scope
    await playGestureWithKonva(gesture);

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

  // Brush settings are now handled declaratively via state

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
              {/* Record Again (clear temp points to start fresh). Shown only during recording */}
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  // Clear previous temp points to start fresh
                  setTempPoints([]);
                  clearGestureVisualization(); // Clear canvas for fresh start
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
};

function SortableGestureItem({ gesture }: SortableGestureItemProps) {
  const [isRecording] = useAtom(is_recording_atom);
  const [isPlaying] = useAtom(is_playing_atom);
  const [selectedGestureOrder, setSelectedGestureOrder] = useAtom(selected_gesture_order_atom);
  const setAnimatedGestureLines = useSetAtom(animated_gesture_lines_atom);

  const disabled = isRecording || isPlaying;
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: `gesture-${gesture.order}`,
    disabled: disabled
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1
  };
  const [notToClearGesturesOrder, setNotToClearGesturesOrder] = useAtom(
    not_to_clear_gestures_order_atom
  );

  const clearGestureVisualization = () => {
    // Clear animated gesture lines from state
    setAnimatedGestureLines([]);
  };

  const deleteGesture = (gestureOrder: number) => {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
      id: gesture.order.toString(),
      disabled: disabled
    });
    if (selectedGestureOrder === gestureOrder.toString()) {
      setSelectedGestureOrder(null);
    }
  };

  const onSelect = (gestureOrder: string | null) => {
    clearGestureVisualization();
    setSelectedGestureOrder(gestureOrder);
  };

  const onSelectCurrent = () => {
    clearGestureVisualization();
    if (selectedGestureOrder === gesture.order.toString()) {
      onSelect(null);
    } else {
      onSelect(gesture.order.toString());
    }
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'flex cursor-pointer items-center gap-2 rounded border p-2 transition-colors',
        selectedGestureOrder === gesture.order.toString()
          ? 'border-primary bg-primary/10'
          : 'border-border hover:border-primary/50 hover:bg-muted/50',
        isDragging && 'z-10 shadow-lg'
      )}
      onClick={() => {
        if (!disabled) {
          onSelectCurrent();
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
          deleteGesture(gesture.order);
        }}
        disabled={disabled}
      >
        <MdDeleteOutline className="h-3 w-3" />
      </Button>
      <Checkbox
        id="toggle-2"
        checked={notToClearGesturesOrder.has(gesture.order)}
        onCheckedChange={(checked) => {
          if (checked) {
            setNotToClearGesturesOrder((prev) => new Set(prev).add(gesture.order));
          } else {
            setNotToClearGesturesOrder((prev) => {
              const st = new Set(prev);
              st.delete(gesture.order);
              return st;
            });
          }
        }}
        className="data-[state=checked]:border-blue-600 data-[state=checked]:bg-blue-600 data-[state=checked]:text-white dark:data-[state=checked]:border-blue-700 dark:data-[state=checked]:bg-blue-700"
      />
    </div>
  );
}

const SaveEditMode = ({
  stageRef,
  text_data
}: {
  stageRef: React.RefObject<Konva.Stage | null>;
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
    if (text.trim().length === 0) return;

    // With Konva, we don't need to manipulate canvas objects for saving
    // The gesture data is already stored in state and ready to save

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
