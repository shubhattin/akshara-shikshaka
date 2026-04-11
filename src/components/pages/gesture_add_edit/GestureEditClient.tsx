'use client';

import { Link } from '@tanstack/react-router';
import { Provider as JotaiProvider } from 'jotai';
import AddEditTextDataWrapper from '~/components/pages/gesture_add_edit/AddEditTextGesture';
import type { text_data_type } from '~/components/pages/gesture_add_edit/AddEditTextGesture';

type Props = {
  text_data: text_data_type & { id: number; uuid: string };
  id: number;
};

export default function GestureEditClient({ text_data, id }: Props) {
  return (
    <div>
      <div className="my-2 mb-4 px-2">
        <Link to="/gestures" className="flex items-center gap-1 text-lg font-semibold">
          Back to gestures
        </Link>
      </div>
      <JotaiProvider key={`edit-gesture-${id}`}>
        <AddEditTextDataWrapper location="edit" text_data={text_data} />
      </JotaiProvider>
    </div>
  );
}
