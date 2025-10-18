'use client';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import {
  selected_language_id_atom,
  lesson_category_type,
  selected_category_id_atom,
  selected_lesson_id_atom,
  selected_script_id_atom
} from './learn_page_state';
import { get_lang_from_id } from '~/state/lang_list';
import { useQuery } from '@tanstack/react-query';
import { useTRPC } from '~/api/client';
import { useState } from 'react';
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
import { Provider as JotaiProvider } from 'jotai';

type Props = {
  init_lesson_categories: lesson_category_type[];
};

export default function LearnPage({ init_lesson_categories }: Props) {
  const trpc = useTRPC();
  const selectedLanguageId = useAtomValue(selected_language_id_atom);
  const [selectedCategoryId, setSelectedCategoryId] = useAtom(selected_category_id_atom);
  const [open, setOpen] = useState(false);
  const [selectedLessonId, setSelectedLessonId] = useAtom(selected_lesson_id_atom);

  const categories_q = useQuery(
    trpc.text_lessons.categories.get_categories.queryOptions(
      { lang_id: selectedLanguageId },
      { enabled: !!selectedLanguageId, placeholderData: init_lesson_categories }
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

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-center gap-2 text-sm">
        <span className="">Selected Language:</span>
        <span className="font-semibold underline">{get_lang_from_id(selectedLanguageId)}</span>
      </div>
      <div className="flex flex-wrap items-center justify-center">
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              role="combobox"
              aria-expanded={open}
              className="w-[180px] justify-between"
            >
              {selectedCategoryId !== null
                ? categories.find((category) => category.id === selectedCategoryId)?.name ||
                  (selectedCategoryId === 0 ? 'Uncategorized' : 'Select category...')
                : 'Select category...'}
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
      {lessons.length > 0 && (
        <div className="flex flex-wrap items-center justify-center">
          <div className="flex max-w-[90vw] flex-col items-center gap-2 p-1 sm:max-w-[70vw] md:max-w-[50vw]">
            <div className="flex w-full gap-2 overflow-x-auto">
              {lessons.map((lesson) => (
                <Button
                  key={lesson.id}
                  variant={selectedLessonId === lesson.id ? 'default' : 'outline'}
                  className={cn(
                    'shrink-0 text-base transition-all',
                    selectedLessonId === lesson.id &&
                      'border border-primary shadow-md ring-2 ring-primary/20'
                  )}
                  onClick={() => {
                    if (selectedLessonId === lesson.id) {
                      setSelectedLessonId(null);
                    } else {
                      setSelectedLessonId(lesson.id);
                    }
                  }}
                >
                  {lesson.text}
                </Button>
              ))}
            </div>
          </div>
        </div>
      )}
      {selectedLessonId !== null && <LessonList lesson_id={selectedLessonId} />}
    </div>
  );
}

const LessonList = ({ lesson_id }: { lesson_id: number }) => {
  const [scriptId, setScriptId] = useAtom(selected_script_id_atom);
  const trpc = useTRPC();
  const lesson_info_q = useQuery(
    trpc.text_lessons.get_text_lesson_info.queryOptions(
      { lesson_id: lesson_id },
      { enabled: !!lesson_id }
    )
  );
  const selected_gesture = lesson_info_q.data?.gestures.find(
    (gesture) => gesture.text_gesture.script_id === scriptId
  );
  const text_gesture_data_q = useQuery(
    trpc.text_gestures.get_text_gesture_data.queryOptions(
      { id: selected_gesture?.text_gesture.id!, uuid: selected_gesture?.text_gesture.uuid! },
      { enabled: !!selected_gesture }
    )
  );

  return (
    <div>
      {selected_gesture && text_gesture_data_q.data && (
        <JotaiProvider key={`lesson_learn_page-${lesson_id}`}>
          <Practice text_data={text_gesture_data_q.data!} />
        </JotaiProvider>
      )}
    </div>
  );
};
