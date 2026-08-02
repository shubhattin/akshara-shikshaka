'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import Cookie from 'js-cookie';
import { CircleHelp } from 'lucide-react';
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
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger
} from '~/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '~/components/ui/select';
import { FONT_SCRIPTS, LANGUAGES_ADDED } from '~/state/font_list';
import { LESSON_LANG_ID_COOKIE_KEY } from '~/state/cookie';
import {
  get_lang_from_id,
  get_script_from_id,
  lang_list_obj,
  script_list_obj,
  type lang_list_type,
  type script_list_type
} from '~/state/lang_list';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  init_lang_id: number;
};

export default function AddLessonDialog({ open, onOpenChange, init_lang_id }: Props) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const [langId, setLangId] = useState(init_lang_id || lang_list_obj['Sanskrit']);
  const [baseWordScriptId, setBaseWordScriptId] = useState(script_list_obj['Devanagari']);
  const [text, setText] = useState('');
  const [confirmOpen, setConfirmOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLangId(init_lang_id || lang_list_obj['Sanskrit']);
    setBaseWordScriptId(script_list_obj['Devanagari']);
    setText('');
    setConfirmOpen(false);
  }, [open, init_lang_id]);

  const langName = get_lang_from_id(langId);
  const scriptName = get_script_from_id(baseWordScriptId);

  const textCtx = useMemo(() => createTypingContext(langName), [langName]);
  useEffect(() => {
    void textCtx.ready;
  }, [textCtx]);

  const add_mut = useMutation(
    trpc.text_lessons.add_text_lesson.mutationOptions({
      onSuccess: async (data) => {
        toast.success('Lesson created');
        await queryClient.invalidateQueries(
          trpc.text_lessons.categories.get_text_lessons.queryFilter({
            category_id: 0,
            lang_id: langId
          })
        );
        setConfirmOpen(false);
        onOpenChange(false);
        navigate({ to: '/lessons/edit/$id', params: { id: String(data.id) } });
      },
      onError: (err) => {
        toast.error('Failed to add lesson' + (err?.message ? `: ${err.message}` : ''));
      }
    })
  );

  const submittingRef = useRef(false);
  const canSubmit = text.trim().length > 0 && !add_mut.isPending;

  async function handleConfirm() {
    if (submittingRef.current || add_mut.isPending) return;
    const trimmed = text.trim();
    if (!trimmed) return;
    submittingRef.current = true;
    try {
      const text_key = await transliterate(trimmed, langName, 'Normal');
      add_mut.mutate(
        {
          lesson_info: {
            lang_id: langId,
            base_word_script_id: baseWordScriptId,
            audio_id: null,
            text: trimmed
          },
          text_key,
          words: []
        },
        {
          onSettled: () => {
            submittingRef.current = false;
          }
        }
      );
    } catch {
      submittingRef.current = false;
      toast.error('Failed to prepare lesson');
    }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add Lesson</DialogTitle>
            <DialogDescription>
              Set language, word script, and lesson text. Words and media are added on the edit
              page.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="add-lesson-lang">Language</Label>
              <Select
                items={[
                  { label: 'Language', value: null },
                  ...LANGUAGES_ADDED.map((name) => ({
                    label: name,
                    value: String(lang_list_obj[name as lang_list_type])
                  }))
                ]}
                value={String(langId)}
                onValueChange={(v) => {
                  if (!v) return;
                  const next = Number(v);
                  setLangId(next);
                  Cookie.set(LESSON_LANG_ID_COOKIE_KEY, String(next), { expires: 30 });
                }}
              >
                <SelectTrigger id="add-lesson-lang" className="w-full">
                  <SelectValue placeholder="Language" />
                </SelectTrigger>
                <SelectContent>
                  {LANGUAGES_ADDED.map((name) => (
                    <SelectItem key={name} value={String(lang_list_obj[name as lang_list_type])}>
                      {name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-1.5">
                <Label htmlFor="add-lesson-base-script">Base word script</Label>
                <Popover>
                  <PopoverTrigger
                    render={
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label="About base word script"
                      />
                    }
                  >
                    <CircleHelp />
                  </PopoverTrigger>
                  <PopoverContent className="w-64" side="top">
                    <PopoverHeader>
                      <PopoverTitle>Base word script</PopoverTitle>
                      <PopoverDescription>
                        Script in which you will be typing the lesson words.
                      </PopoverDescription>
                    </PopoverHeader>
                  </PopoverContent>
                </Popover>
              </div>
              <Select
                items={[
                  { label: 'Script', value: null },
                  ...FONT_SCRIPTS.map((s) => ({
                    label: s,
                    value: String(script_list_obj[s as script_list_type])
                  }))
                ]}
                value={String(baseWordScriptId)}
                onValueChange={(v) => {
                  if (!v) return;
                  setBaseWordScriptId(Number(v));
                }}
              >
                <SelectTrigger id="add-lesson-base-script" className="w-full">
                  <SelectValue placeholder="Script" />
                </SelectTrigger>
                <SelectContent>
                  {FONT_SCRIPTS.map((s) => (
                    <SelectItem key={s} value={String(script_list_obj[s as script_list_type])}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="add-lesson-text">Lesson text</Label>
              <Input
                id="add-lesson-text"
                value={text}
                onChange={(e) => setText(e.target.value)}
                onBeforeInput={(e) =>
                  handleTypingBeforeInputEvent(textCtx, e, (newValue) => setText(newValue))
                }
                onBlur={() => textCtx.clearContext()}
                onKeyDown={(e) => clearTypingContextOnKeyDown(e, textCtx)}
                placeholder="Enter lesson text"
              />
              <p className="text-xs text-muted-foreground">
                Typing uses {langName}; words will use {scriptName}.
              </p>
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
              Create lesson “{text.trim()}” and open the editor?
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
