'use client';

import { atom, useAtom, useAtomValue } from 'jotai';
import { useHydrateAtoms } from 'jotai/utils';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { client_q } from '~/api/client';
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
import { Skeleton } from '~/components/ui/skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '~/components/ui/dialog';
import { Textarea } from '~/components/ui/textarea';
import { IoMdArrowRoundBack } from 'react-icons/io';
import { MdDeleteOutline, MdEdit } from 'react-icons/md';
import Link from 'next/link';
import { useQueryClient } from '@tanstack/react-query';

// Atom for image data
const image_data_atom = atom<{
  id: number;
  description: string;
  s3_key: string;
  height: number;
  width: number;
  created_at: Date;
  updated_at: Date;
} | null>(null);

type Props = {
  image_data: {
    id: number;
    description: string;
    s3_key: string;
    height: number;
    width: number;
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

export default function EditImage({ image_data, words }: Props) {
  useHydrateAtoms([[image_data_atom, image_data]]);

  return (
    <div className="space-y-6">
      <ImageInfo />
      <AssociatedWords words={words} />
      <EditActions words={words} />
    </div>
  );
}

const ImageInfo = () => {
  const image_data = useAtomValue(image_data_atom);

  if (!image_data) {
    return <Skeleton className="h-64 w-full" />;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Edit Image Asset</h2>
        <Link
          href="/image_assets"
          className="flex items-center gap-1 text-lg font-semibold text-muted-foreground hover:text-foreground"
        >
          <IoMdArrowRoundBack className="inline-block text-xl" />
          Back to Images
        </Link>
      </div>

      <Card>
        <CardContent className="p-6">
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label className="text-sm font-medium">Image Preview</Label>
                <div className="flex justify-center">
                  <img
                    src={`${process.env.NEXT_PUBLIC_AWS_CLOUDFRONT_URL}/${image_data.s3_key}`}
                    alt={image_data.description}
                    className="max-h-64 max-w-full cursor-pointer rounded-lg object-contain shadow-md"
                    style={{ height: '256px', width: '256px' }}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <Label className="text-xs font-medium text-muted-foreground">ID</Label>
                  <p className="font-mono">{image_data.id}</p>
                </div>
                <div>
                  <Label className="text-xs font-medium text-muted-foreground">Created</Label>
                  <p>{new Date(image_data.created_at).toLocaleDateString()}</p>
                </div>
                <div>
                  <Label className="text-xs font-medium text-muted-foreground">Updated</Label>
                  <p>{new Date(image_data.updated_at).toLocaleDateString()}</p>
                </div>
                <div>
                  <Label className="text-xs font-medium text-muted-foreground">Dimensions</Label>
                  <p>
                    {image_data.width} x {image_data.height}
                  </p>
                </div>
              </div>
            </div>

            <DescriptionEditor />
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

const DescriptionEditor = () => {
  const [image_data, setImageData] = useAtom(image_data_atom);
  const [isEditing, setIsEditing] = useState(false);
  const [description, setDescription] = useState('');

  const update_image_mut = client_q.image_assets.update_image_asset.useMutation({
    onSuccess: () => {
      toast.success('Image description updated successfully');
      setImageData((prev) => (prev ? { ...prev, description } : null));
      setIsEditing(false);
    },
    onError: (error) => {
      toast.error('Failed to update image description: ' + error.message);
    }
  });

  useEffect(() => {
    if (image_data) {
      setDescription(image_data.description);
    }
  }, [image_data]);

  const handleSave = () => {
    if (!image_data || !description.trim()) {
      toast.error('Description cannot be empty');
      return;
    }

    update_image_mut.mutate({
      id: image_data.id,
      description: description.trim()
    });
  };

  const handleCancel = () => {
    setDescription(image_data?.description || '');
    setIsEditing(false);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Label className="text-sm font-medium">Description</Label>
        {!isEditing && (
          <Button variant="outline" size="sm" onClick={() => setIsEditing(true)}>
            <MdEdit className="mr-1 h-3 w-3" />
            Edit
          </Button>
        )}
      </div>

      {isEditing ? (
        <div className="space-y-3">
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Enter image description..."
            className="min-h-[100px]"
          />
          <div className="flex gap-2">
            <Button size="sm" onClick={handleSave} disabled={update_image_mut.isPending}>
              {update_image_mut.isPending ? 'Saving...' : 'Save'}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={handleCancel}
              disabled={update_image_mut.isPending}
            >
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <div className="min-h-[100px] rounded-md border p-3">
          <p className="text-sm">{image_data?.description}</p>
        </div>
      )}
    </div>
  );
};

const AssociatedWords = ({ words }: { words: Props['words'] }) => {
  if (words.length === 0) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="text-center text-muted-foreground">
            <p>No words are currently associated with this image.</p>
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

const EditActions = ({ words }: { words: Props['words'] }) => {
  const router = useRouter();
  const image_data = useAtomValue(image_data_atom);
  const queryClient = useQueryClient();

  const delete_image_mut = client_q.image_assets.delete_image_asset.useMutation({
    onSuccess: () => {
      toast.success('Image deleted successfully');
      router.push('/image_assets');
      queryClient.invalidateQueries({
        queryKey: [['image_assets', 'list_image_assets']]
      });
    },
    onError: (error) => {
      toast.error('Failed to delete image: ' + error.message);
    }
  });

  const handleDelete = () => {
    if (!image_data) return;

    delete_image_mut.mutate({
      id: image_data.id
    });
  };

  if (!image_data) return null;

  return (
    <div className="flex justify-between">
      <div></div>
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button variant="destructive" disabled={delete_image_mut.isPending}>
            <MdDeleteOutline className="mr-1 h-4 w-4" />
            {delete_image_mut.isPending ? 'Deleting...' : 'Delete Image'}
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Image Asset</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this image asset? This action cannot be undone.
              {words.length > 0 && (
                <div className="mt-2 rounded-md bg-amber-50 p-2 dark:bg-amber-900/20">
                  <p className="text-sm text-amber-800 dark:text-amber-200">
                    Warning: This image is associated with {words.length} word(s). Deleting it may
                    affect lessons that use this image.
                  </p>
                </div>
              )}
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
