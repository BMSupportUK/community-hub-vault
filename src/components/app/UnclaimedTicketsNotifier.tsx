import { useCallback, useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowRight, BellRing, ChevronDown, ChevronUp } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { playSound } from "@/lib/sound";
import { showLocalNotification } from "@/lib/local-notify";
import { phoneToneSrc } from "@/lib/phone-alert-sounds";
const ticketAudio = phoneToneSrc("ticket");

type Row = { id: string; subject: string; priority: string; created_at: string };

const UNCLAIMED_QUERY = "id, subject, priority, created_at";

/** Same live query the page-top banner uses, as a reusable loader. */
async function fetchUnclaimed(): Promise<Row[]> {
  const { data } = await supabase
    .from("tickets")
    .select(UNCLAIMED_QUERY)
    .in("status", ["open", "in_progress", "waiting"])
    .is("assigned_to", null)
    .is("archived_at", null)
    .order("created_at", { ascending: true })
    .limit(50);
  return (data ?? []) as Row[];
}

async function claimTicket(id: string, userId: string): Promise<"claimed" | "taken" | "error"> {
  const { data, error } = await supabase
    .from("tickets")
    .update({ assigned_to: userId })
    .eq("id", id)
    .is("assigned_to", null)
    .select("id");
  if (error) return "error";
  return data?.length ? "claimed" : "taken";
}

// Module-level so the memory survives the screen lock unmounting and
// remounting the app — otherwise the new-ticket sound replays on unlock.
let knownTicketIds: Set<string> | null = null;

/**
 * Tickets are claimed, not auto-assigned. For staff who are clocked in this
 * plays a sound plus a browser alert when a new one arrives.
 * This global listener renders no ticket block; claiming stays in ticket controls.
 */
export function UnclaimedTicketsNotifier() {
  const { user, hasAny } = useAuth();
  const isStaff = hasAny(["admin", "management", "staff"]);
  const [onShift, setOnShift] = useState(false);

  const load = useCallback(async () => {
    const list = await fetchUnclaimed();
    const known = knownTicketIds;
    if (known) {
      const fresh = list.filter((r) => !known.has(r.id));
      if (fresh.length) {
        if (ticketAudio) void playSound(ticketAudio, { label: "ticket", gain: 2.0 });
        for (const r of fresh) {
          void showLocalNotification("🎫 Ticket to claim", { body: r.subject, tag: `claim-${r.id}` });
        }
      }
    }
    knownTicketIds = new Set(list.map((r) => r.id));
  }, []);

  // Track whether this staff member is clocked in.
  useEffect(() => {
    if (!user || !isStaff) { setOnShift(false); return; }
    const check = async () => {
      const { data } = await supabase.from("shifts").select("id").eq("user_id", user.id).is("clock_out", null).limit(1);
      setOnShift(!!data?.length);
    };
    void check();
    const ch = supabase
      .channel(`claim-notifier-shift-${user.id}-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "shifts", filter: `user_id=eq.${user.id}` }, () => { void check(); })
      .subscribe();
    return () => { void supabase.removeChannel(ch); };
  }, [user, isStaff]);

  useEffect(() => {
    if (!onShift) { knownTicketIds = null; return; }
    void load();
    const ch = supabase
      .channel(`claim-notifier-tickets-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "tickets" }, () => { void load(); })
      .subscribe();
    return () => { void supabase.removeChannel(ch); };
  }, [onShift, load]);

  return null;
}

/**
 * Talk-only compact bar (user request, 2026-09-29): sits directly above the
 * STAFF/MEMBERS pills in the channel sidebar / people sheet instead of the
 * page-top banner. Same on-shift + live-list rules as the page-top banner;
 * the new-ticket sound is still handled by UnclaimedTicketsNotifier.
 */
export function TalkUnclaimedTicketsBar() {
  const { user, hasAny } = useAuth();
  const isStaff = hasAny(["admin", "management", "staff"]);
  const [onShift, setOnShift] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);
  const [claiming, setClaiming] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!user || !isStaff) { setOnShift(false); return; }
    let cancelled = false;
    const check = async () => {
      const { data } = await supabase.from("shifts").select("id").eq("user_id", user.id).is("clock_out", null).limit(1);
      if (!cancelled) setOnShift(!!data?.length);
    };
    void check();
    const ch = supabase
      .channel(`talk-claim-bar-shift-${user.id}-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "shifts", filter: `user_id=eq.${user.id}` }, () => { void check(); })
      .subscribe();
    return () => { cancelled = true; void supabase.removeChannel(ch); };
  }, [user, isStaff]);

  const load = useCallback(async () => {
    if (!onShift) { setRows([]); return; }
    setRows(await fetchUnclaimed());
  }, [onShift]);

  useEffect(() => {
    void load();
    const ch = supabase
      .channel(`talk-claim-bar-tickets-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "tickets" }, () => { void load(); })
      .subscribe();
    return () => { void supabase.removeChannel(ch); };
  }, [load]);

  const claim = async (id: string) => {
    if (!user) return;
    setClaiming(id);
    const result = await claimTicket(id, user.id);
    setClaiming(null);
    if (result === "error") return toast.error("Couldn't claim the ticket");
    if (result === "taken") toast.error("Someone else claimed this ticket first");
    else toast.success("Ticket claimed", { action: { label: "Go to ticket", onClick: () => { window.location.href = `/tickets?id=${id}&view=all`; } } });
    void load();
  };

  if (!user || !isStaff || !onShift || rows.length === 0) return null;
  const n = rows.length;
  const label = `${n} ticket${n === 1 ? "" : "s"} waiting to be claimed`;

  return (
    <div role="status" className="shrink-0 border-b border-destructive/40 bg-destructive/10">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-1.5 px-2.5 py-1.5 text-left"
        aria-expanded={open}
      >
        <BellRing className="size-3.5 shrink-0 animate-pulse text-destructive" />
        <span className="min-w-0 flex-1 truncate text-[11px] font-semibold text-destructive">{label}</span>
        {open ? <ChevronUp className="size-3.5 shrink-0 text-destructive" /> : <ChevronDown className="size-3.5 shrink-0 text-destructive" />}
      </button>
      {open && (
        <div className="scrollbar-hide max-h-48 space-y-1 overflow-y-auto border-t border-destructive/30 p-1.5">
          {rows.map((r) => (
            <div key={r.id} className="rounded-md border border-border/60 bg-surface-2/60 p-1.5">
              <p className="truncate text-[11px] font-medium text-foreground">{r.subject}</p>
              <p className="text-[10px] capitalize text-muted-foreground">{r.priority} priority</p>
              <div className="mt-1 flex gap-1">
                <Button size="sm" className="h-6 px-2 text-[10px]" disabled={claiming === r.id} onClick={() => claim(r.id)}>
                  {claiming === r.id ? "Claiming…" : "Claim"}
                </Button>
                <Button asChild size="sm" variant="outline" className="h-6 px-2 text-[10px]">
                  <Link to="/tickets" search={{ id: r.id, view: "all" } as never}>Go to ticket <ArrowRight className="size-3" /></Link>
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
