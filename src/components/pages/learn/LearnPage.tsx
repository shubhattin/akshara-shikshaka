'use client';

import { useEffect, useMemo, useState } from 'react';
import Cookie from 'js-cookie';
import { useQuery } from '@tanstack/react-query';
import { transliterate } from 'lipilekhika';
import { useTRPC } from '~/api/client';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '~/components/ui/select';
import { Label } from '~/components/ui/label';
import { Skeleton } from '~/components/ui/skeleton';
import PracticeWrapper from '~/components/pages/practice/Practice';
import { SAVED_COOKIES_KEY } from '~/components/pages/learn/learn_page_state';
import {
  ALL_LANG_SCRIPT_LIST,
  SCRIPT_LIST,
  get_script_from_id,
  script_list_obj,
  type script_list_type
} from '~/state/lang_list';

export type LearnLessonRow = {
  id: number;
  text: string;
  order: number | null;
  uuid: string;
};

export type LearnCategoryRow = {
  id: number;
  name: string;
  order: number | null;
};

type Props = {
  init_lesson_categories: LearnCategoryRow[];
  init_lang_id: number;
  init_script_id: number | null;
  init_lessons_list: LearnLessonRow[];
  init_lessons_list_transliterated: LearnLessonRow[];
  saved_category_id: number | null;
  saved_lesson_id: number | null;
};

function saveLearnCookies(partial: {
  category_id?: number | null;
  lesson_id?: number | null;
  script_id?: number | null;
}) {
  if (partial.category_id != null) {
    Cookie.set(SAVED_COOKIES_KEY.category_id.key, String(partial.category_id), { expires: 365 });
  }
  if (partial.lesson_id != null) {
    Cookie.set(SAVED_COOKIES_KEY.lesson_id.key, String(partial.lesson_id), { expires: 365 });
  }
  if (partial.script_id != null) {
    Cookie.set(SAVED_COOKIES_KEY.script_id.key, String(partial.script_id), { expires: 365 });
  }
}

export default function LearnPage({
  init_lesson_categories,
  init_lang_id: _init_lang_id,
  init_script_id,
  init_lessons_list,
  init_lessons_list_transliterated,
  saved_category_id,
  saved_lesson_id
}: Props) {
  const trpc = useTRPC();

  const [categoryId, setCategoryId] = useState<number | null>(saved_category_id);
  const [lessonId, setLessonId] = useState<number | null>(saved_lesson_id);
  const [scriptId, setScriptId] = useState<number | null>(
    init_script_id ?? script_list_obj['Devanagari']!
  );

  const [lessonsPlain, setLessonsPlain] = useState<LearnLessonRow[]>(init_lessons_list);
  const [lessonsTrans, setLessonsTrans] = useState<LearnLessonRow[]>(
    init_lessons_list_transliterated
  );

  const { data: lessonInfo, isLoading: lessonLoading } = useQuery(
    trpc.text_lessons.get_text_lesson_info.queryOptions(
      { lesson_id: lessonId! },
      { enabled: lessonId != null && lessonId > 0 }
    )
  );

  const firstGesture = lessonInfo?.gestures?.[0]?.text_gesture;

  const { data: gestureRow, isLoading: gestureLoading } = useQuery(
    trpc.text_gestures.get_text_gesture_data.queryOptions(
      {
        id: firstGesture?.id ?? 0,
        uuid: firstGesture?.uuid ?? '00000000-0000-0000-0000-000000000000'
      },
      { enabled: !!firstGesture?.id && !!firstGesture?.uuid }
    )
  );

  const targetScriptName = useMemo(
    () => (scriptId != null ? get_script_from_id(scriptId) : 'Devanagari'),
    [scriptId]
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!lessonsPlain.length || scriptId == null) return;
      const next = await Promise.all(
        lessonsPlain.map(async (lesson) => ({
          ...lesson,
          text: await transliterate(lesson.text, 'Devanagari', targetScriptName as script_list_type)
        }))
      );
      if (!cancelled) setLessonsTrans(next);
    })();
    return () => {
      cancelled = true;
    };
  }, [lessonsPlain, scriptId, targetScriptName]);

  const { data: remoteLessons, isFetching: remoteLessonsLoading } = useQuery(
    trpc.text_lessons.categories.get_category_text_lesson_list.queryOptions(
      { category_id: categoryId! },
      { enabled: categoryId != null && categoryId > 0 }
    )
  );

  useEffect(() => {
    if (!remoteLessons) return;
    setLessonsPlain(remoteLessons);
    if (!remoteLessons.length) {
      setLessonId(null);
      return;
    }
    if (lessonId != null && !remoteLessons.some((l) => l.id === lessonId)) {
      setLessonId(remoteLessons[0]!.id);
    }
  }, [remoteLessons, lessonId]);

  const practiceTextData = useMemo(() => {
    if (!lessonInfo || !gestureRow) return null;
    return {
      id: gestureRow.id,
      uuid: gestureRow.uuid,
      text: lessonInfo.text,
      script_id: scriptId ?? lessonInfo.base_word_script_id,
      gestures: gestureRow.gestures ?? []
    };
  }, [lessonInfo, gestureRow, scriptId]);

  const handleCategoryChange = (idStr: string | null) => {
    if (idStr == null) return;
    const id = Number(idStr);
    setCategoryId(id);
    saveLearnCookies({ category_id: id });
  };

  const handleLessonChange = (idStr: string | null) => {
    if (idStr == null) return;
    const id = Number(idStr);
    setLessonId(id);
    saveLearnCookies({ lesson_id: id });
  };

  const handleScriptChange = (name: string | null) => {
    if (name == null) return;
    const id = script_list_obj[name as keyof typeof script_list_obj];
    if (id == null) return;
    setScriptId(id);
    saveLearnCookies({ script_id: id });
  };

  return (
    <div className="mt-4 space-y-6 px-2">
      <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-end">
        <div className="space-y-2">
          <Label>Category</Label>
          <Select
            value={categoryId != null ? String(categoryId) : ''}
            onValueChange={handleCategoryChange}
          >
            <SelectTrigger className="w-[220px]">
              <SelectValue placeholder="Category" />
            </SelectTrigger>
            <SelectContent>
              {init_lesson_categories.map((c) => (
                <SelectItem key={c.id} value={String(c.id)}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>Lesson</Label>
          <Select
            value={lessonId != null ? String(lessonId) : ''}
            onValueChange={handleLessonChange}
            disabled={!lessonsTrans.length || remoteLessonsLoading}
          >
            <SelectTrigger className="w-[220px]">
              <SelectValue placeholder="Lesson" />
            </SelectTrigger>
            <SelectContent>
              {lessonsTrans.map((l) => (
                <SelectItem key={l.id} value={String(l.id)}>
                  {l.text}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>Script</Label>
          <Select value={targetScriptName} onValueChange={handleScriptChange}>
            <SelectTrigger className="w-[220px]">
              <SelectValue placeholder="Script" />
            </SelectTrigger>
            <SelectContent>
              {ALL_LANG_SCRIPT_LIST.filter((s) => SCRIPT_LIST.includes(s)).map((s) => (
                <SelectItem key={s} value={s}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {lessonLoading || gestureLoading ? (
        <Skeleton className="h-[420px] w-full max-w-md rounded-lg" />
      ) : practiceTextData ? (
        <PracticeWrapper text_data={practiceTextData} play_gesture_on_mount />
      ) : lessonInfo && !firstGesture ? (
        <p className="text-muted-foreground">This lesson has no linked gestures yet.</p>
      ) : null}
    </div>
  );
}
