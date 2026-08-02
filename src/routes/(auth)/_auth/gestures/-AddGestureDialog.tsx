'use client';

import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import Cookie from 'js-cookie';
import { transliterate } from 'lipilekhika';
import {
  createTypingContext,
  clearTypingContextOnKeyDown,
  handleTypingBeforeInputEvent
} from 'lipilekhika/typing';
import { toast } from 'sonner';
import { useTRPC } from '~/api/client';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from '~/components/ui/alert-dialog';
import { Button } from '~/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '~/components/ui/dialog';
import { Input } from '~/components/ui/input';
import { Label } from '~/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '~/components/ui/select';
import { DEFAULT_FONT_FAMILY, DEFAULT_FONT_SIZE, FONT_SCRIPTS } from '~/state/font_list';
import { SCRIPT_ID_COOKIE_KEY } from '~/state/cookie';
import { get_script_from_id, script_list_obj, type script_list_type } from '~/state/lang_list';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  init_script_id: number;
};

export default function AddGestureDialog({ open, onOpenChange, init_script_id }: Props) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const [script, setScript] = useState<script_list_type>(get_script_from_id(init_script_id));
  const [text, setText] = useState('');
  const [confirmOpen, setConfirmOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    setScript(get_script_from_id(init_script_id));
    setText('');
    setConfirmOpen(false);
  }, [open, init_script_id]);

  const ctx = useMemo(() => createTypingContext(script), [script]);
  useEffect(() => {
    void ctx.ready;
  }, [ctx]);

  const add_mut = useMutation(
    trpc.text_gestures.add_text_gesture_data.mutationOptions({
      onSuccess: async (data) => {
        if (!data.success) {
          if (data.err_code === 'text_already_exists') {
            toast.error('Text already exists');
          } else {
            toast.error('Failed to add gesture');
          }
          return;
        }
        toast.success('Gesture created');
        await queryClient.invalidateQueries(
          trpc.text_gestures.categories.get_gestures.queryFilter({
            category_id: 0,
            script_id: script_list_obj[script]
          })
        );
        setConfirmOpen(false);
        onOpenChange(false);
        navigate({ to: '/gestures/edit/$id', params: { id: String(data.id) } });
      },
      onError: () => {
        toast.error('Failed to add gesture');
      }
    })
  );

  const canSubmit = text.trim().length > 0 && !add_mut.isPending;

  async function handleConfirm() {
    const trimmed = text.trim();
    if (!trimmed) return;
    const textKey = await transliterate(trimmed, script, 'Normal');
    add_mut.mutate({
      text: trimmed,
      textKey,
      gestures: [],
      scriptID: script_list_obj[script],
      fontFamily: DEFAULT_FONT_FAMILY,
      fontSize: DEFAULT_FONT_SIZE,
      textCenterOffset: [0, 0]
    });
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add Gesture</DialogTitle>
            <DialogDescription>
              Choose a script and text. You can draw strokes on the edit page after creating.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label>Script</Label>
              <Select
                items={[
                  { label: 'Script', value: null },
                  ...FONT_SCRIPTS.map((s) => ({ label: s, value: s }))
                ]}
                value={script}
                onValueChange={(v) => {
                  if (!v) return;
                  const next = v as script_list_type;
                  setScript(next);
                  Cookie.set(SCRIPT_ID_COOKIE_KEY, script_list_obj[next].toString(), {
                    expires: 30
                  });
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Script" />
                </SelectTrigger>
                <SelectContent>
                  {FONT_SCRIPTS.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-2">
              <Label>Text</Label>
              <Input
                value={text}
                onChange={(e) => setText(e.target.value)}
                onBeforeInput={(e) =>
                  handleTypingBeforeInputEvent(ctx, e, (newValue) => setText(newValue))
                }
                onBlur={() => ctx.clearContext()}
                onKeyDown={(e) => clearTypingContextOnKeyDown(e, ctx)}
                placeholder="Enter text"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="secondary" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button disabled={!canSubmit} onClick={() => setConfirmOpen(true)}>
              Add
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm Add</AlertDialogTitle>
            <AlertDialogDescription>
              Create gesture for “{text.trim()}” and open the editor?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={add_mut.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirm} disabled={add_mut.isPending}>
              {add_mut.isPending ? 'Creating…' : 'Confirm'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
