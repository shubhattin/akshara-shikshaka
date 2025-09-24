'use client';

import Link from 'next/link';
import { IoMdAdd, IoMdArrowRoundBack } from 'react-icons/io';
import { Provider as JotaiProvider } from 'jotai';
import AddEditTextDataWrapper, {
  type text_data_type
} from '~/components/pages/gesture_add_edit/AddEditTextGesture';
import { Button } from '~/components/ui/button';
import { useRouter } from 'next/navigation';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogFooter,
  AlertDialogDescription,
  AlertDialogTitle,
  AlertDialogHeader,
  AlertDialogContent,
  AlertDialogTrigger
} from '~/components/ui/alert-dialog';

export default function GestureEditClient({
  id,
  text_data
}: {
  id: number;
  text_data: text_data_type & { id: number; uuid: string };
}) {
  const router = useRouter();

  return (
    <div>
      <div className="my-2 mb-4 flex items-center gap-32 px-2">
        <Link href="/gestures" className="flex items-center gap-1 text-lg font-semibold">
          <IoMdArrowRoundBack className="inline-block text-xl" />
          Text Gesture List
        </Link>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="outline" className="flex items-center gap-1 text-sm font-semibold">
              <IoMdAdd className="inline-block size-5 text-yellow-400" />
              <span className="text-amber-400">Add A New Text Gesture</span>
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Sure to Leave this Page ?</AlertDialogTitle>
              <AlertDialogDescription>
                Make sure to save the changes before leaving.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  window.location.href = '/gestures/add';
                  // ^ refresh needed
                }}
                className="bg-yellow-600 font-semibold text-white hover:bg-yellow-500"
              >
                Leave
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>

      <JotaiProvider key={`edit_akdhara_page-${id}`}>
        <AddEditTextDataWrapper location="edit" text_data={text_data} />
      </JotaiProvider>
    </div>
  );
}
