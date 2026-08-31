import { useEffect } from "react";
import { Capacitor } from "@capacitor/core";
import { PushNotifications } from "@capacitor/push-notifications";
import { LocalNotifications } from "@capacitor/local-notifications";
import { useServerFn } from "@tanstack/react-start";
import { useAuth } from "@/hooks/use-auth";
import { registerDeviceToken } from "@/lib/push.functions";

/**
 * Registers the native device with FCM and saves the token server-side.
 * No-op on web.
 */
export function usePushRegister() {
  const { user } = useAuth();
  const register = useServerFn(registerDeviceToken);

  useEffect(() => {
    if (!user) return;
    if (!Capacitor.isNativePlatform()) return;

    let removed = false;
    const listeners: { remove: () => void }[] = [];

    (async () => {
      try {
        const perm = await PushNotifications.checkPermissions();
        let granted = perm.receive === "granted";
        if (!granted) {
          const req = await PushNotifications.requestPermissions();
          granted = req.receive === "granted";
        }
        if (!granted || removed) return;

        await PushNotifications.createChannel({
          id: "bm_support_alerts_v4",
          name: "BM Support alerts",
          description: "Signups, tickets, orders and staff alerts",
          importance: 4,
          visibility: 1,
          lights: true,
          vibration: true,
          // Do NOT pass `sound`. Capacitor treats `sound: "default"` as a
          // custom raw resource lookup (res/raw/default.*) and, when the
          // file is missing, creates a silent channel. Omitting `sound`
          // lets Android use the system default notification ringtone.
        });

        // Ticket replies use the exact spoken MP3 bundled in res/raw. Android
        // notification-channel sounds only work from native resources; a web
        // asset URL cannot be used while the app is backgrounded or closed.
        await PushNotifications.createChannel({
          id: "bm_support_ticket_replies_v2",
          name: "Support ticket replies",
          description: "Spoken alert when a customer replies to an assigned ticket",
          importance: 4,
          visibility: 1,
          lights: true,
          vibration: true,
          sound: "ticket_reply_notify.mp3",
        });

        // Android does not display an FCM notification (and therefore does not
        // play its channel sound) while the app is in the foreground. Mirror a
        // received ticket reply into a native local notification so the exact
        // bundled MP3 is used whether the app is open, backgrounded or closed.
        await LocalNotifications.createChannel({
          id: "bm_support_ticket_replies_v2",
          name: "Support ticket replies",
          description: "Spoken alert when a customer replies to an assigned ticket",
          importance: 5,
          visibility: 1,
          vibration: true,
          sound: "ticket_reply_notify.mp3",
        });

        const received = await PushNotifications.addListener("pushNotificationReceived", async (notification) => {
          if (notification.data?.kind !== "ticket_reply") return;
          try {
            await LocalNotifications.schedule({
              notifications: [{
                id: Math.floor(Date.now() % 2_000_000_000),
                title: notification.title || "Support ticket reply",
                body: notification.body || "A customer replied to an assigned ticket.",
                channelId: "bm_support_ticket_replies_v2",
                sound: "ticket_reply_notify.mp3",
                extra: notification.data,
              }],
            });
          } catch (e) {
            console.error("[push] foreground ticket reply sound failed", e);
          }
        });

        const reg = await PushNotifications.addListener("registration", async (t) => {
          try {
            await register({ data: { token: t.value, platform: "android" } });
          } catch (e) {
            console.error("[push] failed to save token", e);
          }
        });
        const err = await PushNotifications.addListener("registrationError", (e) => {
          console.error("[push] registration error", e);
        });
        listeners.push(reg, err, received);

        await PushNotifications.register();
      } catch (e) {
        console.error("[push] init failed", e);
      }
    })();

    return () => {
      removed = true;
      for (const l of listeners) l.remove();
    };
  }, [user, register]);
}