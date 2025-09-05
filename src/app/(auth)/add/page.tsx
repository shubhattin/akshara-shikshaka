import { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getCachedSession } from '~/lib/cache_server_route_data';
import AddEditTextDataWrapper from '~/components/pages/add_edit/AddEditTextData';
import { IoMdArrowRoundBack } from 'react-icons/io';
import Link from 'next/link';
import { Provider as JotaiProvider } from 'jotai';
import { DEFAULT_FONT_FAMILY, DEFAULT_FONT_SIZE, type FontFamily } from '~/state/font_list';
import { script_list_obj } from '~/state/lang_list';

const List = async () => {
  const session = await getCachedSession();
  if (!session || session.user.role !== 'admin' || !session.user.is_approved) redirect('/');

  const text_data = {
    text: '',
    gestures: [],
    fontFamily: DEFAULT_FONT_FAMILY as FontFamily,
    fontSize: DEFAULT_FONT_SIZE,
    textCenterOffset: [0, 0] as [number, number],
    scriptID: script_list_obj['Devanagari']
  };
  return (
    <div>
      <div className="my-2 mb-4 px-2">
        <Link href="/list" className="flex items-center gap-1 text-lg font-semibold">
          <IoMdArrowRoundBack className="inline-block text-xl" />
          सूची
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
  title: 'Add Aksara'
};
