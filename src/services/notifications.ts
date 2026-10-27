import { isPermissionGranted, requestPermission, sendNotification } from '@tauri-apps/plugin-notification';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { api } from './api';

/** Longest notification text; the full message is in the chat. */
const BODY_CHARS = 160;

/** Event from the backend when a chat notification was clicked (`commands::app::notify_chat`). */
export const NOTIFICATION_OPEN_CHAT_EVENT = 'notification-open-chat';

/** The chat a notification is about: a click on it opens that chat. */
export interface ChatTarget {
  charId: string;
  chatId: string;
}

/** Text for a notification: one line without role-play markup, shortened. */
export function notificationBody(text: string): string {
  const plain = text.replace(/[*_~`]/g, '').replace(/\s+/g, ' ').trim();
  return plain.length > BODY_CHARS ? `${plain.slice(0, BODY_CHARS - 1).trimEnd()}…` : plain;
}

/**
 * Shows a system notification; asks for the permission the first time. With a `chat`, Windows
 * opens that chat on a click (elsewhere the plugin's notification has no click action). Failures
 * (no notification service, permission denied) are only logged: the message is in the chat anyway.
 */
export async function notify(title: string, body: string, chat?: ChatTarget): Promise<void> {
  const text = notificationBody(body);
  try {
    if (chat && (await api.notifyChat(title, text, chat.charId, chat.chatId))) return;
    let granted = await isPermissionGranted();
    if (!granted) granted = (await requestPermission()) === 'granted';
    if (granted) sendNotification({ title, body: text });
  } catch (e) {
    console.warn('Notification failed:', e);
  }
}

/** Calls `open` with the chat of a clicked notification (the window is already brought back). */
export function onNotificationClick(open: (chat: ChatTarget) => void): Promise<UnlistenFn> {
  return listen<ChatTarget>(NOTIFICATION_OPEN_CHAT_EVENT, (event) => open(event.payload));
}
