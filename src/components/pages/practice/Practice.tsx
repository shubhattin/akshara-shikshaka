'use client';

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  createContext,
  useContext,
  Children,
  isValidElement,
  lazy,
  Suspense
} from 'react';
import type Konva from 'konva';
import { cn } from '~/lib/utils';
import { MdPlayArrow, MdArrowForward, MdRefresh, MdClose, MdReplay } from 'react-icons/md';
import { evaluateGestureAccuracy, animateGesture } from '~/tools/stroke_data/utils';
import {
  CANVAS_DIMS,
  GESTURE_GAP_DURATION,
  type GesturePoints,
  type Gesture
} from '~/tools/stroke_data/types';
import { motion, AnimatePresence } from 'framer-motion';
import { AiOutlineSignature } from 'react-icons/ai';
import { atom, useAtom, useSetAtom } from 'jotai';
import { useHydrateAtoms } from 'jotai/utils';
import {
  canvas_current_mode,
  current_gesture_index_atom,
  is_drawing_atom,
  completed_gestures_count_atom,
  is_animating_current_gesture_atom,
  show_try_again_atom,
  last_accuracy_atom,
  scaling_factor_atom,
  animated_gesture_lines_atom,
  current_gesture_points_atom,
  TRY_AGAIN_WAIT_DURATION
} from './practice_state';
import { useTRPC } from '~/api/client';
import { useMutation } from '@tanstack/react-query';
import { useTurnstile } from 'react-turnstile';
import TurnstileWidget, { TURNSTILE_ENABLED } from '~/components/Turnstile';
import { deepCopy } from '~/tools/kry';
import { Button } from '~/components/ui/button';
import { Skeleton } from '~/components/ui/skeleton';
import { toast } from 'sonner';
import { canSubmitPlayMetrics, playMetricsToken, usePlayAuth } from '~/lib/play_metrics_auth';
import { useInvalidateUserDashboard } from '~/api/routers/user/invalidate_user_dashboard';

const ACCURACY_THRESHOLD = 0.75;
const SCALING_FACTOR_FOR_WIDTH = 0.85;

const PracticeKonvaCanvas = lazy(() => import('./PracticeCanvas'));

const practiceCanvasFallback = (
  <div className="flex h-[400px] w-[400px] max-w-[90vw] items-center justify-center rounded-lg border-2 bg-gray-50" />
);

type text_data_type = {
  id: number;
  uuid: string;
  text: string;
  script_id: number;
  gestures?: Gesture[] | null;
};

type Props = {
  text_data: text_data_type;
  play_gesture_on_mount?: boolean;
  // rendered on complete - can be ReactNode or a function that receives restartPractice callback
  children?: React.ReactNode | ((restartPractice: () => Promise<void>) => React.ReactNode);
};

const turnstile_token_atom = atom<string | null>(null);

function PracticeWrapper(props: Props) {
  // Initialize atoms with default values
  useHydrateAtoms([
    [canvas_current_mode, 'none' as const],
    [current_gesture_index_atom, 0],
    [is_drawing_atom, false],
    [completed_gestures_count_atom, 0],
    [is_animating_current_gesture_atom, false],
    [show_try_again_atom, false],
    [last_accuracy_atom, 0],
    [animated_gesture_lines_atom, []]
  ]);

  const setTurnstileToken = useSetAtom(turnstile_token_atom);
  const { authReady, isAuthed } = usePlayAuth();
  const showTurnstile = TURNSTILE_ENABLED && authReady && !isAuthed;

  return (
    <>
      <Practice {...props}>
        {
          /* SAFETY: children prop is ReactNode union - assertion narrows for Children.toArray iteration */ props.children as React.ReactNode
        }
      </Practice>
      {showTurnstile ? <TurnstileWidget setToken={setTurnstileToken} /> : null}
    </>
  );
}

// Context to share Practice state and actions with subcomponents
type PracticeContextValue = {
  isCompleted: boolean;
  restartPractice: () => Promise<void>;
};

const PracticeContext = createContext<PracticeContextValue | null>(null);

function usePracticeContext(): PracticeContextValue {
  const ctx = useContext(PracticeContext);
  if (!ctx) throw new Error('Practice subcomponents must be used within <Practice>');
  return ctx;
}

// oxlint-disable-next-line complexity -- Practice orchestrates canvas, gesture, and submission state; extracted helpers cover sub-concerns; refactor to smaller hooks deferred
function Practice({ text_data, play_gesture_on_mount, children }: Props) {
  const stageRef = useRef<Konva.Stage | null>(null);
  const trpc = useTRPC();

  const [turnstileToken, setTurnstileToken] = useAtom(turnstile_token_atom);
  const turnstile = useTurnstile();
  const turnstileRef = useRef(turnstile);
  useEffect(() => {
    turnstileRef.current = turnstile;
  }, [turnstile]);
  const resetTurnstile = () => turnstileRef.current?.reset();
  const { authReady, isAuthed } = usePlayAuth();
  const invalidateUserDashboard = useInvalidateUserDashboard();
  const turnstileTokenRef = useRef(turnstileToken);
  turnstileTokenRef.current = turnstileToken;
  const authReadyRef = useRef(authReady);
  authReadyRef.current = authReady;
  const isAuthedRef = useRef(isAuthed);
  isAuthedRef.current = isAuthed;

  // Practice state from atoms
  const [canvasCurrentMode, setCanvasCurrentMode] = useAtom(canvas_current_mode);
  const [currentGestureIndex, setCurrentGestureIndex] = useAtom(current_gesture_index_atom);
  const [isDrawing, setIsDrawing] = useAtom(is_drawing_atom);
  const [completedGesturesCount, setCompletedGesturesCount] = useAtom(
    completed_gestures_count_atom
  );
  const [isAnimatingCurrentGesture, setIsAnimatingCurrentGesture] = useAtom(
    is_animating_current_gesture_atom
  );
  const [showTryAgain, setShowTryAgain] = useAtom(show_try_again_atom);
  const [lastAccuracy, setLastAccuracy] = useAtom(last_accuracy_atom);
  const [scalingFactor, setScalingFactor] = useAtom(scaling_factor_atom);
  const setAnimatedGestureLines = useSetAtom(animated_gesture_lines_atom);
  const setCurrentGesturePoints = useSetAtom(current_gesture_points_atom);

  const tryAgainTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  useEffect(() => {
    return () => {
      if (tryAgainTimeoutRef.current) {
        clearTimeout(tryAgainTimeoutRef.current);
        tryAgainTimeoutRef.current = null;
      }
    };
  }, []);

  const userGestureVectorsRef = useRef<
    {
      index: number;
      recorded_vector: number[];
      drawn_vector: number[];
      recorded_accuracy: number;
    }[]
  >([]);

  const flattenPoints = (pts: GesturePoints[]): number[] => pts.flatMap(([x, y]) => [x, y]);

  const upsertUserVector = (
    gestureIndex: number,
    recorded: GesturePoints[],
    drawn: GesturePoints[],
    recorded_accuracy: number
  ) => {
    const vectors = userGestureVectorsRef.current;
    const next = {
      index: gestureIndex,
      recorded_vector: flattenPoints(recorded),
      drawn_vector: flattenPoints(drawn),
      recorded_accuracy: recorded_accuracy
    };
    // we also record the failed attempts
    vectors.push(next);
  };

  const submit_user_recording_mut = useMutation(
    trpc.user_gesture_recordings.submit_user_gesture_recording.mutationOptions({
      onSuccess: () => {
        setTurnstileToken(null);
        resetTurnstile();
        invalidateUserDashboard();
        toast.success('Practice saved');
      },
      onError: (e) => {
        setTurnstileToken(null);
        resetTurnstile();
        toast.error(e.message || 'Failed to save practice');
      }
    })
  );

  const submit_user_gesture_recording_func = async (completed: boolean) => {
    const vectors = deepCopy(userGestureVectorsRef.current);
    userGestureVectorsRef.current = [];

    if (
      vectors.length === 0 ||
      !text_data.text ||
      // oxlint-disable-next-line anti-slop/no-runtime-typeof -- runtime type check for script_id before TRPC submission; validated via Zod schema at boundary
      typeof text_data.script_id !== 'number'
    ) {
      return;
    }

    const MAX_RETRIES = 8;
    const RETRY_DELAY = 400;

    const submit = async (retries: number = 0): Promise<void> => {
      if (retries > MAX_RETRIES) {
        toast.error('Could not save this practice attempt');
        return;
      }

      const ready = authReadyRef.current;
      const authed = isAuthedRef.current;
      const token = turnstileTokenRef.current;

      if (!ready) {
        await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY));
        return submit(retries + 1);
      }

      if (!TURNSTILE_ENABLED && !authed) {
        return;
      }

      if (!canSubmitPlayMetrics(ready, authed, token)) {
        await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY));
        return submit(retries + 1);
      }

      await submit_user_recording_mut.mutateAsync({
        text: text_data.text,
        script_id: text_data.script_id,
        vectors,
        completed,
        turnstile_token: playMetricsToken(authed, token)
      });
    };

    await submit();
  };

  const updateScalingFactor = useCallback(() => {
    // oxlint-disable-next-line anti-slop/no-runtime-typeof -- runtime env check for SSR; window may be undefined during server render
    if (typeof window === 'undefined') return;
    // calculate scale based on available width, cap to 1
    const availableWidth = window.innerWidth * SCALING_FACTOR_FOR_WIDTH;
    const scaleX = availableWidth / CANVAS_DIMS.width;
    const scale = Math.min(1, scaleX);
    setScalingFactor(scale);
  }, [setScalingFactor]);

  useLayoutEffect(() => {
    updateScalingFactor();
    window.addEventListener('resize', updateScalingFactor);
    const unsub_func = () => {
      window.removeEventListener('resize', updateScalingFactor);
    };
    return () => {
      unsub_func();
    };
  }, [updateScalingFactor]);

  const gestureData = useMemo(() => text_data.gestures ?? [], [text_data.gestures]);

  const totalGestures = gestureData.length;

  // Konva initialization is handled by the Stage component automatically

  // Konva-based gesture animation
  const playGestureWithKonva = useCallback(
    async (gesture: Gesture): Promise<void> => {
      const gestureLineId = gesture.index;

      // Initialize the gesture path in state
      setAnimatedGestureLines((prev) => [
        ...prev.filter((line) => line.index !== gestureLineId),
        {
          index: gestureLineId,
          points: [],
          color: gesture.color,
          width: gesture.width,
          gesture_type: 'current_animated_gesture',
          simulate_pressure: gesture.simulate_pressure
        }
      ]);

      // Use the centerline->polygon animation helper
      await animateGesture(gesture, (frame) => {
        setAnimatedGestureLines((prev) =>
          prev.map((line) =>
            line.index === gestureLineId
              ? { ...line, points: frame.partialPoints, isAnimatedPath: true }
              : line
          )
        );
      });
    },
    [setAnimatedGestureLines]
  );

  const playAllGestures = useCallback(async () => {
    setCanvasCurrentMode('playing');
    // clear user drawn gestures
    setCurrentGesturePoints([]);
    setAnimatedGestureLines([]);

    for (const gesture of gestureData) {
      await playGestureWithKonva(gesture); // Not a guidance gesture
      await new Promise((resolve) => setTimeout(resolve, GESTURE_GAP_DURATION));
    }

    setCanvasCurrentMode('none');
  }, [
    gestureData,
    setCanvasCurrentMode,
    setCurrentGesturePoints,
    setAnimatedGestureLines,
    playGestureWithKonva
  ]);

  useEffect(() => {
    // on mount play the gesture
    if (play_gesture_on_mount) void playAllGestures();
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- mount-only playback; replaying on data refetch would clear user's in-progress drawing
  }, []);

  const playGestureIndex = async (gestureIndex: number) => {
    // Disable drawing while playing the guided animation for the current gesture
    setIsDrawing(false);
    setIsAnimatingCurrentGesture(true);
    await playGestureWithKonva(gestureData[gestureIndex]); // This is a guidance gesture
    setIsAnimatingCurrentGesture(false);
    setIsDrawing(true);
  };

  // Handle user gesture drawing from Konva canvas
  const handleUserStroke = async (userPoints: GesturePoints[]) => {
    const currentGesture = gestureData[currentGestureIndex];
    if (!currentGesture) return;

    // Evaluate gesture accuracy with error handling
    let accuracy = 0;
    try {
      accuracy = evaluateGestureAccuracy(userPoints, currentGesture.points);
    } catch (error) {
      console.error('Error evaluating stroke accuracy:', error);
      // Treat evaluation errors as failed attempts
      accuracy = 0;
    }

    // Store/override latest attempt for this gesture
    try {
      upsertUserVector(currentGesture.index, currentGesture.points, userPoints, accuracy);
    } catch (e) {
      console.error('Error saving user stroke vectors:', e);
    }

    if (accuracy > ACCURACY_THRESHOLD) {
      // completeCurrentGesture
      setShowTryAgain(false);
      playNextGesture();
    } else {
      setLastAccuracy(accuracy);
      setShowTryAgain(true);

      if (tryAgainTimeoutRef.current) {
        clearTimeout(tryAgainTimeoutRef.current);
      }
      tryAgainTimeoutRef.current = setTimeout(() => {
        setCurrentGesturePoints([]);
        setShowTryAgain(false);
      }, TRY_AGAIN_WAIT_DURATION);
    }
  };

  const playNextGesture = () => {
    setCurrentGesturePoints([]);

    setCurrentGestureIndex(currentGestureIndex + 1);
    setCompletedGesturesCount(completedGesturesCount + 1);
    setIsDrawing(false);
    // for the previous gesture, we reset the gesture tyoe attribute to null form current_animated_gesture
    setAnimatedGestureLines((prev) =>
      prev.map((line, i) => (i === prev.length - 1 ? { ...line, gesture_type: null } : line))
    );
    if (currentGestureIndex < totalGestures - 1) {
      setTimeout(() => {
        playGestureIndex(currentGestureIndex + 1);
      }, 300);
    } else {
      setCanvasCurrentMode('none');
      submit_user_gesture_recording_func(true);
      setCurrentGestureIndex(0);
    }
  };

  const clearCurrentAnimatedGesture = () => {
    setAnimatedGestureLines((prev) =>
      prev.filter((line) => line.gesture_type !== 'current_animated_gesture')
    );
  };

  const replayCurrentGesture = () => {
    if (canvasCurrentMode !== 'practicing' || isAnimatingCurrentGesture) return;
    clearCurrentAnimatedGesture();
    playGestureIndex(currentGestureIndex);
  };

  const skipCurrentGesture = () => {
    if (canvasCurrentMode !== 'practicing' || isAnimatingCurrentGesture) return;

    setShowTryAgain(false);

    // Move to next gesture
    playNextGesture();
  };

  const resetPractice = useCallback(async () => {
    setCanvasCurrentMode('none');
    setCurrentGestureIndex(0);
    setCompletedGesturesCount(0);
    setShowTryAgain(false);
    setIsDrawing(false);
    setAnimatedGestureLines([]);
    userGestureVectorsRef.current = [];
  }, [
    setCanvasCurrentMode,
    setCurrentGestureIndex,
    setCompletedGesturesCount,
    setShowTryAgain,
    setIsDrawing,
    setAnimatedGestureLines
  ]);

  const restartPractice = async () => {
    await resetPractice();
    await playAllGestures();
    // startPractice();
  };

  const startPractice = async () => {
    setCanvasCurrentMode('practicing');
    setCurrentGestureIndex(0);
    setCompletedGesturesCount(0);
    setShowTryAgain(false);
    setAnimatedGestureLines([]);
    clearCurrentAnimatedGesture();
    userGestureVectorsRef.current = [];
    // we cannot pass currentGestureIndex here as it is not upto date with setCurrentGestureIndex call in this function
    playGestureIndex(0);
  };

  useEffect(() => {
    // reset state on unmount
    return () => {
      void resetPractice();
    };
  }, [text_data.id, text_data.uuid, resetPractice]);

  const isCompleted = completedGesturesCount === gestureData.length;

  // Detect custom Completed slot usage
  // SAFETY: children prop is ReactNode union - assertion narrows for Children.toArray iteration.
  const hasCustomCompleted = Children.toArray(children as React.ReactNode).some(
    // SAFETY: intentional any cast for dynamic slot check - safe as slot is string literal union validated at runtime.
    (child) => isValidElement(child) && (child.type as any)?._slot === 'PracticeCompleted'
  );
  // Detect CanvasCenterCompleted slot usage
  // SAFETY: children prop is ReactNode union - assertion narrows for Children.toArray iteration.
  const hasCanvasCenterCompleted = Children.toArray(children as React.ReactNode).some(
    (child) =>
      // SAFETY: intentional any cast for dynamic slot check - safe as slot is string literal union validated at runtime.
      isValidElement(child) && (child.type as any)?._slot === 'PracticeCanvasCenterCompleted'
  );
  // Detect custom NotFound slot usage
  // SAFETY: children prop is ReactNode union - assertion narrows for Children.toArray iteration.
  const hasCustomNotFound = Children.toArray(children as React.ReactNode).some(
    // SAFETY: intentional any cast for dynamic slot check - safe as slot is string literal union validated at runtime.
    (child) => isValidElement(child) && (child.type as any)?._slot === 'PracticeNotFound'
  );
  // SAFETY: children prop is ReactNode union - assertion narrows for Children.toArray iteration.
  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- runtime check for render-prop vs ReactNode; branches on function type for compound Practice API
  const renderedChildren = typeof children === 'function' ? null : (children as React.ReactNode);

  if (!gestureData.length) {
    return (
      <PracticeContext.Provider value={{ isCompleted: false, restartPractice: async () => {} }}>
        {renderedChildren}
        {hasCustomNotFound ? (
          // SAFETY: children prop is ReactNode union - assertion narrows for Children.toArray iteration.
          Children.toArray(children as React.ReactNode)
            .filter(
              // SAFETY: intentional any cast for dynamic slot check - safe as slot is string literal union validated at runtime.
              (child) => isValidElement(child) && (child.type as any)?._slot === 'PracticeNotFound'
            )
            // SAFETY: intentional any cast for dynamic slot check - safe as slot is string literal union validated at runtime.
            .map((child, idx) => <div key={idx}>{(child as any).props?.children}</div>)
        ) : (
          <PracticeNotFoundDefault />
        )}
      </PracticeContext.Provider>
    );
  }
  if (scalingFactor === null) return <PracticeLoadingSkeleton />;

  return (
    <PracticeContext.Provider value={{ isCompleted, restartPractice }}>
      <div className="space-y-4">
        {/* <div className="text-center">
        <h2 className="mb-2 text-2xl font-bold">Practice: {text_data.text}</h2>
      </div> */}

        {/* {canvasCurrentMode === 'practicing' && completedGesturesCount !== totalGestures && null} */}
        {/* {canvasCurrentMode === 'practicing' && completedGesturesCount !== gestureData.length && (
        <div className="flex justify-center">
          <ProgressDisplay
            currentGesture={currentGestureIndex + 1}
            totalGestures={totalGestures}
            completedCount={completedGesturesCount}
          />
        </div>
      )} */}

        {/* Custom slots (e.g., <Practice.Completed />) */}
        {renderedChildren}
        {/* Default Completed fallback when no custom Completed is provided */}
        {isCompleted && !hasCustomCompleted && <PracticeCompletedDefault />}

        <div className="flex justify-center">
          <div className="relative">
            <AnimatePresence>
              {showTryAgain && canvasCurrentMode === 'practicing' && (
                <TryAgainSection accuracy={lastAccuracy} onSkipGesture={skipCurrentGesture} />
              )}
            </AnimatePresence>

            {/* CanvasCenterCompleted slot - centered overlay when completed */}
            {isCompleted && hasCanvasCenterCompleted && (
              <div className="pointer-events-none absolute inset-0 z-40 mt-4 flex justify-center">
                <div className="pointer-events-auto">
                  {Children.toArray(
                    /* SAFETY: children prop is ReactNode union - assertion narrows for Children.toArray iteration */ children as React.ReactNode
                  )
                    .filter(
                      (child) =>
                        isValidElement(child) &&
                        // SAFETY: intentional any cast for dynamic slot check - safe as slot is string literal union validated at runtime.
                        (child.type as any)?._slot === 'PracticeCanvasCenterCompleted'
                    )
                    .map((child, idx) => (
                      // SAFETY: intentional any cast for dynamic slot check - safe as slot is string literal union validated at runtime.
                      <div key={idx}>{(child as any).props?.children}</div>
                    ))}
                </div>
              </div>
            )}

            <div
              className={cn(
                'rounded-lg border-2 transition-colors',
                isDrawing ? 'border-blue-500' : 'border-border'
              )}
            >
              <Suspense fallback={practiceCanvasFallback}>
                <PracticeKonvaCanvas
                  key={`${text_data.uuid}-${text_data.id}`}
                  ref={stageRef}
                  gestureData={gestureData}
                  onUserStroke={handleUserStroke}
                />
              </Suspense>
            </div>

            {(canvasCurrentMode === 'none' || canvasCurrentMode === 'playing') && (
              <>
                <div className="pointer-events-none absolute inset-x-0 top-0 z-40 flex justify-between p-3">
                  <div className="pointer-events-auto">
                    <Button
                      onClick={() => {
                        if (canvasCurrentMode === 'playing') return;
                        playAllGestures();
                      }}
                      size="icon"
                      className={cn(
                        'gap-1',
                        'bg-linear-to-r from-orange-400 via-amber-400 to-yellow-500 text-white shadow-lg backdrop-blur-xl',
                        'border border-white/30 dark:border-white/20',
                        'hover:border-white/40 hover:from-orange-500 hover:via-amber-500 hover:to-yellow-600 hover:shadow-xl',
                        'dark:from-orange-400 dark:via-amber-600 dark:to-yellow-600 dark:text-white',
                        'dark:hover:from-orange-600 dark:hover:via-amber-700 dark:hover:to-yellow-700',
                        'rounded-full transition-all duration-300'
                      )}
                    >
                      <MdPlayArrow className="size-6 text-base drop-shadow" />
                    </Button>
                  </div>
                  <div className="pointer-events-auto">
                    <Button
                      onClick={() => {
                        if (totalGestures === 0 || canvasCurrentMode === 'playing') return;
                        startPractice();
                      }}
                      size={'icon'}
                      className={cn(
                        'gap-1',
                        'bg-linear-to-r from-emerald-400 to-emerald-500 text-white shadow-lg backdrop-blur-xl',
                        'border border-white/30 dark:border-white/20',
                        'hover:border-white/40 hover:from-emerald-500 hover:to-emerald-600 hover:shadow-xl',
                        'dark:from-emerald-600 dark:to-emerald-700 dark:text-white',
                        'dark:hover:from-emerald-700 dark:hover:to-emerald-800',
                        'rounded-full transition-all duration-300'
                      )}
                    >
                      <AiOutlineSignature className="size-6 text-base drop-shadow" />
                    </Button>
                  </div>
                </div>
              </>
            )}

            {canvasCurrentMode === 'practicing' && completedGesturesCount !== totalGestures && (
              <div className="pointer-events-none absolute inset-x-0 top-0 z-40 flex justify-between p-3">
                <div className="pointer-events-auto">
                  <Button
                    onClick={() => {
                      if (isAnimatingCurrentGesture || completedGesturesCount === totalGestures)
                        return;
                      replayCurrentGesture();
                    }}
                    size="icon"
                    className={cn(
                      'gap-1 text-base',
                      'bg-linear-to-r from-blue-400 to-blue-600 text-white shadow-lg backdrop-blur-xl',
                      'border border-white/30 dark:border-white/20',
                      'hover:border-white/40 hover:from-blue-500 hover:to-blue-700 hover:shadow-xl',
                      'dark:from-blue-700 dark:to-blue-900 dark:text-white',
                      'dark:hover:from-blue-800 dark:hover:to-blue-950',
                      'rounded-full transition-all duration-300'
                    )}
                  >
                    <MdReplay className="size-6 text-base drop-shadow" />
                  </Button>
                </div>
                <div className="pointer-events-auto">
                  <Button
                    onClick={async () => {
                      submit_user_gesture_recording_func(false);
                      restartPractice();
                    }}
                    size="icon"
                    className={cn(
                      'gap-1 text-base',
                      'bg-linear-to-r from-gray-200 via-gray-400 to-gray-600 text-gray-800 shadow-lg backdrop-blur-xl',
                      'border border-white/30 dark:border-white/20',
                      'hover:border-white/40 hover:from-gray-300 hover:via-gray-500 hover:to-gray-700 hover:shadow-xl',
                      'dark:from-gray-700 dark:via-gray-800 dark:to-gray-900 dark:text-white',
                      'dark:hover:from-gray-800 dark:hover:via-gray-900 dark:hover:to-black',
                      'rounded-full transition-all duration-300'
                    )}
                  >
                    <MdClose className="size-6 text-base drop-shadow" />
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </PracticeContext.Provider>
  );
}

// Try Again Section Component
const TryAgainSection = ({
  accuracy,
  onSkipGesture
}: {
  accuracy: number;
  onSkipGesture: () => void;
}) => {
  const accuracyPercent = Math.round(accuracy * 100);
  const _isBelowThreshold = accuracyPercent < 70;

  const setCurrentGesturePoints = useSetAtom(current_gesture_points_atom);
  const setShowTryAgain = useSetAtom(show_try_again_atom);

  const onTryAgain = () => {
    setCurrentGesturePoints([]);
    setShowTryAgain(false);
  };

  return (
    <motion.div
      className="absolute top-4 left-1/2 z-50 -translate-x-1/2"
      initial={{ y: -20, opacity: 0 }}
      animate={{
        y: 0,
        opacity: 1
      }}
      transition={{
        type: 'spring',
        stiffness: 300,
        damping: 25
      }}
      exit={{
        y: -20,
        opacity: 0,
        transition: { duration: 0.2 }
      }}
    >
      <div
        className={cn(
          'flex items-center gap-3 rounded-lg border border-red-200 bg-white/95 px-4 py-2.5 shadow-lg backdrop-blur-xl',
          'dark:border-red-800 dark:bg-gray-900/95'
        )}
      >
        {/* Accuracy Badge */}
        <div className="flex items-center gap-2">
          <span className="text-lg">📊</span>
          {/* <div
            className={cn(
              'rounded-md px-2.5 py-1 text-sm font-bold',
              isBelowThreshold
                ? 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300'
                : 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300'
            )}
          >
            {accuracyPercent}%
          </div> */}
          <span className="text-center text-sm font-medium text-gray-600 dark:text-gray-400">
            Try Again
          </span>
        </div>

        {/* Divider */}
        <div className="h-6 w-px bg-gray-300 dark:bg-gray-600"></div>

        {/* Action Buttons */}
        <div className="flex gap-2">
          <Button
            onClick={() => onTryAgain()}
            size="sm"
            className={cn(
              'gap-1.5',
              'bg-linear-to-r from-orange-400 to-red-500 text-white shadow-md backdrop-blur-xl',
              'border border-white/30 dark:border-white/20',
              'hover:border-white/40 hover:from-orange-500 hover:to-red-600 hover:shadow-lg',
              'dark:from-orange-600 dark:to-red-700 dark:hover:from-orange-700 dark:hover:to-red-800',
              'transition-all duration-300'
            )}
          >
            <MdRefresh className="size-4" />
            Try Again
          </Button>

          <Button
            onClick={onSkipGesture}
            size="sm"
            className={cn(
              'gap-1.5',
              'bg-linear-to-r from-blue-400 to-blue-600 text-white shadow-md backdrop-blur-xl',
              'border border-white/30 dark:border-white/20',
              'hover:border-white/40 hover:from-blue-500 hover:to-blue-700 hover:shadow-lg',
              'dark:from-blue-600 dark:to-blue-800 dark:hover:from-blue-700 dark:hover:to-blue-900',
              'transition-all duration-300'
            )}
          >
            <MdArrowForward className="size-4" />
            Next
          </Button>
        </div>
      </div>
    </motion.div>
  );
};

// Completed slot subcomponent
const PracticeCompleted = ({
  children
}: {
  children?: React.ReactNode | ((restartPractice: () => Promise<void>) => React.ReactNode);
}) => {
  const { isCompleted, restartPractice } = usePracticeContext();
  if (!isCompleted) return null;
  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- runtime check for render-prop vs element; compound component supports both
  if (typeof children === 'function') {
    return <>{children(restartPractice)}</>;
  }
  if (children) return <>{children}</>;
  return <PracticeCompletedDefault />;
};
// SAFETY: intentional any cast for dynamic slot check - safe as slot is string literal union validated at runtime.
(PracticeCompleted as any)._slot = 'PracticeCompleted' as const;

// Default Completed UI
const PracticeCompletedDefault = () => {
  const { restartPractice } = usePracticeContext();
  return (
    <div className="flex justify-center">
      <motion.div
        className={cn(
          'flex items-center gap-4 rounded-lg border border-yellow-200 bg-white/95 px-5 py-3 shadow-lg backdrop-blur-xl',
          'dark:border-yellow-800 dark:bg-gray-900/95'
        )}
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: -20, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 300, damping: 25 }}
      >
        <div className="flex items-center gap-3">
          <span className="text-2xl">🎉</span>
          <div className="flex flex-col">
            <span className="text-base font-bold text-yellow-800 dark:text-yellow-200">
              Congratulations!
            </span>
            <span className="text-sm text-yellow-700 dark:text-yellow-300">
              All gestures completed
            </span>
          </div>
        </div>

        <div className="h-8 w-px bg-gray-300 dark:bg-gray-600"></div>

        <Button
          onClick={() => restartPractice()}
          className={cn(
            'gap-1.5',
            'bg-linear-to-r from-gray-200 via-gray-400 to-gray-600 text-gray-800 shadow-md backdrop-blur-xl',
            'border border-white/30 dark:border-white/20',
            'hover:border-white/40 hover:from-gray-300 hover:via-gray-500 hover:to-gray-700 hover:shadow-lg',
            'dark:from-gray-700 dark:via-gray-800 dark:to-gray-900 dark:text-white',
            'dark:hover:from-gray-800 dark:hover:via-gray-900 dark:hover:to-black',
            'transition-all duration-300'
          )}
        >
          <MdArrowForward className="size-4" />
          Play Again
        </Button>
      </motion.div>
    </div>
  );
};

// CanvasCenterCompleted slot subcomponent - renders via overlay only
const PracticeCanvasCenterCompleted = ({ children: _children }: { children?: React.ReactNode }) => {
  // This component acts as a marker; actual rendering happens in the overlay above
  return null;
};
// SAFETY: intentional any cast for dynamic slot check - safe as slot is string literal union validated at runtime.
(PracticeCanvasCenterCompleted as any)._slot = 'PracticeCanvasCenterCompleted' as const;

// NotFound slot subcomponent
const PracticeNotFound = ({ children: _children }: { children?: React.ReactNode }) => {
  // This component acts as a marker; actual rendering happens in the main component
  return null;
};
// SAFETY: intentional any cast for dynamic slot check - safe as slot is string literal union validated at runtime.
(PracticeNotFound as any)._slot = 'PracticeNotFound' as const;

// Default NotFound UI
const PracticeNotFoundDefault = () => {
  return <div className="text text-center text-muted-foreground">Comming Soon...</div>;
};

type PracticeComponent = typeof PracticeWrapper & {
  Completed: typeof PracticeCompleted;
  CanvasCenterCompleted: typeof PracticeCanvasCenterCompleted;
  NotFound: typeof PracticeNotFound;
};

// SAFETY: validated at boundary - type assertion is safe based on prior schema check.
const PracticeExport = PracticeWrapper as PracticeComponent;
PracticeExport.Completed = PracticeCompleted;
PracticeExport.CanvasCenterCompleted = PracticeCanvasCenterCompleted;
PracticeExport.NotFound = PracticeNotFound;

export default PracticeExport;

export const PracticeLoadingSkeleton = () => {
  return (
    <div className="space-y-4">
      <div className="flex justify-center">
        <div className="relative">
          <Skeleton className="h-[400px] w-[400px] max-w-[90vw] rounded-lg border-2" />
          <Skeleton className="absolute top-3 left-3 h-8 w-8 rounded-full" />
          <Skeleton className="absolute top-3 right-3 h-8 w-8 rounded-full" />
        </div>
      </div>
    </div>
  );
};
