'use client';
import { useEffect, useState } from 'react';
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
import { Filter, ArrowUpDown, MoreVertical, CalendarIcon } from 'lucide-react';
import Link from 'next/link';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '~/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from '~/components/ui/alert-dialog';
import { useQueryClient } from '@tanstack/react-query';
import { MdDeleteOutline } from 'react-icons/md';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import { toast } from 'sonner';
import { useQuery } from '@tanstack/react-query';
import { useMutation } from '@tanstack/react-query';

dayjs.extend(relativeTime);

const DEFAULT_LIMIT = 24;

export default function ListImages() {
  const trpc = useTRPC();
  const [searchText, setSearchText] = useState<string>('');
  const [debouncedSearch, setDebouncedSearch] = useState<string>('');
  const [sortBy, setSortBy] = useState<'created_at' | 'updated_at'>('created_at');
  const [orderBy, setOrderBy] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState<number>(1);
  const [limit, setLimit] = useState<number>(DEFAULT_LIMIT);
  const [deleteImageId, setDeleteImageId] = useState<number | null>(null);
  const queryClient = useQueryClient();

  useEffect(() => {
    const handle = setTimeout(() => setDebouncedSearch(searchText.trim()), 300);
    return () => clearTimeout(handle);
  }, [searchText]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, sortBy, orderBy, limit]);

  const list_q = useQuery(
    trpc.image_assets.list_image_assets.queryOptions(
      {
        search_text: debouncedSearch || undefined,
        sort_by: sortBy,
        order_by: orderBy,
        page,
        limit
      },
      {
        enabled: true
      }
    )
  );

  const data = list_q?.data;
  const items = data?.list ?? [];

  const delete_image_mut = useMutation(
    trpc.image_assets.delete_image_asset.mutationOptions({
      onSuccess: (data, { id }) => {
        if (data.deleted) {
          queryClient.invalidateQueries(trpc.image_assets.list_image_assets.pathFilter());
          toast.success(`Image deleted successfully: ID: ${id}`);
        } else {
          toast.error(`Failed to delete image: ID: ${id}`);
        }
      },
      onError: (error, { id }) => {
        console.error(error.message);
        toast.error(`Failed to delete image: ID: ${id}`);
      }
    })
  );

  return (
    <div className="space-y-6">
      <div className="mx-auto flex w-full max-w-5xl flex-col items-stretch justify-between gap-3 sm:flex-row">
        <div className="flex flex-1 items-center gap-2">
          <Filter className="size-4 text-muted-foreground" />
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
              value={sortBy}
              onValueChange={(val) => setSortBy(val as 'created_at' | 'updated_at')}
            >
              <SelectTrigger className="w-36">
                <SelectValue placeholder="Sort by" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="created_at">Created</SelectItem>
                <SelectItem value="updated_at">Updated</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <ArrowUpDown className="size-4 text-muted-foreground" />
            <Select value={orderBy} onValueChange={(val) => setOrderBy(val as 'asc' | 'desc')}>
              <SelectTrigger className="w-36">
                <SelectValue placeholder="Order" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="desc">Latest</SelectItem>
                <SelectItem value="asc">Oldest</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Select value={String(limit)} onValueChange={(val) => setLimit(Number(val))}>
            <SelectTrigger className="w-32">
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

      <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
        {list_q.isPending ? (
          Array.from({ length: limit }).map((_, i) => (
            <li key={`skeleton-${i}`}>
              <Card className="p-2">
                <CardContent className="flex items-start gap-3 p-2">
                  <Skeleton className="h-16 w-16 rounded" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-5/6" />
                    <Skeleton className="h-4 w-3/5" />
                  </div>
                </CardContent>
              </Card>
            </li>
          ))
        ) : items.length > 0 ? (
          items.map((item) => (
            <li key={item.id}>
              <Card className="relative p-2 transition duration-200 hover:bg-gray-100 hover:dark:bg-gray-800">
                <Link href={`/image_assets/edit/${item.id}`} className="block">
                  <CardContent className="flex items-start gap-3 p-2">
                    <img
                      src={`${process.env.NEXT_PUBLIC_AWS_CLOUDFRONT_URL}/${item.s3_key}`}
                      alt={item.description}
                      className="h-16 w-16 rounded object-cover"
                      loading="lazy"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="line-clamp-2 text-sm">{item.description}</p>
                    </div>
                  </CardContent>
                </Link>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="absolute top-2 right-2 h-8 w-8 p-0"
                      onClick={(e) => e.preventDefault()}
                    >
                      <MoreVertical className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem
                      onSelect={(e) => e.preventDefault()}
                      className="gap-2"
                      onClick={() => setDeleteImageId(item.id)}
                    >
                      <MdDeleteOutline className="mr-1 size-5 text-destructive" />
                      <span className="font-semibold">Delete Image</span>
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem className="flex items-center gap-1 text-sm text-muted-foreground">
                      <CalendarIcon className="inline-block size-3" />
                      {dayjs(item.created_at).format('MMM D, YYYY')}
                    </DropdownMenuItem>
                    {/* <DropdownMenuItem className="flex items-center gap-1 text-sm text-muted-foreground">
                      <RxUpdate className="inline-block size-3" />
                      {dayjs(item.updated_at).format('MMM D, YYYY')}
                    </DropdownMenuItem> */}
                  </DropdownMenuContent>
                </DropdownMenu>
                <span className="flex items-center gap-1 text-sm text-muted-foreground">
                  <CalendarIcon className="inline-block size-3" />
                  {dayjs(item.created_at).fromNow()}
                </span>
              </Card>
            </li>
          ))
        ) : (
          <></>
        )}
      </ul>

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

      {/* Alert Dialog for delete confirmation */}
      <AlertDialog open={deleteImageId !== null} onOpenChange={() => setDeleteImageId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Image</AlertDialogTitle>
            <AlertDialogDescription>
              <div>Are you sure you want to delete this image?</div>
              <div>
                <span className="font-bold">ID:</span> {deleteImageId}
              </div>
              <br />
              <div>
                <span className="font-bold">Description:</span>{' '}
                {items.find((item) => item.id === deleteImageId)?.description}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (deleteImageId) delete_image_mut.mutate({ id: deleteImageId });
                setDeleteImageId(null);
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
