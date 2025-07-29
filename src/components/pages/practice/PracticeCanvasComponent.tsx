'use client';

import { type Canvas } from 'fabric';
import { useEffect, useRef, useState } from 'react';
import { Button } from '~/components/ui/button';
import { Card } from '~/components/ui/card';
import * as fabric from 'fabric';
import { cn } from '~/lib/utils';
import { MdPlayArrow, MdClear, MdFiberManualRecord } from 'react-icons/md';
import { toast } from 'sonner';

// Types from AddEditTextData
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
  id: number;
  uuid: string;
  text: string;
  strokes_json?: StrokeData;
};

type Props = {
  text_data: text_data_type;
};

const PracticeCanvasComponent = ({ text_data }: Props) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fabricCanvasRef = useRef<Canvas>(null);
  const canceledRef = useRef(false);

  // Practice state
  const [practiceMode, setPracticeMode] = useState<'none' | 'playing' | 'practicing'>('none');
  const [currentStrokeIndex, setCurrentStrokeIndex] = useState(0);
  const [isDrawing, setIsDrawing] = useState(false);
  const [completedStrokes, setCompletedStrokes] = useState<number[]>([]);
  const [showCongratulations, setShowCongratulations] = useState(false);

  const strokeData = text_data.strokes_json || { gestures: [] };

  // Flatten all strokes from all gestures for practice
  const allStrokes = strokeData.gestures.flatMap((gesture, gestureIndex) =>
    gesture.strokes.map((stroke, strokeIndex) => ({
      ...stroke,
      gestureIndex,
      strokeIndex,
      gesture,
      globalIndex: gestureIndex * 1000 + strokeIndex
    }))
  );

  const totalStrokes = allStrokes.length;
  const currentStroke = allStrokes[currentStrokeIndex];

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
      isDrawingMode: false
    });

    // Store reference on the canvas element itself for cleanup
    (canvasRef.current as any).__fabric = canvas;
    fabricCanvasRef.current = canvas;

    // Render character path and pre-rendered strokes
    await renderCharacterPath();
    prerenderAllStrokes();
  };

  const renderCharacterPath = async () => {
    if (!text_data.text || !fabricCanvasRef.current) return;

    const hbjs = await import('~/tools/harfbuzz/index');
    const FONT_URL = '/fonts/regular/Nirmala.ttf';
    await Promise.all([hbjs.preload_harfbuzzjs_wasm(), hbjs.preload_font_from_url(FONT_URL)]);

    const svg_path = await hbjs.get_text_svg_path(text_data.text, FONT_URL);
    if (svg_path) {
      const SCALE_FACTOR = 1 / 4.5;
      const pathObject = new fabric.Path(svg_path, {
        fill: 'rgba(0,0,0,0.1)',
        stroke: '#cccccc',
        strokeWidth: 1,
        selectable: false,
        evented: false,
        scaleX: SCALE_FACTOR,
        scaleY: SCALE_FACTOR,
        isCharacterPath: true
      });

      fabricCanvasRef.current?.centerObject(pathObject);
      fabricCanvasRef.current?.add(pathObject);
      fabricCanvasRef.current?.renderAll();
    }
  };

  const prerenderAllStrokes = () => {
    if (!fabricCanvasRef.current) return;

    // Remove any existing prerendered strokes
    fabricCanvasRef.current.getObjects().forEach((obj) => {
      if (obj.get('isPrerenderStroke')) {
        fabricCanvasRef.current?.remove(obj);
      }
    });

    // Render all strokes in light gray
    allStrokes.forEach((stroke, index) => {
      if (stroke.points.length < 2) return;

      let pathString = '';
      stroke.points.forEach((point, pointIndex) => {
        if (pointIndex === 0) {
          pathString += `M ${point.x} ${point.y}`;
        } else {
          pathString += ` L ${point.x} ${point.y}`;
        }
      });

      const pathObject = new fabric.Path(pathString, {
        stroke: '#e0e0e0',
        strokeWidth: stroke.gesture.brush_width * 0.8,
        fill: '',
        selectable: false,
        evented: false,
        isPrerenderStroke: true,
        originalStrokeIndex: index
      } as any);

      fabricCanvasRef.current?.add(pathObject);
    });

    fabricCanvasRef.current?.renderAll();
  };

  const playAllStrokes = async () => {
    if (!fabricCanvasRef.current) return;

    setPracticeMode('playing');
    clearPracticeStrokes();

    for (const stroke of allStrokes) {
      if (stroke.points.length < 2) continue;
      await animateStroke(
        stroke,
        stroke.gesture.brush_color,
        stroke.gesture.brush_width,
        stroke.gesture.animation_duration
      );
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    setPracticeMode('none');
  };

  const animateStroke = async (stroke: any, color: string, width: number, duration: number) => {
    if (!fabricCanvasRef.current || stroke.points.length < 2) return;

    let pathString = '';
    stroke.points.forEach((point: StrokePoint, index: number) => {
      if (index === 0) {
        pathString += `M ${point.x} ${point.y}`;
      } else {
        pathString += ` L ${point.x} ${point.y}`;
      }
    });

    const fullPath = new fabric.Path(pathString, {
      stroke: color,
      strokeWidth: width,
      fill: '',
      selectable: false,
      evented: false,
      isAnimatedStroke: true,
      opacity: 0
    } as any);

    fabricCanvasRef.current.add(fullPath);

    const totalPoints = stroke.points.length;
    const animationSteps = Math.min(totalPoints * 2, 50);

    for (let step = 1; step <= animationSteps; step++) {
      const progress = step / animationSteps;
      const pointIndex = Math.floor(progress * (totalPoints - 1));

      let partialPath = '';
      for (let i = 0; i <= pointIndex; i++) {
        if (i === 0) {
          partialPath += `M ${stroke.points[i].x} ${stroke.points[i].y}`;
        } else {
          partialPath += ` L ${stroke.points[i].x} ${stroke.points[i].y}`;
        }
      }

      if (pointIndex < totalPoints - 1) {
        const currentPoint = stroke.points[pointIndex];
        const nextPoint = stroke.points[pointIndex + 1];
        const subProgress = (progress * (totalPoints - 1)) % 1;

        const interpolatedX = currentPoint.x + (nextPoint.x - currentPoint.x) * subProgress;
        const interpolatedY = currentPoint.y + (nextPoint.y - currentPoint.y) * subProgress;

        partialPath += ` L ${interpolatedX} ${interpolatedY}`;
      }

      fullPath.set('path', fabric.util.parsePath(partialPath));
      fullPath.set('opacity', 1);
      fabricCanvasRef.current.renderAll();

      const delay = duration / animationSteps;
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  };

  const startPracticeMode = () => {
    if (totalStrokes === 0) return;

    setPracticeMode('practicing');
    setCurrentStrokeIndex(0);
    setCompletedStrokes([]);
    clearPracticeStrokes();
    showCurrentStroke();
  };

  const showCurrentStroke = async () => {
    if (!currentStroke) return;

    clearCurrentAnimatedStroke();
    await animateStroke(
      currentStroke,
      currentStroke.gesture.brush_color,
      currentStroke.gesture.brush_width,
      currentStroke.gesture.animation_duration
    );
    enableDrawingMode();
  };

  const enableDrawingMode = () => {
    if (!fabricCanvasRef.current) return;

    setIsDrawing(true);
    const canvas = fabricCanvasRef.current;

    canvas.isDrawingMode = true;
    canvas.freeDrawingBrush = new fabric.PencilBrush(canvas);
    canvas.freeDrawingBrush.color = '#0066cc';
    canvas.freeDrawingBrush.width = currentStroke?.gesture.brush_width || 6;

    canvas.off('path:created');
    canvas.on('path:created', handleUserStroke);
  };

  const disableDrawingMode = () => {
    if (!fabricCanvasRef.current) return;

    setIsDrawing(false);
    fabricCanvasRef.current.isDrawingMode = false;
    fabricCanvasRef.current.off('path:created');
  };

  const handleUserStroke = (e: any) => {
    if (!e.path || !currentStroke) return;

    // Mark user drawn path
    e.path.set({
      selectable: false,
      evented: false,
      isUserStroke: true
    });

    // Extract points from user path
    const pathData = e.path.path;
    const userPoints: StrokePoint[] = [];

    pathData.forEach((cmd: any, index: number) => {
      if (cmd[0] === 'M' || cmd[0] === 'L') {
        userPoints.push({
          x: cmd[1],
          y: cmd[2],
          timestamp: index * 10
        });
      } else if (cmd[0] === 'Q' && cmd.length >= 5) {
        userPoints.push({
          x: cmd[3],
          y: cmd[4],
          timestamp: index * 10
        });
      }
    });

    // Evaluate stroke accuracy
    const accuracy = evaluateStrokeAccuracy(userPoints, currentStroke.points);

    if (accuracy > 0.7) {
      toast.success(`Good stroke! Accuracy: ${Math.round(accuracy * 100)}%`);
      completeCurrentStroke();
    } else {
      toast.error(`Try again! Accuracy: ${Math.round(accuracy * 100)}% (need 70%+)`);
      fabricCanvasRef.current?.remove(e.path);
    }
  };

  const evaluateStrokeAccuracy = (
    userPoints: StrokePoint[],
    targetPoints: StrokePoint[]
  ): number => {
    if (userPoints.length === 0 || targetPoints.length === 0) return 0;

    const maxDistance = 50;
    let totalAccuracy = 0;
    let comparisons = 0;

    const sampleCount = Math.min(userPoints.length, targetPoints.length, 20);

    for (let i = 0; i < sampleCount; i++) {
      const userIndex = Math.floor((i / sampleCount) * (userPoints.length - 1));
      const targetIndex = Math.floor((i / sampleCount) * (targetPoints.length - 1));

      const userPoint = userPoints[userIndex];
      const targetPoint = targetPoints[targetIndex];

      const distance = Math.sqrt(
        Math.pow(userPoint.x - targetPoint.x, 2) + Math.pow(userPoint.y - targetPoint.y, 2)
      );

      const pointAccuracy = Math.max(0, 1 - distance / maxDistance);
      totalAccuracy += pointAccuracy;
      comparisons++;
    }

    return comparisons > 0 ? totalAccuracy / comparisons : 0;
  };

  const completeCurrentStroke = () => {
    if (!currentStroke) return;

    setCompletedStrokes((prev) => [...prev, currentStrokeIndex]);
    createPerfectStrokeVisualization(currentStroke, currentStrokeIndex);

    if (currentStrokeIndex < totalStrokes - 1) {
      setCurrentStrokeIndex((prev) => prev + 1);
      disableDrawingMode();
      setTimeout(() => {
        showCurrentStroke();
      }, 500);
    } else {
      finishPractice();
    }
  };

  const createPerfectStrokeVisualization = (stroke: any, zIndex: number) => {
    if (!fabricCanvasRef.current || stroke.points.length < 2) return;

    let pathString = '';
    stroke.points.forEach((point: StrokePoint, index: number) => {
      if (index === 0) {
        pathString += `M ${point.x} ${point.y}`;
      } else {
        pathString += ` L ${point.x} ${point.y}`;
      }
    });

    const perfectPath = new fabric.Path(pathString, {
      stroke: stroke.gesture.brush_color,
      strokeWidth: stroke.gesture.brush_width,
      fill: '',
      selectable: false,
      evented: false,
      isPerfectStroke: true,
      strokeOrder: zIndex
    } as any);

    clearCurrentAnimatedStroke();
    fabricCanvasRef.current.add(perfectPath);
    fabricCanvasRef.current.renderAll();
  };

  const finishPractice = async () => {
    disableDrawingMode();
    clearUserStrokes();
    setShowCongratulations(true);

    toast.success('🎉 Congratulations! You completed all strokes!');

    setTimeout(async () => {
      setShowCongratulations(false);
      await playAllStrokes();
      setPracticeMode('none');
    }, 3000);
  };

  const clearPracticeStrokes = () => {
    if (!fabricCanvasRef.current) return;

    fabricCanvasRef.current.getObjects().forEach((obj) => {
      if (obj.get('isAnimatedStroke') || obj.get('isUserStroke') || obj.get('isPerfectStroke')) {
        fabricCanvasRef.current?.remove(obj);
      }
    });
    fabricCanvasRef.current.renderAll();
  };

  const clearCurrentAnimatedStroke = () => {
    if (!fabricCanvasRef.current) return;

    fabricCanvasRef.current.getObjects().forEach((obj) => {
      if (obj.get('isAnimatedStroke')) {
        fabricCanvasRef.current?.remove(obj);
      }
    });
    fabricCanvasRef.current.renderAll();
  };

  const clearUserStrokes = () => {
    if (!fabricCanvasRef.current) return;

    fabricCanvasRef.current.getObjects().forEach((obj) => {
      if (obj.get('isUserStroke')) {
        fabricCanvasRef.current?.remove(obj);
      }
    });
    fabricCanvasRef.current.renderAll();
  };

  const replayCurrentStroke = () => {
    if (!currentStroke || practiceMode !== 'practicing') return;

    clearCurrentAnimatedStroke();
    showCurrentStroke();
  };

  const resetPractice = () => {
    setPracticeMode('none');
    setCurrentStrokeIndex(0);
    setCompletedStrokes([]);
    setShowCongratulations(false);
    disableDrawingMode();
    clearPracticeStrokes();
    prerenderAllStrokes();
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
          {practiceMode === 'practicing' && (
            <div className="text-lg font-semibold text-primary">
              Stroke {currentStrokeIndex + 1} of {totalStrokes}
              {isDrawing && (
                <div className="mt-1 text-sm text-muted-foreground">
                  Draw the highlighted stroke. Need 70%+ accuracy to continue.
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex justify-center gap-4">
          {practiceMode === 'none' && (
            <>
              <Button onClick={playAllStrokes} variant="outline">
                <MdPlayArrow className="mr-2" />
                Play All Strokes
              </Button>
              <Button onClick={startPracticeMode} variant="default">
                <MdFiberManualRecord className="mr-2 text-red-500" />
                Practice Each Stroke
              </Button>
            </>
          )}

          {practiceMode === 'practicing' && (
            <>
              <Button onClick={replayCurrentStroke} variant="outline" size="sm">
                <MdPlayArrow className="mr-1" />
                Replay Stroke
              </Button>
              <Button onClick={resetPractice} variant="outline" size="sm">
                <MdClear className="mr-1" />
                Reset
              </Button>
            </>
          )}

          {practiceMode === 'playing' && (
            <div className="text-muted-foreground">Playing all strokes...</div>
          )}
        </div>

        {showCongratulations && (
          <div className="rounded-lg border border-green-200 bg-green-50 p-4 text-center">
            <div className="text-2xl">🎉</div>
            <div className="text-lg font-semibold text-green-800">Congratulations!</div>
            <div className="text-green-600">You successfully completed all strokes!</div>
          </div>
        )}

        <div className="flex justify-center">
          <div
            className={cn(
              'rounded-lg border-2 transition-colors',
              isDrawing ? 'border-blue-500' : 'border-border'
            )}
          >
            <canvas ref={canvasRef} />
          </div>
        </div>

        {practiceMode === 'practicing' && (
          <div className="text-center text-sm text-muted-foreground">
            Progress: {completedStrokes.length}/{totalStrokes} strokes completed
          </div>
        )}
      </div>
    </Card>
  );
};

export default PracticeCanvasComponent;
