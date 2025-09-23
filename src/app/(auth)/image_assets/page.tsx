import { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { IoMdAdd, IoMdArrowRoundBack } from 'react-icons/io';
import { Button } from '~/components/ui/button';
import { getCachedSession } from '~/lib/cache_server_route_data';
import ListImages from './ListImages';

const List = async () => {
  const session = await getCachedSession();
  if (!session || session.user.role !== 'admin')
    redirect(`${process.env.NEXT_PUBLIC_BETTER_AUTH_URL}/login`);

  return (
    <div className="container mx-auto p-4">
      <div className="my-2 mb-4 px-2">
        <Link href="/" className="flex items-center gap-1 text-lg font-semibold">
          <IoMdArrowRoundBack className="inline-block text-xl" />
          Home Page
        </Link>
      </div>
      <ListImages />
    </div>
  );
};
export default List;

export const metadata: Metadata = {
  title: 'Image List'
};
