'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { IoMdSearch, IoMdArrowDropleft, IoMdArrowDropright } from 'react-icons/io';
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
import { Input } from '~/components/ui/input';
import { Button } from '~/components/ui/button';
import {
  LANG_LIST,
  lang_list_obj,
  type lang_list_type,
  get_lang_from_id,
  LANG_SCRIPT_MAP
} from '~/state/lang_list';
import { lekhika_typing_tool, load_parivartak_lang_data } from '~/tools/lipi_lekhika';

type Props = {};

const DEFAULT_LIMIT = 24;
export default function ListLessons({}: Props) {
  const [langId, setLangId] = useState<number | undefined>(lang_list_obj['Sanskrit']);
  const [searchText, setSearchText] = useState<string>('');
  const [debouncedSearch, setDebouncedSearch] = useState<string>('');
  const [page, setPage] = useState<number>(1);
  const [limit, setLimit] = useState<number>(DEFAULT_LIMIT);

  useEffect(() => {
    const handle = setTimeout(() => setDebouncedSearch(searchText.trim()), 300);
    return () => clearTimeout(handle);
  }, [searchText]);

  useEffect(() => {
    setPage(1);
  }, [langId, debouncedSearch, limit]);

  const list_q = client_q.text_lessons.list_text_lessons.useQuery(
    {
      lang_id: langId!,
      search_text: debouncedSearch || undefined,
      page,
      limit
    },
    {
      enabled: !!langId
    }
  );
  const isLoading = !!langId && (list_q.isLoading || list_q.isFetching);
  const data = list_q.data;

  const langOptions = LANG_LIST.map((name) => ({
    name,
    id: lang_list_obj[name as lang_list_type]
  }));

  const items = useMemo(() => data?.list ?? [], [data]);

  const currentScriptForLang = useMemo(() => {
    if (!langId) return undefined;
    const langName = get_lang_from_id(langId);
    return LANG_SCRIPT_MAP[langName];
  }, [langId]);

  useEffect(() => {
    if (!currentScriptForLang) return;
    load_parivartak_lang_data(currentScriptForLang);
  }, [currentScriptForLang]);

  return (
    <div className="space-y-6">
      <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-center gap-3">
        <div className="min-w-56">
          <Select value={langId?.toString()} onValueChange={(val) => setLangId(Number(val))}>
            <SelectTrigger className="w-56">
              <SelectValue placeholder="Select a Language" />
            </SelectTrigger>
            <SelectContent>
              {langOptions.map((opt) => (
                <SelectItem key={opt.id} value={opt.id.toString()}>
                  {opt.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="relative">
          <IoMdSearch className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="w-64 pl-9"
            placeholder="Search text..."
            value={searchText}
            onInput={(e) => {
              setSearchText(e.currentTarget.value);
              if (!currentScriptForLang) return;
              lekhika_typing_tool(
                e.nativeEvent.target,
                // @ts-ignore
                e.nativeEvent.data,
                currentScriptForLang,
                true,
                // @ts-ignore
                (val) => {
                  setSearchText(val);
                }
              );
            }}
            disabled={!langId}
            aria-label="Search text"
          />
        </div>

        <div>
          <Select value={String(limit)} onValueChange={(val) => setLimit(Number(val))}>
            <SelectTrigger className="w-36">
              <SelectValue placeholder="Page size" />
            </SelectTrigger>
            <SelectContent>
              {[12, 24, 32, 48].map((sz) => (
                <SelectItem key={sz} value={String(sz)}>
                  {sz} / page
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <ul className="grid grid-cols-4 gap-4 sm:grid-cols-6 md:grid-cols-8">
        {isLoading ? (
          Array.from({ length: limit }).map((_, i) => (
            <li key={`skeleton-${i}`}>
              <Card className="p-2">
                <CardHeader>
                  <Skeleton className="mx-auto h-6 w-16" />
                </CardHeader>
              </Card>
            </li>
          ))
        ) : items.length > 0 ? (
          items.map((item: any) => (
            <li key={item.id}>
              <Link href={`/lessons/edit/${item.id}`}>
                <Card className="p-2 transition duration-200 hover:bg-gray-100 hover:dark:bg-gray-800">
                  <CardHeader>
                    <CardTitle className="text-center">{item.text}</CardTitle>
                  </CardHeader>
                </Card>
              </Link>
            </li>
          ))
        ) : (
          <></>
        )}
      </ul>
      {!!langId && (
        <div className="mx-auto flex w-full max-w-5xl flex-col items-center justify-between gap-3 sm:flex-row">
          <div className="text-sm text-muted-foreground">
            {data ? (
              <span>
                Page {data.page} of {data.pageCount} • Total {data.total}
              </span>
            ) : (
              <span className="text-sm text-muted-foreground">Loading...</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={!data?.hasPrev || isLoading}
            >
              <IoMdArrowDropleft className="mr-1" />
              <span className="sr-only sm:not-sr-only">Prev</span>
            </Button>
            <Button
              variant="secondary"
              onClick={() => setPage((p) => p + 1)}
              disabled={!data?.hasNext || isLoading}
            >
              <span className="sr-only sm:not-sr-only">Next</span>
              <IoMdArrowDropright className="ml-1" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
