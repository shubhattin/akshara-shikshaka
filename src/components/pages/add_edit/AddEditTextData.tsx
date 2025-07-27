'use client';

import { type Canvas } from 'fabric';
import { useEffect, useRef, useState } from 'react';
import { Button } from '~/components/ui/button';
import { Card } from '~/components/ui/card';
import { Input } from '~/components/ui/input';
import { Label } from '~/components/ui/label';
import * as fabric from 'fabric';

type text_data_type = {
  text: string;
  svg: string;
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

export default function AddEditTextData({ text_data, location }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fabricCanvasRef = useRef<Canvas>(null);
  const canceledRef = useRef(false);
  const [text, setText] = useState(text_data.text);
  const [savedText, setSavedText] = useState(text_data.text);
  const [textEditMode, setTextEditMode] = useState(location === 'add' && true);
  const [scaleDownFactor, setScaleDownFactor] = useState(4);

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
    // This can happen in React StrictMode
    const existingCanvas = (canvasRef.current as any).__fabric;
    if (existingCanvas) {
      existingCanvas.dispose();
      delete (canvasRef.current as any).__fabric;
    }

    // Initialize Fabric.js canvas
    const canvas = new fab.Canvas(canvasRef.current, {
      width: 400,
      height: 400,
      backgroundColor: '#ffffff'
    });

    // Store reference on the canvas element itself for cleanup
    (canvasRef.current as any).__fabric = canvas;

    fabricCanvasRef.current = canvas;
  };

  const render_text_path = async (text: string) => {
    const hbjs = await import('~/tools/harfbuzz/index');

    const FONT_URL = '/fonts/regular/Nirmala.ttf';
    await Promise.all([hbjs.preload_harfbuzzjs_wasm(), hbjs.preload_font_from_url(FONT_URL)]);

    const svg_path = await hbjs.get_text_svg_path(text, FONT_URL);
    if (svg_path && fabricCanvasRef.current) {
      const SCALE_FACTOR = !scaleDownFactor || scaleDownFactor !== 0 ? 1 / scaleDownFactor : 1;
      const pathObject = new fabric.Path(svg_path, {
        fill: 'black',
        stroke: '#000000', // black
        strokeWidth: 2,
        selectable: true,
        scaleX: SCALE_FACTOR,
        scaleY: SCALE_FACTOR,
        evented: false,
        lockScalingX: false,
        lockScalingY: false,
        lockRotation: true,
        lockMovementX: false,
        lockMovementY: false
      });

      // clear prev path objectjs
      fabricCanvasRef.current?.getObjects().forEach((obj) => {
        if (obj instanceof fabric.Path) {
          fabricCanvasRef.current?.remove(obj);
        }
      });

      // Center the character on canvas
      fabricCanvasRef.current?.centerObject(pathObject);
      fabricCanvasRef.current?.add(pathObject);
      fabricCanvasRef.current?.renderAll();
    }
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
  useEffect(() => {
    if (savedText.trim().length === 0) return;
    render_text_path(savedText);
  }, [savedText, scaleDownFactor]);

  return (
    <Card className="p-6">
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Label className="font-bold">Text</Label>
          <div className="flex items-center gap-2">
            <Input
              value={text}
              className="w-32"
              disabled={!textEditMode}
              onChange={(e) => setText(e.target.value)}
            />
            {!textEditMode && <Button onClick={() => setTextEditMode(true)}>Edit</Button>}
            {textEditMode && (
              <Button
                onClick={() => {
                  setTextEditMode(false);
                  setSavedText(text);
                }}
              >
                Save
              </Button>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Label className="font-bold">Scale Down Factor</Label>
          <Input
            value={scaleDownFactor}
            className="w-16"
            type="number"
            step={0.5}
            onChange={(e) => {
              const value = Number(e.target.value);
              if (value > 0) {
                setScaleDownFactor(value);
              }
            }}
          />
        </div>
        <div className="flex justify-center">
          <div className="rounded-lg border-2 border-gray-200">
            <canvas ref={canvasRef} />
          </div>
        </div>
      </div>
    </Card>
  );
}
