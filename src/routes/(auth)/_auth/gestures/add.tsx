import { createFileRoute, Link } from '@tanstack/react-router';
import { Provider as JotaiProvider } from 'jotai';
import { IoMdArrowRoundBack } from 'react-icons/io';
import AddEditTextDataWrapper from '~/components/pages/gesture_add_edit/AddEditTextGesture';
import { fetchGestureAddDefaults } from '~/lib/server/route-data.functions';
import { routeHeadFromPageMeta } from '~/components/tags/getPageMetaTags';

export const Route = createFileRoute('/(auth)/_auth/gestures/add')({
  loader: async () => await fetchGestureAddDefaults(),
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
      <JotaiProvider key={`add-gesture-${key}`}>
        <AddEditTextDataWrapper location="add" text_data={text_data} />
      </JotaiProvider>
    </div>
  );
}
