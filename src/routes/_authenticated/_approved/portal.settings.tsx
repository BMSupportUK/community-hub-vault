import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { Bell, Globe, Loader2, Palette, ShieldCheck, Smartphone, Tv, UserRound, Volume2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { PortalTabs } from "@/components/app/PortalTabs";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PushNotificationsToggle } from "@/components/app/PushNotificationsToggle";
import { NotificationChannelPrefs } from "@/components/app/NotificationChannelPrefs";
import { SoundSettings } from "@/components/app/SoundSettings";
import { TvRemoteSetupPanel } from "@/components/app/TvRemoteSetupPanel";
import { AccountSecurityView } from "@/components/app/AccountSecurityView";
import { EditProfileModal, PersonalThemePanel, type ProfileRow } from "./u.$username";

const TABS = ["profile", "theme", "security", "browser", "phone", "sounds", "tv"] as const;
type SettingsTab = (typeof TABS)[number];

export const Route = createFileRoute("/_authenticated/_approved/portal/settings")({
  validateSearch: (s: Record<string, unknown>): { tab?: SettingsTab } => ({
    tab: TABS.includes(s.tab as SettingsTab) ? (s.tab as SettingsTab) : undefined,
  }),
  component: PortalSettingsPage,
  head: () => ({ meta: [
    { title: "Settings | BM Support Customer Portal" },
    { name: "description", content: "Edit your profile, theme, security, notifications and sounds in the BM Support Customer Portal." },
    { property: "og:title", content: "Settings | BM Support Customer Portal" },
    { property: "og:description", content: "Edit your profile, theme, security, notifications and sounds in the BM Support Customer Portal." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }, { name: "robots", content: "noindex, nofollow" },
  ] }),
});

function PortalSettingsPage() {
  const { tab = "profile" } = Route.useSearch();
  const navigate = useNavigate();
  const { user, isStaff } = useAuth();
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const load = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle();
    setProfile((data as ProfileRow | null) ?? null);
  }, [user?.id]);
  useEffect(() => { void load(); }, [load]);

  const item = "gap-1.5";
  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-background">
      <PortalTabs active="settings" />
      <main className="min-h-0 flex-1 overflow-y-auto px-4 py-6 sm:px-8">
        <h1 className="mb-4 font-display text-2xl font-bold">Settings</h1>
        <Tabs value={tab} onValueChange={(v) => navigate({ to: "/portal/settings", search: { tab: v as SettingsTab }, replace: true })}>
          <TabsList className="h-auto flex-wrap justify-start">
            <TabsTrigger value="profile" className={item}><UserRound className="size-4" />Edit profile</TabsTrigger>
            <TabsTrigger value="theme" className={item}><Palette className="size-4" />Theme</TabsTrigger>
            <TabsTrigger value="security" className={item}><ShieldCheck className="size-4" />Security & 2FA</TabsTrigger>
            <TabsTrigger value="browser" className={item}><Globe className="size-4" />Browser alerts</TabsTrigger>
            <TabsTrigger value="phone" className={item}><Smartphone className="size-4" />Phone alerts</TabsTrigger>
            <TabsTrigger value="sounds" className={item}><Volume2 className="size-4" />Sounds</TabsTrigger>
            <TabsTrigger value="tv" className={item}><Tv className="size-4" />TV remote</TabsTrigger>
          </TabsList>

          <TabsContent value="profile" className="pt-4">
            {profile ? (
              <EditProfileModal inline profile={profile} isStaffProfile={isStaff} onClose={() => {}} onSaved={load} />
            ) : <Loader2 className="size-6 animate-spin text-muted-foreground" />}
          </TabsContent>
          <TabsContent value="theme" className="pt-4"><PersonalThemePanel /></TabsContent>
          <TabsContent value="security" className="pt-4">
            <div className="overflow-hidden rounded-2xl border border-border"><AccountSecurityView backTo="/home" /></div>
          </TabsContent>
          <TabsContent value="browser" className="space-y-4 pt-4">
            <section className="space-y-2 rounded-xl border border-border bg-surface-1 p-4">
              <h2 className="flex items-center gap-2 font-display text-sm font-semibold"><Bell className="size-4" />Phone & browser alerts</h2>
              <p className="text-xs text-muted-foreground">Get alerts even when BM Support is closed. On iPhone, open BM Support from your Home Screen icon first, then tap Enable.</p>
              <PushNotificationsToggle />
            </section>
            <NotificationChannelPrefs channel="browser" />
          </TabsContent>
          <TabsContent value="phone" className="space-y-3 pt-4">
            <p className="text-xs text-muted-foreground">Android phones play BM Support's own alert sounds. On iPhone or iPad you get the alerts, but only your phone's default message tone.</p>
            <NotificationChannelPrefs channel="phone" />
          </TabsContent>
          <TabsContent value="sounds" className="pt-4"><SoundSettings /></TabsContent>
          <TabsContent value="tv" className="pt-4"><TvRemoteSetupPanel /></TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
