import { useState, type ReactNode } from "react";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, ArrowRight, Check, Link2, Loader2, PartyPopper, RefreshCw, Tv } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { createDirectInstallLink } from "@/lib/direct-install.functions";

const STEP_TITLES = ["Secure download link", "Install with Downloader", "Sign in with your PIN", "Choose apps & website code"];

/** BM Direct Install tab: a step-by-step wizard. Each completed step gets a tick; only the current step shows. */
export function DirectInstallSteps({ pin, onChooseDevice }: { pin: ReactNode; onChooseDevice: (d: "amazon" | "android") => void }) {
  const linkFn = useServerFn(createDirectInstallLink);
  const [link, setLink] = useState<{ url: string; expiresAt: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState(0); // 0..3 = steps, 4 = all done
  const [done, setDone] = useState<boolean[]>([false, false, false, false]);

  const make = async () => {
    setBusy(true);
    try {
      const l = await linkFn();
      setLink(l);
      finish(0);
    } catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't make a download link."); }
    finally { setBusy(false); }
  };

  const finish = (i: number) => {
    setDone((d) => d.map((v, j) => (j === i ? true : v)));
    setStep(i + 1);
  };

  const shown = link?.url.replace(/^https:\/\//, "");
  const allDone = done.every(Boolean);

  return <div className="space-y-6">
    <p className="text-sm text-muted-foreground">BM Direct Install goes straight onto your Fire TV or Android TV and installs your apps there. You don't need a phone or PC, and you don't need to switch on debugging. It only installs apps. For screen sharing with staff, use BM TV Enabler.</p>

    {/* Step tracker with ticks */}
    <ol className="flex flex-wrap items-center gap-x-4 gap-y-2">
      {STEP_TITLES.map((t, i) => {
        const complete = done[i];
        const current = !allDone && i === step;
        return <li key={t} className="flex items-center gap-2">
          <span className={`flex size-7 items-center justify-center rounded-full border text-xs font-bold ${complete ? "border-green-600 bg-green-600 text-white" : current ? "border-primary bg-primary text-primary-foreground" : "border-border bg-muted text-muted-foreground"}`}>
            {complete ? <Check className="size-4" /> : i + 1}
          </span>
          <span className={`text-sm ${current ? "font-semibold text-foreground" : complete ? "text-foreground" : "text-muted-foreground"}`}>{t}</span>
        </li>;
      })}
    </ol>

    {allDone ? <section className="space-y-3 rounded-lg border border-green-600/40 bg-green-600/10 p-5 text-center">
      <PartyPopper className="mx-auto size-10 text-green-600" />
      <h3 className="text-lg font-semibold text-foreground">All steps done</h3>
      <p className="text-sm text-muted-foreground">BM Direct Install is on your TV and has your website code. When it finishes installing, this page shows All done.</p>
      <Button variant="outline" size="sm" onClick={() => { setDone([false, false, false, false]); setStep(0); }}>Start again</Button>
    </section> : <>

    {step === 0 && <section className="space-y-3">
      <h3 className="text-lg font-semibold text-foreground">Step 1 · Get your secure download link</h3>
      {link ? <div className="space-y-2">
        <p className="select-all break-all font-mono text-3xl font-bold text-primary">{shown}</p>
        <p className="text-xs text-muted-foreground">Only works for you, until {new Date(link.expiresAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })} (30 minutes).</p>
        <Button variant="outline" size="sm" disabled={busy} onClick={make}><RefreshCw className="size-4" />Get a new link</Button>
      </div> : <Button onClick={make} disabled={busy}>{busy ? <Loader2 className="size-4 animate-spin" /> : <Link2 className="size-4" />}Get my secure download link</Button>}
    </section>}

    {step === 1 && <section className="space-y-3">
      <h3 className="text-lg font-semibold text-foreground">Step 2 · Install it with Downloader</h3>
      <ol className="list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
        <li>Open the <strong className="text-foreground">Downloader</strong> app on your TV. You can get it from the app store.</li>
        <li>Type your link into the address box and press <strong className="text-foreground">Go</strong>.</li>
        <li>Press <strong className="text-foreground">Install</strong>, then <strong className="text-foreground">Open</strong>. If asked, allow Downloader to install apps.</li>
      </ol>
      {link && <p className="select-all break-all font-mono text-xl font-bold text-primary">{shown}</p>}
      <WizardNav onBack={() => setStep(0)} onNext={() => finish(1)} nextLabel="Done — next step" />
    </section>}

    {step === 2 && <section className="space-y-3">
      <h3 className="text-lg font-semibold text-foreground">Step 3 · Sign in with your PIN</h3>
      <p className="text-sm text-muted-foreground">Type this PIN into BM Direct Install on your TV. It's the same PIN as BM TV Enabler.</p>
      {pin}
      <WizardNav onBack={() => setStep(1)} onNext={() => finish(2)} nextLabel="Done — next step" />
    </section>}

    {step === 3 && <section className="space-y-3">
      <h3 className="text-lg font-semibold text-foreground">Step 4 · Choose your apps and get your website code</h3>
      <p className="text-sm text-muted-foreground">Pick your TV, tick your apps and get your website code. Type it into BM Direct Install. When asked, allow it to install apps, then press <strong className="text-foreground">Install</strong> for each app. This page shows All done when it's finished.</p>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={() => onChooseDevice("amazon")}><Tv className="size-4" />Amazon Fire TV</Button>
        <Button variant="outline" onClick={() => onChooseDevice("android")}><Tv className="size-4" />Android / Google TV</Button>
      </div>
      <WizardNav onBack={() => setStep(2)} onNext={() => finish(3)} nextLabel="Done — finish" />
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
