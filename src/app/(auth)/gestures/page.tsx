import { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { IoMdAdd, IoMdArrowRoundBack } from 'react-icons/io';
import { Button } from '~/components/ui/button';
import { getCachedSession } from '~/lib/cache_server_route_data';
import ListGestures from './ListGestures';
import { get_script_id_from_cookie, SCRIPT_ID_COOKIE_KEY } from '~/state/cookie';
import { cookies } from 'next/headers';
import { get_text_gesture_categories_func } from '~/api/routers/gesture_categories';

const List = async () => {
  const session = await getCachedSession();
  if (!session || session.user.role !== 'admin')
    redirect(`${process.env.NEXT_PUBLIC_BETTER_AUTH_URL}/login`);

  const cookie = await cookies();
  const script_id = get_script_id_from_cookie(cookie.get(SCRIPT_ID_COOKIE_KEY)?.value);

  const gesture_categories = await get_text_gesture_categories_func();

  return (
    <div className="container mx-auto p-4">
      <div className="my-2 mb-4 flex items-center justify-start space-x-4 px-2">
        <Link href="/" className="flex items-center gap-1 text-lg font-semibold">
          <IoMdArrowRoundBack className="inline-block text-xl" />
          Home Page
        </Link>
      </div>
      <div className="mt-2 mb-5 flex items-center justify-center gap-4 px-2">
        <Link href="/gestures/add">
          <Button variant={'outline'} className="gap-2 text-lg font-semibold">
            <IoMdAdd className="size-5.5" /> Add
            <span className="font-bold text-yellow-400">Gesture</span>
          </Button>
        </Link>
      </div>
      <ListGestures init_script_id={script_id} init_gesture_categories={gesture_categories} />
    </div>
  );
};
export default List;

export const metadata: Metadata = {
  title: 'Text Gesture List'
};
