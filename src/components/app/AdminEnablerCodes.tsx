import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Copy, KeyRound, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { issueAdminEnablerCode, listAdminEnablerIssues, type AdminEnablerIssueRow } from "@/lib/admin-enabler-issue.functions";

const DEVICE_LABEL = { amazon: "Amazon Fire TV", android: "Android / Google TV" } as const;
const PURPOSE_LABEL = { install: "Install apps", support: "Screen sharing" } as const;
const fmt = (iso: string) => new Date(iso).toLocaleString("en-GB", { timeZone: "Europe/London", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

function Choice<T extends string>({ value, options, onChange }: { value: T; options: Record<T, string>; onChange: (v: T) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {(Object.keys(options) as T[]).map((k) => (
        <Button key={k} type="button" size="sm" variant={value === k ? "default" : "outline"} onClick={() => onChange(k)}>{options[k]}</Button>
      ))}
    </div>
  );
}

function status(r: AdminEnablerIssueRow) {
  if (r.completedAt) return "Apps installed";
  if (r.usedAt) return "Code used";
  if (Date.parse(r.expiresAt) <= Date.now()) return "Expired";
  return r.pinLoggedIn ? "Signed in, code not used yet" : "Not used yet";
}

/** Admin/management issue a website code + Enabler PIN for someone without a website account, logged separately. */
export function AdminEnablerCodes() {
  const issueFn = useServerFn(issueAdminEnablerCode);
  const listFn = useServerFn(listAdminEnablerIssues);
  const [name, setName] = useState("");
  const [device, setDevice] = useState<"amazon" | "android">("amazon");
  const [purpose, setPurpose] = useState<"install" | "support">("install");
  const [apps, setApps] = useState<{ name: string; path: string }[]>([]);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [issued, setIssued] = useState<{ name: string; code: string; pin: string; expiresAt: string } | null>(null);
  const [log, setLog] = useState<AdminEnablerIssueRow[] | null>(null);

  useEffect(() => {
    fetch("/api/public/tv-install-list").then((r) => r.json()).then((d: { apps?: { name: string; path: string }[] }) => {
      const list = d.apps ?? []; setApps(list); setPicked(new Set(list.map((a) => a.path)));
    }).catch(() => setApps([]));
  }, []);
  const loadLog = useCallback(async () => {
    try { setLog(await listFn()); } catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't load the log."); setLog([]); }
  }, [listFn]);
  useEffect(() => { void loadLog(); }, [loadLog]);

  const issue = async () => {
    if (!name.trim()) return toast.error("Type the person's name.");
    setBusy(true);
    try {
      const r = await issueFn({ data: { name: name.trim(), device, purpose, appPaths: purpose === "install" ? [...picked] : [] } });
      setIssued({ name: name.trim(), ...r }); setName(""); void loadLog();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't issue a code."); }
    finally { setBusy(false); }
  };
  const copy = (v: string) => { void navigator.clipboard.writeText(v); toast.success("Copied"); };

  return (
    <Tabs defaultValue="issue" className="max-w-3xl">
      <TabsList><TabsTrigger value="issue">Issue a code</TabsTrigger><TabsTrigger value="log">Log</TabsTrigger></TabsList>
      <TabsContent value="issue">
        <section className="space-y-5 rounded-xl border bg-card p-5">
          <div>
            <h2 className="text-lg font-semibold">BM TV Enabler code for a non-website user</h2>
            <p className="text-sm text-muted-foreground">Gives them a PIN to sign in to BM TV Enabler and a website code to type in. Both last 24 hours and only work together.</p>
          </div>
          <label className="block space-y-1.5"><span className="text-sm font-medium">Name</span>
            <Input value={name} maxLength={120} onChange={(e) => setName(e.target.value)} placeholder="Who is this for?" /></label>
          <div className="space-y-1.5"><span className="text-sm font-medium">Device</span><Choice value={device} options={DEVICE_LABEL} onChange={setDevice} /></div>
          <div className="space-y-1.5"><span className="text-sm font-medium">What is it for?</span><Choice value={purpose} options={PURPOSE_LABEL} onChange={setPurpose} /></div>
          {purpose === "install" && (
            <div className="space-y-1.5"><span className="text-sm font-medium">Apps to install</span>
              <div className="grid gap-2 sm:grid-cols-2">
                {apps.map((a) => (
                  <label key={a.path} className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
                    <input type="checkbox" checked={picked.has(a.path)} onChange={(e) => setPicked((s) => { const n = new Set(s); if (e.target.checked) n.add(a.path); else n.delete(a.path); return n; })} />
                    {a.name}
                  </label>
                ))}
              </div>
            </div>
          )}
          {purpose === "support" && <p className="text-sm text-muted-foreground">BM TV Enabler puts BM Remote Helper on the TV and shows a TV code. Use that code in TV Remote to connect.</p>}
          <Button onClick={() => void issue()} disabled={busy}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />} Issue PIN and code</Button>
          {issued && (
            <div className="space-y-3 rounded-lg border border-primary/40 bg-primary/5 p-4">
              <p className="text-sm">For <b>{issued.name}</b> — valid until {fmt(issued.expiresAt)}. Shown once only, so pass these on now.</p>
              {([["App PIN", issued.pin], ["Website code", issued.code]] as const).map(([label, v]) => (
                <div key={label} className="flex items-center justify-between gap-3">
                  <span className="text-sm text-muted-foreground">{label}</span>
                  <span className="flex items-center gap-2 font-mono text-2xl font-bold tracking-widest">{v.slice(0, 3)} {v.slice(3)}
                    <Button size="icon" variant="ghost" onClick={() => copy(v)} aria-label={`Copy ${label}`}><Copy className="h-4 w-4" /></Button></span>
                </div>
              ))}
            </div>
          )}
        </section>
      </TabsContent>
      <TabsContent value="log">
        <section className="rounded-xl border bg-card p-2">
          {log === null ? <Loader2 className="m-4 h-5 w-5 animate-spin" /> : log.length === 0 ? <p className="p-4 text-sm text-muted-foreground">No codes issued yet.</p> : (
            <div className="overflow-x-auto"><table className="w-full text-sm">
              <thead className="text-left text-muted-foreground"><tr><th className="p-2">Name</th><th className="p-2">Device</th><th className="p-2">For</th><th className="p-2">Issued</th><th className="p-2">By</th><th className="p-2">Status</th></tr></thead>
              <tbody>{log.map((r) => (
                <tr key={r.id} className="border-t align-top">
                  <td className="p-2 font-medium">{r.name}</td><td className="p-2">{DEVICE_LABEL[r.device]}</td><td className="p-2">{PURPOSE_LABEL[r.purpose]}</td>
                  <td className="p-2 whitespace-nowrap">{fmt(r.createdAt)}</td><td className="p-2">{r.issuedBy ?? "—"}</td>
                  <td className="p-2">{status(r)}{r.completedApps.length > 0 && <div className="text-xs text-muted-foreground">{r.completedApps.join(", ")}</div>}</td>
                </tr>
              ))}</tbody>
            </table></div>
          )}
        </section>
      </TabsContent>
    </Tabs>
  );
}
