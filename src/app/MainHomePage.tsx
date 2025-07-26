'use client';

import { useState } from 'react';
import { client_q } from '@/api/client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import CanvasComponent from '@/components/CanvasComponent';

type Props = {
  texts: string[];
};

const MainHomePage = ({ texts }: Props) => {
  const [selectedText, setSelectedText] = useState<string | null>(null);

  // tRPC query with disabled by default
  const textDataQuery = client_q.text_data.get_text_data.useQuery(
    { text: selectedText || '' },
    {
      enabled: !!selectedText, // Only run when text is selected
      retry: false
    }
  );

  const handleTextSelect = (text: string) => {
    setSelectedText(text);
  };

  const handleBackToList = () => {
    setSelectedText(null);
  };

  if (selectedText) {
    return (
      <div className="container mx-auto space-y-6 p-6">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold">Character Practice</h1>
          <Button onClick={handleBackToList} variant="outline">
            ← Back to List
          </Button>
        </div>

        {textDataQuery.isLoading && (
          <div className="py-8 text-center">
            <div className="text-lg">Loading character data...</div>
          </div>
        )}

        {textDataQuery.error && (
          <div className="py-8 text-center">
            <div className="text-red-500">
              Error loading character: {textDataQuery.error.message}
            </div>
            <Button onClick={() => textDataQuery.refetch()} className="mt-2">
              Try Again
            </Button>
          </div>
        )}

        {textDataQuery.data && (
          <CanvasComponent
            svgPath={textDataQuery.data.path}
            characterText={textDataQuery.data.text}
          />
        )}
      </div>
    );
  }

  return (
    <div className="container mx-auto space-y-6 p-6">
      <div className="space-y-2 text-center">
        <h1 className="text-4xl font-bold">Akshara</h1>
        <p className="text-lg text-gray-600">Learn to write Indian script characters</p>
      </div>

      <Card className="p-6">
        <h2 className="mb-4 text-2xl font-semibold">Available Characters</h2>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8">
          {texts.map((text) => (
            <Button
              key={text}
              onClick={() => handleTextSelect(text)}
              variant="outline"
              className="h-16 text-2xl font-semibold transition-colors hover:bg-primary hover:text-primary-foreground"
            >
              {text}
            </Button>
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
};

export default MainHomePage;
