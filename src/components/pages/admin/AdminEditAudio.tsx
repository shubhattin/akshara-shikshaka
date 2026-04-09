'use client';

import { useState } from 'react';
import { Link } from '@tanstack/react-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
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
import { toast } from 'sonner';
import { LANG_LIST, lang_list_obj, type lang_list_type } from '~/state/lang_list';

type WordRow = {
  id: number;
  word: string;
  text_lesson_id: number;
  order: number | null;
  lesson: { text: string };
};

type AudioData = {
  id: number;
  description: string;
  s3_key: string;
  type: string;
  lang_id: number | null;
  created_at: Date;
  updated_at: Date;
  words: WordRow[];
};

export default function AdminEditAudio({ audio_data }: { audio_data: AudioData }) {
  const trpc = useTRPC();
  const qc = useQueryClient();
  const [description, setDescription] = useState(audio_data.description);
  const [langId, setLangId] = useState<number | null>(audio_data.lang_id);

  const updateMut = useMutation(
    trpc.audio_assets.update_audio_asset.mutationOptions({
      onSuccess: () => {
        toast.success('Updated');
        void qc.invalidateQueries(trpc.audio_assets.list_audio_assets.pathFilter());
      },
      onError: (e) => toast.error(e.message)
    })
  );

  const cf = import.meta.env.VITE_AWS_CLOUDFRONT_URL;

  return (
    <div className="container mx-auto max-w-6xl px-4 py-6">
      <div className="my-2 mb-4">
        <Link
          to="/audio_assets"
          className="flex items-center gap-1 text-lg font-semibold text-muted-foreground hover:text-foreground"
        >
          <IoMdArrowRoundBack className="inline-block text-xl" />
          Audio List
        </Link>
      </div>

      <div className="mb-6 space-y-4 rounded-md border p-4">
        <div className="space-y-2">
          <Label>Description</Label>
          <Input value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label>Language</Label>
          <Select
            value={langId === null ? 'none' : String(langId)}
            onValueChange={(v) => setLangId(v === 'none' ? null : Number(v))}
          >
            <SelectTrigger className="w-64">
              <SelectValue placeholder="None" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">None</SelectItem>
              {LANG_LIST.map((lang) => (
                <SelectItem key={lang} value={String(lang_list_obj[lang as lang_list_type])}>
                  {lang}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <audio controls className="w-full max-w-md" src={`${cf}/${audio_data.s3_key}`} />
        <Button
          disabled={updateMut.isPending}
          onClick={() =>
            updateMut.mutate({
              id: audio_data.id,
              description,
              lang_id: langId ?? undefined
            })
          }
        >
          Save
        </Button>
      </div>

      <div>
        <h3 className="mb-2 font-semibold">Linked words</h3>
        <ul className="divide-y rounded-md border">
          {audio_data.words.length === 0 ? (
            <li className="p-3 text-muted-foreground">No linked words.</li>
          ) : (
            audio_data.words.map((w) => (
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
