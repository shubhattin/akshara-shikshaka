'use client';
import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { Button } from '~/components/ui/button';
import { Input } from '~/components/ui/input';
import { Label } from '~/components/ui/label';
import { Slider } from '~/components/ui/slider';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '~/components/ui/select';
import type Konva from 'konva';
import { useTRPC } from '~/api/client';
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '~/components/ui/dialog';
import { RadioGroup, RadioGroupItem } from '~/components/ui/radio-group';
import { IoMdAdd } from 'react-icons/io';
import {
  MdDeleteOutline,
  MdPlayArrow,
  MdStop,
  MdClear,
  MdFiberManualRecord,
  MdDragHandle,
  MdReplay,
  MdEdit
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
  font_size_atom,
  gesture_data_atom,
  selected_gesture_index_atom,
  is_recording_atom,
  is_playing_atom,
  main_text_path_visible_atom,
  canvas_gestures_path_atom,
  DEFAULTS,
  is_drawing_atom,
  current_gesture_recording_points_atom,
  not_to_clear_gestures_index_atom,
  font_family_atom,
  script_atom,
  font_loaded_atom,
  RANGES,
  canvas_text_center_offset_atoms
} from './gesture_add_edit_state';
import { Checkbox } from '~/components/ui/checkbox';
import { transliterate } from 'lipilekhika';
import { FONT_LIST, type FontFamily } from '~/state/font_list';
import { script_list_obj } from '~/state/lang_list';
import { get_script_from_id } from '~/state/lang_list';
import { motion } from 'framer-motion';
import type { InferSelectModel } from 'drizzle-orm';
import type { text_gestures } from '~/db/schema';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Cookie from 'js-cookie';
import { FONT_FAMILY_COOKIE_KEY } from '~/state/cookie';
import { Provider as JotaiProvider } from 'jotai';
import { buttonVariants } from '~/components/ui/button';
import {
  EditorHistoryProvider,
  useEditorHistoryActions,
  useHistoryTextField
} from '~/hooks/useEditorHistory';
import { EditorActionDock } from '~/components/editor/EditorActionDock';

// Lazy-load the heavy Konva bundle; SSR is blocked at the render site.
const KonvaCanvas = lazy(() => import('./AddEditGestureCanvas'));

const konvaCanvasFallback = (
  <div
    className="flex items-center justify-center rounded-lg border-2 bg-gray-50"
    style={{ width: CANVAS_DIMS.width, height: CANVAS_DIMS.height }}
  >
    <div className="text-gray-500">Loading...</div>
  </div>
);

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

export type text_data_type = Omit<
  InferSelectModel<typeof text_gestures>,
  'created_at' | 'updated_at' | 'text_key' | 'id' | 'uuid'
> & {
  id?: number;
  uuid?: string;
  font_family: FontFamily;
  category?: {
    id: number;
    name: string;
  } | null;
};

type Props = {
  text_data: text_data_type & { id: number; uuid: string };
};

type CategoryInfo = {
  id: number;
  name: string;
} | null;

const GESTURE_HISTORY_ATOMS = {
  text: text_atom,
  script: script_atom,
  font_family: font_family_atom,
  font_size: font_size_atom,
  text_center_offset: canvas_text_center_offset_atoms,
  gestures: gesture_data_atom
};

const PracticeComponent = lazy(() => import('../practice/Practice'));

export default function AddEditTextDataWrapper(props: Props) {
  useHydrateAtoms([
    [text_atom, props.text_data.text],
    [gesture_data_atom, props.text_data.gestures ?? []],
    [selected_gesture_index_atom, null],
    [is_recording_atom, false],
    [is_playing_atom, false],
    [is_drawing_atom, false],
    [current_gesture_recording_points_atom, []],
    [font_family_atom, props.text_data.font_family],
    [font_loaded_atom, new Map<FontFamily, boolean>()],
    [font_size_atom, props.text_data.font_size],
    [canvas_text_center_offset_atoms, props.text_data.text_center_offset],
    [script_atom, get_script_from_id(props.text_data.script_id)]
  ]);
  const stageRef = useRef<Konva.Stage | null>(null);

  return (
    <EditorHistoryProvider atoms={GESTURE_HISTORY_ATOMS}>
      <AddEditTextData text_data={props.text_data} stageRef={stageRef} />
      <SaveEditMode text_data={props.text_data} />
      <PracticeSection text_data={props.text_data} />
    </EditorHistoryProvider>
  );
}

function AddEditTextData({
  text_data,
  stageRef
}: {
  text_data: Props['text_data'];
  stageRef: React.RefObject<Konva.Stage | null>;
}) {
  const [text] = useAtom(text_atom);
  const [fontSize, setFontSize] = useAtom(font_size_atom);
  const fontSizeHistory = useHistoryTextField();
  const [fontLoaded, setFontLoaded] = useAtom(font_loaded_atom);
  const [mainTextPathVisible, setMainTextPathVisible] = useAtom(main_text_path_visible_atom);
  const [category, setCategory] = useState<CategoryInfo>(text_data.category ?? null);

  // Gesture Recording State
  const [gestureData, setGestureData] = useAtom(gesture_data_atom);

  const [selectedGestureIndex, setSelectedGestureIndex] = useAtom(selected_gesture_index_atom);
  const [isRecording] = useAtom(is_recording_atom);
  const [isPlaying, setIsPlaying] = useAtom(is_playing_atom);
  const setCanvasGesturesPath = useSetAtom(canvas_gestures_path_atom);
  const [notToClearGesturesIndex, setNotToClearGesturesIndex] = useAtom(
    not_to_clear_gestures_index_atom
  );
  const setCanvasTextCenterOffset = useSetAtom(canvas_text_center_offset_atoms);

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
      const overIndex = parseInt(over.id.toString(), 10);
      const isSelectedBeingMoved = selectedGestureIndex === activeIndex;

      // We need to capture the current state to calculate the new notToClearGesturesIndex
      const oldGestureData = gestureData;
      const oldIndex = oldGestureData.findIndex((g) => g.index === activeIndex);
      const newIndex = oldGestureData.findIndex((g) => g.index === overIndex);

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
        setSelectedGestureIndex(newIndex);
      }
    }
  };

  const addNewGesture = () => {
    const newGesture: Gesture = {
      index: gestureData.length,
      points: [],
      width: DEFAULTS.GESTURE_BRUSH_WIDTH,
      color: DEFAULTS.GESTURE_BRUSH_COLOR, // red
      duration: DEFAULTS.GESTURE_ANIMATION_DURATION,
      anim_fn: DEFAULTS.GESTURE_ANIMATION_FUNCTION,
      simulate_pressure: DEFAULTS.GESTURE_SIMULATE_PRESSURE
    };
    setGestureData((prev: Gesture[]) => [...prev, newGesture]);
    clearGestureVisualization();
    setSelectedGestureIndex(newGesture.index);
  };

  const clearGestureVisualization = (all = false) => {
    if (all) {
      setCanvasGesturesPath([]);
      return;
    }
    // Clear animated gesture paths from state
    const allowed_gestures = gestureData.filter((g) => notToClearGesturesIndex.has(g.index));
    setCanvasGesturesPath(
      allowed_gestures.map((g) => ({
        index: g.index,
        color: g.color,
        width: g.width,
        points: g.points,
        simulate_pressure: g.simulate_pressure
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
    const gesturePathId = gesture.index;

    // Initialize the gesture path in state
    setCanvasGesturesPath((prev) => [
      ...prev.filter((path) => path.index !== gesturePathId),
      {
        index: gesturePathId,
        points: [],
        color: gesture.color,
        width: gesture.width,
        simulate_pressure: gesture.simulate_pressure
      }
    ]);

    // Use the framework-agnostic animation helper
    await animateGesture(gesture, (frame) => {
      setCanvasGesturesPath((prev) =>
        prev.map((path) =>
          path.index === gesturePathId
            ? { ...path, points: frame.partialPoints, isAnimatedPath: true }
            : path
        )
      );
    });
  };

  const selectedGesture = gestureData.find((g) => g.index === selectedGestureIndex);

  const script = useAtomValue(script_atom);
  const [fontFamily, setFontFamily] = useAtom(font_family_atom);

  const currentScriptFontList = FONT_LIST[script]!;

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

  useEffect(() => {
    if (selectedGestureIndex === null) return;
    const currentGesture = gestureData.find((g) => g.index === selectedGestureIndex)!;
    // on gesture data change if there is a instance of it inside of animated gesture then update it
    setCanvasGesturesPath((prev) =>
      prev.map((g) =>
        g.index === currentGesture.index
          ? {
              color: currentGesture.color,
              width: currentGesture.width,
              index: currentGesture.index,
              points: currentGesture.points,
              simulate_pressure: currentGesture.simulate_pressure
            }
          : g
      )
    );
  }, [gestureData, selectedGestureIndex]);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <Label className="font-bold">Script</Label>
          <span className="text-sm">{script}</span>
        </div>
        <div className="flex items-center gap-2">
          <Label className="font-bold">Font Family</Label>
          <Select
            items={[
              { label: 'Font Family', value: null },
              ...currentScriptFontList.map((f) => ({
                label: f.font_family.split('_').join(' '),
                value: f.font_family
              }))
            ]}
            value={fontFamily}
            onValueChange={(v) => {
              if (!v) return;
              setFontFamily(v as FontFamily);
              Cookie.set(FONT_FAMILY_COOKIE_KEY, v as FontFamily, { expires: 30 });
            }}
          >
            <SelectTrigger className="w-40 text-xs">
              <SelectValue placeholder="Font Family" />
            </SelectTrigger>
            <SelectContent>
              {currentScriptFontList.map((font) => (
                <SelectItem key={font.font_family} value={font.font_family}>
                  {font.font_family.split('_').join(' ')}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2">
          <Label className="font-bold">Category</Label>
          <span className="text-sm font-semibold underline">
            {category?.name ?? 'Uncategorized'}
          </span>
          <CategoryChangeButton
            text_data={text_data}
            category={category}
            onCategoryChanged={setCategory}
          />
        </div>
      </div>
      <div className="flex items-center gap-5">
        <Label className="font-bold">Text</Label>
        <span className="text-base" style={{ fontFamily }}>
          {text}
        </span>
        <div className="flex items-center gap-2">
          <Label className="font-bold">Font Size</Label>
          <Input
            value={fontSize}
            className="w-16"
            type="number"
            step={1}
            onFocus={fontSizeHistory.onFocus}
            onBlur={fontSizeHistory.onBlur}
            onChange={(e) => {
              const value = Number(e.target.value);
              if (value > 0) {
                setFontSize(value);
              }
            }}
          />
        </div>
        <Label className="flex items-center gap-2">
          <Switch
            checked={mainTextPathVisible}
            onCheckedChange={setMainTextPathVisible}
            className=""
          />
        </Label>
        {mainTextPathVisible && (
          <button
            className="rounded border border-gray-300 bg-gray-100 px-2 py-1 text-sm text-gray-700 transition-colors hover:bg-gray-200 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
            type="button"
            onClick={() => setCanvasTextCenterOffset([0, 0])}
          >
            Center Text
          </button>
        )}
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
          <ClientOnly fallback={konvaCanvasFallback}>
            <Suspense fallback={konvaCanvasFallback}>
              <KonvaCanvas ref={stageRef} />
            </Suspense>
          </ClientOnly>
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
  const [gestureData, setGestureData] = useAtom(gesture_data_atom);
  const selectedGestureIndex = useAtomValue(selected_gesture_index_atom);
  const setNotToClearGesturesIndex = useSetAtom(not_to_clear_gestures_index_atom);
  const [currentGestureRecordingPoints, setCurrentGestureRecordingPoints] = useAtom(
    current_gesture_recording_points_atom
  );

  // Path handling is now done directly via mouse events in the parent component
  const startRecording = () => {
    if (selectedGestureIndex === null) return;
    setIsRecording(true);
    clearGestureVisualization();
  };

  const stopRecording = () => {
    setIsRecording(false);
    setCurrentGestureRecordingPoints([]);
    clearGestureVisualization(); // Clear all drawn paths
  };

  const saveRecording = () => {
    if (selectedGestureIndex === null || currentGestureRecordingPoints.length === 0) return;

    // Save CENTERLINE points; rendering/animation derive polygons from these
    const centerlinePoints = currentGestureRecordingPoints;
    const pointCount = centerlinePoints.length;

    // Set the points for the selected gesture (overwrite previous points)
    setGestureData((prev: Gesture[]) =>
      prev.map((gesture) =>
        gesture.index === selectedGestureIndex ? { ...gesture, points: centerlinePoints } : gesture
      )
    );

    // Clear temporary points
    setCurrentGestureRecordingPoints([]);

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
    if (selectedGestureIndex === null) return;
    setGestureData((prev: Gesture[]) =>
      prev.map((gesture) =>
        gesture.index === selectedGestureIndex ? { ...gesture, points: [] } : gesture
      )
    );
    setNotToClearGesturesIndex((prev) => {
      const st = new Set(prev);
      st.delete(selectedGestureIndex);
      return st;
    });
    clearGestureVisualization();
  };

  return (
    <motion.div
      className="space-y-3 rounded-lg border bg-muted/30 p-3"
      // initial={{ y: -100, opacity: 0 }}
      // animate={{ y: 0, opacity: 1 }}
      // exit={{ y: 100, opacity: 0 }}
      // transition={{ type: 'spring', stiffness: 300, damping: 30 }}
    >
      {/* <div className="flex items-center justify-between">
        <span className="font-medium">Selected: Gesture {selectedGesture.index + 1}</span>
      </div> */}

      {/* Gesture Settings */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
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
                    gesture.index === selectedGestureIndex
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
        {/* Animation Timing Function */}
        <div className="space-y-2">
          <Label className="text-sm font-medium">Animation Easing</Label>
          <Select
            items={[
              { label: 'Linear', value: 'linear' },
              { label: 'Ease', value: 'ease' },
              { label: 'Ease In', value: 'ease-in' },
              { label: 'Ease Out', value: 'ease-out' },
              { label: 'Ease In-Out', value: 'ease-in-out' }
            ]}
            value={selectedGesture.anim_fn}
            onValueChange={(value) =>
              setGestureData((prev: Gesture[]) =>
                prev.map((gesture) =>
                  gesture.index === selectedGestureIndex
                    ? { ...gesture, anim_fn: value as Gesture['anim_fn'] }
                    : gesture
                )
              )
            }
            disabled={isRecording || isPlaying}
          >
            <SelectTrigger size="sm" className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="linear">Linear</SelectItem>
              <SelectItem value="ease">Ease</SelectItem>
              <SelectItem value="ease-in">Ease In</SelectItem>
              <SelectItem value="ease-out">Ease Out</SelectItem>
              <SelectItem value="ease-in-out">Ease In-Out</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Brush Width */}
        <div className="space-y-2">
          <Label className="text-sm font-medium">Brush Width: {selectedGesture.width}px</Label>
          <Slider
            value={[selectedGesture.width]}
            onValueChange={(value) =>
              setGestureData((prev: Gesture[]) =>
                prev.map((gesture) =>
                  gesture.index === selectedGestureIndex
                    ? { ...gesture, width: Array.isArray(value) ? value[0] : value }
                    : gesture
                )
              )
            }
            min={RANGES.brush_width.min}
            max={RANGES.brush_width.max}
            step={RANGES.brush_width.step}
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
                  gesture.index === selectedGestureIndex
                    ? { ...gesture, duration: Array.isArray(value) ? value[0] : value }
                    : gesture
                )
              )
            }
            min={RANGES.animation_duration.min}
            max={RANGES.animation_duration.max}
            step={RANGES.animation_duration.step}
            className="w-full"
            disabled={isRecording || isPlaying}
          />
        </div>
        {/* Simulate Pressure */}
        <div className="flex items-center justify-center gap-2">
          <Label className="gap-2 text-sm font-medium">
            <Switch
              checked={selectedGesture.simulate_pressure}
              onCheckedChange={(value) =>
                setGestureData((prev: Gesture[]) =>
                  prev.map((gesture) =>
                    gesture.index === selectedGestureIndex
                      ? { ...gesture, simulate_pressure: value }
                      : gesture
                  )
                )
              }
              disabled={isRecording || isPlaying}
            />
            Simulate Pressure
          </Label>
        </div>
      </div>

      <div className="mt-4 flex items-center justify-center gap-2">
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
                setCurrentGestureRecordingPoints([]);
                clearGestureVisualization(); // Clear canvas for fresh start
              }}
              disabled={currentGestureRecordingPoints.length === 0}
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
              disabled={currentGestureRecordingPoints.length === 0}
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
    </motion.div>
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
    if (selectedGestureIndex === gestureIndex) {
      setSelectedGestureIndex(null);
    } else if (selectedGestureIndex !== null) {
      // If selected gesture's index was after the deleted one, decrement it
      if (selectedGestureIndex > gestureIndex) {
        setSelectedGestureIndex(selectedGestureIndex - 1);
      }
    }
  };

  const onSelect = (gestureIndex: number | null) => {
    clearGestureVisualization();
    setSelectedGestureIndex(gestureIndex);
  };

  const onSelectCurrent = () => {
    clearGestureVisualization();
    if (selectedGestureIndex === gesture.index) {
      onSelect(null);
    } else {
      onSelect(gesture.index);
    }
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'flex cursor-pointer items-center gap-2 rounded border p-2 transition-colors',
        selectedGestureIndex === gesture.index
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

const CategoryChangeButton = ({
  text_data,
  category,
  onCategoryChanged
}: {
  text_data: Props['text_data'];
  category: CategoryInfo;
  onCategoryChanged: (category: CategoryInfo) => void;
}) => {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const script = useAtomValue(script_atom);
  const text = useAtomValue(text_atom);
  const scriptID = script_list_obj[script]!;
  const [open, setOpen] = useState(false);
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | null>(category?.id ?? 0);

  const categories_q = useQuery(trpc.text_gestures.categories.get_categories.queryOptions());
  const categories = [{ id: 0, name: 'Uncategorized', order: 0 }, ...(categories_q.data ?? [])];

  const update_category_mut = useMutation(
    trpc.text_gestures.categories.add_update_gesture_category.mutationOptions({
      onError() {
        toast.error('Failed to update category');
      }
    })
  );

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (next) {
      setSelectedCategoryId(category?.id ?? 0);
    }
  };

  const handleConfirm = async () => {
    if (selectedCategoryId === null) return;
    const nextCategoryId = selectedCategoryId === 0 ? null : selectedCategoryId;
    const prevCategoryId = category?.id;
    if (nextCategoryId === (prevCategoryId ?? null)) {
      setOpen(false);
      return;
    }

    try {
      const textKeyFromData = (text_data as text_data_type & { text_key?: string }).text_key;
      const gesture_text_key =
        textKeyFromData ?? (await transliterate(text.trim(), script, 'Normal'));

      await update_category_mut.mutateAsync({
        gesture_id: text_data.id,
        gesture_text_key,
        script_id: scriptID,
        category_id: nextCategoryId,
        prev_category_id: prevCategoryId
      });

      const nextCategory =
        nextCategoryId === null ? null : (categories.find((c) => c.id === nextCategoryId) ?? null);
      onCategoryChanged(nextCategory ? { id: nextCategory.id, name: nextCategory.name } : null);

      const prevId = prevCategoryId ?? 0;
      const nextId = nextCategoryId ?? 0;
      await Promise.all([
        queryClient.invalidateQueries(
          trpc.text_gestures.categories.get_gestures.queryFilter({
            category_id: prevId,
            script_id: scriptID
          })
        ),
        queryClient.invalidateQueries(
          trpc.text_gestures.categories.get_gestures.queryFilter({
            category_id: nextId,
            script_id: scriptID
          })
        )
      ]);

      toast.success('Category updated');
      setOpen(false);
    } catch {
      // Mutation failures already toast via onError; cover transliterate / invalidate errors.
      if (!update_category_mut.isError) {
        toast.error('Failed to update category');
      }
    }
  };

  return (
    <>
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="h-7 gap-1 px-2 text-xs"
        onClick={() => handleOpenChange(true)}
      >
        <MdEdit className="size-3.5" />
        Change
      </Button>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change Category</DialogTitle>
            <DialogDescription>Choose a category for this gesture.</DialogDescription>
          </DialogHeader>
          <RadioGroup
            value={selectedCategoryId?.toString() ?? ''}
            onValueChange={(v) => setSelectedCategoryId(Number(v))}
            className="flex flex-col gap-2"
          >
            {categories.map((cat) => (
              <div key={cat.id} className="flex items-center gap-2">
                <RadioGroupItem id={`gesture-edit-cat-${cat.id}`} value={String(cat.id)} />
                <Label
                  htmlFor={`gesture-edit-cat-${cat.id}`}
                  className={cn(cat.id === 0 && 'text-muted-foreground')}
                >
                  {cat.name}
                </Label>
              </div>
            ))}
          </RadioGroup>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => void handleConfirm()}
              disabled={
                selectedCategoryId === null ||
                update_category_mut.isPending ||
                selectedCategoryId === (category?.id ?? 0)
              }
            >
              {update_category_mut.isPending ? 'Updating…' : 'Confirm'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

const SaveEditMode = ({ text_data }: { text_data: Props['text_data'] }) => {
  const queryClient = useQueryClient();
  const trpc = useTRPC();
  const { beginSave, markSaved } = useEditorHistoryActions();
  const gestureData = useAtomValue(gesture_data_atom);
  const script = useAtomValue(script_atom);
  const scriptID = script_list_obj[script]!;

  const fontFamily = useAtomValue(font_family_atom);
  const fontSize = useAtomValue(font_size_atom);
  const textCenterOffset = useAtomValue(canvas_text_center_offset_atoms);

  const navigate = useNavigate();

  const update_text_data_mut = useMutation(
    trpc.text_gestures.edit_text_gesture_data.mutationOptions({
      onError() {
        toast.error('Failed to update text');
      }
    })
  );

  const delete_text_data_mut = useMutation(
    trpc.text_gestures.delete_text_gesture_data.mutationOptions({
      async onSuccess(data) {
        if (!data.deleted) return;
        toast.success('Text Deleted');
        await queryClient.invalidateQueries(
          trpc.text_gestures.categories.get_gestures.queryFilter({
            category_id: text_data.category?.id ?? 0, // 0 -> uncategorized
            script_id: scriptID
          })
        );
        navigate({ to: '/gestures' } as never);
      },
      onError() {
        toast.error('Failed to delete text');
      }
    })
  );

  const handle_save = () => {
    beginSave();
    update_text_data_mut.mutate(
      {
        id: text_data.id,
        uuid: text_data.uuid,
        gestures: gestureData,
        fontFamily,
        fontSize,
        textCenterOffset
      },
      {
        onSuccess: (data) => {
          if (!data.updated) return;
          markSaved();
          toast.success('Text Updated');
        }
      }
    );
  };

  const handleDelete = () => {
    delete_text_data_mut.mutate({
      id: text_data.id,
      uuid: text_data.uuid,
      script_id: scriptID
    });
  };

  return (
    <>
      <EditorActionDock onSave={handle_save} isSaving={update_text_data_mut.isPending} />
      <div className="mx-2 mt-2 flex items-center justify-end sm:mx-4">
        <AlertDialog>
          <AlertDialogTrigger
            className={cn(
              buttonVariants({ variant: 'destructive' }),
              'flex gap-1 px-1 py-0 text-sm'
            )}
          >
            <MdDeleteOutline className="text-base" />
            Delete
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
      </div>
    </>
  );
};

const PracticeSection = ({ text_data }: { text_data: text_data_type }) => {
  const [displayPractice, setDisplayPractice] = useState(false);
  const gestures = useAtomValue(gesture_data_atom);

  return (
    <div className="mt-8 space-y-4">
      <div className="flex items-center justify-center">
        <Button
          className={cn(
            'font-semibold',
            displayPractice
              ? 'text-yellow-600 hover:text-yellow-700 dark:text-yellow-400 dark:hover:text-yellow-300'
              : 'text-sky-600 hover:text-sky-700 dark:text-sky-300 dark:hover:text-sky-400'
          )}
          variant={displayPractice ? 'ghost' : 'outline'}
          onClick={() => setDisplayPractice(!displayPractice)}
        >
          {displayPractice ? 'Hide Gesture Practice' : 'Try Gesture Practice'}
        </Button>
      </div>
      {displayPractice && (
        <JotaiProvider key={`practice_section_edit_page-${text_data.id}`}>
          <PracticeComponent
            text_data={{
              id: text_data.id!,
              uuid: text_data.uuid!,
              text: text_data.text,
              gestures: gestures,
              script_id: text_data.script_id
            }}
          />
        </JotaiProvider>
      )}
    </div>
  );
};
