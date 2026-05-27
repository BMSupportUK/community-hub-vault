import { useEffect } from "react";
import { Capacitor } from "@capacitor/core";
import { PushNotifications } from "@capacitor/push-notifications";
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
          id: "bm_support_alerts_v3",
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
        listeners.push(reg, err);

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