import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Shield, Lock, Eye, Globe2, Wifi, Zap, CheckCircle2, ArrowLeft, Loader2, MapPin, Tv, Gauge, Power } from "lucide-react";
import hackerBg from "@/assets/vpn-hacker-bg.jpg";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { vpnShopDevices, vpnShopServers, vpnShopStart } from "@/lib/vpn-shop.functions";

const BENEFITS = [
  { icon: Tv, title: "Built into BM Player", desc: "No extra app to install. Switch it on from the BM Player home screen on your box, phone, PC or Mac." },
  { icon: Gauge, title: "Picks the best server", desc: "BM Player measures every nearby server and connects you to the fastest, least busy one." },
  { icon: Zap, title: "Stop ISP throttling", desc: "Your broadband provider can't see you're streaming, so it can't slow your channels down." },
  { icon: Eye, title: "Stay private", desc: "Your streaming is encrypted end to end — your provider only sees scrambled traffic." },
  { icon: Power, title: "On and off in one press", desc: "It starts off every time. Turn it on when you want it, change server any time." },
  { icon: Wifi, title: "Only BM Player is affected", desc: "Your other apps and devices keep using your normal connection." },
];

const STEPS = [
  "Press Order the VPN below and pick the BM Player device it's for.",
  "Confirm the price — nothing is ordered until you press Yes.",
  "Pay by bank or card. The VPN is ready in BM Player straight away.",
];

function money(p: number) { return `£${(p / 100).toFixed(2)}`; }

function OrderPanel({ onBack }: { onBack: () => void }) {
  const getDevices = useServerFn(vpnShopDevices);
  const start = useServerFn(vpnShopStart);
  const [devices, setDevices] = useState<{ id: string; name: string }[] | null>(null);
  const [pick, setPick] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  useEffect(() => {
    getDevices().then((d) => { setDevices(d); setPick(d[0]?.id ?? ""); }).catch(() => setErr("Couldn't load your devices. Try again shortly."));
  }, [getDevices]);
  const go = async () => {
    setBusy(true); setErr("");
    try {
      const r = await start({ data: { deviceId: pick } });
      if ("error" in r) { setErr(r.error ?? "Couldn't start your VPN order."); setBusy(false); return; }
      window.location.assign(r.path);
    } catch { setErr("Couldn't start your VPN order. Try again shortly."); setBusy(false); }
  };
  return (
    <section className="rounded-2xl border border-border bg-card p-6 lg:p-8 space-y-5">
      <Button type="button" variant="ghost" size="sm" onClick={onBack}><ArrowLeft className="size-4" />Back</Button>
      <div>
        <h2 className="font-display text-2xl font-bold">Order the BM VPN</h2>
        <p className="mt-2 text-sm text-muted-foreground">£2 a month, charged by the day up to your TV subscription's end date. It never renews by itself.</p>
      </div>
      {devices === null && !err && <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" />Loading your devices…</div>}
      {devices && devices.length === 0 && (
        <p className="rounded-lg border border-border bg-background p-4 text-sm">You don't have a BM Player device linked yet. Link your box, phone, PC or Mac first from the Link Device page, then come back here.</p>
      )}
      {devices && devices.length > 0 && (
        <div className="space-y-2" role="radiogroup" aria-label="Which device">
          <p className="text-sm font-medium">Which device is the VPN for?</p>
          {devices.map((d) => (
            <button key={d.id} type="button" role="radio" aria-checked={pick === d.id} onClick={() => setPick(d.id)}
              className={`flex w-full items-center gap-3 rounded-xl border p-3 text-left text-sm transition-colors ${pick === d.id ? "border-primary bg-primary/10" : "border-border bg-background hover:border-primary/40"}`}>
              <Tv className="size-4 text-primary-glow" />{d.name}
            </button>
          ))}
        </div>
      )}
      {err && <p className="rounded-lg border border-destructive/50 bg-background p-3 text-sm text-destructive">{err}</p>}
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button type="button" variant="outline" onClick={onBack}><ArrowLeft className="size-4" />No thanks, go back</Button>
        <Button type="button" disabled={!pick || busy} onClick={go}>{busy ? <Loader2 className="size-4 animate-spin" /> : <Shield className="size-4" />}See my price</Button>
      </div>
    </section>
  );
}

function ServersTab() {
  const load = useServerFn(vpnShopServers);
  const [list, setList] = useState<{ id: number; name: string; country: string; city: string }[] | null>(null);
  const [err, setErr] = useState(false);
  useEffect(() => { load().then(setList).catch(() => setErr(true)); }, [load]);
  const groups = useMemo(() => {
    const names = typeof Intl !== "undefined" && "DisplayNames" in Intl ? new Intl.DisplayNames(["en-GB"], { type: "region" }) : null;
    const m = new Map<string, { label: string; servers: typeof list & object }>();
    for (const s of list ?? []) {
      const g = m.get(s.country) ?? { label: names?.of(s.country) ?? s.country, servers: [] };
      g.servers.push(s); m.set(s.country, g);
    }
    return [...m.entries()].sort((a, b) => (a[0] === "GB" ? -1 : b[0] === "GB" ? 1 : a[1].label.localeCompare(b[1].label)));
  }, [list]);
  if (err) return <p className="rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground">Couldn't load the server list right now. Try again shortly.</p>;
  if (!list) return <div className="flex items-center gap-2 rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" />Loading server locations…</div>;
  return (
    <section className="rounded-2xl border border-border bg-card p-6 lg:p-8">
      <h2 className="font-display text-2xl font-bold flex items-center gap-2"><Globe2 className="size-5 text-primary-glow" />Server locations</h2>
      <p className="mt-2 text-sm text-muted-foreground">{list.length} servers in {groups.length} countries. BM Player picks the best one for you, or choose your own in the app.</p>
      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {groups.map(([code, g]) => (
          <div key={code} className="rounded-xl border border-border bg-background p-4">
            <h3 className="font-semibold flex items-center justify-between">{g.label}<span className="text-xs text-muted-foreground">{g.servers.length}</span></h3>
            <ul className="mt-2 space-y-1">
              {g.servers.map((s) => (
                <li key={s.id} className="flex items-center gap-2 text-xs text-muted-foreground"><MapPin className="size-3 text-primary-glow shrink-0" />{s.name}{s.city && !s.name.includes(s.city) ? ` · ${s.city}` : ""}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}

export function VpnGuideView({ standalone = false }: { standalone?: boolean }) {
  const [ordering, setOrdering] = useState(false);
  const [tab, setTab] = useState("about");
  const outerClass = standalone
    ? "flex-1 flex min-w-0 bg-cover bg-center bg-no-repeat bg-fixed relative"
    : "relative flex min-w-0 rounded-2xl overflow-visible md:h-full md:min-h-0 md:flex-1 md:overflow-hidden bg-cover bg-center";
  return (
    <div className={outerClass} style={{ backgroundImage: `url(${hackerBg})` }}>
      <div className="absolute inset-0 bg-background/70 backdrop-blur-sm pointer-events-none" aria-hidden />
      <main className="relative flex-1 overflow-visible md:overflow-y-auto md:scrollbar-hide">
        <div className="max-w-5xl mx-auto px-4 lg:px-8 py-8 space-y-8">
          {ordering ? <OrderPanel onBack={() => setOrdering(false)} /> : (
            <>
              <header className="relative overflow-hidden rounded-3xl border border-border bg-gradient-to-br from-primary/20 via-surface-2 to-background p-8 lg:p-12">
                <div className="absolute -top-16 -right-16 size-72 rounded-full bg-primary/20 blur-3xl pointer-events-none" />
                <div className="relative">
                  <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/15 text-primary-glow text-xs font-medium mb-4">
                    <Shield className="size-3.5" /> BM VPN · built into BM Player
                  </div>
                  <h1 className="font-display text-3xl lg:text-5xl font-bold tracking-tight">Private, smooth streaming for £2 a month</h1>
                  <p className="mt-4 text-muted-foreground text-base lg:text-lg max-w-2xl">
                    Our own VPN lives inside BM Player. One press protects your streams, stops your broadband provider slowing them down, and connects you to the best server automatically.
                  </p>
                  <div className="mt-6 flex flex-wrap items-center gap-3">
                    <Button type="button" size="lg" onClick={() => setOrdering(true)}><Shield className="size-4" />Order the VPN</Button>
                    <Button type="button" size="lg" variant="outline" onClick={() => setTab("servers")}><Globe2 className="size-4" />See server locations</Button>
                  </div>
                  <p className="mt-3 text-xs text-muted-foreground">Charged by the day to your TV subscription's end date. No automatic renewal.</p>
                </div>
              </header>

              <Tabs value={tab} onValueChange={setTab}>
                <TabsList>
                  <TabsTrigger value="about">About the VPN</TabsTrigger>
                  <TabsTrigger value="servers">Server locations</TabsTrigger>
                </TabsList>
                <TabsContent value="about" className="mt-6 space-y-8">
                  <section>
                    <h2 className="font-display text-2xl font-bold mb-4">Why customers turn it on</h2>
                    <div className="grid sm:grid-cols-2 gap-4">
                      {BENEFITS.map((b) => (
                        <div key={b.title} className="rounded-2xl border border-border bg-card p-5 hover:border-primary/40 transition-colors">
                          <div className="size-10 rounded-xl bg-primary/15 text-primary-glow grid place-items-center mb-3"><b.icon className="size-5" /></div>
                          <h3 className="font-semibold text-base">{b.title}</h3>
                          <p className="text-sm text-muted-foreground mt-1.5 leading-relaxed">{b.desc}</p>
                        </div>
                      ))}
                    </div>
                  </section>
                  <section className="rounded-2xl border border-border bg-card p-6 lg:p-8">
                    <h2 className="font-display text-2xl font-bold flex items-center gap-2"><Lock className="size-5 text-primary-glow" />How to get it</h2>
                    <ol className="mt-4 space-y-3">
                      {STEPS.map((s, i) => (
                        <li key={s} className="flex items-start gap-3 text-sm"><span className="grid size-6 shrink-0 place-items-center rounded-full bg-primary/15 text-primary-glow text-xs font-bold">{i + 1}</span><span className="text-muted-foreground">{s}</span></li>
                      ))}
                    </ol>
                    <p className="mt-4 flex items-start gap-2 text-xs text-muted-foreground"><CheckCircle2 className="size-4 shrink-0 text-primary-glow" />You can also press Get VPN on the BM Player home screen and scan the code with your phone.</p>
                    <Button type="button" className="mt-5" onClick={() => setOrdering(true)}><Shield className="size-4" />Order the VPN · {money(200)}/month</Button>
                  </section>
                </TabsContent>
                <TabsContent value="servers" className="mt-6"><ServersTab /></TabsContent>
              </Tabs>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
