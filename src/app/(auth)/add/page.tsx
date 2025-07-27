import { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getCachedSession } from '~/lib/cache_server_route_data';
import AddEditTextData from '~/components/pages/add_edit/AddEditTextData';
import { IoMdArrowRoundBack } from 'react-icons/io';
import Link from 'next/link';

const List = async () => {
  const session = await getCachedSession();
  if (!session || session.user.role !== 'admin' || !session.user.is_approved) redirect('/');

  const text_data = {
    text: '',
    svg: ''
  };
  return (
    <div>
      <div className="my-2 mb-4 px-2">
        <Link href="/list" className="flex items-center gap-1 text-lg font-semibold">
          <IoMdArrowRoundBack className="inline-block text-xl" />
          सूची
        </Link>
      </div>
      <AddEditTextData location="add" text_data={text_data} />
    </div>
  );
};
export default List;

export const metadata: Metadata = {
  title: 'Add Aksara'
};
