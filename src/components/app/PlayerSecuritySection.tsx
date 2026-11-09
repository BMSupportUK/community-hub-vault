import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { closePlayerSecurityEvent, decidePlayerBoxLimit } from "@/lib/player.functions";

type Ev = { id: string; kind: string; login: string | null; detail: Record<string, unknown>; status: string; created_at: string };

const TITLE: Record<string, string> = {
  box_limit: "Extra box waiting for approval",
  unusual_place: "Possible login sharing",
  lockout: "Box locked for 24 hours (wrong account numbers)",
  removed_not_me: "Customer removed a box: Not me",
};

function detailText(e: Ev) {
  if (e.kind === "box_limit") return `Login ${e.login ?? "?"} is already on ${String(e.detail.boxes ?? 3)} boxes.`;
  if (e.kind === "unusual_place") return `Login ${e.login ?? "?"} used in ${(e.detail.countries as string[] | undefined)?.join(" and ") ?? "two countries"} at the same time.`;
  if (e.kind === "lockout") return `Login ${e.login ?? "not set"}.`;
  if (e.kind === "removed_not_me") return `${String(e.detail.platform ?? "Box")}${e.login ? ` on login ${e.login}` : ""}${e.detail.country ? `, last seen in ${String(e.detail.city ?? "")} ${String(e.detail.country)}` : ""}.`;
  return "";
}

/** Admin/management: box-limit approvals and security warnings for BM Player. */
export function PlayerSecuritySection() {
  const decide = useServerFn(decidePlayerBoxLimit);
  const close = useServerFn(closePlayerSecurityEvent);
  const { data = [], isPending, refetch } = useQuery({
    queryKey: ["player-security-events"],
    refetchInterval: 10_000,
    queryFn: async () => {
      const { data, error } = await supabase.from("player_security_events")
        .select("id, kind, login, detail, status, created_at").eq("status", "open").neq("kind", "new_box")
        .order("created_at", { ascending: false }).limit(100);
      if (error) throw error;
      return (data ?? []) as Ev[];
    },
  });
  const act = async (fn: () => Promise<unknown>, ok: string) => {
    try { await fn(); toast.success(ok); void refetch(); } catch (e) { toast.error(e instanceof Error ? e.message : "Please try again."); }
  };
  return (
    <section className="space-y-3 rounded-xl border border-border bg-surface p-5">
      <h2 className="font-display text-lg font-semibold">Security</h2>
      <p className="text-sm text-muted-foreground">Each customer app login can run on 3 boxes. A 4th waits here for approval. Staff accounts have no box limit. Sharing and lockout warnings also show here.</p>
      {isPending ? <Loader2 className="size-5 animate-spin text-muted-foreground" /> : !data.length ? <p className="text-sm text-muted-foreground">Nothing needs attention.</p> : (
        <ul className="divide-y divide-border">
          {data.map((e) => (
            <li key={e.id} className="flex flex-wrap items-center gap-3 py-3">
              <div className="min-w-0 flex-1">
                <div className="font-medium">{TITLE[e.kind] ?? e.kind}</div>
                <div className="text-sm text-muted-foreground">{detailText(e)} · {new Date(e.created_at).toLocaleString("en-GB")}</div>
              </div>
              {e.kind === "box_limit" ? <>
                <Button size="sm" onClick={() => act(() => decide({ data: { eventId: e.id, approve: true } }), "Approved. The box gets its login on its next check-in.")}>Approve</Button>
                <Button size="sm" variant="outline" onClick={() => act(() => decide({ data: { eventId: e.id, approve: false } }), "Refused. The login was not sent.")}>Refuse</Button>
              </> : <Button size="sm" variant="outline" onClick={() => act(() => close({ data: { eventId: e.id } }), "Marked as checked.")}>Checked</Button>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
