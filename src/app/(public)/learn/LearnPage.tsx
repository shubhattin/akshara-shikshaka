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
  get_script_from_id,
  lang_list_obj,
  lang_list_type,
  script_list_obj,
  script_list_type
} from '~/state/lang_list';
import { useQuery } from '@tanstack/react-query';
import { useTRPC } from '~/api/client';
import { useState, useEffect, useRef, useMemo } from 'react';
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
import { MdPlayArrow, MdStop } from 'react-icons/md';
import { lipi_parivartak } from '~/tools/lipi_lekhika';
//
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

function LearnPage({ init_lesson_categories }: Props) {
  const trpc = useTRPC();
  const [selectedLanguageId, setSelectedLanguageId] = useAtom(selected_language_id_atom);
  const [selectedScriptId, setSelectedScriptId] = useAtom(selected_script_id_atom);
  const [selectedCategoryId, setSelectedCategoryId] = useAtom(selected_category_id_atom);
  const [open, setOpen] = useState(false);
  const [selectedLessonId, setSelectedLessonId] = useAtom(selected_lesson_id_atom);
  const categories_q = useQuery(
    trpc.text_lessons.categories.get_categories.queryOptions(
      { lang_id: selectedLanguageId },
      { enabled: !!selectedLanguageId, initialData: init_lesson_categories }
    )
  );
  const categories = categories_q.data ?? [];

  const lessons_q = useQuery(
    trpc.text_lessons.categories.get_category_text_lesson_list.queryOptions(
      { category_id: selectedCategoryId! },
      { enabled: selectedCategoryId !== null }
    )
  );
  const lessons = lessons_q.data ?? [];

  const [carouselApi, setCarouselApi] = useState<CarouselApi | null>(null);
  const carouselScrolledToSelectedLesson = useRef(false);
  useEffect(() => {
    if (!carouselApi || carouselScrolledToSelectedLesson.current) return;

    carouselScrolledToSelectedLesson.current = true;

    if (selectedLessonId === null) {
      // select first in list if not set initially
      setSelectedLessonId(lessons[0]?.id ?? null);
      return;
    }

    const idx = lessons.findIndex((l) => l.id === selectedLessonId);
    if (idx === -1) {
      // wrong initial cookie state seems to be passed from server
      setSelectedLessonId(null);
    } else if (idx >= 0) {
      carouselApi.scrollTo(idx);
    }
  }, [carouselApi, selectedLessonId, lessons]);

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
                        console.log('saved_category_id', Number(currentValue));
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
      <div>
        {lessons_q.isLoading && (
          <div className="flex w-full min-w-0 flex-wrap items-center justify-center">
            <Carousel
              opts={{
                align: 'start'
              }}
              className="w-full max-w-[90vw] min-w-0 sm:max-w-[70vw] md:max-w-[50vw]"
            >
              <CarouselContent>
                {[...Array(8)].map((_, index) => (
                  <CarouselItem
                    key={index}
                    className="basis-1/2 sm:basis-1/3 md:basis-1/4 lg:basis-1/5 xl:basis-1/6"
                  >
                    <div className="p-1">
                      <Skeleton className="h-10 w-full rounded-md" />
                    </div>
                  </CarouselItem>
                ))}
              </CarouselContent>
              <CarouselPrevious className="left-0 sm:-left-12" />
              <CarouselNext className="right-0 sm:-right-12" />
            </Carousel>
          </div>
        )}
        {!lessons_q.isLoading && lessons_q.isSuccess && lessons.length > 0 && (
          <div className="flex w-full min-w-0 flex-wrap items-center justify-center">
            <Carousel
              opts={{
                align: 'start'
              }}
              setApi={setCarouselApi}
              className="w-full max-w-[90vw] min-w-0 select-none sm:max-w-[70vw] md:max-w-[60vw]"
            >
              <CarouselContent>
                {lessons.map((lesson) => (
                  <CarouselItem
                    key={lesson.id}
                    className="basis-1/2 sm:basis-1/3 md:basis-1/4 lg:basis-1/5 xl:basis-1/6"
                  >
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
        )}
        {selectedLessonId !== null && <Lesson lesson_id={selectedLessonId} />}
      </div>
    </div>
  );
}

const Lesson = ({ lesson_id }: { lesson_id: number }) => {
  const scriptId = useAtomValue(selected_script_id_atom);
  const trpc = useTRPC();

  const lesson_info_q = useQuery(
    trpc.text_lessons.get_text_lesson_info.queryOptions(
      { lesson_id: lesson_id },
      { enabled: !!lesson_id }
    )
  );
  const lesson = lesson_info_q.data;
  const [wordsTransliterated, setWordsTransliterated] = useState<string[]>([]);
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

  // Audio playback state for word audios
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playingIndex, setPlayingIndex] = useState<number | null>(null);
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
    const audio = new Audio(`${process.env.NEXT_PUBLIC_AWS_CLOUDFRONT_URL}/${s3_key}`);
    audioRef.current = audio as any;
    audio.onended = () => setPlayingIndex(null);
    audio.play();
    setPlayingIndex(index);
  };

  return (
    <div className="space-y-4">
      {/* Words with image and audio - horizontally scrollable */}
      {lesson && lesson.words && lesson.words.length > 0 && (
        <div className="flex w-full items-stretch justify-center gap-3 overflow-x-auto py-2">
          {lesson.words.map((w, idx) => {
            const imageKey = w.image?.s3_key;
            const audioKey = w.audio?.s3_key;
            return (
              <div key={w.id} className="shrink-0 rounded-md border p-3 text-center shadow-sm">
                <div className="mb-2 text-base font-semibold">
                  {wordsTransliterated[idx] ?? w.word}
                </div>
                {imageKey && (
                  <img
                    src={`${process.env.NEXT_PUBLIC_AWS_CLOUDFRONT_URL}/${imageKey}`}
                    alt={w.word}
                    className="mx-auto size-20 object-contain"
                  />
                )}
                {audioKey && (
                  <div className="mt-2 flex justify-center">
                    <button
                      className={cn(
                        'inline-flex items-center rounded-md border px-2 py-1 text-xs',
                        'hover:bg-accent'
                      )}
                      onClick={() => togglePlay(idx, audioKey)}
                    >
                      {playingIndex === idx ? (
                        <span className="flex items-center gap-1">
                          <MdStop className="h-4 w-4" /> Stop
                        </span>
                      ) : (
                        <span className="flex items-center gap-1">
                          <MdPlayArrow className="h-4 w-4" /> Play
                        </span>
                      )}
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
      {lesson_info_q.isLoading && (
        <div className="flex w-full items-stretch justify-center gap-3 overflow-x-auto py-2">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="shrink-0 rounded-md border p-3 shadow-sm">
              <Skeleton className="mb-2 h-5 w-16" />
              <Skeleton className="mx-auto mb-2 h-20 w-20" />
              <Skeleton className="h-8 w-16" />
            </div>
          ))}
        </div>
      )}

      <div className="mt-4">
        {/* Practice component below */}
        {selected_gesture && text_gesture_data_q.isLoading && (
          <div className="space-y-4">
            <div className="text-center">
              <Skeleton className="mx-auto mb-2 h-8 w-48" />
            </div>
            <div className="flex justify-center gap-4">
              <Skeleton className="h-11 w-32" />
              <Skeleton className="h-11 w-32" />
            </div>
            <div className="flex justify-center">
              <Skeleton className="h-[400px] w-[400px] rounded-lg border-2" />
            </div>
          </div>
        )}
        {selected_gesture && text_gesture_data_q.isSuccess && text_gesture_data_q.data && (
          <JotaiProvider key={`lesson_learn_page-${lesson_id}`}>
            <Practice text_data={text_gesture_data_q.data} />
          </JotaiProvider>
        )}
      </div>
    </div>
  );
};
