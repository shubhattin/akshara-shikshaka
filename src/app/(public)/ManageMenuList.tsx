'use client';

import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
  ContextMenuLabel,
  ContextMenuSeparator
} from '@/components/ui/context-menu';
import Link from 'next/link';
import { useContext } from 'react';
import { FaRegHandPaper, FaBookOpen, FaVolumeUp, FaRegImage, FaSignInAlt } from 'react-icons/fa';
import { signIn } from '~/lib/auth-client';
import { AppContext } from '~/components/AppDataContext';

export default function ManageMenuList({ children }: { children: React.ReactNode }) {
  const { user_info } = useContext(AppContext);

  return (
    <ContextMenu>
      <ContextMenuTrigger>{children}</ContextMenuTrigger>
      <ContextMenuContent>
        {!user_info && (
          <ContextMenuItem
            className="flex items-center gap-2 p-2"
            onClick={() =>
              signIn.social({
                provider: 'google',
                callbackURL: `${window.location.origin}`
              })
            }
          >
            <FaSignInAlt className="h-4 w-4" />
            Login
          </ContextMenuItem>
        )}
        {user_info && user_info.role !== 'admin' && (
          <>
            <ContextMenuLabel>You are not authorized to Edit Data</ContextMenuLabel>
          </>
        )}
        {user_info?.role === 'admin' && (
          <>
            {/* <ContextMenuLabel>Manage</ContextMenuLabel> */}
            <Link href="/lessons" className="flex items-center gap-2">
              <ContextMenuItem className="w-full font-bold">
                <FaBookOpen className="h-4 w-4" />
                Lessons
              </ContextMenuItem>
            </Link>
            <Link href="/gestures" className="flex items-center gap-2">
              <ContextMenuItem className="w-full">
                <FaRegHandPaper className="h-4 w-4" />
                Gestures
              </ContextMenuItem>
            </Link>
            <ContextMenuSeparator />
            <Link href="/image_assets" className="flex items-center gap-2">
              <ContextMenuItem className="w-full text-xs">
                <FaRegImage className="h-4 w-4" />
                Images
              </ContextMenuItem>
            </Link>
            <Link href="/audio_assets" className="flex items-center gap-2">
              <ContextMenuItem className="w-full text-xs">
                <FaVolumeUp className="h-4 w-4" />
                Audio
              </ContextMenuItem>
            </Link>
          </>
        )}
      </ContextMenuContent>
    </ContextMenu>
  );
}
