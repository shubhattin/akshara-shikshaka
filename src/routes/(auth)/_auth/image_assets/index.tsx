import { createFileRoute } from '@tanstack/react-router';
import { routeHeadFromPageMeta } from '~/components/tags/getPageMetaTags';
import { Link } from '@tanstack/react-router';
import { IoMdArrowRoundBack } from 'react-icons/io';
import ListImages from './-ListImages';

export const Route = createFileRoute('/(auth)/_auth/image_assets/')({
  head: () => routeHeadFromPageMeta({ title: 'Image Assets' }),
  component: ImageAssetsIndexRoute
});

function ImageAssetsIndexRoute() {
  return (
    <div className="container mx-auto p-4">
      <div className="my-2 mb-4 px-2">
        <Link to="/" className="flex items-center gap-1 text-lg font-semibold">
          <IoMdArrowRoundBack className="inline-block text-xl" />
          Home Page
        </Link>
      </div>
      <ListImages />
    </div>
  );
}
