import { PlayerAdminGate } from "@/components/app/PlayerAdminGate";
import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Activity, ArrowLeft, ShieldAlert, CheckCircle2, Globe, KeyRound, Link2, Loader2, Megaphone, MonitorPlay, Save, Smartphone, Wifi, Wrench, XCircle } from "lucide-react";
import { ConnectionLimitSection } from "@/components/app/PlayerConnectionLimitSection";
import { BufferingSection } from "@/components/app/PlayerBufferingSection";
import { PlayerAnnouncementsCard } from "@/components/app/PlayerAnnouncementsCard";
import { PlayerMajorAnnouncementsCard } from "@/components/app/PlayerMajorAnnouncementsCard";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { revealPlayerDnsWithPassword } from "@/lib/staff-pin.functions";
import { OffsitePlayerLogins } from "@/components/app/OffsitePlayerLogins";
import { savePlayerChannelAliases, savePlayerDns, savePlayerMaintenance, testPlayerDns } from "@/lib/player.functions";

export const Route = createFileRoute("/_authenticated/_approved/admin-player")({
  component: AdminPlayerPage,
  validateSearch: (s: Record<string, unknown>): { section?: Section } =>
    SECTIONS.some((x) => x.key === s.section) ? { section: s.section as Section } : {},
  head: () => ({ meta: [
    { title: "BM Player Admin Dashboard | BM Support" },
    { name: "description", content: "Every BM Player admin section: DNS, maintenance, announcements, logins, devices and live connections." },
    { property: "og:title", content: "BM Player Admin Dashboard | BM Support" },
    { property: "og:description", content: "Every BM Player admin section in one dashboard." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }, { name: "robots", content: "noindex, nofollow" },
  ] }),
});

type Section = "dns" | "maintenance" | "channels" | "logins" | "devices" | "buffering" | "connection-limits" | "announcements" | "major-announcements";
const SECTIONS: { key: Section; label: string; desc: string; icon: typeof Globe; managementToo?: boolean }[] = [
  { key: "dns", label: "DNS", desc: "Set the one DNS address every BM Player app uses.", icon: Globe },
  { key: "maintenance", label: "Maintenance", desc: "Take every BM Player app offline with a message.", icon: Wrench },
  { key: "channels", label: "Sports guide channel matching", desc: "Link guide channel names to playlist names.", icon: Link2 },
  { key: "logins", label: "Off-site app logins", desc: "Issue app logins to people without a site account.", icon: KeyRound },
  { key: "devices", label: "Linked devices", desc: "How many apps are linked on each device type.", icon: Smartphone },
  { key: "connection-limits", label: "Connection limit investigations", desc: "Logins seen over their connection limit.", icon: ShieldAlert },
  { key: "buffering", label: "Buffering", desc: "Channels and titles that stalled or froze most.", icon: Activity },
  { key: "announcements", label: "Announcements", desc: "Short message along the bottom of every BM Player.", icon: Megaphone, managementToo: true },
  { key: "major-announcements", label: "Major announcements", desc: "Longer announcements under the top-right icon.", icon: Megaphone, managementToo: true },
];

function AdminPlayerPageInner() {
  const { hasAny, loading } = useAuth();
  const isAdmin = hasAny(["admin"]);
  const isManagement = hasAny(["management"]);
  const { section } = Route.useSearch();
  const navigate = Route.useNavigate();
  const back = () => void navigate({ search: {} });
  const save = useServerFn(savePlayerDns), test = useServerFn(testPlayerDns);
  const [dns, setDns] = useState(""), [updated, setUpdated] = useState<string | null>(null);
  const [busy, setBusy] = useState<"save" | "test" | null>(null);
  const [result, setResult] = useState<boolean | null>(null);
  const reveal = useServerFn(revealPlayerDnsWithPassword);
  const [dnsShown, setDnsShown] = useState(false), [pw, setPw] = useState(""), [pwBusy, setPwBusy] = useState(false), [pwError, setPwError] = useState("");
  const saveMaint = useServerFn(savePlayerMaintenance);
  const [maintOn, setMaintOn] = useState(false), [maintMsg, setMaintMsg] = useState(""), [maintBusy, setMaintBusy] = useState(false);
  const saveAliases = useServerFn(savePlayerChannelAliases);
  const [aliasText, setAliasText] = useState(""), [aliasBusy, setAliasBusy] = useState(false);
  const [counts, setCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    if (!isAdmin) return;
    void supabase.from("player_settings").select("updated_at, maintenance_enabled, maintenance_message, channel_aliases").eq("id", 1).maybeSingle().then(({ data }) => {
      setMaintOn(!!data?.maintenance_enabled); setMaintMsg(data?.maintenance_message ?? "");
      const al = Array.isArray(data?.channel_aliases) ? data.channel_aliases as { from: string; to: string }[] : [];
      setAliasText(al.map((a) => `${a.from} = ${a.to}`).join("\n"));
      setUpdated(data?.updated_at ?? null);
    });
    void supabase.from("player_devices").select("platform").not("user_id", "is", null).then(({ data }) => {
      const c: Record<string, number> = {};
      for (const r of data ?? []) c[r.platform] = (c[r.platform] ?? 0) + 1;
      setCounts(c);
    });
  }, [isAdmin]);

  if (loading) return null;
  if (!isAdmin && !isManagement) return <Navigate to="/admin" />;
  const visible = SECTIONS.filter((x) => isAdmin || x.managementToo);
  const current = visible.find((x) => x.key === section);

  if (!current) return <main className="min-h-0 flex-1 overflow-y-auto bg-background px-4 py-6 sm:px-8">
    <div className="mx-auto max-w-5xl space-y-5">
      <Link to="/admin" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" /> Admin dashboard</Link>
      <h1 className="font-display text-2xl font-bold">BM Player Admin Dashboard</h1>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {[...visible.map((x) => ({ key: x.key as string, label: x.label, desc: x.desc, icon: x.icon, live: false })),
          ...(isAdmin ? [{ key: "live", label: "Live connections", desc: "Every BM Player app online now.", icon: MonitorPlay, live: true }] : [])]
          .sort((a, b) => a.label.localeCompare(b.label, "en-GB", { sensitivity: "base" }))
          .map((x) => {
            const cls = "flex aspect-square flex-col items-center justify-center gap-3 rounded-2xl border border-border bg-surface p-4 text-center transition-colors hover:border-primary hover:bg-surface-2";
            const body = <><x.icon className="size-9 text-primary" /><span className="font-display font-semibold">{x.label}</span><span className="text-xs text-muted-foreground">{x.desc}</span></>;
            return x.live
              ? <Link key={x.key} to="/admin-player-live" className={cls}>{body}</Link>
              : <Link key={x.key} to="/admin-player" search={{ section: x.key as Section }} className={cls}>{body}</Link>;
          })}
      </div>
    </div>
  </main>;

  if (section === "announcements") return <main className="min-h-0 flex-1 overflow-y-auto bg-background px-4 py-6 sm:px-8"><PlayerAnnouncementsCard onBack={back} /></main>;
  if (section === "major-announcements") return <main className="min-h-0 flex-1 overflow-y-auto bg-background px-4 py-6 sm:px-8"><PlayerMajorAnnouncementsCard onBack={back} /></main>;

  return <main className="min-h-0 flex-1 overflow-y-auto bg-background px-4 py-6 sm:px-8">
    <div className="mx-auto max-w-3xl space-y-4">
      <Link to="/admin-player" search={{}} className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" /> BM Player Admin Dashboard</Link>
      <h1 className="font-display text-2xl font-bold">BM Player – {current.label}</h1>
      {section === "dns" && !dnsShown && <form className="space-y-3 rounded-xl border border-border bg-surface p-5" onSubmit={async (e) => {
        e.preventDefault(); setPwBusy(true); setPwError("");
        try { const r = await reveal({ data: { password: pw } }); if (r.ok) { setDns(r.dns); setDnsShown(true); setPw(""); } else setPwError(r.error); }
        catch { setPwError("Couldn't check your password. Try again."); } finally { setPwBusy(false); }
      }}>
        <p className="text-sm text-muted-foreground">The DNS address is hidden. Enter your account password to show it.</p>
        <Label htmlFor="dns-pw">Account password</Label>
        <Input id="dns-pw" type="password" autoComplete="current-password" value={pw} onChange={(e) => setPw(e.target.value)} aria-invalid={!!pwError} />
        {pwError && <p className="text-sm text-destructive">{pwError}</p>}
        <Button type="submit" disabled={pwBusy || !pw}>{pwBusy ? <Loader2 className="animate-spin" /> : null}Show DNS</Button>
      </form>}
      {section === "dns" && dnsShown && <section className="space-y-3 rounded-xl border border-border bg-surface p-5">
        <Label htmlFor="dns">DNS address</Label>
        <Input id="dns" placeholder="http://example.com:8080" value={dns} onChange={(e) => { setDns(e.target.value); setResult(null); }} />
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" disabled={!!busy} onClick={async () => {
            setBusy("test");
            try { const r = await test({ data: { dns } }); setResult(r.reachable); } catch (e) { toast.error(e instanceof Error ? e.message : "Test failed"); }
            finally { setBusy(null); }
          }}>{busy === "test" ? <Loader2 className="animate-spin" /> : <Wifi />}Test connection</Button>
          <Button disabled={!!busy} onClick={async () => {
            setBusy("save");
            try { const r = await save({ data: { dns } }); setDns(r.dns); setUpdated(new Date().toISOString()); toast.success("DNS saved"); }
            catch (e) { toast.error(e instanceof Error ? e.message : "Save failed"); }
            finally { setBusy(null); }
          }}>{busy === "save" ? <Loader2 className="animate-spin" /> : <Save />}Save</Button>
        </div>
        {result !== null && <p className={result ? "flex items-center gap-1.5 text-sm text-primary" : "flex items-center gap-1.5 text-sm text-destructive"}>
          {result ? <CheckCircle2 className="size-4" /> : <XCircle className="size-4" />}{result ? "The DNS answered" : "The DNS didn't answer"}</p>}
        {updated && <p className="text-xs text-muted-foreground">Last changed {new Date(updated).toLocaleString("en-GB")}</p>}
        <p className="text-xs text-muted-foreground">Linked apps pick up a new DNS the next time they open.</p>
      </section>}
      {section === "maintenance" && <section className="space-y-3 rounded-xl border border-border bg-surface p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="font-display font-semibold">Maintenance</h2>
            <p className="text-sm text-muted-foreground">Takes every BM Player app offline and shows your message instead.</p>
          </div>
          <Switch aria-label="Maintenance mode" checked={maintOn} onCheckedChange={setMaintOn} />
        </div>
        <Label htmlFor="maint-msg">Message shown in the app</Label>
        <Textarea id="maint-msg" rows={3} maxLength={500} placeholder="BM Player is down for maintenance. Please try again soon." value={maintMsg} onChange={(e) => setMaintMsg(e.target.value)} />
        <Button disabled={maintBusy} onClick={async () => {
          setMaintBusy(true);
          try { await saveMaint({ data: { enabled: maintOn, message: maintMsg } }); toast.success(maintOn ? "BM Player is now offline for maintenance" : "BM Player is back online"); }
          catch (e) { toast.error(e instanceof Error ? e.message : "Save failed"); }
          finally { setMaintBusy(false); }
        }}>{maintBusy ? <Loader2 className="animate-spin" /> : <Save />}Save maintenance</Button>
        <p className="text-xs text-muted-foreground">Open apps switch within about 15 seconds; others when they next open.</p>
      </section>}
      {section === "channels" && <section className="space-y-3 rounded-xl border border-border bg-surface p-5">
        <h2 className="font-display font-semibold">Sports guide channel matching</h2>
        <p className="text-sm text-muted-foreground">The app's Sports guide links each listed channel to the customer's playlist. If a channel shows "Not in your list", add a line: guide name = playlist name.</p>
        <Textarea aria-label="Channel matching" rows={5} placeholder={"Viaplay Sports 1 = Premier Sports 1\nSky Sports Racing = Sky Racing"} value={aliasText} onChange={(e) => setAliasText(e.target.value)} />
        <Button disabled={aliasBusy} onClick={async () => {
          setAliasBusy(true);
          try {
            const aliases = aliasText.split("\n").map((l) => l.split("=")).filter((p) => p.length === 2 && p[0].trim() && p[1].trim()).map(([f, t]) => ({ from: f.trim(), to: t.trim() }));
            await saveAliases({ data: { aliases } }); toast.success("Channel matching saved");
          } catch (e) { toast.error(e instanceof Error ? e.message : "Save failed"); }
          finally { setAliasBusy(false); }
        }}>{aliasBusy ? <Loader2 className="animate-spin" /> : <Save />}Save channel matching</Button>
      </section>}
      {section === "buffering" && <BufferingSection />}
      {section === "connection-limits" && <ConnectionLimitSection />}
      {section === "logins" && <OffsitePlayerLogins />}
      {section === "devices" && <section className="rounded-xl border border-border bg-surface p-5">
        <h2 className="font-display font-semibold">Linked devices</h2>
        <ul className="mt-2 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
          {[["android", "Android TV"], ["firetv", "Fire TV"], ["phone", "Phone"], ["windows", "Windows"]].map(([k, l]) =>
            <li key={k} className="rounded-md border border-border p-3"><div className="text-muted-foreground">{l}</div><div className="text-lg font-semibold">{counts[k] ?? 0}</div></li>)}
        </ul>
      </section>}
    </div>
  </main>;
}

function AdminPlayerPage() {
  return <PlayerAdminGate><AdminPlayerPageInner /></PlayerAdminGate>;
}
