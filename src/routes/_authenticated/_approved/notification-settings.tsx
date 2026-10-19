import { createFileRoute } from "@tanstack/react-router";
import { PushNotificationsToggle } from "@/components/app/PushNotificationsToggle";
import { NotificationChannelPrefs } from "@/components/app/NotificationChannelPrefs";
import { SoundSettings } from "@/components/app/SoundSettings";

export const Route = createFileRoute("/_authenticated/_approved/notification-settings")({
  head: () => ({
    meta: [
      { title: "Notification settings · BM Support" },
      { name: "description", content: "Choose which browser and phone alerts you get, and set alert sounds." },
      { property: "og:title", content: "Notification settings · BM Support" },
      { property: "og:description", content: "Choose which browser and phone alerts you get, and set alert sounds." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: NotificationSettingsPage,
});

function NotificationSettingsPage() {
  return (
    <main className="flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-4xl p-4 md:p-6 space-y-4">
        <h1 className="font-display text-2xl font-bold">Notification settings</h1>
        <div className="rounded-xl border border-border bg-surface-1 p-4 space-y-2">
          <h2 className="font-display text-sm font-semibold">Phone & browser alerts</h2>
          <p className="text-xs text-muted-foreground">
            Get alerts even when BM Support is closed. On iPhone, open BM Support from your Home Screen icon first, then tap Enable.
          </p>
          <PushNotificationsToggle />
          <NotificationChannelPrefs />
        </div>
        <SoundSettings />
      </div>
    </main>
  );
}
