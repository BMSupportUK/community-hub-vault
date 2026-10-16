import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Video } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { joinLiveHelp, listOpenLiveHelpAll } from "@/lib/live-help.functions";

type Row = Awaited<ReturnType<typeof listOpenLiveHelpAll>>["sessions"][number];

function ago(iso: string) {
  const m = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  return m < 1 ? "just now" : `${m} min ago`;
}

/** Talk sidebar: staff video-help box listing unclaimed and claimed calls. */
export function TalkVideoHelpButton() {
  const { user, hasAny } = useAuth();
  const isStaff = hasAny(["admin", "management", "staff"]);
  const list = useServerFn(listOpenLiveHelpAll);
  const join = useServerFn(joinLiveHelp);
  const navigate = useNavigate();
  const [rows, setRows] = useState<Row[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

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

  const goTo = (r: Row) => {
    setOpen(false);
    navigate({ to: "/admin-secure-page", search: { order: r.orderId, call: r.id } as never });
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
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-md">
          <DialogHeader><DialogTitle>Video help calls</DialogTitle></DialogHeader>
          <section className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Unclaimed ({waiting.length})</h3>
            {waiting.length === 0 && <p className="text-sm text-muted-foreground">No customers waiting.</p>}
            {waiting.map((r) => (
              <div key={r.id} className="flex items-center gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{label(r)}{r.customerName ? ` · ${r.customerName}` : ""}</p>
                  <p className="text-xs text-muted-foreground">Waiting since {ago(r.requestedAt)}</p>
                </div>
                <Button size="sm" disabled={busy === r.id} onClick={() => claim(r)}>
                  {busy === r.id ? "Claiming…" : "Claim"}
                </Button>
              </div>
            ))}
          </section>
          <section className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Claimed ({claimed.length})</h3>
            {claimed.length === 0 && <p className="text-sm text-muted-foreground">No calls in progress.</p>}
            {claimed.map((r) => (
              <div key={r.id} className="flex items-center gap-2 rounded-md border border-border bg-surface-2/60 p-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{label(r)}{r.customerName ? ` · ${r.customerName}` : ""}</p>
                  <p className="text-xs text-muted-foreground">
                    Claimed by {r.mine ? "you" : r.claimedByName ?? "staff"}{r.joinedAt ? ` · ${ago(r.joinedAt)}` : ""}
                  </p>
                </div>
                <Button size="sm" variant={r.mine ? "default" : "outline"} onClick={() => goTo(r)}>
                  {r.mine ? "Go to call" : "View order"}
                </Button>
              </div>
            ))}
          </section>
        </DialogContent>
      </Dialog>
    </>
  );
}
