import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useLocation } from "@tanstack/react-router";
import { ArrowRight, BellRing, ChevronDown, ChevronUp } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { playSound } from "@/lib/sound";
import { showLocalNotification } from "@/lib/local-notify";
import ticketAudio from "@/assets/ticket-notify.mp3";

type Row = { id: string; subject: string; priority: string; created_at: string };

/**
 * Tickets are claimed, not auto-assigned. For staff who are clocked in this
 * shows a sticky banner on every page (a pinned card with claim buttons in
 * Talk channels) while tickets wait to be claimed, and plays a sound plus a
 * browser alert when a new one arrives. Off-shift staff see nothing.
 */
export function UnclaimedTicketsNotifier() {
  const { user, hasAny } = useAuth();
  const pathname = useLocation({ select: (l) => l.pathname });
  const isTalk = pathname === "/home" || pathname.startsWith("/home/");
  const onTicketsPage = pathname.startsWith("/tickets");
  const isStaff = hasAny(["admin", "management", "staff"]);
  const [onShift, setOnShift] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);
  const [claiming, setClaiming] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const known = useRef<Set<string> | null>(null);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from("tickets")
      .select("id, subject, priority, created_at")
      .in("status", ["open", "in_progress", "waiting"])
      .is("assigned_to", null)
      .is("archived_at", null)
      .order("created_at", { ascending: true })
      .limit(50);
    const list = (data ?? []) as Row[];
    if (known.current) {
      const fresh = list.filter((r) => !known.current!.has(r.id));
      if (fresh.length) {
        void playSound(ticketAudio, { label: "ticket", gain: 2.0 });
        for (const r of fresh) {
          void showLocalNotification("🎫 Ticket to claim", { body: r.subject, tag: `claim-${r.id}` });
        }
        setCollapsed(false);
      }
    }
    known.current = new Set(list.map((r) => r.id));
    setRows(list);
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
    if (!onShift) { setRows([]); known.current = null; return; }
    void load();
    const ch = supabase
      .channel(`claim-notifier-tickets-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "tickets" }, () => { void load(); })
      .subscribe();
    return () => { void supabase.removeChannel(ch); };
  }, [onShift, load]);

  const claim = async (id: string) => {
    if (!user) return;
    setClaiming(id);
    const { data, error } = await supabase.from("tickets").update({ assigned_to: user.id }).eq("id", id).is("assigned_to", null).select("id");
    setClaiming(null);
    if (error) return toast.error(error.message);
    if (!data?.length) toast.error("Someone else claimed this ticket first");
    else toast.success("Ticket claimed", { action: { label: "Go to ticket", onClick: () => { window.location.href = `/tickets?id=${id}&view=all`; } } });
    void load();
  };

  // Talk channels show the count on the staff ticket icons instead.
  if (!onShift || rows.length === 0 || onTicketsPage || isTalk) return null;
  const n = rows.length;
  const label = `${n} ticket${n === 1 ? "" : "s"} waiting to be claimed`;

  if (isTalk) {
    return (
      <div className="fixed bottom-20 right-3 z-40 w-[min(22rem,calc(100vw-1.5rem))] rounded-lg border border-destructive/60 bg-card shadow-lg md:bottom-4">
        <button type="button" onClick={() => setCollapsed((c) => !c)} className="flex w-full items-center gap-2 px-3 py-2 text-left">
          <BellRing className="size-4 shrink-0 animate-pulse text-destructive" />
          <span className="flex-1 text-sm font-semibold">{label}</span>
          {collapsed ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
        </button>
        {!collapsed && (
          <div className="max-h-72 space-y-2 overflow-y-auto border-t border-border p-2">
            {rows.map((r) => (
              <div key={r.id} className="rounded-md border border-border bg-background/60 p-2">
                <p className="truncate text-sm font-medium">{r.subject}</p>
                <p className="text-[11px] capitalize text-muted-foreground">{r.priority} priority</p>
                <div className="mt-2 flex gap-2">
                  <Button size="sm" className="h-8" disabled={claiming === r.id} onClick={() => claim(r.id)}>
                    {claiming === r.id ? "Claiming…" : "Claim"}
                  </Button>
                  <Button asChild size="sm" variant="outline" className="h-8">
                    <Link to="/tickets" search={{ id: r.id, view: "all" } as never}>Go to ticket <ArrowRight className="size-3.5" /></Link>
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div role="status" className="sticky top-0 z-50 flex items-center gap-2 bg-destructive px-3 py-1.5 text-sm text-destructive-foreground">
      <BellRing className="size-4 shrink-0 animate-pulse" />
      <span className="flex-1 truncate font-medium">{label}</span>
      <Button asChild size="sm" variant="secondary" className="h-7">
        <Link to="/tickets" search={{ view: "all" } as never}>Claim</Link>
      </Button>
    </div>
  );
}
