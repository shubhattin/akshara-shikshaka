'use client';

import { Button } from '~/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import Link from 'next/link';
import { FaRegHandPaper, FaBookOpen, FaVolumeUp, FaRegImage } from 'react-icons/fa';
import { MdOutlineManageAccounts } from 'react-icons/md';

export default function ManageMenuList() {
  return (
    <div>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" className="flex items-center gap-2">
            <MdOutlineManageAccounts className="size-6" />
            Manage
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          {/* <DropdownMenuLabel>Manage</DropdownMenuLabel>
          <DropdownMenuSeparator /> */}
          <DropdownMenuItem>
            <Link href="/gestures" className="flex items-center gap-2">
              <FaRegHandPaper className="h-4 w-4" />
              Gestures
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem>
            <Link href="/lessons" className="flex items-center gap-2">
              <FaBookOpen className="h-4 w-4" />
              Lessons
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem>
            <Link href="/image_assets" className="flex items-center gap-2">
              <FaRegImage className="h-4 w-4" />
              Images
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem>
            <Link href="/audio_assets" className="flex items-center gap-2">
              <FaVolumeUp className="h-4 w-4" />
              Audio
            </Link>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
