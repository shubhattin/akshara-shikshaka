import { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { IoMdAdd, IoMdArrowRoundBack } from 'react-icons/io';
import { Button } from '~/components/ui/button';
import { Card, CardHeader, CardTitle } from '~/components/ui/card';
import { db } from '~/db/db';
import { getCachedSession } from '~/lib/cache_server_route_data';

const List = async () => {
  const session = await getCachedSession();
  if (!session || session.user.role !== 'admin' || !session.user.is_approved) redirect('/');

  const list = await db.query.text_data.findMany({
    columns: {
      id: true,
      text: true,
      created_at: true,
      updated_at: true
    },
    orderBy: (text_data, { asc }) => [asc(text_data.text)]
  });

  return (
    <div className="container mx-auto p-4">
      <div className="my-2 mb-4 px-2">
        <Link href="/" className="flex items-center gap-1 text-lg font-semibold">
          <IoMdArrowRoundBack className="inline-block text-xl" />
          मुख्यपृष्ठं
        </Link>
      </div>
      <div className="mt-2 mb-5 flex items-center justify-center gap-4 px-2">
        <Link href="/add">
          <Button variant={'blue'} className="gap-2 text-lg font-semibold">
            <IoMdAdd className="size-5.5" /> नवाक्षरं युञ्जतु
          </Button>
        </Link>
      </div>
      <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {list.map((item) => (
          <li key={item.id}>
            <Link href={`/edit/${item.id}`}>
              <Card className="p-2 transition duration-200 hover:bg-gray-100 hover:dark:bg-gray-800">
                <CardHeader>
                  <CardTitle>{item.text}</CardTitle>
                  {/* <CardDescription className="flex flex-col space-y-1 sm:flex-row sm:items-center sm:space-y-0 sm:space-x-2"></CardDescription> */}
                </CardHeader>
              </Card>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
};
export default List;

export const metadata: Metadata = {
  title: 'Aksara सूची'
};
