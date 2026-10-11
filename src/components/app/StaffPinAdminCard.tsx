import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Copy, Eye, EyeOff, KeyRound, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { issueStaffPin, listStaffPinRequests, revealStaffPinForAdmin } from "@/lib/staff-pin.functions";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import pinIllustration from "@/assets/staff-pin-illustration.jpg";

type Data = Awaited<ReturnType<typeof listStaffPinRequests>>;

export function StaffPinAdminCard() {
  const listFn = useServerFn(listStaffPinRequests);
  const issueFn = useServerFn(issueStaffPin);
  const revealFn = useServerFn(revealStaffPinForAdmin);
  const [data, setData] = useState<Data | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [pick, setPick] = useState("");
  const [tab, setTab] = useState("requests");
  const [revealed, setRevealed] = useState<Record<string, string>>({});
  const [revealingId, setRevealingId] = useState<string | null>(null);

  const copyPin = async (userId: string) => {
    const pin = revealed[userId];
    if (!pin) return;
    try {
      await navigator.clipboard.writeText(pin);
      toast.success("Staff PIN copied");
    } catch {
      toast.error("Couldn't copy PIN — please copy it manually");
    }
  };

  const togglePin = async (userId: string) => {
    if (revealed[userId] !== undefined) {
      setRevealed((current) => {
        const next = { ...current };
        delete next[userId];
        return next;
      });
      return;
    }
    setRevealingId(userId);
    try {
      const result = await revealFn({ data: { userId } });
      if (result.pin) setRevealed((current) => ({ ...current, [userId]: result.pin ?? "" }));
      else toast.error("No PIN has been issued to this staff member");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't reveal PIN");
    } finally { setRevealingId(null); }
  };

  const load = useCallback(async () => {
    setRevealed({});
    try { setData(await listFn()); } catch (e: any) { toast.error(e.message ?? "Couldn't load PIN requests"); }
  }, [listFn]);
  useEffect(() => { void load(); }, [load]);

  const issue = async (userId: string, name: string) => {
    if (!confirm(`Issue a new staff PIN to ${name}? Their old PIN stops working immediately.`)) return;
    setBusyId(userId);
    try {
      await issueFn({ data: { userId } });
      setRevealed({});
      toast.success(`New PIN issued — ${name} has been sent a mention.`);
      setPick("");
      await load();
    } catch (e: any) { toast.error(e.message ?? "Couldn't issue PIN"); }
    finally { setBusyId(null); }
  };

  const pending = (data?.requests ?? []).filter((r: any) => r.status === "pending");

  return (
    <section className="relative overflow-hidden rounded-2xl border border-border p-5">
      <div className="relative flex items-center gap-3 mb-4">
        <div className="size-10 rounded-xl bg-gradient-primary grid place-items-center text-primary-foreground"><KeyRound className="size-5" /></div>
        <div className="flex-1">
          <h2 className="font-display font-bold">Staff PINs</h2>
          <p className="text-xs text-muted-foreground">Reset requests from staff, and issue new PINs. Staff are notified by mention and view their PIN on their profile.</p>
        </div>
         <Button onClick={load} variant="outline" size="icon" aria-label="Refresh" title="Refresh"><RefreshCw className="size-4" /></Button>
      </div>

      {!data ? (
        <div className="relative py-6 grid place-items-center text-muted-foreground"><Loader2 className="size-5 animate-spin" /></div>
      ) : (
        <Tabs className="relative" value={tab} onValueChange={(value) => { setTab(value); setRevealed({}); }}>
          <TabsList className="mb-4">
            <TabsTrigger value="requests">Reset requests</TabsTrigger>
            <TabsTrigger value="all">All staff PINs</TabsTrigger>
          </TabsList>
          <TabsContent value="all" className="space-y-0">
            {data.staff.length === 0 ? <p className="text-sm text-muted-foreground">No staff accounts found.</p> : data.staff.map((staff) => (
              <div key={staff.id} className="flex items-center gap-3 border-b border-border py-3 last:border-0">
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium break-words">{staff.name}</div>
                  <div className="text-xs text-muted-foreground">{staff.pinIssuedAt ? `Issued ${new Date(String(staff.pinIssuedAt)).toLocaleDateString("en-GB")}` : "No PIN issued"}</div>
                </div>
                <span className="w-20 shrink-0 text-center font-mono text-lg" aria-label={revealed[staff.id] ? "Staff PIN revealed" : "Staff PIN hidden"}>{staff.pinIssuedAt ? revealed[staff.id] ?? "••••••" : "—"}</span>
                <Button size="icon" variant="outline" disabled={!staff.pinIssuedAt || revealingId !== null} onClick={() => void togglePin(staff.id)} aria-label={`${revealed[staff.id] ? "Hide" : "Show"} PIN for ${staff.name}`} title={revealed[staff.id] ? "Hide PIN" : "Show PIN"}>
                  {revealingId === staff.id ? <Loader2 className="animate-spin" /> : revealed[staff.id] ? <EyeOff /> : <Eye />}
                </Button>
                <Button size="icon" variant="outline" className="shrink-0" disabled={!revealed[staff.id]} onClick={() => void copyPin(staff.id)} aria-label={`Copy PIN for ${staff.name}`} title={revealed[staff.id] ? "Copy PIN" : "Reveal PIN to copy"}>
                  <Copy className="size-4" />
                </Button>
              </div>
            ))}
          </TabsContent>
          <TabsContent value="requests">
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
          </TabsContent>
        </Tabs>
      )}
    </section>
  );
}
