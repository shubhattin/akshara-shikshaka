import { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getCachedSession } from '~/lib/cache_server_route_data';
import TextLessonAddEdit from '~/components/pages/lesson_add_edit/TextLessonAddEdit';
import { IoMdArrowRoundBack } from 'react-icons/io';
import Link from 'next/link';
import { Provider as JotaiProvider } from 'jotai';
import { cache } from 'react';
import { db } from '~/db/db';
import { z } from 'zod';
import { getMetadata } from '~/components/tags/getPageMetaTags';

type Props = { params: Promise<{ id: string }> };

const get_cached_text_lesson_info = cache(async (id: number) => {
  const text_lesson_info = await db.query.text_lessons.findFirst({
    where: (tbl, { eq }) => eq(tbl.id, id),
    columns: {
      id: true,
      uuid: true,
      lang_id: true,
      text: true,
      base_word_script_id: true
    },
    orderBy: (tbl, { asc }) => [asc(tbl.text)],
    with: {
      gestures: {
        columns: {
          text_gesture_id: true
        }
      },
      words: {
        columns: {
          id: true,
          word: true,
          image_id: true,
          audio_id: true,
          order: true
        },
        orderBy: (tbl, { asc }) => [asc(tbl.order)]
      }
    }
  });
  return text_lesson_info;
});

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const id = z.coerce
    .number()
    .int()
    .parse((await params).id);

  const text_data = await get_cached_text_lesson_info(id);

  return {
    ...getMetadata({
      title: text_data ? text_data.text + ' - Edit Text Lesson' : 'Not Found',
      description: text_data ? text_data.text + ' - Edit Text Lesson' : null
    })
  };
}

const List = async ({ params }: Props) => {
  const session = await getCachedSession();
  if (!session || session.user.role !== 'admin') redirect('/');

  const id = z.coerce
    .number()
    .int()
    .parse((await params).id);

  const text_lesson_info = (await get_cached_text_lesson_info(id))!;

  const gesture_ids = text_lesson_info.gestures.map((gesture) => gesture.text_gesture_id);

  return (
    <div>
      <div className="my-2 mb-4 px-2">
        <Link href="/gestures/list" className="flex items-center gap-1 text-lg font-semibold">
          <IoMdArrowRoundBack className="inline-block text-xl" />
          Text Lesson List
        </Link>
      </div>
      <JotaiProvider key={`add_lesson_page-${crypto.randomUUID()}`}>
        <TextLessonAddEdit
          location="edit"
          gesture_ids={gesture_ids}
          words={text_lesson_info.words}
          text_lesson_info={{
            base_word_script_id: text_lesson_info.base_word_script_id,
            lang_id: text_lesson_info.lang_id,
            text: text_lesson_info.text,
            id: text_lesson_info.id,
            uuid: text_lesson_info.uuid
          }}
        />
      </JotaiProvider>
    </div>
  );
};
export default List;
