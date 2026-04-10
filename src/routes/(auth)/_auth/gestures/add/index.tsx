import { createFileRoute, Link } from '@tanstack/react-router';
import { Provider as JotaiProvider } from 'jotai';
import { IoMdArrowRoundBack } from 'react-icons/io';
import AddEditTextDataWrapper from '~/components/pages/gesture_add_edit/AddEditTextGesture';
import { routeHeadFromPageMeta } from '~/components/tags/getPageMetaTags';
import { getCookie } from '@tanstack/react-start/server';
import {
  FONT_FAMILY_COOKIE_KEY,
  get_font_family_from_cookie,
  get_script_id_from_cookie,
  SCRIPT_ID_COOKIE_KEY
} from '@/state/cookie';
import { DEFAULT_FONT_SIZE } from '@/state/font_list';
import { createAdminServerFn } from '@/lib/adminServerFn';

const loader$ = createAdminServerFn({ method: 'GET' }).handler(async () => {
  const script_id = get_script_id_from_cookie(getCookie(SCRIPT_ID_COOKIE_KEY));
  const font_family = get_font_family_from_cookie(getCookie(FONT_FAMILY_COOKIE_KEY));
  return { script_id, font_family };
});

export const Route = createFileRoute('/(auth)/_auth/gestures/add/')({
  loader: async () => {
    const { script_id, font_family } = await loader$();

    const text_data = {
      text: '',
      gestures: [],
      font_size: DEFAULT_FONT_SIZE,
      text_center_offset: [0, 0] as [number, number],
      font_family: font_family,
      script_id: script_id,
      category_id: null,
      order: null,
      category: null
    };
    return { text_data };
  },
  head: () => routeHeadFromPageMeta({ title: 'Add Text Gesture' }),
  component: GesturesAddRoute
});

function GesturesAddRoute() {
  const { text_data } = Route.useLoaderData();
  const key =
    typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : 'add-gesture';

  return (
    <div>
      <div className="my-2 mb-4 px-2">
        <Link to="/gestures" className="flex items-center gap-1 text-lg font-semibold">
          <IoMdArrowRoundBack className="inline-block text-xl" />
          Text Gesture List
        </Link>
      </div>
      <JotaiProvider key={`add_akdhara_page-${crypto.randomUUID()}`}>
        <AddEditTextDataWrapper location="add" text_data={text_data} />
      </JotaiProvider>
    </div>
  );
}
