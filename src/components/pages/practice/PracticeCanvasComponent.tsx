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
  const [isAnimatingCurrentStroke, setIsAnimatingCurrentStroke] = useState(false);

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

    // Start with a clean, empty canvas (no character path or pre-rendered strokes)
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
    // Intentionally no-op to keep canvas empty at start
    return;
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

    // Disable drawing while playing the guided animation for the current stroke
    disableDrawingMode();
    setIsAnimatingCurrentStroke(true);
    clearCurrentAnimatedStroke();
    await animateStroke(
      currentStroke,
      currentStroke.gesture.brush_color,
      currentStroke.gesture.brush_width,
      currentStroke.gesture.animation_duration
    );
    setIsAnimatingCurrentStroke(false);
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
    if (userPoints.length < 2 || targetPoints.length < 2) return 0;

    // 1) Normalize and resample both sequences to fixed length
    const SAMPLE_SIZE = 64;
    const normalize = (pts: StrokePoint[]) => {
      const xs = pts.map((p) => p.x);
      const ys = pts.map((p) => p.y);
      const minX = Math.min(...xs);
      const minY = Math.min(...ys);
      const maxX = Math.max(...xs);
      const maxY = Math.max(...ys);
      const w = Math.max(1, maxX - minX);
      const h = Math.max(1, maxY - minY);
      const scale = 1 / Math.max(w, h);
      return pts.map((p) => ({ x: (p.x - minX) * scale, y: (p.y - minY) * scale, timestamp: 0 }));
    };

    const resample = (pts: StrokePoint[], n: number) => {
      if (pts.length === n) return pts;
      const dists: number[] = [0];
      for (let i = 1; i < pts.length; i++) {
        const dx = pts[i].x - pts[i - 1].x;
        const dy = pts[i].y - pts[i - 1].y;
        dists[i] = dists[i - 1] + Math.hypot(dx, dy);
      }
      const total = dists[dists.length - 1] || 1;
      const step = total / (n - 1);
      const res: StrokePoint[] = [];
      let target = 0;
      let j = 0;
      for (let i = 0; i < n; i++) {
        while (j < dists.length - 1 && dists[j] < target) j++;
        const prev = Math.max(0, j - 1);
        const t = dists[j] === dists[prev] ? 0 : (target - dists[prev]) / (dists[j] - dists[prev]);
        const x = pts[prev].x + (pts[j].x - pts[prev].x) * t;
        const y = pts[prev].y + (pts[j].y - pts[prev].y) * t;
        res.push({ x, y, timestamp: i });
        target = i * step;
      }
      return res;
    };

    const uNorm = normalize(userPoints);
    const tNorm = normalize(targetPoints);
    const u = resample(uNorm, SAMPLE_SIZE);
    const t = resample(tNorm, SAMPLE_SIZE);

    // 2) Compute direction similarity (cosine between overall vectors)
    const vec = (pts: StrokePoint[]) => ({
      x: pts[pts.length - 1].x - pts[0].x,
      y: pts[pts.length - 1].y - pts[0].y
    });
    const dot = (a: { x: number; y: number }, b: { x: number; y: number }) => a.x * b.x + a.y * b.y;
    const mag = (a: { x: number; y: number }) => Math.hypot(a.x, a.y) || 1e-6;
    const vU = vec(u);
    const vT = vec(t);
    const directionCos = Math.max(0, Math.min(1, dot(vU, vT) / (mag(vU) * mag(vT))));

    // 3) Endpoint proximity
    const endDist = Math.hypot(
      u[u.length - 1].x - t[t.length - 1].x,
      u[u.length - 1].y - t[t.length - 1].y
    );
    const startDist = Math.hypot(u[0].x - t[0].x, u[0].y - t[0].y);
    const endpointScore = Math.max(0, 1 - (startDist + endDist) / 2);

    // 4) DTW path similarity for shape matching
    const dtw = (a: StrokePoint[], b: StrokePoint[]) => {
      const n = a.length;
      const m = b.length;
      const dp = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(Infinity));
      dp[0][0] = 0;
      const cost = (i: number, j: number) => Math.hypot(a[i].x - b[j].x, a[i].y - b[j].y);
      for (let i = 1; i <= n; i++) {
        for (let j = 1; j <= m; j++) {
          const c = cost(i - 1, j - 1);
          dp[i][j] = c + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
        }
      }
      return dp[n][m] / (n + m);
    };

    const dtwDist = dtw(u, t);
    const dtwScore = Math.max(0, 1 - dtwDist); // since coords are normalized to ~[0,1], distance ~[0,2]

    // 5) Path length ratio (to discourage overly short/long)
    const lengthOf = (pts: StrokePoint[]) =>
      pts.reduce((acc, p, i) => {
        if (i === 0) return 0;
        return acc + Math.hypot(p.x - pts[i - 1].x, p.y - pts[i - 1].y);
      }, 0);
    const lenU = lengthOf(u);
    const lenT = lengthOf(t);
    const lenRatio = lenT > 0 ? Math.min(lenU, lenT) / Math.max(lenU, lenT) : 0;

    // Weighted aggregate score
    const score = 0.45 * dtwScore + 0.2 * directionCos + 0.2 * endpointScore + 0.15 * lenRatio;

    return Math.max(0, Math.min(1, score));
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
    if (!currentStroke || practiceMode !== 'practicing' || isAnimatingCurrentStroke) return;
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
              <Button
                onClick={replayCurrentStroke}
                variant="outline"
                size="sm"
                disabled={isAnimatingCurrentStroke}
              >
                <MdPlayArrow className="mr-1" />
                Play Stroke
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
            Stroke {currentStrokeIndex + 1}/{totalStrokes} • Completed: {completedStrokes.length}
          </div>
        )}
      </div>
    </Card>
  );
};

export default PracticeCanvasComponent;
