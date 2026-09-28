import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Ticket } from "lucide-react";
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

export function StaffTicketsButton({ staffId, staffName }: { staffId: string; staffName: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        aria-label={`Tickets for ${staffName}`}
        title="Ticket overview"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => { e.stopPropagation(); e.preventDefault(); setOpen(true); }}
        className="grid size-6 shrink-0 place-items-center rounded-md bg-surface-2/80 text-muted-foreground hover:bg-primary hover:text-primary-foreground"
      >
        <Ticket className="size-3.5" />
      </button>
      {open && <StaffTicketsDialog staffId={staffId} staffName={staffName} onClose={() => setOpen(false)} />}
    </>
  );
}

function StaffTicketsDialog({ staffId, staffName, onClose }: { staffId: string; staffName: string; onClose: () => void }) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [names, setNames] = useState<Map<string, string>>(new Map());

  useEffect(() => {
    let alive = true;
    (async () => {
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
      if (alive) { setNames(map); setRows(list); }
    })();
    return () => { alive = false; };
  }, []);

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
          <Link
            key={r.id}
            to="/tickets"
            search={{ view: "all" } as never}
            onClick={onClose}
            className="block rounded-md border border-border bg-background/60 p-2 hover:bg-surface-2"
          >
            <p className="truncate text-sm font-medium">{r.subject}</p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              Customer: {names.get(r.user_id) ?? "Unknown"} · {r.status.replace("_", " ")} · {r.priority}
            </p>
            <p className="text-[11px] text-muted-foreground">
              {r.assigned_to ? `Claimed by ${names.get(r.assigned_to) ?? "staff"}` : "Not claimed"} · opened {ago(r.created_at)}
            </p>
          </Link>
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
