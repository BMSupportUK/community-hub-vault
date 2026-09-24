import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { KeyRound, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { issueStaffPin, listStaffPinRequests } from "@/lib/staff-pin.functions";

type Data = Awaited<ReturnType<typeof listStaffPinRequests>>;

export function StaffPinAdminCard() {
  const listFn = useServerFn(listStaffPinRequests);
  const issueFn = useServerFn(issueStaffPin);
  const [data, setData] = useState<Data | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [pick, setPick] = useState("");

  const load = useCallback(async () => {
    try { setData(await listFn()); } catch (e: any) { toast.error(e.message ?? "Couldn't load PIN requests"); }
  }, [listFn]);
  useEffect(() => { void load(); }, [load]);

  const issue = async (userId: string, name: string) => {
    if (!confirm(`Issue a new staff PIN to ${name}? Their old PIN stops working immediately.`)) return;
    setBusyId(userId);
    try {
      await issueFn({ data: { userId } });
      toast.success(`New PIN issued — ${name} has been sent a mention.`);
      setPick("");
      await load();
    } catch (e: any) { toast.error(e.message ?? "Couldn't issue PIN"); }
    finally { setBusyId(null); }
  };

  const pending = (data?.requests ?? []).filter((r: any) => r.status === "pending");

  return (
    <section className="rounded-2xl border border-border bg-surface-1 p-5">
      <div className="flex items-center gap-3 mb-4">
        <div className="size-10 rounded-xl bg-gradient-primary grid place-items-center text-primary-foreground"><KeyRound className="size-5" /></div>
        <div className="flex-1">
          <h2 className="font-display font-bold">Staff PINs</h2>
          <p className="text-xs text-muted-foreground">Reset requests from staff, and issue new PINs. Staff are notified by mention and view their PIN on their profile.</p>
        </div>
        <button onClick={load} className="p-2 rounded-lg border border-border hover:bg-surface-2" aria-label="Refresh"><RefreshCw className="size-4" /></button>
      </div>

      {!data ? (
        <div className="py-6 grid place-items-center text-muted-foreground"><Loader2 className="size-5 animate-spin" /></div>
      ) : (
        <>
          <h3 className="text-sm font-semibold mb-2">Pending requests ({pending.length})</h3>
          {pending.length === 0 ? (
            <p className="text-sm text-muted-foreground mb-4">No pending PIN reset requests.</p>
          ) : (
            <ul className="space-y-2 mb-4">
              {pending.map((r: any) => (
                <li key={r.id} className="flex items-center gap-3 rounded-xl border border-border bg-surface-2 px-3 py-2">
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm">{r.name}</div>
                    <div className="text-xs text-muted-foreground truncate">
                      {new Date(r.requested_at).toLocaleString("en-GB")}{r.reason ? ` · ${r.reason}` : ""}
                    </div>
                  </div>
                  <button onClick={() => issue(r.user_id, r.name)} disabled={busyId === r.user_id}
                    className="px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-sm disabled:opacity-60">
                    {busyId === r.user_id ? <Loader2 className="size-4 animate-spin" /> : "Issue new PIN"}
                  </button>
                </li>
              ))}
            </ul>
          )}
          <h3 className="text-sm font-semibold mb-2">Issue to any staff member</h3>
          <div className="flex gap-2">
            <select value={pick} onChange={(e) => setPick(e.target.value)} className="flex-1 px-3 py-2 rounded-lg bg-surface-2 border border-border text-sm">
              <option value="">Choose staff member…</option>
              {data.staff.map((s) => (
                <option key={s.id} value={s.id}>{s.name}{s.pinIssuedAt ? "" : " (no PIN yet)"}</option>
              ))}
            </select>
            <button disabled={!pick || busyId === pick}
              onClick={() => { const s = data.staff.find((x) => x.id === pick); if (s) void issue(s.id, s.name); }}
              className="px-3 py-2 rounded-lg bg-primary text-primary-foreground text-sm disabled:opacity-60">Issue PIN</button>
          </div>
        </>
      )}
    </section>
  );
}
