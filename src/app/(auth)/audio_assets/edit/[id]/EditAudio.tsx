'use client';
import { atom, useAtom, useAtomValue } from 'jotai';
import { useHydrateAtoms } from 'jotai/utils';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { useTRPC } from '~/api/client';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger
} from '~/components/ui/alert-dialog';
import { Button } from '~/components/ui/button';
import { Card, CardContent } from '~/components/ui/card';
import { Input } from '~/components/ui/input';
import { Label } from '~/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '~/components/ui/select';
import { Skeleton } from '~/components/ui/skeleton';
import { MdDeleteOutline, MdPlayArrow, MdStop, MdEdit } from 'react-icons/md';
import { useQueryClient, useMutation } from '@tanstack/react-query';
import { LANG_LIST, lang_list_obj, type lang_list_type, get_lang_from_id } from '~/state/lang_list';

const audio_data_atom = atom<{
  id: number;
  description: string;
  s3_key: string;
  type: 'ai_generated' | 'recorded';
  lang_id: number | null;
  created_at: Date;
  updated_at: Date;
} | null>(null);

type Props = {
  audio_data: {
    id: number;
    description: string;
    s3_key: string;
    type: 'ai_generated' | 'recorded';
    lang_id: number | null;
    created_at: Date;
    updated_at: Date;
  };
  words: {
    id: number;
    word: string;
    text_lesson_id: number;
    order: number;
    lesson: {
      text: string;
    };
  }[];
};

export default function EditAudio({ audio_data, words }: Props) {
  useHydrateAtoms([[audio_data_atom, audio_data]]);
  return (
    <div className="space-y-6">
      <AudioInfo />
      <AssociatedWords words={words} />
      <EditActions />
    </div>
  );
}

const AudioInfo = () => {
  const audio_data = useAtomValue(audio_data_atom);
  const [isEditing, setIsEditing] = useState(false);
  const [description, setDescription] = useState('');
  const [langId, setLangId] = useState<string>('all');
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!audio_data) return;
    setDescription(audio_data.description);
    setLangId(audio_data.lang_id == null ? 'all' : String(audio_data.lang_id));
  }, [audio_data]);

  const update_audio_mut = useMutation(
    trpc.audio_assets.update_audio_asset.mutationOptions({
      onSuccess: () => {
        toast.success('Audio updated successfully');
        queryClient.invalidateQueries(trpc.audio_assets.list_audio_assets.pathFilter());
        setIsEditing(false);
      }
    })
  );

  const handleSave = () => {
    if (!audio_data) return;
    const lid = langId === 'all' ? null : Number(langId);
    update_audio_mut.mutate({ id: audio_data.id, description: description.trim(), lang_id: lid });
  };

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  useEffect(
    () => () => {
      if (audioRef.current) audioRef.current.pause();
    },
    []
  );
  const togglePlay = () => {
    if (!audio_data) return;
    if (playing) {
      if (audioRef.current) audioRef.current.pause();
      setPlaying(false);
      return;
    }
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    const audio = new Audio(`${process.env.NEXT_PUBLIC_AWS_CLOUDFRONT_URL}/${audio_data.s3_key}`);
    audioRef.current = audio as any;
    audio.onended = () => setPlaying(false);
    audio.play();
    setPlaying(true);
  };

  if (!audio_data) return <Skeleton className="h-64 w-full" />;

  return (
    <Card>
      <CardContent className="space-y-4 p-6">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold">Edit Audio Asset</h2>
        </div>
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="text-sm font-medium">Audio Preview</Label>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="secondary" onClick={togglePlay}>
                  {playing ? (
                    <span className="flex items-center gap-1">
                      <MdStop /> Stop
                    </span>
                  ) : (
                    <span className="flex items-center gap-1">
                      <MdPlayArrow /> Play
                    </span>
                  )}
                </Button>
                <span className="text-sm text-muted-foreground">{audio_data.description}</span>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <Label className="text-xs font-medium text-muted-foreground">ID</Label>
                <p className="font-mono">{audio_data.id}</p>
              </div>
              <div>
                <Label className="text-xs font-medium text-muted-foreground">Type</Label>
                <p className="font-mono">{audio_data.type}</p>
              </div>
              <div>
                <Label className="text-xs font-medium text-muted-foreground">Created</Label>
                <p>{new Date(audio_data.created_at).toLocaleDateString()}</p>
              </div>
              <div>
                <Label className="text-xs font-medium text-muted-foreground">Updated</Label>
                <p>{new Date(audio_data.updated_at).toLocaleDateString()}</p>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-medium">Details</Label>
              {!isEditing && (
                <Button variant="outline" size="sm" onClick={() => setIsEditing(true)}>
                  <MdEdit className="mr-1 h-3 w-3" />
                  Edit
                </Button>
              )}
            </div>
            {isEditing ? (
              <div className="space-y-3">
                <div className="space-y-2">
                  <Label className="text-xs font-medium">Description</Label>
                  <Input value={description} onChange={(e) => setDescription(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs font-medium">Language</Label>
                  <Select value={langId} onValueChange={(v) => setLangId(v)}>
                    <SelectTrigger className="w-40">
                      <SelectValue placeholder="All" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All</SelectItem>
                      {LANG_LIST.map((lang) => (
                        <SelectItem
                          key={lang}
                          value={String(lang_list_obj[lang as lang_list_type])}
                        >
                          {lang}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" onClick={handleSave} disabled={update_audio_mut.isPending}>
                    {update_audio_mut.isPending ? 'Saving...' : 'Save'}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setDescription(audio_data?.description || '');
                      setLangId(audio_data?.lang_id == null ? 'all' : String(audio_data?.lang_id));
                      setIsEditing(false);
                    }}
                    disabled={update_audio_mut.isPending}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div>
                  <Label className="text-xs font-medium text-muted-foreground">Description</Label>
                  <p className="text-sm">{description}</p>
                </div>
                <div>
                  <Label className="text-xs font-medium text-muted-foreground">Language</Label>
                  <p className="text-sm">
                    {langId == null ? 'All' : get_lang_from_id(Number(langId))}
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

const AssociatedWords = ({ words }: { words: Props['words'] }) => {
  if (words.length === 0) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="text-center text-muted-foreground">
            <p>No words are currently associated with this audio.</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold">Associated Words ({words.length})</h3>
      <Card>
        <CardContent className="p-6">
          <div className="grid gap-3">
            {words.map((word) => (
              <div
                key={`${word.text_lesson_id}-${word.id}`}
                className="flex items-center justify-between rounded-lg border p-3"
              >
                <div className="flex-1">
                  <div className="flex items-center gap-3">
                    <span className="text-lg font-semibold">{word.word}</span>
                    <span className="text-sm text-muted-foreground">
                      (Lesson: {word.lesson.text})
                    </span>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Order: {word.order} • Lesson ID: {word.text_lesson_id}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

const EditActions = () => {
  const trpc = useTRPC();
  const router = useRouter();
  const audio_data = useAtomValue(audio_data_atom);
  const queryClient = useQueryClient();

  const delete_audio_mut = useMutation(
    trpc.audio_assets.delete_audio_asset.mutationOptions({
      onSuccess: () => {
        toast.success('Audio deleted successfully');
        router.push('/audio_assets');
        queryClient.invalidateQueries(trpc.audio_assets.list_audio_assets.pathFilter());
      },
      onError: (error) => {
        toast.error('Failed to delete audio: ' + error.message);
      }
    })
  );

  if (!audio_data) return null;

  const handleDelete = () => {
    delete_audio_mut.mutate({ id: audio_data.id });
  };

  return (
    <div className="flex justify-between">
      <div></div>
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button variant="destructive" disabled={delete_audio_mut.isPending}>
            <MdDeleteOutline className="mr-1 h-4 w-4" />
            {delete_audio_mut.isPending ? 'Deleting...' : 'Delete Audio'}
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Audio Asset</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this audio asset? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-red-500 hover:bg-red-400">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
