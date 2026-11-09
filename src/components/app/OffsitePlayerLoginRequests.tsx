import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

type Req = { id: string; platform: string | null; device_name: string | null; customer_name: string; account_number: number; has_email: boolean; created_at: string };

/** Admin/management: approve BM Player logins for customers without a website account. */
export function OffsitePlayerLoginRequests() {
  const [rows, setRows] = useState<Req[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const load = () => void (supabase.rpc as any)("staff_player_login_requests").then(({ data }: any) => setRows((data ?? []) as Req[]));
  useEffect(() => { load(); const t = setInterval(load, 5000); return () => clearInterval(t); }, []);
  const decide = async (id: string, approve: boolean) => {
    setBusy(id);
    const { error } = await (supabase.rpc as any)("staff_decide_player_login", { p_id: id, p_approve: approve });
    setBusy(null);
    if (error) toast.error(error.message); else toast.success(approve ? "Approved — the app opens in a few seconds." : "Denied.");
    load();
  };
  return (
    <section className="space-y-3 rounded-xl border border-border bg-surface p-5">
      <div>
        <h2 className="font-display font-semibold">BM Player login requests</h2>
        <p className="text-sm text-muted-foreground">Customers without a website account. Check it's really them (phone or ticket) before approving.</p>
      </div>
      {rows.length === 0 ? <p className="text-sm text-muted-foreground">No requests waiting.</p> : (
        <ul className="space-y-2">
          {rows.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center gap-3 rounded-lg border border-border p-3">
              <div className="min-w-0 flex-1">
                <p className="font-medium">{r.customer_name} <span className="text-xs text-muted-foreground">#{r.account_number}</span></p>
                <p className="text-xs text-muted-foreground">{r.device_name || r.platform || "BM Player"} · {new Date(r.created_at).toLocaleTimeString("en-GB", { timeZone: "Europe/London", hour: "2-digit", minute: "2-digit" })} · {r.has_email ? "approval email sent" : "no email on file"}</p>
              </div>
              <Button size="sm" variant="outline" disabled={busy === r.id} onClick={() => decide(r.id, false)}>Deny</Button>
              <Button size="sm" disabled={busy === r.id} onClick={() => decide(r.id, true)}>Approve</Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
