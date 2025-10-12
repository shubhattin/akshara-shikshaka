import { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getCachedSession } from '~/lib/cache_server_route_data';
import AddEditTextDataWrapper from '~/components/pages/gesture_add_edit/AddEditTextGesture';
import { IoMdArrowRoundBack } from 'react-icons/io';
import Link from 'next/link';
import { Provider as JotaiProvider } from 'jotai';
import { DEFAULT_FONT_SIZE } from '~/state/font_list';
import { cache } from 'react';
import { cookies } from 'next/headers';
import {
  get_script_id_from_cookie,
  get_font_family_from_cookie,
  FONT_FAMILY_COOKIE_KEY,
  SCRIPT_ID_COOKIE_KEY
} from '~/state/cookie';

export const getCachedInfo = cache(async () => {
  const cookie = await cookies();
  const script_id = get_script_id_from_cookie(cookie.get(SCRIPT_ID_COOKIE_KEY)?.value);
  const font_family = get_font_family_from_cookie(cookie.get(FONT_FAMILY_COOKIE_KEY)?.value);
  return { script_id, font_family };
});

const List = async () => {
  const session = await getCachedSession();
  if (!session || session.user.role !== 'admin') redirect('/');

  const { script_id, font_family } = await getCachedInfo();
  const text_data = {
    text: '',
    gestures: [],
    font_size: DEFAULT_FONT_SIZE,
    text_center_offset: [0, 0] as [number, number],
    font_family: font_family,
    script_id: script_id,
    category_id: null,
    order: null
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
