import { useEffect } from "react";
import {
  ensureLocalNotifyPermission,
  localNotifySupported,
  showLocalNotification,
} from "@/lib/local-notify";

/**
 * Mirrors every sonner toast as a real browser/OS notification popup,
 * the same way shift clock-in/out alerts appear.
 *
 * Works by observing the sonner toaster DOM so it covers every toast in the
 * app without touching each call site.
 */
export function ToastNotificationBridge() {
  useEffect(() => {
    if (!localNotifySupported()) return;

    // Ask once, on the first real interaction (browsers require a gesture).
    const askOnce = () => {
      void ensureLocalNotifyPermission();
      window.removeEventListener("pointerdown", askOnce);
      window.removeEventListener("keydown", askOnce);
    };
    if (Notification.permission === "default") {
      window.addEventListener("pointerdown", askOnce, { once: true });
      window.addEventListener("keydown", askOnce, { once: true });
    }

    const recent = new Map<string, number>();
    const seen = new WeakSet<Element>();

    const readToast = (el: Element) => {
      if (seen.has(el)) return;
      seen.add(el);
      const title =
        el.querySelector("[data-title]")?.textContent?.trim() ||
        el.textContent?.trim() ||
        "";
      const body = el.querySelector("[data-description]")?.textContent?.trim() || "";
      if (!title) return;
      const key = `${title}|${body}`;
      const now = Date.now();
      const last = recent.get(key);
      if (last && now - last < 5000) return;
      recent.set(key, now);
      for (const [k, t] of recent) if (now - t > 30000) recent.delete(k);
      void showLocalNotification(title, { body, tag: key.slice(0, 120) });
    };

    const scan = (node: Node) => {
      if (!(node instanceof Element)) return;
      if (node.matches("[data-sonner-toast]")) readToast(node);
      node.querySelectorAll?.("[data-sonner-toast]").forEach(readToast);
    };

    // Mark toasts already on screen as seen so we don't replay them.
    document.querySelectorAll("[data-sonner-toast]").forEach((el) => seen.add(el));

    const observer = new MutationObserver((records) => {
      for (const rec of records) rec.addedNodes.forEach(scan);
    });
    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      observer.disconnect();
      window.removeEventListener("pointerdown", askOnce);
      window.removeEventListener("keydown", askOnce);
    };
  }, []);

  return null;
}

export default ToastNotificationBridge;
