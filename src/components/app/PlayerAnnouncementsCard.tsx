import { useEffect, useState } from "react";
import { ArrowLeft, Loader2, Megaphone, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

type Row = { id: string; message: string; active: boolean; created_at: string; ended_at: string | null };
const MAX = 300;

/** Admin/management send one live announcement to every BM Player; sending a new one replaces the old. */
export function PlayerAnnouncementsCard({ onBack }: { onBack: () => void }) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const { data, error } = await supabase.from("player_announcements").select("id, message, active, created_at, ended_at")
      .order("created_at", { ascending: false }).limit(20);
    if (error) toast.error("Couldn't load announcements.");
    setRows(data ?? []);
  };
  useEffect(() => { void load(); }, []);

  const send = async () => {
    const message = text.trim();
    if (!message) return;
    setBusy(true);
    const { data: auth } = await supabase.auth.getUser();
    const uid = auth.user?.id;
    const ended = await supabase.from("player_announcements").update({ active: false, ended_at: new Date().toISOString() }).eq("active", true);
    const { error } = ended.error ? ended : await supabase.from("player_announcements").insert({ message, created_by: uid });
    setBusy(false);
    if (error) { toast.error("Couldn't send the announcement."); return; }
    setText(""); toast.success("Announcement sent to every BM Player."); void load();
  };
  const stop = async (id: string) => {
    setBusy(true);
    const { error } = await supabase.from("player_announcements").update({ active: false, ended_at: new Date().toISOString() }).eq("id", id);
    setBusy(false);
    if (error) toast.error("Couldn't stop it."); else { toast.success("Announcement removed from BM Players."); void load(); }
  };
  const live = rows?.find((r) => r.active);

  return (
    <div className="max-w-2xl space-y-4">
      <Button variant="ghost" size="sm" onClick={onBack}><ArrowLeft className="size-4" /> Back to tools</Button>
      <section className="rounded-2xl border border-border bg-surface-1 p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Megaphone className="size-5 text-primary" />
          <h2 className="font-display text-lg font-bold">BM Player announcements</h2>
        </div>
        <p className="text-sm text-muted-foreground">
          Shows along the bottom of every BM Player within about 15 seconds, on every screen, including while watching. Customers can close it with the cross. Sending a new one replaces the current one.
        </p>
        <Textarea value={text} maxLength={MAX} rows={3} placeholder="e.g. Some channels are down tonight — we're working on it."
          onChange={(e) => setText(e.target.value)} />
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs text-muted-foreground">{text.length}/{MAX}</span>
          <Button onClick={send} disabled={busy || !text.trim()}>
            {busy && <Loader2 className="size-4 animate-spin" />} Send to all BM Players
          </Button>
        </div>
      </section>

      <section className="rounded-2xl border border-border bg-surface-1 p-5 space-y-3">
        <h3 className="font-display font-bold">Showing now</h3>
        {rows === null ? <Loader2 className="size-4 animate-spin" /> : live ? (
          <div className="flex items-start gap-3 rounded-xl border border-primary/40 bg-primary/10 p-3">
            <p className="flex-1 text-sm whitespace-pre-wrap">{live.message}</p>
            <Button size="sm" variant="outline" disabled={busy} onClick={() => stop(live.id)}><X className="size-4" /> Stop showing</Button>
          </div>
        ) : <p className="text-sm text-muted-foreground">No announcement is showing.</p>}
        {rows && rows.filter((r) => !r.active).length > 0 && (
          <>
            <h3 className="font-display font-bold pt-2">Earlier</h3>
            <ul className="space-y-2">
              {rows.filter((r) => !r.active).map((r) => (
                <li key={r.id} className="rounded-xl border border-border p-3 text-sm">
                  <p className="whitespace-pre-wrap">{r.message}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Sent {new Date(r.created_at).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}
                  </p>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
    </div>
  );
}
