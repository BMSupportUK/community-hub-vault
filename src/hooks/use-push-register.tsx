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

        // Default alerts channel for plain dings (e.g. inbox DMs) while the
        // app is in the foreground. No custom sound = system default ding.
        await LocalNotifications.createChannel({
          id: "bm_support_alerts_v4",
          name: "BM Support alerts",
          description: "Signups, tickets, orders and staff alerts",
          importance: 5,
          visibility: 1,
          vibration: true,
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

        await PushNotifications.createChannel({
          id: "bm_support_mentions_v1",
          name: "Mentions",
          description: "Spoken alert when somebody mentions you",
          importance: 4,
          visibility: 1,
          lights: true,
          vibration: true,
          sound: "mention_notify.mp3",
        });

        await LocalNotifications.createChannel({
          id: "bm_support_mentions_v1",
          name: "Mentions",
          description: "Spoken alert when somebody mentions you",
          importance: 5,
          visibility: 1,
          vibration: true,
          sound: "mention_notify.mp3",
        });

        // Shift start/end use the same spoken MP3s as the in-app shift pop-up.
        // New support tickets use the same MP3 as the in-app ticket alert. The
        // v2 ticket channel intentionally replaces v1: Android permanently
        // retained the silent sound setting from the first v1 installation.
        const spokenChannels = [
          { id: "bm_support_tickets_v3", name: "New support tickets", sound: "ticket_notify.mp3" },
          { id: "bm_support_shift_start_v4", name: "Shift starting", sound: "shift_start_notify.mp3" },
          { id: "bm_support_shift_end_v4", name: "Shift ending", sound: "shift_end_notify.mp3" },
          { id: "bm_support_outage_v2", name: "Service outage", sound: "outage_notify.mp3" },
          { id: "bm_support_outage_resolved_v2", name: "Outage resolved", sound: "outage_resolved_notify.mp3" },
          { id: "bm_support_orders_v1", name: "New orders", sound: "order_notify.mp3" },
          { id: "bm_support_payments_v1", name: "Payments received", sound: "payment_received_notify.mp3" },
        ];
        for (const c of spokenChannels) {
          await PushNotifications.createChannel({
            ...c,
            description: "Spoken alert for shifts and service outages",
            importance: 4,
            visibility: 1,
            lights: true,
            vibration: true,
          });
          await LocalNotifications.createChannel({
            ...c,
            description: "Spoken alert for shifts and service outages",
            importance: 5,
            visibility: 1,
            vibration: true,
          });
        }

        const received = await PushNotifications.addListener("pushNotificationReceived", async (notification) => {
          const kind = notification.data?.kind;
          const incidentEvent = notification.data?.event;
          const spoken = kind === "dm"
            ? { channelId: "bm_support_alerts_v4", sound: undefined as string | undefined, fallback: "New message" }
            : kind === "ticket_reply"
            ? { channelId: "bm_support_ticket_replies_v2", sound: "ticket_reply_notify.mp3", fallback: "Support ticket reply" }
            : kind === "mention"
              ? { channelId: "bm_support_mentions_v1", sound: "mention_notify.mp3", fallback: "New mention" }
              : kind === "ticket_raised" || kind === "ticket"
                ? { channelId: "bm_support_tickets_v3", sound: "ticket_notify.mp3", fallback: "New support ticket" }
                : typeof kind === "string" && kind.startsWith("shift_start")
                  ? { channelId: "bm_support_shift_start_v4", sound: "shift_start_notify.mp3", fallback: "Shift starts soon" }
                  : typeof kind === "string" && kind.startsWith("shift_end")
                    ? { channelId: "bm_support_shift_end_v4", sound: "shift_end_notify.mp3", fallback: "Shift ends soon" }
                    : kind === "incident" && incidentEvent === "created"
                      ? { channelId: "bm_support_outage_v2", sound: "outage_notify.mp3", fallback: "Service outage" }
                      : kind === "incident" && incidentEvent === "resolved"
                        ? { channelId: "bm_support_outage_resolved_v2", sound: "outage_resolved_notify.mp3", fallback: "Outage resolved" }
                        : kind === "order" || kind === "order_placed"
                          ? { channelId: "bm_support_orders_v1", sound: "order_notify.mp3", fallback: "New order" }
                          : kind === "order_paid" || kind === "invoice_paid" || kind === "wise_payment"
                            ? { channelId: "bm_support_payments_v1", sound: "payment_received_notify.mp3", fallback: "Payment received" }
                            : null;
          if (!spoken) return;
          try {
            await LocalNotifications.schedule({
              notifications: [{
                id: Math.floor(Date.now() % 2_000_000_000),
                title: notification.title || spoken.fallback,
                body: notification.body || "Open BM Support to view it.",
                channelId: spoken.channelId,
                sound: spoken.sound,
                extra: notification.data,
              }],
            });
          } catch (e) {
            console.error("[push] foreground spoken alert failed", e);
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

        // Tapping a notification (app closed or backgrounded) opens the app
        // straight on the relevant page instead of just the home screen.
        const openUrl = (url: unknown) => {
          if (typeof url === "string" && url.startsWith("/")) {
            window.location.assign(url);
          }
        };
        const tapped = await PushNotifications.addListener("pushNotificationActionPerformed", (action) => {
          openUrl(action.notification?.data?.url);
        });
        const localTapped = await LocalNotifications.addListener("localNotificationActionPerformed", (action) => {
          openUrl(action.notification?.extra?.url);
        });
        listeners.push(reg, err, received, tapped, localTapped);

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