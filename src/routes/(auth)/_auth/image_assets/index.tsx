import { createFileRoute } from '@tanstack/react-router';
import AdminListImages from '~/components/pages/admin/AdminListImages';
import { routeHeadFromPageMeta } from '~/components/tags/getPageMetaTags';

export const Route = createFileRoute('/(auth)/_auth/image_assets/')({
  head: () => routeHeadFromPageMeta({ title: 'Image Assets' }),
  component: AdminListImages
});
