import { createFileRoute } from '@tanstack/react-router';
import AdminListAudio from '~/components/pages/admin/AdminListAudio';
import { routeHeadFromPageMeta } from '~/components/tags/getPageMetaTags';

export const Route = createFileRoute('/(auth)/_auth/audio_assets/')({
  head: () => routeHeadFromPageMeta({ title: 'Audio Assets' }),
  component: AdminListAudio
});
