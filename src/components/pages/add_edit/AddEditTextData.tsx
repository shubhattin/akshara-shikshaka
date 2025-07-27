'use client';

import { type Canvas } from 'fabric';
import { useEffect, useRef, useState } from 'react';
import { Button } from '~/components/ui/button';
import { Card } from '~/components/ui/card';
import { Input } from '~/components/ui/input';
import { Label } from '~/components/ui/label';
import * as fabric from 'fabric';
import { client_q } from '~/api/client';
import { useRouter } from 'next/navigation';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTrigger
} from '~/components/ui/alert-dialog';
import { IoMdAdd } from 'react-icons/io';
import {
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogDescription,
  AlertDialogTitle
} from '@radix-ui/react-alert-dialog';
import { FiSave } from 'react-icons/fi';
import { MdDeleteOutline } from 'react-icons/md';
import { toast } from 'sonner';

type text_data_type = {
  text: string;
  id?: number;
  uuid?: string;
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
  const [scaleDownFactor, setScaleDownFactor] = useState(4.5);

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
      <SaveEditMode text_data={text_data} text={text} fabricCanvasRef={fabricCanvasRef} />
    </Card>
  );
}

const SaveEditMode = ({
  text_data,
  text,
  fabricCanvasRef
}: {
  text_data: Props['text_data'];
  text: string;
  fabricCanvasRef: React.RefObject<Canvas | null>;
}) => {
  const is_addition = text_data.id === undefined && text_data.uuid === undefined;

  const router = useRouter();
  const add_text_data_mut = client_q.text_data.add_text_data.useMutation({
    onSuccess(data) {
      toast.success('Text Added');
      router.push(`/edit/${data.id}`);
    }
  });

  const update_text_data_mut = client_q.text_data.edit_text_data.useMutation({
    onSuccess(data) {
      toast.success('Text Updated');
    }
  });

  const delete_text_data_mut = client_q.text_data.delete_text_data.useMutation({
    onSuccess(data) {
      toast.success('Text Deleted');
      router.push('/list');
    }
  });

  const handle_save = () => {
    if (text.trim().length === 0 || !fabricCanvasRef.current) return;
    const fabricjs_svg_dump = fabricCanvasRef.current.toJSON();
    if (is_addition) {
      add_text_data_mut.mutate({
        text,
        svg_json: fabricjs_svg_dump
      });
    } else {
      update_text_data_mut.mutate({
        id: text_data.id!,
        uuid: text_data.uuid!,
        text,
        svg_json: fabricjs_svg_dump
      });
    }
  };

  const handleDelete = async () => {
    if (!is_addition) {
      await delete_text_data_mut.mutateAsync({
        id: text_data.id!,
        uuid: text_data.uuid!
      });
    }
  };

  return (
    <div className="mx-2 mt-2 flex items-center justify-between sm:mx-4">
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button
            disabled={add_text_data_mut.isPending || update_text_data_mut.isPending}
            className="flex text-lg"
            variant={'blue'}
          >
            {is_addition ? (
              <>
                <IoMdAdd className="text-lg" /> {!add_text_data_mut.isPending ? 'Add' : 'Adding...'}
              </>
            ) : (
              <>
                <FiSave className="text-lg" />{' '}
                {!update_text_data_mut.isPending ? 'Save' : 'Saving...'}
              </>
            )}
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Sure to Save</AlertDialogTitle>
            <AlertDialogDescription>
              {is_addition ? 'Are you sure to Add this Text ?' : 'Are you sure to Save this Text ?'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handle_save}>Save</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {!is_addition && (
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button className="flex gap-1 px-1 py-0 text-sm" variant="destructive">
              <MdDeleteOutline className="text-base" />
              Delete
            </Button>
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
      )}
    </div>
  );
};
