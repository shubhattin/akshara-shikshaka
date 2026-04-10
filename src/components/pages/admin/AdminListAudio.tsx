'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { useTRPC } from '~/api/client';
import { Button, buttonVariants } from '~/components/ui/button';
import { Input } from '~/components/ui/input';
import { Label } from '~/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '~/components/ui/select';
import { IoMdArrowRoundBack } from 'react-icons/io';
import { MdPlayArrow } from 'react-icons/md';
import { LANG_LIST, lang_list_obj, type lang_list_type } from '~/state/lang_list';

export default function AdminListAudio() {
  const trpc = useTRPC();
  const [searchText, setSearchText] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [page, setPage] = useState(1);
  const [langFilter, setLangFilter] = useState<number | null>(null);
  const [playingId, setPlayingId] = useState<number | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const limit = 12;

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchText.trim()), 300);
    return () => clearTimeout(t);
  }, [searchText]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, langFilter]);

  useEffect(() => {
    return () => {
      audioRef.current?.pause();
    };
  }, []);

  const list_q = useQuery(
    trpc.audio_assets.list_audio_assets.queryOptions({
      search_text: debouncedSearch || undefined,
      sort_by: 'created_at',
      order_by: 'desc',
      page,
      limit,
      lang_id: langFilter
    })
  );

  const items = useMemo(() => list_q.data?.list ?? [], [list_q.data]);
  const pageCount = list_q.data?.pageCount ?? 1;

  const langSelectItems = useMemo(
    () => [
      { label: 'All', value: 'all' },
      ...LANG_LIST.map((lang) => ({
        label: lang,
        value: String(lang_list_obj[lang as lang_list_type])
      }))
    ],
    []
  );

  const handlePlay = (id: number, s3_key: string) => {
    if (playingId === id) {
      audioRef.current?.pause();
      setPlayingId(null);
      return;
    }
    audioRef.current?.pause();
    const audio = new Audio(`${import.meta.env.VITE_AWS_CLOUDFRONT_URL}/${s3_key}`);
    audioRef.current = audio;
    audio.onended = () => setPlayingId(null);
    void audio.play();
    setPlayingId(id);
  };

  return (
    <div className="container mx-auto max-w-6xl px-4 py-6">
      <div className="my-2 mb-4">
        <Link to="/" className="flex items-center gap-1 text-lg font-semibold">
          <IoMdArrowRoundBack className="inline-block text-xl" />
          Home Page
        </Link>
      </div>

      <div className="mb-6 flex flex-wrap items-center gap-4">
        <Input
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          placeholder="Search description..."
          className="max-w-sm"
        />
        <div className="flex items-center gap-2">
          <Label className="text-sm font-semibold">Language</Label>
          <Select
            items={langSelectItems}
            value={langFilter === null ? 'all' : String(langFilter)}
            onValueChange={(v) => setLangFilter(v === 'all' ? null : Number(v))}
          >
            <SelectTrigger className="w-36">
              <SelectValue placeholder="All" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              {LANG_LIST.map((lang) => (
                <SelectItem key={lang} value={String(lang_list_obj[lang as lang_list_type])}>
                  {lang}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <ul className="divide-y rounded-md border">
        {list_q.isLoading ? (
          <li className="p-4 text-muted-foreground">Loading…</li>
        ) : items.length === 0 ? (
          <li className="p-4 text-muted-foreground">No audio assets.</li>
        ) : (
          items.map((item) => (
            <li
              key={item.id}
              className="flex flex-wrap items-center justify-between gap-2 px-4 py-3"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{item.description}</p>
                <p className="text-xs text-muted-foreground">#{item.id}</p>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  size="icon"
                  variant="outline"
                  onClick={() => handlePlay(item.id, item.s3_key)}
                >
                  <MdPlayArrow className="size-5" />
                </Button>
                <Link
                  to="/audio_assets/edit/$id"
                  params={{ id: `${encodeURIComponent(item.description)}:${item.id}` }}
                  className={buttonVariants({ variant: 'secondary', size: 'sm' })}
                >
                  Edit
                </Link>
              </div>
            </li>
          ))
        )}
      </ul>

      <div className="mt-4 flex justify-center gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={page <= 1}
          onClick={() => setPage((p) => Math.max(1, p - 1))}
        >
          Prev
        </Button>
        <span className="self-center text-sm text-muted-foreground">
          Page {page} / {pageCount}
        </span>
        <Button
          variant="outline"
          size="sm"
          disabled={page >= pageCount}
          onClick={() => setPage((p) => p + 1)}
        >
          Next
        </Button>
      </div>
    </div>
  );
}
