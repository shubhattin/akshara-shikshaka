'use client';

import { Link } from '@tanstack/react-router';
import { IoMdArrowRoundBack } from 'react-icons/io';
import { Provider as JotaiProvider } from 'jotai';
import AddEditTextDataWrapper, {
  type text_data_type
} from '~/components/pages/gesture_add_edit/AddEditTextGesture';

export default function GestureEditClient({
  id,
  text_data
}: {
  id: number;
  text_data: text_data_type & { id: number; uuid: string };
}) {
  return (
    <div className="pb-28">
      <div className="my-2 mb-4 px-2">
        <Link to="/gestures" className="flex items-center gap-1 text-lg font-semibold">
          <IoMdArrowRoundBack className="inline-block text-xl" />
          Text Gesture List
        </Link>
      </div>

      <JotaiProvider key={`edit_akdhara_page-${id}`}>
        <AddEditTextDataWrapper text_data={text_data} />
      </JotaiProvider>
    </div>
  );
}
