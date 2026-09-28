/**
 * Local (on-device) browser notifications.
 * Used to mirror in-app toasts as real OS/browser popups.
 */

export function localNotifySupported() {
  return typeof window !== "undefined" && "Notification" in window;
}

export function localNotifyPermission(): NotificationPermission | "unsupported" {
  if (!localNotifySupported()) return "unsupported";
  return Notification.permission;
}

/** Request permission on a user gesture. Safe to call repeatedly. */
export async function ensureLocalNotifyPermission(): Promise<boolean> {
  if (!localNotifySupported()) return false;
  if (Notification.permission === "granted") return true;
  if (Notification.permission === "denied") return false;
  try {
    const perm = await Notification.requestPermission();
    return perm === "granted";
  } catch {
    return false;
  }
}

export async function showLocalNotification(
  title: string,
  opts: { body?: string; tag?: string; icon?: string; silent?: boolean } = {},
): Promise<boolean> {
  if (!localNotifySupported() || Notification.permission !== "granted") return false;
  const payload: NotificationOptions = {
    body: opts.body,
    tag: opts.tag,
    icon: opts.icon ?? "/icon-192.png",
    badge: "/favicon.png",
    silent: opts.silent ?? true,
  };
  try {
    if ("serviceWorker" in navigator) {
      const reg = await navigator.serviceWorker.getRegistration("/sw.js");
      if (reg) {
        await reg.showNotification(title, payload);
        return true;
      }
    }
  } catch {
    /* fall through to constructor */
  }
  try {
    new Notification(title, payload);
    return true;
  } catch {
    return false;
  }
}

/**
 * Close OS/browser notifications on THIS device that match a notification
 * already read on another device, so they don't linger or repeat.
 */
export async function closeLocalNotifications(match: { id?: string; title?: string }) {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
  try {
    const regs = await navigator.serviceWorker.getRegistrations();
    const title = match.title?.trim();
    for (const reg of regs) {
      const list = await reg.getNotifications();
      for (const n of list) {
        const data = (n.data ?? {}) as { notificationId?: string };
        if (
          (match.id && (data.notificationId === match.id || n.tag?.includes(match.id))) ||
          (title && (n.title === title || n.title.endsWith(title)))
        ) {
          n.close();
        }
      }
    }
  } catch {
    /* ignore */
  }
}
