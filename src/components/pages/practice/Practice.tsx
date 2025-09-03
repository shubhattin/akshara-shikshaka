'use client';

import { useEffect, useRef } from 'react';
import { Card } from '~/components/ui/card';
import dynamic from 'next/dynamic';
import type Konva from 'konva';
import { cn } from '~/lib/utils';
import { MdPlayArrow, MdClear, MdCheckCircle, MdArrowForward } from 'react-icons/md';
import { FiTrendingUp } from 'react-icons/fi';
import { evaluateStrokeAccuracy, animateGesture } from '~/tools/stroke_data/utils';
import {
  GesturePoint,
  CANVAS_DIMS,
  Gesture,
  GESTURE_GAP_DURATION
} from '~/tools/stroke_data/types';
import { motion, AnimatePresence } from 'framer-motion';
import { AiOutlineSignature } from 'react-icons/ai';
import { useAtom, useAtomValue } from 'jotai';
import { useHydrateAtoms } from 'jotai/utils';
import {
  practice_mode_atom,
  current_gesture_index_atom,
  is_drawing_atom,
  completed_gestures_count_atom,
  show_all_gestures_done_atom,
  is_animating_current_gesture_atom,
  show_try_again_atom,
  last_accuracy_atom,
  scaling_factor_atom,
  mounted_atom,
  animated_gesture_lines_atom
} from './practice_state';

// Dynamic import for PracticeKonvaCanvas to avoid SSR issues
const PracticeKonvaCanvas = dynamic(() => import('./PracticeCanvas'), {
  ssr: false,
  loading: () => (
    <div
      className="flex items-center justify-center rounded-lg border-2 bg-gray-50"
      style={{ width: CANVAS_DIMS.width, height: CANVAS_DIMS.height }}
    >
      <div className="text-gray-500">Loading canvas...</div>
    </div>
  )
});

type text_data_type = {
  id: number;
  uuid: string;
  text: string;
  gestures?: Gesture[] | null;
};

type Props = {
  text_data: text_data_type;
};

export default function PracticeCanvasComponent({ text_data }: Props) {
  const stageRef = useRef<Konva.Stage>(null);
  const canceledRef = useRef(false);

  // Initialize atoms with default values
  useHydrateAtoms([
    [practice_mode_atom, 'none' as const],
    [current_gesture_index_atom, 0],
    [is_drawing_atom, false],
    [completed_gestures_count_atom, 0],
    [show_all_gestures_done_atom, false],
    [is_animating_current_gesture_atom, false],
    [show_try_again_atom, false],
    [last_accuracy_atom, 0],
    [scaling_factor_atom, 1],
    [mounted_atom, false],
    [animated_gesture_lines_atom, []]
  ]);

  // Practice state from atoms
  const [practiceMode, setPracticeMode] = useAtom(practice_mode_atom);
  const [currentGestureIndex, setCurrentGestureIndex] = useAtom(current_gesture_index_atom);
  const [isDrawing, setIsDrawing] = useAtom(is_drawing_atom);
  const [completedGesturesCount, setCompletedGesturesCount] = useAtom(
    completed_gestures_count_atom
  );
  const [showAllGesturesDone, setShowAllGesturesDone] = useAtom(show_all_gestures_done_atom);
  const [isAnimatingCurrentGesture, setIsAnimatingCurrentGesture] = useAtom(
    is_animating_current_gesture_atom
  );
  const [showTryAgain, setShowTryAgain] = useAtom(show_try_again_atom);
  const [lastAccuracy, setLastAccuracy] = useAtom(last_accuracy_atom);
  const [scalingFactor, setScalingFactor] = useAtom(scaling_factor_atom);
  const [mounted, setMounted] = useAtom(mounted_atom);
  const [animatedGestureLines, setAnimatedGestureLines] = useAtom(animated_gesture_lines_atom);

  function updateScalingFactor() {
    if (typeof window === 'undefined') return;
    // calculate scale based on available width, cap to 1
    const availableWidth = window.innerWidth * 0.8;
    const scaleX = availableWidth / CANVAS_DIMS.width;
    const scale = Math.min(1, scaleX);
    setScalingFactor(scale);
  }

  // Konva doesn't need manual dimension updates - scaling is handled via props

  // Refs are no longer needed with direct state access

  useEffect(() => {
    updateScalingFactor();
    canceledRef.current = false;
    setMounted(true);

    window.addEventListener('resize', updateScalingFactor);
    const unsub_func = () => {
      window.removeEventListener('resize', updateScalingFactor);
    };

    return () => {
      unsub_func();
      canceledRef.current = true;
      // Konva cleanup is handled automatically by the Stage component
    };
  }, []);

  const gestureData = text_data.gestures ?? [];

  const currentGesture = gestureData[currentGestureIndex];

  const totalGestures = gestureData.length;

  // Konva initialization is handled by the Stage component automatically

  const playAllGestures = async () => {
    setPracticeMode('playing');
    clearAllPracticeGestures();

    for (const gesture of gestureData) {
      await playGestureWithKonva(gesture, false); // Not a guidance gesture
      await new Promise((resolve) => setTimeout(resolve, GESTURE_GAP_DURATION));
    }

    setPracticeMode('none');
  };

  // Konva-based gesture animation
  const playGestureWithKonva = async (
    gesture: Gesture,
    isCurrentAnimatedGesture: boolean = false
  ): Promise<void> => {
    const gestureLineId = gesture.index;

    // Initialize the gesture line in state
    setAnimatedGestureLines((prev) => [
      ...prev.filter((line) => line.index !== gestureLineId),
      {
        index: gestureLineId,
        points_flat: [],
        color: gesture.color,
        width: gesture.width,
        isCurrentAnimatedGesture
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

  const playGestureIndex = async (gestureIndex: number) => {
    // Disable drawing while playing the guided animation for the current gesture
    disableDrawingMode();
    setIsAnimatingCurrentGesture(true);
    clearCurrentAnimatedGesture();
    await playGestureWithKonva(gestureData[gestureIndex], true); // This is a guidance gesture
    setIsAnimatingCurrentGesture(false);
    enableDrawingMode();
  };

  const enableDrawingMode = () => {
    setIsDrawing(true);
  };

  const disableDrawingMode = () => {
    setIsDrawing(false);
  };

  // Handle user gesture drawing from Konva canvas
  // Handle user gesture drawing from Konva canvas
  const handleUserStroke = async (userPoints: GesturePoint[]) => {
    const currentGesture = gestureData[currentGestureIndex];
    if (!currentGesture) return;

    // Add user stroke to visualization
    const gestureLineId = Date.now(); // Unique ID for user stroke
    const flatPoints = userPoints.flatMap((p) => [p[0], p[1]]);

    setAnimatedGestureLines((prev) => [
      ...prev,
      {
        index: gestureLineId,
        points_flat: flatPoints,
        color: '#0066cc',
        width: currentGesture.width || 6,
        isUserGesture: true
      }
    ]);

    // Evaluate gesture accuracy with error handling
    let accuracy = 0;
    try {
      accuracy = evaluateStrokeAccuracy(userPoints, currentGesture.points);
    } catch (error) {
      console.error('Error evaluating stroke accuracy:', error);
      // Treat evaluation errors as failed attempts
      accuracy = 0;
    }

    if (accuracy > 0.7) {
      // completeCurrentGesture
      setShowTryAgain(false);
      playNextGesture(currentGestureIndex, completedGesturesCount);
    } else {
      setLastAccuracy(accuracy);
      setShowTryAgain(true);

      // Remove the user stroke after a delay
      setTimeout(() => {
        setAnimatedGestureLines((prev) => prev.filter((line) => line.index !== gestureLineId));
        setShowTryAgain(false);
      }, 5000);
    }
  };

  const playNextGesture = (currentGestureIdx: number, completedCount: number) => {
    // Clear current animated gesture flag
    setAnimatedGestureLines((prev) =>
      prev.map((line) => ({ ...line, isCurrentAnimatedGesture: false }))
    );

    clearUserGestures();
    clearCurrentAnimatedGesture();

    // Move to next gesture
    setCurrentGestureIndex(currentGestureIdx + 1);
    setCompletedGesturesCount(completedCount + 1);
    if (currentGestureIdx < totalGestures - 1) {
      setTimeout(() => {
        playGestureIndex(currentGestureIdx + 1);
      }, 300);
      disableDrawingMode();
    } else {
      finishPracticeMode();
    }
  };

  const finishPracticeMode = async () => {
    disableDrawingMode();
    clearUserGestures();
    setShowAllGesturesDone(true);
  };

  const clearAllPracticeGestures = () => {
    setAnimatedGestureLines([]);
  };

  const clearCurrentAnimatedGesture = () => {
    setAnimatedGestureLines((prev) => prev.filter((line) => !line.isCurrentAnimatedGesture));
  };

  const clearUserGestures = () => {
    setAnimatedGestureLines((prev) => prev.filter((line) => !line.isUserGesture));
  };

  const replayCurrentGesture = () => {
    if (practiceMode !== 'practicing' || isAnimatingCurrentGesture) return;
    clearCurrentAnimatedGesture();
    playGestureIndex(currentGestureIndex);
  };

  const skipCurrentGesture = () => {
    if (practiceMode !== 'practicing' || isAnimatingCurrentGesture) return;

    setShowTryAgain(false);

    // Move to next gesture
    playNextGesture(currentGestureIndex, completedGesturesCount);
  };

  const resetPractice = () => {
    setPracticeMode('none');
    setCurrentGestureIndex(0);
    setCompletedGesturesCount(0);
    setShowAllGesturesDone(false);
    setShowTryAgain(false);
    disableDrawingMode();
    clearAllPracticeGestures();
  };

  if (!gestureData.length) {
    return (
      <Card className="p-6">
        <div className="text-center text-muted-foreground">
          No gesture data available for practice.
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-6">
      <div className="space-y-4">
        <div className="text-center">
          <h2 className="mb-2 text-2xl font-bold">Practice: {text_data.text}</h2>
        </div>

        <div className="flex justify-center gap-4">
          {(practiceMode === 'none' || practiceMode === 'playing') && (
            <>
              <button
                onClick={playAllGestures}
                disabled={practiceMode === 'playing'}
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

                  setPracticeMode('practicing');
                  setCurrentGestureIndex(0);
                  setCompletedGesturesCount(0);
                  setShowTryAgain(false);
                  clearAllPracticeGestures();
                  playGestureIndex(currentGestureIndex);
                }}
                disabled={practiceMode === 'playing'}
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

          {practiceMode === 'practicing' && (
            <>
              <button
                onClick={replayCurrentGesture}
                disabled={isAnimatingCurrentGesture}
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
                onClick={resetPractice}
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
        {practiceMode === 'practicing' && !showAllGesturesDone && (
          <ProgressDisplay
            currentGesture={currentGestureIndex + 1}
            totalGestures={totalGestures}
            completedCount={completedGesturesCount}
          />
        )}

        {showAllGesturesDone && (
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
                setShowAllGesturesDone(false);
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
        )}

        <AnimatePresence>
          {showTryAgain && practiceMode === 'practicing' && (
            <TryAgainSection
              accuracy={lastAccuracy}
              onSkipGesture={skipCurrentGesture}
              onClose={() => setShowTryAgain(false)}
            />
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
              currentGestureIndex={currentGestureIndex}
              onUserStroke={handleUserStroke}
              isDrawingEnabled={isDrawing}
            />
          </div>
        </div>
      </div>
    </Card>
  );
}

// Try Again Section Component
const TryAgainSection = ({
  accuracy,
  onSkipGesture,
  onClose
}: {
  accuracy: number;
  onSkipGesture: () => void;
  onClose: () => void;
}) => {
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
        <div className="rounded-xl border border-red-200 bg-white p-6 shadow-2xl dark:border-red-800 dark:bg-gray-900">
          <div className="flex items-center justify-between space-x-6">
            <div className="flex items-center space-x-3">
              <motion.div
                className="flex h-12 w-12 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/30"
                animate={{
                  scale: [1, 1.2, 1],
                  rotate: [0, 5, -5, 0]
                }}
                transition={{
                  duration: 0.6,
                  repeat: Infinity,
                  repeatDelay: 2
                }}
              >
                <span className="text-2xl">😅</span>
              </motion.div>
              <div>
                <motion.h3
                  className="text-xl font-bold text-red-700 dark:text-red-400"
                  animate={{
                    scale: [1, 1.05, 1]
                  }}
                  transition={{
                    duration: 0.8,
                    repeat: Infinity,
                    repeatDelay: 1.5
                  }}
                >
                  Try Again!
                </motion.h3>
                <p className="text-sm text-red-600 dark:text-red-300">
                  Accuracy: {Math.round(accuracy * 100)}% (need 70%+)
                </p>
              </div>
            </div>

            <div className="flex space-x-2">
              <motion.button
                onClick={onSkipGesture}
                className="flex items-center space-x-2 rounded-lg bg-gray-200 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600"
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
              >
                <MdArrowForward className="h-4 w-4" />
                <span>Next Gesture</span>
              </motion.button>

              <motion.button
                onClick={onClose}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-red-100 text-red-600 transition-colors hover:bg-red-200 dark:bg-red-900/30 dark:text-red-400 dark:hover:bg-red-800/40"
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
              >
                ×
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
        onClick={onClose}
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
      className="flex items-center justify-center space-x-6 rounded-xl border border-blue-100 bg-gradient-to-r from-blue-50 to-indigo-50 px-6 py-4 shadow-lg dark:border-blue-800 dark:from-blue-950/30 dark:to-indigo-950/30"
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
