import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { approvePlayerHomeMove, clearPlayerLoginStrikes, closePlayerSecurityEvent, decidePlayerBoxLimit, setPlayerLoginHome } from "@/lib/player.functions";

type Ev = { id: string; kind: string; login: string | null; detail: Record<string, unknown>; status: string; created_at: string };

const TITLE: Record<string, string> = {
  box_limit: "Extra box waiting for approval",
  unusual_place: "Possible login sharing",
  lockout: "Box locked for 24 hours (wrong account numbers)",
  removed_not_me: "Customer removed a box: Not me",
  household_away: "Strike: Multi Room login watched in two places",
  household_mobile: "Second phone refused (one mobile per account)",
  household_vpn: "Multi Room box on a VPN (old report)",
  household_blocked: "Multi Room login blocked to home only (3 strikes in 7 days)",
  household_move: "Customer says they've moved / new broadband",
};

function detailText(e: Ev) {
  if (e.kind === "box_limit") return `Login ${e.login ?? "?"} is already on ${String(e.detail.boxes ?? 3)} boxes.`;
  if (e.kind === "unusual_place") return `Login ${e.login ?? "?"} used in ${(e.detail.countries as string[] | undefined)?.join(" and ") ?? "two countries"} at the same time.`;
  if (e.kind === "lockout") return `Login ${e.login ?? "not set"}.`;
  if (e.kind === "removed_not_me") return `${String(e.detail.platform ?? "Box")}${e.login ? ` on login ${e.login}` : ""}${e.detail.country ? `, last seen in ${String(e.detail.city ?? "")} ${String(e.detail.country)}` : ""}.`;
  if (e.kind.startsWith("household_")) {
    const d = e.detail as Record<string, string | number | null>;
    const where = d.country ? ` Seen around ${d.city ? d.city + ", " : ""}${d.country}.` : "";
    if (e.kind === "household_move") return `Login ${e.login ?? "?"} asked to move home. Approving lets the next box that plays set the new home.`;
    if (e.kind === "household_blocked") return `Login ${e.login ?? "?"} can now only play at home until you clear its strikes.`;
    if (e.kind === "household_vpn") return `${d.device ?? "Box"} on login ${e.login ?? "?"} is using a VPN${d.vpn_provider ? ` (${d.vpn_provider})` : ""}. Its real location can't be seen.`;
    return `${d.device ?? "Box"} on login ${e.login ?? "?"} is on internet ${d.ip ?? "?"}, home is ${d.home_ip ?? "not set"}.${where}`;
  }
  return "";
}

/** Admin/management: box-limit approvals and security warnings for BM Player. */
export function PlayerSecuritySection() {
  const decide = useServerFn(decidePlayerBoxLimit);
  const close = useServerFn(closePlayerSecurityEvent);
  const setHome = useServerFn(setPlayerLoginHome);
  const clearStrikes = useServerFn(clearPlayerLoginStrikes);
  const approveMove = useServerFn(approvePlayerHomeMove);
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
      <p className="text-sm text-muted-foreground">Each customer app login can run on 3 boxes. A 4th waits here for approval. Staff accounts have no box limit. Sharing and lockout warnings also show here. Multi Room and Triple Room logins stay in one home (the first box linked sets it) plus one phone. Only one device can watch away from home at a time, and nothing at home plays while a holiday box watches. 3 strikes in 7 days blocks a login to home only. VPNs are allowed while watching.</p>
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
              </> : e.kind === "household_away" ? <>
                <Button size="sm" onClick={() => act(() => setHome({ data: { eventId: e.id } }), "Saved as the new home connection.")}>Make this home</Button>
                <Button size="sm" variant="outline" onClick={() => act(() => clearStrikes({ data: { eventId: e.id } }), "Strikes cleared.")}>Clear strikes</Button>
                <Button size="sm" variant="outline" onClick={() => act(() => close({ data: { eventId: e.id } }), "Marked as checked.")}>Checked</Button>
              </> : e.kind === "household_blocked" ? <>
                <Button size="sm" onClick={() => act(() => clearStrikes({ data: { eventId: e.id } }), "Unblocked and strikes cleared.")}>Unblock</Button>
              </> : e.kind === "household_move" ? <>
                <Button size="sm" onClick={() => act(() => approveMove({ data: { eventId: e.id } }), "Approved. The next box that plays sets the new home.")}>Approve move</Button>
                <Button size="sm" variant="outline" onClick={() => act(() => close({ data: { eventId: e.id } }), "Refused.")}>Refuse</Button>
              </> : <Button size="sm" variant="outline" onClick={() => act(() => close({ data: { eventId: e.id } }), "Marked as checked.")}>Checked</Button>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
