'use client';

import { useEffect, useMemo, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { useTRPC } from '~/api/client';
import { Button, buttonVariants } from '~/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '~/components/ui/select';
import { IoMdAdd, IoMdArrowRoundBack } from 'react-icons/io';
import { LANG_LIST, lang_list_obj, type lang_list_type } from '~/state/lang_list';

type Props = { init_lang_id: number };

export default function AdminListLessons({ init_lang_id }: Props) {
  const trpc = useTRPC();
  const [langId, setLangId] = useState(init_lang_id);

  const { data: categories = [], isLoading: catLoading } = useQuery(
    trpc.text_lessons.categories.get_categories.queryOptions({ lang_id: langId })
  );

  const [categoryId, setCategoryId] = useState<number>(0);

  useEffect(() => {
    if (categories.length && !categories.find((c) => c.id === categoryId) && categoryId !== 0) {
      setCategoryId(categories[0]!.id);
    }
  }, [categories, categoryId]);

  const { data: lessonsData, isLoading: lesLoading } = useQuery(
    trpc.text_lessons.categories.get_text_lessons.queryOptions(
      { category_id: categoryId, lang_id: langId },
      { enabled: true }
    )
  );

  const lessons = lessonsData?.lessons ?? [];

  const langSelectItems = useMemo(
    () =>
      LANG_LIST.map((lang) => ({
        label: lang,
        value: String(lang_list_obj[lang as lang_list_type])
      })),
    []
  );

  const categorySelectItems = useMemo(() => {
    const fromDb = categories.map((c) => ({ label: c.name, value: String(c.id) }));
    return [{ label: 'Uncategorized', value: '0' }, ...fromDb];
  }, [categories]);

  return (
    <div className="container mx-auto p-4">
      <div className="my-2 mb-4 flex items-center justify-start space-x-4 px-2">
        <Link to="/" className="flex items-center gap-1 text-lg font-semibold">
          <IoMdArrowRoundBack className="inline-block text-xl" />
          Home Page
        </Link>
      </div>
      <div className="mt-2 mb-5 flex flex-wrap items-center justify-center gap-4 px-2">
        <Link to="/lessons/add">
          <Button variant="outline" className="gap-2 text-lg font-semibold">
            <IoMdAdd className="size-5.5" />
            Add <span className="font-bold text-yellow-600 dark:text-yellow-400">Lesson</span>
          </Button>
        </Link>
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Language</span>
          <Select
            items={langSelectItems}
            value={String(langId)}
            onValueChange={(v) => setLangId(Number(v))}
          >
            <SelectTrigger className="w-[160px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {LANG_LIST.map((lang) => (
                <SelectItem key={lang} value={String(lang_list_obj[lang as lang_list_type])}>
                  {lang}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Category</span>
          <Select
            items={categorySelectItems}
            value={String(categoryId)}
            onValueChange={(v) => setCategoryId(Number(v))}
          >
            <SelectTrigger className="w-[200px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="0">Uncategorized</SelectItem>
              {categories.map((c) => (
                <SelectItem key={c.id} value={String(c.id)}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {catLoading || lesLoading ? (
        <p className="text-muted-foreground">Loading…</p>
      ) : (
        <ul className="divide-y rounded-md border">
          {lessons.map((l) => (
            <li key={l.id} className="flex items-center justify-between px-4 py-3">
              <span className="text-lg">{l.text}</span>
              <Link
                to="/lessons/edit/$id"
                params={{ id: String(l.id) }}
                className={buttonVariants({ variant: 'ghost', size: 'sm' })}
              >
                Edit
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
