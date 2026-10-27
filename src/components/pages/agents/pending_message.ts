import type { ComposerMessage } from './chat/ChatComposer';

/**
 * The first message of a chat started from the New chat screen. The chat is created first,
 * then the chat page picks this up and sends it — so the reply streams on the chat's own URL.
 * Kept in sessionStorage (module state as fallback) so a reload between create and mount
 * doesn't orphan the chat.
 */
const pending = new Map<string, ComposerMessage>();

const storageKey = (chatId: string) => `agent-pending-message:${chatId}`;

function readStored(chatId: string): ComposerMessage | undefined {
  try {
    const raw = sessionStorage.getItem(storageKey(chatId));
    if (raw === null) return undefined;
    // SAFETY: written by setPendingMessage below in this tab.
    return JSON.parse(raw) as ComposerMessage;
  } catch {
    return undefined;
  }
}

export function setPendingMessage(chatId: string, message: ComposerMessage) {
  pending.set(chatId, message);
  try {
    sessionStorage.setItem(storageKey(chatId), JSON.stringify(message));
  } catch {
    // Private mode etc: module state still covers the same-tab flow.
  }
}

/** Is a first message waiting for this chat (without taking it)? */
export function hasPendingMessage(chatId: string): boolean {
  return pending.has(chatId) || readStored(chatId) !== undefined;
}

export function takePendingMessage(chatId: string): ComposerMessage | undefined {
  const message = pending.get(chatId) ?? readStored(chatId);
  pending.delete(chatId);
  try {
    sessionStorage.removeItem(storageKey(chatId));
  } catch {
    // ignore
  }
  return message;
}
