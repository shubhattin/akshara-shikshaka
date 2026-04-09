'use client';

import { useState } from 'react';
import { Link } from '@tanstack/react-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTRPC } from '~/api/client';
import { Button, buttonVariants } from '~/components/ui/button';
import { Input } from '~/components/ui/input';
import { Label } from '~/components/ui/label';
import { IoMdArrowRoundBack } from 'react-icons/io';
import { toast } from 'sonner';

type WordRow = {
  id: number;
  word: string;
  text_lesson_id: number;
  order: number | null;
  lesson: { text: string };
};

type ImageData = {
  id: number;
  description: string;
  s3_key: string;
  height: number | null;
  width: number | null;
  created_at: Date;
  updated_at: Date;
  words: WordRow[];
};

export default function AdminEditImage({ image_data }: { image_data: ImageData }) {
  const trpc = useTRPC();
  const qc = useQueryClient();
  const [description, setDescription] = useState(image_data.description);

  const updateMut = useMutation(
    trpc.image_assets.update_image_asset.mutationOptions({
      onSuccess: () => {
        toast.success('Updated');
        void qc.invalidateQueries(trpc.image_assets.list_image_assets.queryFilter());
      },
      onError: (e) => toast.error(e.message)
    })
  );

  const cf = import.meta.env.VITE_AWS_CLOUDFRONT_URL;

  return (
    <div className="container mx-auto max-w-6xl px-4 py-6">
      <div className="my-2 mb-4">
        <Link
          to="/image_assets"
          className="flex items-center gap-1 text-lg font-semibold text-muted-foreground hover:text-foreground"
        >
          <IoMdArrowRoundBack className="inline-block text-xl" />
          Image List
        </Link>
      </div>

      <div className="mb-6 grid gap-6 md:grid-cols-2">
        <img
          src={`${cf}/${image_data.s3_key}`}
          alt={description}
          className="max-h-[480px] w-full rounded-md border object-contain"
        />
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Description</Label>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <p className="text-sm text-muted-foreground">
            {image_data.width}×{image_data.height}
          </p>
          <Button
            disabled={updateMut.isPending}
            onClick={() =>
              updateMut.mutate({
                id: image_data.id,
                description
              })
            }
          >
            Save
          </Button>
        </div>
      </div>

      <div>
        <h3 className="mb-2 font-semibold">Linked words</h3>
        <ul className="divide-y rounded-md border">
          {image_data.words.length === 0 ? (
            <li className="p-3 text-muted-foreground">No linked words.</li>
          ) : (
            image_data.words.map((w) => (
              <li key={w.id} className="flex justify-between px-3 py-2 text-sm">
                <span>
                  {w.word} — lesson: {w.lesson.text}
                </span>
                <Link
                  to="/lessons/edit/$id"
                  params={{ id: String(w.text_lesson_id) }}
                  className={buttonVariants({ variant: 'link', size: 'sm' })}
                >
                  Open lesson
                </Link>
              </li>
            ))
          )}
        </ul>
      </div>
    </div>
  );
}
