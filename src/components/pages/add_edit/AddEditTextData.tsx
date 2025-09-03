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
import type { Gesture } from '~/tools/stroke_data/types';
import { CANVAS_DIMS, GESTURE_GAP_DURATION } from '~/tools/stroke_data/types';
import { animateGesture } from '~/tools/stroke_data/utils';
import {
  text_atom,
  text_edit_mode_atom,
  font_size_atom,
  gesture_data_atom,
  selected_gesture_index_atom,
  is_recording_atom,
  is_playing_atom,
  main_text_path_visible_atom,
  animated_gesture_lines_atom,
  DEFAULTS,
  is_drawing_atom,
  current_drawing_points_atom,
  not_to_clear_gestures_index_atom,
  temp_points_atom,
  font_family_atom,
  script_atom,
  font_loaded_atom
} from './add_edit_state';
import { Checkbox } from '~/components/ui/checkbox';
import { lekhika_typing_tool, load_parivartak_lang_data } from '~/tools/lipi_lekhika';
import { FONT_LIST, FONT_SCRIPTS, FontFamily } from '~/state/font_list';
import { script_list_obj, script_list_type } from '~/state/lang_list';

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
    [font_size_atom, DEFAULTS.FONT_SIZE],
    [gesture_data_atom, props.text_data.gestures ?? []],
    [selected_gesture_index_atom, null],
    [is_recording_atom, false],
    [is_playing_atom, false],
    [is_drawing_atom, false],
    [current_drawing_points_atom, []]
  ]);
  const stageRef = useRef<Konva.Stage | null>(null);

  return (
    <>
      <AddEditTextData {...props} stageRef={stageRef} />
      <SaveEditMode text_data={props.text_data} />
    </>
  );
}

function AddEditTextData({
  text_data,
  location,
  stageRef
}: Props & {
  stageRef: React.RefObject<Konva.Stage | null>;
}) {
  const [textIntermediate, setIntermediateText] = useState(text_data.text);
  const [text, setText] = useAtom(text_atom);
  const [textEditMode, setTextEditMode] = useAtom(text_edit_mode_atom);
  const [fontSize, setFontSize] = useAtom(font_size_atom);
  const [fontLoaded, setFontLoaded] = useAtom(font_loaded_atom);
  const [mainTextPathVisible, setMainTextPathVisible] = useAtom(main_text_path_visible_atom);

  // Gesture Recording State
  const [gestureData, setGestureData] = useAtom(gesture_data_atom);

  const [selectedGestureIndex, setSelectedGestureIndex] = useAtom(selected_gesture_index_atom);
  const [isRecording] = useAtom(is_recording_atom);
  const [isPlaying, setIsPlaying] = useAtom(is_playing_atom);
  const setAnimatedGestureLines = useSetAtom(animated_gesture_lines_atom);
  const [notToClearGesturesIndex, setNotToClearGesturesIndex] = useAtom(
    not_to_clear_gestures_index_atom
  );

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
      const activeIndex = parseInt(active.id.toString(), 10);
      const isSelectedBeingMoved = selectedGestureIndex === active.id.toString();

      // We need to capture the current state to calculate the new notToClearGesturesIndex
      const oldGestureData = gestureData;
      const oldIndex = oldGestureData.findIndex((g) => g.index === activeIndex);
      const newIndex = oldGestureData.findIndex((g) => g.index.toString() === over.id);

      if (oldIndex === -1 || newIndex === -1) return;

      setGestureData((prev: Gesture[]) => {
        // Reorder the gestures array
        const newGestures = arrayMove(prev, oldIndex, newIndex);

        // Update the index property for each gesture to reflect new positions
        const updatedGestures = newGestures.map((gesture, index) => ({
          ...gesture,
          index: index
        }));

        return updatedGestures;
      });

      // Update notToClearGesturesIndex to reflect the new index values after reordering
      setNotToClearGesturesIndex((prev) => {
        const newSet = new Set<number>();
        // Create a mapping from old index to new index
        const reorderedGestures = arrayMove(oldGestureData, oldIndex, newIndex);

        for (const oldIndex of prev) {
          // Find where this old index ended up in the new array
          const gestureWithOldIndex = oldGestureData.find((g) => g.index === oldIndex);
          if (gestureWithOldIndex) {
            const newPosition = reorderedGestures.findIndex((g) => g === gestureWithOldIndex);
            if (newPosition !== -1) {
              newSet.add(newPosition);
            }
          }
        }

        return newSet;
      });

      // Update selectedGestureId if the selected gesture was moved
      if (isSelectedBeingMoved) {
        // The selected gesture will now be at position newIndex, so its new index is newIndex
        setSelectedGestureIndex(newIndex.toString());
      }
    }
  };

  const addNewGesture = () => {
    const newGesture: Gesture = {
      index: gestureData.length,
      points: [],
      width: DEFAULTS.GESTURE_BRUSH_WIDTH,
      color: DEFAULTS.GESTURE_BRUSH_COLOR, // red
      duration: DEFAULTS.GESTURE_ANIMATION_DURATION
    };
    setGestureData((prev: Gesture[]) => [...prev, newGesture]);
    clearGestureVisualization();
    setSelectedGestureIndex(newGesture.index.toString());
  };

  const clearGestureVisualization = (all = false) => {
    if (all) {
      setAnimatedGestureLines([]);
      return;
    }
    // Clear animated gesture lines from state
    const allowed_gestures = gestureData.filter((g) => notToClearGesturesIndex.has(g.index));
    setAnimatedGestureLines(
      allowed_gestures.map((g) => ({
        index: g.index,
        points_flat: g.points.flatMap((p) => [p[0], p[1]]),
        color: g.color,
        width: g.width
      }))
    );
  };

  const playAllGestures = async () => {
    setIsPlaying(true);
    clearGestureVisualization(true);

    for (const gesture of gestureData) {
      if (gesture.points.length === 0) continue;
      await playGestureWithKonva(gesture);
      await new Promise((resolve) => setTimeout(resolve, GESTURE_GAP_DURATION)); // Small delay between gestures
    }

    setIsPlaying(false);
  };

  // Konva-based gesture animation using framework-agnostic helper
  const playGestureWithKonva = async (gesture: Gesture): Promise<void> => {
    const gestureLineId = gesture.index;

    // Initialize the gesture line in state
    setAnimatedGestureLines((prev) => [
      ...prev.filter((line) => line.index !== gestureLineId),
      {
        index: gestureLineId,
        points_flat: [],
        color: gesture.color,
        width: gesture.width
      }
    ]);

    // Use the framework-agnostic animation helper
    await animateGesture(gesture, (frame) => {
      // Convert points to flat array for Konva Line component
      const flatPoints = frame.partialPoints.flatMap((p) => [p[0], p[1]]);

      setAnimatedGestureLines((prev) =>
        prev.map((line) =>
          line.index === gestureLineId ? { ...line, points_flat: flatPoints } : line
        )
      );
    });
  };

  const selectedGesture = gestureData.find((g) => g.index.toString() === selectedGestureIndex);

  const [script, setScript] = useAtom(script_atom);
  const [fontFamily, setFontFamily] = useAtom(font_family_atom);

  const currentScriptFontList = FONT_LIST[script]!;

  useEffect(() => {
    if (location !== 'add') return;
    load_parivartak_lang_data(script);
    setFontFamily(currentScriptFontList[0].font_family);
  }, [script]);

  useEffect(() => {
    if (fontLoaded.get(fontFamily)) return;
    const font_info = FONT_LIST[script]!.find((f) => f.font_family === fontFamily);
    if (!font_info) return;
    const font = new FontFace(fontFamily, `url(${font_info.url})`);

    font
      .load()
      .then((loadedFont) => {
        document.fonts.add(loadedFont);
        setFontLoaded((prev) => {
          const newMap = new Map(prev);
          newMap.set(fontFamily, true);
          return newMap;
        });
      })
      .catch((err) => {
        console.error('Font loading failed:', err);
      });
  }, [fontFamily]);

  // repaint canvas on change of notToClearGesturesIndex
  useEffect(() => {
    clearGestureVisualization();
  }, [notToClearGesturesIndex]);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <Label className="font-bold">Script</Label>
          {location === 'add' && (
            <select
              value={script}
              onChange={(e) => {
                setScript(e.target.value as script_list_type);
              }}
              className={cn(
                'w-32 rounded-md border border-input bg-background px-2 py-1 text-sm shadow-sm transition-colors',
                'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none',
                'disabled:cursor-not-allowed disabled:opacity-50',
                'text-foreground',
                'dark:border-border dark:bg-background dark:text-foreground'
              )}
            >
              {FONT_SCRIPTS.map((script) => (
                <option
                  key={script}
                  value={script}
                  className={cn(
                    'bg-background text-foreground',
                    'dark:bg-background dark:text-foreground'
                  )}
                >
                  {script}
                </option>
              ))}
            </select>
          )}
          {location !== 'add' && <span className="text-sm">{script}</span>}
        </div>
        <div className="flex items-center gap-2">
          <Label className="font-bold">Font Family</Label>
          <select
            value={fontFamily}
            onChange={(e) => {
              setFontFamily(e.target.value as FontFamily);
            }}
            className={cn(
              'w-40 rounded-md border border-input bg-background px-2 py-1 shadow-sm transition-colors',
              'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none',
              'disabled:cursor-not-allowed disabled:opacity-50',
              'text-foreground',
              'tdark:border-border dark:bg-background dark:text-foreground',
              'text-xs'
            )}
          >
            {currentScriptFontList.map((font) => (
              <option
                key={font.font_family}
                value={font.font_family}
                className={cn(
                  'bg-background text-foreground',
                  'dark:bg-background dark:text-foreground'
                )}
              >
                {font.font_family.split('_').join(' ')}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="flex items-center gap-5">
        <Label className="font-bold">Text</Label>
        {location === 'add' && (
          <div className="flex items-center gap-2">
            <Input
              value={textIntermediate}
              className="w-32"
              disabled={!textEditMode}
              // onInput={(e) => setIntermediateText(e.target.value)}
              onInput={(e) => {
                setIntermediateText(e.currentTarget.value);
                lekhika_typing_tool(
                  e.nativeEvent.target,
                  // @ts-ignore
                  e.nativeEvent.data,
                  script,
                  true,
                  // @ts-ignore
                  (val) => {
                    setIntermediateText(val);
                  }
                );
              }}
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
        )}
        {location !== 'add' && (
          <span className="text-base" style={{ fontFamily }}>
            {text}
          </span>
        )}
        <div className="flex items-center gap-2">
          <Label className="font-bold">Font Size</Label>
          <Input
            value={fontSize}
            className="w-16"
            type="number"
            step={1}
            onChange={(e) => {
              const value = Number(e.target.value);
              if (value > 0) {
                setFontSize(value);
              }
            }}
            style={{ fontFamily }}
          />
        </div>
        <Label className="flex items-center gap-2">
          <Switch
            checked={mainTextPathVisible}
            onCheckedChange={setMainTextPathVisible}
            className=""
          />
        </Label>
      </div>

      {/* Gesture Management Section */}
      <div className="space-y-3">
        <Button
          onClick={addNewGesture}
          size="sm"
          variant="outline"
          disabled={text.trim().length === 0}
        >
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
              onClick={() => clearGestureVisualization()}
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
              items={gestureData.map((g) => g.index.toString())}
              strategy={verticalListSortingStrategy}
            >
              <div className="flex flex-col gap-2">
                {gestureData.map((gesture) => (
                  <SortableGestureItem
                    key={gesture.index.toString()}
                    gesture={gesture}
                    {...{ clearGestureVisualization }}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        </ClientOnly>

        {/* Gesture Controls */}
        {selectedGesture && (
          <SelectedGestureControls
            selectedGesture={selectedGesture}
            {...{ clearGestureVisualization, playGestureWithKonva }}
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
  playGestureWithKonva,
  clearGestureVisualization
}: {
  selectedGesture: Gesture;
  playGestureWithKonva: (gesture: Gesture) => Promise<void>;
  clearGestureVisualization: () => void;
}) => {
  const [isRecording, setIsRecording] = useAtom(is_recording_atom);
  const [isPlaying, setIsPlaying] = useAtom(is_playing_atom);
  const [tempPoints, setTempPoints] = useAtom(temp_points_atom);
  const [gestureData, setGestureData] = useAtom(gesture_data_atom);
  const selectedGestureIndex = useAtomValue(selected_gesture_index_atom);
  const setNotToClearGesturesIndex = useSetAtom(not_to_clear_gestures_index_atom);

  // Recording is now handled by Stage mouse events in the parent component

  // Path handling is now done directly via mouse events in the parent component
  const startRecording = () => {
    if (!selectedGestureIndex) return;
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
    if (!selectedGestureIndex || tempPoints.length === 0) return;

    const pointCount = tempPoints.length;

    // Set the points for the selected gesture (overwrite previous points)
    setGestureData((prev: Gesture[]) =>
      prev.map((gesture) =>
        gesture.index === parseInt(selectedGestureIndex, 10)
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

  const playGesture = async (gestureIndex: number) => {
    const gesture = gestureData.find((g) => g.index === gestureIndex);
    if (!gesture) return;

    setIsPlaying(true);
    clearGestureVisualization();

    // Use the Konva animation function from parent scope
    await playGestureWithKonva(gesture);

    setIsPlaying(false);
  };

  const clearCurrentGesturePoints = () => {
    if (!selectedGestureIndex) return;
    setGestureData((prev: Gesture[]) =>
      prev.map((gesture) =>
        gesture.index === parseInt(selectedGestureIndex, 10) ? { ...gesture, points: [] } : gesture
      )
    );
    setTempPoints([]);
    setNotToClearGesturesIndex((prev) => {
      const st = new Set(prev);
      st.delete(parseInt(selectedGestureIndex, 10));
      return st;
    });
    clearGestureVisualization();
  };

  // Brush settings are now handled declaratively via state

  return (
    <div className="space-y-3 rounded-lg border bg-muted/30 p-3">
      <div className="flex items-center justify-between">
        <span className="font-medium">Selected: Gesture {selectedGesture.index + 1}</span>
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
              onClick={() => playGesture(selectedGesture.index)}
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
              value={selectedGesture.color}
              onChange={(e) =>
                setGestureData((prev: Gesture[]) =>
                  prev.map((gesture) =>
                    gesture.index === parseInt(selectedGestureIndex || '0', 10)
                      ? { ...gesture, color: e.target.value }
                      : gesture
                  )
                )
              }
              className="h-8 w-12 rounded border border-input"
              disabled={isRecording || isPlaying}
            />
            <span className="text-xs text-muted-foreground">{selectedGesture.color}</span>
          </div>
        </div>

        {/* Brush Width */}
        <div className="space-y-2">
          <Label className="text-sm font-medium">Brush Width: {selectedGesture.width}px</Label>
          <Slider
            value={[selectedGesture.width]}
            onValueChange={(value) =>
              setGestureData((prev: Gesture[]) =>
                prev.map((gesture) =>
                  gesture.index === parseInt(selectedGestureIndex || '0', 10)
                    ? { ...gesture, width: value[0] }
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
          <Label className="text-sm font-medium">Animation: {selectedGesture.duration}ms</Label>
          <Slider
            value={[selectedGesture.duration]}
            onValueChange={(value) =>
              setGestureData((prev: Gesture[]) =>
                prev.map((gesture) =>
                  gesture.index === parseInt(selectedGestureIndex || '0', 10)
                    ? { ...gesture, duration: value[0] }
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
  clearGestureVisualization: () => void;
};

function SortableGestureItem({ gesture, clearGestureVisualization }: SortableGestureItemProps) {
  const [isRecording] = useAtom(is_recording_atom);
  const [isPlaying] = useAtom(is_playing_atom);
  const [selectedGestureIndex, setSelectedGestureIndex] = useAtom(selected_gesture_index_atom);
  const setGestureData = useSetAtom(gesture_data_atom);

  const disabled = isRecording || isPlaying;
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: gesture.index.toString(),
    disabled: disabled
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1
  };
  const [notToClearGesturesIndex, setNotToClearGesturesIndex] = useAtom(
    not_to_clear_gestures_index_atom
  );

  const deleteGesture = (gestureIndex: number) => {
    setGestureData((prev: Gesture[]) => {
      // Filter out the deleted gesture
      const filteredGestures = prev.filter((g) => g.index !== gestureIndex);

      // Reorder the remaining gestures to have sequential index values (0, 1, 2, etc.)
      const reorderedGestures = filteredGestures.map((gesture, index) => ({
        ...gesture,
        index: index
      }));

      return reorderedGestures;
    });

    // Update notToClearGesturesIndex set to reflect the new index values
    setNotToClearGesturesIndex((prev) => {
      const newSet = new Set<number>();
      // Convert old indices to new indices for gestures that weren't deleted
      for (const oldIndex of prev) {
        if (oldIndex < gestureIndex) {
          // Indices before the deleted gesture stay the same
          newSet.add(oldIndex);
        } else if (oldIndex > gestureIndex) {
          // Indices after the deleted gesture are decremented by 1
          newSet.add(oldIndex - 1);
        }
        // The deleted gesture's index is not added to the new set
      }
      return newSet;
    });

    // Update selected gesture index logic
    if (selectedGestureIndex === gestureIndex.toString()) {
      setSelectedGestureIndex(null);
    } else if (selectedGestureIndex !== null) {
      const selectedIndex = parseInt(selectedGestureIndex, 10);
      // If selected gesture's index was after the deleted one, decrement it
      if (selectedIndex > gestureIndex) {
        setSelectedGestureIndex((selectedIndex - 1).toString());
      }
    }
  };

  const onSelect = (gestureIndex: string | null) => {
    clearGestureVisualization();
    setSelectedGestureIndex(gestureIndex);
  };

  const onSelectCurrent = () => {
    clearGestureVisualization();
    if (selectedGestureIndex === gesture.index.toString()) {
      onSelect(null);
    } else {
      onSelect(gesture.index.toString());
    }
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'flex cursor-pointer items-center gap-2 rounded border p-2 transition-colors',
        selectedGestureIndex === gesture.index.toString()
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
      <span className="text-sm">Gesture {gesture.index + 1}</span>
      <Button
        size="sm"
        variant="ghost"
        className="h-6 w-6 p-0"
        onClick={(e) => {
          e.stopPropagation();
          deleteGesture(gesture.index);
        }}
        disabled={disabled}
      >
        <MdDeleteOutline className="h-3 w-3" />
      </Button>
      <Checkbox
        id="toggle-2"
        checked={notToClearGesturesIndex.has(gesture.index)}
        onCheckedChange={(checked) => {
          if (checked) {
            setNotToClearGesturesIndex((prev) => new Set(prev).add(gesture.index));
          } else {
            setNotToClearGesturesIndex((prev) => {
              const st = new Set(prev);
              st.delete(gesture.index);
              return st;
            });
          }
        }}
        className="data-[state=checked]:border-blue-600 data-[state=checked]:bg-blue-600 data-[state=checked]:text-white dark:data-[state=checked]:border-blue-700 dark:data-[state=checked]:bg-blue-700"
      />
    </div>
  );
}

const SaveEditMode = ({ text_data }: { text_data: text_data_type }) => {
  const text = useAtomValue(text_atom);
  const gestureData = useAtomValue(gesture_data_atom);
  const script = useAtomValue(script_atom);
  const scriptID = script_list_obj[script]!;

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
        gestures: gestureData,
        scriptID
      });
    } else {
      update_text_data_mut.mutate({
        id: text_data.id!,
        uuid: text_data.uuid!,
        gestures: gestureData
        // script and text can be only set once
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
