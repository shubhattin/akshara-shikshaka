'use client';
import { useAtomValue, useAtom } from 'jotai';
import { useHydrateAtoms } from 'jotai/utils';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { FiSave } from 'react-icons/fi';
import { IoMdAdd } from 'react-icons/io';
import { MdClose, MdDeleteOutline, MdDragHandle } from 'react-icons/md';
import { RiImageAddLine } from 'react-icons/ri';
import { toast } from 'sonner';
import { useTRPC } from '~/api/client';
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
import { VisuallyHidden } from '@radix-ui/react-visually-hidden';
import { Button } from '~/components/ui/button';
import { Input } from '~/components/ui/input';
import { Label } from '~/components/ui/label';
import { Skeleton } from '~/components/ui/skeleton';
import { cn } from '~/lib/utils';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy
} from '@dnd-kit/sortable';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
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
import {
  audio_id_optional_atom,
  base_word_script_id_atom,
  gesture_ids_atom,
  lang_id_atom,
  text_atom,
  words_atom,
  type audio_type,
  type image_type,
  type text_lesson_info_type,
  type text_lesson_word_type
} from './lesson_add_edit_state';
import { useQueryClient } from '@tanstack/react-query';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTrigger,
  DialogTitle
} from '~/components/ui/dialog';
import ImageSelect from './ImageSelect';
import AudioSelect from './AudioSelect';
import { MdPlayArrow, MdStop } from 'react-icons/md';

import { useQuery } from '@tanstack/react-query';
import { useMutation } from '@tanstack/react-query';
import { AiOutlineAudio } from 'react-icons/ai';

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
    <div className="space-y-6">
      <LessonInfo {...props} />
      <LessonWords {...props} />
      <AddEditSave {...props} />
    </div>
  );
}

const LessonInfo = (props: Props) => {
  const trpc = useTRPC();
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
    // load lipi lekhika language/script data for typing tool
    load_parivartak_lang_data(get_lang_from_id(lang_id));
    load_parivartak_lang_data(get_script_from_id(base_word_script_id));
  }, [lang_id, base_word_script_id]);

  const searched_gestures_q = useQuery(
    trpc.text_lessons.get_gestures_from_text_key.queryOptions(
      {
        text_key: textKey!
      },
      {
        enabled: !!textKey
      }
    )
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
    </div>
  );
};

const LessonWords = (props: Props) => {
  const [words, setWords] = useAtom(words_atom);
  const [isClient, setIsClient] = useState(false);
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  useEffect(() => {
    setIsClient(true);
  }, []);

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const activeOrder = parseInt(active.id.toString(), 10);
    const overOrder = parseInt(over.id.toString(), 10);

    const fromIndex = words.findIndex((w) => w.order === activeOrder);
    const toIndex = words.findIndex((w) => w.order === overOrder);
    if (fromIndex === -1 || toIndex === -1) return;

    const reordered = arrayMove(words, fromIndex, toIndex).map((w, idx) => ({
      ...w,
      order: idx + 1
    }));
    setWords(reordered);
  };

  const handleWordChange = (order: number, value: string) => {
    setWords((prev) => prev.map((w) => (w.order === order ? { ...w, word: value } : w)));
  };

  const handleDelete = (order: number) => {
    setWords((prev) =>
      prev.filter((w) => w.order !== order).map((w, idx) => ({ ...w, order: idx + 1 }))
    );
  };

  const handleAddNew = () => {
    setWords((prev) => [
      ...prev,
      {
        word: '',
        order: prev.length + 1,
        image_id: null,
        audio_id: null
      } as text_lesson_word_type
    ]);
  };

  return (
    <div className="space-y-3">
      {isClient ? (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext
            items={words.map((w) => w.order.toString())}
            strategy={verticalListSortingStrategy}
          >
            <div className="flex flex-col gap-2">
              {words.map((w) => (
                <SortableWordItem
                  key={w.order}
                  wordItem={w}
                  onChange={handleWordChange}
                  onDelete={handleDelete}
                  lesson_id={props.text_lesson_info.id!}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      ) : (
        <div className="flex flex-col gap-2">
          {words.map((w) => (
            <div
              key={w.order}
              className={cn('w-full rounded-md px-3 py-2', 'flex items-center gap-2')}
            >
              <div className="cursor-grab rounded p-1 hover:bg-muted">
                <MdDragHandle className="h-4 w-4 text-muted-foreground" />
              </div>
              <Input
                value={w.word}
                onInput={(e) => handleWordChange(w.order, e.currentTarget.value)}
                className="w-32"
              />
              <Button
                size="sm"
                variant="ghost"
                className="h-6 w-6 p-0"
                onClick={() => handleDelete(w.order)}
              >
                <MdDeleteOutline className="h-3 w-3" />
              </Button>
            </div>
          ))}
        </div>
      )}

      <Button size="sm" variant="outline" onClick={handleAddNew}>
        <IoMdAdd className="mr-1" /> Add Word
      </Button>
    </div>
  );
};

type SortableWordItemProps = {
  wordItem: text_lesson_word_type;
  onChange: (order: number, value: string) => void;
  onDelete: (order: number) => void;
  lesson_id: number;
};

function SortableWordItem({ wordItem, onChange, onDelete, lesson_id }: SortableWordItemProps) {
  const trpc = useTRPC();
  const base_word_script_id = useAtomValue(base_word_script_id_atom);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: wordItem.order.toString()
  });

  const [, setWords] = useAtom(words_atom);
  const [audioDialogOpen, setAudioDialogOpen] = useState(false);
  const [playingId, setPlayingId] = useState<number | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1
  } as React.CSSProperties;

  const get_text_lesson_word_media_data_q = useQuery(
    trpc.text_lessons.get_text_lesson_word_media_data.queryOptions(
      {
        word_id: wordItem.id!,
        lesson_id: lesson_id
      },
      {
        enabled: !!wordItem.id && !!lesson_id
      }
    )
  );

  const [toSaveImageInfo, setToSaveImageInfo] = useState<image_type | null>(null);
  const [toSaveAudioInfo, setToSaveAudioInfo] = useState<audio_type | null>(null);
  const [deleteImageInfoStatus, setDeleteImageInfoStatus] = useState(false);
  const [deleteAudioInfoStatus, setDeleteAudioInfoStatus] = useState(false);

  const image_asset = !deleteImageInfoStatus
    ? (toSaveImageInfo ?? get_text_lesson_word_media_data_q.data?.image_asset)
    : null;
  const audio_asset = !deleteAudioInfoStatus
    ? (toSaveAudioInfo ?? get_text_lesson_word_media_data_q.data?.audio_asset)
    : null;

  const [imageDialogOpen, setImageDialogOpen] = useState(false);
  const [imageViewDialogOpen, setImageViewDialogOpen] = useState(false);

  const onImageSelect = (image: image_type) => {
    setDeleteImageInfoStatus(false);
    setWords((prev) =>
      prev.map((w) => (w.order === wordItem.order ? { ...w, image_id: image.id! } : w))
    );
    setToSaveImageInfo(image);
    setImageDialogOpen(false);
  };

  const onAudioSelect = (audio: audio_type) => {
    setWords((prev) =>
      prev.map((w) => (w.order === wordItem.order ? { ...w, audio_id: audio.id! } : w))
    );
    setToSaveAudioInfo(audio);
    setAudioDialogOpen(false);
  };

  const onRemoveImage = () => {
    setWords((prev) =>
      prev.map((w) => (w.order === wordItem.order ? { ...w, image_id: null } : w))
    );
    // setToSaveImageInfo(null);
    setDeleteImageInfoStatus(true);
  };

  const onRemoveAudio = () => {
    setWords((prev) =>
      prev.map((w) => (w.order === wordItem.order ? { ...w, audio_id: null } : w))
    );
    // setToSaveAudioInfo(null);
    setDeleteAudioInfoStatus(true);
  };

  const togglePlay = () => {
    const asset = audio_asset;
    if (!asset) return;
    if (playingId === wordItem.order) {
      if (audioRef.current) audioRef.current.pause();
      setPlayingId(null);
      return;
    }
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    const audio = new Audio(`${process.env.NEXT_PUBLIC_AWS_CLOUDFRONT_URL}/${asset.s3_key}`);
    audioRef.current = audio as any;
    audio.onended = () => setPlayingId(null);
    audio.play();
    setPlayingId(wordItem.order);
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn('w-full rounded-md px-3 py-2', 'flex items-center gap-2')}
    >
      <div {...attributes} {...listeners} className="cursor-grab rounded p-1 hover:bg-muted">
        <MdDragHandle className="h-4 w-4 text-muted-foreground" />
      </div>
      <Input
        value={wordItem.word}
        onInput={(e) => {
          onChange(wordItem.order, e.currentTarget.value);
          lekhika_typing_tool(
            e.nativeEvent.target,
            // @ts-ignore
            e.nativeEvent.data,
            get_script_from_id(base_word_script_id),
            true,
            // @ts-ignore
            (val) => {
              onChange(wordItem.order, val);
            }
          );
        }}
        // onChange={(e) => onChange(wordItem.order, e.target.value)}
        className="w-32"
      />
      <Button
        size="sm"
        variant="ghost"
        className="h-6 w-6 p-0"
        onClick={() => onDelete(wordItem.order)}
      >
        <MdDeleteOutline className="h-3 w-3" />
      </Button>
      <div className="flex items-center gap-4">
        {/* show skeleton while fetching image data */}
        {get_text_lesson_word_media_data_q.isLoading && (
          <div className="flex items-center gap-2">
            <Skeleton className="h-14 w-14 rounded" />
            <div className="flex flex-col">
              {/* <Skeleton className="h-4 w-24" /> */}
              {/* <Skeleton className="mt-1 h-4 w-20" /> */}
            </div>
          </div>
        )}

        {!image_asset &&
          wordItem.word.trim().length > 0 &&
          !get_text_lesson_word_media_data_q.isLoading && (
            <Dialog open={imageDialogOpen} onOpenChange={setImageDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" className="gap-2">
                  <RiImageAddLine className="size-6 text-sky-500 dark:text-sky-400" /> Add Image
                </Button>
              </DialogTrigger>
              <DialogContent className="h-[70vh] w-full overflow-y-scroll px-3 py-2 outline-hidden sm:max-w-4xl lg:max-w-6xl">
                <DialogHeader className="sr-only">
                  <DialogTitle>Add Image</DialogTitle>
                </DialogHeader>
                <ImageSelect wordItem={wordItem} onImageSelect={onImageSelect} />
              </DialogContent>
            </Dialog>
          )}

        {image_asset && wordItem.word.trim().length > 0 && (
          <>
            <div className="flex items-center justify-center gap-2">
              <img
                onClick={() => setImageViewDialogOpen(true)}
                src={`${process.env.NEXT_PUBLIC_AWS_CLOUDFRONT_URL}/${image_asset.s3_key}`}
                alt={image_asset.description}
                title={image_asset.description}
                className="size-14"
              />
              {/* <span className="text-sm text-muted-foreground">{image_asset.description}</span> */}
              <button
                onClick={onRemoveImage}
                className="rounded-full p-1 hover:bg-gray-100 focus:ring-2 focus:ring-blue-500/50 dark:hover:bg-gray-800"
              >
                <MdClose className="size-4" />
              </button>
            </div>
            <Dialog open={imageViewDialogOpen} onOpenChange={setImageViewDialogOpen}>
              {/* <DialogTrigger asChild className="cursor-pointer"></DialogTrigger> */}
              <DialogContent className="flex items-center justify-center px-8 py-6">
                <VisuallyHidden>
                  <DialogTitle>View Image</DialogTitle>
                </VisuallyHidden>
                <div className="flex flex-col items-center justify-center space-y-4">
                  <span className="text-sm font-semibold text-muted-foreground">
                    {image_asset.description}
                  </span>

                  <img
                    src={`${process.env.NEXT_PUBLIC_AWS_CLOUDFRONT_URL}/${image_asset.s3_key}`}
                    alt={image_asset.description}
                    style={{ height: '256px', width: '256px' }}
                  />
                </div>
              </DialogContent>
            </Dialog>
          </>
        )}
        {/* Audio selection */}
        {/* {get_text_lesson_word_media_data_q.isLoading && (
          <div className="flex items-center gap-2">
            <Skeleton className="h-6 w-24" />
          </div>
        )} */}
        {!audio_asset &&
          wordItem.word.trim().length > 0 &&
          !get_text_lesson_word_media_data_q.isLoading && (
            <Dialog open={audioDialogOpen} onOpenChange={setAudioDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" className="gap-2">
                  <AiOutlineAudio className="size-6 text-emerald-400" />
                  Add Audio
                </Button>
              </DialogTrigger>
              <DialogContent className="h-[70vh] w-full overflow-y-scroll px-3 py-2 outline-hidden sm:max-w-4xl lg:max-w-6xl">
                <DialogHeader className="sr-only">
                  <DialogTitle>Add Audio</DialogTitle>
                </DialogHeader>
                <AudioSelect wordItem={wordItem} onAudioSelect={onAudioSelect} />
              </DialogContent>
            </Dialog>
          )}
        {audio_asset && wordItem.word.trim().length > 0 && (
          <div className="flex items-center gap-2">
            <Button size="sm" variant="secondary" className="h-7 px-2 text-xs" onClick={togglePlay}>
              {playingId === wordItem.order ? (
                <span className="flex items-center gap-1">
                  <MdStop /> Stop
                </span>
              ) : (
                <span className="flex items-center gap-1">
                  <MdPlayArrow /> Play
                </span>
              )}
            </Button>
            <button
              onClick={onRemoveAudio}
              className="rounded-full p-1 hover:bg-gray-100 focus:ring-2 focus:ring-blue-500/50 dark:hover:bg-gray-800"
            >
              <MdClose className="size-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

const AddEditSave = (props: Props) => {
  const trpc = useTRPC();
  const router = useRouter();
  const text = useAtomValue(text_atom);
  const lang_id = useAtomValue(lang_id_atom);
  const base_word_script_id = useAtomValue(base_word_script_id_atom);
  const gesture_ids = useAtomValue(gesture_ids_atom);
  const [words, setWords] = useAtom(words_atom);

  const add_text_data_mut = useMutation(
    trpc.text_lessons.add_text_lesson.mutationOptions({
      onSuccess(data) {
        toast.success('Text Lesson Added');
        router.push(`/lessons/edit/${data.id}`);
      },
      onError(error) {
        toast.error('Failed to Add Text Lesson ' + error.message);
      }
    })
  );

  const update_text_data_mut = useMutation(
    trpc.text_lessons.update_text_lesson.mutationOptions({
      onSuccess(data) {
        // find indexes or words that were to be added, they will have no id
        const to_be_added_word_indexes = words
          .map((w, idx) => [w, idx] as [text_lesson_word_type, number])
          .filter(([w]) => w.id === undefined || w.id === null)
          .map(([w, idx]) => idx);

        if (to_be_added_word_indexes.length !== data.inserted_words_ids.length) {
          toast.error('Failed to Add Text Lesson');
          return;
        }

        // update the words with the added ids
        setWords((prev) =>
          prev.map((w, idx) =>
            to_be_added_word_indexes.includes(idx)
              ? { ...w, id: data.inserted_words_ids[to_be_added_word_indexes.indexOf(idx)] }
              : w
          )
        );

        toast.success('Text Lesson Information Updated');
      },
      onError(error) {
        toast.error('Failed to Update Text Lesson ' + error.message);
      }
    })
  );

  const queryClient = useQueryClient();

  const delete_text_data_mut = useMutation(
    trpc.text_lessons.delete_text_lesson.mutationOptions({
      async onSuccess(data) {
        toast.success('Text Lesson Deleted');
        await queryClient.invalidateQueries(
          trpc.text_lessons.categories.get_category_text_lessons.pathFilter()
        );
        router.push('/lessons');
      },
      onError(error) {
        toast.error('Failed to delete text');
      }
    })
  );

  const handleSave = () => {
    if (text.trim().length === 0) {
      toast.error('Text is required');
      return;
    }
    if (
      lang_id === null ||
      lang_id === undefined ||
      base_word_script_id === null ||
      base_word_script_id === undefined
    ) {
      toast.error('Language and Base Word Script are required');
      return;
    }
    if (props.location === 'add') {
      add_text_data_mut.mutate({
        lesson_info: {
          text: text,
          lang_id: lang_id,
          base_word_script_id: base_word_script_id,
          audio_id: null
        },
        gesture_ids: Array.from(gesture_ids),
        words
      });
    } else {
      update_text_data_mut.mutate({
        lesson_info: {
          id: props.text_lesson_info.id!,
          uuid: props.text_lesson_info.uuid!,
          audio_id: null
        },
        gesture_ids: Array.from(gesture_ids),
        words
      });
    }
  };

  const handleDelete = () => {
    if (delete_text_data_mut.isPending) {
      toast.error('Please wait for the text lesson to be deleted');
      return;
    }
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
