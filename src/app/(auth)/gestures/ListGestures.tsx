'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useTRPC } from '~/api/client';
import { Card, CardHeader, CardTitle } from '~/components/ui/card';
import { Skeleton } from '~/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '~/components/ui/select';
import { Input } from '~/components/ui/input';
import { Button } from '~/components/ui/button';
import { FONT_SCRIPTS } from '~/state/font_list';
import { script_list_obj, type script_list_type } from '~/state/lang_list';
import Cookie from 'js-cookie';
import { useQuery } from '@tanstack/react-query';
import { SCRIPT_ID_COOKIE_KEY } from '~/state/cookie';
import type { gesture_categories } from '~/db/schema';
import type { InferSelectModel } from 'drizzle-orm';
import { useHydrateAtoms } from 'jotai/react/utils';
import { atom } from 'jotai';

type Props = {
  init_script_id: number;
  init_gesture_categories: Pick<
    InferSelectModel<typeof gesture_categories>,
    'id' | 'name' | 'order'
  >[];
};

const script_id_atom = atom<number | undefined>(undefined);

export default function ListGesturesWrapper(props: Props) {
  useHydrateAtoms([[script_id_atom, props.init_script_id]]);
  return <ListGestures {...props} />;
}

function ListGestures({ init_script_id, init_gesture_categories }: Props) {
  const trpc = useTRPC();
  const [scriptId, setScriptId] = useState<number | undefined>(init_script_id);

  const scriptOptions = FONT_SCRIPTS.map((name) => ({
    name,
    id: script_list_obj[name as script_list_type]
  }));

  const categories_q = useQuery(
    trpc.text_gestures.categories.get_text_gesture_categories.queryOptions(
      { script_id: scriptId! },
      { enabled: !!scriptId, placeholderData: init_gesture_categories }
    )
  );
  const categories = categories_q.data ?? [];

  return (
    <div className="space-y-6">
      <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-center gap-3">
        <Select
          value={scriptId?.toString()}
          onValueChange={(val) => {
            setScriptId(Number(val));
            Cookie.set(SCRIPT_ID_COOKIE_KEY, val, { expires: 30 });
          }}
        >
          <SelectTrigger className="w-56">
            <SelectValue placeholder="Select a Script" />
          </SelectTrigger>
          <SelectContent>
            {scriptOptions.map((opt) => (
              <SelectItem key={opt.id} value={opt.id.toString()}>
                {opt.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
