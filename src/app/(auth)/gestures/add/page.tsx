import { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getCachedSession } from '~/lib/cache_server_route_data';
import AddEditTextDataWrapper from '~/components/pages/gesture_add_edit/AddEditTextGesture';
import { IoMdArrowRoundBack } from 'react-icons/io';
import Link from 'next/link';
import { Provider as JotaiProvider } from 'jotai';
import { DEFAULT_FONT_FAMILY, DEFAULT_FONT_SIZE, type FontFamily } from '~/state/font_list';
import { script_list_obj } from '~/state/lang_list';

const List = async () => {
  const session = await getCachedSession();
  if (!session || session.user.role !== 'admin') redirect('/');

  const text_data = {
    text: '',
    gestures: [],
    font_family: DEFAULT_FONT_FAMILY as FontFamily,
    font_size: DEFAULT_FONT_SIZE,
    text_center_offset: [0, 0] as [number, number],
    script_id: script_list_obj['Devanagari']
  };
  return (
    <div>
      <div className="my-2 mb-4 px-2">
        <Link href="/gestures" className="flex items-center gap-1 text-lg font-semibold">
          <IoMdArrowRoundBack className="inline-block text-xl" />
          Text Gesture List
        </Link>
      </div>
      <JotaiProvider key={`add_akdhara_page-${crypto.randomUUID()}`}>
        <AddEditTextDataWrapper location="add" text_data={text_data} />
      </JotaiProvider>
    </div>
  );
};
export default List;

export const metadata: Metadata = {
  title: 'Add Text Gesture'
};
