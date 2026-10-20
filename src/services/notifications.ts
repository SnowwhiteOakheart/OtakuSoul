import { isPermissionGranted, requestPermission, sendNotification } from '@tauri-apps/plugin-notification';

/** Longest notification text; the full message is in the chat. */
const BODY_CHARS = 160;

/** Text for a notification: one line without role-play markup, shortened. */
export function notificationBody(text: string): string {
  const plain = text.replace(/[*_~`]/g, '').replace(/\s+/g, ' ').trim();
  return plain.length > BODY_CHARS ? `${plain.slice(0, BODY_CHARS - 1).trimEnd()}…` : plain;
}

/**
 * Shows a system notification; asks for the permission the first time. Failures (no
 * notification service, permission denied) are only logged: the message is in the chat anyway.
 */
export async function notify(title: string, body: string): Promise<void> {
  try {
    let granted = await isPermissionGranted();
    if (!granted) granted = (await requestPermission()) === 'granted';
    if (granted) sendNotification({ title, body: notificationBody(body) });
  } catch (e) {
    console.warn('Notification failed:', e);
  }
}
