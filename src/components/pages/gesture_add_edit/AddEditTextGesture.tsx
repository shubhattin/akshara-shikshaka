'use client';
import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { useNavigate, useRouter } from '@tanstack/react-router';
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
  MdEdit,
  MdSwapHoriz
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
import { EMPTY_RECORDING, recordingToGesture } from '~/tools/stroke_data/recording';
import {
  animateGesture,
  getGestureDuration,
  sleep,
  STROKE_REFERENCE_LENGTH
} from '~/tools/stroke_data/animation';
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
  current_gesture_recording_atom,
  not_to_clear_gestures_index_atom,
  font_family_atom,
  script_atom,
  font_loaded_atom,
  RANGES,
  canvas_text_center_offset_atoms
} from './gesture_add_edit_state';
import { Checkbox } from '~/components/ui/checkbox';
import { transliterate } from 'lipilekhika';
import { FONT_LIST, LANGUAGES_ADDED, type FontFamily } from '~/state/font_list';
import {
  get_lang_from_id,
  get_script_from_id,
  lang_list_obj,
  script_list_obj,
  type lang_list_type
} from '~/state/lang_list';
import { motion } from 'framer-motion';
import type { InferSelectModel } from 'drizzle-orm';
import type { text_gestures } from '~/db/schema';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Cookie from 'js-cookie';
import {
  FONT_FAMILY_COOKIE_KEY,
  get_lesson_lang_id_from_cookie,
  LESSON_LANG_ID_COOKIE_KEY
} from '~/state/cookie';
import { Provider as JotaiProvider } from 'jotai';
import { buttonVariants } from '~/components/ui/button';
import {
  EditorHistoryProvider,
  useEditorHistoryActions,
  useEditorHistoryState,
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
    // oxlint-disable-next-line react/set-state-in-effect -- intentional mount flag to avoid hydration mismatch; runs once on client
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
  /** Lesson categories of its text_key, at most one per language */
  categories?: GestureCategoryInfo[];
};

type Props = {
  text_data: text_data_type & { id: number; uuid: string };
  /** Unsaved changes in the editor (the agent panel asks before reloading over them) */
  onDirtyChange?: (dirty: boolean) => void;
  /** Saved here: the agent panel's views of this gesture refresh */
  onSaved?: (gestureId: number) => void;
};

type GestureCategoryInfo = { id: number; name: string; lang_id: number };

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
    [current_gesture_recording_atom, EMPTY_RECORDING],
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
      <SaveEditMode
        text_data={props.text_data}
        onDirtyChange={props.onDirtyChange}
        onSaved={props.onSaved}
      />
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
  const [categories, setCategories] = useState<GestureCategoryInfo[]>(text_data.categories ?? []);

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

  // One playback at a time, cancelled when the editor unmounts
  const playbackRef = useRef<AbortController | null>(null);
  useEffect(() => () => playbackRef.current?.abort(), []);
  const beginPlayback = () => {
    playbackRef.current?.abort();
    playbackRef.current = new AbortController();
    return playbackRef.current.signal;
  };

  const playAllGestures = async () => {
    const signal = beginPlayback();
    setIsPlaying(true);
    clearGestureVisualization(true);

    for (const gesture of gestureData) {
      if (gesture.points.length === 0) continue;
      if (!(await playGestureWithKonva(gesture, signal))) return;
      if (!(await sleep(GESTURE_GAP_DURATION, signal))) return; // Small delay between gestures
    }

    setIsPlaying(false);
  };

  /** Resolves `false` if the playback was cancelled before the stroke finished */
  const playGestureWithKonva = async (
    gesture: Gesture,
    signal = beginPlayback()
  ): Promise<boolean> => {
    const gesturePathId = gesture.index;

    // Initialize the gesture path in state
    setCanvasGesturesPath((prev) => [
      ...prev.filter((path) => path.index !== gesturePathId),
      {
        index: gesturePathId,
        points: gesture.points,
        color: gesture.color,
        width: gesture.width,
        simulate_pressure: gesture.simulate_pressure,
        reveal: 0
      }
    ]);

    return animateGesture(
      gesture,
      (frame) => {
        setCanvasGesturesPath((prev) =>
          prev.map((path) =>
            path.index === gesturePathId
              ? { ...path, reveal: frame.isComplete ? undefined : frame.reveal }
              : path
          )
        );
      },
      { signal }
    );
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
  }, [fontFamily, script, fontLoaded, setFontLoaded]);

  // repaint canvas on change of notToClearGesturesIndex
  useEffect(() => {
    clearGestureVisualization();
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- clearGestureVisualization captures gestureData and is intentionally not a dep; effect should only run when notToClearGesturesIndex changes
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
  }, [gestureData, selectedGestureIndex, setCanvasGesturesPath]);

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
              // SAFETY: enum lookup validated - key is from controlled enum list.
              setFontFamily(v as FontFamily);
              // SAFETY: enum lookup validated - key is from controlled enum list.
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
            {categories.length > 0
              ? categories.map((c) => `${c.name} (${get_lang_from_id(c.lang_id)})`).join(', ')
              : 'Uncategorized'}
          </span>
          <CategoryChangeButton
            text_data={text_data}
            categories={categories}
            onCategoriesChanged={setCategories}
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
  playGestureWithKonva: (gesture: Gesture) => Promise<boolean>;
  clearGestureVisualization: () => void;
}) => {
  const [isRecording, setIsRecording] = useAtom(is_recording_atom);
  const [isPlaying, setIsPlaying] = useAtom(is_playing_atom);
  const [gestureData, setGestureData] = useAtom(gesture_data_atom);
  const selectedGestureIndex = useAtomValue(selected_gesture_index_atom);
  const setNotToClearGesturesIndex = useSetAtom(not_to_clear_gestures_index_atom);
  const [currentRecording, setCurrentRecording] = useAtom(current_gesture_recording_atom);

  // Path handling is now done directly via mouse events in the parent component
  const startRecording = () => {
    if (selectedGestureIndex === null) return;
    setIsRecording(true);
    clearGestureVisualization();
  };

  const stopRecording = () => {
    setIsRecording(false);
    setCurrentRecording(EMPTY_RECORDING);
    clearGestureVisualization(); // Clear all drawn paths
  };

  const saveRecording = () => {
    if (selectedGestureIndex === null || currentRecording.points.length === 0) return;

    // Save raw CENTERLINE points (plus their timings/pressure); rendering/animation derive
    // outlines from these
    const recorded = recordingToGesture(currentRecording);
    const pointCount = recorded.points.length;

    // Overwrite the selected gesture's previous recording
    setGestureData((prev: Gesture[]) =>
      prev.map((gesture) =>
        gesture.index === selectedGestureIndex ? { ...gesture, ...recorded } : gesture
      )
    );

    // Clear temporary points
    setCurrentRecording(EMPTY_RECORDING);

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
        gesture.index === selectedGestureIndex
          ? { ...gesture, points: [], timings: undefined, pressures: undefined }
          : gesture
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
                    ? {
                        ...gesture,
                        anim_fn:
                          /* SAFETY: validated at boundary - type assertion is safe based on prior schema check */ value as Gesture['anim_fn']
                      }
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
          <Label className="text-sm font-medium">
            Pace: {selectedGesture.duration}ms per {STROKE_REFERENCE_LENGTH}px
            {selectedGesture.points.length > 0 ? (
              <span className="font-normal text-muted-foreground">
                · this stroke {Math.round(getGestureDuration(selectedGesture))}ms
              </span>
            ) : null}
          </Label>
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
                setCurrentRecording(EMPTY_RECORDING);
                clearGestureVisualization(); // Clear canvas for fresh start
              }}
              disabled={currentRecording.points.length === 0}
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
              disabled={currentRecording.points.length === 0}
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

  /** Same stroke, drawn from its other end (capture timings still count from its new start). */
  const reverseGesture = (gestureIndex: number) => {
    clearGestureVisualization();
    setGestureData((prev: Gesture[]) =>
      prev.map((g) => {
        if (g.index !== gestureIndex) return g;
        const reversed: Gesture = { ...g, points: [...g.points].reverse() };
        if (g.timings) {
          const end = g.timings.at(-1) ?? 0;
          reversed.timings = [...g.timings].reverse().map((t) => end - t);
        }
        if (g.pressures) reversed.pressures = [...g.pressures].reverse();
        return reversed;
      })
    );
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
        title="Reverse the direction of this stroke"
        aria-label={`Reverse gesture ${gesture.index + 1}`}
        onClick={(e) => {
          e.stopPropagation();
          reverseGesture(gesture.index);
        }}
        disabled={disabled || gesture.points.length < 2}
      >
        <MdSwapHoriz className="h-3 w-3" />
      </Button>
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
  categories,
  onCategoriesChanged
}: {
  text_data: Props['text_data'];
  categories: GestureCategoryInfo[];
  onCategoriesChanged: (categories: GestureCategoryInfo[]) => void;
}) => {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const script = useAtomValue(script_atom);
  const text = useAtomValue(text_atom);
  const [open, setOpen] = useState(false);
  const [langId, setLangId] = useState<number>(() =>
    get_lesson_lang_id_from_cookie(Cookie.get(LESSON_LANG_ID_COOKIE_KEY))
  );
  const currentCategoryId = categories.find((c) => c.lang_id === langId)?.id ?? 0;
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | null>(currentCategoryId);

  const langOptions = LANGUAGES_ADDED.map((name) => ({
    name,
    // SAFETY: enum lookup validated - key is from controlled enum list.
    id: lang_list_obj[name as lang_list_type]
  }));

  const categories_q = useQuery(
    trpc.text_gestures.categories.get_categories.queryOptions(
      { lang_id: langId },
      { enabled: open }
    )
  );
  const categoryOptions = [{ id: 0, name: 'Uncategorized' }, ...(categories_q.data ?? [])];

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
      setSelectedCategoryId(currentCategoryId);
    }
  };

  const handleLangChange = (next: number) => {
    setLangId(next);
    setSelectedCategoryId(categories.find((c) => c.lang_id === next)?.id ?? 0);
  };

  const handleConfirm = async () => {
    if (selectedCategoryId === null) return;
    if (selectedCategoryId === currentCategoryId) {
      setOpen(false);
      return;
    }
    const nextCategoryId = selectedCategoryId === 0 ? null : selectedCategoryId;

    try {
      // SAFETY: validated at boundary - type assertion is safe based on prior schema check.
      const textKeyFromData = (text_data as text_data_type & { text_key?: string }).text_key;
      const gesture_text_key =
        textKeyFromData ?? (await transliterate(text.trim(), script, 'Normal'));

      await update_category_mut.mutateAsync({
        gesture_text_key,
        lang_id: langId,
        category_id: nextCategoryId
      });

      const nextCategory = categoryOptions.find((c) => c.id === nextCategoryId);
      onCategoriesChanged([
        ...categories.filter((c) => c.lang_id !== langId),
        ...(nextCategory ? [{ id: nextCategory.id, name: nextCategory.name, lang_id: langId }] : [])
      ]);

      await queryClient.invalidateQueries(trpc.text_gestures.categories.get_gestures.pathFilter());

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
            <DialogDescription>
              Choose a lesson category for this gesture. It applies to the gestures of this akṣara
              in every script.
            </DialogDescription>
          </DialogHeader>
          <Select
            items={langOptions.map((o) => ({ label: o.name, value: o.id.toString() }))}
            value={langId.toString()}
            onValueChange={(val) => {
              if (val) handleLangChange(Number(val));
            }}
          >
            <SelectTrigger className="w-56">
              <SelectValue placeholder="Select a Language" />
            </SelectTrigger>
            <SelectContent>
              {langOptions.map((opt) => (
                <SelectItem key={opt.id} value={opt.id.toString()}>
                  {opt.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <RadioGroup
            value={selectedCategoryId?.toString() ?? ''}
            onValueChange={(v) => setSelectedCategoryId(Number(v))}
            className="flex flex-col gap-2"
          >
            {categoryOptions.map((cat) => (
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
                selectedCategoryId === currentCategoryId
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

const SaveEditMode = ({
  text_data,
  onDirtyChange,
  onSaved
}: Pick<Props, 'text_data' | 'onDirtyChange' | 'onSaved'>) => {
  const queryClient = useQueryClient();
  const trpc = useTRPC();
  const router = useRouter();
  const { beginSave, markSaved } = useEditorHistoryActions();
  const { isDirty } = useEditorHistoryState();
  useEffect(() => onDirtyChange?.(isDirty), [isDirty, onDirtyChange]);
  const chats_q = useQuery(
    trpc.agents.chats_for_gesture.queryOptions({ gesture_id: text_data.id })
  );
  const focusedChats = chats_q.data?.filter((chat) => chat.focused).length ?? 0;
  /** The version this editor holds: a save made elsewhere since then is a conflict. */
  const revisionRef = useRef(text_data.revision);
  const gestureData = useAtomValue(gesture_data_atom);
  const script = useAtomValue(script_atom);
  const scriptID = script_list_obj[script]!;

  const fontFamily = useAtomValue(font_family_atom);
  const fontSize = useAtomValue(font_size_atom);
  const textCenterOffset = useAtomValue(canvas_text_center_offset_atoms);

  const navigate = useNavigate();

  const update_text_data_mut = useMutation(
    trpc.text_gestures.edit_text_gesture_data.mutationOptions({
      onError(error) {
        if (error.data?.code === 'CONFLICT') {
          toast.error(error.message, {
            duration: 15_000,
            action: { label: 'Reload', onClick: () => void router.invalidate() }
          });
          return;
        }
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
          trpc.text_gestures.categories.get_gestures.pathFilter()
        );
        // its chats lose their focus and its batch items are gone
        void queryClient.invalidateQueries(trpc.agents.pathFilter());
        // SAFETY: validated at boundary - type assertion is safe based on prior schema check.
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
        textCenterOffset,
        expectedRevision: revisionRef.current
      },
      {
        onSuccess: (data) => {
          if (!data.updated) return;
          revisionRef.current = data.revision;
          markSaved();
          onSaved?.(text_data.id);
          toast.success(`Saved as v${data.revision}`);
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
              <AlertDialogDescription>
                Are you sure to Delete this Text ?
                {focusedChats > 0
                  ? ` Its ${focusedChats} focused agent ${focusedChats === 1 ? 'chat is' : 'chats are'} deleted with it, along with its version history.`
                  : ' Its version history is deleted with it.'}
              </AlertDialogDescription>
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
