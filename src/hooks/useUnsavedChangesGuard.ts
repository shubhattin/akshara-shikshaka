'use client';

import { useEffect, useRef } from 'react';
import { useBlocker } from '@tanstack/react-router';

const DEFAULT_MESSAGE =
  'You have unsaved changes. Are you sure you want to leave? Your edits will be lost.';

const GUARD_STATE = { __aksharaEditorUnsavedGuard: true } as const;

function isGuardState(state: unknown): boolean {
  return (
    !!state &&
    typeof state === 'object' &&
    (state as { __aksharaEditorUnsavedGuard?: boolean }).__aksharaEditorUnsavedGuard === true
  );
}

/**
 * Leave guard while dirty:
 * - `beforeunload` / popstate for refresh and browser back/forward
 * - TanStack Router `useBlocker` for in-app Link / navigate
 * Active only while `enabled` is true; disables immediately when clean.
 */
export function useUnsavedChangesGuard(enabled: boolean, message: string = DEFAULT_MESSAGE) {
  const messageRef = useRef(message);
  messageRef.current = message;

  useBlocker({
    disabled: !enabled,
    enableBeforeUnload: false,
    shouldBlockFn: () => {
      if (!enabled) return false;
      // true = block navigation. Confirm OK means user wants to leave → do not block.
      return !window.confirm(messageRef.current);
    }
  });

  useEffect(() => {
    if (!enabled) return;

    let sentinelPushed = false;

    const pushSentinel = () => {
      if (sentinelPushed) return;
      window.history.pushState(GUARD_STATE, '', window.location.href);
      sentinelPushed = true;
    };

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };

    const handlePopState = () => {
      // Browser already popped our sentinel (or navigated). Treat as leave attempt.
      sentinelPushed = false;
      const confirmLeave = window.confirm(messageRef.current);
      if (!confirmLeave) {
        pushSentinel();
        return;
      }
      // Proceed with the back navigation past the real page entry.
      window.history.back();
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    window.addEventListener('popstate', handlePopState);
    pushSentinel();

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      window.removeEventListener('popstate', handlePopState);
      // Drop the duplicate same-URL sentinel without leaving the editor.
      if (sentinelPushed && isGuardState(window.history.state)) {
        sentinelPushed = false;
        window.history.back();
      }
    };
  }, [enabled]);
}
