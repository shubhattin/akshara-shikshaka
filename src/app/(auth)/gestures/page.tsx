import { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { IoMdAdd, IoMdArrowRoundBack } from 'react-icons/io';
import { Button } from '~/components/ui/button';
import { getCachedSession } from '~/lib/cache_server_route_data';
import ListGestures from './ListGestures';

const List = async () => {
  const session = await getCachedSession();
  if (!session || session.user.role !== 'admin')
    redirect(`${process.env.NEXT_PUBLIC_BETTER_AUTH_URL}/login`);

  return (
    <div className="container mx-auto p-4">
      <div className="my-2 mb-4 px-2">
        <Link href="/" className="flex items-center gap-1 text-lg font-semibold">
          <IoMdArrowRoundBack className="inline-block text-xl" />
          मुख्यपृष्ठं
        </Link>
      </div>
      <div className="mt-2 mb-5 flex items-center justify-center gap-4 px-2">
        <Link href="/gestures/add">
          <Button variant={'blue'} className="gap-2 text-lg font-semibold">
            <IoMdAdd className="size-5.5" /> नवाक्षरं युञ्जतु
          </Button>
        </Link>
      </div>
      <ListGestures />
    </div>
  );
};
export default List;

export const metadata: Metadata = {
  title: 'Text Gesture List'
};
