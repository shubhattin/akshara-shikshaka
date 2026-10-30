'use client';
import { getDefaultStore, useAtom, useAtomValue, useSetAtom } from 'jotai';
import { learn_admin_context_atom } from '~/state/learn_admin_context';
import {
  selected_language_id_atom,
  selected_category_id_atom,
  selected_lesson_id_atom,
  selected_script_id_atom,
  saveLearnPageCookies,
  type text_lesson_type
} from './-learn_page_state';
import {
  get_lang_from_id,
  get_script_from_id,
  lang_list_obj,
  type lang_list_type,
  script_list_obj,
  type script_list_type
} from '~/state/lang_list';
import { useQuery } from '@tanstack/react-query';
import { useTRPC } from '~/api/client';
import { useState, useEffect, useRef, useMemo } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '~/components/ui/popover';
import { Button } from '~/components/ui/button';
import { buttonVariants } from '~/components/ui/button';
import { ChevronsUpDown, LayoutGrid } from 'lucide-react';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList
} from '~/components/ui/command';
import { cn } from '~/lib/utils';
import Practice, { PracticeLoadingSkeleton } from '~/components/pages/practice/Practice';
import { Provider as JotaiProvider, createStore } from 'jotai';
import { MdArrowForward, MdRefresh, MdStop } from 'react-icons/md';
import { transliterate, preloadScriptData } from 'lipilekhika';
import { FONT_SCRIPTS, LANGUAGES_ADDED } from '~/state/font_list';
import { Skeleton } from '~/components/ui/skeleton';
import {
  type CarouselApi,
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious
} from '~/components/ui/carousel';
import { HiSpeakerWave } from 'react-icons/hi2';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from '~/components/ui/dialog';
import { motion } from 'framer-motion';
import { TiTick } from 'react-icons/ti';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '~/components/ui/select';

type Props = {
  init_lang_id: number;
  init_script_id?: number | null;
  saved_category_id?: number | null;
  saved_lesson_id?: number | null;
  init_lessons_list_transliterated?: text_lesson_type[];
  init_words_transliterated?: string[];
  init_varna_transliterated?: string | null;
};

export default function LearnPageComponent(props: Props) {
  const store = useMemo(() => {
    const s = createStore();
    s.set(selected_language_id_atom, props.init_lang_id);
    s.set(selected_script_id_atom, props.init_script_id ?? script_list_obj['Devanagari']);
    s.set(selected_category_id_atom, props.saved_category_id ?? null);
    s.set(selected_lesson_id_atom, props.saved_lesson_id ?? null);
    return s;
  }, []); // oxlint-disable-line react-hooks/exhaustive-deps -- store should only be created once on mount; props are initial values only

  const setAdminContext = useSetAtom(learn_admin_context_atom, { store: getDefaultStore() });
  useEffect(() => () => setAdminContext(null), [setAdminContext]);

  return (
    <JotaiProvider store={store} key={`learn_page`}>
      <LearnPage {...props} />
    </JotaiProvider>
  );
}

function LearnPage(props: Props) {
  const trpc = useTRPC();
  const [selectedLanguageId, setSelectedLanguageId] = useAtom(selected_language_id_atom);
  const [selectedScriptId, setSelectedScriptId] = useAtom(selected_script_id_atom);
  const [selectedCategoryId, setSelectedCategoryId] = useAtom(selected_category_id_atom);
  const [open, setOpen] = useState(false);
  const [, setSelectedLessonId] = useAtom(selected_lesson_id_atom);
  const scriptItems = useMemo(
    () => [
      { label: 'Script', value: null },
      ...FONT_SCRIPTS.map((script) => ({
        label: script,
        // SAFETY: enum lookup validated - key is from controlled enum list.
        value: String(script_list_obj[script as script_list_type])
      }))
    ],
    []
  );
  const langItems = useMemo(
    () => [
      { label: 'Language', value: null },
      ...LANGUAGES_ADDED.map((lang) => ({
        label: lang,
        // SAFETY: enum lookup validated - key is from controlled enum list.
        value: String(lang_list_obj[lang as lang_list_type])
      }))
    ],
    []
  );
  const categories_q = useQuery(
    trpc.text_lessons.categories.get_categories.queryOptions(
      { lang_id: selectedLanguageId },
      { enabled: !!selectedLanguageId }
    )
  );
  const categories = categories_q.data ?? [];

  // Always keep a category selected: the saved one if it still exists, else the first. The saved
  // cookie can be empty or stale (e.g. on a client-side navigation, where the loader does not
  // resolve a fallback like SSR does).
  useEffect(() => {
    const list = categories_q.data;
    if (!list || list.some((category) => category.id === selectedCategoryId)) return;
    const first = list[0]?.id ?? null;
    setSelectedCategoryId(first);
    saveLearnPageCookies('category_id', first);
  }, [categories_q.data, selectedCategoryId, setSelectedCategoryId]);

  const categorySelect = (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        role="combobox"
        aria-expanded={open}
        className={cn(
          buttonVariants({ variant: 'outline' }),
          'w-45 justify-between text-base font-semibold'
        )}
      >
        {selectedCategoryId !== null
          ? (categories.find((category) => category.id === selectedCategoryId)?.name ??
            'Select category...')
          : 'Select category...'}
        <ChevronsUpDown className="opacity-50" />
      </PopoverTrigger>
      <PopoverContent className="w-50 p-0">
        <Command>
          <CommandInput placeholder="Search category..." className="h-9" />
          <CommandList>
            <CommandEmpty>No category found.</CommandEmpty>
            <CommandGroup>
              {categories.map((category) => (
                <CommandItem
                  key={category.id}
                  value={category.name}
                  keywords={[category.id.toString()]}
                  data-checked={selectedCategoryId === category.id ? 'true' : undefined}
                  className="pr-8 hover:bg-accent hover:text-accent-foreground data-[checked=true]:font-medium"
                  onSelect={() => {
                    setOpen(false);
                    if (selectedCategoryId === category.id) return;
                    // the first lesson of the new category gets selected by LessonsList
                    setSelectedLessonId(null);
                    setSelectedCategoryId(category.id);
                    saveLearnPageCookies('lesson_id', null);
                    saveLearnPageCookies('category_id', category.id);
                  }}
                >
                  {category.name}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-center gap-2 space-x-12 text-sm">
        <Select
          items={scriptItems}
          value={String(selectedScriptId)}
          onValueChange={(val) => {
            if (!val) return;
            setSelectedScriptId(Number(val));
            saveLearnPageCookies('script_id', Number(val));
          }}
        >
          <SelectTrigger className="w-32 text-sm font-semibold">
            <SelectValue placeholder="Script" />
          </SelectTrigger>
          <SelectContent>
            {FONT_SCRIPTS.map((script) => (
              // SAFETY: enum lookup validated - key is from controlled enum list.
              <SelectItem key={script} value={String(script_list_obj[script as script_list_type])}>
                {script}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          items={langItems}
          value={String(selectedLanguageId)}
          onValueChange={(val) => {
            if (!val) return;
            setSelectedLanguageId(Number(val));
            setSelectedCategoryId(null);
            setSelectedLessonId(null);
            saveLearnPageCookies('category_id', null);
            saveLearnPageCookies('lesson_id', null);
          }}
        >
          <SelectTrigger className="w-28 text-sm font-semibold">
            <SelectValue placeholder="Language" />
          </SelectTrigger>
          <SelectContent>
            {LANGUAGES_ADDED.map((lang) => (
              // SAFETY: enum lookup validated - key is from controlled enum list.
              <SelectItem key={lang} value={String(lang_list_obj[lang as lang_list_type])}>
                {lang}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <LessonsList {...props} categorySelect={categorySelect} />
    </div>
  );
}

const sameLessonIds = (a: { id: number }[], b: { id: number }[]) =>
  a.length === b.length && a.every((lesson, i) => lesson.id === b[i]?.id);

// oxlint-disable-next-line complexity -- LessonsList wires lesson selection, transliteration and the carousel together
const LessonsList = (props: Props & { categorySelect: React.ReactNode }) => {
  const trpc = useTRPC();
  const selectedLanguageId = useAtomValue(selected_language_id_atom);
  const selectedScriptId = useAtomValue(selected_script_id_atom);
  const selectedCategoryId = useAtomValue(selected_category_id_atom);
  const [selectedLessonId, setSelectedLessonId] = useAtom(selected_lesson_id_atom);
  const [indexOpen, setIndexOpen] = useState(false);
  useEffect(() => {
    // preload lipi lekhika data for transliteration
    preloadScriptData(get_script_from_id(selectedScriptId));
  }, [selectedScriptId]);

  const lessons_q = useQuery(
    trpc.text_lessons.categories.get_category_text_lesson_list.queryOptions(
      { category_id: selectedCategoryId! },
      {
        enabled: selectedCategoryId !== null
      }
    )
  );
  const { data: lessonsData, isSuccess: lessonsIsSuccess } = lessons_q;

  const [lessonsTransliterated, setTransliteratedLessons] = useState<
    NonNullable<typeof lessons_q.data>
  >(props.init_lessons_list_transliterated ?? []);
  const transliterationVersion = useRef(0);

  useEffect(() => {
    if (!lessonsIsSuccess) return;
    const data = lessonsData;
    if (!data) return;
    transliterationVersion.current += 1;
    const currentVersion = transliterationVersion.current;
    transliterate(
      data.map((lesson) => lesson.text),
      get_lang_from_id(selectedLanguageId),
      get_script_from_id(selectedScriptId)
    ).then((transliterated_texts) => {
      // avoid race condition by checking if this is still the latest transliteration request
      if (currentVersion !== transliterationVersion.current) return;
      setTransliteratedLessons(
        data.map((lesson, i) => ({ ...lesson, text: transliterated_texts[i] }))
      );
    });
  }, [lessonsIsSuccess, lessonsData, selectedLanguageId, selectedScriptId]);

  // the transliterated list can still be the previous category's while the new one is prepared
  const lessons =
    lessonsData && sameLessonIds(lessonsTransliterated, lessonsData) ? lessonsTransliterated : null;

  // Always keep a lesson selected: the saved one if it is in this category, else the first
  useEffect(() => {
    if (!lessonsData || lessonsData.some((lesson) => lesson.id === selectedLessonId)) return;
    const first = lessonsData[0]?.id ?? null;
    setSelectedLessonId(first);
    saveLearnPageCookies('lesson_id', first);
  }, [lessonsData, selectedLessonId, setSelectedLessonId]);

  const selectLesson = (lesson_id: number) => {
    if (lesson_id === selectedLessonId) return;
    setSelectedLessonId(lesson_id);
    saveLearnPageCookies('lesson_id', lesson_id);
  };

  const currentIndex = lessons?.findIndex((l) => l.id === selectedLessonId) ?? -1;
  const hasNext = lessons !== null && currentIndex >= 0 && currentIndex < lessons.length - 1;
  const goToNextLesson = () => {
    if (hasNext) selectLesson(lessons[currentIndex + 1]!.id);
  };

  // bring the selected lesson into view, wherever it was selected from (restore, Next, index)
  const [carouselApi, setCarouselApi] = useState<CarouselApi | null>(null);
  useEffect(() => {
    if (!carouselApi || currentIndex < 0) return;
    const frame = requestAnimationFrame(() => {
      // slides are rendered by now; let the carousel pick them up before scrolling
      carouselApi.reInit();
      if (!carouselApi.slidesInView().includes(currentIndex)) carouselApi.scrollTo(currentIndex);
    });
    return () => cancelAnimationFrame(frame);
  }, [carouselApi, currentIndex, lessons]);

  const carouselBasicClassName_akshara = 'basis-1/2 sm:basis-1/3 md:basis-1/4';
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-center gap-2">
        {props.categorySelect}
        <AksharaIndexDialog
          open={indexOpen}
          onOpenChange={setIndexOpen}
          lessons={lessons}
          selectedLessonId={selectedLessonId}
          onSelect={(lesson_id) => {
            selectLesson(lesson_id);
            setIndexOpen(false);
          }}
        />
      </div>
      <div className="flex w-full min-w-0 flex-wrap items-center justify-center">
        <Carousel
          opts={{
            align: 'start'
          }}
          setApi={setCarouselApi}
          className="w-full max-w-[90vw] min-w-0 select-none sm:max-w-[70vw] md:max-w-[60vw]"
        >
          <CarouselContent className="">
            {lessons === null && LOADING_SKELETONS.lessons(carouselBasicClassName_akshara)}

            {lessons?.map((lesson) => (
              <CarouselItem key={lesson.id} className={carouselBasicClassName_akshara}>
                <Button
                  variant={selectedLessonId === lesson.id ? 'default' : 'outline'}
                  className={cn(
                    'w-full text-xl transition-all',
                    selectedLessonId === lesson.id
                      ? 'border border-blue-600 bg-blue-600 text-white shadow-md ring-2 ring-blue-500/20 hover:bg-blue-700 dark:border-blue-500 dark:bg-blue-500 dark:hover:bg-blue-600'
                      : 'border border-border bg-background text-foreground hover:bg-accent hover:text-accent-foreground'
                  )}
                  onClick={() => selectLesson(lesson.id)}
                >
                  {lesson.text}
                </Button>
              </CarouselItem>
            ))}
          </CarouselContent>
          <CarouselPrevious className="left-0 sm:-left-12" />
          <CarouselNext className="right-0 sm:-right-12" />
        </Carousel>
      </div>
      {selectedLessonId !== null && (
        <Lesson
          lesson_id={selectedLessonId}
          hasNext={hasNext}
          goToNextLesson={goToNextLesson}
          init_words_transliterated={
            selectedLessonId === props.saved_lesson_id ? props.init_words_transliterated : undefined
          }
          init_varna_transliterated={
            selectedLessonId === props.saved_lesson_id ? props.init_varna_transliterated : undefined
          }
        />
      )}
    </div>
  );
};

/** Every akshara of the category at once, to jump straight to one */
const AksharaIndexDialog = ({
  open,
  onOpenChange,
  lessons,
  selectedLessonId,
  onSelect
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lessons: text_lesson_type[] | null;
  selectedLessonId: number | null;
  onSelect: (lesson_id: number) => void;
}) => {
  const currentIndex = lessons?.findIndex((l) => l.id === selectedLessonId) ?? -1;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger
        render={
          <Button
            variant="outline"
            className="gap-2 font-semibold"
            disabled={!lessons || lessons.length === 0}
            aria-label="Show all aksharas"
          />
        }
      >
        <LayoutGrid />
        {lessons && currentIndex >= 0 ? (
          <span className="text-sm text-muted-foreground tabular-nums">
            {currentIndex + 1}/{lessons.length}
          </span>
        ) : null}
      </DialogTrigger>
      <DialogContent className="flex max-h-[85vh] flex-col gap-4 sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>All aksharas</DialogTitle>
          <DialogDescription>Pick one to jump straight to it.</DialogDescription>
        </DialogHeader>
        <div className="-mx-1 grid min-h-0 grid-cols-[repeat(auto-fill,minmax(4.5rem,1fr))] gap-2 overflow-y-auto px-1 py-1">
          {lessons?.map((lesson, index) => {
            const selected = lesson.id === selectedLessonId;
            return (
              <button
                key={lesson.id}
                type="button"
                autoFocus={selected}
                aria-current={selected ? 'true' : undefined}
                onClick={() => onSelect(lesson.id)}
                className={cn(
                  'relative flex aspect-square items-center justify-center rounded-xl border text-2xl font-semibold transition-all outline-none',
                  'hover:-translate-y-0.5 hover:border-blue-500/60 hover:bg-accent hover:shadow-sm',
                  'focus-visible:ring-2 focus-visible:ring-blue-500',
                  selected &&
                    'border-blue-600 bg-blue-600 text-white shadow-md hover:border-blue-600 hover:bg-blue-700 dark:border-blue-500 dark:bg-blue-500'
                )}
              >
                <span
                  className={cn(
                    'absolute top-1 left-1.5 text-[10px] font-medium tabular-nums',
                    selected ? 'text-white/80' : 'text-muted-foreground'
                  )}
                >
                  {index + 1}
                </span>
                {lesson.text}
              </button>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
};

const LessonPracticeNotFound = ({
  varna,
  lessonText
}: {
  varna: string | null;
  lessonText?: string;
}) => (
  <motion.div
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    exit={{ opacity: 0, y: -20 }}
    transition={{ duration: 0.3 }}
    className="mt-16 text-center text-lg font-semibold text-muted-foreground"
  >
    Practice for <span className="font-bold">{varna ?? lessonText ?? ''}</span> not found. Coming
    soon...
  </motion.div>
);

// oxlint-disable-next-line complexity -- Lesson composes transliteration, gesture, audio, and carousel state; split into hooks deferred
const Lesson = ({
  lesson_id,
  hasNext,
  goToNextLesson,
  init_words_transliterated,
  init_varna_transliterated
}: {
  lesson_id?: number | null;
  // taking nullable lesson_id too to be able to display loading spinner when then the user opens it for the very first time
  hasNext?: boolean;
  goToNextLesson?: () => void;
  init_words_transliterated?: string[];
  init_varna_transliterated?: string | null;
}) => {
  const scriptId = useAtomValue(selected_script_id_atom);
  const selectedLanguageId = useAtomValue(selected_language_id_atom);
  const trpc = useTRPC();

  const lesson_info_q = useQuery(
    trpc.text_lessons.get_text_lesson_info.queryOptions(
      { lesson_id: lesson_id! },
      { enabled: !!lesson_id }
    )
  );
  const lesson = lesson_info_q.data;
  const [wordsTransliterated, setWordsTransliterated] = useState<string[]>(
    init_words_transliterated ?? []
  );
  const [varnaTransliterated, setVarnaTransliterated] = useState<string | null>(
    init_varna_transliterated ?? null
  );
  useEffect(() => {
    if (lesson?.words && scriptId) {
      transliterate(
        lesson.words.map((w) => w.word),
        get_script_from_id(lesson.base_word_script_id),
        get_script_from_id(scriptId)
      ).then((transliterated_words) => setWordsTransliterated(transliterated_words));
      transliterate(
        lesson.text,
        get_lang_from_id(selectedLanguageId),
        get_script_from_id(scriptId)
      ).then((transliterated_varna) => setVarnaTransliterated(transliterated_varna));
    }
  }, [lesson?.words, lesson?.text, lesson?.base_word_script_id, scriptId, selectedLanguageId]);

  const selected_gesture = lesson?.gestures.find(
    (gesture) => gesture.text_gesture.script_id === scriptId
  )?.text_gesture;
  const text_gesture_data_q = useQuery(
    trpc.text_gestures.get_text_gesture_data.queryOptions(
      selected_gesture
        ? { id: selected_gesture.id, uuid: selected_gesture.uuid }
        : ({ id: 0, uuid: '' } as const),
      { enabled: !!selected_gesture }
    )
  );

  // tell the app bar menu what is shown, for its admin "Edit …" links
  const selectedCategoryId = useAtomValue(selected_category_id_atom);
  const categories_q = useQuery(
    trpc.text_lessons.categories.get_categories.queryOptions({ lang_id: selectedLanguageId })
  );
  const categoryName = categories_q.data?.find((c) => c.id === selectedCategoryId)?.name;
  const setAdminContext = useSetAtom(learn_admin_context_atom, { store: getDefaultStore() });
  useEffect(() => {
    setAdminContext({
      lesson: lesson ? { id: lesson.id, text: varnaTransliterated ?? lesson.text } : null,
      gesture_id: selected_gesture?.id ?? null,
      category:
        selectedCategoryId !== null && categoryName
          ? { id: selectedCategoryId, name: categoryName }
          : null
    });
  }, [
    setAdminContext,
    lesson,
    varnaTransliterated,
    selected_gesture?.id,
    selectedCategoryId,
    categoryName
  ]);

  // Audio playback state for word audios and varna audio
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playingIndex, setPlayingIndex] = useState<number | null>(null);
  const [playingVarnaAudio, setPlayingVarnaAudio] = useState(false);

  const togglePlay = (index: number, s3_key?: string) => {
    if (!s3_key) return;
    if (playingIndex === index) {
      if (audioRef.current) audioRef.current.pause();
      setPlayingIndex(null);
      return;
    }
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    // Stop any playing varna audio
    if (playingVarnaAudio) {
      setPlayingVarnaAudio(false);
    }
    const audio = new Audio(`${import.meta.env.VITE_AWS_CLOUDFRONT_URL}/${s3_key}`);
    // SAFETY: intentional any cast for dynamic slot check - safe as slot is string literal union validated at runtime.
    audioRef.current = audio as any;
    audio.onended = () => setPlayingIndex(null);
    audio.play();
    setPlayingIndex(index);
  };

  const togglePlayVarnaAudio = (s3_key?: string) => {
    if (!s3_key) return;
    if (playingVarnaAudio) {
      if (audioRef.current) audioRef.current.pause();
      setPlayingVarnaAudio(false);
      return;
    }
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    // Stop any playing word audio
    if (playingIndex !== null) {
      setPlayingIndex(null);
    }
    const audio = new Audio(`${import.meta.env.VITE_AWS_CLOUDFRONT_URL}/${s3_key}`);
    // SAFETY: intentional any cast for dynamic slot check - safe as slot is string literal union validated at runtime.
    audioRef.current = audio as any;
    audio.onended = () => setPlayingVarnaAudio(false);
    audio.play();
    setPlayingVarnaAudio(true);
  };

  const varnaAudioKey = lesson?.optional_audio?.s3_key;
  const carouselBasicClassName_card =
    'basis-1/3 pl-2 sm:basis-1/4 md:basis-1/5 md:pl-4 lg:basis-1/5';

  return (
    <div className="mt-2 space-y-4">
      {/* Varna text with optional audio */}
      {lesson_info_q.isLoading && LOADING_SKELETONS.varna_text()}
      {lesson && (
        <div className="flex items-center justify-center gap-3">
          <div className="text-center">
            {/* <div className="text-2xl font-bold">{lesson.text}</div> */}
            {varnaAudioKey && (
              <div className="mt-2 flex justify-center">
                <button
                  className={cn(
                    'inline-flex items-center rounded-md border px-3 py-1.5 text-sm',
                    'gap-2 hover:bg-accent'
                  )}
                  onClick={() => togglePlayVarnaAudio(varnaAudioKey)}
                >
                  {playingVarnaAudio ? (
                    <span className="flex items-center gap-1">
                      <MdStop className="h-4 w-4" />
                    </span>
                  ) : (
                    <span className="flex items-center gap-1">
                      <HiSpeakerWave className="size-4" />
                    </span>
                  )}
                  <span className="text-lg font-semibold">
                    {varnaTransliterated ?? lesson.text}
                  </span>
                </button>
              </div>
            )}
          </div>
        </div>
      )}
      {/* Words with image and audio - horizontally scrollable */}
      <div className="flex w-full items-stretch justify-center">
        <Carousel
          opts={{
            align: 'start'
          }}
          className="w-full max-w-[90vw] min-w-0 select-none sm:max-w-[70vw] md:max-w-[60vw]"
        >
          <CarouselContent className="-ml-2 md:-ml-4">
            {lesson_info_q.isLoading && LOADING_SKELETONS.lesson_words(carouselBasicClassName_card)}

            {lesson &&
              lesson.words &&
              lesson.words.length > 0 &&
              lesson.words.map((w, idx) => {
                const imageKey = w.image?.s3_key;
                const audioKey = w.audio?.s3_key;
                return (
                  <CarouselItem key={w.id} className={carouselBasicClassName_card}>
                    <div className="rounded-md border p-3 text-center shadow-sm">
                      <div className="mb-2 flex items-center justify-center gap-1">
                        <div className="text-base font-semibold">
                          <HighlightVarnaInWord
                            word={wordsTransliterated[idx] ?? w.word}
                            varna={varnaTransliterated ?? lesson.text}
                            style="dark:text-orange-400 text-orange-600"
                          />
                        </div>
                        {audioKey && (
                          <button
                            className={cn(
                              'inline-flex items-center rounded-md p-1 text-xs',
                              'block hover:bg-accent'
                            )}
                            onClick={() => togglePlay(idx, audioKey)}
                          >
                            {playingIndex === idx ? (
                              <span className="flex items-center gap-1">
                                <MdStop className="h-4 w-4" />
                              </span>
                            ) : (
                              <span className="flex items-center gap-1">
                                <HiSpeakerWave className="size-4" />
                              </span>
                            )}
                          </button>
                        )}
                      </div>
                      {imageKey && (
                        <img
                          src={`${import.meta.env.VITE_AWS_CLOUDFRONT_URL}/${imageKey}`}
                          alt={w.word}
                          className="mx-auto size-20 object-contain"
                        />
                      )}
                    </div>
                  </CarouselItem>
                );
              })}
          </CarouselContent>
          <CarouselPrevious className="left-0 sm:-left-12" />
          <CarouselNext className="right-0 sm:-right-12" />
        </Carousel>
      </div>
      {/* Practice component below */}
      <div>
        {/* Accept the !selected_gesture only when gesture have not finished yet after that show a not found message */}
        {(text_gesture_data_q.isLoading || (!selected_gesture && !lesson?.gestures)) &&
          LOADING_SKELETONS.gesture_canavs()}
        {lesson?.gestures && !selected_gesture && !text_gesture_data_q.isLoading && (
          <LessonPracticeNotFound varna={varnaTransliterated} lessonText={lesson?.text} />
        )}
        {selected_gesture &&
          !text_gesture_data_q.isLoading &&
          text_gesture_data_q.isSuccess &&
          text_gesture_data_q.data && (
            <JotaiProvider
              key={`lesson_learn_page-${lesson_id}-${selected_gesture.id}-${selected_gesture.uuid}`}
            >
              <Practice
                key={`${selected_gesture.id}-${selected_gesture.uuid}`}
                text_data={text_gesture_data_q.data}
                play_gesture_on_mount={true}
              >
                <Practice.Completed>
                  {(restartPractice) => (
                    <div className="flex justify-center select-none">
                      <motion.div
                        className={cn(
                          'flex items-center gap-2 rounded-lg border border-emerald-200 bg-white/90 px-4 py-3 shadow-lg backdrop-blur-md sm:gap-3',
                          'dark:border-emerald-800 dark:bg-gray-900/90'
                        )}
                        initial={{ scale: 0, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 0, opacity: 0 }}
                        transition={{ type: 'spring', stiffness: 300, damping: 25 }}
                      >
                        <TiTick className="size-7 text-emerald-700 dark:text-emerald-300" />
                        <div className="leading-tight">
                          <div className="text-base font-bold text-muted-foreground">
                            You completed {lesson.text}
                          </div>
                        </div>
                        {/* <div className="mx-2 h-6 w-px bg-gray-300 dark:bg-gray-600" /> */}
                        {/* Moved Next Varna into Practice.CanvasCenterCompleted */}
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => restartPractice()}
                          className="h-8 w-8"
                        >
                          <MdRefresh className="h-4 w-4" />
                        </Button>
                      </motion.div>
                    </div>
                  )}
                </Practice.Completed>
                {hasNext && (
                  <Practice.CanvasCenterCompleted>
                    <motion.div
                      initial={{ scale: 0, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      exit={{ scale: 0, opacity: 0 }}
                      transition={{ type: 'spring', stiffness: 300, damping: 25 }}
                    >
                      <Button
                        size="sm"
                        onClick={() => goToNextLesson && goToNextLesson()}
                        className={cn(
                          'group gap-2 font-bold',
                          'bg-linear-to-r from-blue-500 via-sky-500 to-indigo-500 text-white',
                          'shadow-lg shadow-blue-500/20 backdrop-blur-xl',
                          'border border-white/30 dark:border-white/20',
                          'hover:border-white/40 hover:from-blue-600 hover:via-sky-600 hover:to-indigo-600 hover:shadow-xl',
                          'focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2 focus-visible:outline-none',
                          'dark:from-blue-600 dark:via-sky-600 dark:to-indigo-600 dark:text-white',
                          'dark:hover:from-blue-700 dark:hover:via-sky-700 dark:hover:to-indigo-700',
                          'rounded-full transition-all duration-300'
                        )}
                      >
                        Next
                        <MdArrowForward className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                      </Button>
                    </motion.div>
                  </Practice.CanvasCenterCompleted>
                )}
                <Practice.NotFound>
                  <LessonPracticeNotFound varna={varnaTransliterated} lessonText={lesson?.text} />
                </Practice.NotFound>
              </Practice>
            </JotaiProvider>
          )}
      </div>
    </div>
  );
};

const HighlightVarnaInWord = ({
  word,
  style,
  varna
}: {
  word: string;
  varna: string;
  style: string;
}) => {
  const splits = word.split(varna);
  return (
    <>
      {splits.map((split, index) => (
        <span key={index}>
          {split}
          {index < splits.length - 1 && <span className={style}>{varna}</span>}
        </span>
      ))}
    </>
  );
};

const LOADING_SKELETONS = {
  lessons: (carouselBasicClassName: string) =>
    [...Array(8)].map((_, index) => (
      <CarouselItem key={index} className={carouselBasicClassName}>
        <div className="p-1">
          <Skeleton className="h-12 w-full rounded-md" />
        </div>
      </CarouselItem>
    )),
  varna_text: () => (
    <div className="flex items-center justify-center gap-3">
      <div className="mt-2 flex items-center gap-2">
        <Skeleton className="h-9 w-20 rounded-md" />
      </div>
    </div>
  ),
  lesson_words: (carouselBasicClassName: string) =>
    [...Array(9)].map((_, i) => (
      <CarouselItem key={i} className={carouselBasicClassName}>
        <div className="rounded-md border p-3 shadow-sm">
          <div className="mb-2 flex items-center justify-center gap-2">
            <Skeleton className="h-5 w-20" />
            <Skeleton className="h-5 w-5 rounded-full" />
          </div>
          <Skeleton className="mx-auto mb-2 size-20 rounded-md" />
        </div>
      </CarouselItem>
    )),

  gesture_canavs: () => <PracticeLoadingSkeleton />
};
