'use client';
import { useTRPC } from '~/api/client';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '~/components/ui/tabs';
import { useEffect, useMemo, useState } from 'react';
import { Button } from '~/components/ui/button';
import { IoAddOutline } from 'react-icons/io5';
import { Input } from '~/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card';
import { Skeleton } from '~/components/ui/skeleton';
import { Progress } from '~/components/ui/progress';
import { Textarea } from '~/components/ui/textarea';
import { IoMdArrowDropleft, IoMdArrowDropright } from 'react-icons/io';
import { cn } from '~/lib/utils';
import {
  base_word_script_id_atom,
  lang_id_atom,
  type image_type,
  type text_lesson_word_type
} from './lesson_add_edit_state';
import { FaExternalLinkAlt, FaImage } from 'react-icons/fa';
import { atom, useAtom, useAtomValue } from 'jotai';
import { useQueryClient } from '@tanstack/react-query';
import ms from 'ms';
import { Label } from '~/components/ui/label';

import { useQuery } from '@tanstack/react-query';
import { useMutation } from '@tanstack/react-query';
import Link from 'next/link';

type Props = {
  onImageSelect: (image: image_type) => void;
  wordItem: text_lesson_word_type;
};

const selected_image_atom = atom<image_type | null>(null);

export default function ImageSelect(props: Props) {
  const [tab, setTab] = useState<'add' | 'make'>('make');
  const [selectedImage, setSelectedImage] = useAtom(selected_image_atom);

  useEffect(() => {
    setSelectedImage(null);
  }, [tab, props.wordItem]);

  return (
    <div className="space-y-4">
      <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)} className="w-full">
        <TabsList className="flex w-full items-center justify-center">
          <TabsTrigger value="add">Select from Existing</TabsTrigger>
          <TabsTrigger value="make">Create New Image</TabsTrigger>
        </TabsList>
        <TabsContent value="add">
          <ImageList />
        </TabsContent>
        <TabsContent value="make">
          <ImageCreation {...props} />
        </TabsContent>
      </Tabs>
      <Button
        onClick={() => props.onImageSelect(selectedImage!)}
        disabled={!selectedImage}
        className="text-lg"
        variant="outline"
      >
        <IoAddOutline className="size-6 text-yellow-600 dark:text-yellow-400" /> Add Image to Word
      </Button>
    </div>
  );
}

const IMAGE_AVERAGE_TIME_MS = ms('28s');

const ImageList = () => {
  const trpc = useTRPC();
  const [selectedImage, setSelectedImage] = useAtom(selected_image_atom);
  const [searchText, setSearchText] = useState<string>('');
  const [debouncedSearch, setDebouncedSearch] = useState<string>('');
  const [page, setPage] = useState<number>(1);
  const limit = 12;

  useEffect(() => {
    const handle = setTimeout(() => setDebouncedSearch(searchText.trim()), 300);
    return () => clearTimeout(handle);
  }, [searchText]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch]);

  const list_q = useQuery(
    trpc.image_assets.list_image_assets.queryOptions({
      search_text: debouncedSearch || undefined,
      sort_by: 'created_at',
      order_by: 'desc',
      page,
      limit
    })
  );

  const isLoading = list_q.isLoading || list_q.isFetching;
  const data = list_q.data;
  const items = useMemo(() => data?.list ?? [], [data]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-center gap-4 md:gap-6 lg:gap-8">
        <Input
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          placeholder="Search description..."
          className="max-w-md"
        />
        <Link href="/image_assets" target="_blank" className="group flex items-center gap-2">
          <FaExternalLinkAlt className="size-4 text-yellow-300 group-hover:text-blue-400" />
          <span className="text-sm text-teal-300 group-hover:text-sky-400">Manage Images</span>
        </Link>
      </div>

      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
        {isLoading
          ? Array.from({ length: limit }).map((_, i) => (
              <li key={`skeleton-${i}`}>
                <Card className="p-2">
                  <CardContent className="flex items-start gap-3 p-2">
                    <Skeleton className="h-14 w-14 rounded" />
                    <div className="flex-1 space-y-2">
                      <Skeleton className="h-4 w-5/6" />
                      <Skeleton className="h-4 w-3/5" />
                    </div>
                  </CardContent>
                </Card>
              </li>
            ))
          : items.map((item) => {
              const selected = selectedImage?.id === item.id;
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => {
                      if (selected) {
                        setSelectedImage(null);
                      } else {
                        setSelectedImage({
                          id: item.id,
                          description: item.description,
                          s3_key: item.s3_key,
                          height: 256,
                          width: 256
                        });
                      }
                    }}
                    className="w-full text-left"
                  >
                    <Card
                      className={cn(
                        'p-2 transition duration-200 hover:bg-gray-100 hover:dark:bg-gray-800',
                        selected && 'ring-2 ring-blue-500'
                      )}
                    >
                      {/* <CardHeader className="p-2">
                        <CardTitle className="text-xs text-muted-foreground">
                          {new Date(item.created_at).toLocaleDateString()}
                        </CardTitle>
                      </CardHeader> */}
                      <CardContent className="flex items-start gap-3 p-2">
                        <img
                          src={`${process.env.NEXT_PUBLIC_AWS_CLOUDFRONT_URL}/${item.s3_key}`}
                          alt={item.description}
                          className="h-14 w-14 rounded object-cover"
                          loading="lazy"
                        />
                        <div className="min-w-0 flex-1">
                          <p className="line-clamp-2 text-xs">{item.description}</p>
                        </div>
                      </CardContent>
                    </Card>
                  </button>
                </li>
              );
            })}
      </ul>

      <div className="mx-auto flex w-full items-center justify-between gap-2">
        <div className="text-xs text-muted-foreground">
          {data ? (
            <span>
              Page {data.page} of {data.pageCount} • Total {data.total}
            </span>
          ) : (
            <span className="text-xs text-muted-foreground">Loading...</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={!data?.hasPrev || isLoading}
            className="h-8 px-2 text-xs"
          >
            <IoMdArrowDropleft className="mr-1" />
            Prev
          </Button>
          <Button
            variant="secondary"
            onClick={() => setPage((p) => p + 1)}
            disabled={!data?.hasNext || isLoading}
            className="h-8 px-2 text-xs"
          >
            Next
            <IoMdArrowDropright className="ml-1" />
          </Button>
        </div>
      </div>
    </div>
  );
};

const ImageCreation = ({ wordItem }: Props) => {
  const trpc = useTRPC();
  const [, setSelectedImage] = useAtom(selected_image_atom);
  const queryClient = useQueryClient();
  const [elapsedTime, setElapsedTime] = useState(0);
  const [imagePrompt, setImagePrompt] = useState('');

  const create_image_mut = useMutation(
    trpc.image_assets.make_upload_image_asset.mutationOptions({
      onSuccess: (data) => {
        if (data.success) {
          setSelectedImage({
            id: data.id,
            description: data.description,
            s3_key: data.s3_key,
            height: 256,
            width: 256
          });
          setImagePrompt(data.image_prompt);
          queryClient.invalidateQueries(trpc.image_assets.list_image_assets.queryFilter());
        }
      }
    })
  );
  const lang_id = useAtomValue(lang_id_atom);
  const word_script_id = useAtomValue(base_word_script_id_atom);

  const handleCreateImage = (existingPrompt?: string) => {
    setSelectedImage(null);
    create_image_mut.reset();
    create_image_mut.mutate({
      word: wordItem.word,
      lang_id: lang_id,
      word_script_id: word_script_id,
      existing_image_prompt: existingPrompt || imagePrompt || undefined
    });
  };

  const delete_image_mut = useMutation(
    trpc.image_assets.delete_image_asset.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries(trpc.image_assets.list_image_assets.pathFilter());
        setSelectedImage(null);
      }
    })
  );

  const handleDeleteImage = async (image_id: number) => {
    await delete_image_mut.mutateAsync({
      id: image_id
    });
  };

  const handleDeleteAndRemake = async () => {
    if (!create_image_mut.data?.success) return;
    await handleDeleteImage(create_image_mut.data.id);
    handleCreateImage();
  };

  const handleRemakeImage = () => {
    handleCreateImage();
  };

  // Timer effect for tracking elapsed time
  useEffect(() => {
    let intervalId: NodeJS.Timeout | null = null;

    if (create_image_mut.isPending) {
      // Reset elapsed time when starting
      setElapsedTime(0);

      // Start timer that updates every 100ms for smooth progress
      intervalId = setInterval(() => {
        setElapsedTime((prev) => prev + 100);
      }, 100);
    }

    return () => {
      if (intervalId) {
        clearInterval(intervalId);
      }
    };
  }, [create_image_mut.isPending]);

  // Reset elapsed time when mutation completes or resets
  useEffect(() => {
    if (create_image_mut.isSuccess || create_image_mut.isError || !create_image_mut.isPending) {
      setElapsedTime(0);
    }
  }, [create_image_mut.isSuccess, create_image_mut.isError, create_image_mut.isPending]);

  // Reset image prompt when mutation resets
  useEffect(() => {
    if (create_image_mut.isIdle) {
      setImagePrompt('');
    }
  }, [create_image_mut.isIdle]);

  return (
    <div className="my-6 flex flex-col items-center justify-center space-y-4">
      <div className="flex items-center justify-center">
        {!create_image_mut.isSuccess && (
          <Button
            className="gap-4 text-lg font-semibold text-amber-600 dark:text-amber-400"
            variant={'outline'}
            disabled={create_image_mut.isPending}
            onClick={() => handleCreateImage()}
          >
            <FaImage className="size-7 text-sky-600 dark:text-sky-500" />
            Create Image for Word "{wordItem.word}"
          </Button>
        )}
      </div>
      {create_image_mut.isPending && (
        <div className="flex flex-col items-center justify-center space-y-4">
          <div className="flex items-center justify-center">
            <Skeleton style={{ height: '256px', width: '256px' }} />
          </div>
          <div className="w-64 space-y-2">
            <Progress
              value={Math.min((elapsedTime / IMAGE_AVERAGE_TIME_MS) * 100, 100)}
              className="h-2"
            />
            {/* <p className="text-center text-sm text-muted-foreground">
              Creating image... {Math.round(elapsedTime / 1000)}s /{' '}
              {Math.round(IMAGE_AVERAGE_TIME_MS / 1000)}s
            </p> */}
          </div>
        </div>
      )}
      {create_image_mut.isSuccess && create_image_mut.data.success && (
        <>
          <div className="space-y-1">
            <span className="line-clamp-2 text-center text-sm text-muted-foreground">
              {create_image_mut.data.description}
            </span>
            <img
              src={`${process.env.NEXT_PUBLIC_AWS_CLOUDFRONT_URL}/${create_image_mut.data.s3_key}`}
              alt={create_image_mut.data.description}
              title={create_image_mut.data.image_prompt}
              className="block rounded object-contain"
              style={{ height: '256px', width: '256px' }}
            />
          </div>
          <div className="space-x-4">
            <Button
              variant={'destructive'}
              onClick={async () => {
                if (!create_image_mut.data.success) return;
                await handleDeleteImage(create_image_mut.data.id);
                setSelectedImage(null);
                create_image_mut.reset();
              }}
              disabled={delete_image_mut.isPending}
            >
              Delete Image
            </Button>
            <Button
              variant={'outline'}
              onClick={() => {
                handleCreateImage();
              }}
              disabled={delete_image_mut.isPending}
            >
              Remake Image
            </Button>
          </div>
          <div className="flex flex-col items-center justify-center space-y-4">
            <div className="text-base font-semibold">Edit Image Prompt</div>
            <div className="w-full space-y-2">
              <Label className="text-sm font-semibold">Image Prompt</Label>
              <Textarea
                value={imagePrompt}
                onChange={(e) => setImagePrompt(e.target.value)}
                placeholder="Enter custom image prompt..."
                className="h-24 resize-none text-sm sm:w-[70vw] md:w-[50vw] lg:w-[45vw]"
              />
            </div>
            <div className="flex items-center justify-center space-x-4">
              <Button
                variant={'blue'}
                onClick={handleDeleteAndRemake}
                disabled={delete_image_mut.isPending || !create_image_mut.data?.success}
              >
                Delete and Make Image
              </Button>
              <Button variant={'outline'} onClick={() => handleRemakeImage()}>
                Make Image
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
