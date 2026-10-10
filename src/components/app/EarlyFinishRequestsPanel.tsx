import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Hourglass } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { decideEarlyFinish } from "@/lib/early-finish.functions";

interface Req { id: string; user_id: string; reason: string | null; created_at: string }

/** Pending early-finish requests; only admin and management can approve or decline. */
export function EarlyFinishRequestsPanel() {
  const { hasAny } = useAuth();
  const canDecide = hasAny(["admin", "management"]);
  const decide = useServerFn(decideEarlyFinish);
  const [rows, setRows] = useState<Req[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);

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
      .channel(`early-finish-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "early_finish_requests" }, () => void load())
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
    <div className="rounded-2xl border border-warning/40 bg-warning/10 p-4 space-y-3">
      <h2 className="font-semibold inline-flex items-center gap-2">
        <Hourglass className="size-4 text-warning" /> Early finish requests ({rows.length})
      </h2>
      {rows.map((r) => (
        <div key={r.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-surface-1 p-3">
          <div className="min-w-0 flex-1">
            <p className="font-medium">{names[r.user_id] ?? "Staff member"}</p>
            <p className="text-xs text-muted-foreground">
              Asked at {new Date(r.created_at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" })} UK
              {r.reason ? ` · ${r.reason}` : ""}
            </p>
          </div>
          <Button size="sm" variant="outline" disabled={busy === r.id} onClick={() => act(r.id, false)}>Decline</Button>
          <Button size="sm" disabled={busy === r.id} onClick={() => act(r.id, true)}>Confirm early finish</Button>
        </div>
      ))}
    </div>
  );
}
