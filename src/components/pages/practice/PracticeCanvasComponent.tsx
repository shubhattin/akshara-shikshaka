'use client';

import { useEffect, useRef, useState } from 'react';
import { Card } from '~/components/ui/card';
import { Button } from '~/components/ui/button';
import { type Canvas } from 'fabric';
import * as fabric from 'fabric';

type Props = {
  fabricjs_svg_dump: string;
  characterText?: string;
};

const CanvasComponent = ({ fabricjs_svg_dump, characterText }: Props) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fabricCanvasRef = useRef<Canvas>(null);
  const [isDrawingMode, setIsDrawingMode] = useState(true);
  const [brushThickness, setBrushThickness] = useState(6);
  const canceledRef = useRef(false);

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
    // This can happen in React StrictMode
    const existingCanvas = (canvasRef.current as any).__fabric;
    if (existingCanvas) {
      existingCanvas.dispose();
      delete (canvasRef.current as any).__fabric;
    }

    // Initialize Fabric.js canvas
    const canvas = new fabric.Canvas(canvasRef.current, {
      width: 600,
      height: 400,
      backgroundColor: '#ffffff'
    });
    // canvas.loadFromJSON(fabricjs_svg_dump);

    // Set up drawing mode with red pen
    canvas.isDrawingMode = isDrawingMode;
    // Ensure brush exists and configure
    if (!canvas.freeDrawingBrush) {
      canvas.freeDrawingBrush = new fabric.PencilBrush(canvas);
    }

    canvas.freeDrawingBrush.color = '#ef4444'; // red-500
    canvas.freeDrawingBrush.width = brushThickness;

    fabricCanvasRef.current = canvas;
  };

  useEffect(() => {
    canceledRef.current = false;
    initCanvas();
    console.log('initCanvas');
    return () => {
      canceledRef.current = true;
      if (fabricCanvasRef.current) {
        fabricCanvasRef.current.dispose();
        fabricCanvasRef.current = null;
      }
      // Also clean up the reference on the canvas element
      if (canvasRef.current && (canvasRef.current as any).__fabric) {
        delete (canvasRef.current as any).__fabric;
      }
    };
  }, []);

  // Separate effect for drawing mode toggle to avoid re-initializing canvas
  useEffect(() => {
    if (fabricCanvasRef.current) {
      fabricCanvasRef.current.isDrawingMode = isDrawingMode;
    }
  }, [isDrawingMode]);

  // Effect for brush thickness changes
  useEffect(() => {
    if (fabricCanvasRef.current && fabricCanvasRef.current.freeDrawingBrush) {
      fabricCanvasRef.current.freeDrawingBrush.width = brushThickness;
    }
  }, [brushThickness]);

  const clearCanvas = () => {
    if (fabricCanvasRef.current) {
      const canvas = fabricCanvasRef.current;
      // Remove all objects except the character path
      const objects = canvas.getObjects();
      const characterObjects = objects.filter((obj: any) => obj.stroke === '#000000');

      canvas.clear();
      canvas.backgroundColor = '#ffffff';

      // Re-add character objects
      characterObjects.forEach((obj: any) => {
        canvas.add(obj);
      });

      canvas.renderAll();
    }
  };

  const toggleDrawingMode = () => {
    setIsDrawingMode(!isDrawingMode);
  };

  const handleBrushThicknessChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const thickness = parseInt(e.target.value) || 1;
    setBrushThickness(Math.max(1, Math.min(20, thickness))); // Limit between 1 and 20
  };

  return (
    <Card className="p-6">
      <div className="space-y-4">
        {characterText && (
          <h2 className="text-center text-2xl font-semibold">
            Practice Writing: <span className="text-3xl">{characterText}</span>
          </h2>
        )}

        <div className="flex flex-wrap items-center justify-center gap-4">
          <Button onClick={toggleDrawingMode} variant={isDrawingMode ? 'default' : 'outline'}>
            {isDrawingMode ? 'Drawing Mode' : 'Selection Mode'}
          </Button>
          <Button onClick={clearCanvas} variant="outline">
            Clear Drawing
          </Button>
          {/* <div className="flex items-center gap-2">
            <Label htmlFor="brush-thickness">Brush:</Label>
            <Input
              id="brush-thickness"
              type="number"
              min="1"
              max="20"
              value={brushThickness}
              onChange={handleBrushThicknessChange}
              className="w-16"
            />
            <span className="text-sm text-gray-600">px</span>
          </div> */}
        </div>

        <div className="flex justify-center">
          <div className="rounded-lg border-2 border-gray-200">
            <canvas ref={canvasRef} />
          </div>
        </div>

        <div className="text-center text-sm text-gray-600">
          <p>The black outline shows the correct character shape.</p>
          <p>Use the red pen to practice writing over it.</p>
          <p>Switch to Selection Mode to move or modify drawn strokes.</p>
        </div>
      </div>
    </Card>
  );
};

export default CanvasComponent;
