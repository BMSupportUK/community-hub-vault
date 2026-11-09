import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

type Req = { id: string; platform: string | null; device_name: string | null; current_login: string | null; created_at: string };
type Prof = { id: string; app_login_name: string | null; account_number: number | null };

/** Website pop-up: a BM Player box asking the signed-in owner to approve its login. */
export function PlayerLoginApproval() {
  const [req, setReq] = useState<Req | null>(null);
  const [profiles, setProfiles] = useState<Prof[]>([]);
  const [pick, setPick] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  useEffect(() => {
    let alive = true;
    const load = async () => {
      if (document.hidden) return;
      const { data } = await (supabase.rpc as any)("my_player_login_requests");
      if (!alive) return;
      const next = ((data ?? []) as Req[]).find((r) => !dismissed.has(r.id)) ?? null;
      setReq((cur) => (cur?.id === next?.id ? cur : next));
    };
    load();
    const t = setInterval(load, 4000);
    return () => { alive = false; clearInterval(t); };
  }, [dismissed]);

  useEffect(() => {
    if (!req) return;
    (supabase.rpc as any)("my_account_profiles").then(({ data }: any) => {
      const list = ((data ?? []) as Prof[]).filter((p) => p.app_login_name);
      setProfiles(list);
      const cur = list.find((p) => p.app_login_name === req.current_login);
      setPick(cur?.id ?? list[0]?.id ?? null);
    });
  }, [req?.id]);

  const decide = async (approve: boolean) => {
    if (!req) return;
    setBusy(true);
    const { error } = await (supabase.rpc as any)("decide_player_login", { p_id: req.id, p_approve: approve, p_credential: approve ? pick : null });
    setBusy(false);
    if (error) toast.error(error.message);
    else toast.success(approve ? "Approved — BM Player will open in a few seconds." : "Login denied.");
    setDismissed((s) => new Set(s).add(req.id));
    setReq(null);
  };

  if (!req) return null;
  const device = req.device_name || req.platform || "BM Player";
  return (
    <Dialog open onOpenChange={(o) => { if (!o) { setDismissed((s) => new Set(s).add(req.id)); setReq(null); } }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Approve BM Player login?</DialogTitle>
          <DialogDescription>
            {device} is asking to open on your account. Only approve if this is your box.
          </DialogDescription>
        </DialogHeader>
        {profiles.length > 1 && (
          <div className="space-y-2">
            <p className="text-sm font-medium">Open on which profile?</p>
            {profiles.map((p) => (
              <label key={p.id} className="flex items-center gap-3 rounded-md border border-border p-3 cursor-pointer has-[:checked]:border-primary">
                <input type="radio" name="bm-profile" checked={pick === p.id} onChange={() => setPick(p.id)} />
                <span className="font-medium">{p.app_login_name}</span>
                {p.account_number ? <span className="ml-auto text-xs text-muted-foreground">Account {p.account_number}</span> : null}
              </label>
            ))}
          </div>
        )}
        <DialogFooter className="gap-2">
          <Button variant="outline" disabled={busy} onClick={() => decide(false)}>Deny</Button>
          <Button disabled={busy || (profiles.length > 1 && !pick)} onClick={() => decide(true)}>Approve</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
