'use client';

import { useEffect, useMemo, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { useTRPC } from '~/api/client';
import { Button, buttonVariants } from '~/components/ui/button';
import { Input } from '~/components/ui/input';
import { IoMdArrowRoundBack } from 'react-icons/io';

export default function AdminListImages() {
  const trpc = useTRPC();
  const [searchText, setSearchText] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [page, setPage] = useState(1);
  const limit = 12;

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchText.trim()), 300);
    return () => clearTimeout(t);
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

  const items = useMemo(() => list_q.data?.list ?? [], [list_q.data]);
  const pageCount = list_q.data?.pageCount ?? 1;
  const cf = import.meta.env.VITE_AWS_CLOUDFRONT_URL;

  return (
    <div className="container mx-auto max-w-6xl px-4 py-6">
      <div className="my-2 mb-4">
        <Link to="/" className="flex items-center gap-1 text-lg font-semibold">
          <IoMdArrowRoundBack className="inline-block text-xl" />
          Home Page
        </Link>
      </div>

      <div className="mb-6">
        <Input
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          placeholder="Search description..."
          className="max-w-sm"
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {list_q.isLoading ? (
          <p className="text-muted-foreground">Loading…</p>
        ) : items.length === 0 ? (
          <p className="text-muted-foreground">No images.</p>
        ) : (
          items.map((item) => (
            <div key={item.id} className="overflow-hidden rounded-md border">
              <img
                src={`${cf}/${item.s3_key}`}
                alt={item.description}
                className="aspect-video w-full object-cover"
              />
              <div className="flex items-center justify-between gap-2 p-2">
                <p className="truncate text-sm font-medium">{item.description}</p>
                <Link
                  to="/image_assets/edit/$id"
                  params={{ id: `${encodeURIComponent(item.description)}:${item.id}` }}
                  className={buttonVariants({ variant: 'secondary', size: 'sm' })}
                >
                  Edit
                </Link>
              </div>
            </div>
          ))
        )}
      </div>

      <div className="mt-6 flex justify-center gap-2">
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
