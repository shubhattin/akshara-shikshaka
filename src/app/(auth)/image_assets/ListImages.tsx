'use client';
import { useEffect, useMemo, useState } from 'react';
import { client_q } from '~/api/client';
import { Input } from '~/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '~/components/ui/select';
import { Button } from '~/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card';
import { Skeleton } from '~/components/ui/skeleton';
import { IoMdArrowDropleft, IoMdArrowDropright } from 'react-icons/io';
import { Filter, ArrowUpDown } from 'lucide-react';

const DEFAULT_LIMIT = 24;

export default function ListImages() {
  const [searchText, setSearchText] = useState<string>('');
  const [debouncedSearch, setDebouncedSearch] = useState<string>('');
  const [sortBy, setSortBy] = useState<'created_at' | 'updated_at'>('created_at');
  const [orderBy, setOrderBy] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState<number>(1);
  const [limit, setLimit] = useState<number>(DEFAULT_LIMIT);

  useEffect(() => {
    const handle = setTimeout(() => setDebouncedSearch(searchText.trim()), 300);
    return () => clearTimeout(handle);
  }, [searchText]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, sortBy, orderBy, limit]);

  const list_q = client_q.image_assets?.list_image_assets.useQuery(
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
  ) as any;

  const isLoading = list_q?.isLoading || list_q?.isFetching;
  const data = list_q?.data;
  const items = useMemo(() => data?.list ?? [], [data]);

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
        {isLoading ? (
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
          items.map((item: any) => (
            <li key={item.id}>
              <Card className="p-2 transition duration-200 hover:bg-gray-100 hover:dark:bg-gray-800">
                <CardHeader className="p-2">
                  <CardTitle className="text-sm text-muted-foreground">
                    {new Date(item[sortBy]).toLocaleDateString()}
                  </CardTitle>
                </CardHeader>
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
    </div>
  );
}
