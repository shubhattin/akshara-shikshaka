'use client';

import { atom, useAtomValue, useAtom } from 'jotai';
import { useHydrateAtoms } from 'jotai/utils';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { FiSave } from 'react-icons/fi';
import { IoMdAdd } from 'react-icons/io';
import { MdDeleteOutline } from 'react-icons/md';
import { toast } from 'sonner';
import { client_q } from '~/api/client';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTrigger,
  AlertDialogTitle,
  AlertDialogAction
} from '~/components/ui/alert-dialog';
import { Button } from '~/components/ui/button';
import { Input } from '~/components/ui/input';
import { Label } from '~/components/ui/label';
import { Skeleton } from '~/components/ui/skeleton';
import { cn } from '~/lib/utils';
import { FONT_SCRIPTS } from '~/state/font_list';
import {
  lang_list_obj,
  LANG_LIST,
  lang_list_type,
  get_lang_from_id,
  script_list_obj,
  script_list_type,
  get_script_from_id
} from '~/state/lang_list';
import {
  lekhika_typing_tool,
  lipi_parivartak,
  load_parivartak_lang_data
} from '~/tools/lipi_lekhika';
import type { InferSelectModel, InferInsertModel } from 'drizzle-orm';
import type { text_lesson_words, text_lessons } from '~/db/schema';

type text_lesson_info_type = Omit<
  InferInsertModel<typeof text_lessons>,
  'created_at' | 'updated_at'
>;
type text_lesson_word_type = Omit<
  InferInsertModel<typeof text_lesson_words>,
  'created_at' | 'updated_at' | 'text_lesson_id'
>;

type Props =
  | {
      location: 'add';
      text_lesson_info: text_lesson_info_type;
      gesture_ids: number[]; // []
      words: text_lesson_word_type[]; // []
    }
  | {
      location: 'edit';
      text_lesson_info: text_lesson_info_type & {
        id: number;
        uuid: string;
      };
      gesture_ids: number[];
      words: text_lesson_word_type[];
    };

const lang_id_atom = atom<number>(0);
const base_word_script_id_atom = atom<number>(0);
const audio_id_optional_atom = atom<number | null | undefined>(undefined);
const text_atom = atom<string>('');
const gesture_ids_atom = atom<Set<number>>(new Set<number>([]));
const words_atom = atom<text_lesson_word_type[]>([]);

export default function TextLessonAddEditComponent(props: Props) {
  useHydrateAtoms([
    [lang_id_atom, props.text_lesson_info.lang_id],
    [base_word_script_id_atom, props.text_lesson_info.base_word_script_id],
    [audio_id_optional_atom, props.text_lesson_info.audio_id],
    [text_atom, props.text_lesson_info.text],
    [gesture_ids_atom, new Set(props.gesture_ids)],
    [words_atom, props.words]
  ]);

  return (
    <div className="gap-4">
      <LessonInfo {...props} />
      {props.location === 'edit' && <LessonWords {...props} />}
    </div>
  );
}

const LessonInfo = (props: Props) => {
  const [lang_id, setLangId] = useAtom(lang_id_atom);
  const [base_word_script_id, setBaseWordScriptId] = useAtom(base_word_script_id_atom);
  const [gesture_ids, setGestureIds] = useAtom(gesture_ids_atom);
  const [text, setText] = useAtom(text_atom);

  const [textKey, setTextKey] = useState<string | null>(null);

  useEffect(() => {
    if (text.trim().length === 0) {
      setTextKey(null);
      return;
    }
    // setTextKey(await lipi_parivartak(text, base_word_script_id, lang_id));
    lipi_parivartak(text, get_lang_from_id(lang_id), 'Normal').then((textKey) => {
      setTextKey(textKey);
    });
  }, [text, lang_id]);

  useEffect(() => {
    // load lipi lekhika for typing tool
    load_parivartak_lang_data(get_lang_from_id(lang_id));
  }, [lang_id]);

  const searched_gestures_q = client_q.text_lessons.get_gestures_from_text_key.useQuery(
    {
      text_key: textKey!
    },
    {
      enabled: !!textKey
    }
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-8">
        <Label className="flex items-center gap-2">
          <span className="font-semibold">Language</span>
          {props.location === 'add' && (
            <select
              value={lang_id}
              onChange={(e) => setLangId(Number(e.target.value))}
              className={cn(
                'w-32 rounded-md border border-input bg-background px-2 py-1 text-sm shadow-sm transition-colors',
                'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none',
                'disabled:cursor-not-allowed disabled:opacity-50',
                'text-foreground',
                'dark:border-border dark:bg-background dark:text-foreground'
              )}
            >
              {LANG_LIST.map((lang) => (
                <option key={lang} value={lang_list_obj[lang as lang_list_type]}>
                  {lang}
                </option>
              ))}
            </select>
          )}
          {props.location === 'edit' && (
            <span className="font-bold underline">{get_lang_from_id(lang_id)}</span>
          )}
        </Label>
        <Label className="flex items-center gap-2">
          <span className="font-semibold">Base Word Script</span>
          {props.location === 'add' && (
            <select
              value={base_word_script_id}
              onChange={(e) => setBaseWordScriptId(Number(e.target.value))}
              className={cn(
                'w-32 rounded-md border border-input bg-background px-2 py-1 text-sm shadow-sm transition-colors',
                'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none',
                'disabled:cursor-not-allowed disabled:opacity-50',
                'text-foreground',
                'dark:border-border dark:bg-background dark:text-foreground'
              )}
            >
              {FONT_SCRIPTS.map((script) => (
                <option key={script} value={script_list_obj[script as script_list_type]}>
                  {script}
                </option>
              ))}
            </select>
          )}
          {props.location === 'edit' && (
            <span className="font-bold underline">{get_script_from_id(base_word_script_id)}</span>
          )}
        </Label>
      </div>
      <div className="flex items-center">
        <Label className="flex items-center gap-2">
          <span className="text-base font-semibold">Varna</span>
          {props.location === 'add' && (
            <Input
              value={text}
              onInput={(e) => {
                setText(e.currentTarget.value);
                setGestureIds(new Set([]));
                lekhika_typing_tool(
                  e.nativeEvent.target,
                  // @ts-ignore
                  e.nativeEvent.data,
                  get_lang_from_id(lang_id),
                  true,
                  // @ts-ignore
                  (val) => {
                    setText(val);
                    setGestureIds(new Set([]));
                  }
                );
              }}
              className="w-32"
            />
          )}
          {props.location === 'edit' && <span className="text-base font-bold">{text}</span>}
        </Label>
      </div>

      <div className="space-y-3">
        {searched_gestures_q.isLoading && <Skeleton className="h-32 w-full" />}
        {searched_gestures_q.isSuccess && !searched_gestures_q.isLoading && (
          <div className="space-y-3">
            <div className="grid max-h-52 grid-cols-4 gap-2 overflow-y-scroll rounded-md border border-gray-200 bg-gray-50/50 p-3 sm:grid-cols-6 lg:grid-cols-8 dark:border-gray-700 dark:bg-gray-800/50">
              {searched_gestures_q.data.length > 0 ? (
                searched_gestures_q.data.map((gesture) => (
                  <button
                    key={gesture.id}
                    className={cn(
                      'rounded-md border px-4 py-3 text-center text-base font-semibold transition-all duration-200 ease-in-out outline-none',
                      gesture_ids.has(gesture.id)
                        ? 'border-blue-500 bg-blue-100 text-blue-900 shadow-md dark:border-blue-500 dark:bg-blue-900/30 dark:text-blue-100'
                        : 'border-gray-200 bg-white text-gray-700 hover:border-blue-300 hover:bg-blue-50 hover:shadow-md focus:ring-2 focus:ring-blue-500/50 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 dark:hover:border-blue-400 dark:hover:bg-blue-900/20'
                    )}
                    disabled={searched_gestures_q.isLoading}
                    onClick={() => {
                      const newGestureIds = new Set(gesture_ids);
                      if (gesture_ids.has(gesture.id)) newGestureIds.delete(gesture.id);
                      else newGestureIds.add(gesture.id);
                      setGestureIds(newGestureIds);
                    }}
                  >
                    {gesture.text}
                  </button>
                ))
              ) : (
                <div className="flex items-center justify-center">
                  {!searched_gestures_q.isFetching ? (
                    <p className="text-sm text-gray-500">No gestures found</p>
                  ) : (
                    <p className="text-sm text-gray-500">Loading...</p>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      <LessonInfoSave {...props} />
    </div>
  );
};

const LessonInfoSave = (props: Props) => {
  const router = useRouter();
  const text = useAtomValue(text_atom);
  const lang_id = useAtomValue(lang_id_atom);
  const base_word_script_id = useAtomValue(base_word_script_id_atom);
  const gesture_ids = useAtomValue(gesture_ids_atom);

  const add_text_data_mut = client_q.text_lessons.add_text_lesson.useMutation({
    onSuccess(data) {
      toast.success('Text Lesson Added');
      router.push(`/lessons/edit/${data.id}`);
    },
    onError(error) {
      toast.error('Failed to Add Text Lesson');
    }
  });

  const update_text_data_mut = client_q.text_lessons.update_text_lesson.useMutation({
    onSuccess(data) {
      toast.success('Text Lesson Information Updated');
    }
  });

  const delete_text_data_mut = client_q.text_lessons.delete_text_lesson.useMutation({
    onSuccess(data) {
      toast.success('Text Lesson Deleted');
      router.push('/lessons/list');
    },
    onError(error) {
      toast.error('Failed to delete text');
    }
  });

  const handleSave = () => {
    if (props.location === 'add') {
      add_text_data_mut.mutate({
        lesson_info: {
          text: text,
          lang_id: lang_id,
          base_word_script_id: base_word_script_id,
          audio_id: null
        },
        gesture_ids: Array.from(gesture_ids)
      });
    } else {
      update_text_data_mut.mutate({
        lesson_info: {
          id: props.text_lesson_info.id!,
          uuid: props.text_lesson_info.uuid!,
          text: text,
          // lang_id: lang_id,
          // base_word_script_id: base_word_script_id,
          audio_id: null
        },
        gesture_ids: Array.from(gesture_ids)
      });
    }
  };

  const handleDelete = () => {
    if (props.location !== 'add') {
      delete_text_data_mut.mutate({
        id: props.text_lesson_info.id!,
        uuid: props.text_lesson_info.uuid!
      });
    }
  };

  return (
    <div className="mt-2 flex items-center justify-between">
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button
            disabled={add_text_data_mut.isPending || update_text_data_mut.isPending}
            className="flex text-lg"
            variant={'blue'}
          >
            {props.location === 'add' ? (
              <>
                <IoMdAdd className="text-lg" />{' '}
                {!add_text_data_mut.isPending ? 'Add Lesson Info' : 'Adding...'}
              </>
            ) : (
              <>
                <FiSave className="text-lg" />{' '}
                {!update_text_data_mut.isPending ? 'Save Lesson Info' : 'Saving...'}
              </>
            )}
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Sure to Save</AlertDialogTitle>
            <AlertDialogDescription>
              {props.location === 'add'
                ? 'Are you sure to Add this Text Lesson ?'
                : 'Are you sure to Save this Text Lesson ?'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleSave}>Save</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {props.location !== 'add' && (
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button className="flex gap-1 px-1 py-0 text-sm" variant="destructive">
              <MdDeleteOutline className="text-base" />
              Delete Text Lesson
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Sure to Delete</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure to Delete this Text Lesson ?
              </AlertDialogDescription>
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

const LessonWords = (props: Props) => {
  const [lang_id, setLangId] = useAtom(lang_id_atom);
  const [base_word_script_id, setBaseWordScriptId] = useAtom(base_word_script_id_atom);
  const [audio_id, setAudioId] = useAtom(audio_id_optional_atom);
  const [text, setText] = useAtom(text_atom);
  return <div></div>;
};
