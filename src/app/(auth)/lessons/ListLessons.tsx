'use client';
import { useEffect, useMemo, useState } from 'react';
import { IoMdSearch, IoMdArrowDropleft, IoMdArrowDropright } from 'react-icons/io';
import { useTRPC } from '~/api/client';
import { Card, CardHeader, CardTitle } from '~/components/ui/card';
import { Skeleton } from '~/components/ui/skeleton';
import { Check, ChevronsUpDown } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '~/components/ui/select';
import { Input } from '~/components/ui/input';
import { Button } from '~/components/ui/button';
import { LANG_LIST, lang_list_obj, type lang_list_type } from '~/state/lang_list';
import Cookie from 'js-cookie';
import { useQuery } from '@tanstack/react-query';
import { LESSON_LANG_ID_COOKIE_KEY } from '~/state/cookie';
import type { lesson_categories } from '~/db/schema';
import type { InferSelectModel } from 'drizzle-orm';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '~/lib/utils';
import { TiEdit } from 'react-icons/ti';

type Props = {
  init_lang_id: number;
  init_lesson_categories: Pick<
    InferSelectModel<typeof lesson_categories>,
    'id' | 'name' | 'order'
  >[];
};

export default function ListLessons({ init_lang_id, init_lesson_categories }: Props) {
  const trpc = useTRPC();
  const [langId, setLangId] = useState<number | undefined>(init_lang_id);

  const langOptions = LANG_LIST.map((name) => ({
    name,
    id: lang_list_obj[name as lang_list_type]
  }));

  const categories_q = useQuery(
    trpc.text_lessons.categories.get_text_lesson_categories.queryOptions(
      { lang_id: langId! },
      { enabled: !!langId, placeholderData: init_lesson_categories }
    )
  );

  const categories = categories_q.data ?? [];

  const [open, setOpen] = useState(false);
  // 0 will be for uncategorized
  const [selectedCategoryID, setSelectedCategoryID] = useState<number | null>(null);

  return (
    <div className="space-y-6">
      <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-center gap-3">
        <Select
          value={langId?.toString()}
          onValueChange={(val) => {
            setLangId(Number(val));
            Cookie.set(LESSON_LANG_ID_COOKIE_KEY, val, { expires: 30 });
          }}
        >
          <SelectTrigger className="w-56">
            <SelectValue placeholder="Select a Language" />
          </SelectTrigger>
          <SelectContent>
            {langOptions.map((opt) => (
              <SelectItem key={opt.id} value={opt.id.toString()}>
                {opt.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex items-center justify-center space-x-4">
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              role="combobox"
              aria-expanded={open}
              className="w-[200px] justify-between"
            >
              {selectedCategoryID !== null
                ? categories.find((category) => category.id === selectedCategoryID)?.name ||
                  (selectedCategoryID === 0 ? 'Uncategorized' : 'Select category...')
                : 'Select category...'}
              <ChevronsUpDown className="opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[200px] p-0">
            <Command>
              <CommandInput placeholder="Search category..." className="h-9" />
              <CommandList>
                <CommandEmpty>No category found.</CommandEmpty>
                <CommandGroup>
                  {categories.map((category) => (
                    <CommandItem
                      key={category.id}
                      value={category.id.toString()}
                      onSelect={(currentValue) => {
                        setSelectedCategoryID(
                          Number(currentValue) === selectedCategoryID ? null : Number(currentValue)
                        );
                        setOpen(false);
                      }}
                    >
                      {category.name}
                      <Check
                        className={cn(
                          'ml-auto',
                          selectedCategoryID === category.id ? 'opacity-100' : 'opacity-0'
                        )}
                      />
                    </CommandItem>
                  ))}
                  <CommandItem
                    value="0"
                    onSelect={() => {
                      setSelectedCategoryID(0);
                      setOpen(false);
                    }}
                  >
                    Uncategorized
                  </CommandItem>
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
        <Button variant="ghost" size="icon">
          <TiEdit className="size-5" />
        </Button>
      </div>
    </div>
  );
}
