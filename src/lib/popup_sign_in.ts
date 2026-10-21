import ms from 'ms';
import { z } from 'zod';
import { toast } from 'sonner';
import { refreshAuthSession, signIn } from '~/lib/auth-client';

/** Same-origin channel the popup landing page reports back on. */
export const AUTH_POPUP_CHANNEL = 'akshara:auth-popup';
export const AUTH_POPUP_DONE_PATH = '/auth/popup-done';
export const auth_popup_message_schema = z.object({ type: z.enum(['signed_in', 'error']) });
/** Stop listening for a popup that was abandoned. */
const POPUP_LISTEN_MS = ms('10m');
const POPUP_WIDTH = 480;
const POPUP_HEIGHT = 640;

/**
 * Open the popup synchronously inside the click so blockers allow it, and
 * paint it in the page's theme while the OAuth URL is fetched.
 */
function openSignInPopup(): Window | null {
  const left = Math.round(window.screenX + (window.outerWidth - POPUP_WIDTH) / 2);
  const top = Math.round(window.screenY + (window.outerHeight - POPUP_HEIGHT) / 2);
  const popup = window.open(
    '',
    'akshara-google-sign-in',
    `popup=yes,width=${POPUP_WIDTH},height=${POPUP_HEIGHT},left=${left},top=${top}`
  );
  if (!popup) return null;
  const dark = document.documentElement.classList.contains('dark');
  try {
    popup.document.title = 'Continue with Google';
    const body = popup.document.body;
    body.style.cssText = `margin:0;height:100vh;display:flex;align-items:center;justify-content:center;font:14px system-ui,sans-serif;background:${dark ? '#0f172a' : '#f8fafc'};color:${dark ? '#94a3b8' : '#64748b'}`;
    body.textContent = 'Connecting to Google…';
  } catch {
    // Cosmetic only.
  }
  return popup;
}

/** Wait for the popup landing page to report back, then refresh in place. */
function listenForPopupResult() {
  // SAFETY: BroadcastChannel is window-only; this runs from a click handler.
  // oxlint-disable-next-line anti-slop/no-runtime-typeof
  if (typeof BroadcastChannel === 'undefined') return;
  const channel = new BroadcastChannel(AUTH_POPUP_CHANNEL);
  // COOP on Google's pages can sever `popup.closed`, so focus is the fallback signal.
  const onFocus = () => refreshAuthSession();
  const stop = () => {
    channel.close();
    window.removeEventListener('focus', onFocus);
    window.clearTimeout(timer);
  };
  const timer = window.setTimeout(stop, POPUP_LISTEN_MS);
  window.addEventListener('focus', onFocus);
  channel.onmessage = (event) => {
    const parsed = auth_popup_message_schema.safeParse(event.data);
    if (!parsed.success) return;
    stop();
    if (parsed.data.type === 'signed_in') {
      refreshAuthSession();
      return;
    }
    toast.error('Google sign-in did not complete. Please try again.');
  };
}

async function redirectSignIn() {
  await signIn.social({
    provider: 'google',
    callbackURL: window.location.href
  });
}

/**
 * Google sign-in in a popup so the current page keeps its state. Falls back
 * to the full-page redirect when popups are blocked. Call from a click handler.
 */
export async function startGoogleSignIn() {
  const popup = openSignInPopup();
  if (!popup) {
    await redirectSignIn();
    return;
  }

  const done = `${window.location.origin}${AUTH_POPUP_DONE_PATH}`;
  const { data } = await signIn.social({
    provider: 'google',
    callbackURL: done,
    errorCallbackURL: `${done}?status=error`,
    disableRedirect: true
  });
  if (!data?.url) {
    popup.close();
    await redirectSignIn();
    return;
  }
  listenForPopupResult();
  popup.location.href = data.url;
}
