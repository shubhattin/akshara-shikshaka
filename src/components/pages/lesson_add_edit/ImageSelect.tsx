'use client';

import { client_q } from '~/api/client';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '~/components/ui/tabs';
import { useEffect, useMemo, useState } from 'react';
import { Button } from '~/components/ui/button';
import { IoAddOutline } from 'react-icons/io5';
import { Input } from '~/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card';
import { Skeleton } from '~/components/ui/skeleton';
import { IoMdArrowDropleft, IoMdArrowDropright } from 'react-icons/io';
import { cn } from '~/lib/utils';
import {
  base_word_script_id_atom,
  lang_id_atom,
  type image_type,
  type text_lesson_word_type
} from './lesson_add_edit_state';
import { FaImage } from 'react-icons/fa';
import { atom, useAtom, useAtomValue } from 'jotai';
import { useQueryClient } from '@tanstack/react-query';

type Props = {
  onImageSelect: (image: image_type) => void;
  wordItem: text_lesson_word_type;
};

const selected_image_atom = atom<image_type | null>(null);

export default function ImageSelect(props: Props) {
  const [tab, setTab] = useState<'add' | 'make'>('add');
  const [selectedImage, setSelectedImage] = useAtom(selected_image_atom);

  useEffect(() => {
    setSelectedImage(null);
  }, [props.wordItem]);

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

const ImageList = () => {
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

  const list_q = client_q.image_assets.list_image_assets.useQuery({
    search_text: debouncedSearch || undefined,
    sort_by: 'created_at',
    order_by: 'desc',
    page,
    limit
  });

  const isLoading = list_q.isLoading || list_q.isFetching;
  const data = list_q.data;
  const items = useMemo(() => data?.list ?? [], [data]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-center gap-2">
        <Input
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          placeholder="Search description..."
          className="max-w-md"
        />
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
  const [, setSelectedImage] = useAtom(selected_image_atom);
  const queryClient = useQueryClient();

  const create_image_mut = client_q.image_assets.make_upload_image_asset.useMutation({
    onSuccess: (data) => {
      if (data.success) {
        setSelectedImage({
          id: data.id,
          description: data.description,
          s3_key: data.s3_key,
          height: 256,
          width: 256
        });
        queryClient.invalidateQueries({
          queryKey: [['image_assets', 'list_image_assets']]
        });
      }
    }
  });
  const lang_id = useAtomValue(lang_id_atom);
  const word_script_id = useAtomValue(base_word_script_id_atom);

  const handleCreateImage = () => {
    create_image_mut.mutate({
      word: wordItem.word,
      lang_id: lang_id,
      word_script_id: word_script_id
    });
  };

  const delete_image_mut = client_q.image_assets.delete_image_asset.useMutation({
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: [['image_assets', 'list_image_assets']]
      });
    }
  });

  const handleDeleteImage = async (image_id: number) => {
    await delete_image_mut.mutateAsync({
      id: image_id
    });
  };

  return (
    <div className="my-8 flex flex-col items-center justify-center space-y-4">
      <div className="flex items-center justify-center">
        <Button
          className="gap-4 text-lg font-semibold text-amber-600 dark:text-amber-400"
          variant={'outline'}
          disabled={create_image_mut.isPending}
          onClick={handleCreateImage}
        >
          <FaImage className="size-7 text-sky-600 dark:text-sky-500" />
          Create Image for Word "{wordItem.word}"
        </Button>
      </div>
      {create_image_mut.isPending && (
        <div className="flex items-center justify-center">
          <Skeleton style={{ height: '256px', width: '256px' }} />
        </div>
      )}
      {create_image_mut.isSuccess && create_image_mut.data.success && (
        <>
          <img
            src={`${process.env.NEXT_PUBLIC_AWS_CLOUDFRONT_URL}/${create_image_mut.data.s3_key}`}
            alt={create_image_mut.data.description}
            className="block rounded object-contain"
            style={{ height: '256px', width: '256px' }}
          />
          <div className="space-x-4">
            <Button
              variant={'destructive'}
              onClick={() => {
                if (!create_image_mut.data.success) return;
                handleDeleteImage(create_image_mut.data.id);
                create_image_mut.reset();
              }}
              disabled={delete_image_mut.isPending}
            >
              Delete Image
            </Button>
            <Button
              variant={'outline'}
              onClick={() => {
                setSelectedImage(null);
                create_image_mut.reset();
                handleCreateImage();
              }}
            >
              Remake Image
            </Button>
          </div>
        </>
      )}
    </div>
  );
};
