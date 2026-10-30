import { useEffect, useState, type ReactNode } from "react";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, ArrowRight, Check, Link2, Loader2, PartyPopper, RefreshCw, Tv } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { createDirectInstallLink, getDirectInstallProgress } from "@/lib/direct-install.functions";

const STEP_TITLES = ["Secure download link", "Install with Downloader", "Sign in with your PIN", "Allow unknown apps", "Website code & install"];
type Progress = Awaited<ReturnType<typeof getDirectInstallProgress>>;

/** Steps the TV (or our download link) has confirmed. Index matches STEP_TITLES. */
function reported(p: Progress, link: boolean): boolean[] {
  return [link || !!p, !!p?.downloaded_at, !!p?.signed_in_at, !!p?.permission_at, !!p?.code_at];
}

/** BM Direct Install tab: a step-by-step wizard. Steps tick automatically as the TV app reports them. */
export function DirectInstallSteps({ pin, onChooseDevice }: { pin: ReactNode; onChooseDevice: (d: "amazon" | "android") => void }) {
  const linkFn = useServerFn(createDirectInstallLink);
  const progressFn = useServerFn(getDirectInstallProgress);
  const [link, setLink] = useState<{ url: string; expiresAt: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState(0);
  const [manual, setManual] = useState<boolean[]>([false, false, false, false, false]);
  const [progress, setProgress] = useState<Progress>(null);
  const [tv, setTv] = useState<"amazon" | "android">("amazon");

  useEffect(() => {
    let live = true;
    const poll = async () => { try { const p = await progressFn(); if (live) setProgress(p); } catch { /* keep last */ } };
    void poll();
    const t = setInterval(poll, 4000);
    return () => { live = false; clearInterval(t); };
  }, [progressFn]);

  const fromTv = reported(progress, !!link);
  const done = fromTv.map((v, i) => v || manual[i]);
  const completed = !!progress?.completed_at;

  // Jump forward only when the TV itself reports a step finished — never just because a link exists.
  useEffect(() => {
    const tvOnly = [false, ...fromTv.slice(1)];
    const next = tvOnly.lastIndexOf(true) + 1;
    if (next > step && tvOnly.slice(0, next).every(Boolean)) setStep(Math.min(next, 4));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fromTv.join()]);

  const make = async () => {
    setBusy(true);
    try {
      const l = await linkFn();
      setLink(l); setProgress(null); setManual([false, false, false, false, false]);
      // Stay on step 1 so the link is shown there; the customer presses Next when ready.
    } catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't make a download link."); }
    finally { setBusy(false); }
  };

  const finish = (i: number) => { setManual((d) => d.map((v, j) => (j === i ? true : v))); setStep(Math.min(i + 1, 4)); };
  const shown = link?.url.replace(/^https:\/\//, "");
  const Waiting = ({ text }: { text: string }) => <p className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="size-3 animate-spin" />{text}</p>;

  const TvPicker = () => <div className="inline-flex rounded-md border border-border p-1">
    {(["amazon", "android"] as const).map((d) => <button key={d} type="button" onClick={() => setTv(d)}
      className={`rounded px-3 py-1 text-sm ${tv === d ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}>{d === "amazon" ? "Amazon Fire TV" : "Android / Google TV"}</button>)}
  </div>;

  return <div className="space-y-6">
    <p className="text-sm text-muted-foreground">BM Direct Install goes straight onto your Fire TV or Android TV and installs your apps there. You don't need a phone or PC, and you don't need to switch on debugging. It only installs apps. For screen sharing with staff, use BM TV Enabler.</p>

    <ol className="flex flex-wrap items-center gap-x-4 gap-y-2">
      {STEP_TITLES.map((t, i) => {
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
      <h3 className="text-lg font-semibold text-foreground">Step 1 · Get your secure download link</h3>
      {link ? <div className="space-y-2">
        <p className="select-all break-all font-mono text-3xl font-bold text-primary">{shown}</p>
        <p className="text-xs text-muted-foreground">Only works for you, until {new Date(link.expiresAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })} (30 minutes).</p>
        <Button variant="outline" size="sm" disabled={busy} onClick={make}><RefreshCw className="size-4" />Get a new link</Button>
        <div className="pt-1"><Button size="sm" onClick={() => setStep(1)}>Next step<ArrowRight className="size-4" /></Button></div>
      </div> : <Button onClick={make} disabled={busy}>{busy ? <Loader2 className="size-4 animate-spin" /> : <Link2 className="size-4" />}Get my secure download link</Button>}
    </section>}

    {step === 1 && <section className="space-y-3">
      <h3 className="text-lg font-semibold text-foreground">Step 2 · Install it with Downloader</h3>
      <TvPicker />
      {tv === "amazon" ? <ol className="list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
        <li>Install <strong className="text-foreground">Downloader</strong> from the Amazon Appstore (search "Downloader").</li>
        <li>Let Downloader install apps: <strong className="text-foreground">Settings › My Fire TV › Developer options › Install unknown apps</strong>, then switch <strong className="text-foreground">Downloader</strong> to ON. (Older Fire TVs: <strong className="text-foreground">Apps from Unknown Sources</strong> › ON.)</li>
        <li>If you can't see Developer options: <strong className="text-foreground">Settings › My Fire TV › About</strong>, press OK on your device name 7 times, then go back.</li>
        <li>Open Downloader, type your link into the address box and press <strong className="text-foreground">Go</strong>. Then press <strong className="text-foreground">Install</strong> and <strong className="text-foreground">Open</strong>.</li>
      </ol> : <ol className="list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
        <li>Install <strong className="text-foreground">Downloader</strong> from the Google Play Store (search "Downloader by AFTVnews").</li>
        <li>Open Downloader, type your link into the address box and press <strong className="text-foreground">Go</strong>.</li>
        <li>When the TV says it can't install unknown apps, press <strong className="text-foreground">Settings</strong> and switch <strong className="text-foreground">Allow from this source</strong> ON for Downloader, then press Back. (Or: <strong className="text-foreground">Settings › Apps › Security & restrictions › Unknown sources</strong> › Downloader ON.)</li>
        <li>Press <strong className="text-foreground">Install</strong>, then <strong className="text-foreground">Open</strong>.</li>
      </ol>}
      {link && <p className="select-all break-all font-mono text-xl font-bold text-primary">{shown}</p>}
      {!done[1] && <Waiting text="Waiting for your TV to download BM Direct Install…" />}
      <WizardNav onBack={() => setStep(0)} onNext={() => finish(1)} nextLabel="Next step" />
    </section>}

    {step === 2 && <section className="space-y-3">
      <h3 className="text-lg font-semibold text-foreground">Step 3 · Sign in with your PIN</h3>
      <p className="text-sm text-muted-foreground">Open BM Direct Install on your TV and type this PIN. It's the same PIN as BM TV Enabler.</p>
      {pin}
      {!done[2] && <Waiting text="Waiting for BM Direct Install to sign in…" />}
      <WizardNav onBack={() => setStep(1)} onNext={() => finish(2)} nextLabel="Next step" />
    </section>}

    {step === 3 && <section className="space-y-3">
      <h3 className="text-lg font-semibold text-foreground">Step 4 · Allow BM Direct Install to install apps</h3>
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
      {!done[3] && <Waiting text="Waiting for your TV to allow BM Direct Install…" />}
      <WizardNav onBack={() => setStep(2)} onNext={() => finish(3)} nextLabel="Next step" />
    </section>}

    {step === 4 && <section className="space-y-3">
      <h3 className="text-lg font-semibold text-foreground">Step 5 · Choose your apps and get your website code</h3>
      <p className="text-sm text-muted-foreground">Pick your TV, tick your apps and get your website code. Type it into BM Direct Install, then press <strong className="text-foreground">Install</strong> for each app. This page shows All done when it's finished.</p>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={() => onChooseDevice("amazon")}><Tv className="size-4" />Amazon Fire TV</Button>
        <Button variant="outline" onClick={() => onChooseDevice("android")}><Tv className="size-4" />Android / Google TV</Button>
      </div>
      <Waiting text={done[4] ? "Code accepted — your TV is installing your apps…" : "Waiting for your website code on the TV…"} />
      <WizardNav onBack={() => setStep(3)} onNext={() => setStep(4)} nextLabel="Waiting for TV" />
    </section>}
    </>}
  </div>;
}

function WizardNav({ onBack, onNext, nextLabel }: { onBack: () => void; onNext: () => void; nextLabel: string }) {
  return <div className="flex flex-wrap gap-2 pt-1">
    <Button variant="ghost" size="sm" onClick={onBack}><ArrowLeft className="size-4" />Back</Button>
    <Button size="sm" onClick={onNext}>{nextLabel}<ArrowRight className="size-4" /></Button>
  </div>;
}
