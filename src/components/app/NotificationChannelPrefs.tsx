import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Switch } from "@/components/ui/switch";
import { categoriesForRoles, type NotifyChannel } from "@/lib/notification-categories";

type Prefs = Record<string, { browser: boolean; phone: boolean }>;

/** Per-type on/off switches for browser alerts and phone app alerts. */
export function NotificationChannelPrefs({ channel }: { channel: NotifyChannel }) {
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

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
      {cats.map((c) => (
        <label key={c.id} className="flex items-center justify-between gap-3 rounded-xl border border-border bg-surface-2 p-4 cursor-pointer">
          <span className="min-w-0">
            <span className="block text-sm font-semibold">{c.label}</span>
            <span className="block text-xs text-muted-foreground">{c.hint}</span>
          </span>
          <Switch checked={get(c.id)[channel]} onCheckedChange={(v) => toggle(c.id, channel, v)} />
        </label>
      ))}
    </div>
  );
}
