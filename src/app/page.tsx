import { get_texts_list_func } from '@/api/routers/text_data';
import MainHomePage from './MainHomePage';

export default async function Home() {
  const texts = await get_texts_list_func();
  return <MainHomePage texts={texts} />;
}

export const metadata = {
  title: 'Aksara'
};
