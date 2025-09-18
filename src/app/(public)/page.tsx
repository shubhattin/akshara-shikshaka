import { Card } from '~/components/ui/card';
import { Button } from '~/components/ui/button';
import Link from 'next/link';
import { db } from '~/db/db';

export default async function Home() {
  const texts = await db.query.text_gestures.findMany({
    columns: {
      id: true,
      text: true
    },
    orderBy: (text_data, { asc }) => [asc(text_data.text)]
  });

  return (
    <div className="container mx-auto space-y-6 p-6">
      <div className="space-y-2 text-center">
        <h1 className="text-4xl font-bold">Akshara</h1>
        <p className="text-lg text-gray-600">Learn to write Indian script characters</p>
      </div>
      <div className="flex justify-center">
        <Link href="/list">
          <Button variant="blue">Manage List</Button>
        </Link>
      </div>

      <Card className="p-6">
        <h2 className="mb-4 text-2xl font-semibold">Available Characters</h2>
        <div className="grid grid-cols-4 gap-4 sm:grid-cols-6 md:grid-cols-8">
          {texts.map((text) => (
            <Link href={`/practice/${text.id}`} key={text.id}>
              <Button
                key={text.id}
                variant="outline"
                className="h-16 text-center text-2xl font-semibold transition-colors hover:bg-primary hover:text-primary-foreground"
              >
                {text.text}
              </Button>
            </Link>
          ))}
        </div>

        {texts.length === 0 && (
          <div className="py-8 text-center text-gray-500">No characters available yet.</div>
        )}
      </Card>

      <div className="text-center text-sm text-gray-500">
        <p>Click on a character above to start practicing</p>
      </div>
    </div>
  );
}

export const metadata = {
  title: 'Aksara'
};
