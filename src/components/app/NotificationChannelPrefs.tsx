import { useEffect, useState } from "react";
import { Globe, Smartphone } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Switch } from "@/components/ui/switch";
import { categoriesForRoles, type NotifyChannel } from "@/lib/notification-categories";

type Prefs = Record<string, { browser: boolean; phone: boolean }>;

/** Per-type on/off switches for browser alerts and phone app alerts. */
export function NotificationChannelPrefs() {
  const { user, roles } = useAuth();
  const cats = categoriesForRoles((roles ?? []).map(String));
  const [prefs, setPrefs] = useState<Prefs>({});

  useEffect(() => {
    if (!user?.id) return;
    (supabase as any)
      .from("notification_channel_prefs")
      .select("category, browser, phone")
      .eq("user_id", user.id)
      .then(({ data }: any) => {
        const p: Prefs = {};
        for (const r of data ?? []) p[r.category] = { browser: r.browser, phone: r.phone };
        setPrefs(p);
      });
  }, [user?.id]);

  const get = (cat: string) => prefs[cat] ?? { browser: true, phone: true };

  const toggle = async (cat: string, channel: NotifyChannel, value: boolean) => {
    if (!user?.id) return;
    const next = { ...get(cat), [channel]: value };
    setPrefs((p) => ({ ...p, [cat]: next }));
    const { error } = await (supabase as any)
      .from("notification_channel_prefs")
      .upsert({ user_id: user.id, category: cat, ...next, updated_at: new Date().toISOString() });
    if (error) {
      toast.error("Couldn't save that change");
      setPrefs((p) => ({ ...p, [cat]: { ...next, [channel]: !value } }));
    }
  };

  const Column = ({ channel, title, icon, note }: { channel: NotifyChannel; title: string; icon: React.ReactNode; note?: string }) => (
    <div className="rounded-xl border border-border bg-surface-2 p-3 space-y-1">
      <div className="flex items-center gap-2 text-sm font-semibold pb-1">{icon}{title}</div>
      {note ? (
        <p className="text-xs text-muted-foreground border-b border-border pb-2 mb-1">{note}</p>
      ) : null}
      {cats.map((c) => (
        <label key={c.id} className="flex items-center justify-between gap-3 py-1.5 cursor-pointer">
          <span className="min-w-0">
            <span className="block text-sm">{c.label}</span>
            <span className="block text-xs text-muted-foreground">{c.hint}</span>
          </span>
          <Switch checked={get(c.id)[channel]} onCheckedChange={(v) => toggle(c.id, channel, v)} />
        </label>
      ))}
    </div>
  );

  return (
    <div className="grid gap-3 md:grid-cols-2 pt-2">
      <Column channel="browser" title="Browser notifications" icon={<Globe className="size-4" />} />
      <Column
        channel="phone"
        title="Phone app notifications"
        icon={<Smartphone className="size-4" />}
        note="Android phones play BM Support's own alert sounds. On iPhone or iPad you get the alerts, but only your phone's default message tone — custom sounds aren't possible there."
      />
    </div>
  );
}
