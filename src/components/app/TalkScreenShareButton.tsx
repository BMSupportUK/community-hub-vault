import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "@tanstack/react-router";
import { MonitorUp } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { screenShareDestination } from "@/lib/tv-remote";

type Row = {
  id: string;
  device_name: string;
  status: string;
  requested_at: string | null;
  link_id: string | null;
  link_kind: string | null;
  staff_id: string | null;
};

function ago(iso: string) {
  const m = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  return m < 1 ? "just now" : `${m} min ago`;
}

/** Talk sidebar: screen share help box listing waiting and active customer shares. */
export function TalkScreenShareButton({ variant = "bar" }: { variant?: "bar" | "icon" }) {
  const { user, hasAny } = useAuth();
  const isStaff = hasAny(["admin", "management", "staff"]);
  const navigate = useNavigate();
  const [rows, setRows] = useState<Row[]>([]);
  const [orderLabels, setOrderLabels] = useState<Record<string, string>>({});
  const [open, setOpen] = useState(false);
  const [hoverAnchor, setHoverAnchor] = useState<{ bottom: number; left?: number; right?: number } | null>(null);

  const load = useCallback(async () => {
    const { data } = await supabase.from("tv_remote_sessions")
      .select("id, device_name, status, requested_at, link_id, link_kind, staff_id")
      .in("link_kind", ["order", "ticket"])
      .not("requested_at", "is", null)
      .in("status", ["pending", "claimed", "active"])
      .gt("expires_at", new Date().toISOString())
      .order("requested_at", { ascending: true });
    setRows((data ?? []) as Row[]);
  }, []);

  useEffect(() => {
    if (!user || !isStaff) return;
    void load();
    const id = window.setInterval(load, open ? 4000 : 8000);
    return () => window.clearInterval(id);
  }, [user, isStaff, load, open]);

  // Label each request with the sale it belongs to so staff open that order's
  // own screen share page.
  useEffect(() => {
    const orderIds = [...new Set(rows.flatMap((r) => r.link_kind === "order" && r.link_id ? [r.link_id] : []))];
    if (!orderIds.length) { setOrderLabels({}); return; }
    void (async () => {
      const { data: summaries } = await supabase.rpc("staff_checkout_order_summary" as never);
      const map: Record<string, string> = {};
      for (const s of (summaries ?? []) as { id: string; order_ref: string | null; existing_username: string | null; shipping_name: string | null }[]) {
        if (orderIds.includes(s.id)) map[s.id] = `${s.order_ref ?? s.id.slice(0, 8)} · ${s.existing_username || s.shipping_name || "Customer"}`;
      }
      setOrderLabels(map);
    })();
  }, [rows]);

  if (!user || !isStaff) return null;

  const waiting = rows.filter((r) => r.status === "pending");
  const active = rows.filter((r) => r.status !== "pending");

  const goTo = (r: Row) => {
    const destination = screenShareDestination(r.link_kind, r.link_id);
    if (!destination) return;
    setOpen(false);
    void navigate(destination);
  };

  const label = (r: Row) => `${r.link_kind === "ticket" ? "Ticket" : "Sale"} ${r.link_id ? orderLabels[r.link_id] ?? r.link_id.slice(0, 8) : r.device_name}`;

  return (
    <>
      {variant === "bar" ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex w-full shrink-0 items-center gap-1.5 border-b border-border px-2.5 py-1.5 text-left"
          aria-label="Open screen share requests"
        >
          <MonitorUp className={`size-3.5 shrink-0 ${waiting.length ? "animate-pulse text-destructive" : "text-primary"}`} />
          <span className={`min-w-0 flex-1 truncate text-[11px] font-semibold ${waiting.length ? "text-destructive" : "text-foreground"}`}>
            Screen share
          </span>
          {waiting.length > 0 && (
            <span className="rounded-full bg-destructive px-1.5 text-[10px] font-bold text-destructive-foreground">{waiting.length}</span>
          )}
          {active.length > 0 && (
            <span className="rounded-full bg-primary/20 px-1.5 text-[10px] font-bold text-primary">{active.length} live</span>
          )}
        </button>
      ) : (
        // Same hover tooltip with live counts as the tickets icon beside it.
        <div
          className="relative shrink-0"
          onMouseEnter={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            const vw = window.innerWidth;
            // Near the right edge, right-align the panel so it never overflows the screen.
            if (vw - r.left < 170) setHoverAnchor({ bottom: r.bottom, right: vw - r.right });
            else setHoverAnchor({ bottom: r.bottom, left: r.left + r.width / 2 });
          }}
          onMouseLeave={() => setHoverAnchor(null)}
        >
          <button
            type="button"
            onClick={() => { setHoverAnchor(null); setOpen(true); }}
            aria-label="Screen share requests"
            title={
              waiting.length > 0
                ? `${waiting.length} customer${waiting.length === 1 ? "" : "s"} waiting for screen share help – click to answer`
                : active.length > 0
                  ? `${active.length} screen share${active.length === 1 ? "" : "s"} in progress`
                  : "Screen share requests"
            }
            className={`relative grid size-8 shrink-0 place-items-center rounded-full transition-colors ${
              waiting.length > 0
                ? "bg-destructive/15 text-destructive hover:bg-destructive/25"
                : "text-muted-foreground hover:bg-surface-2 hover:text-foreground"
            }`}
          >
            <MonitorUp className="size-3.5" />
            {waiting.length > 0 && (
              <span className="absolute -right-1.5 -top-1.5 grid min-w-4 place-items-center rounded-full bg-background px-1 text-[9px] font-bold leading-4 text-destructive ring-1 ring-destructive">
                {waiting.length > 99 ? "99+" : waiting.length}
              </span>
            )}
          </button>
          {hoverAnchor !== null && createPortal(
            <div
              className={cn(
                "pointer-events-none fixed z-[80] w-max rounded-md border border-border bg-background px-2.5 py-1.5 text-left shadow-xl",
                hoverAnchor.left !== undefined && "-translate-x-1/2",
              )}
              style={{
                top: hoverAnchor.bottom + 6,
                ...(hoverAnchor.left !== undefined ? { left: hoverAnchor.left } : { right: (hoverAnchor.right ?? 0) + 8 }),
              }}
            >
              <div className="flex items-center justify-between gap-3 whitespace-nowrap text-[11px] font-medium">
                <span className="flex items-center gap-1.5 text-muted-foreground">
                  <span className="size-1.5 rounded-full bg-destructive" />Waiting
                </span>
                <span className="font-bold text-destructive">{waiting.length}</span>
              </div>
              <div className="mt-1 flex items-center justify-between gap-3 whitespace-nowrap text-[11px] font-medium">
                <span className="flex items-center gap-1.5 text-muted-foreground">
                  <span className="size-1.5 rounded-full bg-primary" />In progress
                </span>
                <span className="font-bold text-primary">{active.length}</span>
              </div>
            </div>,
            document.body,
          )}
        </div>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        {/* Full screen like the ticket overview, with its own close button. */}
        <DialogContent className="flex h-[100dvh] w-screen max-w-none flex-col gap-3 overflow-y-auto rounded-none p-4 sm:max-w-none lg:overflow-hidden">
          <DialogHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
            <DialogTitle>Screen share requests</DialogTitle>
            {/* Labeled close, sitting clear of the X in the top-right corner. */}
            <Button variant="outline" size="sm" className="mr-8" onClick={() => setOpen(false)}>
              Close
            </Button>
          </DialogHeader>
          <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 lg:grid-cols-2">
            <section className="flex min-h-0 flex-col rounded-lg border border-border bg-surface-1">
              <header className="flex items-center justify-between border-b border-border px-3 py-2">
                <h3 className="text-sm font-semibold">Waiting</h3>
                <span className="rounded-full bg-destructive/20 px-2 py-0.5 text-xs font-bold text-destructive">{waiting.length}</span>
              </header>
              <div className="min-h-0 flex-1 space-y-2 p-2 lg:overflow-y-auto">
                {waiting.length === 0 && <p className="p-2 text-xs text-muted-foreground">No customers waiting.</p>}
                {waiting.map((r) => (
                  <div key={r.id} className="rounded-md border border-destructive/40 bg-destructive/10 p-2">
                    <p className="truncate text-sm font-medium">{label(r)}</p>
                    <p className="text-[11px] text-muted-foreground">{r.device_name} · Waiting since {ago(r.requested_at ?? "")}</p>
                    <div className="mt-2">
                      <Button size="sm" className="h-8" onClick={() => goTo(r)}>
                        Answer
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
            <section className="flex min-h-0 flex-col rounded-lg border border-border bg-surface-1">
              <header className="flex items-center justify-between border-b border-border px-3 py-2">
                <h3 className="text-sm font-semibold">In progress</h3>
                <span className="rounded-full bg-primary/20 px-2 py-0.5 text-xs font-bold text-primary">{active.length}</span>
              </header>
              <div className="min-h-0 flex-1 space-y-2 p-2 lg:overflow-y-auto">
                {active.length === 0 && <p className="p-2 text-xs text-muted-foreground">No shares in progress.</p>}
                {active.map((r) => (
                  <div key={r.id} className="rounded-md border border-border bg-background/60 p-2">
                    <p className="truncate text-sm font-medium">{label(r)}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {r.device_name} · {r.staff_id === user.id ? "Dealt with by you" : "Someone is dealing with it"}{r.requested_at ? ` · ${ago(r.requested_at)}` : ""}
                    </p>
                    <div className="mt-2">
                      <Button size="sm" variant="outline" className="h-8" onClick={() => goTo(r)}>
                        Open
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
