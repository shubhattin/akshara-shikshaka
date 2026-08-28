'use client';

import { useEffect, useRef } from 'react';
import { useBlocker } from '@tanstack/react-router';

const DEFAULT_MESSAGE =
  'You have unsaved changes. Are you sure you want to leave? Your edits will be lost.';

const GUARD_STATE = { __aksharaEditorUnsavedGuard: true } as const;

// oxlint-disable-next-line anti-slop/no-unknown-parameters -- history.state is browser unknown; type guard narrows unknown to domain sentinel
function isGuardState(state: unknown): state is { __aksharaEditorUnsavedGuard: true } {
  return (
    !!state &&
    // oxlint-disable-next-line anti-slop/no-runtime-typeof -- type guard for history state; narrows unknown to domain object
    typeof state === 'object' &&
    // SAFETY: validated at boundary - type assertion is safe based on prior schema check.
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
  useEffect(() => {
    messageRef.current = message;
  }, [message]);

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
    let suppressPopState = false;
    /** History index after sentinel push; used to detect back vs forward. */
    let sentinelHistoryLength = 0;

    const pushSentinel = () => {
      if (sentinelPushed) return;
      window.history.pushState(GUARD_STATE, '', window.location.href);
      sentinelPushed = true;
      sentinelHistoryLength = window.history.length;
    };

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };

    const handlePopState = () => {
      if (suppressPopState) return;

      // Browser already moved off our sentinel (or navigated). Treat as leave attempt.
      const wentBack = window.history.length < sentinelHistoryLength;
      sentinelPushed = false;

      const confirmLeave = window.confirm(messageRef.current);
      if (!confirmLeave) {
        pushSentinel();
        return;
      }

      // Continue in the same direction the user was going.
      if (wentBack) {
        window.history.back();
      } else {
        window.history.forward();
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    window.addEventListener('popstate', handlePopState);
    pushSentinel();

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      window.removeEventListener('popstate', handlePopState);
      // Drop the sentinel without navigating away (avoids racing save/delete navigations).
      if (sentinelPushed && isGuardState(window.history.state)) {
        sentinelPushed = false;
        suppressPopState = true;
        window.history.replaceState(null, '', window.location.href);
      }
    };
  }, [enabled]);
}
