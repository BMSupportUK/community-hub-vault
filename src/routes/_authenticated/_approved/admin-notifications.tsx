import { createFileRoute, Navigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { BellRing, Loader2, ArrowLeft, Send, CheckCircle2, XCircle, MinusCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { isAdminUnlocked } from "@/lib/admin-unlock";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/_approved/admin-notifications")({
  component: AdminNotifications,
});

interface Settings {
  telegram_chat_id: string | null;
  notify_signups: boolean;
  notify_tickets: boolean;
  notify_orders: boolean;
}

interface LogRow {
  id: string;
  kind: string;
  channel: string;
  status: string;
  message: string | null;
  error: string | null;
  created_at: string;
}

function AdminNotifications() {
  const { hasAny, user } = useAuth();
  const isAdmin = hasAny(["admin", "management"]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [log, setLog] = useState<LogRow[]>([]);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  const loadAll = async () => {
    const [{ data: s, error: sErr }, { data: l }] = await Promise.all([
      supabase
        .from("notification_settings")
        .select("telegram_chat_id, notify_signups, notify_tickets, notify_orders")
        .eq("id", true)
        .maybeSingle(),
      supabase
        .from("notification_log")
        .select("id, kind, channel, status, message, error, created_at")
        .order("created_at", { ascending: false })
        .limit(50),
    ]);
    if (sErr) toast.error(sErr.message);
    setSettings((s as Settings) ?? { telegram_chat_id: null, notify_signups: true, notify_tickets: true, notify_orders: true });
    setLog((l as LogRow[]) ?? []);
  };

  useEffect(() => { loadAll(); }, []);

  if (!isAdmin || !isAdminUnlocked(user?.id)) return <Navigate to="/home" />;

  const save = async () => {
    if (!settings) return;
    setSaving(true);
    const chat = (settings.telegram_chat_id || "").trim();
    const { error } = await supabase
      .from("notification_settings")
      .update({
        telegram_chat_id: chat || null,
        notify_signups: settings.notify_signups,
        notify_tickets: settings.notify_tickets,
        notify_orders: settings.notify_orders,
        updated_at: new Date().toISOString(),
      } as never)
      .eq("id", true);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Settings saved");
  };

  const sendTest = async () => {
    if (!settings?.telegram_chat_id) {
      toast.error("Set a Telegram chat ID first");
      return;
    }
    setTesting(true);
    try {
      const res = await fetch("/api/public/hooks/notify", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string,
        },
        body: JSON.stringify({ test: true, text: "✅ Test from BM Support admin panel" }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json?.ok === false) {
        toast.error(json?.error || `HTTP ${res.status}`);
      } else {
        toast.success("Test sent");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setTesting(false);
      loadAll();
    }
  };

  return (
    <main className="flex-1 overflow-y-auto">
      <section className="relative overflow-hidden border-b border-border">
        <div className="absolute inset-0 bg-gradient-to-br from-sky-700 via-indigo-700 to-violet-700" />
        <div className="relative p-6 md:p-10 text-white">
          <Link to="/admin" className="inline-flex items-center gap-1 text-xs text-white/70 hover:text-white mb-3">
            <ArrowLeft className="size-3.5" /> Admin
          </Link>
          <div className="text-xs uppercase tracking-[0.2em] text-indigo-200/80 mb-3 flex items-center gap-2">
            <BellRing className="size-3.5" /> Notifications
          </div>
          <h1 className="font-display text-3xl md:text-5xl font-bold">Telegram notifications</h1>
          <p className="mt-3 text-white/80 max-w-xl">
            Send a Telegram alert to a shared staff chat whenever a new signup, support ticket, or sale comes in.
          </p>
        </div>
      </section>

      <div className="p-6 max-w-3xl mx-auto space-y-6">
        {!settings ? (
          <div className="text-sm text-muted-foreground flex items-center gap-2"><Loader2 className="size-4 animate-spin" /> Loading…</div>
        ) : (
          <>
            <div className="rounded-2xl border border-border bg-surface p-6 space-y-5">
              <div>
                <label className="block text-sm font-medium mb-1.5">Telegram chat ID</label>
                <input
                  value={settings.telegram_chat_id ?? ""}
                  onChange={(e) => setSettings({ ...settings, telegram_chat_id: e.target.value })}
                  placeholder="-1001234567890"
                  className="w-full h-11 px-3 rounded-lg bg-input border border-border font-mono text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
                <p className="text-xs text-muted-foreground mt-1.5">
                  Add your bot to the destination group, send any message, then visit{" "}
                  <code className="px-1 rounded bg-surface-2">https://api.telegram.org/bot&lt;TOKEN&gt;/getUpdates</code>{" "}
                  to find the chat ID (negative number for groups). Or DM the bot and use your own user ID.
                </p>
              </div>

              <div className="space-y-2 pt-2 border-t border-border">
                <div className="text-sm font-medium mb-1">Send a notification when…</div>
                {([
                  ["notify_signups", "A new member signs up"],
                  ["notify_tickets", "A new support ticket is opened"],
                  ["notify_orders",  "A new order is placed or paid"],
                ] as const).map(([key, label]) => (
                  <label key={key} className="flex items-center gap-3 py-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={settings[key]}
                      onChange={(e) => setSettings({ ...settings, [key]: e.target.checked })}
                      className="size-4 rounded border-border"
                    />
                    <span className="text-sm">{label}</span>
                  </label>
                ))}
              </div>

              <div className="flex flex-wrap gap-2 pt-2 border-t border-border">
                <button
                  onClick={save}
                  disabled={saving}
                  className="inline-flex items-center gap-2 px-4 h-10 rounded-lg bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50"
                >
                  {saving && <Loader2 className="size-4 animate-spin" />} Save settings
                </button>
                <button
                  onClick={sendTest}
                  disabled={testing || !settings.telegram_chat_id}
                  className="inline-flex items-center gap-2 px-4 h-10 rounded-lg bg-surface-2 border border-border text-sm disabled:opacity-50"
                >
                  {testing ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />} Send test
                </button>
              </div>
            </div>

            <div className="rounded-2xl border border-border bg-surface overflow-hidden">
              <div className="px-5 py-3 border-b border-border flex items-center justify-between">
                <h2 className="font-display font-semibold text-sm">Recent deliveries</h2>
                <button onClick={loadAll} className="text-xs text-muted-foreground hover:text-foreground">Refresh</button>
              </div>
              {log.length === 0 ? (
                <div className="p-6 text-sm text-muted-foreground text-center">No notifications yet.</div>
              ) : (
                <ul className="divide-y divide-border">
                  {log.map((r) => (
                    <li key={r.id} className="px-5 py-3 flex items-start gap-3 text-sm">
                      <span className="mt-0.5">
                        {r.status === "sent" ? <CheckCircle2 className="size-4 text-emerald-400" /> :
                         r.status === "failed" ? <XCircle className="size-4 text-rose-400" /> :
                         <MinusCircle className="size-4 text-muted-foreground" />}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium capitalize">{r.kind}</span>
                          <span className="text-xs px-1.5 py-0.5 rounded bg-surface-2 capitalize">{r.status}</span>
                          <span className="text-xs text-muted-foreground">{new Date(r.created_at).toLocaleString()}</span>
                        </div>
                        {r.message && <div className="text-xs text-muted-foreground mt-0.5 whitespace-pre-wrap break-words line-clamp-3">{r.message}</div>}
                        {r.error && <div className="text-xs text-rose-400 mt-0.5 break-words">{r.error}</div>}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        )}
      </div>
    </main>
  );
}