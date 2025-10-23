import { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { IoMdArrowRoundBack } from 'react-icons/io';
import { getCachedSession } from '~/lib/cache_server_route_data';
import ListAudio from './ListAudio';

const List = async () => {
  const session = await getCachedSession();
  if (!session || session.user.role !== 'admin') redirect('/');

  return (
    <div className="container mx-auto p-4">
      <div className="my-2 mb-4 px-2">
        <Link href="/" className="flex items-center gap-1 text-lg font-semibold">
          <IoMdArrowRoundBack className="inline-block text-xl" />
          Home Page
        </Link>
      </div>
      <ListAudio />
    </div>
  );
};
export default List;

export const metadata: Metadata = {
  title: 'Audio List'
};
