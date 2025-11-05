'use client';
import { useAtom, useAtomValue } from 'jotai';
import {
  selected_language_id_atom,
  lesson_category_type,
  selected_category_id_atom,
  selected_lesson_id_atom,
  selected_script_id_atom,
  saveLearnPageCookies
} from './learn_page_state';
import {
  get_lang_from_id,
  get_script_from_id,
  lang_list_obj,
  lang_list_type,
  script_list_obj,
  script_list_type
} from '~/state/lang_list';
import { useQuery } from '@tanstack/react-query';
import { useTRPC } from '~/api/client';
import { useState, useEffect, useRef, useMemo, useContext } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '~/components/ui/popover';
import { Button } from '~/components/ui/button';
import { Check, ChevronsUpDown } from 'lucide-react';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList
} from '~/components/ui/command';
import { cn } from '~/lib/utils';
import Practice from '~/components/pages/practice/Practice';
import { Provider as JotaiProvider, createStore } from 'jotai';
import { MdArrowForward, MdRefresh, MdStop } from 'react-icons/md';
import { lipi_parivartak, load_parivartak_lang_data } from '~/tools/lipi_lekhika';
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
import { AppContext } from '~/components/AppDataContext';
import Link from 'next/link';
import { FaExternalLinkAlt } from 'react-icons/fa';
import { motion } from 'framer-motion';

type Props = {
  init_lesson_categories: lesson_category_type[];
  init_lang_id: number;
  init_script_id?: number | null;
  saved_category_id?: number | null;
  saved_lesson_id?: number | null;
};

export default function LearnPageComponent(props: Props) {
  const store = useMemo(() => {
    const s = createStore();
    s.set(selected_language_id_atom, props.init_lang_id);
    s.set(selected_script_id_atom, props.init_script_id ?? script_list_obj['Devanagari']);
    const category_id_ = (() => {
      if (props.saved_category_id === null || props.saved_category_id === undefined) {
        return props.init_lesson_categories[0]?.id ?? null;
      }
      const saved_category = props.init_lesson_categories.find(
        (category) => category.id === props.saved_category_id
      );
      if (saved_category) {
        return saved_category.id;
      }
      return props.init_lesson_categories[0]?.id ?? null;
    })();
    s.set(selected_category_id_atom, category_id_);
    if (category_id_ !== null) s.set(selected_lesson_id_atom, props.saved_lesson_id ?? null);
    return s;
  }, []);

  return (
    <JotaiProvider store={store} key={`learn_page`}>
      <LearnPage {...props} />
    </JotaiProvider>
  );
}

function LearnPage(props: Props) {
  const { init_lesson_categories } = props;
  const trpc = useTRPC();
  const [selectedLanguageId, setSelectedLanguageId] = useAtom(selected_language_id_atom);
  const [selectedScriptId, setSelectedScriptId] = useAtom(selected_script_id_atom);
  const [selectedCategoryId, setSelectedCategoryId] = useAtom(selected_category_id_atom);
  const [open, setOpen] = useState(false);
  const [, setSelectedLessonId] = useAtom(selected_lesson_id_atom);
  const categories_q = useQuery(
    trpc.text_lessons.categories.get_categories.queryOptions(
      { lang_id: selectedLanguageId },
      { enabled: !!selectedLanguageId, initialData: init_lesson_categories }
    )
  );
  const categories = categories_q.data ?? [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-center gap-2 space-x-12 text-sm">
        <label>
          <select
            value={selectedScriptId}
            onChange={(e) => {
              setSelectedScriptId(Number(e.target.value));
              saveLearnPageCookies('script_id', Number(e.target.value));
            }}
            className="flex w-32 rounded-md border border-input bg-transparent px-2 py-1 text-sm font-semibold shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
          >
            {FONT_SCRIPTS.map((script) => (
              <option
                key={script}
                value={script_list_obj[script as script_list_type]}
                className="bg-background text-foreground"
              >
                {script}
              </option>
            ))}
          </select>
        </label>
        <label>
          <select
            value={selectedLanguageId}
            onChange={(e) => {
              setSelectedLanguageId(Number(e.target.value));
              setSelectedCategoryId(null);
              setSelectedLessonId(null);
              saveLearnPageCookies('category_id', null);
              saveLearnPageCookies('lesson_id', null);
            }}
            className="flex w-28 rounded-md border border-input bg-transparent px-2 py-1 text-sm font-semibold shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
          >
            {LANGUAGES_ADDED.map((lang) => (
              <option
                key={lang}
                value={lang_list_obj[lang as lang_list_type]}
                className="bg-background text-foreground"
              >
                {lang}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="flex flex-wrap items-center justify-center">
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              role="combobox"
              aria-expanded={open}
              className="w-[180px] justify-between text-base font-semibold"
            >
              {selectedCategoryId !== null &&
                (categories.find((category) => category.id === selectedCategoryId)?.name ??
                  'Select category...')}
              <ChevronsUpDown className="opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[200px] p-0">
            <Command>
              <CommandInput placeholder="Search category..." className="h-9" />
              <CommandList>
                <CommandEmpty>No category found.</CommandEmpty>
                <CommandGroup>
                  {categories.map((category) => (
                    <CommandItem
                      key={category.id}
                      value={category.id.toString()}
                      onSelect={(currentValue) => {
                        // reset lesson id when category is changed
                        setSelectedLessonId(null);
                        setSelectedCategoryId(
                          Number(currentValue) === selectedCategoryId ? null : Number(currentValue)
                        );
                        // saving cookies
                        saveLearnPageCookies('lesson_id', null);
                        saveLearnPageCookies('category_id', Number(currentValue));
                        setOpen(false);
                      }}
                    >
                      {category.name}
                      <Check
                        className={cn(
                          'ml-auto',
                          selectedCategoryId === category.id ? 'opacity-100' : 'opacity-0'
                        )}
                      />
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      </div>
      <LessonsList />
    </div>
  );
}

const LessonsList = () => {
  const trpc = useTRPC();
  const selectedLanguageId = useAtomValue(selected_language_id_atom);
  const selectedScriptId = useAtomValue(selected_script_id_atom);
  const selectedCategoryId = useAtomValue(selected_category_id_atom);
  const [selectedLessonId, setSelectedLessonId] = useAtom(selected_lesson_id_atom);

  useEffect(() => {
    // preload lipi lekhika data for transliteration
    load_parivartak_lang_data(get_script_from_id(selectedScriptId));
  }, [selectedScriptId]);

  const lessons_q = useQuery(
    trpc.text_lessons.categories.get_category_text_lesson_list.queryOptions(
      { category_id: selectedCategoryId! },
      { enabled: selectedCategoryId !== null }
    )
  );
  const [lessonsTransliterated, setTransliteratedLessons] = useState<
    NonNullable<typeof lessons_q.data>
  >(lessons_q.data ?? []);
  const transliterationVersion = useRef(0);
  useEffect(() => {
    if (!lessons_q.isSuccess) return;
    const data = lessons_q.data;
    transliterationVersion.current += 1;
    const currentVersion = transliterationVersion.current;
    Promise.all(
      data.map(async (lesson) => ({
        ...lesson,
        text: await lipi_parivartak(
          lesson.text,
          get_lang_from_id(selectedLanguageId),
          get_script_from_id(selectedScriptId)
        )
      }))
    ).then((transliterated_data) => {
      // avoid race condition by checking if this is still the latest transliteration request
      if (currentVersion !== transliterationVersion.current) return;
      setTransliteratedLessons(transliterated_data);
    });
  }, [lessons_q.isSuccess, lessons_q.data, selectedLanguageId, selectedScriptId]);

  const [carouselApi, setCarouselApi] = useState<CarouselApi | null>(null);
  const carouselScrolledToSelectedLesson = useRef(false);
  useEffect(() => {
    // currently this effect only runs once and not on category change
    if (
      carouselScrolledToSelectedLesson.current ||
      lessons_q.isPending ||
      !lessons_q.isSuccess ||
      selectedCategoryId === null ||
      selectedCategoryId === undefined
    )
      return;
    // not using the lessons as they are transliterated before being used
    const lessons_ = lessons_q.data;
    const idx = lessons_.findIndex((l) => l.id === selectedLessonId);
    if (idx === -1) {
      // wrong initial cookie state seems to be passed from server
      setSelectedLessonId(lessons_[0]?.id ?? null);
      carouselScrolledToSelectedLesson.current = true;
      return;
    }
    if (!carouselApi) return;
    carouselScrolledToSelectedLesson.current = true;

    if (selectedLessonId === null) {
      // select first in list if not set initially
      setSelectedLessonId(lessons_[0]?.id ?? null);
      return;
    }
    if (idx >= 0) {
      carouselApi.scrollTo(idx);
    }
  }, [carouselApi, selectedLessonId, lessons_q]);

  // Helpers to drive carousel from child Lesson
  const currentIndex = lessonsTransliterated.findIndex((l) => l.id === selectedLessonId);
  const hasNext = currentIndex >= 0 && currentIndex < lessonsTransliterated.length - 1;
  const goToNextLesson = () => {
    if (!hasNext) return;
    const nextLesson = lessonsTransliterated[currentIndex + 1];
    setSelectedLessonId(nextLesson.id);
    saveLearnPageCookies('lesson_id', nextLesson.id);
    if (carouselApi) {
      carouselApi.scrollTo(currentIndex + 1);
    }
  };

  const carouselBasicClassName = 'basis-1/2 sm:basis-1/3 md:basis-1/4 lg:basis-1/5 xl:basis-1/6';
  return (
    <div>
      <div className="flex w-full min-w-0 flex-wrap items-center justify-center">
        <Carousel
          opts={{
            align: 'start'
          }}
          setApi={setCarouselApi}
          className="w-full max-w-[90vw] min-w-0 select-none sm:max-w-[70vw] md:max-w-[60vw]"
        >
          <CarouselContent className="">
            {lessons_q.isLoading && LOADING_SKELETONS.lessons(carouselBasicClassName)}

            {!lessons_q.isLoading &&
              lessons_q.isSuccess &&
              lessonsTransliterated.length > 0 &&
              lessonsTransliterated.map((lesson) => (
                <CarouselItem key={lesson.id} className={carouselBasicClassName}>
                  <Button
                    variant={selectedLessonId === lesson.id ? 'default' : 'outline'}
                    className={cn(
                      'w-full text-xl transition-all',
                      selectedLessonId === lesson.id
                        ? 'border border-blue-600 bg-blue-600 text-white shadow-md ring-2 ring-blue-500/20 hover:bg-blue-700 dark:border-blue-500 dark:bg-blue-500 dark:hover:bg-blue-600'
                        : 'border border-border bg-background text-foreground hover:bg-accent hover:text-accent-foreground'
                    )}
                    onClick={() => {
                      if (selectedLessonId === lesson.id) {
                        setSelectedLessonId(null);
                        saveLearnPageCookies('lesson_id', null);
                      } else {
                        setSelectedLessonId(lesson.id);
                        saveLearnPageCookies('lesson_id', lesson.id);
                      }
                    }}
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
      <Lesson lesson_id={selectedLessonId} hasNext={hasNext} goToNextLesson={goToNextLesson} />
    </div>
  );
};

const Lesson = ({
  lesson_id,
  hasNext,
  goToNextLesson
}: {
  lesson_id?: number | null;
  // taking nullable lesson_id too to be able to display loading spinner when then the user opens it for the very first time
  hasNext?: boolean;
  goToNextLesson?: () => void;
}) => {
  const scriptId = useAtomValue(selected_script_id_atom);
  const selectedLanguageId = useAtomValue(selected_language_id_atom);
  const trpc = useTRPC();
  const { user_info } = useContext(AppContext);

  const lesson_info_q = useQuery(
    trpc.text_lessons.get_text_lesson_info.queryOptions(
      { lesson_id: lesson_id! },
      { enabled: !!lesson_id }
    )
  );
  const lesson = lesson_info_q.data;
  const [wordsTransliterated, setWordsTransliterated] = useState<string[]>([]);
  const [varnaTransliterated, setVarnaTransliterated] = useState<string | null>(null);
  useEffect(() => {
    if (lesson?.words && scriptId) {
      Promise.all(
        lesson.words.map(
          async (w) =>
            await lipi_parivartak(
              w.word,
              get_script_from_id(lesson.base_word_script_id),
              get_script_from_id(scriptId)
            )
        )
      ).then((transliterated_words) => setWordsTransliterated(transliterated_words));
      lipi_parivartak(
        lesson.text,
        get_lang_from_id(selectedLanguageId),
        get_script_from_id(scriptId)
      ).then((transliterated_varna) => setVarnaTransliterated(transliterated_varna));
    }
  }, [lesson?.words, scriptId]);

  const selected_gesture = lesson?.gestures.find(
    (gesture) => gesture.text_gesture.script_id === scriptId
  )?.text_gesture;
  const text_gesture_data_q = useQuery(
    trpc.text_gestures.get_text_gesture_data.queryOptions(
      { id: selected_gesture?.id!, uuid: selected_gesture?.uuid! },
      { enabled: !!selected_gesture }
    )
  );

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
    const audio = new Audio(`${process.env.NEXT_PUBLIC_AWS_CLOUDFRONT_URL}/${s3_key}`);
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
    const audio = new Audio(`${process.env.NEXT_PUBLIC_AWS_CLOUDFRONT_URL}/${s3_key}`);
    audioRef.current = audio as any;
    audio.onended = () => setPlayingVarnaAudio(false);
    audio.play();
    setPlayingVarnaAudio(true);
  };

  const varnaAudioKey = lesson?.optional_audio?.s3_key;
  const carouselBasicClassName =
    'basis-1/3 pl-2 sm:basis-1/4 md:basis-1/5 md:pl-4 lg:basis-1/6 xl:basis-1/7';

  return (
    <div className="mt-2 space-y-4">
      {/* Varna text with optional audio */}
      {(lesson_info_q.isLoading || !lesson_id) && LOADING_SKELETONS.varna_text()}
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
            {(lesson_info_q.isLoading || !lesson_id) &&
              LOADING_SKELETONS.lesson_words(carouselBasicClassName)}

            {lesson &&
              lesson.words &&
              lesson.words.length > 0 &&
              lesson.words.map((w, idx) => {
                const imageKey = w.image?.s3_key;
                const audioKey = w.audio?.s3_key;
                return (
                  <CarouselItem key={w.id} className={carouselBasicClassName}>
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
                          src={`${process.env.NEXT_PUBLIC_AWS_CLOUDFRONT_URL}/${imageKey}`}
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
        {(text_gesture_data_q.isLoading || !selected_gesture) && LOADING_SKELETONS.gesture_canavs()}
        {selected_gesture &&
          !text_gesture_data_q.isLoading &&
          text_gesture_data_q.isSuccess &&
          text_gesture_data_q.data && (
            <JotaiProvider key={`lesson_learn_page-${lesson_id}`}>
              <Practice text_data={text_gesture_data_q.data} play_gesture_on_mount={true}>
                <Practice.Completed>
                  {(restartPractice) => (
                    <div className="flex justify-center select-none">
                      <motion.div
                        className={cn(
                          'flex items-center gap-3 rounded-lg border border-emerald-200 bg-white/90 px-4 py-3 shadow-lg backdrop-blur-md',
                          'dark:border-emerald-800 dark:bg-gray-900/90'
                        )}
                        initial={{ scale: 0, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 0, opacity: 0 }}
                        transition={{ type: 'spring', stiffness: 300, damping: 25 }}
                      >
                        <span className="text-3xl">🌟</span>
                        <div className="leading-tight">
                          <div className="text-lg font-semibold text-emerald-700 dark:text-emerald-300">
                            Wonderful job!
                          </div>
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
                        Next Varna
                        <MdArrowForward className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                      </Button>
                    </motion.div>
                  </Practice.CanvasCenterCompleted>
                )}
              </Practice>
            </JotaiProvider>
          )}
      </div>
      {user_info && user_info.role === 'admin' && (
        <div className="mt-16 flex items-center justify-center">
          <Link
            href={`/lessons/edit/${lesson_id}`}
            target="_blank"
            className="group flex items-center justify-center gap-2 text-blue-600 transition-all hover:text-blue-700 hover:underline dark:text-sky-400 dark:hover:text-blue-300"
          >
            <FaExternalLinkAlt className="size-4 text-yellow-500 group-hover:text-yellow-600 dark:text-yellow-400 dark:group-hover:text-yellow-300" />
            Edit Lesson
          </Link>
        </div>
      )}
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

  gesture_canavs: () => (
    <div className="space-y-4">
      <div className="flex justify-center">
        <div className="relative">
          <Skeleton className="h-[400px] w-[400px] rounded-lg border-2" />
          <Skeleton className="absolute top-3 left-3 h-8 w-8 rounded-full" />
          <Skeleton className="absolute top-3 right-3 h-8 w-8 rounded-full" />
        </div>
      </div>
    </div>
  )
};
