import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Link } from "@tanstack/react-router";
import { ArrowRight, Ticket } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

type Row = {
  id: string;
  subject: string;
  status: string;
  priority: string;
  created_at: string;
  updated_at: string;
  user_id: string;
  assigned_to: string | null;
};

function ago(iso: string) {
  const m = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

// One shared live count of unclaimed tickets for every staff ticket icon.
let unclaimedCount = 0;
const listeners = new Set<(n: number) => void>();
let unclaimedChannel: ReturnType<typeof supabase.channel> | null = null;
async function refreshUnclaimed() {
  const { count } = await supabase
    .from("tickets")
    .select("id", { count: "exact", head: true })
    .in("status", ["open", "in_progress", "waiting"])
    .is("assigned_to", null)
    .is("archived_at", null);
  unclaimedCount = count ?? 0;
  listeners.forEach((l) => l(unclaimedCount));
}
function useUnclaimedCount() {
  const [n, setN] = useState(unclaimedCount);
  useEffect(() => {
    listeners.add(setN);
    if (!unclaimedChannel) {
      void refreshUnclaimed();
      unclaimedChannel = supabase
        .channel(`unclaimed-ticket-count-${Math.random().toString(36).slice(2)}`)
        .on("postgres_changes", { event: "*", schema: "public", table: "tickets" }, () => { void refreshUnclaimed(); })
        .subscribe();
    }
    return () => {
      listeners.delete(setN);
      if (!listeners.size && unclaimedChannel) { void supabase.removeChannel(unclaimedChannel); unclaimedChannel = null; }
    };
  }, []);
  return n;
}

export function StaffTicketsButton({
  staffId,
  staffName,
  placement = "above",
  className,
  readOnly = false,
}: {
  staffId: string;
  staffName: string;
  /** "above" (talk staff cards) or "below" (staff controls in the page header). */
  placement?: "above" | "below";
  className?: string;
  /** Moderators: overview only — no claim button, no ticket links. */
  readOnly?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const unclaimed = useUnclaimedCount();
  const [hoverCounts, setHoverCounts] = useState<{ unclaimed: number; mine: number; others: number } | null>(null);
  const [hoverAnchor, setHoverAnchor] = useState<{ top?: number; bottom?: number; left?: number; right?: number } | null>(null);

  // Three live counts on hover: unclaimed / claimed by this staff member / claimed by other staff.
  const loadHoverCounts = useCallback(async () => {
    // Build each query fresh — reusing one builder would merge the filters together.
    const mk = () =>
      supabase
        .from("tickets")
        .select("id", { count: "exact", head: true })
        .in("status", ["open", "in_progress", "waiting"])
        .is("archived_at", null);
    const [u, m, o] = await Promise.all([
      mk().is("assigned_to", null),
      mk().eq("assigned_to", staffId),
      mk().not("assigned_to", "is", null).neq("assigned_to", staffId),
    ]);
    setHoverCounts({ unclaimed: u.count ?? 0, mine: m.count ?? 0, others: o.count ?? 0 });
  }, [staffId]);

  const hoverOpen = hoverAnchor !== null;
  return (
    <>
      <div
        className={cn("relative", className)}
        onMouseEnter={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          const vw = window.innerWidth;
          // Near the right edge, right-align the panel so it never overflows the screen.
          if (placement === "below") {
            if (vw - r.left < 170) setHoverAnchor({ bottom: r.bottom, right: vw - r.right });
            else setHoverAnchor({ bottom: r.bottom, left: r.left + r.width / 2 });
          } else if (vw - r.left < 170) {
            setHoverAnchor({ top: r.top, right: vw - r.right });
          } else {
            setHoverAnchor({ top: r.top, left: r.left + r.width / 2 });
          }
          void loadHoverCounts();
        }}
        onMouseLeave={() => setHoverAnchor(null)}
      >
        <button
          type="button"
          aria-label={`Tickets for ${staffName}`}
          title={unclaimed > 0 ? `${unclaimed} unclaimed ticket${unclaimed === 1 ? "" : "s"} – click to claim` : "Ticket overview"}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => { e.stopPropagation(); e.preventDefault(); setHoverAnchor(null); setOpen(true); }}
          className={cn(
            "relative grid place-items-center",
            placement === "below"
              ? cn(
                  "size-8 shrink-0 rounded-full transition-colors",
                  unclaimed > 0
                    ? "bg-destructive/15 text-destructive hover:bg-destructive/25"
                    : "text-muted-foreground hover:bg-surface-2 hover:text-foreground",
                )
              : cn(
                  "size-6 shrink-0 rounded-md hover:bg-primary hover:text-primary-foreground",
                  unclaimed > 0 ? "animate-pulse bg-destructive text-destructive-foreground" : "bg-surface-2/80 text-muted-foreground",
                ),
          )}
        >
          <Ticket className="size-3.5" />
          {unclaimed > 0 && (
            <span className="absolute -right-1.5 -top-1.5 grid min-w-4 place-items-center rounded-full bg-background px-1 text-[9px] font-bold leading-4 text-destructive ring-1 ring-destructive">
              {unclaimed > 99 ? "99+" : unclaimed}
            </span>
          )}
        </button>
      </div>
      {/* Fixed-position hover panel so no card overflow can clip it */}
      {hoverOpen && hoverCounts !== null && createPortal(
        <div
          className={cn(
            "pointer-events-none fixed z-[80] w-max rounded-md border border-border bg-background px-2.5 py-1.5 text-left shadow-xl",
            hoverAnchor.left !== undefined && hoverAnchor.top !== undefined && "-translate-x-1/2 -translate-y-full",
            hoverAnchor.right !== undefined && hoverAnchor.top !== undefined && "-translate-y-full",
            hoverAnchor.left !== undefined && hoverAnchor.bottom !== undefined && "-translate-x-1/2",
          )}
          style={{
            ...(hoverAnchor.top !== undefined ? { top: hoverAnchor.top - 6 } : {}),
            ...(hoverAnchor.bottom !== undefined ? { top: hoverAnchor.bottom + 6 } : {}),
            ...(hoverAnchor.left !== undefined ? { left: hoverAnchor.left } : {}),
            ...(hoverAnchor.right !== undefined ? { right: hoverAnchor.right + 8 } : {}),
          }}
        >
          <div className="flex items-center justify-between gap-3 whitespace-nowrap text-[11px] font-medium">
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <span className="size-1.5 rounded-full bg-destructive" />Unclaimed
            </span>
            <span className="font-bold text-destructive">{hoverCounts.unclaimed}</span>
          </div>
          <div className="mt-1 flex items-center justify-between gap-3 whitespace-nowrap text-[11px] font-medium">
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <span className="size-1.5 rounded-full bg-emerald-500" />Claimed by you
            </span>
            <span className="font-bold text-emerald-400">{hoverCounts.mine}</span>
          </div>
          <div className="mt-1 flex items-center justify-between gap-3 whitespace-nowrap text-[11px] font-medium">
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <span className="size-1.5 rounded-full bg-amber-500" />Other staff
            </span>
            <span className="font-bold text-amber-400">{hoverCounts.others}</span>
          </div>
        </div>,
        document.body,
      )}
      {open && <StaffTicketsDialog staffId={staffId} staffName={staffName} readOnly={readOnly} onClose={() => setOpen(false)} />}
    </>
  );
}

function StaffTicketsDialog({ staffId, staffName, readOnly = false, onClose }: { staffId: string; staffName: string; readOnly?: boolean; onClose: () => void }) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [names, setNames] = useState<Map<string, string>>(new Map());
  const [me, setMe] = useState<string | null>(null);
  const [claiming, setClaiming] = useState<string | null>(null);
  const [justClaimed, setJustClaimed] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from("tickets")
      .select("id, subject, status, priority, created_at, updated_at, user_id, assigned_to")
      .in("status", ["open", "in_progress", "waiting"])
      .is("archived_at", null)
      .order("created_at", { ascending: false })
      .limit(300);
    const list = (data ?? []) as Row[];
    const ids = Array.from(new Set(list.flatMap((r) => [r.user_id, r.assigned_to]).filter(Boolean))) as string[];
    const map = new Map<string, string>();
    if (ids.length) {
      const { data: profs } = await supabase.from("profiles").select("id, display_name, username").in("id", ids);
      for (const p of profs ?? []) map.set(p.id, p.display_name || p.username || "User");
    }
    setNames(map);
    setRows(list);
  }, []);

  useEffect(() => {
    void supabase.auth.getUser().then(({ data }) => setMe(data.user?.id ?? null));
    void load();
    const channel = supabase
      .channel(`staff-tickets-dialog-${staffId}-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "tickets" }, () => { void load(); })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [load, staffId]);

  const claim = async (id: string) => {
    if (!me) return;
    setClaiming(id);
    const { data, error } = await supabase
      .from("tickets")
      .update({ assigned_to: me })
      .eq("id", id)
      .is("assigned_to", null)
      .select("id");
    setClaiming(null);
    if (error) return toast.error(error.message);
    if (!data?.length) { toast.error("Someone else claimed this ticket first"); return void load(); }
    toast.success("Ticket claimed");
    setJustClaimed(id);
    await load();
  };

  const mine = rows?.filter((r) => r.assigned_to === staffId) ?? [];
  const unclaimed = rows?.filter((r) => !r.assigned_to) ?? [];
  const others = rows?.filter((r) => r.assigned_to && r.assigned_to !== staffId) ?? [];

  const Col = ({ title, items, tone, empty }: { title: string; items: Row[]; tone: string; empty: string }) => (
    <section className="flex min-h-0 flex-col rounded-lg border border-border bg-surface-1">
      <header className="flex items-center justify-between border-b border-border px-3 py-2">
        <h3 className="text-sm font-semibold">{title}</h3>
        <span className={cn("rounded-full px-2 py-0.5 text-xs font-bold", tone)}>{items.length}</span>
      </header>
      <div className="min-h-0 flex-1 space-y-2 p-2 lg:overflow-y-auto">
        {rows === null ? (
          <p className="p-2 text-xs text-muted-foreground">Loading…</p>
        ) : items.length === 0 ? (
          <p className="p-2 text-xs text-muted-foreground">{empty}</p>
        ) : items.map((r) => (
          <div key={r.id} className={cn("rounded-md border border-border bg-background/60 p-2", justClaimed === r.id && "ring-2 ring-primary")}>
            <p className="truncate text-sm font-medium">{r.subject}</p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              Customer: {names.get(r.user_id) ?? "Unknown"} · {r.status.replace("_", " ")} · {r.priority}
            </p>
            <p className="text-[11px] text-muted-foreground">
              {r.assigned_to ? `Claimed by ${names.get(r.assigned_to) ?? "staff"}` : "Not claimed"} · opened {ago(r.created_at)}
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {!r.assigned_to && (
                <Button size="sm" className="h-8" disabled={!me || claiming === r.id} onClick={() => claim(r.id)}>
                  {claiming === r.id ? "Claiming…" : "Claim ticket"}
                </Button>
              )}
              {(r.assigned_to === me || !r.assigned_to) && (
                <Button asChild size="sm" variant={r.assigned_to === me ? "default" : "outline"} className="h-8">
                  <Link to="/tickets" search={{ id: r.id, view: "all" } as never} onClick={onClose}>
                    Go to ticket <ArrowRight className="size-3.5" />
                  </Link>
                </Button>
              )}
              {r.assigned_to && r.assigned_to !== me && (
                <Button asChild size="sm" variant="ghost" className="h-8">
                  <Link to="/tickets" search={{ id: r.id, view: "all" } as never} onClick={onClose}>View</Link>
                </Button>
              )}
            </div>
          </div>
        ))}
      </div>
    </section>
  );

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="flex h-[100dvh] w-screen max-w-none flex-col gap-3 overflow-y-auto rounded-none p-4 sm:max-w-none lg:overflow-hidden">
        <DialogHeader>
          <DialogTitle>Ticket overview — {staffName}</DialogTitle>
          <DialogDescription>Open tickets, who has claimed them and which are still unclaimed.</DialogDescription>
        </DialogHeader>
        <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 lg:grid-cols-3">
          <Col title={`Claimed by ${staffName}`} items={mine} tone="bg-emerald-500/20 text-emerald-300" empty="No tickets claimed." />
          <Col title="Not claimed" items={unclaimed} tone="bg-destructive/20 text-destructive" empty="Every ticket is claimed." />
          <Col title="Claimed by other staff" items={others} tone="bg-amber-500/20 text-amber-300" empty="None." />
        </div>
      </DialogContent>
    </Dialog>
  );
}
