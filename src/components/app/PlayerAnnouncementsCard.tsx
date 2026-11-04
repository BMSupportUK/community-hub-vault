import { useEffect, useState } from "react";
import { ArrowLeft, Check, ChevronsUpDown, Loader2, Megaphone, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from "@/components/ui/command";

type Row = { id: string; message: string; active: boolean; created_at: string; ended_at: string | null; target_user_id: string | null };
type Recipient = { id: string; username: string | null; display_name: string | null };
const MAX = 300;

/** Admin/management send one live announcement; sending a new one replaces the old. */
export function PlayerAnnouncementsCard({ onBack }: { onBack: () => void }) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [targetUserId, setTargetUserId] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const recipientName = (id: string | null) => id === null ? "Everyone" : recipients.find(r => r.id === id)?.username || recipients.find(r => r.id === id)?.display_name || "Selected user";

  const load = async () => {
    const { data, error } = await supabase.from("player_announcements").select("id, message, active, created_at, ended_at, target_user_id")
      .order("created_at", { ascending: false }).limit(20);
    if (error) toast.error("Couldn't load announcements.");
    setRows(data ?? []);
  };
  useEffect(() => { void load(); }, []);
  useEffect(() => {
    let cancelled = false;
    const loadUsers = async () => {
      const all: Recipient[] = [];
      for (let start = 0; ; start += 1000) {
        const { data, error } = await supabase.from("profiles").select("id, username, display_name")
          .order("id").range(start, start + 999);
        if (cancelled) return;
        if (error) { toast.error("Couldn't load users."); setLoadingUsers(false); return; }
        all.push(...(data ?? []));
        if (!data || data.length < 1000) break;
      }
      setRecipients(all.sort((a, b) => (a.username || a.display_name || "").localeCompare(b.username || b.display_name || "")));
      setLoadingUsers(false);
    };
    void loadUsers();
    return () => { cancelled = true; };
  }, []);

  const send = async () => {
    const message = text.trim();
    if (!message) return;
    setBusy(true);
    const { data: auth } = await supabase.auth.getUser();
    const uid = auth.user?.id;
    if (!uid) { setBusy(false); toast.error("Please sign in again."); return; }
    const ended = await supabase.from("player_announcements").update({ active: false, ended_at: new Date().toISOString() }).eq("active", true);
    const { error } = ended.error ? ended : await supabase.from("player_announcements").insert({ message, created_by: uid, target_user_id: targetUserId });
    setBusy(false);
    if (error) { toast.error("Couldn't send the announcement."); return; }
    setText(""); toast.success(targetUserId ? `Announcement sent to ${recipientName(targetUserId)}.` : "Announcement sent to every BM Player."); void load();
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
          One-off bottom-screen announcements. Sending a new one replaces the current one.
        </p>
        <div className="space-y-2">
          <p id="announcement-recipient-label" className="text-sm font-medium">Send to</p>
          <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" role="combobox" aria-expanded={pickerOpen} aria-labelledby="announcement-recipient-label" disabled={busy || loadingUsers} className="w-full justify-between">
                <span className="truncate">{loadingUsers ? "Loading users…" : recipientName(targetUserId)}</span>
                <ChevronsUpDown className="size-4 shrink-0" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
              <Command>
                <CommandInput placeholder="Search users…" />
                <CommandList>
                  <CommandEmpty>No users found.</CommandEmpty>
                  <CommandItem value="Everyone all BM Players" onSelect={() => { setTargetUserId(null); setPickerOpen(false); }}>
                    {targetUserId === null && <Check className="size-4" />} Everyone
                  </CommandItem>
                  {recipients.map(r => <CommandItem key={r.id} value={`${r.username ?? ""} ${r.display_name ?? ""} ${r.id}`} onSelect={() => { setTargetUserId(r.id); setPickerOpen(false); }}>
                    {targetUserId === r.id && <Check className="size-4" />}
                    <span className="min-w-0 break-words">{r.username || r.display_name || "Unnamed user"}</span>
                  </CommandItem>)}
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
        </div>
        <Textarea value={text} maxLength={MAX} rows={3} placeholder="e.g. Some channels are down tonight — we're working on it."
          onChange={(e) => setText(e.target.value)} />
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs text-muted-foreground">{text.length}/{MAX}</span>
          <Button onClick={send} disabled={busy || !text.trim()}>
            {busy && <Loader2 className="size-4 animate-spin" />} {targetUserId ? "Send to selected user" : "Send to all BM Players"}
          </Button>
        </div>
      </section>

      <section className="rounded-2xl border border-border bg-surface-1 p-5 space-y-3">
        <h3 className="font-display font-bold">Showing now</h3>
        {rows === null ? <Loader2 className="size-4 animate-spin" /> : live ? (
          <div className="flex items-start gap-3 rounded-xl border border-primary/40 bg-primary/10 p-3">
            <div className="min-w-0 flex-1"><p className="text-xs text-muted-foreground mb-1">To: {recipientName(live.target_user_id)}</p><p className="text-sm whitespace-pre-wrap">{live.message}</p></div>
            <Button size="sm" variant="outline" disabled={busy} onClick={() => stop(live.id)}><X className="size-4" /> Stop showing</Button>
          </div>
        ) : <p className="text-sm text-muted-foreground">No announcement is showing.</p>}
        {rows && rows.filter((r) => !r.active).length > 0 && (
          <>
            <h3 className="font-display font-bold pt-2">Earlier</h3>
            <ul className="space-y-2">
              {rows.filter((r) => !r.active).map((r) => (
                <li key={r.id} className="rounded-xl border border-border p-3 text-sm">
                  <p className="text-xs text-muted-foreground mb-1">To: {recipientName(r.target_user_id)}</p>
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
