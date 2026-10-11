import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { UserPlus } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { decideCoverRequest } from "@/lib/cover-request.functions";

interface Req {
  id: string; user_id: string; reason: string; cover_until: string; status: string;
  created_at: string; decided_at: string | null; decided_by: string | null;
}

const ukTime = (iso: string) =>
  new Date(iso).toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" });

/** Cover sign-in requests (pending + recent log); only admin and management decide. */
export function CoverRequestsPanel() {
  const { hasAny } = useAuth();
  const canDecide = hasAny(["admin", "management"]);
  const decide = useServerFn(decideCoverRequest);
  const [rows, setRows] = useState<Req[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data } = await supabase.from("cover_requests")
      .select("id, user_id, reason, cover_until, status, created_at, decided_at, decided_by")
      .order("created_at", { ascending: false }).limit(30);
    const list = (data ?? []) as Req[];
    setRows(list);
    const ids = [...new Set(list.flatMap((r) => [r.user_id, r.decided_by].filter(Boolean) as string[]))];
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
    const ch = supabase.channel(`cover-req-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "cover_requests" }, () => void load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [canDecide, load]);

  if (!canDecide || rows.length === 0) return null;
  const pending = rows.filter((r) => r.status === "pending");
  const done = rows.filter((r) => r.status !== "pending").slice(0, 10);

  const act = async (id: string, approve: boolean) => {
    setBusy(id);
    try {
      await decide({ data: { id, approve } });
      toast.success(approve ? "Approved — added to the rota and signed in" : "Cover request declined");
      void load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't update the request");
    } finally { setBusy(null); }
  };

  return (
    <div className="rounded-2xl border border-primary/40 bg-primary/10 p-4 space-y-3">
      <h2 className="font-semibold inline-flex items-center gap-2">
        <UserPlus className="size-4 text-primary" /> Cover sign-in requests ({pending.length} waiting)
      </h2>
      {pending.map((r) => (
        <div key={r.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-surface-1 p-3">
          <div className="min-w-0 flex-1">
            <p className="font-medium">{names[r.user_id] ?? "Staff member"} · cover until {r.cover_until.slice(0, 5)} UK</p>
            <p className="text-xs text-muted-foreground">Asked {ukTime(r.created_at)} UK · {r.reason}</p>
          </div>
          <Button size="sm" variant="outline" disabled={busy === r.id} onClick={() => act(r.id, false)}>Decline</Button>
          <Button size="sm" disabled={busy === r.id} onClick={() => act(r.id, true)}>Approve &amp; sign in</Button>
        </div>
      ))}
      {done.length > 0 && (
        <details className="text-sm">
          <summary className="cursor-pointer text-muted-foreground">Cover log ({done.length} recent)</summary>
          <ul className="mt-2 space-y-1">
            {done.map((r) => (
              <li key={r.id} className="text-xs text-muted-foreground">
                <span className="font-medium text-foreground">{names[r.user_id] ?? "Staff member"}</span>{" "}
                {r.status === "approved" ? "approved" : "declined"} by {names[r.decided_by ?? ""] ?? "—"}
                {r.decided_at ? ` at ${ukTime(r.decided_at)}` : ""} · until {r.cover_until.slice(0, 5)} · {r.reason}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
