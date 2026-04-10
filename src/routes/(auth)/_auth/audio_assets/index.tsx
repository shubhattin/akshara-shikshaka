import { createFileRoute, Link } from '@tanstack/react-router';
import { routeHeadFromPageMeta } from '~/components/tags/getPageMetaTags';
import ListAudio from './-ListAudio';
import { IoMdArrowRoundBack } from 'react-icons/io';

export const Route = createFileRoute('/(auth)/_auth/audio_assets/')({
  head: () => routeHeadFromPageMeta({ title: 'Audio Assets' }),
  component: AudioAssetsIndexRoute
});

function AudioAssetsIndexRoute() {
  return (
    <div className="container mx-auto p-4">
      <div className="my-2 mb-4 px-2">
        <Link to="/" className="flex items-center gap-1 text-lg font-semibold">
          <IoMdArrowRoundBack className="inline-block text-xl" />
          Home Page
        </Link>
      </div>
      <ListAudio />
    </div>
  );
}
