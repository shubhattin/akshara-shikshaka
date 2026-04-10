'use client';

import { useMemo, useState } from 'react';
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
import { script_list_obj } from '~/state/lang_list';

type Category = { id: number; name: string; order: number | null };

type Props = {
  init_script_id: number;
  init_gesture_categories: Category[];
};

export default function AdminListGestures({ init_script_id, init_gesture_categories }: Props) {
  const trpc = useTRPC();
  const [scriptId, setScriptId] = useState(init_script_id);
  const [categoryId, setCategoryId] = useState<number>(init_gesture_categories[0]?.id ?? 0);

  const { data, isLoading } = useQuery(
    trpc.text_gestures.categories.get_gestures.queryOptions(
      { category_id: categoryId, script_id: scriptId },
      { enabled: scriptId > 0 }
    )
  );

  const gestures = data?.gestures ?? [];

  const scriptLabel = useMemo(() => {
    const entry = Object.entries(script_list_obj).find(([, v]) => v === scriptId);
    return entry?.[0] ?? 'Devanagari';
  }, [scriptId]);

  const scriptSelectItems = useMemo(
    () => Object.keys(script_list_obj).map((name) => ({ label: name, value: name })),
    []
  );

  const categorySelectItems = useMemo(() => {
    const fromDb = init_gesture_categories.map((c) => ({
      label: c.name,
      value: String(c.id)
    }));
    return [{ label: 'Uncategorized', value: '0' }, ...fromDb];
  }, [init_gesture_categories]);

  return (
    <div className="container mx-auto p-4">
      <div className="my-2 mb-4 flex items-center justify-start space-x-4 px-2">
        <Link to="/" className="flex items-center gap-1 text-lg font-semibold">
          <IoMdArrowRoundBack className="inline-block text-xl" />
          Home Page
        </Link>
      </div>
      <div className="mt-2 mb-5 flex flex-wrap items-center justify-center gap-4 px-2">
        <Link to="/gestures/add">
          <Button variant="outline" className="gap-2 text-lg font-semibold">
            <IoMdAdd className="size-5.5" /> Add
            <span className="font-bold text-yellow-600 dark:text-yellow-400">Gesture</span>
          </Button>
        </Link>
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Script</span>
          <Select
            items={scriptSelectItems}
            value={scriptLabel}
            onValueChange={(name) => {
              const id = script_list_obj[name as keyof typeof script_list_obj];
              if (id != null) setScriptId(id);
            }}
          >
            <SelectTrigger className="w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.keys(script_list_obj).map((k) => (
                <SelectItem key={k} value={k}>
                  {k}
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
              {init_gesture_categories.map((c) => (
                <SelectItem key={c.id} value={String(c.id)}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="rounded-md border">
        {isLoading ? (
          <p className="p-4 text-muted-foreground">Loading…</p>
        ) : gestures.length === 0 ? (
          <p className="p-4 text-muted-foreground">No gestures in this category.</p>
        ) : (
          <ul className="divide-y">
            {gestures.map((g) => (
              <li key={g.id} className="flex items-center justify-between px-4 py-3">
                <span className="text-lg font-medium">{g.text}</span>
                <Link
                  to="/gestures/edit/$id"
                  params={{
                    id: `${encodeURIComponent(String(g.text))}:${g.id}`
                  }}
                  className={buttonVariants({ variant: 'ghost', size: 'sm' })}
                >
                  Edit
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
