import { useEffect, useState, type ReactNode } from "react";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, ArrowRight, Check, Link2, Loader2, KeyRound, PartyPopper, RefreshCw, Tv } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { createEnablerHandoff } from "@/lib/enabler-handoff.functions";
import { selfInstallHandoff } from "@/lib/enabler-handoff";
import { createDirectInstallLink, getDirectInstallProgress } from "@/lib/direct-install.functions";

const STEP_TITLES = ["Already installed?", "Secure download link", "Install with Downloader", "Sign in with your PIN", "Allow unknown apps", "Website code & install"];
type Progress = Awaited<ReturnType<typeof getDirectInstallProgress>>;

/** Steps the TV (or our download link) has confirmed. Index matches STEP_TITLES. */
function reported(p: Progress, link: boolean): boolean[] {
  return [false, link || !!p, !!p?.downloaded_at, !!p?.signed_in_at, !!p?.permission_at, !!p?.code_at];
}

/** BM Direct Install tab: a step-by-step wizard. Steps tick automatically as the TV app reports them. */
export function DirectInstallSteps({ pin }: { pin: ReactNode }) {
  const linkFn = useServerFn(createDirectInstallLink);
  const progressFn = useServerFn(getDirectInstallProgress);
  const [link, setLink] = useState<{ url: string; expiresAt: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState(0);
  const [answered, setAnswered] = useState<"yes" | "no" | null>(null);
  const [manual, setManual] = useState<boolean[]>([false, false, false, false, false, false]);
  const [progress, setProgress] = useState<Progress>(null);
  const [tv, setTv] = useState<"amazon" | "android" | null>(null);

  useEffect(() => {
    let live = true;
    const poll = async () => { try { const p = await progressFn(); if (live) setProgress(p); } catch { /* keep last */ } };
    void poll();
    const t = setInterval(poll, 4000);
    return () => { live = false; clearInterval(t); };
  }, [progressFn]);

  const fromTv = reported(progress, !!link);
  const done = fromTv.map((v, i) => v || manual[i]);
  if (answered) done[0] = true;
  const completed = !!progress?.completed_at;

  // Jump forward only when the TV itself reports a step finished — never just because a link exists.
  useEffect(() => {
    const tvOnly = [false, false, ...fromTv.slice(2)];
    const next = tvOnly.lastIndexOf(true) + 1;
    if (next > step && tvOnly.slice(0, next).every(Boolean)) setStep(Math.min(next, 5));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fromTv.join()]);

  const make = async () => {
    setBusy(true);
    try {
      const l = await linkFn();
      setLink(l); setProgress(null); setManual([false, false, false, false, false, false]);
      setStep(2); // show the link on step 3 — that's what goes into Downloader
    } catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't make a download link."); }
    finally { setBusy(false); }
  };

  const finish = (i: number) => { setManual((d) => d.map((v, j) => (j === i ? true : v))); setStep(Math.min(i + 1, 5)); };
  const shown = link?.url.replace(/^https:\/\//, "");
  const Waiting = ({ text }: { text: string }) => <p className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="size-3 animate-spin" />{text}</p>;

  const TvPicker = ({ required }: { required?: boolean }) => <div className="space-y-2">
    {required && <p className="text-xs font-semibold uppercase tracking-wide text-amber-600 dark:text-amber-500">Required — choose your device to continue</p>}
    <div className="inline-flex rounded-md border border-border p-1">
      {(["amazon", "android"] as const).map((d) => <button key={d} type="button" onClick={() => setTv(d)}
        className={`rounded px-3 py-1 text-sm ${tv === d ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}>{d === "amazon" ? "Amazon Fire TV" : "Android / Google TV"}</button>)}
    </div>
  </div>;

  return <div className="space-y-6">
    <p className="text-sm text-muted-foreground">BM Direct Install goes straight onto your Fire TV or Android TV and installs your apps there. You don't need a phone or PC, and you don't need to switch on debugging. It only installs apps. For screen sharing with staff, use BM TV Enabler.</p>

    <ol className="flex flex-wrap items-center gap-x-4 gap-y-2">
      {STEP_TITLES.map((t, i) => {
        if (answered === "yes" && (i === 1 || i === 2)) return null;
        const complete = done[i] || completed;
        const current = !completed && i === step;
        return <li key={t}><button type="button" onClick={() => setStep(i)} className="flex items-center gap-2">
          <span className={`flex size-7 items-center justify-center rounded-full border text-xs font-bold ${complete ? "border-green-600 bg-green-600 text-white" : current ? "border-primary bg-primary text-primary-foreground" : "border-border bg-muted text-muted-foreground"}`}>
            {complete ? <Check className="size-4" /> : i + 1}
          </span>
          <span className={`text-sm ${current ? "font-semibold text-foreground" : complete ? "text-foreground" : "text-muted-foreground"}`}>{t}</span>
        </button></li>;
      })}
    </ol>

    {completed ? <section className="space-y-3 rounded-lg border border-green-600/40 bg-green-600/10 p-5 text-center">
      <PartyPopper className="mx-auto size-10 text-green-600" />
      <h3 className="text-lg font-semibold text-foreground">All done — your apps are installed</h3>
      <p className="text-sm text-muted-foreground">BM Direct Install has finished on your TV. Press Close on the TV screen.</p>
      <Button variant="outline" size="sm" onClick={make} disabled={busy}>Start again</Button>
    </section> : <>

    {step === 0 && <section className="space-y-3">
      <h3 className="text-lg font-semibold text-foreground">Step 1 · Is BM Direct Install already on your TV?</h3>
      <p className="text-sm text-muted-foreground">Tell us where you're starting from and we'll show you only the steps you need.</p>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={() => { setAnswered("no"); setStep(1); }}><ArrowRight className="size-4" />No — help me install it</Button>
        <Button onClick={() => { setAnswered("yes"); setStep(3); }}><Check className="size-4" />Yes — it's already installed</Button>
      </div>
      {answered === "no" && <p className="text-xs text-muted-foreground">You picked "No" — carry on from step 2 to get your download link.</p>}
      {answered === "yes" && <p className="text-xs text-muted-foreground">You picked "Yes" — jump to step 3 to sign in with your PIN.</p>}
    </section>}

    {step === 1 && <section className="space-y-3">
      <h3 className="text-lg font-semibold text-foreground">Step 2 · Get your secure download link</h3>
      {link ? <div className="space-y-2">
        <p className="text-sm text-muted-foreground">Your link is on step 3, ready to type into Downloader.</p>
        <Button variant="outline" size="sm" disabled={busy} onClick={make}><RefreshCw className="size-4" />Get a new link</Button>
        <div className="pt-1"><Button size="sm" onClick={() => setStep(2)}>Go to step 3<ArrowRight className="size-4" /></Button></div>
      </div> : <Button onClick={make} disabled={busy}>{busy ? <Loader2 className="size-4 animate-spin" /> : <Link2 className="size-4" />}Get my secure download link</Button>}
      <Button variant="ghost" size="sm" onClick={() => setStep(0)}><ArrowLeft className="size-4" />Back</Button>
    </section>}

    {step === 2 && <section className="space-y-3">
      <h3 className="text-lg font-semibold text-foreground">Step 3 · Choose your device and install it with Downloader</h3>
      <TvPicker required />
      {tv ? tv === "amazon" ? <ol className="list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
        <li>Install <strong className="text-foreground">Downloader</strong> from the Amazon Appstore (search "Downloader").</li>
        <li>Let Downloader install apps: <strong className="text-foreground">Settings › My Fire TV › Developer options › Install unknown apps</strong>, then switch <strong className="text-foreground">Downloader</strong> to ON. (Older Fire TVs: <strong className="text-foreground">Apps from Unknown Sources</strong> › ON.)</li>
        <li>If you can't see Developer options: <strong className="text-foreground">Settings › My Fire TV › About</strong>, press OK on your device name 7 times, then go back.</li>
        <li>Open Downloader, type your link into the address box and press <strong className="text-foreground">Go</strong>. Then press <strong className="text-foreground">Install</strong> and <strong className="text-foreground">Open</strong>.</li>
      </ol> : <ol className="list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
        <li>Install <strong className="text-foreground">Downloader</strong> from the Google Play Store (search "Downloader by AFTVnews").</li>
        <li>Open Downloader, type your link into the address box and press <strong className="text-foreground">Go</strong>.</li>
        <li>When the TV says it can't install unknown apps, press <strong className="text-foreground">Settings</strong> and switch <strong className="text-foreground">Allow from this source</strong> ON for Downloader, then press Back. (Or: <strong className="text-foreground">Settings › Apps › Security & restrictions › Unknown sources</strong> › Downloader ON.)</li>
        <li>Press <strong className="text-foreground">Install</strong>, then <strong className="text-foreground">Open</strong>.</li>
      </ol> : <p className="text-sm text-muted-foreground">Pick your device above — the steps are different for Amazon Fire TV and Android / Google TV.</p>}
      {link && <div className="space-y-1 rounded-lg border border-primary/40 bg-primary/5 p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Type this into Downloader</p>
        <p className="select-all break-all font-mono text-3xl font-bold text-primary">{shown}</p>
        <p className="text-xs text-muted-foreground">Only works for you, until {new Date(link.expiresAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })} (30 minutes).</p>
      </div>}
      {!done[2] && <Waiting text="Waiting for your TV to download BM Direct Install…" />}
      <WizardNav onBack={() => setStep(1)} onNext={() => finish(2)} nextLabel="Next step" nextDisabled={!tv} />
    </section>}

    {step === 3 && <section className="space-y-3">
      <h3 className="text-lg font-semibold text-foreground">Step 4 · Sign in with your PIN</h3>
      <p className="text-sm text-muted-foreground">Open BM Direct Install on your TV and type this PIN. It's the same PIN as BM TV Enabler.</p>
      {pin}
      {!done[3] && <Waiting text="Waiting for BM Direct Install to sign in…" />}
      <WizardNav onBack={() => setStep(answered === "yes" ? 0 : 2)} onNext={() => finish(3)} nextLabel="Next step" />
    </section>}

    {step === 4 && <section className="space-y-3">
      <h3 className="text-lg font-semibold text-foreground">Step 5 · Allow BM Direct Install to install apps</h3>
      <p className="text-sm text-muted-foreground">Your TV needs your OK once. BM Direct Install shows a <strong className="text-foreground">Take me there</strong> button that takes you straight there.</p>
      <TvPicker />
      {tv === "amazon" ? <div className="space-y-2 text-sm text-muted-foreground">
        <p>On the TV press <strong className="text-foreground">Take me there</strong>, press <strong className="text-foreground">OK</strong> to switch it ON, then press <strong className="text-foreground">Back</strong>. BM Direct Install carries on by itself.</p>
        <details><summary className="cursor-pointer text-foreground">Didn't work?</summary>
        <ol className="mt-1 list-decimal space-y-1 pl-5">
        <li>Press <strong className="text-foreground">Take me there</strong> again — each press tries the next setting.</li>
        <li>Or go to <strong className="text-foreground">Settings › My Fire TV › Developer options › Install unknown apps › BM Direct Install</strong> › ON.</li>
        <li>No Developer options? <strong className="text-foreground">Settings › My Fire TV › About</strong>, press OK on your device name 7 times, then go back.</li>
        </ol></details>
      </div> : <ol className="list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
        <li>Press <strong className="text-foreground">Take me there</strong> in BM Direct Install.</li>
        <li>Switch <strong className="text-foreground">Allow from this source</strong> ON. If it doesn't open: <strong className="text-foreground">Settings › Apps › Security & restrictions › Unknown sources › BM Direct Install</strong> › ON (on some TVs: <strong className="text-foreground">Settings › Device Preferences › Security & restrictions</strong>).</li>
        <li>Press <strong className="text-foreground">Back</strong> to return to BM Direct Install.</li>
      </ol>}
      {!done[4] && <Waiting text="Waiting for your TV to allow BM Direct Install…" />}
      <WizardNav onBack={() => setStep(3)} onNext={() => finish(4)} nextLabel="Next step" />
    </section>}

    {step === 5 && <section className="space-y-3">
      <h3 className="text-lg font-semibold text-foreground">Step 6 · Choose your apps and get your website code</h3>
      <p className="text-sm text-muted-foreground">Tick your apps and get your website code. Type it into BM Direct Install, then press <strong className="text-foreground">Install</strong> for each app. This page shows All done when it's finished.</p>
      <TvPicker required />
      {tv ? <><DirectCodePicker device={tv} />
      <Waiting text={done[5] ? "Code accepted — your TV is installing your apps…" : "Waiting for your website code on the TV…"} /></>
        : <p className="text-sm text-muted-foreground">Pick your device above to load your apps.</p>}
      <WizardNav onBack={() => setStep(4)} onNext={() => setStep(5)} nextLabel="Waiting for TV" />
    </section>}
    </>}
  </div>;
}

/** Tick apps and issue a website code right here — no trip to the phone/Windows setup. */
function DirectCodePicker({ device }: { device: "amazon" | "android" }) {
  const handoffFn = useServerFn(createEnablerHandoff);
  const [apps, setApps] = useState<{ name: string; path: string }[] | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [code, setCode] = useState<{ code: string; expiresAt: string } | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    fetch("/api/public/tv-install-list").then((r) => r.json()).then((d: { apps?: { name: string; path: string }[] }) => {
      const list = d.apps ?? []; setApps(list); setPicked(new Set(list.map((a) => a.path)));
    }).catch(() => setApps([]));
  }, []);
  const make = async () => {
    setBusy(true);
    try { setCode(await handoffFn({ data: selfInstallHandoff(device, [...picked]) })); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't make a code. Try again."); }
    finally { setBusy(false); }
  };
  if (!apps) return <Loader2 aria-label="Loading apps" className="size-6 animate-spin" />;
  return <div className="space-y-3">
    {!code && apps.map((app) => <label key={app.path} className="flex items-center gap-3 rounded-md border border-border bg-surface-2 p-3 text-sm">
      <input type="checkbox" className="size-4 accent-primary" checked={picked.has(app.path)} onChange={(e) => setPicked((prev) => { const n = new Set(prev); if (e.target.checked) n.add(app.path); else n.delete(app.path); return n; })} />
      <span className="text-foreground">{app.name}</span>
    </label>)}
    {code ? <div className="space-y-2">
      <p className="text-sm text-muted-foreground">Type this into BM Direct Install</p>
      <p className="select-all font-mono text-4xl font-bold text-primary">{code.code.slice(0, 3)}-{code.code.slice(3)}</p>
      <Button variant="outline" size="sm" disabled={busy} onClick={make}><RefreshCw className="size-4" />Problem? Get a new code</Button>
    </div> : <Button onClick={make} disabled={busy || picked.size === 0}>{busy ? <Loader2 className="size-4 animate-spin" /> : <KeyRound className="size-4" />}Get my website code</Button>}
  </div>;
}

function WizardNav({ onBack, onNext, nextLabel, nextDisabled }: { onBack: () => void; onNext: () => void; nextLabel: string; nextDisabled?: boolean }) {
  return <div className="flex flex-wrap gap-2 pt-1">
    <Button variant="ghost" size="sm" onClick={onBack}><ArrowLeft className="size-4" />Back</Button>
    <Button size="sm" onClick={onNext} disabled={nextDisabled}>{nextLabel}<ArrowRight className="size-4" /></Button>
  </div>;
}
