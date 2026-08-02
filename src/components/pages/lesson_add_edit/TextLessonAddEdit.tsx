'use client';
import { useAtomValue, useAtom } from 'jotai';
import { useHydrateAtoms } from 'jotai/utils';
import { useEffect, useMemo, useRef, useState } from 'react';
import { IoMdAdd } from 'react-icons/io';
import { MdClose, MdDeleteOutline, MdDragHandle, MdEdit } from 'react-icons/md';
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
import { Button } from '~/components/ui/button';
import { buttonVariants } from '~/components/ui/button';
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
import { get_lang_from_id, get_script_from_id } from '~/state/lang_list';
import { preloadScriptData } from 'lipilekhika';
import {
  createTypingContext,
  clearTypingContextOnKeyDown,
  handleTypingBeforeInputEvent
} from 'lipilekhika/typing';
import {
  audio_id_optional_atom,
  base_word_script_id_atom,
  lang_id_atom,
  text_atom,
  text_key_atom,
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
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from '~/components/ui/dialog';
import { RadioGroup, RadioGroupItem } from '~/components/ui/radio-group';
import ImageSelect from './ImageSelect';
import AudioSelect from './AudioSelect';
import { MdPlayArrow, MdStop } from 'react-icons/md';

import { useQuery } from '@tanstack/react-query';
import { useMutation } from '@tanstack/react-query';
import { AiOutlineAudio } from 'react-icons/ai';
import { Link, useNavigate } from '@tanstack/react-router';
import {
  EditorHistoryProvider,
  useEditorHistoryActions,
  useHistoryTextField
} from '~/hooks/useEditorHistory';
import { EditorActionDock } from '~/components/editor/EditorActionDock';

type gestures_list_type = {
  id: number;
  text: string;
  script_id: number;
};

type CategoryInfo = {
  id: number;
  name: string;
} | null;

type Props = {
  text_lesson_info: text_lesson_info_type;
  gestures_list: gestures_list_type[];
  words: text_lesson_word_type[];
};

const LESSON_HISTORY_ATOMS = {
  lang_id: lang_id_atom,
  base_word_script_id: base_word_script_id_atom,
  text: text_atom,
  text_key: text_key_atom,
  audio_id: audio_id_optional_atom,
  words: words_atom
};

function lessonHistoryComparable(snapshot: {
  lang_id: number;
  base_word_script_id: number;
  text: string;
  text_key: string | null;
  audio_id: number | null | undefined;
  words: text_lesson_word_type[];
}) {
  return {
    lang_id: snapshot.lang_id,
    base_word_script_id: snapshot.base_word_script_id,
    text: snapshot.text,
    text_key: snapshot.text_key,
    audio_id: snapshot.audio_id ?? null,
    words: snapshot.words.map(({ id: _id, ...rest }) => rest)
  };
}

export default function TextLessonAddEditComponent(props: Props) {
  useHydrateAtoms([
    [lang_id_atom, props.text_lesson_info.lang_id],
    [base_word_script_id_atom, props.text_lesson_info.base_word_script_id],
    [audio_id_optional_atom, props.text_lesson_info.audio_id],
    [text_atom, props.text_lesson_info.text],
    [text_key_atom, props.text_lesson_info.text_key],
    [words_atom, props.words]
  ]);

  const [category, setCategory] = useState<CategoryInfo>(props.text_lesson_info.category ?? null);

  return (
    <EditorHistoryProvider atoms={LESSON_HISTORY_ATOMS} comparable={lessonHistoryComparable}>
      <div className="space-y-6">
        <LessonInfo
          text_lesson_info={props.text_lesson_info}
          gestures_list={props.gestures_list}
          category={category}
          onCategoryChanged={setCategory}
        />
        <LessonWords lesson_id={props.text_lesson_info.id} />
        <SaveEditMode text_lesson_info={props.text_lesson_info} category={category} />
      </div>
    </EditorHistoryProvider>
  );
}

const LessonInfo = ({
  text_lesson_info,
  gestures_list,
  category,
  onCategoryChanged
}: {
  text_lesson_info: Props['text_lesson_info'];
  gestures_list: gestures_list_type[];
  category: CategoryInfo;
  onCategoryChanged: (category: CategoryInfo) => void;
}) => {
  const lang_id = useAtomValue(lang_id_atom);
  const base_word_script_id = useAtomValue(base_word_script_id_atom);
  const text = useAtomValue(text_atom);

  useEffect(() => {
    preloadScriptData(get_lang_from_id(lang_id));
    preloadScriptData(get_script_from_id(base_word_script_id));
  }, [lang_id, base_word_script_id]);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-8">
        <Label className="flex items-center gap-2">
          <span className="font-semibold">Language</span>
          <span className="font-bold underline">{get_lang_from_id(lang_id)}</span>
        </Label>
        <Label className="flex items-center gap-2">
          <span className="font-semibold">Category</span>
          <span className="font-bold underline">{category?.name ?? 'Uncategorized'}</span>
          <CategoryChangeButton
            text_lesson_info={text_lesson_info}
            category={category}
            onCategoryChanged={onCategoryChanged}
          />
        </Label>
        <Label className="flex items-center gap-2">
          <span className="font-semibold">Base Word Script</span>
          <span className="font-bold underline">{get_script_from_id(base_word_script_id)}</span>
        </Label>
      </div>
      <div className="flex items-center gap-4">
        <Label className="flex items-center gap-2">
          <span className="text-base font-semibold">Varna</span>
          <span className="text-base font-bold">{text}</span>
        </Label>
        <OptionalAudioSection lesson_id={text_lesson_info.id} text={text} />
      </div>
      <div className="space-y-3 select-none">
        <div className="grid max-h-52 grid-cols-4 gap-2 overflow-y-scroll rounded-md border border-gray-200 bg-gray-50/50 p-3 sm:grid-cols-6 lg:grid-cols-8 dark:border-gray-700 dark:bg-gray-800/50">
          {gestures_list.length > 0 ? (
            gestures_list.map((gesture) => (
              <Link
                target="_blank"
                to={`/gestures/edit/${gesture.id}` as never}
                key={gesture.id}
                className={cn(
                  'rounded-md border px-2 py-1 text-center text-base font-semibold transition-all duration-200 ease-in-out outline-none',
                  'hover:bg-gray-100 hover:text-blue-500 dark:hover:bg-gray-700 dark:hover:text-blue-400'
                )}
              >
                {gesture.text}
              </Link>
            ))
          ) : (
            <div className="flex items-center justify-center">
              <p className="text-sm text-gray-500">No connected gestures found</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

type OptionalAudioSectionProps = {
  lesson_id: number;
  text: string;
};

const OptionalAudioSection = ({ lesson_id, text }: OptionalAudioSectionProps) => {
  const trpc = useTRPC();
  const [, setAudioIdOptional] = useAtom(audio_id_optional_atom);
  const [audioDialogOpen, setAudioDialogOpen] = useState(false);
  const [playingId, setPlayingId] = useState<number | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [toSaveAudioInfo, setToSaveAudioInfo] = useState<audio_type | null>(null);
  const [deleteAudioInfoStatus, setDeleteAudioInfoStatus] = useState(false);

  const get_text_lesson_optional_audio_data_q = useQuery(
    trpc.text_lessons.get_text_lesson_optional_audio_data.queryOptions({
      lesson_id
    })
  );

  const audio_asset = !deleteAudioInfoStatus
    ? (toSaveAudioInfo ?? get_text_lesson_optional_audio_data_q.data?.audio_asset)
    : null;

  const onAudioSelect = (audio: audio_type) => {
    setDeleteAudioInfoStatus(false);
    setAudioIdOptional(audio.id!);
    setToSaveAudioInfo(audio);
    setAudioDialogOpen(false);
  };

  const onRemoveAudio = () => {
    setAudioIdOptional(null);
    setDeleteAudioInfoStatus(true);
  };

  const togglePlay = () => {
    const asset = audio_asset;
    if (!asset) return;
    if (playingId === asset.id) {
      if (audioRef.current) audioRef.current.pause();
      setPlayingId(null);
      return;
    }
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    const audio = new Audio(`${import.meta.env.VITE_AWS_CLOUDFRONT_URL}/${asset.s3_key}`);
    audioRef.current = audio as any;
    audio.onended = () => setPlayingId(null);
    audio.play();
    setPlayingId(asset.id);
  };

  return (
    <div className="flex items-center gap-2">
      {get_text_lesson_optional_audio_data_q.isLoading && <Skeleton className="h-9 w-24" />}

      {!audio_asset &&
        text.trim().length > 0 &&
        !get_text_lesson_optional_audio_data_q.isLoading && (
          <Dialog open={audioDialogOpen} onOpenChange={setAudioDialogOpen}>
            <DialogTrigger className={cn(buttonVariants({ variant: 'outline' }), 'gap-2')}>
              <AiOutlineAudio className="size-6 text-emerald-400" />
              Add Audio
            </DialogTrigger>
            <DialogContent className="h-[70vh] w-full overflow-y-scroll px-3 py-2 outline-hidden sm:max-w-4xl lg:max-w-6xl">
              <DialogHeader className="sr-only">
                <DialogTitle>Add Audio</DialogTitle>
              </DialogHeader>
              <AudioSelect text={text} onAudioSelect={onAudioSelect} type="varna" />
            </DialogContent>
          </Dialog>
        )}

      {audio_asset && text.trim().length > 0 && (
        <div className="flex items-center gap-2">
          <Button size="sm" variant="secondary" className="h-7 px-2 text-xs" onClick={togglePlay}>
            {playingId === audio_asset.id ? (
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
  );
};

const LessonWords = ({ lesson_id }: { lesson_id: number }) => {
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
                  lesson_id={lesson_id}
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
              <Input value={w.word} readOnly className="w-32" />
              <Button size="sm" variant="ghost" className="h-6 w-6 p-0" disabled>
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
  const wordHistory = useHistoryTextField();
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
    setDeleteImageInfoStatus(true);
  };

  const onRemoveAudio = () => {
    setWords((prev) =>
      prev.map((w) => (w.order === wordItem.order ? { ...w, audio_id: null } : w))
    );
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
    const audio = new Audio(`${import.meta.env.VITE_AWS_CLOUDFRONT_URL}/${asset.s3_key}`);
    audioRef.current = audio as any;
    audio.onended = () => setPlayingId(null);
    audio.play();
    setPlayingId(wordItem.order);
  };

  const ctx = useMemo(
    () => createTypingContext(get_script_from_id(base_word_script_id)),
    [base_word_script_id]
  );
  useEffect(() => {
    void ctx.ready;
  }, [ctx]);

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
        onFocus={wordHistory.onFocus}
        onChange={(e) => onChange(wordItem.order, e.target.value)}
        onBeforeInput={(e) =>
          handleTypingBeforeInputEvent(ctx, e, (newValue) => onChange(wordItem.order, newValue))
        }
        onBlur={() => {
          wordHistory.onBlur();
          ctx.clearContext();
        }}
        onKeyDown={(e) => clearTypingContextOnKeyDown(e, ctx)}
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
        {get_text_lesson_word_media_data_q.isLoading && (
          <div className="flex items-center gap-2">
            <Skeleton className="h-14 w-14 rounded" />
          </div>
        )}

        {!image_asset &&
          wordItem.word.trim().length > 0 &&
          !get_text_lesson_word_media_data_q.isLoading && (
            <Dialog open={imageDialogOpen} onOpenChange={setImageDialogOpen}>
              <DialogTrigger className={cn(buttonVariants({ variant: 'outline' }), 'gap-2')}>
                <RiImageAddLine className="size-6 text-sky-500 dark:text-sky-400" /> Add Image
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
                src={`${import.meta.env.VITE_AWS_CLOUDFRONT_URL}/${image_asset.s3_key}`}
                alt={image_asset.description}
                title={image_asset.description}
                className="size-14"
              />
              <button
                onClick={onRemoveImage}
                className="rounded-full p-1 hover:bg-gray-100 focus:ring-2 focus:ring-blue-500/50 dark:hover:bg-gray-800"
              >
                <MdClose className="size-4" />
              </button>
            </div>
            <Dialog open={imageViewDialogOpen} onOpenChange={setImageViewDialogOpen}>
              <DialogContent className="flex items-center justify-center px-8 py-6">
                <div className="sr-only">
                  <DialogTitle>View Image</DialogTitle>
                </div>
                <div className="flex flex-col items-center justify-center space-y-4">
                  <span className="text-sm font-semibold text-muted-foreground">
                    {image_asset.description}
                  </span>

                  <img
                    src={`${import.meta.env.VITE_AWS_CLOUDFRONT_URL}/${image_asset.s3_key}`}
                    alt={image_asset.description}
                    style={{ height: '256px', width: '256px' }}
                  />
                </div>
              </DialogContent>
            </Dialog>
          </>
        )}
        {!audio_asset &&
          wordItem.word.trim().length > 0 &&
          !get_text_lesson_word_media_data_q.isLoading && (
            <Dialog open={audioDialogOpen} onOpenChange={setAudioDialogOpen}>
              <DialogTrigger className={cn(buttonVariants({ variant: 'outline' }), 'gap-2')}>
                <AiOutlineAudio className="size-6 text-emerald-400" />
                Add Audio
              </DialogTrigger>
              <DialogContent className="h-[70vh] w-full overflow-y-scroll px-3 py-2 outline-hidden sm:max-w-4xl lg:max-w-6xl">
                <DialogHeader className="sr-only">
                  <DialogTitle>Add Audio</DialogTitle>
                </DialogHeader>
                <AudioSelect text={wordItem.word} onAudioSelect={onAudioSelect} type="word" />
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

const CategoryChangeButton = ({
  text_lesson_info,
  category,
  onCategoryChanged
}: {
  text_lesson_info: Props['text_lesson_info'];
  category: CategoryInfo;
  onCategoryChanged: (category: CategoryInfo) => void;
}) => {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const lang_id = useAtomValue(lang_id_atom);
  const [open, setOpen] = useState(false);
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | null>(category?.id ?? 0);

  const categories_q = useQuery(
    trpc.text_lessons.categories.get_categories.queryOptions({ lang_id })
  );
  const categories = [{ id: 0, name: 'Uncategorized', order: 0 }, ...(categories_q.data ?? [])];

  const update_category_mut = useMutation(
    trpc.text_lessons.categories.add_update_lesson_category.mutationOptions({
      onError() {
        toast.error('Failed to update category');
      }
    })
  );

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (next) {
      setSelectedCategoryId(category?.id ?? 0);
    }
  };

  const handleConfirm = async () => {
    if (selectedCategoryId === null) return;
    const nextCategoryId = selectedCategoryId === 0 ? null : selectedCategoryId;
    const prevCategoryId = category?.id;
    if (nextCategoryId === (prevCategoryId ?? null)) {
      setOpen(false);
      return;
    }

    try {
      await update_category_mut.mutateAsync({
        lesson_id: text_lesson_info.id,
        category_id: nextCategoryId,
        prev_category_id: prevCategoryId
      });

      const nextCategory =
        nextCategoryId === null ? null : (categories.find((c) => c.id === nextCategoryId) ?? null);
      onCategoryChanged(nextCategory ? { id: nextCategory.id, name: nextCategory.name } : null);

      const prevId = prevCategoryId ?? 0;
      const nextId = nextCategoryId ?? 0;
      await Promise.all([
        queryClient.invalidateQueries(
          trpc.text_lessons.categories.get_text_lessons.queryFilter({
            category_id: prevId,
            lang_id
          })
        ),
        queryClient.invalidateQueries(
          trpc.text_lessons.categories.get_text_lessons.queryFilter({
            category_id: nextId,
            lang_id
          })
        )
      ]);

      toast.success('Category updated');
      setOpen(false);
    } catch {
      // Mutation failures already toast via onError; cover invalidate errors.
      if (!update_category_mut.isError) {
        toast.error('Failed to update category');
      }
    }
  };

  return (
    <>
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="h-7 gap-1 px-2 text-xs"
        onClick={() => handleOpenChange(true)}
      >
        <MdEdit className="size-3.5" />
        Change
      </Button>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change Category</DialogTitle>
            <DialogDescription>Choose a category for this lesson.</DialogDescription>
          </DialogHeader>
          <RadioGroup
            value={selectedCategoryId?.toString() ?? ''}
            onValueChange={(v) => setSelectedCategoryId(Number(v))}
            className="flex flex-col gap-2"
          >
            {categories.map((cat) => (
              <div key={cat.id} className="flex items-center gap-2">
                <RadioGroupItem id={`lesson-edit-cat-${cat.id}`} value={String(cat.id)} />
                <Label
                  htmlFor={`lesson-edit-cat-${cat.id}`}
                  className={cn(cat.id === 0 && 'text-muted-foreground')}
                >
                  {cat.name}
                </Label>
              </div>
            ))}
          </RadioGroup>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => void handleConfirm()}
              disabled={
                selectedCategoryId === null ||
                update_category_mut.isPending ||
                selectedCategoryId === (category?.id ?? 0)
              }
            >
              {update_category_mut.isPending ? 'Updating…' : 'Confirm'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

const SaveEditMode = ({
  text_lesson_info,
  category
}: {
  text_lesson_info: Props['text_lesson_info'];
  category: CategoryInfo;
}) => {
  const trpc = useTRPC();
  const navigate = useNavigate();
  const { beginSave, markSaved } = useEditorHistoryActions();
  const lang_id = useAtomValue(lang_id_atom);
  const [words, setWords] = useAtom(words_atom);
  const audio_id_optional = useAtomValue(audio_id_optional_atom);
  const queryClient = useQueryClient();

  const update_text_data_mut = useMutation(
    trpc.text_lessons.update_text_lesson.mutationOptions({
      onError(error) {
        toast.error('Failed to Update Text Lesson ' + error.message);
      }
    })
  );

  const delete_text_data_mut = useMutation(
    trpc.text_lessons.delete_text_lesson.mutationOptions({
      async onSuccess(data) {
        if (!data.deleted) return;
        toast.success('Text Lesson Deleted');
        await queryClient.invalidateQueries(
          trpc.text_lessons.categories.get_text_lessons.queryFilter({
            category_id: category?.id ?? 0,
            lang_id
          })
        );
        navigate({ to: '/lessons' } as never);
      },
      onError(_error) {
        toast.error('Failed to delete text');
      }
    })
  );

  const handleSave = () => {
    beginSave();
    const submittedWords = words;
    update_text_data_mut.mutate(
      {
        lesson_info: {
          id: text_lesson_info.id,
          uuid: text_lesson_info.uuid,
          audio_id: audio_id_optional ?? null
        },
        words: submittedWords
      },
      {
        onSuccess: (data) => {
          if (!data.updated) return;

          const to_be_added_word_indexes = submittedWords
            .map((w, idx) => [w, idx] as [text_lesson_word_type, number])
            .filter(([w]) => w.id === undefined || w.id === null)
            .map(([_w, idx]) => idx);

          if (to_be_added_word_indexes.length !== data.inserted_words_ids.length) {
            toast.error('Failed to Add Text Lesson');
            return;
          }

          if (to_be_added_word_indexes.length === 0) {
            markSaved();
            toast.success('Text Lesson Information Updated');
            return;
          }

          const insertedIdByIndex = new Map(
            to_be_added_word_indexes.map((idx, i) => [idx, data.inserted_words_ids[i]!])
          );

          let mergedWords = submittedWords.map((w, idx) => {
            const insertedId = insertedIdByIndex.get(idx);
            return insertedId !== undefined ? { ...w, id: insertedId } : w;
          });

          setWords((prev) => {
            if (prev.length === submittedWords.length) {
              mergedWords = prev.map((w, idx) => {
                const insertedId = insertedIdByIndex.get(idx);
                return insertedId !== undefined ? { ...w, id: insertedId } : w;
              });
              return mergedWords;
            }

            const idByOrder = new Map(
              mergedWords.filter((w) => w.id != null).map((w) => [w.order, w.id as number])
            );
            mergedWords = prev.map((w) => {
              if (w.id != null) return w;
              const insertedId = idByOrder.get(w.order);
              return insertedId !== undefined ? { ...w, id: insertedId } : w;
            });
            return mergedWords;
          });

          markSaved({ words: mergedWords });
          toast.success('Text Lesson Information Updated');
        }
      }
    );
  };

  const handleDelete = () => {
    if (delete_text_data_mut.isPending) {
      toast.error('Please wait for the text lesson to be deleted');
      return;
    }
    delete_text_data_mut.mutate({
      id: text_lesson_info.id,
      uuid: text_lesson_info.uuid
    });
  };

  return (
    <>
      <EditorActionDock onSave={handleSave} isSaving={update_text_data_mut.isPending} />
      <div className="mx-2 mt-2 flex items-center justify-end sm:mx-4">
        <AlertDialog>
          <AlertDialogTrigger
            className={cn(
              buttonVariants({ variant: 'destructive' }),
              'flex gap-1 px-1 py-0 text-sm'
            )}
          >
            <MdDeleteOutline className="text-base" />
            Delete Text Lesson
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
      </div>
    </>
  );
};
