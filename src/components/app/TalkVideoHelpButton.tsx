import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Video } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { joinLiveHelp, listOpenLiveHelpAll } from "@/lib/live-help.functions";
import { cn } from "@/lib/utils";

type Row = Awaited<ReturnType<typeof listOpenLiveHelpAll>>["sessions"][number];

function ago(iso: string) {
  const m = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  return m < 1 ? "just now" : `${m} min ago`;
}

/** Talk sidebar: staff video-help box listing unclaimed and claimed calls. */
export function TalkVideoHelpButton({ variant = "bar" }: { variant?: "bar" | "icon" }) {
  const { user, hasAny } = useAuth();
  const isStaff = hasAny(["admin", "management", "staff"]);
  const list = useServerFn(listOpenLiveHelpAll);
  const join = useServerFn(joinLiveHelp);
  const navigate = useNavigate();
  const [rows, setRows] = useState<Row[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [hoverAnchor, setHoverAnchor] = useState<{ bottom: number; left?: number; right?: number } | null>(null);

  const load = useCallback(async () => {
    const r = await list().catch(() => null);
    if (r) setRows(r.sessions);
  }, [list]);

  useEffect(() => {
    if (!user || !isStaff) return;
    void load();
    const id = window.setInterval(load, open ? 4000 : 8000);
    return () => window.clearInterval(id);
  }, [user, isStaff, load, open]);

  if (!user || !isStaff) return null;

  const waiting = rows.filter((r) => r.status === "waiting");
  const claimed = rows.filter((r) => r.status === "live");

  const goTo = (r: Row, join = true) => {
    setOpen(false);
    navigate({ to: "/admin-secure-page", search: (join ? { order: r.orderId, call: r.id } : { order: r.orderId }) as never });
  };

  const claim = async (r: Row) => {
    setBusy(r.id);
    try {
      const res = await join({ data: { sessionId: r.id } });
      if (res.session.status !== "live") throw new Error("Couldn't claim the call");
      goTo(r);
    } catch (e) {
      toast.error((e as Error).message || "Someone else claimed this call first");
      void load();
    } finally { setBusy(null); }
  };

  const label = (r: Row) => r.orderRef ?? r.orderId.slice(0, 8);

  return (
    <>
      {variant === "bar" ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex w-full shrink-0 items-center gap-1.5 border-b border-border px-2.5 py-1.5 text-left"
          aria-label="Open video help calls"
        >
          <Video className={`size-3.5 shrink-0 ${waiting.length ? "animate-pulse text-destructive" : "text-primary"}`} />
          <span className={`min-w-0 flex-1 truncate text-[11px] font-semibold ${waiting.length ? "text-destructive" : "text-foreground"}`}>
            Video help
          </span>
          {waiting.length > 0 && (
            <span className="rounded-full bg-destructive px-1.5 text-[10px] font-bold text-destructive-foreground">{waiting.length}</span>
          )}
          {claimed.length > 0 && (
            <span className="rounded-full bg-primary/20 px-1.5 text-[10px] font-bold text-primary">{claimed.length} live</span>
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
            aria-label="Video help calls"
            title={
              waiting.length > 0
                ? `${waiting.length} customer${waiting.length === 1 ? "" : "s"} waiting for video help – click to claim`
                : claimed.length > 0
                  ? `${claimed.length} video call${claimed.length === 1 ? "" : "s"} in progress`
                  : "Video help calls"
            }
            className={`relative grid size-8 shrink-0 place-items-center rounded-full transition-colors ${
              waiting.length > 0
                ? "bg-destructive/15 text-destructive hover:bg-destructive/25"
                : "text-muted-foreground hover:bg-surface-2 hover:text-foreground"
            }`}
          >
            <Video className="size-3.5" />
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
                <span className="font-bold text-primary">{claimed.length}</span>
              </div>
            </div>,
            document.body,
          )}
        </div>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        {/* Full screen like the ticket overview, with its own close button. */}
        <DialogContent className="flex h-[100dvh] w-screen max-w-none flex-col gap-3 overflow-y-auto rounded-none p-4 sm:max-w-none lg:overflow-hidden">
          <DialogHeader>
            <DialogTitle>Video help calls</DialogTitle>
            <Button variant="outline" className="absolute right-4 top-4" onClick={() => setOpen(false)}>
              Close
            </Button>
          </DialogHeader>
          <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 lg:grid-cols-2">
            <section className="flex min-h-0 flex-col rounded-lg border border-border bg-surface-1">
              <header className="flex items-center justify-between border-b border-border px-3 py-2">
                <h3 className="text-sm font-semibold">Unclaimed</h3>
                <span className="rounded-full bg-destructive/20 px-2 py-0.5 text-xs font-bold text-destructive">{waiting.length}</span>
              </header>
              <div className="min-h-0 flex-1 space-y-2 p-2 lg:overflow-y-auto">
                {waiting.length === 0 && <p className="p-2 text-xs text-muted-foreground">No customers waiting.</p>}
                {waiting.map((r) => (
                  <div key={r.id} className="rounded-md border border-destructive/40 bg-destructive/10 p-2">
                    <p className="truncate text-sm font-medium">{label(r)}{r.customerName ? ` · ${r.customerName}` : ""}</p>
                    <p className="text-[11px] text-muted-foreground">Waiting since {ago(r.requestedAt)}</p>
                    <div className="mt-2">
                      <Button size="sm" className="h-8" disabled={busy === r.id} onClick={() => claim(r)}>
                        {busy === r.id ? "Claiming…" : "Claim call"}
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
            <section className="flex min-h-0 flex-col rounded-lg border border-border bg-surface-1">
              <header className="flex items-center justify-between border-b border-border px-3 py-2">
                <h3 className="text-sm font-semibold">Claimed</h3>
                <span className="rounded-full bg-primary/20 px-2 py-0.5 text-xs font-bold text-primary">{claimed.length}</span>
              </header>
              <div className="min-h-0 flex-1 space-y-2 p-2 lg:overflow-y-auto">
                {claimed.length === 0 && <p className="p-2 text-xs text-muted-foreground">No calls in progress.</p>}
                {claimed.map((r) => (
                  <div key={r.id} className="rounded-md border border-border bg-background/60 p-2">
                    <p className="truncate text-sm font-medium">{label(r)}{r.customerName ? ` · ${r.customerName}` : ""}</p>
                    <p className="text-[11px] text-muted-foreground">
                      Claimed by {r.mine ? "you" : r.claimedByName ?? "staff"}{r.joinedAt ? ` · ${ago(r.joinedAt)}` : ""}
                    </p>
                    <div className="mt-2">
                      <Button size="sm" variant={r.mine ? "default" : "outline"} className="h-8" onClick={() => goTo(r, r.mine)}>
                        {r.mine ? "Go to call" : "View order"}
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
