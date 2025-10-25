'use client';

import { useEffect, useRef } from 'react';
import dynamic from 'next/dynamic';
import type Konva from 'konva';
import { cn } from '~/lib/utils';
import { MdPlayArrow, MdClear, MdCheckCircle, MdArrowForward, MdRefresh } from 'react-icons/md';
import { FiTrendingUp } from 'react-icons/fi';
import { evaluateGestureAccuracy, animateGesture } from '~/tools/stroke_data/utils';
import {
  GesturePoints,
  CANVAS_DIMS,
  Gesture,
  GESTURE_GAP_DURATION
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

// Dynamic import for PracticeKonvaCanvas to avoid SSR issues
const PracticeKonvaCanvas = dynamic(() => import('./PracticeCanvas'), {
  ssr: false,
  loading: () => (
    <div
      className="flex items-center justify-center rounded-lg border-2 bg-gray-50"
      style={{ width: CANVAS_DIMS.width, height: CANVAS_DIMS.height }}
    >
      {/* <div className="text-gray-500">Loading canvas...</div> */}
    </div>
  )
});

type text_data_type = {
  id: number;
  uuid: string;
  text: string;
  script_id: number;
  gestures?: Gesture[] | null;
};

type Props = {
  text_data: text_data_type;
};

const turnstile_token_atom = atom<string | null>(null);

export default function PracticeWrapper(props: Props) {
  // Initialize atoms with default values
  useHydrateAtoms([
    [canvas_current_mode, 'none' as const],
    [current_gesture_index_atom, 0],
    [is_drawing_atom, false],
    [completed_gestures_count_atom, 0],
    [is_animating_current_gesture_atom, false],
    [show_try_again_atom, false],
    [last_accuracy_atom, 0],
    [scaling_factor_atom, 1],
    [animated_gesture_lines_atom, []]
  ]);

  const setTurnstileToken = useSetAtom(turnstile_token_atom);

  return (
    <>
      <Practice {...props} />
      <TurnstileWidget setToken={setTurnstileToken} />
    </>
  );
}

function Practice({ text_data }: Props) {
  const stageRef = useRef<Konva.Stage | null>(null);
  const trpc = useTRPC();

  const [turnstileToken, setTurnstileToken] = useAtom(turnstile_token_atom);
  const turnstile = useTurnstile();

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
  const setScalingFactor = useSetAtom(scaling_factor_atom);
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
        turnstile.reset();
        console.log('Successfully submitted user gestures');
      },
      onError: (e) => {
        console.error('Failed to submit', e.message);
      }
    })
  );

  const submit_user_gesture_recording_func = async (completed: boolean) => {
    if (!TURNSTILE_ENABLED) {
      userGestureVectorsRef.current = [];
      return;
    }

    let retryTimeoutId: NodeJS.Timeout | null = null;

    const MAX_RETRIES = 2;
    const RETRY_DELAY = 700;
    const vectors = deepCopy(userGestureVectorsRef.current);

    const submit = async (retries: number = 0) => {
      if (retries > MAX_RETRIES) {
        console.warn('Max retries reached for gesture submission');
        return;
      }
      if (!turnstileToken || turnstileToken.length === 0) {
        retryTimeoutId = setTimeout(() => {
          submit(retries + 1);
        }, RETRY_DELAY);
        return;
      }

      // Clear any pending retry
      if (retryTimeoutId) {
        clearTimeout(retryTimeoutId);
        retryTimeoutId = null;
      }

      // Submit on completion if we have any recorded attempts
      if (
        vectors.length > 0 &&
        text_data.text &&
        typeof text_data.script_id === 'number' &&
        turnstileToken
      ) {
        await submit_user_recording_mut.mutateAsync({
          text: text_data.text,
          script_id: text_data.script_id,
          vectors,
          completed: completed,
          turnstile_token: turnstileToken
        });
      }
      userGestureVectorsRef.current = [];
    };
    await submit();
  };

  function updateScalingFactor() {
    if (typeof window === 'undefined') return;
    // calculate scale based on available width, cap to 1
    const availableWidth = window.innerWidth * 0.8;
    const scaleX = availableWidth / CANVAS_DIMS.width;
    const scale = Math.min(1, scaleX);
    setScalingFactor(scale);
  }

  useEffect(() => {
    updateScalingFactor();
    window.addEventListener('resize', updateScalingFactor);
    const unsub_func = () => {
      window.removeEventListener('resize', updateScalingFactor);
    };
    return () => {
      unsub_func();
    };
  }, []);

  const gestureData = text_data.gestures ?? [];

  const totalGestures = gestureData.length;

  // Konva initialization is handled by the Stage component automatically

  const playAllGestures = async () => {
    setCanvasCurrentMode('playing');
    setAnimatedGestureLines([]);

    for (const gesture of gestureData) {
      await playGestureWithKonva(gesture); // Not a guidance gesture
      await new Promise((resolve) => setTimeout(resolve, GESTURE_GAP_DURATION));
    }

    setCanvasCurrentMode('none');
  };

  // Konva-based gesture animation
  const playGestureWithKonva = async (gesture: Gesture): Promise<void> => {
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
  };

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

    if (accuracy > 0.7) {
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
    if (currentGestureIndex < totalGestures - 1) {
      setTimeout(() => {
        playGestureIndex(currentGestureIndex + 1);
      }, 300);
      setIsDrawing(false);
    } else {
      setIsDrawing(false);
      submit_user_gesture_recording_func(true);
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

  const resetPractice = async () => {
    setCanvasCurrentMode('none');
    setCurrentGestureIndex(0);
    setCompletedGesturesCount(0);
    setShowTryAgain(false);
    setIsDrawing(false);
    setAnimatedGestureLines([]);
    userGestureVectorsRef.current = [];
  };

  if (!gestureData.length) {
    return (
      <div className="text text-center text-muted-foreground">
        No gesture data available to display
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="text-center">
        <h2 className="mb-2 text-2xl font-bold">Practice: {text_data.text}</h2>
      </div>

      <div className="flex justify-center gap-4">
        {(canvasCurrentMode === 'none' || canvasCurrentMode === 'playing') && (
          <>
            <button
              onClick={playAllGestures}
              disabled={canvasCurrentMode === 'playing'}
              className={cn(
                'relative inline-flex items-center rounded-lg px-5 py-2.5 font-semibold transition-all duration-200',
                'bg-gradient-to-r from-blue-400 to-blue-600 text-white shadow-lg',
                'hover:scale-105 hover:from-blue-500 hover:to-blue-700 hover:shadow-xl',
                'focus:ring-2 focus:ring-blue-400 focus:ring-offset-2 focus:outline-none',
                'disabled:cursor-not-allowed disabled:opacity-60',
                'dark:from-blue-700 dark:to-blue-900 dark:text-white',
                'dark:hover:from-blue-800 dark:hover:to-blue-950'
              )}
            >
              <MdPlayArrow className="mr-2 size-6 text-xl drop-shadow" />
              How to Write
            </button>
            <button
              onClick={() => {
                if (totalGestures === 0) return;

                setCanvasCurrentMode('practicing');
                setCurrentGestureIndex(0);
                setCompletedGesturesCount(0);
                setShowTryAgain(false);
                setAnimatedGestureLines([]);
                clearCurrentAnimatedGesture();
                userGestureVectorsRef.current = [];
                playGestureIndex(currentGestureIndex);
              }}
              disabled={canvasCurrentMode === 'playing'}
              className={cn(
                'relative inline-flex items-center rounded-lg px-5 py-2.5 font-semibold transition-all duration-200',
                'bg-gradient-to-r from-pink-500 via-red-500 to-yellow-500 text-white shadow-lg',
                'hover:scale-105 hover:from-pink-600 hover:via-red-600 hover:to-yellow-600 hover:shadow-xl',
                'focus:ring-2 focus:ring-pink-400 focus:ring-offset-2 focus:outline-none',
                'disabled:cursor-not-allowed disabled:opacity-60',
                'dark:from-pink-700 dark:via-red-700 dark:to-yellow-700 dark:text-white',
                'dark:hover:from-pink-800 dark:hover:via-red-800 dark:hover:to-yellow-800'
              )}
            >
              <AiOutlineSignature className="mr-2 size-6 text-xl text-white drop-shadow" />
              Practice
            </button>
          </>
        )}

        {canvasCurrentMode === 'practicing' && completedGesturesCount !== totalGestures && (
          <>
            <button
              onClick={replayCurrentGesture}
              disabled={isAnimatingCurrentGesture || completedGesturesCount === totalGestures}
              className={cn(
                'relative inline-flex items-center rounded-lg px-5 py-2.5 font-semibold transition-all duration-200',
                'bg-gradient-to-r from-blue-400 to-blue-600 text-white shadow-lg',
                'hover:scale-105 hover:from-blue-500 hover:to-blue-700 hover:shadow-xl',
                'focus:ring-2 focus:ring-blue-400 focus:ring-offset-2 focus:outline-none',
                'disabled:cursor-not-allowed disabled:opacity-60',
                'dark:from-blue-700 dark:to-blue-900 dark:text-white',
                'dark:hover:from-blue-800 dark:hover:to-blue-950'
              )}
            >
              <MdPlayArrow className="mr-2 text-xl drop-shadow" />
              Play Current Gesture
            </button>
            <button
              onClick={async () => {
                submit_user_gesture_recording_func(false);
                resetPractice();
              }}
              className={cn(
                'relative inline-flex items-center rounded-lg px-5 py-2.5 font-semibold transition-all duration-200',
                'bg-gradient-to-r from-gray-200 via-gray-400 to-gray-600 text-gray-800 shadow-lg',
                'hover:scale-105 hover:from-gray-300 hover:via-gray-500 hover:to-gray-700 hover:shadow-xl',
                'focus:ring-2 focus:ring-gray-400 focus:ring-offset-2 focus:outline-none',
                'disabled:cursor-not-allowed disabled:opacity-60',
                'dark:from-gray-700 dark:via-gray-800 dark:to-gray-900 dark:text-white',
                'dark:hover:from-gray-800 dark:hover:via-gray-900 dark:hover:to-black'
              )}
            >
              <MdClear className="mr-2 text-xl drop-shadow" />
              Reset
            </button>
          </>
        )}
      </div>
      {canvasCurrentMode === 'practicing' && completedGesturesCount !== gestureData.length && (
        <div className="flex justify-center">
          <ProgressDisplay
            currentGesture={currentGestureIndex + 1}
            totalGestures={totalGestures}
            completedCount={completedGesturesCount}
          />
        </div>
      )}

      {completedGesturesCount === gestureData.length && (
        <div className="flex justify-center">
          <motion.div
            className={cn(
              'space-y-4 rounded-xl border border-gray-200 bg-gradient-to-br from-white via-gray-50 to-gray-100 p-6 text-center shadow-lg',
              'dark:border-gray-700 dark:bg-gradient-to-br dark:from-gray-900 dark:via-gray-800 dark:to-gray-700'
            )}
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.8, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 20 }}
          >
            <div className="mb-2 text-3xl">🎉</div>
            <div className="mb-1 text-xl font-bold text-yellow-800 dark:text-yellow-200">
              Congratulations!
            </div>
            <div className="mb-3 text-yellow-700 dark:text-yellow-300">
              You successfully completed all gestures!
            </div>
            <motion.button
              whileTap={{ scale: 0.95 }}
              whileHover={{ scale: 1.07 }}
              onClick={() => {
                resetPractice();
                playAllGestures();
              }}
              className={cn(
                'relative inline-flex items-center rounded-lg px-4 py-2 font-semibold transition-all duration-200',
                'bg-gradient-to-r from-yellow-400 via-orange-400 to-yellow-500 text-yellow-900 shadow-md',
                'hover:scale-105 hover:from-yellow-500 hover:via-orange-500 hover:to-yellow-600 hover:shadow-lg',
                'focus:ring-2 focus:ring-yellow-400 focus:ring-offset-2 focus:outline-none',
                'disabled:cursor-not-allowed disabled:opacity-60',
                'dark:from-yellow-600 dark:via-orange-500 dark:to-yellow-700 dark:text-yellow-100',
                'dark:hover:from-yellow-700 dark:hover:via-orange-600 dark:hover:to-yellow-800'
              )}
              style={{ fontSize: '0.95rem' }}
            >
              <MdArrowForward className="mr-2 text-lg drop-shadow" />
              Play Again
            </motion.button>
          </motion.div>
        </div>
      )}

      <AnimatePresence>
        {showTryAgain && canvasCurrentMode === 'practicing' && (
          <TryAgainSection accuracy={lastAccuracy} onSkipGesture={skipCurrentGesture} />
        )}
      </AnimatePresence>

      <div className="flex justify-center">
        <div
          className={cn(
            'rounded-lg border-2 transition-colors',
            isDrawing ? 'border-blue-500' : 'border-border'
          )}
        >
          <PracticeKonvaCanvas
            ref={stageRef}
            gestureData={gestureData}
            onUserStroke={handleUserStroke}
          />
        </div>
      </div>
    </div>
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
  const isBelowThreshold = accuracyPercent < 70;

  const setCurrentGesturePoints = useSetAtom(current_gesture_points_atom);
  const setShowTryAgain = useSetAtom(show_try_again_atom);

  const onTryAgain = () => {
    setCurrentGesturePoints([]);
    setShowTryAgain(false);
  };

  return (
    <motion.div
      className="fixed top-1/2 left-1/2 z-50 -translate-x-1/2 -translate-y-1/2"
      initial={{ scale: 0, opacity: 0 }}
      animate={{
        scale: 1,
        opacity: 1
      }}
      transition={{
        type: 'spring',
        stiffness: 300,
        damping: 15,
        duration: 0.6
      }}
      exit={{
        scale: 0,
        opacity: 0,
        transition: { duration: 0.2 }
      }}
    >
      <motion.div
        initial={{ scale: 1 }}
        animate={{ scale: [1, 1.05, 1] }}
        transition={{
          delay: 0.3,
          duration: 0.4,
          ease: 'easeInOut'
        }}
      >
        <div className="rounded-xl border border-red-200 bg-white p-4 shadow-2xl sm:p-6 dark:border-red-800 dark:bg-gray-900">
          <div className="flex flex-col items-center space-y-2">
            {/* Accuracy Display */}
            <div className="text-center">
              <div className="mb-2 flex items-center justify-center space-x-2">
                <motion.div
                  animate={{ rotate: [0, 10, -10, 0] }}
                  transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
                >
                  <span className="text-2xl">📊</span>
                </motion.div>
                <span className="text-lg font-semibold text-gray-700 dark:text-gray-300">
                  Accuracy Check
                </span>
              </div>

              <div className="flex items-center justify-center space-x-3">
                <div
                  className={cn(
                    'rounded-full px-4 py-2 text-lg font-bold shadow-md',
                    isBelowThreshold
                      ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300'
                      : 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300'
                  )}
                >
                  {accuracyPercent}%
                </div>
                <span
                  className={cn(
                    'text-sm font-medium brightness-75',
                    isBelowThreshold
                      ? 'text-red-600 dark:text-red-400'
                      : 'text-green-600 dark:text-green-400'
                  )}
                >
                  {isBelowThreshold ? 'Need 70%+' : 'Great!'}
                </span>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex w-full flex-col gap-y-4 sm:w-auto sm:flex-row sm:gap-x-4">
              <motion.button
                onClick={() => onTryAgain()}
                className={cn(
                  'flex items-center justify-center space-x-2 rounded-lg px-5 py-2.5 font-semibold shadow-lg transition-all duration-200',
                  'bg-gradient-to-r from-orange-400 to-red-500 text-white',
                  'hover:from-orange-500 hover:to-red-600 hover:shadow-xl',
                  'focus:ring-2 focus:ring-orange-400 focus:ring-offset-2 focus:outline-none',
                  'dark:from-orange-600 dark:to-red-700 dark:hover:from-orange-700 dark:hover:to-red-800'
                )}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
              >
                <MdRefresh className="h-4 w-4" />
                <span>Try Again</span>
              </motion.button>

              <motion.button
                onClick={onSkipGesture}
                className={cn(
                  'flex items-center justify-center space-x-2 rounded-lg px-5 py-2.5 font-semibold shadow-lg transition-all duration-200',
                  'bg-gradient-to-r from-blue-400 to-blue-600 text-white',
                  'hover:from-blue-500 hover:to-blue-700 hover:shadow-xl',
                  'focus:ring-2 focus:ring-blue-400 focus:ring-offset-2 focus:outline-none',
                  'dark:from-blue-600 dark:to-blue-800 dark:hover:from-blue-700 dark:hover:to-blue-900'
                )}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
              >
                <MdArrowForward className="h-4 w-4" />
                <span>Next Gesture</span>
              </motion.button>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Backdrop to close on click */}
      <motion.div
        className="fixed inset-0 -z-10 bg-black/20 backdrop-blur-sm"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onTryAgain}
      />
    </motion.div>
  );
};

// Animated Number Component with carousel effect
const AnimatedNumber = ({ value, className = '' }: { value: number; className?: string }) => {
  return (
    <div className={cn('relative inline-flex overflow-hidden', className)}>
      <AnimatePresence mode="wait">
        <motion.span
          key={value}
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -20, opacity: 0 }}
          transition={{
            type: 'spring',
            stiffness: 400,
            damping: 25,
            duration: 0.4
          }}
          className="block"
        >
          {value}
        </motion.span>
      </AnimatePresence>
    </div>
  );
};

// Progress Display Component
const ProgressDisplay = ({
  currentGesture,
  totalGestures,
  completedCount
}: {
  currentGesture: number;
  totalGestures: number;
  completedCount: number;
}) => {
  return (
    <motion.div
      className="inline-flex items-center justify-center space-x-6 rounded-xl border border-blue-100 bg-gradient-to-r from-blue-50 to-indigo-50 px-6 py-4 shadow-lg dark:border-blue-800 dark:from-blue-950/30 dark:to-indigo-950/30"
      initial={{ y: -40, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: -40, opacity: 0 }}
      transition={{ type: 'spring', stiffness: 300, damping: 20 }}
    >
      {/* Current Gesture Progress */}
      <div className="flex items-center space-x-2">
        <motion.div
          animate={{ rotate: [0, 360] }}
          transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
          className="flex-shrink-0"
        >
          <FiTrendingUp className="text-2xl text-blue-500 dark:text-blue-400" />
        </motion.div>
        <div className="flex items-center space-x-1 text-lg font-bold">
          <span className="text-gray-600 dark:text-gray-300">Gesture</span>
          <motion.div className="flex items-center space-x-1" whileHover={{ scale: 1.05 }}>
            <AnimatedNumber
              value={currentGesture}
              className="text-2xl font-bold text-blue-600 dark:text-blue-400"
            />
            <span className="text-gray-500 dark:text-gray-400">/</span>
            <span className="text-xl font-semibold text-gray-700 dark:text-gray-300">
              {totalGestures}
            </span>
          </motion.div>
        </div>
      </div>

      {/* Separator */}
      <div className="h-8 w-px bg-gradient-to-b from-transparent via-gray-300 to-transparent dark:via-gray-600"></div>

      {/* Completed Gestures */}
      <div className="flex items-center space-x-2">
        <motion.div
          animate={{
            scale: [1, 1.2, 1],
            rotate: [0, 10, -10, 0]
          }}
          transition={{
            duration: 2,
            repeat: Infinity,
            ease: 'easeInOut'
          }}
          className="flex-shrink-0"
        >
          <MdCheckCircle className="text-2xl text-green-500 dark:text-green-400" />
        </motion.div>
        <div className="flex items-center space-x-1 text-lg font-bold">
          <span className="text-gray-600 dark:text-gray-300">Completed</span>
          <motion.div className="relative" whileHover={{ scale: 1.05 }}>
            <AnimatedNumber
              value={completedCount}
              className="text-2xl font-bold text-green-600 dark:text-green-400"
            />
            {/* Celebration effect when completed count increases */}
            <AnimatePresence>
              {completedCount > 0 && (
                <motion.div
                  key={`celebration-${completedCount}`}
                  initial={{ scale: 0, opacity: 1 }}
                  animate={{ scale: 1.5, opacity: 0 }}
                  exit={{ scale: 2, opacity: 0 }}
                  transition={{ duration: 0.6, ease: 'easeOut' }}
                  className="absolute inset-0 flex items-center justify-center text-2xl"
                >
                  ✨
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        </div>
      </div>
    </motion.div>
  );
};
