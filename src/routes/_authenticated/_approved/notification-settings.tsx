import { createFileRoute } from "@tanstack/react-router";
import { Globe, Smartphone, Volume2 } from "lucide-react";
import { PushNotificationsToggle } from "@/components/app/PushNotificationsToggle";
import { NotificationChannelPrefs } from "@/components/app/NotificationChannelPrefs";
import { SoundSettings } from "@/components/app/SoundSettings";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const Route = createFileRoute("/_authenticated/_approved/notification-settings")({
  head: () => ({
    meta: [
      { title: "Notification settings · BM Support" },
      { name: "description", content: "Choose which browser and phone alerts you get, and play alert sounds." },
      { property: "og:title", content: "Notification settings · BM Support" },
      { property: "og:description", content: "Choose which browser and phone alerts you get, and play alert sounds." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: NotificationSettingsPage,
});

function NotificationSettingsPage() {
  return (
    <main className="flex-1 overflow-y-auto">
      <div className="w-full p-4 md:p-6 space-y-4">
        <h1 className="font-display text-2xl font-bold">Notification settings</h1>
        <div className="rounded-xl border border-border bg-surface-1 p-4 space-y-2">
          <h2 className="font-display text-sm font-semibold">Phone & browser alerts</h2>
          <p className="text-xs text-muted-foreground">
            Get alerts even when BM Support is closed. On iPhone, open BM Support from your Home Screen icon first, then tap Enable.
          </p>
          <PushNotificationsToggle />
        </div>
        <Tabs defaultValue="browser" className="w-full">
          <TabsList className="w-full sm:w-auto">
            <TabsTrigger value="browser" className="gap-1.5"><Globe className="size-4" />Browser</TabsTrigger>
            <TabsTrigger value="phone" className="gap-1.5"><Smartphone className="size-4" />Phone app</TabsTrigger>
            <TabsTrigger value="sounds" className="gap-1.5"><Volume2 className="size-4" />Sounds</TabsTrigger>
          </TabsList>
          <TabsContent value="browser" className="pt-3">
            <NotificationChannelPrefs channel="browser" />
          </TabsContent>
          <TabsContent value="phone" className="pt-3 space-y-3">
            <p className="text-xs text-muted-foreground">
              Android phones play BM Support's own alert sounds. On iPhone or iPad you get the alerts, but only your phone's default message tone — custom sounds aren't possible there.
            </p>
            <NotificationChannelPrefs channel="phone" />
          </TabsContent>
          <TabsContent value="sounds" className="pt-3">
            <SoundSettings />
          </TabsContent>
        </Tabs>
      </div>
    </main>
  );
}
