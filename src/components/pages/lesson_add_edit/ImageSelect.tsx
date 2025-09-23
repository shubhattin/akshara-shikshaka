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

type Props = {
  onImageSelect: (image_id: number) => void;
};

export default function ImageSelect({ onImageSelect }: Props) {
  const [tab, setTab] = useState<'add' | 'make'>('add');
  const [selectedImage, setSelectedImage] = useState<number | null>(null);

  return (
    <div className="space-y-4">
      <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)} className="w-full">
        <TabsList className="flex w-full items-center justify-center">
          <TabsTrigger value="add">Select from Existing</TabsTrigger>
          <TabsTrigger value="make">Create New Image</TabsTrigger>
        </TabsList>
        <TabsContent value="add">
          <ImageList selectedImage={selectedImage} setSelectedImage={setSelectedImage} />
        </TabsContent>
        <TabsContent value="make">
          <div className="text-center text-sm text-muted-foreground">
            Image creation will appear here.
          </div>
        </TabsContent>
      </Tabs>
      <Button
        onClick={() => onImageSelect(selectedImage!)}
        disabled={!selectedImage}
        className="text-lg"
        variant="outline"
      >
        <IoAddOutline className="size-6 text-yellow-600 dark:text-yellow-400" /> Add Image to Word
      </Button>
    </div>
  );
}

type ImageListProps = {
  selectedImage: number | null;
  setSelectedImage: (image_id: number) => void;
};

const ImageList = ({ selectedImage, setSelectedImage }: ImageListProps) => {
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
    order_by: 'asc',
    page,
    limit
  });

  const isLoading = list_q.isLoading || list_q.isFetching;
  const data = list_q.data;
  const items = useMemo(() => data?.list ?? [], [data]);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
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
          : items.map((item: any) => {
              const selected = selectedImage === item.id;
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedImage(item.id)}
                    className="w-full text-left"
                  >
                    <Card
                      className={cn(
                        'p-2 transition duration-200 hover:bg-gray-100 hover:dark:bg-gray-800',
                        selected && 'ring-2 ring-blue-500'
                      )}
                    >
                      <CardHeader className="p-2">
                        <CardTitle className="text-xs text-muted-foreground">
                          {new Date(item.created_at).toLocaleDateString()}
                        </CardTitle>
                      </CardHeader>
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
