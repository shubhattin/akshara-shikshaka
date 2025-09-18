'use client';

import Link from 'next/link';
import { useState } from 'react';
import { client_q } from '~/api/client';
import { Card, CardHeader, CardTitle } from '~/components/ui/card';
import { Skeleton } from '~/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '~/components/ui/select';
import { FONT_SCRIPTS } from '~/state/font_list';
import { script_list_obj, type script_list_type } from '~/state/lang_list';

type Props = {};

export default function ListGestures({}: Props) {
  const [scriptId, setScriptId] = useState<number | undefined>(undefined);

  const list_q = client_q.text_gestures.list_text_gesture_data.useQuery(
    {
      script_id: scriptId!
    },
    {
      enabled: !!scriptId
    }
  );
  const isLoading = !!scriptId && (list_q.isLoading || list_q.isFetching);
  const data = list_q.data ?? [];
  const scriptOptions = FONT_SCRIPTS.map((name) => ({
    name,
    id: script_list_obj[name as script_list_type]
  }));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-center gap-2">
        <Select value={scriptId?.toString()} onValueChange={(val) => setScriptId(Number(val))}>
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
      <ul className="grid grid-cols-4 gap-4 sm:grid-cols-6 md:grid-cols-8">
        {isLoading
          ? Array.from({ length: 12 }).map((_, i) => (
              <li key={`skeleton-${i}`}>
                <Card className="p-2">
                  <CardHeader>
                    <Skeleton className="mx-auto h-6 w-16" />
                  </CardHeader>
                </Card>
              </li>
            ))
          : data.map((item) => (
              <li key={item.id}>
                <Link href={`/gestures/edit/${item.id}`}>
                  <Card className="p-2 transition duration-200 hover:bg-gray-100 hover:dark:bg-gray-800">
                    <CardHeader>
                      <CardTitle className="text-center">{item.text}</CardTitle>
                    </CardHeader>
                  </Card>
                </Link>
              </li>
            ))}
      </ul>
    </div>
  );
}
