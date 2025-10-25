'use client';
import { useEffect, useRef, useState } from 'react';
import { useTRPC } from '~/api/client';
import { Input } from '~/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '~/components/ui/select';
import { Button } from '~/components/ui/button';
import { Card, CardContent } from '~/components/ui/card';
import { Skeleton } from '~/components/ui/skeleton';
import { IoMdArrowDropleft, IoMdArrowDropright } from 'react-icons/io';
import Link from 'next/link';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '~/components/ui/dropdown-menu';
import { MdDeleteOutline } from 'react-icons/md';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from '~/components/ui/alert-dialog';
import { FaRobot } from 'react-icons/fa';
import { MdMic, MdPlayArrow, MdStop } from 'react-icons/md';
import { get_lang_from_id, LANG_LIST, lang_list_obj, type lang_list_type } from '~/state/lang_list';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

export default function ListAudio() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [searchText, setSearchText] = useState<string>('');
  const [debouncedSearch, setDebouncedSearch] = useState<string>('');
  const [page, setPage] = useState<number>(1);
  const [limit, setLimit] = useState<number>(24);
  const [langFilter, setLangFilter] = useState<number | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playingId, setPlayingId] = useState<number | null>(null);

  useEffect(() => {
    const handle = setTimeout(() => setDebouncedSearch(searchText.trim()), 300);
    return () => clearTimeout(handle);
  }, [searchText]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, langFilter]);

  useEffect(() => {
    return () => {
      if (audioRef.current) audioRef.current.pause();
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

  const data = list_q?.data;
  const items = data?.list ?? [];

  const delete_audio_mut = useMutation(
    trpc.audio_assets.delete_audio_asset.mutationOptions({
      onSuccess: (data, { id }) => {
        if (data.deleted) {
          queryClient.invalidateQueries(trpc.audio_assets.list_audio_assets.pathFilter());
          toast.success(`Audio deleted successfully: ID: ${id}`);
        } else {
          toast.error(`Failed to delete audio: ID: ${id}`);
        }
      },
      onError: (error, { id }) => {
        console.error(error.message);
        toast.error(`Failed to delete audio: ID: ${id}`);
      }
    })
  );
  const [deleteAudioId, setDeleteAudioId] = useState<number | null>(null);

  const handlePlay = (id: number, s3_key: string) => {
    if (playingId === id) {
      if (audioRef.current) audioRef.current.pause();
      setPlayingId(null);
      return;
    }
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    const audio = new Audio(`${process.env.NEXT_PUBLIC_AWS_CLOUDFRONT_URL}/${s3_key}`);
    audioRef.current = audio as any;
    audio.onended = () => setPlayingId(null);
    audio.play();
    setPlayingId(id);
  };

  return (
    <div className="space-y-6">
      <div className="mx-auto flex w-full max-w-5xl flex-col items-stretch justify-between gap-3 sm:flex-row">
        <div className="flex flex-1 items-center gap-2">
          <Input
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            placeholder="Search description..."
            className="max-w-md"
          />
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Select
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
      </div>

      {/* Delete confirmation dialog */}
      <AlertDialog open={deleteAudioId !== null} onOpenChange={() => setDeleteAudioId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Audio</AlertDialogTitle>
          </AlertDialogHeader>
          <div className="p-4">
            <p>
              Are you sure you want to delete this audio asset{' '}
              <span className="text-sm font-semibold">(Id: {deleteAudioId})</span> ?
            </p>
            <p className="mt-2 text-sm text-muted-foreground">This action cannot be undone.</p>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (deleteAudioId) delete_audio_mut.mutate({ id: deleteAudioId });
                setDeleteAudioId(null);
              }}
              className="bg-red-500 hover:bg-red-400"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
        {list_q.isPending ? (
          Array.from({ length: limit }).map((_, i) => (
            <Card className="p-2" key={`skeleton-${i}`}>
              <CardContent className="flex items-start gap-3 p-2 pr-10">
                <Skeleton className="size-12 shrink-0 rounded" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-5/6" />
                  <Skeleton className="h-3 w-3/5" />
                </div>
                <Skeleton className="h-7 w-14 shrink-0" />
              </CardContent>
            </Card>
          ))
        ) : items.length > 0 ? (
          items.map((item) => (
            <Card
              key={item.id}
              className="relative p-2 transition duration-200 hover:bg-gray-100 hover:dark:bg-gray-800"
            >
              <CardContent className="flex items-start gap-3 p-2 pr-10">
                {/* Type Icon Area */}
                <div className="flex size-5 shrink-0 items-center justify-center rounded bg-muted">
                  {item.type === 'ai_generated' ? (
                    <FaRobot className="size-4 text-yellow-600" />
                  ) : (
                    <MdMic className="size-4 text-emerald-600 dark:text-emerald-400" />
                  )}
                </div>

                {/* Content Area */}
                <Link href={`/audio_assets/edit/${item.id}`} className="min-w-0 flex-1">
                  <div className="space-y-1">
                    <p className="line-clamp-2 text-sm hover:text-foreground">{item.description}</p>
                    {langFilter === null && item.lang_id != null && (
                      <p className="text-[10px] text-muted-foreground">
                        {get_lang_from_id(item.lang_id)}
                      </p>
                    )}
                  </div>
                </Link>

                {/* Action Area */}
                <div className="flex shrink-0 items-start">
                  <Button
                    size="sm"
                    variant="secondary"
                    className="h-7 px-2 text-xs"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      handlePlay(item.id, item.s3_key);
                    }}
                  >
                    {playingId === item.id ? (
                      <span className="flex items-center gap-1">
                        <MdStop className="size-3" />
                        Stop
                      </span>
                    ) : (
                      <span className="flex items-center gap-1">
                        <MdPlayArrow className="size-3" />
                        Play
                      </span>
                    )}
                  </Button>
                </div>
              </CardContent>

              {/* Dropdown Menu */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="absolute top-1 right-1 h-6 w-6 p-0 text-muted-foreground hover:text-foreground"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                    }}
                  >
                    <span className="text-sm">⋮</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem
                    onSelect={(e) => e.preventDefault()}
                    className="gap-2"
                    onClick={() => setDeleteAudioId(item.id)}
                  >
                    <MdDeleteOutline className="mr-1 size-4 text-destructive" />
                    <span className="font-semibold">Delete Audio</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </Card>
          ))
        ) : (
          <></>
        )}
      </div>

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
            disabled={!data?.hasPrev || list_q.isLoading || list_q.isFetching}
          >
            <IoMdArrowDropleft className="mr-1" />
            <span className="sr-only sm:not-sr-only">Prev</span>
          </Button>
          <Button
            variant="secondary"
            onClick={() => setPage((p) => p + 1)}
            disabled={!data?.hasNext || list_q.isLoading || list_q.isFetching}
          >
            <span className="sr-only sm:not-sr-only">Next</span>
            <IoMdArrowDropright className="ml-1" />
          </Button>
        </div>
      </div>
    </div>
  );
}
