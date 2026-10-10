import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Hourglass } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { decideEarlyFinish } from "@/lib/early-finish.functions";

interface Req { id: string; user_id: string; reason: string | null; created_at: string }

/**
 * Site-wide pop-up for admin and management: whenever a staff member asks to
 * finish early (or signs out mid-shift), this dialog appears on every page so
 * it can be approved or declined without visiting the shift pages.
 */
export function EarlyFinishAlert() {
  const { hasAny } = useAuth();
  const canDecide = hasAny(["admin", "management"]);
  const decide = useServerFn(decideEarlyFinish);
  const [rows, setRows] = useState<Req[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [dismissedAt, setDismissedAt] = useState(0);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from("early_finish_requests")
      .select("id, user_id, reason, created_at")
      .eq("status", "pending")
      .order("created_at");
    const list = (data ?? []) as Req[];
    setRows(list);
    const ids = [...new Set(list.map((r) => r.user_id))];
    if (ids.length) {
      const { data: profs } = await supabase.from("profiles").select("id, display_name, username").in("id", ids);
      const map: Record<string, string> = {};
      for (const p of (profs ?? []) as any[]) map[p.id] = p.display_name || p.username || "Staff member";
      setNames(map);
    }
  }, []);

  useEffect(() => {
    if (!canDecide) return;
    void load();
    const ch = supabase
      .channel(`early-finish-alert-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "early_finish_requests" }, () => {
        setDismissedAt(0); // a new or changed request re-opens the pop-up
        void load();
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [canDecide, load]);

  if (!canDecide || rows.length === 0) return null;

  const act = async (id: string, approve: boolean) => {
    setBusy(id);
    try {
      await decide({ data: { id, approve } });
      toast.success(approve ? "Approved — shift ended as an early finish" : "Request declined");
      void load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't update the request");
    } finally {
      setBusy(null);
    }
  };

  return (
    <AlertDialog open onOpenChange={(o) => { if (!o) setDismissedAt(Date.now()); }}>
      <AlertDialogContent className="max-w-md" data-dismissed={dismissedAt || undefined}>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <Hourglass className="size-5 text-warning" /> Early finish request{rows.length > 1 ? "s" : ""}
          </AlertDialogTitle>
          <AlertDialogDescription>
            A staff member has asked to end their shift early. Confirming ends their shift straight away.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="space-y-3">
          {rows.map((r) => (
            <div key={r.id} className="rounded-xl border border-border bg-surface-1 p-3 space-y-2">
              <p className="font-medium">{names[r.user_id] ?? "Staff member"}</p>
              <p className="text-xs text-muted-foreground">
                Asked at {new Date(r.created_at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" })} UK
                {r.reason ? ` · ${r.reason}` : ""}
              </p>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" className="flex-1" disabled={busy === r.id} onClick={() => act(r.id, false)}>
                  Decline
                </Button>
                <Button size="sm" className="flex-1" disabled={busy === r.id} onClick={() => act(r.id, true)}>
                  Confirm early finish
                </Button>
              </div>
            </div>
          ))}
        </div>
      </AlertDialogContent>
    </AlertDialog>
  );
}
