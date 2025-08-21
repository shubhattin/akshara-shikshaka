'use client';

import { type Canvas } from 'fabric';
import { useEffect, useRef, useState } from 'react';
import { Card } from '~/components/ui/card';
import * as fabric from 'fabric';
import { cn } from '~/lib/utils';
import { MdPlayArrow, MdClear, MdCheckCircle, MdArrowForward } from 'react-icons/md';
import { FiTrendingUp } from 'react-icons/fi';
import {
  sampleStrokeToPolyline,
  playStrokeWithoutClear,
  evaluateStrokeAccuracy,
  playGestureWithoutClear
} from '~/tools/stroke_data/utils';
import {
  StrokePoint,
  GestureData,
  CANVAS_DIMS,
  Stroke,
  GESTURE_FLAGS
} from '~/tools/stroke_data/types';
import { motion, AnimatePresence } from 'framer-motion';
import { AiOutlineSignature } from 'react-icons/ai';

type text_data_type = {
  id: number;
  uuid: string;
  text: string;
  strokes_json?: GestureData;
};

type Props = {
  text_data: text_data_type;
};

export default function PracticeCanvasComponent({ text_data }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fabricCanvasRef = useRef<Canvas>(null);
  const canceledRef = useRef(false);

  // Practice state
  const [practiceMode, setPracticeMode] = useState<'none' | 'playing' | 'practicing'>('none');
  const [currentGestureIndex, setCurrentGestureIndex] = useState(0);
  const [isDrawing, setIsDrawing] = useState(false);
  const [completedGesturesCount, setCompletedGesturesCount] = useState<number>(0);
  const [showAllGesturesDone, setShowAllGesturesDone] = useState(false);
  const [isAnimatingCurrentGesture, setIsAnimatingCurrentGesture] = useState(false);
  const [showTryAgain, setShowTryAgain] = useState(false);
  const [lastAccuracy, setLastAccuracy] = useState(0);

  // Add refs to capture latest state in callbacks
  const currentGestureIndexRef = useRef(currentGestureIndex);
  useEffect(() => {
    currentGestureIndexRef.current = currentGestureIndex;
  }, [currentGestureIndex]);

  const completedGesturesCountRef = useRef(completedGesturesCount);
  useEffect(() => {
    completedGesturesCountRef.current = completedGesturesCount;
  }, [completedGesturesCount]);

  const strokeData = text_data.strokes_json || { gestures: [] };

  const allGestures = strokeData.gestures;
  const currentGesture = allGestures[currentGestureIndex];

  const totalGestures = allGestures.length;

  const initCanvas = async () => {
    if (!canvasRef.current) return;

    // Clean up existing canvas first
    if (fabricCanvasRef.current) {
      fabricCanvasRef.current.dispose();
      fabricCanvasRef.current = null;
    }

    // Dynamic import to avoid SSR issues

    if (canceledRef.current) return;

    // Check if the canvas element already has a Fabric instance
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
      isDrawingMode: false,
      selection: false
    });

    // Store reference on the canvas element itself for cleanup
    (canvasRef.current as any).__fabric = canvas;
    fabricCanvasRef.current = canvas;

    // Start with a clean, empty canvas (no character path or pre-rendered strokes)
  };

  const playAllGestures = async () => {
    if (!fabricCanvasRef.current) return;

    setPracticeMode('playing');
    clearAllPracticeStrokes();

    for (const gesture of allGestures) {
      await playGestureWithoutClear(gesture, fabricCanvasRef);
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    setPracticeMode('none');
  };

  const playGestureIndex = async (gestureIndex: number) => {
    // Disable drawing while playing the guided animation for the current stroke
    disableDrawingMode();
    setIsAnimatingCurrentGesture(true);
    clearCurrentAnimatedStroke();
    await playGestureWithoutClear(allGestures[gestureIndex], fabricCanvasRef, {
      [GESTURE_FLAGS.isCurrentAnimatedStroke]: true
    });
    setIsAnimatingCurrentGesture(false);
    enableDrawingMode();
  };

  const enableDrawingMode = () => {
    if (!fabricCanvasRef.current) return;
    // clearGestureVisualization();

    setIsDrawing(true);
    const canvas = fabricCanvasRef.current;

    canvas.isDrawingMode = true;
    canvas.freeDrawingBrush = new fabric.PencilBrush(canvas);
    canvas.freeDrawingBrush.color = '#0066cc';
    canvas.freeDrawingBrush.width = currentGesture.brush_width || 6;

    canvas.off('path:created', handleUserStroke);
    canvas.on('path:created', handleUserStroke);
  };

  const disableDrawingMode = () => {
    if (!fabricCanvasRef.current) return;

    setIsDrawing(false);
    fabricCanvasRef.current.isDrawingMode = false;
    fabricCanvasRef.current.off('path:created', handleUserStroke);
  };

  // Modify handleUserStroke to use refs for latest state
  const handleUserStroke = (e: any) => {
    // Add fresh state references
    const gestureIdx = currentGestureIndexRef.current;
    const gesture = allGestures[gestureIdx];

    if (!e.path) return;

    // Mark user drawn path
    e.path.set({
      selectable: false,
      evented: false,
      [GESTURE_FLAGS.isUserStroke]: true
    });

    // Extract points from user path
    const pathData = e.path.path;
    const userPoints: StrokePoint[] = [];

    pathData.forEach((cmd: any, index: number) => {
      if (cmd[0] === 'M' && cmd.length >= 3) {
        userPoints.push({ x: cmd[1], y: cmd[2], timestamp: index * 10, cmd: 'M' });
      } else if (cmd[0] === 'L' && cmd.length >= 3) {
        userPoints.push({ x: cmd[1], y: cmd[2], timestamp: index * 10, cmd: 'L' });
      } else if (cmd[0] === 'Q' && cmd.length >= 5) {
        userPoints.push({
          x: cmd[3],
          y: cmd[4],
          timestamp: index * 10,
          cmd: 'Q',
          cx: cmd[1],
          cy: cmd[2]
        });
      }
    });

    // Evaluate stroke accuracy using latest gesture
    const accuracy =
      gesture.strokes.reduce((acc, stroke) => {
        return acc + evaluateStrokeAccuracy(userPoints, stroke.points);
      }, 0) / gesture.strokes.length;

    if (accuracy > 0.7) {
      // completeCurrentGesture
      setShowTryAgain(false);
      playGestureWithoutClear(gesture, fabricCanvasRef);

      playNextGesture(gestureIdx, completedGesturesCountRef.current);
    } else {
      setLastAccuracy(accuracy);
      setShowTryAgain(true);
      fabricCanvasRef.current?.remove(e.path);
      // Auto-hide after 5 seconds
      setTimeout(() => setShowTryAgain(false), 5000);
    }
  };

  const playNextGesture = (currentGestureIndex: number, completedGesturesCount: number) => {
    clearUserStrokes();
    clearCurrentAnimatedStroke();

    // Move to next stroke
    if (currentGestureIndex > 0) {
      // reset previous isCurrentAnimatedStroke
      fabricCanvasRef.current?.getObjects().forEach((obj) => {
        if (obj.get(GESTURE_FLAGS.isCurrentAnimatedStroke)) {
          obj.set({ [GESTURE_FLAGS.isCurrentAnimatedStroke]: false });
        }
      });
    }
    setCurrentGestureIndex(currentGestureIndex + 1);
    setCompletedGesturesCount(completedGesturesCount + 1);
    if (currentGestureIndex < totalGestures - 1) {
      setTimeout(() => {
        playGestureIndex(currentGestureIndex + 1);
      }, 300);
      disableDrawingMode();
    } else {
      finishPracticeMode();
    }
  };

  const finishPracticeMode = async () => {
    disableDrawingMode();
    clearUserStrokes();
    setShowAllGesturesDone(true);
  };

  const clearAllPracticeStrokes = () => {
    if (!fabricCanvasRef.current) return;

    fabricCanvasRef.current.getObjects().forEach((obj) => {
      if (obj.get(GESTURE_FLAGS.isUserStroke) || obj.get(GESTURE_FLAGS.isGestureVisualization)) {
        fabricCanvasRef.current?.remove(obj);
      }
    });
    fabricCanvasRef.current.renderAll();
  };

  const clearCurrentAnimatedStroke = () => {
    if (!fabricCanvasRef.current) return;

    fabricCanvasRef.current.getObjects().forEach((obj) => {
      if (obj.get(GESTURE_FLAGS.isCurrentAnimatedStroke)) {
        fabricCanvasRef.current?.remove(obj);
      }
    });
    fabricCanvasRef.current.renderAll();
  };

  const clearUserStrokes = () => {
    if (!fabricCanvasRef.current) return;

    fabricCanvasRef.current.getObjects().forEach((obj) => {
      if (obj.get(GESTURE_FLAGS.isUserStroke)) {
        fabricCanvasRef.current?.remove(obj);
      }
    });
    fabricCanvasRef.current.renderAll();
  };

  const replayCurrentStroke = () => {
    if (practiceMode !== 'practicing' || isAnimatingCurrentGesture) return;
    clearCurrentAnimatedStroke();
    playGestureIndex(currentGestureIndex);
  };

  const skipCurrentStroke = () => {
    if (practiceMode !== 'practicing' || isAnimatingCurrentGesture) return;

    setShowTryAgain(false);

    // Move to next stroke
    playNextGesture(currentGestureIndex, completedGesturesCount);
  };

  const resetPractice = () => {
    setPracticeMode('none');
    setCurrentGestureIndex(0);
    setCompletedGesturesCount(0);
    setShowAllGesturesDone(false);
    setShowTryAgain(false);
    disableDrawingMode();
    clearAllPracticeStrokes();
    // Keep canvas empty on reset
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
      if (canvasRef.current && (canvasRef.current as any).__fabric) {
        delete (canvasRef.current as any).__fabric;
      }
    };
  }, []);

  if (!strokeData.gestures.length) {
    return (
      <Card className="p-6">
        <div className="text-center text-muted-foreground">
          No stroke data available for practice.
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
                  clearAllPracticeStrokes();
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
                onClick={replayCurrentStroke}
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
                Play Current Stroke
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
            currentGestures={currentGestureIndex + 1}
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
              You successfully completed all strokes!
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
              onSkipStroke={skipCurrentStroke}
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
            <canvas
              ref={canvasRef}
              style={{ width: CANVAS_DIMS.width, height: CANVAS_DIMS.height }}
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
  onSkipStroke,
  onClose
}: {
  accuracy: number;
  onSkipStroke: () => void;
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
                onClick={onSkipStroke}
                className="flex items-center space-x-2 rounded-lg bg-gray-200 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600"
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
              >
                <MdArrowForward className="h-4 w-4" />
                <span>Next Stroke</span>
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
  currentGestures,
  totalGestures,
  completedCount
}: {
  currentGestures: number;
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
      {/* Current Stroke Progress */}
      <div className="flex items-center space-x-2">
        <motion.div
          animate={{ rotate: [0, 360] }}
          transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
          className="flex-shrink-0"
        >
          <FiTrendingUp className="text-2xl text-blue-500 dark:text-blue-400" />
        </motion.div>
        <div className="flex items-center space-x-1 text-lg font-bold">
          <span className="text-gray-600 dark:text-gray-300">Stroke</span>
          <motion.div className="flex items-center space-x-1" whileHover={{ scale: 1.05 }}>
            <AnimatedNumber
              value={currentGestures}
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

      {/* Completed Strokes */}
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
