import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Check, Copy, KeyRound, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { issueAdminEnablerCode, listAdminEnablerIssues, type AdminEnablerIssueRow } from "@/lib/admin-enabler-issue.functions";

const DEVICE_LABEL = { amazon: "Amazon Fire TV", android: "Android / Google TV" } as const;
const PURPOSE_LABEL = { install: "Install apps", support: "Screen sharing" } as const;
const INSTALLER_LABEL = { direct: "BM Direct Install · on the TV", enabler: "BM TV Enabler · Phone / Windows" } as const;
const fmt = (iso: string) => new Date(iso).toLocaleString("en-GB", { timeZone: "Europe/London", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

function Choice<T extends string>({ value, options, onChange }: { value: T | null; options: Record<T, string>; onChange: (v: T) => void }) {
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

/** Steps for the status bar, in order, with whether each is done. */
function steps(r: AdminEnablerIssueRow): { label: string; done: boolean }[] {
  const signedIn = !!r.signedInAt || r.pinLoggedIn;
  const codeEntered = !!r.usedAt;
  const done = !!r.completedAt;
  if (r.installer === "direct") {
    return [
      { label: "Signed in", done: signedIn },
      { label: "Unknown apps allowed", done: !!r.permissionAt || codeEntered || done },
      { label: "Code entered", done: codeEntered },
      { label: "Apps installed", done },
    ];
  }
  return [
    { label: "Signed in", done: signedIn },
    { label: "Code entered", done: codeEntered },
    { label: r.purpose === "support" ? "Connected" : "Apps installed", done },
  ];
}

/** Live status bar: ticks off each step as the customer's installer reports it. */
function ProgressBar({ row }: { row: AdminEnablerIssueRow }) {
  const list = steps(row);
  const doneCount = list.filter((s) => s.done).length;
  const pct = Math.round((doneCount / list.length) * 100);
  return (
    <div className="min-w-52 space-y-1.5">
      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} />
      </div>
      <ol className="space-y-0.5">
        {list.map((s) => (
          <li key={s.label} className={`flex items-center gap-1.5 text-xs ${s.done ? "font-medium text-foreground" : "text-muted-foreground"}`}>
            <span className={`flex h-3.5 w-3.5 items-center justify-center rounded-full border ${s.done ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/40"}`}>
              {s.done && <Check className="h-2.5 w-2.5" />}
            </span>
            {s.label}
          </li>
        ))}
      </ol>
    </div>
  );
}

/** Admin/management issue a website code + Enabler PIN for someone without a website account, logged separately. */
export function AdminEnablerCodes() {
  const issueFn = useServerFn(issueAdminEnablerCode);
  const listFn = useServerFn(listAdminEnablerIssues);
  const [name, setName] = useState("");
  const [device, setDevice] = useState<"amazon" | "android" | null>(null);
  const [installer, setInstaller] = useState<"direct" | "enabler">("direct");
  const [purpose, setPurpose] = useState<"install" | "support">("install");
  const [apps, setApps] = useState<{ name: string; path: string }[]>([]);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [issued, setIssued] = useState<{ name: string; code: string; pin: string; expiresAt: string; pinExpiresAt: string; installer: "direct" | "enabler" } | null>(null);
  const [appsLoading, setAppsLoading] = useState(true);
  const [log, setLog] = useState<AdminEnablerIssueRow[] | null>(null);

  useEffect(() => {
    fetch("/api/public/tv-install-list").then((r) => r.json()).then((d: { apps?: { name: string; path: string }[] }) => {
      const list = d.apps ?? []; setApps(list);
    }).catch(() => { setApps([]); toast.error("Couldn't load the apps. Refresh and try again."); }).finally(() => setAppsLoading(false));
  }, []);
  const loadLog = useCallback(async () => {
    try { setLog(await listFn()); } catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't load the log."); setLog([]); }
  }, [listFn]);
  useEffect(() => { void loadLog(); }, [loadLog]);

  const issue = async () => {
    if (!name.trim()) return toast.error("Type the person's name.");
    if (!device) return toast.error("Select the device type.");
    if (purpose === "install" && !picked.size) return toast.error("Tick at least one app to install.");
    setBusy(true);
    try {
      const r = await issueFn({ data: { name: name.trim(), device, installer, purpose, appPaths: purpose === "install" ? [...picked] : [] } });
      setIssued({ name: name.trim(), installer, ...r }); setName(""); void loadLog();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't issue a code."); }
    finally { setBusy(false); }
  };
  const copy = (v: string) => { void navigator.clipboard.writeText(v); toast.success("Copied"); };

  return (
    <Tabs defaultValue="issue" className="max-w-3xl">
      <TabsList><TabsTrigger value="issue">Issue a code</TabsTrigger><TabsTrigger value="log">Log</TabsTrigger></TabsList>
      <TabsContent value="issue">
        <section className="space-y-5 py-5">
          <div>
            <h2 className="text-lg font-semibold">Installer PIN & website code</h2>
          </div>
          <label className="block space-y-1.5"><span className="text-sm font-medium">Reference name (required)</span>
            <Input required value={name} maxLength={120} onChange={(e) => setName(e.target.value)} placeholder="Who is this for?" /></label>
          <div className="space-y-1.5"><span className="text-sm font-medium">Installer app</span><Choice value={installer} options={INSTALLER_LABEL} onChange={(v) => { setInstaller(v); if (v === "direct") setPurpose("install"); }} /></div>
          <div className="space-y-1.5"><span className="text-sm font-medium">Device (required)</span><Choice value={device} options={DEVICE_LABEL} onChange={setDevice} /></div>
          {installer === "enabler" && <div className="space-y-1.5"><span className="text-sm font-medium">What is it for?</span><Choice value={purpose} options={PURPOSE_LABEL} onChange={setPurpose} /></div>}
          {purpose === "install" && (
            <div className="space-y-1.5"><span className="text-sm font-medium">Apps to install (required)</span>
              {appsLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : !apps.length ? <p className="text-sm text-muted-foreground">No apps available.</p> : null}
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
          <Button onClick={() => void issue()} disabled={busy || !name.trim() || !device || (purpose === "install" && (appsLoading || !picked.size))}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />} Generate PIN & website code</Button>
          {issued && (
            <div className="space-y-3 rounded-lg border border-primary/40 bg-primary/5 p-4">
              <p className="text-sm">For <b>{issued.name}</b> · {INSTALLER_LABEL[issued.installer]}</p>
              <p className="text-sm text-muted-foreground">App login PIN expires {fmt(issued.pinExpiresAt)} ({issued.installer === "direct" ? "30 minutes" : "24 hours"}). Website code expires {fmt(issued.expiresAt)}. Shown once only.</p>
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
        <section className="py-2">
          {log === null ? <Loader2 className="m-4 h-5 w-5 animate-spin" /> : log.length === 0 ? <p className="p-4 text-sm text-muted-foreground">No codes issued yet.</p> : (
            <div className="overflow-x-auto"><table className="w-full text-sm">
              <thead className="text-left text-muted-foreground"><tr><th className="p-2">Name</th><th className="p-2">Device</th><th className="p-2">For</th><th className="p-2">Issued</th><th className="p-2">By</th><th className="p-2">Status</th></tr></thead>
              <tbody>{log.map((r) => (
                <tr key={r.id} className="border-t align-top">
                  <td className="p-2 font-medium">{r.name}</td><td className="p-2">{DEVICE_LABEL[r.device]}<div className="text-xs text-muted-foreground">{INSTALLER_LABEL[r.installer]}</div></td><td className="p-2">{PURPOSE_LABEL[r.purpose]}<div className="text-xs text-muted-foreground">{r.apps.map((path) => apps.find((a) => a.path === path)?.name ?? "App no longer listed").join(", ")}</div></td>
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
